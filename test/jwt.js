var assert = require("assert");
require('dotenv').config();

import UserManager from "../src/components/userManager";
import DbManager from "../src/components/dbManager";
import Utils from "../src/components/utils";
import PouchDb from "pouchdb";
const jwt = require('jsonwebtoken')

const secretKey = process.env.JWT_SIGN_PK
const expiryMinutes = parseInt(process.env.JWT_SIGN_EXPIRY)

const applicationName = "jwtTestApp";
const testDbName = "testdb5";
const user5Did = "test-user5";
const user5Name = Utils.generateUsername(user5Did, applicationName);

describe("JWTs", function() {
    describe("Manage JWTs", async function() {
        it("Encode secret", async function() {
            const encodedKey = Buffer.from(secretKey).toString('base64')
            assert.equal(encodedKey, "aW5zZXJ0LXJhbmRvbS1zeW1tZXRyaWMta2V5", "Encoded secret is expected value")
        })
    })

    describe("Generate valid JWTs", async function() {
        it("Can generate and return user JWT", async function() {
            await UserManager.create(user5Name, "test-user5");
            const user5User = await UserManager.getByUsername(user5Name, "test-user5");
            
            // Token generated for a user
            assert.ok(user5User.token, "Token exists")
            
            const verifyResult = jwt.verify(user5User.token, secretKey, {
                complete: true
            })

            assert.equal(user5Name, verifyResult.payload.sub, "Username matches expected value")
            assert.equal(verifyResult.header.alg, 'HS256', 'HS256 algorithm used')

            const timeDiff = verifyResult.payload.exp - verifyResult.payload.iat
            assert.equal(timeDiff, expiryMinutes*60, 'Expiry time is expected length')
        })

        it("Can connect to CouchDB with a JWT", async function() {
            await UserManager.create(user5Name, "test-user5");
            const user5User = await UserManager.getByUsername(user5Name, "test-user5");

            // Create test database where only owner can read and write
            await DbManager.createDatabase(user5User.username, testDbName, applicationName, {
                permissions: {
                    write: "owner",
                    read: "owner"
                }
            });

            // Make a CouchDB request using token
            const token = user5User.token
            const pouchDb = new PouchDb(`${user5User.host}/${testDbName}`, {
                requestDefaults: {
                    rejectUnauthorized: false
                },
                fetch: function(url, opts) {
                    opts.headers.set('Authorization', `Bearer ${token}`)
                    return PouchDb.fetch(url, opts)
                }
            });
            
            const info = await pouchDb.info()
            assert.ok(info, "Have an info object returned")
            assert.equal(info.db_name, testDbName, "Database name matches")
        })
    })
})