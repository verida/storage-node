import Db from "../../components/db.js"

class Utils {

    // @todo
    verifyDocument(did, document, expectedValues = {}) {
        const doc = document.export()
        for (let key in expectedValues) {
            if (doc[key] != expectedValues[key]) {
                throw new Error(`Invalid value for ${key}`)
            }
        }

        //throw new Error(`versionId not set`)
        /*
        versionId
        created
        updated
        deactivated
        proof — A string representing the full DID Document as a JSON encoded string that has been hashed using keccak256 and signed with ed25519, the default Ethereum based signature scheme.
        */

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

    getDidDocumentDb() {
        const couch = Db.getCouch()
        return couch.db.use(process.env.DB_DIDS);
    }

    async getDidDocument(did, allVersions=false, stripCouchMetadata=true) {
        const db = this.getDidDocumentDb()

        const query = {
            selector: {
                id: did
            },
            fields: ['id', 'versionId'],
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