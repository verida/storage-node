import Utils from './utils.js';
import _ from 'lodash';
import Db from "./db.js"
import dotenv from 'dotenv';
dotenv.config();

class DbManager {

    constructor() {
        this.error = null;
    }

    async getUserDatabaseCouch(did, contextName) {
        const couch = Db.getCouch()
        const didContextHash = Utils.generateDidContextHash(did, contextName)
        const didContextDbName = `c${didContextHash}`
        const username = Utils.generateUsername(did, contextName)

        // Create database for storing all the databases for this user context
        let db
        try {
            await couch.db.create(didContextDbName);
            db = couch.db.use(didContextDbName);

            const replicaterRole = `r${didContextHash}-replicater`

            let securityDoc = {
                admins: {
                    names: [username],
                    roles: []
                },
                members: {
                    names: [username],
                    roles: [replicaterRole, 'replicater-local']
                }
            };

            // Insert security document to ensure owner is the admin and any other read / write users can access the database
            try {
                await this._insertOrUpdate(db, securityDoc, '_security');
            } catch (err) {
                throw new Error('Unable to create user database list database')
            }
        } catch (err) {
            // The didContext database may already exist, or may have been deleted so a file
            // already exists.
            // In that case, ignore the error and continue
            if (err.error != "file_exists") {
                throw err;
            }
        }
        
        return couch.db.use(didContextDbName);
    }

    async saveUserDatabase(did, contextName, databaseName, databaseHash, permissions) {
        const db = await this.getUserDatabaseCouch(did, contextName)
        const id = Utils.generateDatabaseName(did, contextName, databaseName)

        try {
            const result = await this._insertOrUpdate(db, {
                _id: id,
                did,
                contextName,
                databaseName,
                databaseHash,
                permissions: permissions ? permissions : {}
            }, id)
        } catch (err) {
            // It's possible the replication of the database list has already
            // replicated this database entry causing a document update conflict
            if (err.error != 'conflict') {
                // If not a conflict, raise the error
                throw err
            }
        }
    }

    async getUserDatabases(did, contextName) {
        try {
            const db = await this.getUserDatabaseCouch(did, contextName)
            const result = await db.list({include_docs: true, limit: 1000})
            const finalResult = result.rows.map((item) => {
                delete item.doc['_id']
                delete item.doc['_rev']

                return item.doc
            })

            return finalResult
        } catch (err) {
            if (err.reason != 'missing' && err.error != 'not_found') {
                throw err;
            }

            return []
        }
    }

    async getUserDatabase(did, contextName, databaseName) {
        const couch = Db.getCouch()
        const didContextHash = Utils.generateDidContextHash(did, contextName)
        const didContextDbName = `c${didContextHash}`
        const db = couch.db.use(didContextDbName)

        const id = Utils.generateDatabaseName(did, contextName, databaseName)

        try {
            const doc = await db.get(id)
            const userDb = couch.use(doc.databaseHash)
            const info = await userDb.info()

            const result = {
                did,
                contextName,
                databaseName,
                permissions: doc.permissions,
                info
            }

            return result
        } catch (err) {
            if (err.reason == 'missing' || err.reason == 'deleted') {
                return false
            }

            throw err
        }
    }

    async deleteUserDatabase(did, contextName, databaseName) {
        const couch = Db.getCouch()
        const didContextHash = Utils.generateDidContextHash(did, contextName)
        const didContextDbName = `c${didContextHash}`
        const db = couch.db.use(didContextDbName)

        const id = Utils.generateDatabaseName(did, contextName, databaseName)

        try {
            await this._insertOrUpdate(db, {
                _id: id,
                _deleted: true
            }, id)
        } catch (err) {
            throw err
        }
    }

    async createDatabase(did, databaseHash, contextName, options) {
        let couch = Db.getCouch();
        const username = Utils.generateUsername(did, contextName)

        // Create database
        try {
            await couch.db.create(databaseHash);
        } catch (err) {
            // The database may already exist, or may have been deleted so a file
            // already exists.
            // In that case, ignore the error and continue
            if (err.error != "file_exists") {
                throw err;
            }
        }

        let db = couch.db.use(databaseHash);

        try {
            await this.configurePermissions(did, db, username, contextName, options.permissions);
        } catch (err) {
            //console.log("configure error");
            //console.log(err);
        }

        return true;
    }

