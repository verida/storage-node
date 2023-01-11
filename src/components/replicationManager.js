import Db from './db.js'
import Utils from './utils.js'
import DbManager from './dbManager.js';
import UserManager from './userManager.js';
import AuthManager from './authManager.js';
import Axios from 'axios'
import EncryptionUtils from '@verida/encryption-utils';

import dotenv from 'dotenv';
dotenv.config();

class ReplicationManager {

    /**
     * Confirm replication is correctly configured for a given DID and application context.
     * 
     * If a storage node is being added or removed to the application context, it must be the
     * last node to have checkReplication called. This ensures the node has a list of all the
     * active databases and can ensure it is replicating correctly to the other nodes.
     * 
     * The client SDK should call checkReplication() when opening a context to ensure the replication is working as expected.
     *
     * This is called very often, so needs to be efficient
     * 
     * @param {*} did 
     * @param {*} contextName 
     * @param {*} databaseName (optional) If not specified, checks all databases
     */
    async checkReplication(did, contextName, databaseName) {
        console.log(`${Utils.serverUri()}: checkReplication(${did}, ${contextName}, ${databaseName})`)
        // Lookup DID document and get list of endpoints for this context
        let didDocument = await AuthManager.getDidDocument(did)
        let didService = didDocument.locateServiceEndpoint(contextName, 'database')

        if (!didService) {
            // Service not found, try to fetch the DID document without caching (as it may have been udpated)
            didDocument = await AuthManager.getDidDocument(did, true)
            didService = didDocument.locateServiceEndpoint(contextName, 'database')
        }

        // create a copy of the endpoints as this is cached and we will modify later
        // ensure it's hostname only
        let endpoints = []
        const serverHostname = (new URL(Utils.serverUri())).hostname
        let endpointIndex = -1
        for (let e in didService.serviceEndpoint) {
            const url = new URL(didService.serviceEndpoint[e])
            endpoints.push(url)
            if (url.hostname == serverHostname) {
                endpointIndex = e
            }
        }

        // Confirm this endpoint is in the list of endpoints
        if (endpointIndex === -1) {
            //console.log(`${Utils.serverUri()}: Error: Server not a valid endpoint for this DID and context:`)
            //console.log(endpoints, endpointIndex)
            throw new Error(`Server not a valid endpoint (${serverHostname}) for this DID and context`)
        }

        // Remove this endpoint from the list of endpoints to check
        endpoints.splice(endpointIndex, 1)

        // Build a list of databases to chck
        const userDatabases = await DbManager.getUserDatabases(did, contextName)

        let databases = {}
        if (databaseName) {
            for (let i in userDatabases) {
                const item = userDatabases[i]
                if (item.databaseName == databaseName) {
                    databases[item.databaseName] = item
                }
            }

            // Only check a single database
            if (!Object.keys(databases).length === 0) {
                return
            }
        } else {
            // Fetch all databases for this context
            for (let i in userDatabases) {
                const item = userDatabases[i]
                databases[item.databaseName] = item
            }

            // Ensure the user database list database is included in the list of databases
            const didContextHash = Utils.generateDidContextHash(did, contextName)
            const didContextDbName = `c${didContextHash}`

            databases[didContextDbName] = {
                did,
                contextName,
                databaseName: didContextDbName,
                databaseHash: didContextDbName
            }
        }

        // Ensure there is a replication entry for each
        const couch = Db.getCouch('internal')
        const replicationDb = couch.db.use('_replicator')

        const localAuthBuffer = Buffer.from(`${process.env.DB_REPLICATION_USER}:${process.env.DB_REPLICATION_PASS}`);
        const localAuthBase64 = localAuthBuffer.toString('base64')

        console.log(`${Utils.serverUri()}: Checking ${endpoints.length} endpoints and ${Object.keys(databases).length} databases`)

        for (let e in endpoints) {
            // create a fake endpoint to have a valid URL
            // generateReplicatorHash() will strip back to hostname
            const endpointUri = endpoints[e].origin
            const replicatorId = Utils.generateReplicatorHash(endpointUri, did, contextName)
            const replicatorUsername = Utils.generateReplicaterUsername(endpointUri)

            // Find all entries that have an issue
            const brokenReplicationEntries = []
            const missingReplicationEntries = {}
            let authError = false
            for (let d in databases) {
                const dbHash = databases[d].databaseHash
                
                // Find any replication errors and handle them nicely
                try {
                    const replicationStatus = await Db.getReplicationStatus(`${replicatorId}-${dbHash}`)

                    if (!replicationStatus) {
                        console.error(`${Utils.serverUri()}: ${databases[d].databaseName} missing from ${endpointUri}`)
                        // Replication entry not found... Will need to create it
                        missingReplicationEntries[dbHash] = databases[d]
                    } else if (replicationStatus.state == 'failed' || replicationStatus.state == 'crashing' || replicationStatus.state == 'error') {
                        console.error(`${Utils.serverUri()}:  ${databases[d].databaseName} have invalid state ${replicationStatus.state} from ${endpointUri}`)
                        brokenReplicationEntries.push(replicationStatus)
                        missingReplicationEntries[dbHash] = databases[d]
                        if (replicationStatus.state == 'crashing' && replicationStatus.info.error.match(/replication_auth_error/)) {
                            authError = true
                        }
                    }
                } catch (err) {
                    console.error(`${Utils.serverUri()}: Unknown error checking replication status of database ${databases[d].databaseName} / ${dbHash}: ${err.message}`)
                }
            }

            // Delete broken replication entries and add to missing
            for (let b in brokenReplicationEntries) {
                const replicationEntry = brokenReplicationEntries[b]
                console.log(`${Utils.serverUri()}: Replication has issues, deleting entry: ${replicationEntry.doc_id} (${replicationEntry.state})`)

                try {
                    const replicationRecord = await replicationDb.get(replicationEntry.doc_id)
                    await replicationDb.destroy(replicationRecord._id, replicationRecord._rev)
                } catch (err) {
                    console.error(`${Utils.serverUri()}: Unable to find and delete replication record (${replicationEntry.doc_id}): ${err.message}`)
                    delete missingReplicationEntries[replicationEntry.databaseHash]
                }
            }

            if (Object.keys(missingReplicationEntries).length > 0) {
                //console.log(`${Utils.serverUri()}: We had some failed or missing replication entries for endpoint ${endpointUri}, so fetch credentials`)
                // force create of new credentials if we have an auth error
                const { username, password, couchUri } = await this.fetchReplicaterCredentials(endpointUri, did, contextName, authError)

                // re-add all missing replication entries
                for (let m in missingReplicationEntries) {
                    const replicationEntry = missingReplicationEntries[m]
                    const dbHash = replicationEntry.databaseHash

                    console.log(`${Utils.serverUri()}: Replication record for ${endpointUri} / ${replicationEntry.databaseName} / ${dbHash} is missing... creating.`)
                    const remoteAuthBuffer = Buffer.from(`${username}:${password}`);
                    const remoteAuthBase64 = remoteAuthBuffer.toString('base64')

                    const replicationRecord = {
                        _id: `${replicatorId}-${dbHash}`,
                        user_ctx: {
                            name: process.env.DB_REPLICATION_USER
                        },
                        source: {
                            url: `http://localhost:${process.env.DB_PORT_INTERNAL}/${dbHash}`,
                            headers: {
                                Authorization: `Basic ${localAuthBase64}`
                            }
                        },
                        target: {
                            url: `${couchUri}/${dbHash}`,
                            headers: {
                                Authorization: `Basic ${remoteAuthBase64}`
                            }
                        },
                        create_target: false,
                        continuous: true,
                        owner: 'admin'
                    }

                    try {
                        const result = await DbManager._insertOrUpdate(replicationDb, replicationRecord, replicationRecord._id)
                        replicationRecord._rev = result.rev
                        console.log(`${Utils.serverUri()}: Saved replication entry for ${endpointUri} (${replicatorId})`)
                    } catch (err) {
                        console.log(`${Utils.serverUri()}: Error saving replication entry for ${endpointUri} (${replicatorId}): ${err.message}`)
                        throw new Error(`Unable to create replication entry: ${err.message}`)
                    }
                }
            }
        }

        // @todo: Remove any replication entries for deleted databases

        // Check user databases are configured correctly
        await UserManager.checkDatabases(userDatabases)
    }

