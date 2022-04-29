require('dotenv').config();
const randtoken = require('rand-token');
const jwt = require('jsonwebtoken');
import { DIDClient } from '@verida/did-client'
const mcache = require("memory-cache")

let didClient

//import Utils from "./utils";

class AuthManager {

    generateAuthJwt(did, contextName) {
        const authRequestId = randtoken.generate(256);
        const authJwt = jwt.sign({
            sub: did,
            contextName,
            authRequestId
            
        }, process.env.TOKEN_JWT_SIGN_PK, {
            // expies in 1 minute
            expiresIn: 60
        })

        return authJwt;
    }

    async verifyAuthRequest(authJwt, did, contextName, signature) {
        // verify authJwt is valid
        let decodedJwt
        try {
            decodedJwt = jwt.verify(authJwt, process.env.TOKEN_JWT_SIGN_PK, {
                subject: did
            })
        } catch (err) {
            // Handle invalid JWT by rejecting verification
            if (err.name == "JsonWebTokenError") {
                return false
            }
            
            // Throw unknown error
            throw err
        }

        // Verify the signature
        const cacheKey = `${did}/${contextName}`
        try {
            let didDocument = mcache.get(cacheKey)

            if (!didDocument) {
                if (!didClient) {
                    const { DID_SERVER_URL }  = process.env
                    didClient = new DIDClient(DID_SERVER_URL)
                }

                didDocument = await didClient.get(did)

                if (!didDocument) {
                    return false
                }

                if (didDocument) {
                    const { DID_CACHE_DURATION }  = process.env
                    mcache.put(cacheKey, didDocument, DID_CACHE_DURATION * 1000)
                }
            }

            const consentMessage = `Authenticate this application context: "${contextName}"?\n\n${did}\n${decodedJwt.authRequestId}`
            const result = didDocument.verifySig(consentMessage, signature)

            if (!result) {
                return false
            }

            return true
        } catch (err) {
            // @todo: Log error
            // Likely unable to resolve DID or invalid signature
            return false
        }
    }

    async generateRefreshToken(did, contextName) {
        // generate request token
        const requestTokenId = randtoken.generate(256);
        const token = jwt.sign({
            sub: did,
            contextName,
        }, env.COUCHDB_JWT_SIGN_PK, {
            // expiry in minutes for this token
            expiresIn: 60 * env.JWT_SIGN_EXPIRY
        })
    }

}

const authManager = new AuthManager()
export default authManager