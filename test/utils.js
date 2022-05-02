import { AutoAccount } from "@verida/account-node"

import CONFIG from './config'

class Utils {

    async connectAccount(privateKey) {
        const account = new AutoAccount(CONFIG.DEFAULT_ENDPOINTS, {
            privateKey: privateKey,
            didServerUrl: CONFIG.DID_SERVER_URL,
            environment: CONFIG.ENVIRONMENT
        })

        const { CONTEXT_NAME } = CONFIG
        const did = await account.did()

        return {
            account,
            did
        }
    }

}

const utils = new Utils()
export default utils