    /**
     * Fetch the credentials for an endpoint to replicate to another endpoint
     * 
     * @param {*} remoteEndpointUri 
     * @param {*} did 
     * @param {*} contextName 
     * @returns 
     */
    async fetchReplicaterCredentials(remoteEndpointUri, did, contextName, force = false) {
        // Check process.env.DB_REPLICATER_CREDS for existing credentials
        const couch = Db.getCouch('internal');
        const replicaterCredsDb = await couch.db.use(process.env.DB_REPLICATER_CREDS)

        const thisEndointUri = Utils.serverUri()
        const thisReplicaterUsername = Utils.generateReplicaterUsername(Utils.serverUri())
        const remoteReplicaterUsername = Utils.generateReplicaterUsername(remoteEndpointUri)
        
        console.log(`${Utils.serverUri()}: Fetching credentials from ${remoteEndpointUri} / ${remoteReplicaterUsername} for this replicator username (${thisEndointUri} / ${thisReplicaterUsername})`)

        let creds, password
        try {
            creds = await replicaterCredsDb.get(remoteReplicaterUsername)
            password = creds.password
            console.log(`${Utils.serverUri()}: Credentials for ${remoteEndpointUri} already existed`)
        } catch (err) {
            // If credentials aren't found, that's okay we will create them below
            if (err.error != 'not_found') {
                throw err
            }
        }

        let updatePassword = false
        if (!password || force) {
            // Generate a random password
            const secretKeyBytes = EncryptionUtils.randomKey(32)
            password = Buffer.from(secretKeyBytes).toString('hex')
            updatePassword = true
        }

        const timestampMinutes = Math.floor(Date.now() / 1000 / 60)

        const requestBody = {
            did,
            contextName,
            endpointUri: Utils.serverUri(),
            timestampMinutes,
            password
        }

        // Only include the password if it is changing
        if (!updatePassword) {
            delete requestBody['password']
        }

        const privateKeyBytes = new Uint8Array(Buffer.from(process.env.VDA_PRIVATE_KEY.substring(2), 'hex'))
        const signature = EncryptionUtils.signData(requestBody, privateKeyBytes)

        requestBody.signature = signature

        // Fetch credentials from the endpointUri
        // console.log(`${Utils.serverUri()}: Verifying replication creds for remote endpoint: ${remoteEndpointUri}`)
        let credsUpdated
        try {
            const result = await Axios.post(`${remoteEndpointUri}/auth/replicationCreds`, requestBody, {
                // 5 second timeout
                timeout: 5000
            })
            console.log(`${Utils.serverUri()}: Credentials verified for ${remoteEndpointUri}`)
            credsUpdated = updatePassword ? updatePassword : result.result == 'updated'
        } catch (err) {
            const message = err.response ? err.response.data.message : err.message
            if (err.response) {
                throw Error(`Unable to verify credentials from ${remoteEndpointUri} (${message}})`)
            }

            throw err
        }

        let couchUri
        if (creds) {
            couchUri = creds.couchUri
        } else {
            try {
                const statusResponse = await Axios.get(`${remoteEndpointUri}/status`)
                couchUri = statusResponse.data.results.couchUri
            } catch (err) {
                const message = err.response ? err.response.data.message : err.message
                if (err.response) {
                    throw Error(`Unable to obtain couchUri from ${remoteEndpointUri} (${message})`)
                }

                throw err
            }
        }

        // Update the password (or create new replication entry if it doesn't exist)
        if (updatePassword) {
            creds = {
                // Use the remote username so we share the same credentials across all contexts for this endpoint
                _id: remoteReplicaterUsername,
                // Use this server username
                username: thisReplicaterUsername,
                password,
                couchUri
            }

            try {
                const result = await DbManager._insertOrUpdate(replicaterCredsDb, creds, creds._id)
                console.log(`${Utils.serverUri()}: Credentials saved for ${remoteEndpointUri} ${result.id}`)
            } catch (err) {
                throw new Error(`Unable to save replicater password : ${err.message} (${remoteEndpointUri})`)
            }
        }

        if (credsUpdated) {
            this.updateReplicationCredentials(creds.username, creds.password, creds.couchUri)
        }

        const result = {
            username: creds.username,
            password: creds.password,
            // did the credentials exit already?
            couchUri: creds.couchUri
        }

        return result
    }

