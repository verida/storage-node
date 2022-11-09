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
            _id: `${jsonDoc.id}-0`,
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

        let existingDoc
        try {
            existingDoc = await Utils.getDidDocument(did)
            
            if (!existingDoc) {
                return Utils.error(res, `DID Document not found`)
            }

            const nextVersionId = existingDoc.versionId + 1
            Utils.verifyDocument(did, didDocument, {
                created: existingDoc.created,
                versionId: nextVersionId
            })

            if (existingDoc.updated > jsonDoc.updated) {
                return Utils.error(res, `updated must be after the current document`)
            }
        } catch (err) {
            return Utils.error(res, `Invalid DID Document: ${err.message}`)
        }

        // @ todo Ensure there is currently no entry for the given DID in the DID Registry
        //  OR
        //  there is currently an entry and it references this storage node endpoint

        const didDb = Utils.getDidDocumentDb()

        // Create CouchDB database user matching username and password
        const documentData = {
            _id: `${jsonDoc.id}-${jsonDoc.versionId}`,
            ...jsonDoc
        };

        try {
            await didDb.insert(documentData);
            return Utils.success(res, {});
        } catch (err) {
            /*if (err.error == 'conflict') {
                return Utils.error(res, `DID Document already exists. Use PUT request to update.`)
            }*/

            return Utils.error(res, `Unknown error: ${err.message}`)
        }
    }

    async delete(req, res) {
        if (!req.params.did) {
            return Utils.error(res, `No DID specified`)
        }

        const did = req.params.did.toLowerCase()
        const didDocuments = await Utils.getDidDocument(did, true, false)

        if (!didDocuments || didDocuments.length === 0) {
            return Utils.error(res, `DID Document not found`)
        }

        const didDb = Utils.getDidDocumentDb()
        const docs = []

        didDocuments.forEach(doc => {
            docs.push({
                _id: doc._id,
                _rev: doc._rev,
                _deleted: true
            })
        })

        const deleteResponse = await didDb.bulk({
            docs
        })

        return Utils.success(res, {
            did,
            revisions: docs.length
        });
    }

    async get(req, res) {
        const did = req.params.did.toLowerCase()
        const allVersions = req.query.allVersions && req.query.allVersions === 'true'

        const result = await Utils.getDidDocument(did, allVersions)
        if (!result) {
            return Utils.error(res, `DID Document not found.`, 404)
        }

        return Utils.success(res, result)
    }

    async migrate(req, res) {
        return Utils.error(res, `Not implemented (yet)`, 404)
        /*
        const did = req.params.did

        return res.status(200).send({
            status: "success-migrate",
            data: {
                "did": did
            }
        });*/
    }

}

const didStorage = new DidStorage();
export default didStorage;