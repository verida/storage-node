import db from '../components/db'
import Utils from '../components/utils'
import packageJson from '../../package.json'

import dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers'

class SystemController {

    async status(req, res) {
        const currentUsers = await db.totalUsers()
        const wallet = new ethers.Wallet(process.env.VDA_PRIVATE_KEY)

        const results = {
            maxUsers: parseInt(process.env.MAX_USERS),
            currentUsers,
            version: packageJson.version,
            publicKey: wallet.publicKey,
            couchUri: db.buildHost()
        }

        return Utils.signedResponse({
            status: "success",
            results
        }, res);
    }

}

const systemController = new SystemController();
export default systemController;