import Db from "../../components/db.js"

class Utils {

    // @todo
    verifyDocument(did, document, expectedValues = {}) {
        console.log('verifying doc')

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

    async getDidDocument(did, all=false) {
        const db = this.getDidDocumentDb()

        /*const res = await db.list({
            include_docs: true
        })
        console.log(res.rows[3])*/

        const options = {}
        if (all) {
            options.meta = true
        }

        console.log(did, options)

        return db.get(did.toLowerCase(), options)
    }

}

const utils = new Utils();
export default utils;