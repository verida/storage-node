var assert = require("assert");
require('dotenv').config();
const jwt = require('jsonwebtoken');
import Axios from 'axios'

import AuthManager from "../src/components/authManager";
import TestUtils from "./utils"
import Db from "../src/components/db"

import CONFIG from './config'

const { CONTEXT_NAME, SERVER_URL, DEVICE_ID } = CONFIG

let authJwt, accountInfo, authRequestId
let refreshToken, accessToken

describe("Server tests", function() {
    this.beforeAll(async () => {
        await AuthManager.initDb()
        accountInfo = await TestUtils.connectAccount(CONFIG.VDA_PRIVATE_KEY)
    })

    describe("Authenticate", () => {
        it("Generates AuthJWT", async () => {
            const authJwtResult = await Axios.post(`${SERVER_URL}/user/generateAuthJwt`, {
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            });

            assert.ok(authJwtResult && authJwtResult.data && authJwtResult.data.authJwt, "Have authJWT in response")

            authRequestId = authJwtResult.data.authJwt.authRequestId
            authJwt = authJwtResult.data.authJwt.authJwt
        })

        it("Authenticates using AuthJWT", async () => {
            const consentMessage = `Authenticate this application context: "${CONTEXT_NAME}"?\n\n${accountInfo.did}\n${authRequestId}`
            const signature = await accountInfo.account.sign(consentMessage)

            const authenticateResponse = await Axios.post(`${SERVER_URL}/user/authenticate`, {
                authJwt,
                did: accountInfo.did,
                contextName: CONTEXT_NAME,
                signature,
                deviceId: DEVICE_ID
            });

            assert.ok(authenticateResponse && authenticateResponse.data && authenticateResponse.data.refreshToken, "Have refreshToken in response")
            assert.equal(authenticateResponse.data.status, 'success', "Success response")
            assert.ok(authenticateResponse.data.refreshToken.length, "Non zero length refresh token response")

            refreshToken = authenticateResponse.data.refreshToken

            // Also returns a hostname
            assert.ok(authenticateResponse.data.host.length, "Hostname provided")

            // Also returns a valid access token
            assert.ok(authenticateResponse.data.accessToken, "Has an access token")
            const validAccessToken = AuthManager.verifyAccessToken(authenticateResponse.data.accessToken)
            assert.ok(validAccessToken, "Have a valid access token")
        })

        it("Gets user access token", async () => {
            const userResponse = await Axios.post(`${SERVER_URL}/user/get`, {
                refreshToken,
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            });

            assert.ok(userResponse && userResponse.data && userResponse.data.accessToken, "Have refreshToken in response")
            assert.equal(userResponse.data.status, 'success', "Success response")
            assert.ok(userResponse.data.accessToken.length, "Non zero length access token response")
            
            accessToken = userResponse.data.accessToken
        })

        // regenerate refresh token

        // sign out application id
    })

    describe("Database operations", () => {
        
        it("Creates database", async () => {
            const databaseName = "helloooo"

            const response = await Axios.post(`${SERVER_URL}/user/createDatabase`, {
                databaseName,
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            assert.equal(response.data.status, "success", "Successful create response")
        })

        it("Deletes database", async () => {
            const databaseName = "helloooo"

            const response = await Axios.post(`${SERVER_URL}/user/deleteDatabase`, {
                databaseName,
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            assert.equal(response.data.status, "success", "Successful delete response")
        })


    })
})