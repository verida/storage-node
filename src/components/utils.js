import EncryptionUtils from "@verida/encryption-utils"

class Utils {

    generateUsername(did, contextName) {
        did = did.toLowerCase()
        const text = [
            did,
            contextName
        ].join('/')

        const hash = EncryptionUtils.hash(text).substring(2)

        // Username must start with a letter
        return "v" + hash
    }

    generateDatabaseName(did, contextName, databaseName) {
        let text = [
            did.toLowerCase(),
            contextName,
            databaseName,
        ].join("/");
        
        const hash = EncryptionUtils.hash(text).substring(2);

        // Database name must start with a letter
        return "v" + hash
    }

    didsToUsernames(dids, contextName) {
        return dids ? dids.map(did => this.generateUsername(did, contextName)) : []
    }

}

let utils = new Utils();
export default utils;