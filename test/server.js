import assert from 'assert';

import Axios from 'axios'

import AuthManager from "../src/components/authManager";
import TestUtils from "./utils"

import CONFIG from './config'

import dotenv from 'dotenv';
dotenv.config();

const { CONTEXT_NAME, SERVER_URL, TEST_DEVICE_ID } = CONFIG

let authJwt, accountInfo, authRequestId
let refreshToken, accessToken, newRefreshToken

// NOTE: These tests fail if the CONFIG.PRIVATE_KEY hasn't been already setup with a valid Verida DID Document
// Run `yarn run test test/vda-did` to generate a new private key with a valid DID in `verida-js/vda-did`

describe("Server tests", function() {
    this.beforeAll(async () => {
        //await AuthManager.initDb() -- This is required if the server is running locally and has never been run before, run just once
        await TestUtils.ensureVeridaAccount(CONFIG.VDA_PRIVATE_KEY) // -- This is required if the private key has never been initilaized with an application context, run just once
        accountInfo = await TestUtils.connectAccount(CONFIG.VDA_PRIVATE_KEY)
    })

    describe("Authenticate", () => {
        it("Generates AuthJWT", async () => {
            try {
                const authJwtResult = await Axios.post(`${SERVER_URL}/auth/generateAuthJwt`, {
                    did: accountInfo.did,
                    contextName: CONTEXT_NAME
                });

                assert.ok(authJwtResult && authJwtResult.data && authJwtResult.data.authJwt, "Have authJWT in response")

                authRequestId = authJwtResult.data.authJwt.authRequestId
                authJwt = authJwtResult.data.authJwt.authJwt
            } catch (err) {
                console.log(err.response.data)
                assert.fail(err.message)
            }
        })

        // If running the tests against a remote server with a different access token JWT private key, this test will fail
        // because it uses the private key on this local server config for verification of the access token
        it("Authenticates using AuthJWT", async () => {
            const consentMessage = `Authenticate this application context: "${CONTEXT_NAME}"?\n\n${accountInfo.did.toLowerCase()}\n${authRequestId}`
            const signature = await accountInfo.account.sign(consentMessage)

            const authenticateResponse = await Axios.post(`${SERVER_URL}/auth/authenticate`, {
                authJwt,
                did: accountInfo.did,
                contextName: CONTEXT_NAME,
                signature,
                deviceId: TEST_DEVICE_ID
            })

            assert.ok(authenticateResponse && authenticateResponse.data && authenticateResponse.data.refreshToken, "Have refreshToken in response")
            assert.equal(authenticateResponse.data.status, 'success', "Success response")
            assert.ok(authenticateResponse.data.refreshToken.length, "Non zero length refresh token response")

            refreshToken = authenticateResponse.data.refreshToken

            // Also returns a hostname
            assert.ok(authenticateResponse.data.host.length, "Hostname provided")

            // Also returns a valid access token
            assert.ok(authenticateResponse.data.accessToken, "Has an access token")

            if (authenticateResponse.data.host.match('localhost')) {
                const validAccessToken = AuthManager.verifyAccessToken(authenticateResponse.data.accessToken)
                assert.ok(validAccessToken, "Have a valid access token")
            }
        })

        it("Verifies refresh tokens", async () => {
            const authenticateResponse = await Axios.post(`${SERVER_URL}/auth/isTokenValid`, {
                refreshToken,
                contextName: CONTEXT_NAME,
            });

            assert.ok(authenticateResponse.data.status, 'success', 'Token is valid')
            assert.ok(authenticateResponse.data.expires, 'Token has valid expiry')

            const pending = new Promise((resolve) => {
                const request = Axios.post(`${SERVER_URL}/auth/isTokenValid`, {
                    refreshToken: refreshToken + '-',
                    contextName: CONTEXT_NAME,
                })

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

            const result = await pending
            assert.ok(result, 'Token is invalid')
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

            assert.equal(response.data.status, 'success', 'Successful device invalidation response from server')

            const pendingConnect = new Promise((resolve) => {
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

        // @todo: check timeouts working as expected
    })

    describe("Database operations", () => {
        const databaseName = "helloooo"
        const databaseName2 = "helloooo2"
        
        it("Creates database", async () => {
            const response = await TestUtils.createDatabase(databaseName, accountInfo.did, CONTEXT_NAME, accessToken)
            assert.equal(response.data.status, "success", "Successful create response")
            assert.ok(TestUtils.verifySignature(response), 'Have a valid signature in response')
        })

        it("Gets active databases for a user", async () => {
            // create a second database
            const createResponse = await Axios.post(`${SERVER_URL}/user/createDatabase`, {
                databaseName: databaseName2,
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });


            const response = await Axios.post(`${SERVER_URL}/user/databases`, {
                databaseName,
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            assert.equal(response.data.status, "success", "Successful databases response")
            assert.ok(response.data.result.length > 1, 'At least two database returned')
            
            let found1 = false
            let found2 = false
            for (let i=0; i<response.data.result.length; i++) {
                const database = response.data.result[i]
                if (database.databaseName == databaseName) {
                    found1 = true
                }
                if (database.databaseName == databaseName2) {
                    found2 = true
                }
            }

            assert.ok(found1, `Database 1 ${databaseName} found`)
            assert.ok(found2, `Database 2 ${databaseName2} found`)

            assert.ok(TestUtils.verifySignature(createResponse), 'Have a valid signature in create response')
            assert.ok(TestUtils.verifySignature(response), 'Have a valid signature in databases response')
        })

        it("Gets database info for a user", async () => {
            const response = await Axios.post(`${SERVER_URL}/user/databaseInfo`, {
                databaseName,
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            assert.equal(response.data.status, "success", "Successful database info response")

            const result = response.data.result
            assert.equal(result.did.toLowerCase(), accountInfo.did.toLowerCase(), 'Expected DID in response')
            assert.equal(result.contextName, CONTEXT_NAME, 'Expected context name in response')
            assert.ok(result.info, 'Have an info response')
            assert.ok(TestUtils.verifySignature(response), 'Have a valid signature in response')
        })

        it('Gets usage stats for user and context', async () => {
            const response = await Axios.post(`${SERVER_URL}/user/usage`, {
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });
            assert.equal(response.data.status, "success", "Successful usage response")

            const result = response.data.result
            assert.equal(result.databases, 2, 'Expected number of databases')
            assert.ok(result.bytes > 0, 'More than 0 bytes used')
            assert.ok(result.usagePercent > 0, 'More than 0 percentage usage')
            assert.equal(result.storageLimit, process.env.DEFAULT_USER_CONTEXT_LIMIT_MB*1048576, 'Storage limit is 100Mb')
            assert.ok(TestUtils.verifySignature(response), 'Have a valid signature in response')
        })

        // @todo: updates

        it("Deletes database", async () => {
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

            // confirm the database doesn't exist
            try {
                const response2 = await Axios.post(`${SERVER_URL}/user/databaseInfo`, {
                    databaseName,
                    did: accountInfo.did,
                    contextName: CONTEXT_NAME
                }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });

                assert.fail('Expected a 404 because the database shouldnt be found')
            } catch (err) {
                assert.equal(err.response.data.message, 'Database not found', 'Database not found')
            }

            const response3 = await Axios.post(`${SERVER_URL}/user/deleteDatabase`, {
                databaseName: databaseName2,
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });
            assert.equal(response3.data.status, 'success', 'Successful delete response')

            assert.ok(TestUtils.verifySignature(response), 'Have a valid signature in response')
        })

        it("Deletes all database", async () => {
            const db1 = await TestUtils.createDatabase('DeleteAll_1', accountInfo.did, CONTEXT_NAME, accessToken)
            const db2 = await TestUtils.createDatabase('DeleteAll_2', accountInfo.did, CONTEXT_NAME, accessToken)
            const db3 = await TestUtils.createDatabase('DeleteAll_3', accountInfo.did, CONTEXT_NAME, accessToken)

            assert.equal(db1.data.status, "success", "Successful create response for db1")
            assert.equal(db2.data.status, "success", "Successful create response for db2")
            assert.equal(db3.data.status, "success", "Successful create response for db3")

            const response = await Axios.post(`${SERVER_URL}/user/deleteDatabases`, {
                did: accountInfo.did,
                contextName: CONTEXT_NAME
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            assert.equal(response.data.status, "success", "Successful delete response")
            assert.equal(response.data.results.length, 3, "Deleted three databases")
            assert.ok(response.data.results.indexOf('DeleteAll_1') >= 0, 'Deleted correct databases (DeleteAll_1)')
            assert.ok(response.data.results.indexOf('DeleteAll_2') >= 0, 'Deleted correct databases (DeleteAll_2)')
            assert.ok(response.data.results.indexOf('DeleteAll_3') >= 0, 'Deleted correct databases (DeleteAll_3)')           
            assert.ok(TestUtils.verifySignature(response), 'Have a valid signature in response')
        })
    })

    describe("Server info", () => {
        it("Status", async () => {
            const response = await Axios.get(`${SERVER_URL}/status`);

            assert.equal(response.data.results.maxUsers, process.env.MAX_USERS, 'Correct maximum number of users')
            assert.ok(response.data.results.currentUsers > 2, 'At least two users')
            assert.ok(response.data.results.version && response.data.results.version.length, 'Version specified')
        })
    })
})