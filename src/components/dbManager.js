import Utils from './utils.js';
import _ from 'lodash';
import Db from "./db.js"
import EncryptionUtils from "@verida/encryption-utils"
import dotenv from 'dotenv';
dotenv.config();

class DbManager {

    constructor() {
        this.error = null;
    }

    async saveUserDatabase(did, contextName, databaseName, databaseHash, permissions) {
        const couch = Db.getCouch()
        const userDatabaseName = process.env.DB_DB_INFO
        const db = couch.db.use(userDatabaseName)

        const text = `${did.toLowerCase()}/${contextName}/${databaseName}`
        const id = EncryptionUtils.hash(text).substring(2)

        try {
            const result = await this._insertOrUpdate(db, {
                _id: id,
                did,
                contextName,
                databaseName,
                databaseHash,
                permissions
            }, id)
        } catch (err) {
            throw err
        }
    }

    async getUserDatabases(did, contextName) {
        const couch = Db.getCouch()
        const userDatabaseName = process.env.DB_DB_INFO
        const db = couch.db.use(userDatabaseName)

        try {
            const query = {
                selector: {
                    did,
                    contextName
                },
                limit: 1000
            }

            const results = await db.find(query)
            const finalResult = results.docs.map((item) => {
                delete item['_id']
                delete item['_rev']

                return item
            })

            return finalResult
        } catch (err) {
            if (err.reason != "missing") {
                throw err;
            }
        }
    }

    async getUserDatabase(did, contextName, databaseName) {
        const couch = Db.getCouch()
        const userDatabaseName = process.env.DB_DB_INFO
        const db = couch.db.use(userDatabaseName)

        const text = `${did.toLowerCase()}/${contextName}/${databaseName}`
        const id = EncryptionUtils.hash(text).substring(2)

        try {
            const doc = await db.get(id)
            const userDb = couch.use(doc.databaseHash)
            const info = await userDb.info()

            const result = {
                did,
                contextName,
                databaseName,
                info
            }

            return result
        } catch (err) {
            if (err.reason == "missing") {
                return false
            }

            throw err
        }
    }

    async deleteUserDatabase(did, contextName, databaseName, databaseHash) {
        const couch = Db.getCouch()
        const userDatabaseName = process.env.DB_DB_INFO
        const db = couch.db.use(userDatabaseName)

        const text = `${did.toLowerCase()}/${contextName}/${databaseName}`
        const id = EncryptionUtils.hash(text).substring(2)

        try {
            await this._insertOrUpdate(db, {
                _id: id,
                _deleted: true
            }, id)
        } catch (err) {
            throw err
        }
    }

    async createDatabase(username, databaseName, applicationName, options) {
        let couch = Db.getCouch();

        // Create database
        try {
            await couch.db.create(databaseName);
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
            //console.log("configure error");
            //console.log(err);
        }

        return true;
    }

    async updateDatabase(username, databaseName, applicationName, options) {
        const couch = Db.getCouch();
        const db = couch.db.use(databaseName);

        // Do a sanity check to confirm the username is an admin of the database
        const perms = await couch.request({db: databaseName, method: 'get', path: '/_security'})
        const usernameIsAdmin = perms.admins.names.includes(username)

        if (!usernameIsAdmin) {
            return false
        }

        try {
            await this.configurePermissions(db, username, applicationName, options.permissions);
        } catch (err) {
            //console.log("update database error");
            //console.log(err);
        }

        return true;
    }

    async deleteDatabase(databaseName, username) {
        const couch = Db.getCouch();

        // Do a sanity check to confirm the username is an admin of the database
        const perms = await couch.request({db: databaseName, method: 'get', path: '/_security'})
        const usernameIsAdmin = perms.admins.names.includes(username)

        if (!usernameIsAdmin) {
            return false
        }

        // Create database
        try {
            return await couch.db.destroy(databaseName);
        } catch (err) {
            // The database may already exist, or may have been deleted so a file
            // already exists.
            // In that case, ignore the error and continue
            //console.log(err);
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

        const dbMembers = _.union(readUsers, writeUsers);

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
            if (err.reason !== "Document update conflict.") {
                throw err;
            }
        }

        if (permissions.write === "public") {
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
            if (err.reason != "missing" && err.reason != 'deleted') {
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

}

let dbManager = new DbManager();
export default dbManager;