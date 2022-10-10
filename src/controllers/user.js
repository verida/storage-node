import DbManager from '../components/dbManager';
import Utils from "../components/utils";
import Db from "../components/db"

class UserController {

    async getPublic(req, res) {
        return res.status(200).send({
            status: "success",
            user: {
                username: process.env.DB_PUBLIC_USER,
                password: process.env.DB_PUBLIC_PASS,
                dsn: Db.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS)
            }
        });
    }

    // Grant a user access to a user's database
    async createDatabase(req, res) {
        const username = req.tokenData.username
        const did = req.tokenData.did
        const contextName = req.tokenData.contextName
        const databaseName = req.body.databaseName;
        const options = req.body.options ? req.body.options : {};

        if (!databaseName) {
            return res.status(400).send({
                status: "fail",
                message: "Database must be specified"
            });
        }

        if (!did || !contextName) {
            return res.status(401).send({
                status: "fail",
                message: "Permission denied"
            });
        }

        const databaseHash = Utils.generateDatabaseName(did, contextName, databaseName)

        let success;
        try {
            success = await DbManager.createDatabase(username, databaseHash, contextName, options);
            if (success) {
                await DbManager.saveUserDatabase(did, contextName, databaseName, databaseHash, options.permissions)

                return res.status(200).send({
                    status: "success"
                });
            }
        } catch (err) {
            return res.status(400).send({
                status: "fail",
                message: err.error + ": " + err.reason
            });
        }
    }

    async deleteDatabase(req, res) {
        const did = req.tokenData.did
        const contextName = req.tokenData.contextName
        const databaseName = req.body.databaseName;
        const username = req.tokenData.username

        if (!databaseName) {
            return res.status(400).send({
                status: "fail",
                message: "Database must be specified"
            });
        }

        if (!did || !contextName) {
            return res.status(401).send({
                status: "fail",
                message: "Permission denied"
            });
        }

        const databaseHash = Utils.generateDatabaseName(did, contextName, databaseName)

        let success;
        try {
            success = await DbManager.deleteDatabase(databaseHash, username);
            if (success) {
                await DbManager.deleteUserDatabase(did, contextName, databaseName, databaseHash)

                return res.status(200).send({
                    status: "success"
                });
            }
        } catch (err) {
            return res.status(500).send({
                status: "fail",
                message: err.error + ": " + err.reason
            });
        }
    }

    // Update permissions on a user's database
    // @todo: database name should be in plain text, then hashed
    async updateDatabase(req, res) {
        const username = req.tokenData.username
        const did = req.tokenData.did
        const contextName = req.tokenData.contextName
        const databaseName = req.body.databaseName;
        const options = req.body.options ? req.body.options : {};

        const databaseHash = Utils.generateDatabaseName(did, contextName, databaseName)

        try {
            let success = await DbManager.updateDatabase(username, databaseHash, contextName, options);
            if (success) {
                await DbManager.saveUserDatabase(did, contextName, databaseName, databaseHash, options.permissions)

                return res.status(200).send({
                    status: "success"
                });
            }
        } catch (err) {
            return res.status(500).send({
                status: "fail",
                message: err.error + ": " + err.reason
            });
        }
    }

    async databases(req, res) {
        const databaseName = req.body.databaseName;
        const did = req.tokenData.did
        const contextName = req.tokenData.contextName

        if (!did || !contextName) {
            return res.status(401).send({
                status: "fail",
                message: "Permission denied"
            });
        }

        try {
            const result = await DbManager.getUserDatabases(did, contextName)
            if (result) {
                return res.status(200).send({
                    status: "success",
                    result
                });
            }
        } catch (err) {
            return res.status(500).send({
                status: "fail",
                message: err.error + ": " + err.reason
            });
        }
    }

    async databaseInfo(req, res) {
        const databaseName = req.body.databaseName;
        const did = req.tokenData.did
        const contextName = req.tokenData.contextName

        if (!databaseName) {
            return res.status(400).send({
                status: "fail",
                message: "Database must be specified"
            });
        }

        if (!did || !contextName) {
            return res.status(401).send({
                status: "fail",
                message: "Permission denied"
            });
        }

        try {
            const result = await DbManager.getUserDatabase(did, contextName, databaseName)

            if (result) {
                return res.status(200).send({
                    status: "success",
                    result
                });
            } else {
                return res.status(404).send({
                    status: "fail",
                    message: "Database not found"
                });
            }
        } catch (err) {
            return res.status(500).send({
                status: "fail",
                message: err.error + ": " + err.reason
            });
        }
    }

}

const userController = new UserController();
export default userController;