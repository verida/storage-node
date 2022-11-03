import { EnvironmentType } from "@verida/account"
require('dotenv').config();

export default {
    DID_CLIENT_CONFIG: {
        callType: 'web3',
        web3Config: {
            privateKey: ''
        },
    },
    ENVIRONMENT: EnvironmentType.TESTNET,
    SERVER_URL: `https://sn-acacia1.tn.verida.tech`,
    VDA_PRIVATE_KEY: '0x19d3b996ec98a9a536efdffbae41e5eaaf117765a587483c69195c9460165c34',
    CONTEXT_NAME: 'Verida Storage Node Test: Test Application 1',
    DATABASE_SERVER: 'https://sn-acacia1.tn.verida.tech/',  // http://localhost:5000/ for local testing when running local @verida/storage-node
    MESSAGE_SERVER: 'https://sn-acacia1.tn.verida.tech/',  // http://localhost:5000/ for local testing when running local @verida/storage-node
    DEFAULT_ENDPOINTS: {
        defaultDatabaseServer: {
            type: 'VeridaDatabase',
            endpointUri: 'https://sn-acacia1.tn.verida.tech/'
        },
        defaultMessageServer: {
            type: 'VeridaMessage',
            endpointUri: 'https://sn-acacia1.tn.verida.tech/'
        },
    },
    TEST_DEVICE_ID: 'Unit test device'
}