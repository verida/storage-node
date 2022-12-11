import Axios from 'axios'
import assert from 'assert';
import { ethers } from 'ethers'
import { DIDDocument } from '@verida/did-document'
import { DIDClient } from '@verida/did-client';
import { AutoAccount } from "@verida/account-node"
import { Keyring } from '@verida/keyring';

import dotenv from 'dotenv';
dotenv.config();

import Utils from '../src/services/didStorage/utils'
import TestUtils from './utils'
import CONFIG from './config'

const CONTEXT_NAME = 'Verida Test: Storage Node Replication'
// @todo: use three endpoints
const ENDPOINT_DSN = {
    'http://192.168.1.117:5000': 'http://admin:admin@192.168.1.117:5984',
    'http://192.168.1.118:5000': 'http://admin:admin@192.168.1.117:5984'
}
const ENDPOINTS = Object.keys(ENDPOINT_AUTH)
const TEST_DATABASES = ['db1', 'db2', 'db3']
const TEST_DEVICE_ID = 'Device 1'

const didClient = new DIDClient(CONFIG.DID_CLIENT_CONFIG)

describe("Replication tests", function() {

    this.beforeAll(async () => {
        // Create a new VDA private key
        const wallet = ethers.Wallet.createRandom()
        const DID_ADDRESS = wallet.address
        const DID = `did:vda:testnet:${DID_ADDRESS}`
        const DID_PUBLIC_KEY = wallet.publicKey
        const DID_PRIVATE_KEY = wallet.privateKey
        const keyring = new Keyring(wallet.mnemonic.phrase)
        await didClient.authenticate(DID_PRIVATE_KEY, 'web3', CONFIG.DID_CLIENT_CONFIG.web3Config, ENDPOINTS)

        console.log(DID_ADDRESS, DID, DID_PRIVATE_KEY, DID_PUBLIC_KEY, wallet.mnemonic.phrase)

        // Create a new VDA account using our test endpoints
        const account = new AutoAccount({
            defaultDatabaseServer: {
                type: 'VeridaDatabase',
                endpointUri: ENDPOINTS
            },
            defaultMessageServer: {
                type: 'VeridaMessage',
                endpointUri: ENDPOINTS
            },
        }, {
            privateKey: wallet.privateKey,
            didClientConfig: CONFIG.DID_CLIENT_CONFIG,
            environment: CONFIG.ENVIRONMENT
        })

        // Create new DID document (using DIDClient) for the private key with two testing endpoints (local)
        const doc = new DIDDocument(DID, DID_PUBLIC_KEY)
        await doc.addContext(CONTEXT_NAME, keyring, DID_PRIVATE_KEY, {
            database: {
                type: 'VeridaDatabase',
                endpointUri: ENDPOINTS
            },
            messaging: {
                type: 'VeridaMessage',
                endpointUri: ENDPOINTS
            },
        })
        const endpointResponses = await didClient.save(doc)
        console.log(endpointResponses)
        console.log(doc.export())

        // Fetch an auth token for each server
        const AUTH_TOKENS = {}
        const CONNECTIONS = {}
        for (let i in ENDPOINTS) {
            const endpoint = ENDPOINTS[i]
            const authJwtResult = await Axios.post(`${SERVER_URL}/auth/generateAuthJwt`, {
                did: DID,
                contextName: CONTEXT_NAME
            });
    
            authRequestId = authJwtResult.data.authJwt.authRequestId
            authJwt = authJwtResult.data.authJwt.authJwt
            const consentMessage = `Authenticate this application context: "${CONTEXT_NAME}"?\n\n${DID.toLowerCase()}\n${authRequestId}`
            const signature = await accountInfo.account.sign(consentMessage)

            const authenticateResponse = await Axios.post(`${endpoint}/auth/authenticate`, {
                authJwt,
                did: DID,
                contextName: CONTEXT_NAME,
                signature,
                deviceId: TEST_DEVICE_ID
            })
            AUTH_TOKENS[endpoint] = authenticateResponse.data.accessToken
        }

        console.log(AUTH_TOKENS)
    })

    describe("Create test databases", async () => {
        // Create the test databases on the first endpoint
        let endpoint = ENDPOINTS[0]
        for (let i in TEST_DATABASES) {
            const dbName = TEST_DATABASES[i]
            const response = await Utils.createDatabase(dbName, DID, CONTEXT_NAME, AUTH_TOKENS[endpoint], endpoint)
            console.log(`createDatabase (${dbName}) on ${endpoint} response:`)
            console.log(response)
        }

        // Call `checkReplication(db1)` on all the endpoints (first database only)
        it.only('can initialise replication for one database via checkReplication()', async () => {
            for (let i in ENDPOINTS) {
                const endpoint = ENDPOINTS[i]
                const result = await Utils.checkReplication(endpoint, AUTH_TOKENS[endpoint], TEST_DATABASES[0])
                console.log(`checkReplication on ${endpoint} for ${TEST_DATABASES[0]}`)
                console.log(result)

                const conn = Utils.buildPouchDsn(ENDPOINT_DSN[endpoint], '_replicator')
                const replicationEntry = await conn.get(`${endpoint}/${TEST_DATABASE[0]}`)
                console.log(`${endpoint} _replication entry for ${TEST_DATABASE[0]}`)
                console.log(replicationEntry)
                assert.ok(replicationEntry)
            }
        })

        // Verify data saved to db1 is being replicated for all endpoints
        it('verify data is replicated for first database only', async () => {
            // Create three records
            const endpoint0db1Connection = Utils.buildPouchDsn(ENDPOINT_DSN[endpoint], TEST_DATABASES[0])
            await endpoint0db1Connection.put({db1endpoint1: 'world1'})
            await endpoint0db1Connection.put({db1endpoint1: 'world2'})
            await endpoint0db1Connection.put({db1endpoint1: 'world3'})

            // Check the three records are correctly replicated on all the other databases
            for (let i in ENDPOINTS) {
                if (i === 0) {
                    // skip first database
                    continue
                }

                const conn = Utils.buildPouchDsn(ENDPOINT_DSN[endpoint], TEST_DATABASES[0])
                const docs = await conn.allDocs({include_docs: true})
                console.log(`Endpoint ${endpoint} has docs:`)
                console.log(docs)
                assert.equals(docs.rows.length, 3, 'Three rows returned')
            }
        })

        // Verify data saved to db2 is NOT replicated for all endpoints
        it('verify data is not replicated for second database', async () => {
            // Create three records on second database
            const endpoint1db2Connection = Utils.buildPouchDsn(ENDPOINT_DSN[endpoint], TEST_DATABASES[1])
            await endpoint1db2Connection.put({db2endpoint2: 'world1'})
            await endpoint1db2Connection.put({db2endpoint2: 'world2'})
            await endpoint1db2Connection.put({db2endpoint2: 'world3'})

            // Check the three records are correctly replicated on all the other databases
            for (let i in ENDPOINTS) {
                if (i === 1) {
                    // skip second database
                    continue
                }

                const conn = Utils.buildPouchDsn(ENDPOINT_DSN[endpoint], TEST_DATABASES[1])
                const docs = await conn.allDocs({include_docs: true})
                console.log(`Endpoint ${endpoint} has docs:`)
                console.log(docs)
                assert.equals(docs.rows.length, 0, 'No rows returned')
            }
        })

        it('can initialise replication for all database via checkReplication()', async () => {
            for (let i in ENDPOINTS) {
                const endpoint = ENDPOINTS[i]
                const result = await Utils.checkReplication(endpoint, AUTH_TOKENS[endpoint])
                console.log(`checkReplication on ${endpoint} for all databases`)
                console.log(result)
            }

            // @todo: check the replication database as per above
        })

        it('verify data is being replicated for all databases', async () => {

        })

        it('can delete a database', () => {})

        it('can remove a database replication entry when via checkReplication()', () => {})

        it('verify database is deleted from all endpoints', () => {})
    })

    this.afterAll(async () => {
        // Delete all replication entries
        // Delete all databases
    })
})