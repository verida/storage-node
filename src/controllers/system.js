import db from '../components/db'
import Utils from '../components/utils'
import packageJson from '../../package.json'

import dotenv from 'dotenv';
dotenv.config();

class SystemController {

    async status(req, res) {
        const currentUsers = await db.totalUsers()

        const results = {
            maxUsers: parseInt(process.env.MAX_USERS),
            currentUsers,
            version: packageJson.version
        }

        return Utils.signedResponse({
            status: "success",
            results
        }, res);
    }

}

const systemController = new SystemController();
export default systemController;