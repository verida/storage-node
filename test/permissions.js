var assert = require("assert");
require('dotenv').config();

import DbManager from "../src/components/dbManager";
import UserManager from "../src/components/userManager";
import Utils from "../src/components/utils";

const CouchDb = require('nano');

describe("Permissions", function() {
    var ownerUser, userUser, user2User, user3User;
    var ownerDb, userDb, user2Db, user3Db, publicDb;
    var testDbName = "testdb1";
    var applicationName = "testApp";

    var ownerDid = "test-owner";
    var userDid = "test-user";
    var user2Did = "test-user2";
    var user3Did = "test-user3";

    var ownerName = Utils.generateUsername(ownerDid, applicationName);
    var userName = Utils.generateUsername(userDid, applicationName);
    var user2Name = Utils.generateUsername(user2Did, applicationName);
    var user3Name = Utils.generateUsername(user3Did, applicationName);

    this.beforeAll(async function() {
        // The "owner" of a database
        await UserManager.create(ownerName, "test-owner");
        ownerUser = await UserManager.getByUsername(ownerName, "test-owner");

        // Another user that isn't an "owner"
        await UserManager.create(userName, "test-user");
        userUser = await UserManager.getByUsername(userName, "test-user");

        // A second user that isn't an "owner"
        await UserManager.create(user2Name, "test-user2");
        user2User = await UserManager.getByUsername(user2Name, "test-user2");

        // A third user that has no access
        await UserManager.create(user3Name, "test-user3");
        user3User = await UserManager.getByUsername(user3Name, "test-user3");

        // A public user
        await UserManager.ensurePublicUser();
    });

    describe("Owner (Read and Write)", async function() {
        this.beforeAll(async function() {
            // Create test database where only owner can read and write
            await DbManager.createDatabase(ownerUser.username, testDbName, applicationName, {
                permissions: {
                    write: "owner",
                    read: "owner"
                }
            });

            let couchDb = new CouchDb({ url: ownerUser.dsn, requestDefaults: { rejectUnauthorized: false }});
            ownerDb = couchDb.use(testDbName);

            couchDb = new CouchDb({ url: userUser.dsn, requestDefaults: { rejectUnauthorized: false }});
            userDb = couchDb.use(testDbName);

            couchDb = new CouchDb({ url: UserManager.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS), requestDefaults: { rejectUnauthorized: false }});
            publicDb = couchDb.use(testDbName);
        })
        
        it("should allow owner to write data", async function() {
            // Write a test record
            let response = await ownerDb.insert({
                "_id": "owner-read-write",
                "hello": "world"
            });

            assert.equal(response.ok, true);
        });
        it("shouldn't allow user write data", async function() {
            // Write a test record that fails
            await assert.rejects(userDb.insert({
                "_id": "user-read-write",
                "hello": "world"
            }), {
                name: "Error",
                reason: "You are not allowed to access this db."
            });
        });
        it("shouldn't allow public to write data", async function() {
            // Write a test record that fails
            await assert.rejects(publicDb.insert({
                "_id": "public-read-write",
                "hello": "world"
            }), {
                name: "Error",
                reason: "You are not allowed to access this db."
            });
        });
        it("should allow owner to read data", async function() {
            let doc = await ownerDb.get("owner-read-write");
            assert.equal(doc._id, "owner-read-write");
        });
        it("shouldn't allow user to read data", async function() {
            await assert.rejects(userDb.get("owner-read-write"), {
                name: "Error",
                reason: "You are not allowed to access this db."
            });
        });
        it("shouldn't allow public to read data", async function() {
            await assert.rejects(publicDb.get("owner-read-write"), {
                name: "Error",
                reason: "You are not allowed to access this db."
            });
        });
        

        this.afterAll(async function() {
            // Delete test database
            let response = await DbManager.deleteDatabase(testDbName);
        });
    });

    describe("Public (Read, not Write)", async function() {
        this.beforeAll(async function() {
            // Create test database where public can read, but not write
            await DbManager.createDatabase(ownerUser.username, testDbName, applicationName, {
                permissions: {
                    write: "owner",
                    read: "public"
                }
            });

            let couchDb = new CouchDb({ url: ownerUser.dsn, requestDefaults: { rejectUnauthorized: false }});
            ownerDb = couchDb.use(testDbName);

            couchDb = new CouchDb({ url: UserManager.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS), requestDefaults: { rejectUnauthorized: false }});
            publicDb = couchDb.use(testDbName);
        });

        it("should allow owner to write data", async function() {
            // Write a test record
            let response = await ownerDb.insert({
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
            await assert.rejects(publicDb.insert({
                "_id": "public-write",
                "hello": "world"
            }), {
                name: "Error",
                reason: "User is not permitted to write to database"
            });
        });
        it("should allow public to read data", async function() {
            let doc = await publicDb.get("owner-write");
            assert.equal(doc._id, "owner-write");
        });
        

        this.afterAll(async function() {
            // Delete test database
            let response = await DbManager.deleteDatabase(testDbName);
        });
    });

    describe("Public (Write, not Read)", async function() {
        this.beforeAll(async function() {
            // Create test database where public can write, but not read
            await DbManager.createDatabase(ownerUser.username, testDbName, applicationName, {
                permissions: {
                    write: "public",
                    read: "owner"
                }
            });

            let couchDb = new CouchDb({ url: ownerUser.dsn, requestDefaults: { rejectUnauthorized: false }});
            ownerDb = couchDb.use(testDbName);

            couchDb = new CouchDb({ url: UserManager.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS), requestDefaults: { rejectUnauthorized: false }});
            publicDb = couchDb.use(testDbName);
        });

        it("should allow owner to write data", async function() {
            // Write a test record
            let response = await ownerDb.insert({
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
            let response = await publicDb.insert({
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
            let response = await DbManager.deleteDatabase(testDbName);
        });
    });

    // Test other user can read, but not write
    describe("User (Read, not Write)", async function() {
        this.beforeAll(async function() {
            // Create test database where a list of users can write and read
            await DbManager.createDatabase(ownerUser.username, testDbName, applicationName, {
                permissions: {
                    write: "users",
                    writeList: [userDid, user2Did],
                    read: "users",
                    readList: [userDid, user2Did]
                }
            });

            let couchDb = new CouchDb({ url: ownerUser.dsn, requestDefaults: { rejectUnauthorized: false }});
            ownerDb = couchDb.use(testDbName);

            couchDb = new CouchDb({ url: userUser.dsn, requestDefaults: { rejectUnauthorized: false }});
            userDb = couchDb.use(testDbName);

            couchDb = new CouchDb({ url: user2User.dsn, requestDefaults: { rejectUnauthorized: false }});
            user2Db = couchDb.use(testDbName);

            couchDb = new CouchDb({ url: user3User.dsn, requestDefaults: { rejectUnauthorized: false }});
            user3Db = couchDb.use(testDbName);

            couchDb = new CouchDb({ url: UserManager.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS), requestDefaults: { rejectUnauthorized: false }});
            publicDb = couchDb.use(testDbName);
        });

        // owner checks
        it("should allow owner to write data", async function() {
            // Write a test record
            let response = await ownerDb.insert({
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
            await assert.rejects(publicDb.insert({
                "_id": "public-write",
                "hello": "world"
            }), {
                name: "Error",
                reason: "You are not allowed to access this db."
            });
        });

        it("shouldn't allow public to read data", async function() {
            await assert.rejects(publicDb.get("owner-write"), {
                name: "Error",
                reason: "You are not allowed to access this db."
            });
        });

        // user checks
        it("should allow users to write data", async function() {
            // Write a test record
            let response = await userDb.insert({
                "_id": "user-write",
                "hello": "world"
            });

            assert.equal(response.ok, true);

            // Write a test record with second user
            let response2 = await user2Db.insert({
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
            await assert.rejects(user3Db.insert({
                "_id": "user-write",
                "hello": "world"
            }), {
                name: "Error",
                reason: "You are not allowed to access this db."
            });
        });

        it("shouldn't allow non-permissioned users to read data", async function() {
            await assert.rejects(user3Db.get("user-write"), {
                name: "Error",
                reason: "You are not allowed to access this db."
            });
        });

        this.afterAll(async function() {
            // Delete test database
            let response = await DbManager.deleteDatabase(testDbName);
        });
    });

    // Test updating permissions correcty updates the list of valid users
    describe("User update permissions", async function() {
        this.beforeAll(async function() {
            // Create test database where a list of users can write and read
            await DbManager.createDatabase(ownerUser.username, testDbName, applicationName, {
                permissions: {
                    write: "users",
                    writeList: [userDid],
                    read: "users",
                    readList: [userDid]
                }
            });

            let couchDb = new CouchDb({ url: ownerUser.dsn, requestDefaults: { rejectUnauthorized: false }});
            ownerDb = couchDb.use(testDbName);

            couchDb = new CouchDb({ url: userUser.dsn, requestDefaults: { rejectUnauthorized: false }});
            userDb = couchDb.use(testDbName);

            couchDb = new CouchDb({ url: user2User.dsn, requestDefaults: { rejectUnauthorized: false }});
            user2Db = couchDb.use(testDbName);

            couchDb = new CouchDb({ url: UserManager.buildDsn(process.env.DB_PUBLIC_USER, process.env.DB_PUBLIC_PASS), requestDefaults: { rejectUnauthorized: false }});
            publicDb = couchDb.use(testDbName);

            await DbManager.updateDatabase(ownerUser.username, testDbName, applicationName, {
                permissions: {
                    write: "users",
                    writeList: [userDid, user2Did],
                    read: "users",
                    readList: [userDid, user2Did]
                }
            });
        });

        it("should allow owner to write data", async function() {
            // Write a test record
            let response = await ownerDb.insert({
                "_id": "owner-write",
                "hello": "world"
            });

            assert.equal(response.ok, true);
        });

        it("should allow user2 to write data", async function() {
            let response = await user2Db.insert({
                "_id": "user-write",
                "hello": "world"
            });

            assert.equal(response.ok, true);
        });

        it("should allow user2 to read data", async function() {
            let doc = await user2Db.get("owner-write");
            assert.equal(doc._id, "owner-write");
        });


    });

    after(async function() {
        // TODO: delete owner, user, but leave public
    })
});