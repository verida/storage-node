import UserManager from '../components/userManager';
import Utils from "../components/utils";
import AuthManager from "../components/authManager"
import Db from "../components/db"

class AuthController {

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
        const {
            authJwt,
            did,
            contextName,
            signature,
            deviceId
        } = req.body

        // Verify we have a valid signed auth request
        const isValid = await AuthManager.verifyAuthRequest(authJwt, did, contextName, signature)
        if (!isValid) {
            return res.status(401).send({
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
            if (!response || !response.id) {
                return res.status(500).send({
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

    /**
     * Public endpoint
     * 
     * @param {*} req 
     * @param {*} res 
     * @returns 
     */
    async connect(req, res) {
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
            return res.status(401).send({
                status: "fail",
                data: {
                    "did": "Invalid refresh token or DID"
                }
            });
        }
    }

    /**
     * Public endpoint
     * 
     * @param {*} req 
     * @param {*} res 
     * @returns 
     */
    async regenerateRefreshToken(req, res) {
        const refreshToken = req.body.refreshToken;
        const contextName = req.body.contextName;

        const newRefreshToken = await AuthManager.regenerateRefreshToken(refreshToken, contextName);

        if (newRefreshToken) {
            return res.status(200).send({
                status: "success",
                refreshToken: newRefreshToken
            });
        }
        else {
            return res.status(401).send({
                status: "fail",
                data: {
                    "did": "Invalid refresh token or context name"
                }
            });
        }
    }

    /**
     * Public endpoint
     * 
     * @param {*} deviceId 
     * @returns 
     */
    async invalidateDeviceId(req, res) {
        const did = req.body.did;
        const {
            contextName,
            deviceId,
            signature
        } = req.body

        const invalidated = await AuthManager.invalidateDeviceId(did, contextName, deviceId, signature);

        if (invalidated) {
            return res.status(200).send({
                status: "success"
            });
        }
        else {
            return res.status(401).send({
                status: "fail",
                data: {
                    "did": "Invalid refresh token or context name"
                }
            });
        }
    }

    async isTokenValid(req, res) {
        const {
            refreshToken,
            contextName
         } = req.body

         const isValid = await AuthManager.verifyRefreshToken(refreshToken, contextName)

         if (isValid) {
            return res.status(200).send({
                status: "success",
                expires:  isValid.exp
            })
        } else {
            return res.status(401).send({
                status: "fail"
            });
        }
    }

}

const authController = new AuthController();
export default authController;