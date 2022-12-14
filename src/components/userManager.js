import crypto from 'crypto';
import Db from './db.js'
import Utils from './utils.js'
import DbManager from './dbManager.js';
import AuthManager from './authManager';

import dotenv from 'dotenv';
dotenv.config();

class UserManager {

    constructor() {
        this.error = null;
    }

    /**
     * Get a user by DID
     * 
     * @param {} did 
     */
    async getByUsername(username) {
        const couch = Db.getCouch()
        try {
            const usersDb = couch.db.use('_users');
            const user = await usersDb.get(`org.couchdb.user:${username}`);
            return user
        } catch (err) {
            this.error = err;
            return false;
        }
    }

    async create(username, signature) {
        const maxUsers = parseInt(process.env.MAX_USERS)
        const currentUsers = await Db.totalUsers()

        if (currentUsers >= maxUsers) {
            throw new Error('Maximum user limit reached')
        }

        const couch = Db.getCouch()
        const password = crypto.createHash('sha256').update(signature).digest("hex")

        const storageLimit = process.env.DEFAULT_USER_CONTEXT_LIMIT_MB*1048576

        // Create CouchDB database user matching username and password
        let userData = {
            _id: `org.couchdb.user:${username}`,
            name: username,
            password: password,
            type: "user",
            roles: [],
            storageLimit
        };

        let usersDb = couch.db.use('_users');
        try {
            return await usersDb.insert(userData);
        } catch (err) {
            if (err.error == 'conflict') {
                // User already existed
                return userData
            }

            this.error = err;
            return false;
        }
    }

    /**
     * Ensure we have a public user in the database for accessing public data
     */
    async ensureDefaultDatabases() {
        let username = process.env.DB_PUBLIC_USER;
        let password = process.env.DB_PUBLIC_PASS;

        let couch = Db.getCouch('internal');

        // Create CouchDB database user matching username and password and save keyring
        let userData = {
            _id: "org.couchdb.user:" + username,
            name: username,
            password: password,
            type: "user",
            roles: []
        };

        let usersDb = couch.db.use('_users');
        try {
            await usersDb.insert(userData);
        } catch (err) {
            if (err.error === "conflict") {
                console.log("Public user not created -- already existed");
            } else {
                throw err;
            }
        }
    }

    async getUsage(did, contextName) {
        const username = Utils.generateUsername(did, contextName);
        const user = await this.getByUsername(username);
        const databases = await DbManager.getUserDatabases(did, contextName)

        const result = {
            databases: 0,
            bytes: 0,
            storageLimit: user.storageLimit
        }

        for (let d in databases) {
            const database = databases[d]
            const dbInfo = await DbManager.getUserDatabase(did, contextName, database.databaseName)
            result.databases++
            result.bytes += dbInfo.info.sizes.file
        }

        const usage = result.bytes / parseInt(result.storageLimit)
        result.usagePercent = Number(usage.toFixed(4))
        return result
    }

    /**
     * Confirm replication is correctly configured for a given DID and application context.
     * 
     * If a storage node is being added or removed to the application context, it must be the
     * last node to have checkReplication called. This ensures the node has a list of all the
     * active databases and can ensure it is replicating correctly to the other nodes.
     * 
     * The client SDK should call checkReplication() when opening a context to ensure the replication is working as expected.
     * 
     * @param {*} did 
     * @param {*} contextName 
     * @param {*} databaseName (optional) If not specified, checks all databases
     */
    async checkReplication(did, contextName, databaseName) {
        console.log(`${Utils.serverUri()}: checkReplication(${did}, ${contextName}, ${databaseName})`)
        // Lookup DID document and get list of endpoints for this context
        const didDocument = await AuthManager.getDidDocument(did)
        const didService = didDocument.locateServiceEndpoint(contextName, 'database')
        let endpoints = didService.serviceEndpoint

        // Confirm this endpoint is in the list of endpoints
        const endpointIndex = endpoints.indexOf(Utils.serverUri())
        if (endpointIndex === -1) {
            throw new Error('Server not a valid endpoint for this DID and context')
        }

        // Remove this endpoint from the list of endpoints to check
        endpoints.splice(endpointIndex, 1)

        console.log(`- endpoints:`)
        console.log(endpoints)

        let databases = []
        if (databaseName) {
            console.log(`${Utils.serverUri()}: Only checking ${databaseName})`)
            // Only check a single database
            databases.push(databaseName)
        } else {
            // Fetch all databases for this context
            let userDatabases = await DbManager.getUserDatabases(did, contextName)
            databases = userDatabases.map(item => item.databaseName)
            console.log(`${Utils.serverUri()}: Cecking ${databases.length}) databases`)
        }

        //console.log('- databases', databases)

        // Ensure there is a replication entry for each
        const couch = Db.getCouch('internal')
        let replicationDb
        try {
            replicationDb = couch.db.use('_replicator')
            console.log('got db')
        } catch (err) {
            console.log('!')
            console.log(err)
            throw err
        }

        for (let d in databases) {
            const dbName = databases[d]

            for (let e in endpoints) {
                const endpointUri = endpoints[e]
                const replicatorId = Utils.generateReplicatorHash(endpointUri, did, contextName)
                const dbHash = Utils.generateDatabaseName(did, contextName, dbName)
                let record
                try {
                    record = await replicationDb.get(`${replicatorId}-${dbHash}`)
                    console.log(`${Utils.serverUri()}: Located replication record for ${endpointUri} (${replicatorId})`)
                } catch (err) {
                    if (err.message == 'missing' || err.reason == 'deleted') {
                        console.log(`${Utils.serverUri()}: Located replication record for ${endpointUri}... creating.`)
                        // No record, so create it
                        // Check if we have credentials
                        // No credentials? Ask for them from the endpoint
                        const { endpointUsername, endpointPassword } = await AuthManager.fetchReplicaterCredentials(endpointUri, did, contextName)
                        console.log(`${Utils.serverUri()}: Located replication credentials for ${endpointUri} (${endpointUsername}, ${endpointPassword})`)

                        const replicationRecord = {
                            _id: `${replicatorId}-${dbHash}`,
                            source: `${Db.buildHost()}/${dbHash}`,
                            target: {
                                url: `${endpointUri}/${dbHash}`,
                                auth: {
                                    basic: {
                                        username: endpointUsername,
                                        password: endpointPassword
                                    }
                                }
                            },
                            create_target: true,
                            continous: true
                        }

                        try {
                            await DbManager._insertOrUpdate(replicationDb, replicationRecord, replicationRecord._id)
                            console.log(`${Utils.serverUri()}: Saved replication entry for ${endpointUri} (${replicatorId})`)
                        } catch (err) {
                            console.log(`${Utils.serverUri()}: Error saving replication entry for ${endpointUri} (${replicatorId})`)
                            console.log(err)
                            throw new Error(`Unable to create replication entry: ${err.message}`)
                        }
                    }
                    else {
                        console.log(`${Utils.serverUri()}: Unknown error fetching replication entry for ${endpointUri} (${replicatorId})`)
                        console.log(err)
                        throw err
                    }
                }
            }
        }

        // @todo: Remove any replication entries for deleted databases
    }

}

let userManager = new UserManager();
export default userManager;