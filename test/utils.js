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
const SERVER_URL = CONFIG.SERVER_URL

class Utils {

    async ensureVeridaAccount(privateKey) {
        const account = new AutoAccount({
            privateKey: privateKey,
            didClientConfig: CONFIG.DID_CLIENT_CONFIG,
            environment: CONFIG.ENVIRONMENT
        }, CONFIG.DEFAULT_ENDPOINTS)

        return await Network.connect({
            client: {
                environment: CONFIG.ENVIRONMENT
            },
            account: account,
            context: {
                name: CONFIG.CONTEXT_NAME
            }
        })
    }

    async connectAccount(privateKey) {
        const account = new AutoAccount({
            privateKey: privateKey,
            didClientConfig: CONFIG.DID_CLIENT_CONFIG,
            environment: CONFIG.ENVIRONMENT
        }, CONFIG.DEFAULT_ENDPOINTS)

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

    async deleteDatabase(databaseName, did, contextName, accessToken, serverUrl) {
        if (!serverUrl) {
            serverUrl = CONFIG.SERVER_URL
        }

        const response = await Axios.post(`${serverUrl}/user/deleteDatabase`, {
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

    async pingDatabases(endpointUri, accessToken, databaseHashes) {
        if (typeof(databaseHashes) === 'string') {
            databaseHashes = [databaseHashes]
        }

        const response = await Axios.post(`${endpointUri}/user/pingDatabases`, {
            databaseHashes
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
        
        // Skip signature verification if running on localhost
        // (local private key is different from the remote private key)
        if (!SERVER_URL.match('localhost')) {
            return true
        }

        const signature = response.data.signature
        delete response.data['signature']
        return EncryptionUtils.verifySig(response.data, signature, VDA_PUBLIC_KEY)
    }

    async sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
      }
}

const utils = new Utils()
export default utils