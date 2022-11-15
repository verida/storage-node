import Axios from 'axios'
import assert from 'assert';
import { ethers } from 'ethers'
import { DIDDocument } from '@verida/did-document'

import dotenv from 'dotenv';
dotenv.config();

import Utils from '../src/services/didStorage/utils'
import CONFIG from './config'
const { SERVER_URL } = CONFIG

const DID_URL = `${SERVER_URL}/did`

const wallet = ethers.Wallet.createRandom()

let DID_ADDRESS, DID, DID_PK, DID_PRIVATE_KEY

DID_ADDRESS = wallet.address
DID = `did:vda:testnet:${DID_ADDRESS}`
DID_PK = wallet.publicKey
DID_PRIVATE_KEY = wallet.privateKey

let masterDidDoc

describe("DID Storage Tests", function() {
    this.beforeAll(async () => {
        console.log('Executing with:')
        console.log(`DID: ${DID}`)
        console.log(`DID_PUB_KEY: ${DID_PK}`)
        console.log(`DID_PRIVATE_KEY: ${DID_PRIVATE_KEY}`)

        // clear DID database
        const couch = Utils.getDb()
        await couch.db.destroy(process.env.DB_DIDS)
        await Utils.createDb()
        console.log('destroyed!')
    })

    describe("Create", () => {
        it("Success", async () => {
            try {
                const doc = new DIDDocument(DID, DID_PK)
                doc.signProof(wallet.privateKey)

                const createResult = await Axios.post(`${DID_URL}/${DID}`, {
                    document: doc.export()
                });

                masterDidDoc = doc.export()

                assert.equal(createResult.data.status, 'success', 'Success response')
            } catch (err) {
                console.error(err.response.data)
                assert.fail(err.response.data.message)
            }
        })

        it("Fail - Duplicate DID Document", async () => {
            const doc = new DIDDocument(DID, DID_PK)
            doc.signProof(wallet.privateKey)

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
            doc.setAttributes({
                created: masterDidDoc.created
            })

            doc.signProof(wallet.privateKey)

            try {
                await Axios.put(`${DID_URL}/${DID}`, {
                    document: doc.export()
                });

                assert.fail('DID Document was updated with invalid versionId')
            } catch (err) {
                assert.equal(err.response.data.status, 'fail', 'DID Document create failed')
                assert.equal(err.response.data.message, 'Invalid DID Document: Incorrect value for versionId (Expected 1)', 'Rejected because incorrect version')
            }
        })

        it("Fail - Invalid DID", async () => {
            try {
                const doc = new DIDDocument(DID, DID_PK)
                doc.setAttributes({
                    created: masterDidDoc.created
                })
                doc.signProof(wallet.privateKey)
                
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
            basicDoc.setAttributes({
                created: masterDidDoc.created,
                versionId: document.versionId + 1
            })

            basicDoc.signProof(wallet.privateKey)
            
            try {
                const createResult = await Axios.put(`${DID_URL}/${DID}`, {
                    document: basicDoc.export()
                });

                assert.equal(createResult.data.status, 'success', 'Success response')
            } catch (err) {
                console.error(err.response.data)
                assert.fail('Error updating')
            }
        })
    })

    describe("Get", () => {
        it("Success - Latest", async () => {
            const getResult = await Axios.get(`${DID_URL}/${DID}`);

            assert.ok(getResult.data.status, 'Success response')
            assert.equal(getResult.data.data.id, DID.toLowerCase(), 'DID mathces')

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
            assert.equal(getResult.data.data.versions.length, 2, 'Two versions returned')
            assert.equal(getResult.data.data.versions[0].versionId, 0, 'First doc is version 0')
            assert.equal(getResult.data.data.versions[1].versionId, 1, 'Second doc is version 1')
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
            doc.signProof(wallet.privateKey)

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