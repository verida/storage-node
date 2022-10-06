const basicAuth = require('express-basic-auth');
import { DIDClient } from '@verida/did-client';
const mcache = require('memory-cache');

let didClient;

class RequestValidator {
  /**
   * Allow access to any user who provides a valid signed message for the given application
   *
   * @todo: cache the signature verifications
   *
   * @param {*} did
   * @param {*} password
   * @param {*} req
   */
  authorize(did, signature, req, cb) {
    did = did.replace(/_/g, ':').toLowerCase();
    const cacheKey = `${did}/${req.headers['application-name']}`;

    const authCheck = async () => {
      try {
        let didDocument = mcache.get(cacheKey);
        const storageContext = req.headers['application-name'];
        const consentMessage = `Do you wish to unlock this storage context: "${storageContext}"?\n\n${did}`;

        if (!didDocument) {
          if (!didClient) {
            const didClientConfig = {
              network: process.env.DID_NETWORK ? process.env.DID_NETWORK : 'testnet',
              rpcUrl: process.env.DID_RPC_URL
            }

            didClient = new DIDClient(didClientConfig);
          }

          didDocument = await didClient.get(did);

          if (!didDocument) {
            cb(null, false);
            return;
          }

          if (didDocument) {
            const { DID_CACHE_DURATION } = process.env;
            mcache.put(cacheKey, didDocument, DID_CACHE_DURATION * 1000);
          }
        }

        const result = didDocument.verifySig(consentMessage, signature);

        if (!result) {
          cb(null, false);
        } else {
          cb(null, true);
        }
      } catch (err) {
        // @todo: Log error
        // Likely unable to resolve DID
        console.error(err);
        cb(null, false);
      }
    };

    const promise = new Promise((resolve, rejects) => {
      authCheck();
      resolve();
    });
  }

  getUnauthorizedResponse(req) {
    return {
      status: 'fail',
      code: 90,
      data: {
        auth: 'Invalid credentials supplied',
      },
    };
  }
}

let requestValidator = new RequestValidator();
export default requestValidator;
