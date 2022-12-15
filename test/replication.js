import Axios from 'axios'
import assert from 'assert';
import { ethers } from 'ethers'
import { DIDDocument } from '@verida/did-document'
import { DIDClient } from '@verida/did-client';
import { AutoAccount } from "@verida/account-node"
import { Keyring } from '@verida/keyring';
import ComponentUtils from '../src/components/utils'
import CouchDb from 'nano'

import dotenv from 'dotenv';
dotenv.config();

import Utils from './utils'
import CONFIG from './config'

const CONTEXT_NAME = 'Verida Test: Storage Node Replication'
// @todo: use three endpoints
const ENDPOINT_DSN = {
    'http://192.168.68.117:5000': 'http://admin:admin@192.168.68.117:5984',
    'http://192.168.68.118:5000': 'http://admin:admin@192.168.68.118:5984',
}
const ENDPOINTS = Object.keys(ENDPOINT_DSN)
const ENDPOINTS_DID = ENDPOINTS.map(item => `${item}/did/`)
const ENDPOINTS_COUCH = {}
ENDPOINTS.forEach(key => {
    ENDPOINTS_COUCH[key] = key.replace('5000', '5984')
})
const TEST_DATABASES = ['db1', 'db2', 'db3']
const TEST_DEVICE_ID = 'Device 1'

const didClient = new DIDClient(CONFIG.DID_CLIENT_CONFIG)

function buildDsn(hostname, username, password) {
    return hostname.replace('://', `://${username}:${password}@`)
}

/**
 * WARNING: ONLY RUN THIS TEST ON LOCALHOST
 * 
 * It deletes `_replicator` and `verida_replicator_creds` databases on all CouchDB
 * endpoints upon completion of the tests.
 * 
 * This is necessary to reset the couch instnaces to a known state (empty)
 * 
 * Note: CouchDB replicator interval must be set to 2 seconds (in couch config)
 * to ensure replication is activated during these tests
 */

