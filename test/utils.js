import Axios from 'axios'
import PouchDb from 'pouchdb'
import { AutoAccount } from "@verida/account-node"
import { Network } from "@verida/client-ts"
import EncryptionUtils from '@verida/encryption-utils'
import { ethers } from 'ethers'

import CONFIG from './config.js'

import dotenv from 'dotenv';
dotenv.config();

const VDA_PRIVATE_KEY = process.env.VDA_PRIVATE_KEY
const wallet = new ethers.Wallet(VDA_PRIVATE_KEY)
const VDA_PUBLIC_KEY = wallet.publicKey

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

    buildPouchDsn(dsn, dbName) {
        return new PouchDb(`${dsn}/${dbName}`, {
            requestDefaults: {
                rejectUnauthorized: false
            }
        });
    }

    async createDatabase(databaseName, did, contextName, accessToken, serverUrl) {
        if (!serverUrl) {
            serverUrl = CONFIG.SERVER_URL
        }

        const response = await Axios.post(`${serverUrl}/user/createDatabase`, {
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

    async checkReplication(endpointUri, accessToken, databaseName) {
        const response = await Axios.post(`${endpointUri}/user/checkReplication`, {
            databaseName
        }, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        
        return response
    }

    signString(str, privateKey) {
        if (privateKey == 'string') {
            privateKey = new Uint8Array(Buffer.from(privateKey.substr(2),'hex'))
        }
        
        return EncryptionUtils.signData(str, privateKey)
    }

    verifySignature(response) {
        if (!response.data.signature) {
            return false
        }

        const signature = response.data.signature
        delete response.data['signature']
        return EncryptionUtils.verifySig(response.data, signature, VDA_PUBLIC_KEY)
    }
}

const utils = new Utils()
export default utils