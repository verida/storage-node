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

// Enable verbose logging of what the tests are doing
const LOGGING_ENABLED = true

// Use a pre-built mnemonic where the first private key is a Verida DID private key
// mnemonic with a Verida DID that points to 2x local endpoints
//const MNEMONIC = 'pave online install gift glimpse purpose truth loan arm wing west option'
//const MNEMONIC = false
// 3x devnet endpoints
const MNEMONIC = 'meat essence critic december sure outer before normal upset sure primary laundry'

// Context name to use for the tests
const CONTEXT_NAME = 'Verida Test: Storage Node Replication'

// Endpoints to use for testing
// WARNING!!!
// Only ever use local or development network endpoints.
// These tests will delete the `_replicator` database and `verida_replicator_creds` on
// ALL endpoints when they are complete.
/*const ENDPOINT_DSN = {
    'https://acacia-dev1.tn.verida.tech:443': 'https://admin:xDU0UcO0zfapancsmrW7@acacia-dev1.tn.verida.tech:443',
    'https://acacia-dev2.tn.verida.tech:443': 'https://admin:uyf6rOipUORcsx9NunOZ@acacia-dev2.tn.verida.tech:443',
    'https://acacia-dev3.tn.verida.tech:443': 'https://admin:ZVOyBzwLxlmTTOQx25mA@acacia-dev3.tn.verida.tech:443',
}*/
const ENDPOINT_DSN = {
    'http://192.168.68.135:5000': 'http://admin:admin@192.168.68.135:5984',
    'http://192.168.68.127:5000': 'http://admin:admin@192.168.68.127:5984',
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

function buildEndpointConnection(externalEndpoint, endpointCreds) {
    return new CouchDb({
        url: externalEndpoint,
        requestDefaults: {
            headers: endpointCreds,
            rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED_SSL.toLowerCase() !== "false"
        }
    })
}

function log(output) {
    if (LOGGING_ENABLED) {
        console.log(output)
    }
}

const databaseHashes = {}

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
            if (MNEMONIC) {
                log('Loading wallet from MNEMONIC')
                wallet = ethers.Wallet.fromMnemonic(MNEMONIC)
            } else {
                log('Creating random wallet')
                wallet = ethers.Wallet.createRandom()
            }
            
            DID_ADDRESS = wallet.address
            DID = `did:vda:testnet:${DID_ADDRESS}`
            DID_PUBLIC_KEY = wallet.publicKey
            DID_PRIVATE_KEY = wallet.privateKey
            keyring = new Keyring(wallet.mnemonic.phrase)
            console.log(ENDPOINTS_DID)
            await didClient.authenticate(DID_PRIVATE_KEY, 'web3', CONFIG.DID_CLIENT_CONFIG.web3Config, ENDPOINTS_DID)

            TEST_DATABASE_HASH = TEST_DATABASES.map(item => ComponentUtils.generateDatabaseName(DID, CONTEXT_NAME, item))
    
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
    
            // Create new DID document (using DIDClient) for the private key with testing endpoints
            let doc
            try {
                doc = await didClient.get(DID)
                log(`DID Document exists.`)
            } catch (err) {
                log(`DID Document didn't exist. Creating.`)
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
                log ('Saving DID document')
                await didClient.save(doc)
            } catch (err) {
                log(err)
                log(didClient.getLastEndpointErrors())
            }
    
            // Fetch an auth token for each server
            AUTH_TOKENS = {}
            for (let i in ENDPOINTS) {
                const endpoint = ENDPOINTS[i]
                log(`Authenticating with ${endpoint}`)
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
        })

        // Create the test databases on the first endpoint
        it('can create the test databases on the endpoints', async () => {
            for (let i in ENDPOINTS) {
                let endpoint = ENDPOINTS[i]
                for (let i in TEST_DATABASES) {
                    const dbName = TEST_DATABASES[i]
                    const response = await Utils.createDatabase(dbName, DID, CONTEXT_NAME, AUTH_TOKENS[endpoint], endpoint)
                    assert.equal(response.data.status, 'success', 'database created')
                    databaseHashes[dbName] = response.data.databaseHash
                }
            }
        })

        // Call `checkReplication(db1)` on all the endpoints (first database only)
        it('can initialise replication for one database via pingDatabases()', async () => {
            // @todo: fix code so endpoint doesn't create replication entries to itself
            for (let i in ENDPOINTS) {
                const endpoint = ENDPOINTS[i]
                log(`${endpoint}: Calling pingDatabases() on for ${TEST_DATABASES[0]} (${databaseHashes[TEST_DATABASES[0]]})`)
                const result = await Utils.pingDatabases(endpoint, AUTH_TOKENS[endpoint], databaseHashes[TEST_DATABASES[0]])
                assert.equal(result.data.status, 'success', 'Check replication completed successfully')
            }

            // Sleep 5ms to have replication time to initialise
            log('Sleeping so replication has time to do its thing...')
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
                    const dbHash = databaseHashes[TEST_DATABASES[0]]
                    log(`${endpoint}: (${endpointCheckUri}) Locating _replication entry for ${TEST_DATABASES[0]} (${replicatorId}-${dbHash})`)

                    let replicationEntry
                    try {
                        replicationEntry = await conn.get(`${replicatorId}-${dbHash}`)
                    } catch (err) {
                        log('pouchdb connection error')
                        log(err.message)
                        assert.fail(`Replication record not created (${replicatorId}-${dbHash})`)
                    }

                    // Check info is accurate
                    assert.ok(replicationEntry)
                    assert.ok(replicationEntry.source, `Have a source for ${endpointCheckUri}`)
                    assert.ok(replicationEntry.target, `Have a target for ${endpointCheckUri}`)
                    assert.equal(replicationEntry.source.url, `http://localhost:5984/${dbHash}`, `Source URI is correct for ${endpointCheckUri}`)
                    assert.equal(replicationEntry.target.url, `${ENDPOINTS_COUCH[endpointCheckUri]}/${dbHash}`, `Destination URI is correct for ${endpointCheckUri}`)

                    if (!REPLICATOR_CREDS[endpointCheckUri]) {
                        REPLICATOR_CREDS[endpointCheckUri] = replicationEntry.target.headers
                    }

                    const replicationResponse = await Axios.get(`${ENDPOINT_DSN[endpoint]}/_scheduler/docs/_replicator/${replicatorId}-${dbHash}`)
                    assert.ok(replicationResponse, 'Have a replication job')

                    const status = replicationResponse.data
                    console.log(status)
                    assert.ok(['pending', 'running'].indexOf(status.state) !== -1, 'Replication is active')
                }
            }
        })

        it('verify replication user can write to first database', async () => {
            const endpoint0 = ENDPOINTS[0]
            const endpoint1 = ENDPOINTS[1]

            const creds = REPLICATOR_CREDS[endpoint0]
            const couch = buildEndpointConnection(ENDPOINTS_COUCH[endpoint0], creds)

            log(`${endpoint0}: Creating three test records on ${TEST_DATABASES[0]} (${TEST_DATABASE_HASH[0]}) using credentials from ${endpoint1}`)
            const endpoint0db1Connection = couch.db.use(TEST_DATABASE_HASH[0])
            const result1 = await endpoint0db1Connection.insert({_id: '1', sourceEndpoint: endpoint0})
            assert.ok(result1.ok, 'Record 1 saved')
            const result2 = await endpoint0db1Connection.insert({_id: '2', sourceEndpoint: endpoint0})
            assert.ok(result2.ok, 'Record 2 saved')
            const result3 = await endpoint0db1Connection.insert({_id: '3', sourceEndpoint: endpoint0})
            assert.ok(result3.ok, 'Record 3 saved')
        })

        // Verify data saved to db1 is being replicated for all endpoints
        it('verify data is replicated on all endpoints for first database', async () => {
            // Sleep 5ms to have replication time to do its thing
            log('Sleeping so replication has time to do its thing...')
            await Utils.sleep(5000)

            // Check the three records are correctly replicated on all the other databases
            for (let i in ENDPOINTS) {
                if (i == 0) {
                    // skip first endpoint
                    continue
                }

                const externalEndpoint = ENDPOINTS[i]

                const creds = REPLICATOR_CREDS[externalEndpoint]
                const couch = buildEndpointConnection(ENDPOINTS_COUCH[externalEndpoint], creds)
                const conn = couch.db.use(TEST_DATABASE_HASH[0])

                log(`${externalEndpoint}: Verifying endpoint has docs`)
                const docs = await conn.list({include_docs: true})

                // Note: There is a design document, which is why the number is actually 4
                assert.equal(docs.rows.length, 4, `Three rows returned from ${externalEndpoint}/${TEST_DATABASES[0]} (${TEST_DATABASE_HASH[0]})`)
            }
        })

        it('can initialise replication for all endpoints and databases via pingDatabases()', async () => {
            for (let i in ENDPOINTS) {
                const endpoint = ENDPOINTS[i]
                log(`${endpoint}: Calling checkReplication() on all databases for ${endpoint}`)

                for (let d in TEST_DATABASES) {
                    const result = await Utils.pingDatabases(endpoint, AUTH_TOKENS[endpoint], databaseHashes[TEST_DATABASES[d]])
                    assert.equal(result.data.status, 'success', `pingDatabases completed successfully for ${TEST_DATABASES[d]}`)
                }
            }
        })

        it('verify data is being replicated for all databases and endpoints', async () => {
            // Sleep 1s to have replication time to initialise
            log('Sleeping so replication has time to do its thing...')
            await Utils.sleep(5000)

            let recordCount = 0
            // Create data on every database, on every endpoint, and verify on every other endpoint
            for (let i in TEST_DATABASES) {
                // skip first database as we've already used it
                if (i == 0) {
                    continue
                }

                const dbName = TEST_DATABASES[i]
                const dbHash = TEST_DATABASE_HASH[i]
                const createdDatabaseIds = []
                
                log(`${dbName} (${dbHash}): Creating a record on every endpoint`)
                for (let e in ENDPOINTS) {
                    const endpoint = ENDPOINTS[e]
                    const creds = REPLICATOR_CREDS[endpoint]

                    // create a record on this endpoint
                    const couch = buildEndpointConnection(ENDPOINTS_COUCH[endpoint], creds)
                    const conn = couch.db.use(dbHash)
                    const id = String(recordCount++)
                    createdDatabaseIds.push(id)
                    await conn.insert({_id: id, dbName, dbHash, endpoint})
                }

                log(`${dbName} (${dbHash}): Done (${createdDatabaseIds.length}). Sleeping for replication to do its thing...`)
                await Utils.sleep(5000)

                try {
                    for (let e in ENDPOINTS) {
                        const endpoint = ENDPOINTS[e]

                        const creds = REPLICATOR_CREDS[endpoint]

                        // create a record on this endpoint
                        const couch = buildEndpointConnection(ENDPOINTS_COUCH[endpoint], creds)
                        const conn = couch.db.use(dbHash)
                        
                        // confirm all the records exist
                        for (let j in createdDatabaseIds) {
                            const createdId = createdDatabaseIds[j]
                            const result = await conn.get(createdId)
                            assert.equal(result._id, createdId, 'Record exists')
                        }
                    }
                } catch (err) {
                    console.log(err)
                    throw err
                }
            }
        })

        it('verify non-replicated database is fixed with pingDatabases()', async () => {
            // manually delete the database replication entry from endpoint 1 to endpoint 2
            const endpoint1 = ENDPOINTS[0]
            const endpoint2 = ENDPOINTS[1]
            const couch = buildEndpointConnection(ENDPOINT_DSN[endpoint1], {})
            const replicatorId = ComponentUtils.generateReplicatorHash(endpoint2, DID, CONTEXT_NAME)
            const dbHash = ComponentUtils.generateDatabaseName(DID, CONTEXT_NAME, TEST_DATABASES[0])
            const conn = couch.db.use(`_replicator`)

            log(`${endpoint1}: (${endpoint2}) Locating _replication entry for ${TEST_DATABASES[0]} (${replicatorId}-${dbHash})`)
            let replicationEntry
            try {
                replicationEntry = await conn.get(`${replicatorId}-${dbHash}`)
                const destroyResult = await conn.destroy(replicationEntry._id, replicationEntry._rev)
            } catch (err) {
                log(err)
                assert.fail(`Replication record not found (${replicatorId}-${dbHash})`)
            }

            // call pingDatabases() on endpoint 1
            const result = await Utils.pingDatabases(endpoint1, AUTH_TOKENS[endpoint1], Object.values(databaseHashes))
            assert.equal(result.data.status, 'success', 'checkReplication() success')

            // verify the replication entry exists and is valid
            try {
                const newReplicationEntry = await conn.get(`${replicatorId}-${dbHash}`)
                assert.equal(newReplicationEntry._id, replicationEntry._id, 'Replication entry found with correct _id')
                assert.ok(newReplicationEntry._rev != replicationEntry._rev, 'Replication entry found with different revision')
            } catch (err) {
                log(err.message)
                assert.fail(`Replication record not found (${replicatorId}-${dbHash})`)
            }
        })

        // @todo
        it.skip('verify missing database is correctly created with checkReplication(databaseName)', async () => {
            // manually delete the database from endpoint 1
            const endpoint1 = ENDPOINTS[0]
            const couch = buildEndpointConnection(ENDPOINT_DSN[endpoint1], {})
            await couch.db.destroy(TEST_DATABASE_HASH[0])

            // call checkReplication() on endpoint 1
            const result = await Utils.checkReplication(endpoint1, AUTH_TOKENS[endpoint1], TEST_DATABASES[0])
            assert.equal(result.data.status, 'success', 'checkReplication() success')

            // verify the database has been re-created
            const conn = couch.db.use(TEST_DATABASE_HASH[0])
            try {
                const results = await conn.list()
                assert.ok(results, 'Database exists')
            } catch (err) {
                console.log(err)
                assert.fail(`Database doesn't exist`)
            }
        })

        // Do it again, but without specifying the database
        // @todo
        it.skip('verify missing database is correctly created with checkReplication()', async () => {
            // manually delete the database from endpoint 1
            const endpoint1 = ENDPOINTS[0]
            const couch = buildEndpointConnection(ENDPOINT_DSN[endpoint1], {})
            await couch.db.destroy(TEST_DATABASE_HASH[0])

            // call checkReplication() on endpoint 1
            const result = await Utils.checkReplication(endpoint1, AUTH_TOKENS[endpoint1])
            assert.equal(result.data.status, 'success', 'checkReplication() success')

            // verify the database has been re-created
            const conn = couch.db.use(TEST_DATABASE_HASH[0])
            try {
                const results = await conn.list()
                assert.ok(results, 'Database exists')
            } catch (err) {
                console.log(err)
                assert.fail(`Database doesn't exist`)
            }
        })

        // @todo make sure database permissions are correct when the database is re-created

        // @todo detects the storage node is no longer included in the DID document and deletes everything

        // @todo inject a fake database into storage node 1, call checkReplication() on storage node 2, make sure it's not created

        it.skip('verify deleted database is correctly removed with checkReplication()', async () => {
            // @todo
        })

        it('can delete a database', async () => {
            // delete a database from all endpoints
            for (let e in ENDPOINTS) {
                const endpoint = ENDPOINTS[e]
                const response = await Utils.deleteDatabase(TEST_DATABASES[0], DID, CONTEXT_NAME, AUTH_TOKENS[endpoint], endpoint)
                assert.ok(response.data.status, 'success', `Database ${TEST_DATABASES[0]} deleted from ${endpoint}`)
            }
        })

        it('verify database is completely deleted from all endpoints', async () => {
            const dbHash = TEST_DATABASE_HASH[0]

            for (let e in ENDPOINTS) {
                const endpoint = ENDPOINTS[e]

                // Use the credentials of a different server as the local server doesn't have permissions
                // to write (even as admin)
                const creds = REPLICATOR_CREDS[endpoint]

                const couch = buildEndpointConnection(ENDPOINTS_COUCH[endpoint], creds)

                // verify database is deleted from each endpoint
                log(`${endpoint}: Verifying database is deleted (${TEST_DATABASES[0]}) from ${endpoint}`)
                const dbConn = couch.db.use(dbHash)
                try {
                    await dbConn.get('0')
                    assert.fail(`${dbHash} wasnt deleted from ${endpoint}`)
                } catch (err) {
                    assert.equal(err.reason, 'Database does not exist.')
                }

                // verify all replication entries for the database is removed from this endpoint
                const couchAdmin = new CouchDb({
                    url: ENDPOINT_DSN[endpoint],
                    requestDefaults: {
                        rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED_SSL.toLowerCase() !== "false"
                    }
                })

                const replicationConn = couchAdmin.db.use('_replicator')

                log(`${endpoint}: Verifying all replication entries are deleted (${TEST_DATABASES[0]}) from ${endpoint}`)
                for (let i in ENDPOINTS) {
                    const endpointCheckUri = ENDPOINTS[i]
                    if (endpointCheckUri == endpoint) {
                        continue
                    }

                    const replicatorId = ComponentUtils.generateReplicatorHash(endpointCheckUri, DID, CONTEXT_NAME)
                    const dbHash = ComponentUtils.generateDatabaseName(DID, CONTEXT_NAME, TEST_DATABASES[0])
                    log(`${endpoint}: Verifying replication entry for ${endpointCheckUri} is deleted from endpoint ${endpoint} (${replicatorId}-${dbHash})`)

                    try {
                        await replicationConn.get(`${replicatorId}-${dbHash}`)
                    } catch (err) {
                        assert.equal(err.error, 'not_found', 'Replication entry not found')
                    }
                }
                
            }
        })

        // @todo
        it.skip('verify user database list is being replicated', async () => {
            for (let e in ENDPOINTS) {
                const endpoint = ENDPOINTS[e]

                log(`${endpoint}: Calling checkReplication()`)
                await Utils.checkReplication(endpoint, AUTH_TOKENS[endpoint])

                const didContextHash = ComponentUtils.generateDidContextHash(DID, CONTEXT_NAME)
                const didContextDbName = `c${didContextHash}`

                const couchAdmin = new CouchDb({
                    url: ENDPOINT_DSN[endpoint],
                    requestDefaults: {
                        rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED_SSL.toLowerCase() !== "false"
                    }
                })

                const replicationConn = couchAdmin.db.use('_replicator')

                log(`${endpoint}: Confirming the user database list database (${didContextDbName}) is being replicated`)

                try {
                    await replicationConn.get(`${didContextDbName}`)
                } catch (err) {
                    assert.equal(err.error, 'not_found', `Replication entry (${didContextDbName}) not found`)
                }
            }
        })

        // can handle a storage node that goes down at any part in the process
    })

    // WARNING: This should never run on production!
    this.afterAll(async () => {
        log('Destroying _replicator, verida_replicater_creds and test databases on ALL endpoints')

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

            // Create _replicator database and index
            await conn.db.create('_replicator')
            const expiryIndex = {
                index: { fields: ['expiry'] },
                name: 'expiry'
            };
            const replicatorDb = conn.db.use('_replicator');
            await replicatorDb.createIndex(expiryIndex);

            await conn.db.create('verida_replicater_creds')

            // Delete test databases
            for (let d in TEST_DATABASE_HASH) {
                const databaseName = TEST_DATABASE_HASH[d]
                try {
                    log(`Destroying ${databaseName}`)
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
                    log(`Deleting replication user ${username} for ${endpointExternal} from ${endpoint}`)
                    const doc = await users.get(`org.couchdb.user:${username}`)
                    await users.destroy(`org.couchdb.user:${username}`, doc._rev)
                } catch (err) {
                    if (err.error != 'not_found') {
                        log(`Unable to delete user`)
                        log(err)   
                    }
                }
            }
        }
    })
})