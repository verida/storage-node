var assert = require("assert");
require('dotenv').config();
const jwt = require('jsonwebtoken');

import AuthManager from "../src/components/authManager";
import TestUtils from "./utils"

import CONFIG from './config'

const { CONTEXT_NAME } = CONFIG

const DEVICE_1 = "Test Device 1"
const DEVICE_2 = "Test Device 2"

describe("AuthManager tests", function() {

    describe("Authenticate", async function() {
        let authJwt, decodedJwt, DID, account
        let refreshToken, accessToken

        it("Generates AuthJWT", async () => {
            await AuthManager.initDb()

            const response = await TestUtils.connectAccount(CONFIG.VDA_PRIVATE_KEY)
            DID = response.did.toLowerCase()
            account = response.account

            const authData = AuthManager.generateAuthJwt(DID, CONTEXT_NAME)
            authJwt = authData.authJwt
            assert.ok(authJwt, 'Have a token response')
            decodedJwt = jwt.verify(authJwt, process.env.REFRESH_JWT_SIGN_PK)

            assert.equal(DID, decodedJwt.sub, "Subject matches the DID")
            assert.equal(CONTEXT_NAME, decodedJwt.contextName, "Correct context name")
            assert.ok(decodedJwt.authRequestId, "Have a valid auth request ID")

            const now = parseInt((new Date()).getTime() / 1000.0)
            assert.equal(decodedJwt.iat - now <= 1, true, 'JWT created in the last second')
            assert.equal(decodedJwt.exp - now - 60 <= 1, true, 'JWT expires within 60 seconds')
        })

        it("Verifies authorization request", async () => {
            const consentMessage = `Authenticate this application context: "${CONTEXT_NAME}"?\n\n${DID}\n${decodedJwt.authRequestId}`
            const signature = await account.sign(consentMessage)

            const isValid = await AuthManager.verifyAuthRequest(authJwt, DID, CONTEXT_NAME, signature)
            assert.equal(isValid, true, "Valid auth request expected")

            const invalidAuthJwt = await AuthManager.verifyAuthRequest("", DID, CONTEXT_NAME, signature)
            assert.equal(invalidAuthJwt, false, "Missing Auth JWT")

            const invalidAuthJwt2 = await AuthManager.verifyAuthRequest("abc", DID, CONTEXT_NAME, signature)
            assert.equal(invalidAuthJwt2, false, "Invalid Auth JWT")

            const invalidDid = await AuthManager.verifyAuthRequest(authJwt, "", CONTEXT_NAME, signature)
            assert.equal(invalidDid, false, "Invalid DID")

            const invalidContext = await AuthManager.verifyAuthRequest(authJwt, DID, "", signature)
            assert.equal(invalidContext, false, "Invalid context")

            const invalidSignature = await AuthManager.verifyAuthRequest(authJwt, DID, CONTEXT_NAME, "")
            assert.equal(invalidSignature, false, "Invalid signature")
        })

        it("Generates refresh token", async () => {
            refreshToken = await AuthManager.generateRefreshToken(DID, CONTEXT_NAME)
            assert.ok(refreshToken && refreshToken.length, "Refresh token returned")

            const isValid = await AuthManager.verifyRefreshToken(refreshToken, CONTEXT_NAME)
            assert.equal(isValid !== false, true, "Refresh token is valid")

            decodedJwt = jwt.verify(refreshToken, process.env.REFRESH_JWT_SIGN_PK)
            assert.ok(decodedJwt, "Decoded refresh token")

            assert.equal(decodedJwt.contextName, CONTEXT_NAME, "Context name is correct")
            assert.equal(decodedJwt.type, 'refresh', "Correct token type")
        })

        it("Generates access token", async () => {
            accessToken = await AuthManager.generateAccessToken(refreshToken)
            assert.ok(accessToken && accessToken.length, "Access token returned")

            const isValid = await AuthManager.verifyAccessToken(accessToken)
            assert.equal(isValid !== false, true, "Access token is valid")

            decodedJwt = jwt.verify(accessToken, process.env.ACCESS_JWT_SIGN_PK)
            assert.ok(decodedJwt, "Decoded access token")

            assert.equal(decodedJwt.contextName, CONTEXT_NAME, "Context name is correct")
            assert.equal(decodedJwt.type, 'access', "Correct token type")
        })

        it("Regenerates refresh token", async () => {
            const newToken = await AuthManager.regenerateRefreshToken(refreshToken, CONTEXT_NAME)
            assert.ok(newToken && newToken.length, "Refresh token returned")

            const isValid = await AuthManager.verifyRefreshToken(newToken, CONTEXT_NAME)
            assert.equal(isValid !== false, true, "Refresh token is valid")

            const newDecodedJwt = jwt.verify(refreshToken, process.env.REFRESH_JWT_SIGN_PK)
            assert.ok(newDecodedJwt, "Decoded access token")

            assert.equal(newDecodedJwt.contextName, CONTEXT_NAME, "Context name is correct")
            assert.equal(newDecodedJwt.type, 'refresh', "Correct token type")

            const oldIsValid = await AuthManager.verifyRefreshToken(refreshToken, CONTEXT_NAME)
            assert.equal(oldIsValid === false, true, "Previous refresth token has been revoked")
        })

        it("Invalidate refresh token", async () => {
            const token = await AuthManager.generateRefreshToken(DID, CONTEXT_NAME)
            const isValid = await AuthManager.verifyRefreshToken(token)
            assert.ok(isValid, "Generated a valid refresh token")

            const invalidated = await AuthManager.invalidateRefreshToken(token)
            assert.equal(invalidated, true, "Token successfully invalidated")

            const isValid2 = await AuthManager.verifyRefreshToken(token, CONTEXT_NAME)
            assert.equal(isValid2 === false, true, "Token is no longer valid")
        })

        // invalidate refresh tokens for a given device Id (did + context + deviceId)
        it("Invalidate device tokens", async () => {
            const token1 = await AuthManager.generateRefreshToken(DID, CONTEXT_NAME, DEVICE_1)
            let deviceValid1 = await AuthManager.verifyRefreshToken(token1)
            assert.ok(deviceValid1, "Generated a valid refresh token for device 1")

            const token2 = await AuthManager.generateRefreshToken(DID, CONTEXT_NAME, DEVICE_2)
            let deviceValid2 = await AuthManager.verifyRefreshToken(token2)
            assert.ok(deviceValid2, "Generated a valid refresh token for device 2")

            const consentMessage = `Invalidate device for this application context: "${CONTEXT_NAME}"?\n\n${DID}\n${DEVICE_1}`
            const signature = await account.sign(consentMessage)
            const invalidated = await AuthManager.invalidateDeviceId(DID, CONTEXT_NAME, DEVICE_1, signature)
            assert.equal(invalidated, true, "Device invalidated")

            deviceValid1 = await AuthManager.verifyRefreshToken(token1, CONTEXT_NAME)
            assert.equal(deviceValid1 === false, true, "Token for device 1 is no longer valid")

            deviceValid2 = await AuthManager.verifyRefreshToken(token1, CONTEXT_NAME)
            assert.equal(deviceValid2 === false, true, "Token for device 2 is no longer valid")
        })

        // @todo:
        // custom refresh token expiry works
        // refresh token times out
        // access token times out
        // garbage collection
    })
})