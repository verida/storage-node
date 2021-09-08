const CouchDb = require('nano');
import Utils from './utils';
import _ from 'lodash';

class DbManager {

    constructor() {
        this.error = null;
    }

    async createDatabase(username, databaseName, applicationName, options) {
        let couch = this._getCouch();

        let response;
        // Create database
        try {
            response = await couch.db.create(databaseName);
        } catch (err) {
            // The database may already exist, or may have been deleted so a file
            // already exists.
            // In that case, ignore the error and continue
            if (err.error != "file_exists") {
                throw err;
            }
        }

        let db = couch.db.use(databaseName);

        try {
            await this.configurePermissions(db, username, applicationName, options.permissions);
        } catch (err) {
            console.log("configure error");
            console.log(err);
        }

        return true;
    }

    async updateDatabase(username, databaseName, applicationName, options) {
        const couch = this._getCouch();
        const db = couch.db.use(databaseName);

        try {
            await this.configurePermissions(db, username, applicationName, options.permissions);
        } catch (err) {
            console.log("configure error");
            console.log(err);
        }

        return true;
    }

    async deleteDatabase(databaseName) {
        let couch = this._getCouch();

        let response;
        // Create database
        try {
            return await couch.db.destroy(databaseName);
        } catch (err) {
            //console.error("Database existed: "+databaseName);
            // The database may already exist, or may have been deleted so a file
            // already exists.
            // In that case, ignore the error and continue
            console.log(err);
        }
    }

    async configurePermissions(db, username, applicationName, permissions) {
        permissions = permissions ? permissions : {};

        let owner = username;

        // Database owner always has full permissions
        let writeUsers = [owner];
        let readUsers = [owner];
        let deleteUsers = [owner];

        // @todo Support modifying user lists after db has been created

        switch (permissions.write) {
            case "users":
                writeUsers = _.union(writeUsers, Utils.didsToUsernames(permissions.writeList, applicationName));
                deleteUsers = _.union(deleteUsers, Utils.didsToUsernames(permissions.deleteList, applicationName));
                break;
            case "public":
                writeUsers = writeUsers.concat([process.env.DB_PUBLIC_USER]);
                break;
        }

        switch (permissions.read) {
            case "users":
                readUsers = _.union(readUsers, Utils.didsToUsernames(permissions.readList, applicationName));
                break;
            case "public":
                readUsers = readUsers.concat([process.env.DB_PUBLIC_USER]);
                break;
        }

        let dbMembers = _.union(readUsers, writeUsers);

        let securityDoc = {
            admins: {
                names: [owner],
                roles: []
            },
            members: {
                // this grants read access to all members
                names: dbMembers,
                roles: []
            }
        };

        // Insert security document to ensure owner is the admin and any other read / write users can access the database
        try {
            await this._insertOrUpdate(db, securityDoc, '_security');
        } catch (err) {
            console.log(err);
            return false;
        }

        // Create validation document so only owner users in the write list can write to the database
        let writeUsersJson = JSON.stringify(writeUsers);
        let deleteUsersJson = JSON.stringify(deleteUsers);

        try {
            const writeFunction = "\n    function(newDoc, oldDoc, userCtx, secObj) {\n        if (" + writeUsersJson + ".indexOf(userCtx.name) == -1) throw({ unauthorized: 'User is not permitted to write to database' });\n}";
            const writeDoc = {
                "validate_doc_update": writeFunction
            };

            await this._insertOrUpdate(db, writeDoc, '_design/only_permit_write_users');
        } catch (err) {
            // CouchDB throws a document update conflict without any obvious reason
            if (err.reason != "Document update conflict.") {
                throw err;
            }
        }

        if (permissions.write == "public") {
            // If the public has write permissions, disable public from deleting records
            try {
                const deleteFunction = "\n    function(newDoc, oldDoc, userCtx, secObj) {\n        if ("+deleteUsersJson+".indexOf(userCtx.name) == -1 && newDoc._deleted) throw({ unauthorized: 'User is not permitted to delete from database' });\n}";
                const deleteDoc = {
                    "validate_doc_update": deleteFunction
                };

                await this._insertOrUpdate(db, deleteDoc, '_design/disable_public_delete');
            } catch (err) {
                // CouchDB throws a document update conflict without any obvious reason
                if (err.reason != "Document update conflict.") {
                    throw err;
                }
            }
        }

        return true;
    }

    /**
     * Insert an entry, or update if it already exists
     * @param {*} db 
     * @param {*} newDoc 
     * @param {*} id 
     */
    async _insertOrUpdate(db, newDoc, id) {
        let doc = {};

        try {
            doc = await db.get(id);
        } catch (err) {
            if (err.reason != "missing") {
                throw err;
            }
        }

        if (doc._rev) {
            newDoc._rev = doc._rev;
            newDoc._id = id;
            return db.insert(newDoc);
        } else {
            return db.insert(newDoc, id);
        }
    }

    /**
     * Get a couch db instance
     */
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

    /**
     * Build a DSN for a username / password combination
     * @param {*} username 
     * @param {*} password 
     */
    buildDsn(username, password) {
        let env = process.env;
        return env.DB_PROTOCOL + "://" + username + ":" + password + "@" + env.DB_HOST + ":" + env.DB_PORT;
    }
}

let dbManager = new DbManager();
export default dbManager;