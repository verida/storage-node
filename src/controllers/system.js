import packageJson from '../../package.json';
import db from '../components/db';
import Utils from '../components/utils';

import dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';
import { BUILD_DETAILS } from '../build';


class SystemController {

    async status(req, res) {
        const storageSlotsUsed = await db.totalUsers();
        const metrics = await db.getCouchStats();
        const wallet = new ethers.Wallet(process.env.VDA_PRIVATE_KEY)

        const results = {
            maxStorageSlots: parseInt(process.env.MAX_USERS),
            storageSlotsUsed,
            metrics: metrics,
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