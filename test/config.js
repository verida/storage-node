import { EnvironmentType } from "@verida/account"
import dotenv from 'dotenv';

dotenv.config();

export default {
    DID_CLIENT_CONFIG: {
        network: EnvironmentType.TESTNET,
        callType: 'web3',
        web3Config: {
            privateKey: '',
            rpcUrl: 'https://rpc-mumbai.maticvigil.com'
        },
    },
    ENVIRONMENT: EnvironmentType.TESTNET,
    // No trailing slash
    SERVER_URL: `https://node1-euw6.gcp.devnet.verida.tech`,
    // Private key for a Verida identity that is used for interacting with nodes
    // Note: Ensure this private key has committed its DID to the network
    // Run `yarn run test test/vda-did` to generate a new private key with a valid DID in `verida-js/vda-did`
    VDA_PRIVATE_KEY: '',
    CONTEXT_NAME: 'Verida Storage Node Test: Test Application 1',
    DATABASE_SERVER: 'http://localhost:5000/',  // http://localhost:5000/ for local testing when running local @verida/storage-node
    MESSAGE_SERVER: 'http://localhost:5000/',  // http://localhost:5000/ for local testing when running local @verida/storage-node
    DEFAULT_ENDPOINTS: {
        defaultDatabaseServer: {
            type: 'VeridaDatabase',
            endpointUri: 'https://node1-euw6.gcp.devnet.verida.tech'
        },
        defaultMessageServer: {
            type: 'VeridaMessage',
            endpointUri: 'https://node1-euw6.gcp.devnet.verida.tech'
        },
    },
    TEST_DEVICE_ID: 'Unit test device'
}