describe("Replication tests", function() {
    let DID, DID_ADDRESS, DID_PUBLIC_KEY, DID_PRIVATE_KEY, keyring, wallet, account, AUTH_TOKENS, TEST_DATABASE_HASH
    let REPLICATOR_CREDS = {}

    describe("Create test databases", async () => {
        this.timeout(200 * 1000)

        this.beforeAll(async () => {
            // Create a new VDA private key
            //wallet = ethers.Wallet.createRandom()
            wallet = ethers.Wallet.fromMnemonic('pave online install gift glimpse purpose truth loan arm wing west option')
            DID_ADDRESS = wallet.address
            DID = `did:vda:testnet:${DID_ADDRESS}`
            DID_PUBLIC_KEY = wallet.publicKey
            DID_PRIVATE_KEY = wallet.privateKey
            keyring = new Keyring(wallet.mnemonic.phrase)
            await didClient.authenticate(DID_PRIVATE_KEY, 'web3', CONFIG.DID_CLIENT_CONFIG.web3Config, ENDPOINTS_DID)

            TEST_DATABASE_HASH = TEST_DATABASES.map(item => ComponentUtils.generateDatabaseName(DID, CONTEXT_NAME, item))
            console.log(TEST_DATABASE_HASH)
    
            console.log(DID_ADDRESS, DID, DID_PRIVATE_KEY, DID_PUBLIC_KEY, wallet.mnemonic.phrase)
    
            // Create a new VDA account using our test endpoints
            account = new AutoAccount({
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
            let doc = await didClient.get(DID)
            if (!doc) {
                doc = new DIDDocument(DID, DID_PUBLIC_KEY)
            }
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

            try {
                const endpointResponses = await didClient.save(doc)
            } catch (err) {
                console.log(err)
                console.log(didClient.getLastEndpointErrors())
            }
    
            // Fetch an auth token for each server
            AUTH_TOKENS = {}
            for (let i in ENDPOINTS) {
                const endpoint = ENDPOINTS[i]
                console.log(`Authenticating with ${endpoint}`)
                const authJwtResult = await Axios.post(`${endpoint}/auth/generateAuthJwt`, {
                    did: DID,
                    contextName: CONTEXT_NAME
                });
        
                const authRequestId = authJwtResult.data.authJwt.authRequestId
                const authJwt = authJwtResult.data.authJwt.authJwt
                const consentMessage = `Authenticate this application context: "${CONTEXT_NAME}"?\n\n${DID.toLowerCase()}\n${authRequestId}`
                const signature = await account.sign(consentMessage)
    
                const authenticateResponse = await Axios.post(`${endpoint}/auth/authenticate`, {
                    authJwt,
                    did: DID,
                    contextName: CONTEXT_NAME,
                    signature,
                    deviceId: TEST_DEVICE_ID
                })
                AUTH_TOKENS[endpoint] = authenticateResponse.data.accessToken
            }
    
            console.log(`auth tokens for the endpoints:`)
            console.log(AUTH_TOKENS)
        })

        // Create the test databases on the first endpoint
        it.only('can create the test databases on the endpoints', async () => {
            for (let i in ENDPOINTS) {
                let endpoint = ENDPOINTS[i]
                for (let i in TEST_DATABASES) {
                    const dbName = TEST_DATABASES[i]
                    console.log(`createDatabase (${dbName}) on ${endpoint}`)
                    const response = await Utils.createDatabase(dbName, DID, CONTEXT_NAME, AUTH_TOKENS[endpoint], endpoint)
                    console.log('created')
                    assert.equal(response.data.status, 'success', 'database created')
                }
            }
        })

        // Call `checkReplication(db1)` on all the endpoints (first database only)
        it.only('can initialise replication for one database via checkReplication()', async () => {
            // @todo: fix code so endpoint doesn't create replication entries to itself
            try {
                for (let i in ENDPOINTS) {
                    const endpoint = ENDPOINTS[i]
                    console.log(`${endpoint}: Calling checkReplication() on for ${TEST_DATABASES[0]}`)
                    const result = await Utils.checkReplication(endpoint, AUTH_TOKENS[endpoint], TEST_DATABASES[0])
                    assert.equal(result.data.status, 'success', 'Check replication completed successfully')
                }

                // Sleep 5ms to have replication time to initialise
                console.log('Sleeping so replication has time to do its thing...')
                await Utils.sleep(5000)

                for (let i in ENDPOINTS) {
                    const endpoint = ENDPOINTS[i]
                    const couch = new CouchDb({
                        url: ENDPOINT_DSN[endpoint],
                        requestDefaults: {
                            rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED_SSL.toLowerCase() !== "false"
                        }
                    })
                    const conn = couch.db.use('_replicator')

                    // Check replications entries have been created for all the other endpoints (but not this endpoint)
                    for (let e in ENDPOINTS) {
                        const endpointCheckUri = ENDPOINTS[e]
                        if (endpointCheckUri == endpoint) {
                            continue
                        }

                        const replicatorId = ComponentUtils.generateReplicatorHash(endpointCheckUri, DID, CONTEXT_NAME)
                        const replicatorUsername = ComponentUtils.generateReplicaterUsername(endpoint)
                        const dbHash = ComponentUtils.generateDatabaseName(DID, CONTEXT_NAME, TEST_DATABASES[0])
                        console.log(`${endpoint}: (${endpointCheckUri}) Locating _replication entry for ${TEST_DATABASES[0]} (${replicatorId}-${dbHash})`)

                        let replicationEntry
                        try {
                            replicationEntry = await conn.get(`${replicatorId}-${dbHash}`)
                        } catch (err) {
                            console.log('pouchdb connection error')
                            console.log(err.message)
                            assert.fail('Replication record not created')
                        }

                        console.log(replicationEntry)
                        // Check info is accurate
                        assert.ok(replicationEntry)
                        assert.ok(replicationEntry.source, `Have a source for ${endpointCheckUri}`)
                        assert.ok(replicationEntry.target, `Have a target for ${endpointCheckUri}`)
                        assert.equal(replicationEntry.source.url, `http://localhost:5984/${dbHash}`, `Source URI is correct for ${endpointCheckUri}`)
                        assert.equal(replicationEntry.target.url, `${ENDPOINTS_COUCH[endpointCheckUri]}/${dbHash}`, `Destination URI is correct for ${endpointCheckUri}`)

                        REPLICATOR_CREDS[endpoint] = replicationEntry.target.headers

                        const replicationResponse = await Axios.get(`${ENDPOINT_DSN[endpoint]}/_scheduler/docs/_replicator/${replicatorId}-${dbHash}`)
                        assert.ok(replicationResponse, 'Have a replication job')

                        const status = replicationResponse.data
                        assert.ok(['pending', 'running'].indexOf(status.state) !== -1, 'Replication is active')
                    }
                }
            } catch (err) {
                console.log(err)
                assert.fail('error')
            }
        })

        it.only('verify replication user can write to first database', async () => {
            const endpoint0 = ENDPOINTS[0]
            const endpoint1 = ENDPOINTS[1]

            const couch = new CouchDb({
                url: ENDPOINT_DSN[endpoint0],
                requestDefaults: {
                    headers: REPLICATOR_CREDS[endpoint1],
                    rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED_SSL.toLowerCase() !== "false"
                }
            })

            console.log(`${endpoint0}: Creating three test records on ${TEST_DATABASES[0]} (${TEST_DATABASE_HASH[0]}) using credentials from ${endpoint1}`)
            const endpoint0db1Connection = couch.db.use(TEST_DATABASE_HASH[0])
            const result1 = await endpoint0db1Connection.insert({_id: '1', sourceEndpoint: endpoint0})
            assert.ok(result1.ok, 'Record 1 saved')
            const result2 = await endpoint0db1Connection.insert({_id: '2', sourceEndpoint: endpoint0})
            assert.ok(result2.ok, 'Record 2 saved')
            const result3 = await endpoint0db1Connection.insert({_id: '3', sourceEndpoint: endpoint0})
            assert.ok(result3.ok, 'Record 3 saved')
        })

        // Verify data saved to db1 is being replicated for all endpoints
        it.only('verify data is replicated on all endpoints for first database', async () => {
            // Sleep 5ms to have replication time to do its thing
            console.log('Sleeping so replication has time to do its thing...')
            await Utils.sleep(5000)

            // Check the three records are correctly replicated on all the other databases
            for (let i in ENDPOINTS) {
                if (i == 0) {
                    // skip first endpoint
                    continue
                }

                const externalEndpoint = ENDPOINTS[i]
                const couch = new CouchDb({
                    url: ENDPOINT_DSN[externalEndpoint],
                    requestDefaults: {
                        headers: REPLICATOR_CREDS[externalEndpoint],
                        rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED_SSL.toLowerCase() !== "false"
                    }
                })
                const conn = couch.db.use(TEST_DATABASE_HASH[0])

                console.log(`${externalEndpoint}: Verifying endpoint has docs`)
                const docs = await conn.list({include_docs: true})
                console.log(`Endpoint ${externalEndpoint} has docs:`)
                console.log(docs)
                assert.equal(docs.rows.length, 3, `Three rows returned from ${externalEndpoint}/${TEST_DATABASES[0]} (${TEST_DATABASE_HASH[0]})`)
            }
        })

        // Verify data saved to db2 is NOT replicated for all endpoints
        it('verify data is not replicated for second database', async () => {
            // Create three records on second database
            const endpoint1db2Connection = Utils.buildPouchDsn(ENDPOINT_DSN[endpoint], TEST_DATABASE_HASH[1])
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

    // WARNING: This should never run on production!
    this.afterAll(async () => {
        console.log('Destroying _replicator, verida_replicater_creds and test databases on ALL endpoints')

        for (let endpoint in ENDPOINT_DSN) {
            const conn = new CouchDb({
                url: ENDPOINT_DSN[endpoint],
                requestDefaults: {
                    rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED_SSL.toLowerCase() !== "false"
                }
            })

            // Clear replication related databases to reset them for the next run
            try {
                await conn.db.destroy('_replicator')
            } catch (err) {}
            try {
                await conn.db.destroy('verida_replicater_creds')
            } catch (err) {}
            await conn.db.create('_replicator')
            await conn.db.create('verida_replicater_creds')

            // Delete test databases
            for (let d in TEST_DATABASE_HASH) {
                const databaseName = TEST_DATABASE_HASH[d]
                try {
                    console.log(`Destroying ${databaseName}`)
                    await conn.db.destroy(databaseName)
                } catch (err) {}
            }

            // Delete created replication users
            for (let i in ENDPOINTS) {
                const endpointExternal = ENDPOINTS[i]
                if (endpointExternal == endpoint) {
                    continue
                }

                try {
                    const username = ComponentUtils.generateReplicaterUsername(endpointExternal)
                    const users = conn.db.use('_users')
                    console.log(`Deleting replication user ${username} for ${endpointExternal} from ${endpoint}`)
                    const doc = await users.get(`org.couchdb.user:${username}`)
                    await users.destroy(`org.couchdb.user:${username}`, doc._rev)
                } catch (err) {
                    if (err.error != 'not_found') {
                        console.log(`Unable to delete user`)
                        console.log(err)   
                    }
                }
            }
        }
    })
})

