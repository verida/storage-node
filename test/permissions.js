var assert = require("assert");
require('dotenv').config();

import AuthManager from "../src/components/authManager"
import DbManager from "../src/components/dbManager";
import UserManager from "../src/components/userManager";
import Db from "../src/components/db";
import Utils from "../src/components/utils";
import TestUtils from "./utils";

const CouchDb = require('nano');
const PouchDb = require('pouchdb');
import { resolve } from "path";

function buildPouch(user, dbName) {
    return new PouchDb(`${user.host}/${dbName}`, {
        requestDefaults: {
            rejectUnauthorized: false
        },
        fetch: function(url, opts) {
            opts.headers.set('Authorization', `Bearer ${user.accessToken}`)
            return PouchDb.fetch(url, opts)
        }
    });
}

const PRIVATE_KEYS = {
    ownerUser: '0x0003b996ec98a9a536efdffbae40e5eaaf117765a587483c69195c9460165000',
    userDid: '0x0003b996ec98a9a536efdffbae40e5eaaf117765a587483c69195c9460165001',
    user2Did: '0x0003b996ec98a9a536efdffbae40e5eaaf117765a587483c69195c9460165002',
    user3Did: '0x0003b996ec98a9a536efdffbae40e5eaaf117765a587483c69195c9460165003',
    user4Did: '0x0003b996ec98a9a536efdffbae40e5eaaf117765a587483c69195c9460165004',
}

