import crypto from 'crypto';
import Db from './db.js'
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
        const couch = Db.getCouch()
        const password = crypto.createHash('sha256').update(signature).digest("hex")

        // Create CouchDB database user matching username and password
        let userData = {
            _id: `org.couchdb.user:${username}`,
            name: username,
            password: password,
            type: "user",
            roles: []
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

        let couch = Db.getCouch();

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

        try {
            await couch.db.create(process.env.DB_DB_INFO)
            const dbInfo = couch.db.use(process.env.DB_DB_INFO)
            await dbInfo.createIndex({
                index: {
                    fields: ['did', 'contextName']
                },
                name: 'didContext'
            })
        } catch (err) {
            if (err.message == "The database could not be created, the file already exists.") {
                console.log("Info database not created -- already existed");
            } else {
                throw err;
            }
        }

        try {
            await couch.db.create(process.env.DB_DIDS)
            const dbDids = couch.db.use(process.env.DB_DIDS)
            await dbDids.createIndex({
                index: {
                    fields: ['id']
                },
                name: 'did'
            })
        } catch (err) {
            if (err.message == "The database could not be created, the file already exists.") {
                console.log("DID database not created -- already existed");
            } else {
                throw err;
            }
        }
    }

}

let userManager = new UserManager();
export default userManager;