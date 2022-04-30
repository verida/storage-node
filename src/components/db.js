require('dotenv').config();
const CouchDb = require('nano');

class Db {

    getCouch() {
        let dsn = this.buildDsn(process.env.DB_USER, process.env.DB_PASS);

        if (!this._couch) {
            this._couch = new CouchDb({
                url: dsn,
                requestDefaults: {
                    rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED_SSL.toLowerCase() != "false"
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

}

const db = new Db()
export default db