import Axios from 'axios'
import PouchDb from 'pouchdb'
import { AutoAccount } from "@verida/account-node"
import { Network } from "@verida/client-ts"

import CONFIG from './config.js'

class Utils {

    async ensureVeridaAccount(privateKey) {
        const account = new AutoAccount(CONFIG.DEFAULT_ENDPOINTS, {
            privateKey: privateKey,
            didClientConfig: CONFIG.DID_CLIENT_CONFIG,
            environment: CONFIG.ENVIRONMENT
        })

        await Network.connect({
            client: {
                environment: 'testnet'
            },
            account: account,
            context: {
                name: CONFIG.CONTEXT_NAME
            }
        })
    }

    async connectAccount(privateKey) {
        const account = new AutoAccount(CONFIG.DEFAULT_ENDPOINTS, {
            privateKey: privateKey,
            didClientConfig: CONFIG.DID_CLIENT_CONFIG,
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

    async createDatabase(databaseName, did, contextName, accessToken) {
        const response = await Axios.post(`${CONFIG.SERVER_URL}/user/createDatabase`, {
            databaseName,
            did,
            contextName
        }, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        
        return response
    }

}

const utils = new Utils()
export default utils