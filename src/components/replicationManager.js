import Db from './db.js'
import Utils from './utils.js'
import DbManager from './dbManager.js';
import AuthManager from './authManager.js';
import Axios from 'axios'
import EncryptionUtils from '@verida/encryption-utils';

import dotenv from 'dotenv';
dotenv.config();

function now() {
    return Math.floor(Date.now() / 1000)
}

class ReplicationManager {

    async touchDatabases(did, contextName, databaseHashes) {
        //console.log(`${Utils.serverUri()}: touchDatabases(${did}, ${contextName}, ${databaseHashes.length})`)
        
        // Determine the endpoints this node needs to replicate to
        const endpoints = await this.getReplicationEndpoints(did, contextName)

        // Touch all the databases for every endpoint
        for (let e in endpoints) {
            // create a fake endpoint to have a valid URL
            // generateReplicatorHash() will strip back to hostname
            const endpointUri = endpoints[e].origin
            const replicatorId = Utils.generateReplicatorHash(endpointUri, did, contextName)

            const touchReplicationEntries = []

            // Find all entries that have an issue
            const brokenReplicationEntries = []
            let authError = false
            for (let d in databaseHashes) {
                const dbHash = databaseHashes[d]
                
                // Find existing replication records
                try {
                    const replicationStatus = await Db.getReplicationStatus(`${replicatorId}-${dbHash}`)

                    // Handle replication errors
                    if (!replicationStatus) {
                        //console.error(`${Utils.serverUri()}: ${dbHash} missing replication to ${endpointUri}`)
                        // Replication entry not found... Will need to create it
                        touchReplicationEntries.push(dbHash)
                    } else if (replicationStatus.state == 'failed' || replicationStatus.state == 'crashing' || replicationStatus.state == 'error') {
                        console.error(`${Utils.serverUri()}:  ${dbHash} has invalid state (${replicationStatus.state}) replicating to ${endpointUri}`)
                        brokenReplicationEntries.push(replicationStatus)
                        touchReplicationEntries.push(dbHash)
                        if (replicationStatus.state == 'crashing' && replicationStatus.info.error.match(/replication_auth_error/)) {
                            authError = true
                        }
                    } else {
                        // Replication is good, but need to update the touched timestamp
                        touchReplicationEntries.push(dbHash)
                    }
                } catch (err) {
                    console.error(`${Utils.serverUri()}: Unknown error checking replication status of database ${dbHash}: ${err.message}`)
                }
            }

            // Delete broken replication entries
            const couch = Db.getCouch('internal')
            const replicationDb = couch.db.use('_replicator')
            // @todo: No need as they will be garbage collected?
            for (let b in brokenReplicationEntries) {
                const replicationEntry = brokenReplicationEntries[b]
                console.log(`${Utils.serverUri()}: Replication has issues, deleting entry: ${replicationEntry.doc_id} (${replicationEntry.state})`)

                try {
                    const replicationRecord = await replicationDb.get(replicationEntry.doc_id)
                    await replicationDb.destroy(replicationRecord._id, replicationRecord._rev)
                } catch (err) {
                    console.error(`${Utils.serverUri()}: Unable to find and delete replication record (${replicationEntry.doc_id}): ${err.message}`)
                }
            }

            // Create or update all replication entries for the list of database hashes
            if (Object.keys(touchReplicationEntries).length > 0) {
                await this.createUpdateReplicationEntries(did, contextName, endpointUri, touchReplicationEntries, authError)
            }
        }
    }

