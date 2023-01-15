import packageJson from '../../package.json';
import db from '../components/db';
import Utils from '../components/utils';

import dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';
import { BUILD_DETAILS } from '../build';


class SystemController {

    async status(req, res) {
        const currentUsers = await db.totalUsers()
        const wallet = new ethers.Wallet(process.env.VDA_PRIVATE_KEY)

        const results = {
            maxUsers: parseInt(process.env.MAX_USERS),
            currentUsers,
            version: packageJson.version,
            publicKey: wallet.publicKey,
            couchUri: db.buildHost(),
            buildTimestamp: BUILD_DETAILS.buildTimestamp
        }

        return Utils.signedResponse({
            status: "success",
            results
        }, res);
    }

}

const systemController = new SystemController();
export default systemController;