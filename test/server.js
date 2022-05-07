var assert = require("assert");
require('dotenv').config();
const jwt = require('jsonwebtoken');
import Axios from 'axios'

import AuthManager from "../src/components/authManager";
import UserManager from "../src/components/userManager";
import TestUtils from "./utils"

import CONFIG from './config'

const { CONTEXT_NAME, SERVER_URL, TEST_DEVICE_ID } = CONFIG

let authJwt, accountInfo, authRequestId
let refreshToken, accessToken, newRefreshToken

describe("Server tests", function() {
    this.beforeAll(async () => {
        await AuthManager.initDb()
        accountInfo = await TestUtils.connectAccount(CONFIG.VDA_PRIVATE_KEY)
    })

    describe("Authenticate", () => {
        it("Generates AuthJWT", async () => {
            const authJwtResult = await Axios.post(`${SERVER_URL}/auth/generateAuthJwt`, {
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            });

            assert.ok(authJwtResult && authJwtResult.data && authJwtResult.data.authJwt, "Have authJWT in response")

            authRequestId = authJwtResult.data.authJwt.authRequestId
            authJwt = authJwtResult.data.authJwt.authJwt
        })

        it("Authenticates using AuthJWT", async () => {
            const consentMessage = `Authenticate this application context: "${CONTEXT_NAME}"?\n\n${accountInfo.did.toLowerCase()}\n${authRequestId}`
            const signature = await accountInfo.account.sign(consentMessage)

            const authenticateResponse = await Axios.post(`${SERVER_URL}/auth/authenticate`, {
                authJwt,
                did: accountInfo.did,
                contextName: CONTEXT_NAME,
                signature,
                deviceId: TEST_DEVICE_ID
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

        it("Connect a user", async () => {
            const userResponse = await Axios.post(`${SERVER_URL}/auth/connect`, {
                refreshToken,
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            });

            assert.ok(userResponse && userResponse.data && userResponse.data.accessToken, "Have refreshToken in response")
            assert.equal(userResponse.data.status, 'success', "Success response")
            assert.ok(userResponse.data.accessToken.length, "Non zero length access token response")
            
            accessToken = userResponse.data.accessToken
        })

        it("Regenerates refresh token", async () => {
            const response = await Axios.post(`${SERVER_URL}/auth/regenerateRefreshToken`, {
                refreshToken,
                contextName: CONTEXT_NAME
            });

            assert.ok(response && response.data && response.data.refreshToken, "New refresh token returned")
            newRefreshToken = response.data.refreshToken
            
            const userResponse = await Axios.post(`${SERVER_URL}/auth/connect`, {
                refreshToken: newRefreshToken,
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            });

            assert.ok(userResponse, "New refresh token can make valid request")
        })

        it("Invalidate device tokens", async () => {
            const consentMessage = `Invalidate device for this application context: "${CONTEXT_NAME}"?\n\n${accountInfo.did.toLowerCase()}\n${TEST_DEVICE_ID}`
            const signature = await accountInfo.account.sign(consentMessage)
            
            const response = await Axios.post(`${SERVER_URL}/auth/invalidateDeviceId`, {
                did: accountInfo.did,
                contextName: CONTEXT_NAME,
                deviceId: TEST_DEVICE_ID,
                signature
            });

            assert.equal(response.data.status, 'success', 'Successfull device invalidation response from server')

            const pendingConnect = new Promise((resolve, rejects) => {
                const request = Axios.post(`${SERVER_URL}/auth/connect`, {
                    refreshToken: newRefreshToken,
                    did: accountInfo.did,
                    contextName: CONTEXT_NAME
                });

                request.then((res) => {
                    // Valid response, which is unexpected
                    resolve(false)
                }).catch((err) => {
                    if (err.response.data.status == 'fail') {
                        resolve(true)
                    }

                    resolve(false)
                }) 
            })

            const connectResult = await pendingConnect

            assert.ok(connectResult, 'Unable to use device refresh token')
        })

        // check timeouts?
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