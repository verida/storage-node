
const crypto = require('crypto');

class Utils {

    generateUsernameFromRequest(req) {
        const did = req.auth.user.toLowerCase()
        const contextName = req.headers['context-name']
        return this.generateUsername(did, contextName)
    }

    generateUsername(did, contextName) {
        did = did.toLowerCase()
        const hash = crypto.createHmac('sha256', process.env.HASH_KEY)
        hash.update(did + "/" + contextName)
        const username = hash.digest('hex')

        // Username must start with a letter
        return "v" + username;
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