var assert = require("assert");
require('dotenv').config();
const jwt = require('jsonwebtoken');

import AuthManager from "../src/components/authManager";
import { AutoAccount } from "@verida/account-node"
//import EncryptionUtils from "@verida/encryption-utils";

import CONFIG from './config'

const account = new AutoAccount(CONFIG.DEFAULT_ENDPOINTS, {
    privateKey: CONFIG.VDA_PRIVATE_KEY,
    didServerUrl: CONFIG.DID_SERVER_URL,
    environment: CONFIG.ENVIRONMENT
})

const { CONTEXT_NAME } = CONFIG

describe("AuthManager tests", function() {

    describe("Authenticate", async function() {
        let authJwt, decodedJwt, DID

        it("Generates AuthJWT", async () => {
            DID = await account.did()
            authJwt = AuthManager.generateAuthJwt(DID, CONTEXT_NAME)
            assert.ok(authJwt, 'Have a token response')
            decodedJwt = jwt.verify(authJwt, process.env.TOKEN_JWT_SIGN_PK)

            assert.equal(DID, decodedJwt.sub, "Subject matches the DID")
            assert.equal(CONTEXT_NAME, decodedJwt.contextName, "Correct context name")
            assert.ok(decodedJwt.authRequestId, "Have a valid auth request ID")

            const now = parseInt((new Date()).getTime() / 1000.0)
            assert.equal(decodedJwt.iat - now <= 1, true, 'JWT created in the last second')
            assert.equal(decodedJwt.exp - now - 60 <= 1, true, 'JWT expires within 60 seconds')
        })

        it("Verifies authorization request", async () => {
            const consentMessage = `Authenticate this application context: "${CONTEXT_NAME}"?\n\n${DID}\n${decodedJwt.authRequestId}`
            const signature = await account.sign(consentMessage)

            const isValid = await AuthManager.verifyAuthRequest(authJwt, DID, CONTEXT_NAME, signature)
            assert.equal(isValid, true, "Valid auth request expected")

            const invalidAuthJwt = await AuthManager.verifyAuthRequest("", DID, CONTEXT_NAME, signature)
            assert.equal(invalidAuthJwt, false, "Missing Auth JWT")

            const invalidAuthJwt2 = await AuthManager.verifyAuthRequest("abc", DID, CONTEXT_NAME, signature)
            assert.equal(invalidAuthJwt2, false, "Invalid Auth JWT")

            const invalidDid = await AuthManager.verifyAuthRequest(authJwt, "", CONTEXT_NAME, signature)
            assert.equal(invalidDid, false, "Invalid DID")

            const invalidContext = await AuthManager.verifyAuthRequest(authJwt, DID, "", signature)
            assert.equal(invalidContext, false, "Invalid context")

            const invalidSignature = await AuthManager.verifyAuthRequest(authJwt, DID, CONTEXT_NAME, "")
            assert.equal(invalidSignature, false, "Invalid signature")
        })
    })
})