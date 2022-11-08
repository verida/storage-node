import { DIDDocument } from "@verida/did-document"
import Utils from './utils'

class DidStorage {

    async create(req, res) {
        // Verify request parameters
        if (!req.params.did) {
            return Utils.error(res, `No DID specified`)
        }

        if (!req.body.document) {
            return Utils.error(res, `No document specified`)
        }

        const did = req.params.did.toLowerCase()
        const didDocument = new DIDDocument(req.body.document)
        const jsonDoc = didDocument.export()

        try {
            Utils.verifyDocument(did, didDocument, {
                versionId: 0
            })
        } catch (err) {
            console.error(err.message)
            return Utils.error(res, `Invalid DID Document: ${err.message}`)
        }

        // @ todo Ensure there is currently no entry for the given DID in the DID Registry
        //  OR
        //  there is currently an entry and it references this storage node endpoint

        // Save the DID document
        const didDb = Utils.getDidDocumentDb()

        // Create CouchDB database user matching username and password
        const documentData = {
            _id: jsonDoc.id,
            ...jsonDoc
        };

        try {
            await didDb.insert(documentData);
            return Utils.success(res, {});
        } catch (err) {
            if (err.error == 'conflict') {
                return Utils.error(res, `DID Document already exists. Use PUT request to update.`)
            }

            return Utils.error(res, `Unknown error: ${err.message}`)
        }
    }
    
    async update(req, res) {
        const did = req.params.did

        return res.status(200).send({
            status: "success-update",
            data: {
                "did": did
            }
        });
    }

    async delete(req, res) {
        const did = req.params.did

        return res.status(200).send({
            status: "success-delete",
            data: {
                "did": did
            }
        });
    }

    async get(req, res) {
        const did = req.params.did.toLowerCase()
        const allVersions = req.query.allVersions && req.query.allVersions === 'true'

        try {
            const document = await Utils.getDidDocument(did, allVersions)

            let result
            if (allVersions) {
                // strip `_id`, `_rev` and `_revisions` from documents
                console.log(document)
                const versions = document.map(item => {
                    delete item['_id']
                    delete item['_rev']
                    delete item['_revisions']

                    return item
                })

                result = {
                    versions
                }
            } else {
                delete document['_id']
                result = document
            }

            return Utils.success(res, result)
        } catch (err) {
            if (err.reason == 'missing') {
                return Utils.error(res, `DID Document not found.`, 404)
            }

            console.error(err)
            return Utils.error(res, `Unknown error: ${err.message}`)
        }
    }

    async migrate(req, res) {
        const did = req.params.did

        return res.status(200).send({
            status: "success-migrate",
            data: {
                "did": did
            }
        });
    }

}

const didStorage = new DidStorage();
export default didStorage;