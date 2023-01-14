import UserManager from '../components/userManager.js';
import Utils from '../components/utils.js';
import AuthManager from '../components/authManager.js';
import Db from '../components/db.js';
import Axios from 'axios'
import EncryptionUtils from '@verida/encryption-utils';

class AuthController {

    async generateAuthJwt(req, res) {
        const did = req.body.did;
        const contextName = req.body.contextName;
        const authJwt = AuthManager.generateAuthJwt(did, contextName)

        return Utils.signedResponse({
            status: "success",
            authJwt
        }, res);
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
                message: "Invalid credentials or auth token"
            });
        }

        // Verify the user exists
        const username = Utils.generateUsername(did, contextName);
        const user = await UserManager.getByUsername(username);

        // Create the user if they don't exist
        if (!user) {
            try {
                const response = await UserManager.create(username, signature);
                if (!response || !response.id) {
                    return res.status(500).send({
                        status: "fail",
                        data: {
                            "auth": "User does not exist and unable to create"
                        }
                    })
                }
            } catch (err) {
                return res.status(500).send({
                    status: 'fail',
                    message: err.message
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
        const did = req.body.did

        const userUsage = await UserManager.getUsage(did, contextName)
        if (userUsage.usagePercent >= 100) {
            return res.status(400).send({
                status: "fail",
                message: 'Storage limit reached'
            });
        }

        const accessToken = await AuthManager.generateAccessToken(refreshToken, contextName);

        if (accessToken) {
            return res.status(200).send({
                status: "success",
                accessToken,
                host: Db.buildHost()    // required to know the CouchDB host
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
            return Utils.signedResponse({
                status: "success",
                expires:  isValid.exp
            }, res)
        } else {
            return res.status(401).send({
                status: "fail"
            });
        }
    }

    /**
     * Ensure replication credentials exist on the server
     * 
     * If the password is an empty string, will just determine if the user exists or not
     * If the password is not an empty string, it will update the password to match
     * If no user exists, must specify a password
     * 
     * Return status is either:
     * 1. `created` (user created)
     * 2. `updated` (password updated)
     * 3. `exists` (user existed, but password unchanged)
     * 
     * It's essential to ensure the user has the replication role that grants them
     * access to all databases associated with a context
     * 
     * @param {*} req 
     * @param {*} res 
     * @returns 
     */
    async replicationCreds(req, res) {
        const {
            endpointUri,        // endpoint making the request
            did,
            contextName,
            timestampMinutes,
            password,
            signature
        } = req.body
        
        // Verify params
        if (!endpointUri) {
            return Utils.error(res, 'Endpoint not specified')
        }

        if (!timestampMinutes) {
            return Utils.error(res, 'Timestamp not specified')
        }

        // Verify timestampMinutes is within two minutes of now
        const currentTimestampMinutes = Math.floor(Date.now() / 1000 / 60)
        const diff = currentTimestampMinutes - timestampMinutes
        if (diff > 2 || diff < -2) {
            return Utils.error(res, `Timestamp is out of range ${diff}`)
        }

        if (!did) {
            return Utils.error(res, 'DID not specified')
        }

        if (!contextName) {
            return Utils.error(res, 'Context not specified')
        }

        if (!signature) {
            return Utils.error(res, 'Signature not specified')
        }

        // Lookup DID document and confirm endpointUri is a valid endpoint
        let didDocument = await AuthManager.getDidDocument(did)
        if (!didDocument) {
            return Utils.error(res, `Unable to locate DID: ${did}`)
        }

        let endpointService = didDocument.locateServiceEndpoint(contextName, 'database')
        if (!endpointService || !endpointService.serviceEndpoint) {
            // DID document may have recently been updated, so re-fetch
            didDocument = await AuthManager.getDidDocument(did, true)
            if (didDocument) {
                endpointService = didDocument.locateServiceEndpoint(contextName, 'database')
            }

            if (!didDocument || !endpointService || !endpointService.serviceEndpoint) {
                return Utils.error(res, `Invalid context: DID not linked (${did}) to context ${contextName}`)
            }
        }

        const thisHostname = (new URL(Utils.serverUri())).hostname
        const remoteHostname = (new URL(endpointUri)).hostname
        let thisEndpointFound = false
        let remoteEndpointFound = false

        for (let i in endpointService.serviceEndpoint) {
            const endpoint = endpointService.serviceEndpoint[i]
            const hostname = (new URL(endpoint)).hostname

            if (thisHostname == hostname) {
                thisEndpointFound = true
            }

            if (remoteHostname == hostname) {
                remoteEndpointFound = true
            }
        }

        if (!thisEndpointFound) {
            // console.info(`Invalid DID and context: Not associated with this endpoint ${Utils.serverUri()}`)
            return Utils.error(res, `Invalid DID and context: Not associated with this endpoint ${Utils.serverUri()}`)
        }

        if (!remoteEndpointFound) {
            // console.info(`Invalid DID and context: Not associated with remote endpoint ${serverUri}`)
            return Utils.error(res, `Invalid DID and context: Not associated with remote endpoint ${serverUri}`)
        }
        
        // Pull endpoint public key from /status and verify the signature
        let endpointPublicKey
        try {
            // console.log(`auth.replicationCreds(): getting status of requesting endpoint`)
            const response = await Axios.get(`${endpointUri}/status`)

            endpointPublicKey = response.data.results.publicKey
            const params = {
                did,
                contextName,
                endpointUri,
                timestampMinutes,
                password
            }

            if (!password) {
                delete params['password']
            }

            if (!EncryptionUtils.verifySig(params, signature, endpointPublicKey)) {
                return Utils.error(res, 'Invalid signature', 401)
            }
        } catch (err) {
            console.error(`Auth.replicationCreds(): Unknown error: ${err.message}`)
            return Utils.error(res, `Unknown error: ${err.message}`)
        }

        const didContextHash = Utils.generateDidContextHash(did, contextName)
        const replicaterRole = `r${didContextHash}-replicater`
        // console.log(`auth.replicationCreds(): replicaterRole ${replicaterRole}`)

        try {
            const result = await AuthManager.ensureReplicationCredentials(endpointUri, password, replicaterRole)
            // console.log(`auth.replicationCreds(): ensure rep creds`)
            // console.log(result)
            return Utils.signedResponse({
                result
            }, res)
        } catch (err) {
            return Utils.error(res, err.message)
        }
    }

}

const authController = new AuthController();
export default authController;