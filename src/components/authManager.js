require('dotenv').config();
const randtoken = require('rand-token');
const jwt = require('jsonwebtoken');
const mcache = require("memory-cache")

import { DIDClient } from '@verida/did-client'
import EncryptionUtils from '@verida/encryption-utils';
import Utils from "./utils";
import Db from "./db";

let didClient

class AuthManager {

    /**
     * Generates a pre authorization JWT that must be signed by the 
     * DID to authenticate.
     * 
     * This avoid replay attacks.
     * 
     * @param {*} did 
     * @param {*} contextName 
     * @returns 
     */
    generateAuthJwt(did, contextName) {
        did = did.toLowerCase()
        const authRequestId = randtoken.generate(256);
        const authJwt = jwt.sign({
            sub: did,
            contextName,
            authRequestId
            
        }, process.env.REFRESH_JWT_SIGN_PK, {
            // expies in 1 minute
            expiresIn: 60
        })

        return {
            authRequestId,
            authJwt
        }
    }

    /**
     * Verify an authorization request has supplied a valid authorization JWT
     * and correctly signed the expected string using a valid signature that
     * matches the DID's public key.
     * 
     * @param {*} authJwt 
     * @param {*} did 
     * @param {*} contextName 
     * @param {*} signature 
     * @returns 
     */
    async verifyAuthRequest(authJwt, did, contextName, signature) {
        did = did.toLowerCase()

        // verify authJwt is valid
        let decodedJwt
        try {
            decodedJwt = jwt.verify(authJwt, process.env.REFRESH_JWT_SIGN_PK, {
                sub: did,
                contextName
            })
        } catch (err) {
            // Handle invalid JWT by rejecting verification
            if (err.name == "JsonWebTokenError") {
                return false
            }
            
            // Throw unknown error
            throw err
        }

        // Verify the signature signed the correct string
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

    /**
     * Generate a refresh token.
     * 
     * Each token is linked to a specific device which allows the owner to easily
     * invalidate any refresh tokens gratned to a specific device.
     * 
     * @param {*} did DID that is authorized
     * @param {*} contextName Context name that is authorized
     * @param {*} requestTokenId Optional token ID (used when regenerating a refresh token)
     * @param {*} expiry Optional unix epoch for when the token should expire
     * @returns 
     */
    async generateRefreshToken(did, contextName, deviceId, expiry) {
        const requestTokenId = randtoken.generate(256);
        did = did.toLowerCase()

        // Set the token to expire
        if (!expiry) {
            expiry = parseInt(process.env.REFRESH_TOKEN_EXPIRY)
        }

        const deviceHash = EncryptionUtils.hash(`${did}/${contextName}/${deviceId}`)

        const tokenContent = {
            id: requestTokenId,
            deviceId,
            sub: did,
            contextName,
            type: 'refresh'
        }

        const token = jwt.sign(tokenContent, process.env.REFRESH_JWT_SIGN_PK, {
            // expiry in minutes for this token
            expiresIn: expiry
        })

        // Save refresh token in the database
        const couch = Db.getCouch();
        const tokenDb = couch.db.use(process.env.DB_REFRESH_TOKENS);

        const tokenRow = {
            _id: requestTokenId,
            deviceHash,
            expiry
        }

        await tokenDb.insert(tokenRow);

        return token
    }

    /**
     * Verify a refresh token is valid:
     * 
     * - JWT is valid (private key matches, hasn't expired etc.)
     * - Is of type `refresh` token
     * - Has a valid entry in the refresh token database
     * 
     * @param {*} refreshToken 
     * @returns The decoded JWT
     */
    async verifyRefreshToken(refreshToken, contextName) {
        const verifyData = {
            type: 'refresh'
        }

        if (contextName) {
            verifyData.contextName = contextName
        }

        // verify refreshToken is valid
        let decodedJwt
        try {
            decodedJwt = jwt.verify(refreshToken, process.env.REFRESH_JWT_SIGN_PK, verifyData)
        } catch (err) {
            // Handle invalid JWT by rejecting verification
            if (err.name == "JsonWebTokenError") {
                return false
            }
            
            // Throw unknown error
            throw err
        }

        // check this refresh token is in the database (hasn't been invalidated)
        const couch = Db.getCouch();
        const tokenDb = couch.db.use(process.env.DB_REFRESH_TOKENS);

        try {
            const tokenRow = await tokenDb.get(decodedJwt.id);
        } catch (err) {
            if (err.message == "deleted") {
                // Token deleted, so no longer valid
                return false
            }

            throw err
        }
        return decodedJwt
    }

    async regenerateRefreshToken(refreshToken, contextName) {
        const decodedJwt = await this.verifyRefreshToken(refreshToken, contextName)
        if (!decodedJwt) {
            return false;
        }

        await this.invalidateRefreshToken(refreshToken)
        const newRefreshToken = await this.generateRefreshToken(decodedJwt.sub, decodedJwt.contextName, decodedJwt.deviceId)

        return newRefreshToken
    }

    async invalidateRefreshToken(refreshToken) {
        const decodedJwt = await this.verifyRefreshToken(refreshToken)

        if (!decodedJwt) {
            return false;
        }

        const couch = Db.getCouch();
        const tokenDb = couch.db.use(process.env.DB_REFRESH_TOKENS);

        try {
            const tokenRow = await tokenDb.get(decodedJwt.id);
            await tokenDb.destroy(tokenRow._id, tokenRow._rev);

            return true;
        } catch (err) {
            if (err.message == "deleted") {
                // Token deleted, so no longer valid
                return false
            }

            throw err
        }
    }

    /**
     * Invalidate a token for a combination of DID, contextName and deviceId
     * 
     * @param {*} did 
     * @param {*} contextName 
     * @param {*} deviceId 
     * @returns 
     */
    async invalidateDeviceId(did, contextName, deviceId) {
        const deviceHash = EncryptionUtils.hash(`${did}/${contextName}/${deviceId}`)
        const query = {
            selector: {
                deviceHash
            },
            fields: [ "deviceHash" , "_id", "_rev" ]
        };

        const couch = Db.getCouch();
        const tokenDb = couch.db.use(process.env.DB_REFRESH_TOKENS);
        const tokenRows = await tokenDb.find(query)

        if (!tokenRows || !tokenRows.docs.length) {
            return false
        }

        for (let i in tokenRows.docs) {
            const tokenRow = tokenRows.docs[i]
            const result = await tokenDb.destroy(tokenRow._id, tokenRow._rev);
            // @todo: log wrarning if result.ok != true
        }

        return true;
    }

    /**
     * Genereate an access token for a refresh token
     * 
     * @param {*} did 
     * @param {*} refreshToken 
     * @param {*} contextName optionally verify the refresh token matches the provided `contextName`
     * @returns 
     */
    async generateAccessToken(refreshToken, contextName) {
        const decodedJwt = await this.verifyRefreshToken(refreshToken, contextName)
        if (!decodedJwt) {
            return false;
        }
        
        const username = Utils.generateUsername(decodedJwt.sub.toLowerCase(), decodedJwt.contextName);

        const expiry = parseInt(process.env.ACCESS_TOKEN_EXPIRY)

        // generate new request token
        const requestTokenId = randtoken.generate(256);
        const token = jwt.sign({
            id: requestTokenId,
            did: decodedJwt.sub,
            sub: username,
            contextName: decodedJwt.contextName,
            type: 'access'
        }, process.env.ACCESS_JWT_SIGN_PK, {
            // expiry in seconds for this token
            expiresIn: expiry
        })

        return token
    }

    /**
     * Verify an access token is valid
     * 
     * @param {*} accessToken 
     * @returns 
     */
    verifyAccessToken(accessToken) {
        let decodedJwt
        try {
            decodedJwt = jwt.verify(accessToken, process.env.ACCESS_JWT_SIGN_PK, {
                type: 'access'
            })
        } catch (err) {
            // Handle invalid JWT by rejecting verification
            if (err.name == "JsonWebTokenError") {
                return false
            }
            
            // Throw unknown error
            throw err
        }

        return decodedJwt
    }

    async initDb() {
        const couch = Db.getCouch();

        try {
            await couch.db.create(process.env.DB_REFRESH_TOKENS)
        } catch (err) {
            if (err.message.match(/already exists/)) {
                // Database already exists
            } else {
                throw err
            }
        }

        const tokenDb = couch.db.use(process.env.DB_REFRESH_TOKENS);

        const indexDef = {
            index: { fields: ['deviceHash'] },
            name: 'deviceHash'
        };

        const response = await tokenDb.createIndex(indexDef);
    }

    // @todo: garbage collection

}

const authManager = new AuthManager()
export default authManager