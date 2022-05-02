import UserManager from '../components/userManager';
import DbManager from '../components/dbManager';
import Utils from "../components/utils";
import AuthManager from "../components/authManager"

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
     * Authenticate the user with a signed consent message to obtain a refresh token
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

        if (!user) {
            return res.status(400).send({
                status: "fail",
                data: {
                    "did": "Invalid user"
                }
            });
        }

        // Generate refresh token
        const refreshToken = await AuthManager.generateRefreshToken(did, contextName, deviceId)
        return res.status(200).send({
            status: "success",
            refreshToken
        });
    }

    async get(req, res) {
        const refreshToken = req.body.refreshToken;
        const did = req.body.did;
        const accessToken = AuthManager.generateAccessToken(did, refreshToken);

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

    async create(req, res) {
        let username = Utils.generateUsernameFromRequest(req);
        let signature = req.auth.password;

        // If user exists, simply return it
        let user = await UserManager.getByUsername(username, signature);
        if (user) {
            return res.status(400).send({
                status: "fail",
                code: 100,
                data: {
                    "did": "User already exists"
                }
            });
        }

        let response = await UserManager.create(username, signature);

        if (response.ok) {
            user = await UserManager.getByUsername(username, signature);
        }

        if (user) {
            return res.status(200).send({
                status: "success",
                user: user
            });
        }
        else {
            return res.status(400).send({
                status: "fail",
                code: 100,
                data: {
                    "did": "Unable to locate created user"
                }
            });
        }
    }

    // Grant a user access to a user's database
    async createDatabase(req, res) {
        let username = Utils.generateUsernameFromRequest(req);
        let databaseName = req.body.databaseName;
        let options = req.body.options ? req.body.options : {};

        let success;
        try {
            success = await DbManager.createDatabase(username, databaseName, req.headers['application-name'], options);
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
    async updateDatabase(req, res) {
        let username = Utils.generateUsernameFromRequest(req);
        let databaseName = req.body.databaseName;
        let options = req.body.options ? req.body.options : {};

        let success;
        try {
            success = await DbManager.updateDatabase(username, databaseName, req.headers['application-name'], options);
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