    async updateDatabase(did, username, databaseHash, contextName, options) {
        const couch = Db.getCouch();
        const db = couch.db.use(databaseHash);

        // Do a sanity check to confirm the username is an admin of the database
        const perms = await couch.request({db: databaseHash, method: 'get', path: '/_security'})
        const usernameIsAdmin = perms.admins.names.includes(username)

        if (!usernameIsAdmin) {
            return false
        }

        try {
            await this.configurePermissions(did, db, username, contextName, options.permissions);
        } catch (err) {
            //console.log("update database error");
            //console.log(err);
        }

        return true;
    }

    async deleteDatabase(databaseHash, username) {
        const couch = Db.getCouch();

        // Do a sanity check to confirm the username is an admin of the database
        const perms = await couch.request({db: databaseHash, method: 'get', path: '/_security'})
        const usernameIsAdmin = perms.admins.names.includes(username)

        if (!usernameIsAdmin) {
            return false
        }

        // Create database
        try {
            return await couch.db.destroy(databaseHash);
        } catch (err) {
            // The database may already exist, or may have been deleted so a file
            // already exists.
            // In that case, ignore the error and continue
            //console.log(err);
        }
    }

    async configurePermissions(did, db, username, contextName, permissions) {
        try {
            permissions = permissions ? permissions : {};

            let owner = username;

            // Database owner always has full permissions
            let writeUsers = [owner];
            let readUsers = [owner];
            let deleteUsers = [owner];

            switch (permissions.write) {
                case "users":
                    writeUsers = _.union(writeUsers, Utils.didsToUsernames(permissions.writeList, contextName));
                    deleteUsers = _.union(deleteUsers, Utils.didsToUsernames(permissions.deleteList, contextName));
                    break;
                case "public":
                    writeUsers = writeUsers.concat([process.env.DB_PUBLIC_USER]);
                    break;
            }

            switch (permissions.read) {
                case "users":
                    readUsers = _.union(readUsers, Utils.didsToUsernames(permissions.readList, contextName));
                    break;
                case "public":
                    readUsers = readUsers.concat([process.env.DB_PUBLIC_USER]);
                    break;
            }

            const dbMembers = _.union(readUsers, writeUsers);
            const didContextHash = Utils.generateDidContextHash(did, contextName)
            const replicaterRole = `r${didContextHash}-replicater`

            let securityDoc = {
                admins: {
                    names: [owner],
                    roles: []
                },
                members: {
                    // this grants read access to all members
                    names: dbMembers,
                    roles: [replicaterRole, 'replicater-local']
                }
            };

            // Insert security document to ensure owner is the admin and any other read / write users can access the database
            try {
                await this._insertOrUpdate(db, securityDoc, '_security');
            } catch (err) {
                console.error(`Unable to update _security document for ${did}: ${err.message}`)
                return false;
            }

            // Create validation document so only owner users in the write list can write to the database
            let writeUsersJson = JSON.stringify(writeUsers);
            let deleteUsersJson = JSON.stringify(deleteUsers);

            try {
                const writeFunction = `\n    function(newDoc, oldDoc, userCtx, secObj) {\n        if (${writeUsersJson}.indexOf(userCtx.name) == -1 && userCtx.roles.indexOf('${replicaterRole}') == -1) throw({ unauthorized: 'User is not permitted to write to database' });\n}`;
                const writeDoc = {
                    "validate_doc_update": writeFunction
                };

                await this._insertOrUpdate(db, writeDoc, '_design/only_permit_write_users');
            } catch (err) {
                console.error(`Unable to update only_permit_write_users document for ${did}: ${err.message}`)
                // CouchDB throws a document update conflict without any obvious reason
                if (err.reason !== "Document update conflict.") {
                    throw err;
                }
            }

            if (permissions.write === "public") {
                // If the public has write permissions, disable public from deleting records
                try {
                    const deleteFunction = `\n    function(newDoc, oldDoc, userCtx, secObj) {\n        if (${deleteUsersJson}.indexOf(userCtx.name) == -1 && userCtx.roles.indexOf('${replicaterRole}') == -1 && newDoc._deleted) throw({ unauthorized: 'User is not permitted to delete from database' });\n}`;
                    const deleteDoc = {
                        "validate_doc_update": deleteFunction
                    };

                    await this._insertOrUpdate(db, deleteDoc, '_design/disable_public_delete');
                } catch (err) {
                    console.error(`Unable to update validate_doc_update document for ${did}: ${err.message}`)
                    // CouchDB throws a document update conflict without any obvious reason
                    if (err.reason != "Document update conflict.") {
                        throw err;
                    }
                }
            }

            return true;
        } catch (err) {
            console.log(err)
            return false
        }
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
            return await db.insert(newDoc);
        } else {
            return await db.insert(newDoc, id);
        }
    }

}

let dbManager = new DbManager();
export default dbManager;