    /**
     * Create new or update existing replication entry
     */
    async createUpdateReplicationEntries(did, contextName, endpointUri, dbHashes, forceCreds = false) {
        const { username, password, couchUri } = await this.fetchReplicaterCredentials(endpointUri, did, contextName, forceCreds)
        const replicatorId = Utils.generateReplicatorHash(endpointUri, did, contextName)

        const remoteAuthBuffer = Buffer.from(`${username}:${password}`);
        const remoteAuthBase64 = remoteAuthBuffer.toString('base64')

        const localAuthBuffer = Buffer.from(`${process.env.DB_REPLICATION_USER}:${process.env.DB_REPLICATION_PASS}`);
        const localAuthBase64 = localAuthBuffer.toString('base64')

        const couch = Db.getCouch('internal')
        const replicationDb = couch.db.use('_replicator')

        for (let d in dbHashes) {
            const dbHash = dbHashes[d]
            //console.log(`${Utils.serverUri()}: Create / update replication record for ${endpointUri} / ${dbHash}`)

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
                owner: 'admin',
                expiry: (now() + process.env.REPLICATION_EXPIRY_MINUTES*60)
            }

            try {
                const result = await DbManager._insertOrUpdate(replicationDb, replicationRecord, replicationRecord._id)
                replicationRecord._rev = result.rev
                //console.log(`${Utils.serverUri()}: Saved replication entry for ${endpointUri} (${replicatorId})`)
            } catch (err) {
                console.log(`${Utils.serverUri()}: Error saving replication entry for ${endpointUri} (${replicatorId}-${dbHash}): ${err.message}`)
                throw new Error(`Unable to create replication entry: ${err.message}`)
            }
        }
    }

    async getReplicationEndpoints(did, contextName) {
        // Lookup DID document and get list of endpoints for this context
        let didDocument = await AuthManager.getDidDocument(did)
        let didService = didDocument.locateServiceEndpoint(contextName, 'database')

        if (!didService) {
            // Service not found, try to fetch the DID document without caching (as it may have been updated)
            didDocument = await AuthManager.getDidDocument(did, true)
            didService = didDocument.locateServiceEndpoint(contextName, 'database')
        }

        if (!didService) {
            throw new Error(`Unable to locate service endpoint for this DID and context`)
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

        return endpoints
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
        
        //console.log(`${Utils.serverUri()}: Fetching credentials from ${remoteEndpointUri} / ${remoteReplicaterUsername} for this replicator username (${thisEndointUri} / ${thisReplicaterUsername}) force = ${force}`)

        let creds, password
        try {
            creds = await replicaterCredsDb.get(remoteReplicaterUsername)
            password = creds.password
            //console.log(`${Utils.serverUri()}: Credentials for ${remoteEndpointUri} already existed`)
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
            //console.log(`${Utils.serverUri()}: Credentials verified for ${remoteEndpointUri}`)
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
                //console.log(`${Utils.serverUri()}: Credentials saved for ${remoteEndpointUri} ${result.id}`)
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
        //console.log(`${Utils.serverUri()}: Credentials were updated, so updating all existing replication records for this endpoint ${couchUri} to use the new credentials`)
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
        //console.log(`${Utils.serverUri()}: Found ${replicationEntries.docs.length}`)

        for (let r in replicationEntries.docs) {
            const replicationEntry = replicationEntries.docs[r]
            replicationEntry.target.headers.Authorization = `Basic ${remoteAuthBase64}`
            try {
                await DbManager._insertOrUpdate(replicationDb, replicationEntry, replicationEntry._id)
            } catch (err) {
                console.error(`${Utils.serverUri()}: Error updating replication credentials for ${couchUri} (${r}): ${err.message}`)
            }
        }
    }

    async clearExpired() {
        const couch = Db.getCouch('internal')
        const replicationDb = couch.db.use('_replicator')

        // Find all expired replication entries
        const query = {
            selector: {
                expiry: {
                    '$lt': now()
                }
            },
            limit: 10
        }

        const expiredReplications = await replicationDb.find(query)
        if (expiredReplications.docs.length == 0) {
            return
        }

        for (let e in expiredReplications.docs) {
            const replicationEntry = expiredReplications.docs[e]
            if (replicationEntry._id.match(/_design/)) {
                continue
            }
            const destroyResult = await replicationDb.destroy(replicationEntry._id, replicationEntry._rev)
        }
    }

}

let replicationManager = new ReplicationManager();
export default replicationManager;