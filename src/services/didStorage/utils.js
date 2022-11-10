import Db from "../../components/db.js"
import dotenv from 'dotenv';
dotenv.config();

class Utils {

    // @todo
    verifyDocument(did, document, expectedValues = {}) {
        const doc = document.export()
        if (doc.id != did) {
            throw new Error(`DID must match ID in the DID Document`)
        }

        for (let key in expectedValues) {
            if (doc[key] != expectedValues[key]) {
                throw new Error(`Missing value for ${key} (Expected ${expectedValues[key]})`)
            }
        }

        const requiredFields = ['versionId', 'created', 'updated', 'proof']
        requiredFields.forEach(field => {
            if (!doc.hasOwnProperty(field)) {
                throw new Error(`Missing required field (${field})`)
            }
        })

        if (typeof(doc.versionId) !== 'number') {
            throw new Error(`versionId must be a number`)
        }

        // ie: 2020-12-20T19:17:47Z
        // @see https://www.w3.org/TR/did-core/#did-document-metadata
        if (!Date.parse(doc.created) || document.buildTimestamp(new Date(Date.parse(doc.created))) != doc.created) {
            console.log(new Date(Date.parse(doc.created)))
            console.log(doc.created)
            throw new Error(`created must be a valid timestamp`)
        }

        // ie: 2020-12-20T19:17:47Z
        // @see https://www.w3.org/TR/did-core/#did-document-metadata
        if (!Date.parse(doc.updated) || document.buildTimestamp(new Date(Date.parse(doc.updated))) != doc.updated) {
            throw new Error(`created must be a valid timestamp`)
        }

        if (doc.deactivated && typeof(doc.deactivated) !== 'boolean') {
            throw new Error(`deactivated must be a valid boolean value`)
        }

        if (!document.verifyProof()) {
            throw new Error(`Invalid proof`)
        }

        return true
    }

    async error(res, message, httpStatus=400) {
        return res.status(httpStatus).send({
            status: "fail",
            message
        })
    }

    async success(res, data) {
        return res.status(200).send({
            status: "success",
            data
        })
    }

    getDb() {
        return Db.getCouch()
    }

    async createDb() {
        try {
            const couch = this.getDb()
            await couch.db.create(process.env.DB_DIDS)
            const dbDids = couch.db.use(process.env.DB_DIDS)
            await dbDids.createIndex({
                index: {
                    fields: ['id', 'versionId']
                },
                name: 'did'
            })
        } catch (err) {
            if (err.message == "The database could not be created, the file already exists.") {
                console.log("DID database not created -- already existed");
            } else {
                throw err;
            }
        }
    }

    getDidDocumentDb() {
        return this.getDb().use(process.env.DB_DIDS);
    }

    async getDidDocument(did, allVersions=false, stripCouchMetadata=true) {
        const db = this.getDidDocumentDb()

        const query = {
            selector: {
                id: did
            },
            sort: [
                {'versionId': 'desc'}
            ],
            limit: 1
        }

        const result = await db.find(query)

        if (result.docs.length === 0) {
            return
        }

        const latestDoc = result.docs[0]
        let resultDocs = [latestDoc]

        if (allVersions) {
            const latestVersion = latestDoc.versionId
            const keys = []
            for (let i = 0; i<=latestVersion; i++) {
                keys.push(`${did}-${i}`)
            }

            // Fetch all the versions
            const allDocs = await db.fetch({ keys })
            resultDocs = allDocs.rows
        }

        const docs = resultDocs.map(item => {
            if (item.doc) {
                item = item.doc
            }

            if (stripCouchMetadata) {
                delete item['_id']
                delete item['_rev']
            }

            return item
        })

        if (!allVersions) {
            return docs[0]
        }

        return docs
    }

}

const utils = new Utils();
export default utils;