import crypto from 'crypto';
import Db from './db.js'
import Utils from './utils.js'
import DbManager from './dbManager.js';
import AuthManager from './authManager';
import ReplicationManager from './replicationManager';
import Axios from 'axios'

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

    async getUserContextHash(did, contextHash) {
        const couch = Db.getCouch()
        const didContextDbName = `c${contextHash.substring(2)}`
        const db = couch.db.use(didContextDbName)

        const records = await db.list({
            include_docs: true,
            limit: 1
        })

        if (records.rows.length == 0) {
            return
        }

        return records.rows[0].doc.contextName
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
                //console.log(`Checking ${database.databaseHash} (${database.databaseName}) exists`)
                await couch.db.create(database.databaseHash);

                // Database didn't exist, so create it properly
                const options = {}
                if (database.permissions) {
                    options.permissions = database.permissions
                }

                await DbManager.createDatabase(database.did, database.databaseHash, database.contextName, options)
            } catch (err) {
                // The database may already exist, or may have been deleted so a file already exists.
                // In that case, ignore the error and continue
                if (err.error != 'file_exists') {
                    throw err
                }
            }
        }
    }

}

let userManager = new UserManager();
export default userManager;