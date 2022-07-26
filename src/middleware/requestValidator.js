import { DIDClient } from '@verida/did-client';
import mcache from 'memory-cache';

let didClient;

class RequestValidator {
  /**
   * Allow access to any user who provides a valid signed message for the given application
   *
   * @todo: cache the signature verifications
   *
   * @param {string} did - username
   * @param {string} signature - password
   * @param {Request} req
   * @param {function} cb
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
            const { DID_SERVER_URL } = process.env;
            didClient = new DIDClient(DID_SERVER_URL);
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

    const promise = new Promise((resolve, _rejects) => {
      authCheck();
      resolve();
    });
  }

  getUnauthorizedResponse(_req) {
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
