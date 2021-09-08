const CouchDb = require('nano');
import crypto from 'crypto';

class UserManager {

    constructor() {
        this.error = null;
    }

    /**
     * Get a user by DID
     * 
     * @param {} did 
     */
    async getByUsername(username, signature) {
        let couch = this._getCouch();
        let usersDb = couch.db.use('_users');

        try {
            let response = await usersDb.get('org.couchdb.user:' + username)
            let password = crypto.createHash('sha256').update(signature).digest("hex")
            return {
                username: username,
                dsn: this.buildDsn(username, password),
                salt: response.salt
            };
        } catch (err) {
            this.error = err;
            return false;
        }
    }

    async create(username, signature) {
        let couch = this._getCouch()
        let password = crypto.createHash('sha256').update(signature).digest("hex")

        // Create CouchDB database user matching username and password
        let userData = {
            _id: "org.couchdb.user:" + username,
            name: username,
            password: password,
            type: "user",
            roles: []
        };

        let usersDb = couch.db.use('_users');
        try {
            return await usersDb.insert(userData);
        } catch (err) {
            this.error = err;
            return false;
        }
    }

    

    /**
     * Ensure we have a public user in the database for accessing public data
     */
    async ensurePublicUser() {
        let username = process.env.DB_PUBLIC_USER;
        let password = process.env.DB_PUBLIC_PASS;

        let couch = this._getCouch();

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
            console.log("Public user created");
        } catch (err) {
            if (err.error == "conflict") {
                console.log("Public user not created -- already existed");
            } else {
                throw err;
            }
            
        }
    }

    _getCouch() {
        let dsn = this.buildDsn(process.env.DB_USER, process.env.DB_PASS);

        if (!this._couch) {
            this._couch = new CouchDb({
                url: dsn,
                requestDefaults: {
                    rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED_SSL.toLowerCase() != "false"
                }
            });
        }

        return this._couch;
    }

    buildDsn(username, password) {
        let env = process.env;
        return env.DB_PROTOCOL + "://" + username + ":" + password + "@" + env.DB_HOST + ":" + env.DB_PORT;
    }

}

let userManager = new UserManager();
export default userManager;