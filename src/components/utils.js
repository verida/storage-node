
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
        
        return EncryptionUtils.hash(text).substring(2);
    }

    didsToUsernames(dids, contextName) {
        if (!dids || !dids.length) {
            return [];
        }

        let usernames = [];
        for (var d in dids) {
            if (!dids[d]) {
                continue
            }

            const did = dids[d].toLowerCase()
            usernames.push(this.generateUsername(did, contextName))
        }

        return usernames;
    }

}

let utils = new Utils();
export default utils;