import dotenv from 'dotenv';
import randtoken from 'rand-token';
import jwt from 'jsonwebtoken';
import mcache from 'memory-cache';

import { DIDClient } from '@verida/did-client'
import EncryptionUtils from '@verida/encryption-utils';
import Utils from './utils.js';
import Db from './db.js';
import dbManager from './dbManager.js';

dotenv.config();

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
            // expires in 1 minute
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
            console.error(`Unable to verify JWT: ${err.message}`)
            throw err
        }

        const consentMessage = `Authenticate this application context: "${contextName}"?\n\n${did}\n${decodedJwt.authRequestId}`
        return this.verifySignedConsentMessage(did, contextName, signature, consentMessage)
    }

    async verifySignedConsentMessage(did, contextName, signature, consentMessage) {
        // Verify the signature signed the correct string
        try {
            const didDocument = await this.getDidDocument(did)
            const result = didDocument.verifySig(consentMessage, signature)

            if (!result) {
                console.info('Invalid signature when verifying signed consent message')
                // Invalid signature
                return false
            }

            return true
        } catch (err) {
            // @todo: Log error
            // Likely unable to resolve DID or invalid signature
            console.info(`Unable to resolve DID or invalid signature: ${err.message}`)
            return false
        }
    }

    async getDidDocument(did) {
        // Verify the signature signed the correct string
        const cacheKey = did

        try {
            let didDocument = mcache.get(cacheKey)

            if (!didDocument) {
                if (!didClient) {
                    const didClientConfig = {
                        network: process.env.DID_NETWORK ? process.env.DID_NETWORK : 'testnet',
                        rpcUrl: process.env.DID_RPC_URL
                      }
          
                      didClient = new DIDClient(didClientConfig);
                }

                didDocument = await didClient.get(did)
                
                // @todo: check if the doc was auto-generated or actually
                // stored on chain? if not on chain, don't cache
                if (didDocument) {
                    const { DID_CACHE_DURATION }  = process.env
                    mcache.put(cacheKey, didDocument, DID_CACHE_DURATION * 1000)
                }
            }

            return didDocument
        } catch (err) {
            // @todo: Log error
            // Likely unable to resolve DID or invalid signature
            console.info(`Unable to resolve DID`)
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
     * @param {*} expiresIn Optional seconds in the future this token expires
     * @returns 
     */
    async generateRefreshToken(did, contextName, deviceId, expiresIn) {
        const requestTokenId = randtoken.generate(256);
        did = did.toLowerCase()

        // Set the token to expire
        if (!expiresIn) {
            expiresIn = parseInt(process.env.REFRESH_TOKEN_EXPIRY)
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
            // how many seconds in the future this expires
            expiresIn
        })

        // Save refresh token in the database
        const couch = Db.getCouch();
        const tokenDb = couch.db.use(process.env.DB_REFRESH_TOKENS);

        const now = parseInt((new Date()).getTime() / 1000.0)
        const tokenRow = {
            _id: requestTokenId,
            deviceHash,
            expiry: (now + expiresIn)
        }

        await tokenDb.insert(tokenRow);

        this.gc()

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
            if (err.name == "JsonWebTokenError" || err.name == "TokenExpiredError") {
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
     * Invalidate a token for a combination of DID, contextName and deviceId.
     * 
     * Note: The deviceId of the fresh token doesn't have to match as it's
     * expected the privateKey will be used to generate this request.
     * 
     * @param {*} did 
     * @param {*} contextName 
     * @param {*} deviceId 
     * @returns 
     */
    async invalidateDeviceId(did, contextName, deviceId, signature) {
        did = did.toLowerCase()
        const consentMessage = `Invalidate device for this application context: "${contextName}"?\n\n${did}\n${deviceId}`
        const validSignature = await this.verifySignedConsentMessage(did, contextName, signature, consentMessage)

        if (!validSignature) {
            return false
        }

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
            return result && result.ok == true
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

        const expiresIn = parseInt(process.env.ACCESS_TOKEN_EXPIRY)

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
            expiresIn
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
        const couch = Db.getCouch('internal');
        try {
            await couch.db.create(process.env.DB_REFRESH_TOKENS)
        } catch (err) {
            if (err.message.match(/already exists/)) {
                // Database already exists
            } else {
                console.error(err)
                throw err
            }
        }

        const tokenDb = couch.db.use(process.env.DB_REFRESH_TOKENS);

        const deviceIndex = {
            index: { fields: ['deviceHash'] },
            name: 'deviceHash'
        };

        const expiryIndex = {
            index: { fields: ['expiry'] },
            name: 'expiry'
        };

        await tokenDb.createIndex(deviceIndex);
        await tokenDb.createIndex(expiryIndex);
    }

    async ensureReplicationCredentials(endpointUri, password) {
        const username = Utils.generateReplicaterUsername(endpointUri)

        const couch = Db.getCouch('internal');
        const usersDb = await couch.db.users('_users')
        let user
        try {
            const id = `org.couchdb.user:${username}`
            user = await usersDb.get(id)
        } catch (err) {
            console.log(err)
            throw err
        }

        if (!user && !password) {
            throw new Error(`Unable to create user: User doesn't exist and no password specified`)
        }

        if (user && password) {
            // Update the password
            user.password = password
            try {
                await dbManager._insertOrUpdate(usersDb, user, user.id)
            } catch (err) {
                console.log(err)
                throw new Error(`Unable to update password: ${err.message}`)
            }
        }
    }

    // @todo: garbage collection
    async gc() {
        const GC_PERCENT = process.env.GC_PERCENT
        const random = Math.random()

        if (random >= GC_PERCENT) {
            // Skip running GC
            return
        }

        // Delete all expired refresh tokens
        const now = parseInt((new Date()).getTime() / 1000.0)
        const query = {
            selector: {
                expiry : { "$lt": now }
            },
            fields: [ "expiry", "_id", "_rev" ],
            limit: 100
        };

        const couch = Db.getCouch();
        const tokenDb = couch.db.use(process.env.DB_REFRESH_TOKENS);
        const tokenRows = await tokenDb.find(query)

        if (tokenRows && tokenRows.docs && tokenRows.docs.length) {
            for (let i in tokenRows.docs) {
                const doc = tokenRows.docs[i]
                const res = await tokenDb.destroy(doc._id, doc._rev)
            }
        }

    }

}

const authManager = new AuthManager()
export default authManager