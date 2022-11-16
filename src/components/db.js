import dotenv from 'dotenv';
import CouchDb from 'nano';

dotenv.config();

class Db {

    getCouch() {
        if (!this._couch) {
            const dsn = this.buildDsn(process.env.DB_USER, process.env.DB_PASS);
            this._couch = new CouchDb({
                url: dsn,
                requestDefaults: {
                    rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED_SSL.toLowerCase() !== "false"
                }
            });
        }

        return this._couch;
    }

    buildDsn(username, password) {
        let env = process.env;
        return env.DB_PROTOCOL + "://" + username + ":" + password + "@" + env.DB_HOST + ":" + env.DB_PORT;
    }

    buildHost() {
        let env = process.env;
        return env.DB_PROTOCOL + "://" + env.DB_HOST + ":" + env.DB_PORT;
    }

    // Total number of users in the system
    async totalUsers() {
        const couch = db.getCouch()
        const usersDb = couch.db.use('_users')
        const info = await usersDb.info()
        return info.doc_count
    }

}

const db = new Db()
export default db