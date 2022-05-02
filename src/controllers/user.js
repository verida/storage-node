import UserManager from '../components/userManager';
import DbManager from '../components/dbManager';
import Utils from "../components/utils";
import AuthManager from "../components/authManager"
import Db from "../components/db"

class UserController {

    async generateAuthJwt(req, res) {
        const did = req.body.did;
        const contextName = req.body.contextName;
        const authJwt = AuthManager.generateAuthJwt(did, contextName)

        return res.status(200).send({
            status: "success",
            authJwt
        });
    }
    
    /**
     * Authenticate the user with a signed consent message to obtain a refresh token.
     * 
     * Will automatically create the user if they don't already exist.
     * 
     * Returns a refresh token, access token and database hostname for connections
     * 
     * @param {*} req 
     * @param {*} res 
     * @returns 
     */
    async authenticate(req, res) {
        const authJwt = req.body.authJwt;
        const did = req.body.did;
        const contextName = req.body.contextName;
        const signature = req.body.signature;
        const deviceId = req.body.deviceId;

        // Verify we have a valid signed auth request
        const isValid = AuthManager.verifyAuthRequest(authJwt, did, contextName, signature)
        if (!isValid) {
            return res.status(400).send({
                status: "fail",
                data: {
                    "auth": "Invalid credentials or auth token"
                }
            });
        }

        // Verify the user exists
        const username = Utils.generateUsername(did, contextName);
        const user = await UserManager.getByUsername(username);

        // Create the user if they don't exist
        if (!user) {
            const response = await UserManager.create(username, signature);
            if (!response || !response._id) {
                return res.status(400).send({
                    status: "fail",
                    data: {
                        "auth": "User does not exist and unable to create"
                    }
                })
            }
        }

        // Generate refresh token
        const refreshToken = await AuthManager.generateRefreshToken(did, contextName, deviceId)
        const accessToken = await AuthManager.generateAccessToken(refreshToken, contextName)

        return res.status(200).send({
            status: "success",
            refreshToken,
            accessToken,
            host: Db.buildHost()
        });
    }

    async get(req, res) {
        const refreshToken = req.body.refreshToken;
        const contextName = req.body.contextName;

        const accessToken = await AuthManager.generateAccessToken(refreshToken, contextName);

        if (accessToken) {
            return res.status(200).send({
                status: "success",
                accessToken,
                host: Db.buildHost()    // required to know the CouchDB host
                // username: removed, don't think it is needed
            });
        }
        else {
            return res.status(400).send({
                status: "fail",
                data: {
                    "did": "Invalid refresh token or DID"
                }
            });
        }
    }

    async getPublic(req, res) {
        return res.status(200).send({
            status: "success",
            user: {
                username: process.env.DB_PUBLIC_USER,
                password: process.env.DB_PUBLIC_PASS,
                dsn: UserManager.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS)
            }
        });
    }

    // Grant a user access to a user's database
    // @todo: database name should be in plain text, then hashed
    async createDatabase(req, res) {
        const username = req.tokenData.username
        const did = req.tokenData.did
        const contextName = req.tokenData.contextName
        const databaseName = req.body.databaseName;
        const options = req.body.options ? req.body.options : {};

        const databaseHash = Utils.generateDatabaseName(did, contextName, databaseName)

        let success;
        try {
            success = await DbManager.createDatabase(username, databaseHash, contextName, options);
        } catch (err) {
            return res.status(400).send({
                status: "fail",
                message: err.error + ": " + err.reason
            });
        }

        if (success) {
            return res.status(200).send({
                status: "success"
            });
        }
        else {
            return res.status(400).send({
                status: "fail",
                message: "Unknown error"
            });
        }
    }

    async deleteDatabase(req, res) {
        const did = req.tokenData.did
        const contextName = req.tokenData.contextName
        const databaseName = req.body.databaseName;

        const databaseHash = Utils.generateDatabaseName(did, contextName, databaseName)

        let success;
        try {
            success = await DbManager.deleteDatabase(databaseHash, req.tokenData.username);
        } catch (err) {
            return res.status(400).send({
                status: "fail",
                message: err.error + ": " + err.reason
            });
        }

        if (success) {
            return res.status(200).send({
                status: "success"
            });
        }
        else {
            return res.status(400).send({
                status: "fail",
                message: "Unknown error"
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

        let success;
        try {
            success = await DbManager.updateDatabase(username, databaseHash, contextName, options);
        } catch (err) {
            return res.status(400).send({
                status: "fail",
                message: err.error + ": " + err.reason
            });
        }

        if (success) {
            return res.status(200).send({
                status: "success"
            });
        }
        else {
            return res.status(400).send({
                status: "fail",
                message: "Unknown error"
            });
        }
    }

}

const userController = new UserController();
export default userController;