import Axios from 'axios'
import assert from 'assert';
import { ethers } from 'ethers'
import { DIDDocument } from '@verida/did-document'

import CONFIG from './config'
import { id } from 'ethers/utils';
const { SERVER_URL } = CONFIG

const DID_URL = `${SERVER_URL}/did`

const wallet = ethers.Wallet.createRandom()

//const WALLET_TYPE = 'manual'
const WALLET_TYPE = 'create'

let DID_ADDRESS, DID, DID_PK, DID_PRIVATE_KEY

if (WALLET_TYPE == 'create') {
    DID_ADDRESS = wallet.address
    DID = `did:vda:testnet:${DID_ADDRESS}`
    DID_PK = wallet.signingKey.publicKey
    DID_PRIVATE_KEY = wallet.privateKey
}
else {
    DID_ADDRESS = '0x3529bEae0adE19C53c9Dbcd08B8b20510E455e45'
    DID = 'did:vda:testnet:0x3529bEae0adE19C53c9Dbcd08B8b20510E455e45'
    DID_PK = '0x04648d3bdcdce7c0a47a25a8a19d19748f1e6767b6f5f3f0895ca04192bef84e90657b85a803b0573d9d4b1d8c6fb16ac97e3ccc2d8826dec524da5274a5ea7ef4'
    DID_PRIVATE_KEY = '0xadc3930bb646015be35da24140d3fafa2c0c8fbfaefb85d25122ddc7384670f9'
}

describe("DID Storage Tests", function() {
    /*this.beforeAll(async () => {
        //await AuthManager.initDb() -- This is required if the server is running locally and has never been run before, run just once
        //await TestUtils.ensureVeridaAccount(CONFIG.VDA_PRIVATE_KEY) -- This is required if the private key has never been initilaized with an application context, run just once
        accountInfo = await TestUtils.connectAccount(CONFIG.VDA_PRIVATE_KEY)
    })*/

    this.beforeAll(async () => {
        console.log('Executing with:')
        console.log(`DID: ${DID}`)
        console.log(`DID_PUB_KEY: ${DID_PK}`)
        console.log(`DID_PRIVATE_KEY: ${DID_PRIVATE_KEY}`)
    })

    describe("Create", () => {
        it.only("Success", async () => {
            try {
                const doc = new DIDDocument(DID, DID_PK)
                doc.signProof(wallet.privateKey)

                const createResult = await Axios.post(`${DID_URL}/${DID}`, {
                    document: doc.export()
                });

                assert.equal(createResult.data.status, 'success', 'Success response')
            } catch (err) {
                console.error(err.response.data)
                assert.fail(err.response.data.message)
            }
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

    describe("Update", () => {
        it("Fail - Not next versionId", async () => {
            const doc = new DIDDocument(DID, DID_PK)

            try {
                await Axios.put(`${DID_URL}/${DID}`, {
                    document: doc.export()
                });

                assert.fail('DID Document was updated with invalid versionId')
            } catch (err) {
                assert.equal(err.response.data.status, 'fail', 'DID Document create failed')
                assert.ok(err.response.data.message.match('Invalid DID Document: Invalid value for versionId'), 'Rejected because incorrect version')
            }
        })

        it("Fail - Invalid DID", async () => {
            try {
                const doc = new DIDDocument(DID, DID_PK)
                await Axios.put(`${DID_URL}/abc123`, {
                    document: doc.export()
                });

                assert.fail(`DID Document was found, when it shouldn't have`)
            } catch (err) {
                assert.equal(err.response.data.status, 'fail', 'Get DID Document failed')
                assert.ok(err.response.data.message.match('DID Document not found'), `Rejected because DID Document doesn't exists`)
            }
        })

        it("Success", async () => {
            const basicDoc = new DIDDocument(DID, DID_PK)
            const document = basicDoc.export()
            document.versionId = document.versionId + 1

            const createResult = await Axios.put(`${DID_URL}/${DID}`, {
                document
            });

            assert.equal(createResult.data.status, 'success', 'Success response')
        })
    })

    describe("Get", () => {
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

        it("Success - All versions", async () => {
            const getResult = await Axios.get(`${DID_URL}/${DID}?allVersions=true`);

            assert.ok(getResult.data.status, 'success', 'Success response')
            assert.equal(getResult.data.data.length, 2, 'Two versions returned')
            assert.equal(getResult.data.data[0].versionId, 0, 'First doc is version 0')
            assert.equal(getResult.data.data[1].versionId, 1, 'Second doc is version 1')
        })

        // Get by versionId
        // Get by versionTime
    })

    describe("Delete", () => {
        it("Fail - Invalid DID", async () => {
            try {
                await Axios.delete(`${DID_URL}/abc123`);

                assert.fail(`DID Document was found, when it shouldn't have`)
            } catch (err) {
                assert.equal(err.response.data.status, 'fail', 'Get DID Document failed')
                assert.ok(err.response.data.message.match('DID Document not found'), `Rejected because DID Document doesn't exists`)
            }
        })

        it("Success", async () => {
            const deleteResult = await Axios.delete(`${DID_URL}/${DID}`, {
                hello: 'world'
            });

            assert.ok(deleteResult.data.status, 'success', 'Success response')
            assert.equal(deleteResult.data.data.revisions, 2, 'Two versions deleted')
        })

        it("Fail - Deleted", async () => {
            try {
                await Axios.delete(`${DID_URL}/${DID}`);

                assert.fail(`DID Document was found, when it shouldn't have`)
            } catch (err) {
                assert.equal(err.response.data.status, 'fail', 'Get DID Document failed')
                assert.ok(err.response.data.message.match('DID Document not found'), `Rejected because DID Document doesn't exists`)
            }
        })
    })

    describe("Create again - After deletion", () => {
        it("Success", async () => {
            const doc = new DIDDocument(DID, DID_PK)

            const createResult = await Axios.post(`${DID_URL}/${DID}`, {
                document: doc.export()
            });

            assert.equal(createResult.data.status, 'success', 'Success response')
        })

        it("Success - Document exists", async () => {
            const getResult = await Axios.get(`${DID_URL}/${DID}`);

            assert.ok(getResult.data.status, 'success', 'Success response')

            // @tgodo: re-build document and compare it matches
            //console.log(getResult.data)
        })
    })

    /*describe("Migrate", () => {
        it("Success", async () => {
            console.log(`${DID_URL}/${DID}/migrate`)
            const createResult = await Axios.post(`${DID_URL}/${DID}/migrate`, {
                hello: 'world'
            });

            console.log(createResult.data)
        })
    })*/
})