import { EnvironmentType } from "@verida/account"
require('dotenv').config();

export default {
    DID_CLIENT_CONFIG: {
        networkPrivateKey: '',
        callType: 'web3',
        web3Config: {},
        rpcUrl: '
    },
    ENVIRONMENT: EnvironmentType.TESTNET,
    SERVER_URL: `http://localhost:${process.env.PORT}`,
    VDA_PRIVATE_KEY: '0x19d3b996ec98a9a536efdffbae41e5eaaf117765a587483c69195c9460165c33',
    CONTEXT_NAME: 'Verida Storage Node Test: Test Application 1',
    DATABASE_SERVER: 'https://db.testnet.verida.io:5002/',  // http://localhost:5000/ for local testing when running local @verida/storage-node
    MESSAGE_SERVER: 'https://db.testnet.verida.io:5002/',  // http://localhost:5000/ for local testing when running local @verida/storage-node
    DEFAULT_ENDPOINTS: {
        defaultDatabaseServer: {
            type: 'VeridaDatabase',
            endpointUri: 'https://db.testnet.verida.io:5002/'
        },
        defaultMessageServer: {
            type: 'VeridaMessage',
            endpointUri: 'https://db.testnet.verida.io:5002/'
        },
    },
    TEST_DEVICE_ID: 'Unit test device'
}