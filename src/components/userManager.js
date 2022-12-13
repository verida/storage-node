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

    async checkReplication(did, contextName, databaseName) {
        console.log(`checkReplication(${did}, ${contextName}, ${databaseName})`)
        // Lookup DID document and get list of endpoints for this context
        const didDocument = await AuthManager.getDidDocument(did)
        const endpoints = didDocument.locateServiceEndpoint(contextName, 'database')

        console.log(`- endpoints:`)
        console.log(endpoints)

        let databases = []
        if (databaseName) {
            // Only check a single database
            databases.push(databaseName)
        } else {
            // Fetch all databases for this context
            let userDatabases = await DbManager.getUserDatabases(did, contextName)
            databases = userDatabases.map(item => item.databaseName)
        }

        console.log('- databases', databases)

        // Ensure there is a replication entry for each
        const couch = Db.getCouch('internal')
        const replicationDb = couch.db.use('_replicator')

        for (let d in databases) {
            const dbName = databases[d]

            for (let e in endpoints) {
                const endpointUri = endpoints[e]
                const replicatorId = Utils.generateReplicatorHash(endpointUri, did, contextName)
                const record = await replicationDb.get(replicatorId)

                if (!record) {
                    console.log(`- no record: ${endpointUri}`)
                    // No record, so create it
                    // Check if we have credentials
                    // No credentials? Ask for them from the endpoint
                    const { endpointUsername, endpointPassword } = AuthManager.fetchReplicaterCredentials(endpointUri, did, contextName)

                    const dbHash = Utils.generateDatabaseName(did, contextName, dbName)
                    const replicationRecord = {
                        _id: `${replicatorId}-${dbhash}`,
                        source: `host: ${Db.buildHost()}/${dbHash}`,
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

                    console.log('- replicationRecord')
                    console.log(replicationRecord)

                    try {
                        await dbManager._insertOrUpdate(replicationDb, replicationRecord, replicationRecord.id)
                    } catch (err) {
                        console.log(err)
                        throw new Error(`Unable to update password: ${err.message}`)
                    }
                }
            }
        }

        // @todo: Remove any replication entries for deleted databases
        
    }

}

let userManager = new UserManager();
export default userManager;