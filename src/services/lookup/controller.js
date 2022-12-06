import { DIDClient } from '@verida/did-client'
import Utils from '../utils'
import mcache from 'memory-cache';

class DidLookup {

    async lookup(req, res) {
        // Verify request parameters
        if (!req.params.did) {
            return Utils.error(res, `No DID specified`)
        }

        const did = req.params.did.toLowerCase()

        let doc = mcache.get(did)
        if (doc) {
            return Utils.success(res, {
                did: did,
                document: doc
            })
        }

        const didClient = new DIDClient({
            network: process.env.DID_NETWORK
        })

        try {
            doc = await didClient.get(did)

            if (!doc) {
                return Utils.error(res, `DID document not found`, 404)
            }

            mcache.put(did, doc.export())

            return Utils.success(res, {
                did: did,
                document: doc.export()
            })
        } catch (err) {
            return Utils.error(res, `DID document not found`, 404)
        }
    }

}

const didLookup = new DidLookup();
export default didLookup;