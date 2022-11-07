import assert from 'assert';
import dotenv from 'dotenv';
import Axios from 'axios'
import {ethers} from 'ethers'

import AuthManager from "../src/components/authManager";
import TestUtils from "./utils"

import CONFIG from './config'
const { CONTEXT_NAME, SERVER_URL, TEST_DEVICE_ID } = CONFIG

const DID_URL = `${SERVER_URL}/did`


let authJwt, accountInfo, authRequestId
let refreshToken, accessToken, newRefreshToken

const wallet = ethers.Wallet.createRandom()
const DID = `did:vda:${wallet.address}`

describe("DID Storage Tests", function() {
    /*this.beforeAll(async () => {
        //await AuthManager.initDb() -- This is required if the server is running locally and has never been run before, run just once
        //await TestUtils.ensureVeridaAccount(CONFIG.VDA_PRIVATE_KEY) -- This is required if the private key has never been initilaized with an application context, run just once
        accountInfo = await TestUtils.connectAccount(CONFIG.VDA_PRIVATE_KEY)
    })*/

    describe("Create", () => {
        it("Success", async () => {
            console.log(`${DID_URL}/${DID}`)
            const createResult = await Axios.post(`${DID_URL}/${DID}`, {
                hello: 'world'
            });

            console.log(createResult.data)
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

    describe("Get", () => {
        it("Success", async () => {
            console.log(`${DID_URL}/${DID}`)
            const createResult = await Axios.get(`${DID_URL}/${DID}`, {
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