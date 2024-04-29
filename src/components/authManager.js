import dotenv from 'dotenv';
import randtoken from 'rand-token';
import jwt from 'jsonwebtoken';
import mcache from 'memory-cache';

import EncryptionUtils from '@verida/encryption-utils';
import Utils from './utils.js';
import Db from './db.js';
import dbManager from './dbManager.js';
import { getResolver } from '@verida/vda-did-resolver';
import { DIDDocument } from '@verida/did-document';
import { Resolver } from 'did-resolver';

const vdaDidResolver = getResolver()
const didResolver = new Resolver(vdaDidResolver)

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
        return this.verifySignedConsentMessage(did, signature, consentMessage)
    }

    async verifySignedConsentMessage(did, signature, consentMessage) {
        // Verify the signature signed the correct string
        try {
            const didDocument = await this.getDidDocument(did)
            if (!didDocument) {
                console.error(`DID not found: ${did}`)
                return false
            }

            const result = didDocument.verifySig(consentMessage, signature)

            if (!result) {
                console.info('Invalid signature when verifying signed consent message')
                return false
            }

            return true
        } catch (err) {
            // Likely unable to resolve DID or invalid signature
            console.info(`Unable to resolve DID or invalid signature: ${err.message}`)
            return false
        }
    }

    /**
     * 
     * @todo: Refactor to use @verida/vda-did-resolver, Ensure signature checks verify context
     * 
     * @param {*} did 
     * @param {*} ignoreCache 
     * @returns 
     */
    async getDidDocument(did, ignoreCache=false) {
        // Verify the signature signed the correct string
        const cacheKey = did

        try {
            let didDocument
            if (!ignoreCache) {
                didDocument = mcache.get(cacheKey)
            }

            if (!didDocument) {
                console.info(`DID document not in cache: ${did}, fetching`)
                
                const response = await didResolver.resolve(did)
                didDocument = new DIDDocument(response.didDocument)

                if (didDocument) {
                    console.info(`Adding DID document to cache: ${did}`)
                    const { DID_CACHE_DURATION }  = process.env
                    mcache.put(cacheKey, didDocument, DID_CACHE_DURATION * 1000)
                }
            }

            return didDocument
        } catch (err) {
            console.info(err)
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
        const validSignature = await this.verifySignedConsentMessage(did, signature, consentMessage)

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
            if (err.name == "JsonWebTokenError" || err.name == "TokenExpiredError") {
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

        try {
            await couch.db.create(process.env.DB_REPLICATER_CREDS)
        } catch (err) {
            if (err.message.match(/already exists/)) {
                // Database already exists
            } else {
                console.error(err)
                throw err
            }
        }

        // Create replication user with access to all databases
        try {
            const userDb = couch.db.use('_users')
            const username = process.env.DB_REPLICATION_USER
            const password = process.env.DB_REPLICATION_PASS
            const id = `org.couchdb.user:${username}`
            const userRow = {
                _id: id,
                name: username,
                password,
                type: "user",
                roles: ['replicater-local']
            }

            await userDb.insert(userRow, userRow._id)

        } catch (err) {
            if (err.error != 'conflict') {
                throw err
            }
        }

        try {
            await couch.db.create('_replicator')
        } catch (err) {
            if (err.message.match(/already exists/)) {
                // Database already exists
            } else {
                console.error(err)
                throw err
            }
        }

        const expiryIndex = {
            index: { fields: ['expiry'] },
            name: 'expiry'
        };

        const replicatorDb = couch.db.use('_replicator');
        await replicatorDb.createIndex(expiryIndex);

        const tokenDb = couch.db.use(process.env.DB_REFRESH_TOKENS);

        const deviceIndex = {
            index: { fields: ['deviceHash'] },
            name: 'deviceHash'
        };

        await tokenDb.createIndex(deviceIndex);
        await tokenDb.createIndex(expiryIndex);
    }

    /**
     * Ensure a replication user exists for a given endpoint
     * 
     * @param {*} endpointUri 
     * @param {*} password 
     * @param {*} replicaterRole 
     * @returns 
     */
    async ensureReplicationCredentials(endpointUri, password, replicaterRole) {
        //console.log(`ensureReplicationCredentials(${endpointUri}, ${password}, ${replicaterRole})`)
        const username = Utils.generateReplicaterUsername(endpointUri)
        const id = `org.couchdb.user:${username}`

        const couch = Db.getCouch('internal');
        const usersDb = await couch.db.use('_users')
        let user
        try {
            user = await usersDb.get(id)

            let userRequiresUpdate = false
            if (user.roles.indexOf(replicaterRole) == -1) {
                //console.log(`User exists, but needs the replicatorRole added (${replicaterRole})`)
                user.roles.push(replicaterRole)
                userRequiresUpdate = true
            }

            // User exists, check if we need to update the password
            if (password) {
                user.password = password
                userRequiresUpdate = true
                //console.log(`User exists and password needs updating`)
            }

            if (userRequiresUpdate) {
                // User exists and we need to update the password or roles
                //console.log(`User exists, updating password and / or roles`)
                
                try {
                    await dbManager._insertOrUpdate(usersDb, user, user._id)
                    return "updated"
                } catch (err) {
                    throw new Error(`Unable to update password: ${err.message}`)
                }
            } else {
                // Nothing needed to change, so respond indicating the user exists
                return "exists"
            }
        } catch (err) {
            if (err.error !== 'not_found') {
                throw err
            }

            // Need to create the user
            try {
                //console.log('Replication user didnt exist, so creating')
                await dbManager._insertOrUpdate(usersDb, {
                    _id: id,
                    name: username,
                    password,
                    type: "user",
                    roles: [replicaterRole]
                }, id)

                return "created"
            } catch (err) {
                throw new Error(`Unable to create replication user: ${err.message}`)
            }
        }
    }

    // Garbage collection of refresh tokens
    async clearExpired() {
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
                try {
                    await tokenDb.destroy(doc._id, doc._rev)
                } catch (err) {
                    if (err.error != 'not_found' && err.error != 'conflict') {
                        console.error(`Unknown error in garbage collection: ${err.message}`)
                    }
                }
            }
        }
    }

}

const authManager = new AuthManager()
export default authManager