const PouchDb = require('pouchdb');
import { AutoAccount } from "@verida/account-node"

import CONFIG from './config'

class Utils {

    async connectAccount(privateKey) {
        const account = new AutoAccount(CONFIG.DEFAULT_ENDPOINTS, {
            privateKey: privateKey,
            didServerUrl: CONFIG.DID_SERVER_URL,
            environment: CONFIG.ENVIRONMENT
        })

        const did = await account.did()

        return {
            account,
            did
        }
    }

    buildPouch(user, dbName) {
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

}

const utils = new Utils()
export default utils