describe("Permissions", function() {
    let ownerDb, userDb, user2Db, user3Db, user4Db, publicDb;
    let pouchDbLocal, pouchDbRemote;
    let testDbName = "permissiontestdb";
    let applicationName = "Verida Test: Permissions";

    let accounts = {}

    this.beforeAll(async function() {
        for (var userType in PRIVATE_KEYS) {
            accounts[userType] = await TestUtils.connectAccount(PRIVATE_KEYS[userType]);
            accounts[userType].username = Utils.generateUsername(accounts[userType].did, applicationName);

            accounts[userType].refreshToken = await AuthManager.generateRefreshToken(accounts[userType].did, applicationName)
            accounts[userType].accessToken = await AuthManager.generateAccessToken(accounts[userType].refreshToken)

            accounts[userType].host = Db.buildHost()
        }

        // A public user
        await UserManager.ensurePublicUser();
    });

    describe("Owner (Read and Write)", async function() {
        this.beforeAll(async function() {
            // Create test database where only owner can read and write
            const result = await DbManager.createDatabase(accounts['ownerUser'].username, testDbName, applicationName, {
                permissions: {
                    write: "owner",
                    read: "owner"
                }
            });

            ownerDb = buildPouch(accounts['ownerUser'], testDbName)
            userDb = buildPouch(accounts['userDid'], testDbName)
            publicDb = new PouchDb(Db.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS) + '/' + testDbName, {
                requestDefaults: { rejectUnauthorized: false }
            });
        })
        
        it("should allow owner to write data", async function() {
            // Write a test record
            let response = await ownerDb.put({
                "_id": "owner-read-write",
                "hello": "world"
            });

            assert.equal(response.ok, true);
        });
        it("shouldn't allow user write data", async function() {
            // Write a test record that fails
            await assert.rejects(userDb.put({
                "_id": "user-read-write",
                "hello": "world"
            }), {
                name: "forbidden",
                reason: "You are not allowed to access this db."
            });
        });
        it("shouldn't allow public to write data", async function() {
            // Write a test record that fails
            await assert.rejects(publicDb.put({
                "_id": "public-read-write",
                "hello": "world"
            }), {
                name: "forbidden",
                reason: "You are not allowed to access this db."
            });
        });
        it("should allow owner to read data", async function() {
            let doc = await ownerDb.get("owner-read-write");
            assert.equal(doc._id, "owner-read-write");
        });
        it("shouldn't allow user to read data", async function() {
            await assert.rejects(userDb.get("owner-read-write"), {
                name: "forbidden",
                reason: "You are not allowed to access this db."
            });
        });
        it("shouldn't allow public to read data", async function() {
            await assert.rejects(publicDb.get("owner-read-write"), {
                name: "forbidden",
                reason: "You are not allowed to access this db."
            });
        });

        this.afterAll(async function() {
            // Delete test database
            await DbManager.deleteDatabase(testDbName, accounts["ownerUser"].username);
        });
    });

    describe("Public (Read, not Write)", async function() {
        this.beforeAll(async function() {
            // Create test database where public can read, but not write
            await DbManager.createDatabase(accounts['ownerUser'].username, testDbName, applicationName, {
                permissions: {
                    write: "owner",
                    read: "public"
                }
            });

            ownerDb = buildPouch(accounts['ownerUser'], testDbName)
            publicDb = new PouchDb(Db.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS) + '/' + testDbName, {
                requestDefaults: { rejectUnauthorized: false }
            });
        });

        it("should allow owner to write data", async function() {
            // Write a test record
            let response = await ownerDb.put({
                "_id": "owner-write",
                "hello": "world"
            });

            assert.equal(response.ok, true);
        });
        it("should allow owner to read data", async function() {
            let doc = await ownerDb.get("owner-write");
            assert.equal(doc._id, "owner-write");
        });
        it("shouldn't allow public to write data", async function() {
            // Write a test record that fails
            await assert.rejects(publicDb.put({
                "_id": "public-write",
                "hello": "world"
            }), {
                name: "unauthorized",
                reason: "User is not permitted to write to database"
            });
        });
        it("should allow public to read data", async function() {
            let doc = await publicDb.get("owner-write");
            assert.equal(doc._id, "owner-write");
        });
        

        this.afterAll(async function() {
            // Delete test database
            let response = await DbManager.deleteDatabase(testDbName, accounts["ownerUser"].username);
        });
    });

    describe("Public (Write, not Read)", async function() {
        this.beforeAll(async function() {
            // Create test database where public can write, but not read
            await DbManager.createDatabase(accounts['ownerUser'].username, testDbName, applicationName, {
                permissions: {
                    write: "public",
                    read: "owner"
                }
            });

            ownerDb = buildPouch(accounts['ownerUser'], testDbName)
            publicDb = new PouchDb(Db.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS) + '/' + testDbName, {
                requestDefaults: { rejectUnauthorized: false }
            });
        });

        it("should allow owner to write data", async function() {
            // Write a test record
            let response = await ownerDb.put({
                "_id": "owner-write",
                "hello": "world"
            });

            assert.equal(response.ok, true);
        });
        it("should allow owner to read data", async function() {
            let doc = await ownerDb.get("owner-write");
            assert.equal(doc._id, "owner-write");
        });
        it("should allow public to write data", async function() {
            let response = await publicDb.put({
                "_id": "public-write",
                "hello": "world"
            });

            assert.equal(response.ok, true);
        });

        // If a user has write access in CouchDB, it is not possible to disable read access
        // This test demonstrates that failure, however the documentation will make it clear
        // that if public write is enabled, that will also enable public read
        /*it("shouldn't allow public to read data", async function() {
            let response = await publicDb.get("public-write");

            await assert.rejects(publicDb.get("owner-write"), {
                name: "Error",
                reason: "You are not allowed to access this db."
            });
            await assert.rejects(publicDb.get("public-write"), {
                name: "Error",
                reason: "You are not allowed to access this db."
            });
        });*/

        this.afterAll(async function() {
            // Delete test database
            let response = await DbManager.deleteDatabase(testDbName, accounts["ownerUser"].username);
        });
    });

    // Test other user can read, but not write
    describe("User (Read, not Write)", async function() {
        this.beforeAll(async function() {
            // Create test database where a list of users can write and read
            await DbManager.createDatabase(accounts['ownerUser'].username, testDbName, applicationName, {
                permissions: {
                    write: "users",
                    writeList: [accounts['userDid'].did, accounts['user2Did'].did],
                    read: "users",
                    readList: [accounts['userDid'].did, accounts['user2Did'].did, accounts['user4Did'].did]
                }
            });

            ownerDb = buildPouch(accounts['ownerUser'], testDbName)
            userDb = buildPouch(accounts['userDid'], testDbName)
            user2Db = buildPouch(accounts['user2Did'], testDbName)
            user3Db = buildPouch(accounts['user3Did'], testDbName)
            user4Db = buildPouch(accounts['user4Did'], testDbName)
            publicDb = new PouchDb(Db.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS) + '/' + testDbName, {
                requestDefaults: { rejectUnauthorized: false }
            })
        });

        // owner checks
        it("should allow owner to write data", async function() {
            // Write a test record
            let response = await ownerDb.put({
                "_id": "owner-write",
                "hello": "world"
            });

            assert.equal(response.ok, true);
        });
        it("should allow owner to read data", async function() {
            let doc = await ownerDb.get("owner-write");
            assert.equal(doc._id, "owner-write");
        });

        // public checks
        it("shouldn't allow public to write data", async function() {
            // Write a test record that fails
            await assert.rejects(publicDb.put({
                "_id": "public-write",
                "hello": "world"
            }), {
                name: "forbidden",
                reason: "You are not allowed to access this db."
            });
        });

        it("shouldn't allow public to read data", async function() {
            await assert.rejects(publicDb.get("owner-write"), {
                name: "forbidden",
                reason: "You are not allowed to access this db."
            });
        });

        // user checks
        it("should allow users to write data", async function() {
            // Write a test record
            let response = await userDb.put({
                "_id": "user-write",
                "hello": "world"
            });

            assert.equal(response.ok, true);

            // Write a test record with second user
            let response2 = await user2Db.put({
                "_id": "user2-write",
                "hello": "world"
            });

            assert.equal(response2.ok, true);
        });
        it("should allow users to read data", async function() {
            let doc = await userDb.get("owner-write");
            assert.equal(doc._id, "owner-write");

            let doc2 = await user2Db.get("owner-write");
            assert.equal(doc2._id, "owner-write");
        });

        it("shouldn't allow non-permissioned users to write data", async function() {
            // Write a test record that fails
            await assert.rejects(user3Db.put({
                "_id": "user-write",
                "hello": "world"
            }), {
                name: "forbidden",
                reason: "You are not allowed to access this db."
            });
        });

        it("shouldn't allow non-permissioned users to read data", async function() {
            await assert.rejects(user3Db.get("user-write"), {
                name: "forbidden",
                reason: "You are not allowed to access this db."
            });
        });

        it("shouldn't allow read only user to write data", async function() {
            await assert.rejects(user4Db.put({
                "_id": "user-read-trying-to-write",
                "hello": "world"
            }), {
                name: "unauthorized",
                reason: "User is not permitted to write to database"
            });
        });

        it("shouldn't allow read only user to sync to database", async function() {
            pouchDbLocal = new PouchDb(testDbName);
            pouchDbRemote = buildPouch(accounts['user4Did'], testDbName)

            const localInfo = await pouchDbLocal.info()
            const remoteInfo = await pouchDbRemote.info()
            
            const promise = new Promise((resolve, rejects) => {
                const result = pouchDbLocal.put({
                    "_id": "user-read-trying-to-write",
                    "hello": "world"
                })
                result.then((res) => {
                    resolve(res)
                }).catch((err) => {
                    rejects(err)
                }) 
            })

            const sync = PouchDb.sync(pouchDbLocal, pouchDbRemote, {
                live: true,
                retry: true,
                // Dont sync design docs
                filter: function (doc) {
                  return doc._id.indexOf("_design") !== 0;
                },
              })
                .on("error", function (err) {
                  console.error(
                    `Unknown error occurred syncing with remote database`
                  );
                  console.error(err);
                })
                .on("denied", function (err) {
                  console.error(
                    `Permission denied to sync with remote database`
                  );
                  resolve()
                });

            const result = await promise
        })

        this.afterAll(async function() {
            // Delete test database
            await DbManager.deleteDatabase(testDbName, accounts["ownerUser"].username);
            pouchDbLocal.destroy(testDbName);
        });
    });

    // Test updating permissions correcty updates the list of valid users
    describe("User update permissions", async function() {
        this.beforeAll(async function() {
            // Create test database where a list of users can write and read
            await DbManager.createDatabase(accounts['ownerUser'].username, testDbName, applicationName, {
                permissions: {
                    write: "users",
                    writeList: [accounts['userDid'].did],
                    read: "users",
                    readList: [accounts['userDid'].did]
                }
            });

            ownerDb = buildPouch(accounts['ownerUser'], testDbName)
            userDb = buildPouch(accounts['userDid'], testDbName)
            user2Db = buildPouch(accounts['user2Did'], testDbName)
            publicDb = new PouchDb(Db.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS) + '/' + testDbName, {
                requestDefaults: { rejectUnauthorized: false }
            })

            await DbManager.updateDatabase(accounts['ownerUser'].username, testDbName, applicationName, {
                permissions: {
                    write: "users",
                    writeList: [accounts['userDid'].did, accounts['user2Did'].did],
                    read: "users",
                    readList: [accounts['userDid'].did, accounts['user2Did'].did]
                }
            });
        });

        it("should allow owner to write data", async function() {
            // Write a test record
            let response = await ownerDb.put({
                "_id": "owner-write",
                "hello": "world"
            });

            assert.equal(response.ok, true);
        });

        it("should allow user2 to write data", async function() {
            let response = await user2Db.put({
                "_id": "user-write",
                "hello": "world"
            });

            assert.equal(response.ok, true);
        });

        it("should allow user2 to read data", async function() {
            let doc = await user2Db.get("owner-write");
            assert.equal(doc._id, "owner-write");
        });

        this.afterAll(async function() {
            // Delete test database
            await DbManager.deleteDatabase(testDbName);
        });

    });

    after(async function() {
        await DbManager.deleteDatabase(testDbName, accounts["ownerUser"].username);
        // TODO: delete owner, user, but leave public
    })
});