    async updateReplicationCredentials(username, password, couchUri) {
        console.log(`${Utils.serverUri()}: Credentials were updated, so updating all existing replication records for this endpoint ${couchUri} to use the new credentials`)
        const remoteAuthBuffer = Buffer.from(`${username}:${password}`);
        const remoteAuthBase64 = remoteAuthBuffer.toString('base64')
        
        // find all replication records associated with this replicator
        const query = {
            selector: {
                target: {
                    url: {
                        '$regex': `^${couchUri}`
                    }
                }
            },
            limit: 1000
        }

        const couch = Db.getCouch('internal')
        const replicationDb = couch.db.use('_replicator')
        const replicationEntries = await replicationDb.find(query)
        console.log(`${Utils.serverUri()}: Found ${replicationEntries.docs.length}`)

        for (let r in replicationEntries.docs) {
            const replicationEntry = replicationEntries.docs[r]
            replicationEntry.target.headers.Authorization = `Basic ${remoteAuthBase64}`
            try {
                await DbManager._insertOrUpdate(replicationDb, replicationEntry, replicationEntry._id)
            } catch (err) {
                console.log(`${Utils.serverUri()}: Error updating replication credentials for ${couchUri} (${r}): ${err.message}`)
            }
        }
    }

}

let replicationManager = new ReplicationManager();
export default replicationManager;