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
            try {
                const dbInfo = await DbManager.getUserDatabase(did, contextName, database.databaseName)
                result.databases++
                result.bytes += dbInfo.info.sizes.file
            } catch (err) {
                if (err.error == 'not_found') {
                    // Database doesn't exist, so remove from the list of databases
                    await DbManager.deleteUserDatabase(did, contextName, database.databaseName)
                    continue
                }
                
                throw err
            }
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
        let endpoints = [...didService.serviceEndpoint] // create a copy as this is cached and we will modify later

        console.log(endpoints)
        console.log('serverUrl', Utils.serverUri())

        // Confirm this endpoint is in the list of endpoints
        const endpointIndex = endpoints.indexOf(Utils.serverUri())
        if (endpointIndex === -1) {
            throw new Error('Server not a valid endpoint for this DID and context')
        }

        // Remove this endpoint from the list of endpoints to check
        endpoints.splice(endpointIndex, 1)

        const userDatabases = await DbManager.getUserDatabases(did, contextName)

        let databases = {}
        if (databaseName) {
            //console.log(`${Utils.serverUri()}: Only checking ${databaseName}`)
            for (let i in userDatabases) {
                const item = userDatabases[i]
                if (item.databaseName == databaseName) {
                    databases[item.databaseName] = item
                }
            }
            console.log(databases)
            
            // Only check a single database
            if (!Object.keys(databases).length === 0) {
                console.log(userDatabases)
                console.log(databaseName)
                console.log('User database not found!')
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
                databaseName: didContextDbName,
                databasehash: didContextDbName
            }
            //console.log(`${Utils.serverUri()}: Checking ${databases.length}) databases`)
        }

        // Ensure there is a replication entry for each
        const couch = Db.getCouch('internal')
        const replicationDb = couch.db.use('_replicator')

        const localAuthBuffer = Buffer.from(`${process.env.DB_REPLICATION_USER}:${process.env.DB_REPLICATION_PASS}`);
        const localAuthBase64 = localAuthBuffer.toString('base64')

        // Ensure all databases have replication entries
        for (let d in databases) {
            const dbHash = databases[d].databaseHash

            for (let e in endpoints) {
                const endpointUri = endpoints[e]
                const replicatorId = Utils.generateReplicatorHash(endpointUri, did, contextName)
                let record
                try {
                    record = await replicationDb.get(`${replicatorId}-${dbHash}`)
                    //console.log(`${Utils.serverUri()}: Located replication record for ${dbHash} on ${endpointUri} (${replicatorId})`)
                } catch (err) {
                    if (err.message == 'missing' || err.reason == 'deleted') {
                        //console.log(`${Utils.serverUri()}: Replication record for ${endpointUri} is missing... creating.`)
                        // No record, so create it
                        // Check if we have credentials
                        // No credentials? Ask for them from the endpoint
                        const { username, password, couchUri } = await AuthManager.fetchReplicaterCredentials(endpointUri, did, contextName)
                        //console.log(`${Utils.serverUri()}: Located replication credentials for ${endpointUri} (${username}, ${password}, ${couchUri})`)

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
                            await DbManager._insertOrUpdate(replicationDb, replicationRecord, replicationRecord._id)
                            //console.log(`${Utils.serverUri()}: Saved replication entry for ${endpointUri} (${replicatorId})`)
                        } catch (err) {
                            //console.log(`${Utils.serverUri()}: Error saving replication entry for ${endpointUri} (${replicatorId}): ${err.message}`)
                            throw new Error(`Unable to create replication entry: ${err.message}`)
                        }
                    }
                    else {
                        //console.log(`${Utils.serverUri()}: Unknown error fetching replication entry for ${endpointUri} (${replicatorId}): ${err.message}`)
                        throw err
                    }
                }
            }
        }

        // @todo: Find any replication errors and handle them nicely
        // @todo: Remove any replication entries for deleted databases

        // Check user databases are configured correctly
        await this.checkDatabases(userDatabases)
    }

    /**
     * Check all the databases in the user database list exist
     * 
     * @todo: How to check they have the correct permissions?
     */
    async checkDatabases(userDatabases) {
        const couch = Db.getCouch('internal')

        for (let d in userDatabases) {
            const database = userDatabases[d]
            
            // Try to create database
            try {
                console.log(`Checking ${database.databaseHash} (${database.databaseName}) exists`)
                await couch.db.create(database.databaseHash);

                // Database didn't exist, so create it properly
                const options = {}
                if (database.permissions) {
                    options.permissions = database.permissions
                }

                const username = Utils.generateUsername(did, contextName)
                console.log(`Database didn't exist, so creating`)
                await DbManager.createDatabase(database.did, username, database.databaseHash, database.contextName, options)

            } catch (err) {
                // The database may already exist, or may have been deleted so a file already exists.
                // In that case, ignore the error and continue
            }
        }
    }

}

let userManager = new UserManager();
export default userManager;