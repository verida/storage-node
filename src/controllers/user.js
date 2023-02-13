import DbManager from '../components/dbManager.js';
import UserManager from '../components/userManager.js';
import Utils from '../components/utils.js';
import Db from '../components/db.js'
import ReplicationManager from '../components/replicationManager'

class UserController {

    async getPublic(req, res) {
        try {
            return Utils.signedResponse({
                status: "success",
                user: {
                    username: process.env.DB_PUBLIC_USER,
                    password: process.env.DB_PUBLIC_PASS,
                    dsn: Db.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS)
                }
            }, res);
        } catch (err) {
            return res.status(500).send({
                status: "fail",
                message: err.message
            });
        }
    }

    // Grant a user access to a user's database
    async createDatabase(req, res) {
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

        try {
            const userUsage = await UserManager.getUsage(did, contextName)
            if (userUsage.usagePercent >= 100) {
                return res.status(400).send({
                    status: "fail",
                    message: 'Storage limit reached'
                });
            }
        } catch (err) {
            return res.status(500).send({
                status: "fail",
                message: err.message
            })
        }

        const databaseHash = Utils.generateDatabaseName(did, contextName, databaseName)

        let success;
        try {
            success = await DbManager.createDatabase(did, databaseHash, contextName, options);
            if (success) {
                await DbManager.saveUserDatabase(did, contextName, databaseName, databaseHash, options.permissions)

                return Utils.signedResponse({
                    status: "success",
                    databaseHash
                }, res);
            }
        } catch (err) {
            return res.status(400).send({
                status: "fail",
                message: err.message
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

        const databaseHash = Utils.generateDatabaseName(did, contextName, databaseName)

        let success;
        try {
            success = await DbManager.deleteDatabase(databaseHash, username);
            if (success) {
                await DbManager.deleteUserDatabase(did, contextName, databaseName, databaseHash)

                return Utils.signedResponse({
                    status: "success"
                }, res);
            }
        } catch (err) {
            return res.status(500).send({
                status: "fail",
                message: err.message
            });
        }
    }

    async pingDatabases(req, res) {
        const did = req.tokenData.did
        const contextName = req.tokenData.contextName
        const username = req.tokenData.username
        const databaseHashes = req.body.databaseHashes

        console.log(`pingDatabases()`)
        console.log(databaseHashes)

        ReplicationManager.touchDatabases(did, contextName, databaseHashes)
    }

    async deleteDatabases(req, res) {
        const did = req.tokenData.did
        const contextName = req.tokenData.contextName
        const username = req.tokenData.username

        if (!did || !contextName) {
            return res.status(401).send({
                status: "fail",
                message: "Permission denied"
            });
        }

        const databases = await DbManager.getUserDatabases(did, contextName)
        const results = []

        for (let d in databases) {
            const database = databases[d]
            const databaseHash = Utils.generateDatabaseName(did, contextName, database.databaseName)
            try {
                let success = await DbManager.deleteDatabase(databaseHash, username);
                if (success) {
                    await DbManager.deleteUserDatabase(did, contextName, database.databaseName, databaseHash)
                    results.push(database.databaseName)
                }
            } catch (err) {
                return res.status(500).send({
                    status: "fail",
                    message: err.error + ": " + err.reason,
                    results
                });
            }
        };

        return Utils.signedResponse({
            status: "success",
            results
        }, res);
    }

    // Update permissions on a user's database
    async updateDatabase(req, res) {
        const username = req.tokenData.username
        const did = req.tokenData.did
        const contextName = req.tokenData.contextName
        const databaseName = req.body.databaseName;
        const options = req.body.options ? req.body.options : {};

        const databaseHash = Utils.generateDatabaseName(did, contextName, databaseName)

        try {
            const userUsage = await UserManager.getUsage(did, contextName)
            if (userUsage.usagePercent >= 100) {
                return res.status(400).send({
                    status: "fail",
                    message: 'Storage limit reached'
                });
            }

            let success = await DbManager.updateDatabase(did, username, databaseHash, contextName, options);
            if (success) {
                await DbManager.saveUserDatabase(did, contextName, databaseName, databaseHash, options.permissions)

                return Utils.signedResponse({
                    status: "success"
                }, res);
            }
        } catch (err) {
            return res.status(500).send({
                status: "fail",
                message: err.message
            });
        }
    }

    async databases(req, res) {
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
                return Utils.signedResponse({
                    status: "success",
                    result
                }, res)
            }
        } catch (err) {
            return res.status(500).send({
                status: "fail",
                message: err.message
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
                return Utils.signedResponse({
                    status: "success",
                    result
                }, res)
            } else {
                return res.status(404).send({
                    status: "fail",
                    message: "Database not found"
                });
            }
        } catch (err) {
            return res.status(500).send({
                status: "fail",
                message: err.message
            });
        }
    }

    async usage(req, res) {
        const did = req.tokenData.did
        const contextName = req.tokenData.contextName

        if (!did || !contextName) {
            return res.status(401).send({
                status: "fail",
                message: "Permission denied"
            });
        }

        try {
            const result = await UserManager.getUsage(did, contextName)

            return Utils.signedResponse({
                status: "success",
                result
            }, res);
        } catch (err) {
            return res.status(500).send({
                status: "fail",
                message: err.message
            });
        }
    }

    /**
     * This is now deprecated
     * 
     * @todo: Remove
     * 
     * @param {*} req 
     * @param {*} res 
     * @returns 
     */
    async checkReplication(req, res) {
        return Utils.signedResponse({
            status: "success",
            result: {}
        }, res);
    }

}

const userController = new UserController();
export default userController;