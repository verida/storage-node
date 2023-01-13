import EncryptionUtils from "@verida/encryption-utils"

class Utils {

    generateHash(value) {
        return EncryptionUtils.hash(value).substring(2);
    }

    generateReplicaterUsername(endpointUri) {
        const hostname = (new URL(endpointUri)).hostname

        return `r${this.generateHash(hostname)}`
    }

    generateDidContextHash(did, contextName) {
        let text = [
            did.toLowerCase(),
            contextName
        ].join("/");

        return this.generateHash(text)
    }

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

    generateReplicatorHash(endpointUri, did, contextName) {
        const hostname = (new URL(endpointUri)).hostname

        let text = [
            hostname,
            did.toLowerCase(),
            contextName
        ].join("/");
        
        const hash = EncryptionUtils.hash(text).substring(2);

        // Database name must start with a letter
        return "e" + hash
    }

    didsToUsernames(dids, contextName) {
        const usernames = []
        for (let d in dids) {
            if (!dids[d]) {
                continue
            }

            usernames.push(this.generateUsername(dids[d].toLowerCase(), contextName))
        }

        return usernames
    }

    signResponse(response, privateKey) {
        privateKey = new Uint8Array(Buffer.from(privateKey.substring(2),'hex'))
        return EncryptionUtils.signData(response, privateKey)
    }

    signedResponse(data, response) {
        const signature = this.signResponse(data, process.env.VDA_PRIVATE_KEY)
        return response.status(200).send({
            ...data,
            signature
        });
    }

    async error(res, message, httpStatus=400) {
        return res.status(httpStatus).send({
            status: "fail",
            message
        })
    }

    async success(res, data) {
        return res.status(200).send({
            status: "success",
            data
        })
    }

    serverUri() {
        return process.env.ENDPOINT_URI
    }

}

let utils = new Utils();
export default utils;