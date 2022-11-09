import Axios from 'axios'
import assert from 'assert';
import { ethers } from 'ethers'
import { DIDDocument } from '@verida/did-document'

import CONFIG from './config'
import { id } from 'ethers/utils';
const { SERVER_URL } = CONFIG

const DID_URL = `${SERVER_URL}/did`

const wallet = ethers.Wallet.createRandom()

const DID_ADDRESS = wallet.address
const DID = `did:vda:testnet:${DID_ADDRESS}`
const DID_PK = wallet.signingKey.publicKey


/*
const DID_ADDRESS = '0xDd07ddBC34cE9794495B2d464073975ec2376930'
const DID = 'did:vda:testnet:0xDd07ddBC34cE9794495B2d464073975ec2376930'
const DID_PK = '0x04025e031149315eae2fea4514a4a47ca6b86c84fb89a17ab9cd3d808033ca8475f92cd204a768ea1c41cb3431527673957e4dfbcfc741e5d1f2c97a647da14874'
*/

describe("DID Storage Tests", function() {
    /*this.beforeAll(async () => {
        //await AuthManager.initDb() -- This is required if the server is running locally and has never been run before, run just once
        //await TestUtils.ensureVeridaAccount(CONFIG.VDA_PRIVATE_KEY) -- This is required if the private key has never been initilaized with an application context, run just once
        accountInfo = await TestUtils.connectAccount(CONFIG.VDA_PRIVATE_KEY)
    })*/

    this.beforeAll(async () => {
        console.log('Executing with:')
        console.log(`DID: ${DID}`)
        console.log(`DID_PK: ${DID_PK}`)
    })

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
                console.log(err.response.data)
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
                console.log(err.response.data)
                assert.ok(err.response.data.message.match('DID Document not found'), `Rejected because DID Document doesn't exists`)
            }
        })

        it("Success", async () => {
            const basicDoc = new DIDDocument(DID, DID_PK)
            const document = basicDoc.export()
            document.versionId = document.versionId + 1

            console.log(`${DID_URL}/${DID}`)
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
        
        // versionId
        // versionTime
        // allVersions

        it("Success - All versions", async () => {
            const getResult = await Axios.get(`${DID_URL}/${DID}?allVersions=true`);

            assert.ok(getResult.data.status, 'success', 'Success response')

            console.log(getResult.data.data)

            assert.equal(getResult.data.data.length, 2, 'Two versions returned')
            assert.equal(getResult.data.data[0].versionId, 0, 'First doc is version 0')
            assert.equal(getResult.data.data[1].versionId, 1, 'Second doc is version 1')

            // @tgodo: re-build document and compare it matches
            
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