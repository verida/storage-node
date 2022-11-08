import Axios from 'axios'
import assert from 'assert';
import { ethers } from 'ethers'
import { DIDDocument } from '@verida/did-document'

import CONFIG from './config'
const { SERVER_URL } = CONFIG

const DID_URL = `${SERVER_URL}/did`

const wallet = ethers.Wallet.createRandom()

//const DID_ADDRESS = wallet.address
//const DID = `did:vda:testnet:${DID_ADDRESS}`
//const DID_PK = wallet.signingKey.publicKey

const DID_ADDRESS = '0x56f2c429fC8fdd4911F472a3c451341EAEC989a2'
const DID = 'did:vda:testnet:0x56f2c429fC8fdd4911F472a3c451341EAEC989a2'
const DID_PK = '0x04d1c85058d70c637f8ec46df26cbe855829a51f3335731352e2d1587e478b66e350e49bd4650685039c4b4e0adab5bb2a680d5a13dfb176a311544ec503999f4f'

describe("DID Storage Tests", function() {
    /*this.beforeAll(async () => {
        //await AuthManager.initDb() -- This is required if the server is running locally and has never been run before, run just once
        //await TestUtils.ensureVeridaAccount(CONFIG.VDA_PRIVATE_KEY) -- This is required if the private key has never been initilaized with an application context, run just once
        accountInfo = await TestUtils.connectAccount(CONFIG.VDA_PRIVATE_KEY)
    })*/

    describe("Create", () => {
        it("Success", async () => {
            const doc = new DIDDocument(DID, DID_PK)

            const createResult = await Axios.post(`${DID_URL}/${DID}`, {
                document: doc.export()
            });

            assert.equal(createResult.data.status, 'success', 'Success response')
        })

        it("Fail - Duplicate DID Document", async () => {
            const doc = new DIDDocument(DID, DID_PK)

            try {
                await Axios.post(`${DID_URL}/${DID}`, {
                    document: doc.export()
                });

                assert.fail('DID Document was created a second time')
            } catch (err) {
                assert.equal(err.response.data.status, 'fail', 'DID Document create failed')
                assert.ok(err.response.data.message.match('DID Document already exists'), 'Rejected because DID Document already exists')
            }
        })
    })

    describe.only("Get", () => {
        it("Success - Latest", async () => {
            const getResult = await Axios.get(`${DID_URL}/${DID}`);

            assert.ok(getResult.data.status, 'success', 'Success response')

            // @tgodo: re-build document and compare it matches
            //console.log(getResult.data)
        })

        it("Fail - Invalid DID", async () => {
            try {
                const getResult = await Axios.get(`${DID_URL}/abc123`);

                assert.fail(`DID Document was found, when it shouldn't have`)
            } catch (err) {
                assert.equal(err.response.data.status, 'fail', 'Get DID Document failed')
                assert.ok(err.response.data.message.match('DID Document not found'), `Rejected because DID Document doesn't exists`)
            }
        })
        
        // versionId
        // versionTime
        // allVersions

        it("Success - All versions", async () => {
            const getResult = await Axios.get(`${DID_URL}/${DID}?allVersions=true`);

            assert.ok(getResult.data.status, 'success', 'Success response')

            // @tgodo: re-build document and compare it matches
            console.log(getResult.data)
        })
    })

    describe("Update", () => {
        it("Success", async () => {
            console.log(`${DID_URL}/${DID}`)
            const createResult = await Axios.put(`${DID_URL}/${DID}`, {
                hello: 'world'
            });

            console.log(createResult.data)
        })
    })

    describe("Delete", () => {
        it("Success", async () => {
            console.log(`${DID_URL}/${DID}`)
            const createResult = await Axios.delete(`${DID_URL}/${DID}`, {
                hello: 'world'
            });

            console.log(createResult.data)
        })
    })

    describe("Migrate", () => {
        it("Success", async () => {
            console.log(`${DID_URL}/${DID}/migrate`)
            const createResult = await Axios.post(`${DID_URL}/${DID}/migrate`, {
                hello: 'world'
            });

            console.log(createResult.data)
        })
    })
})