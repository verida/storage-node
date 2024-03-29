import Axios from 'axios';
import CouchDb from 'nano';

class Db {

    getCouch(type='external') {
        const dsn = this.buildDsn(process.env.DB_USER, process.env.DB_PASS, type);

        return new CouchDb({
            url: dsn,
            requestDefaults: {
                rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED_SSL.toLowerCase() !== "false"
            }
        });
    }

    async getReplicationStatus(replicationId) {
        const dsn = this.buildDsn(process.env.DB_USER, process.env.DB_PASS, 'internal');

        try {
            const replicationStatus = await Axios.get(`${dsn}/_scheduler/docs/_replicator/${replicationId}`)
            return replicationStatus.data
        } catch (err) {
            return undefined
        }
    }

    buildDsn(username, password, type='external') {
        let env = process.env;
        const HOST = type == 'internal' ? env.DB_HOST_INTERNAL : env.DB_HOST_EXTERNAL
        const PORT = type == 'internal' ? env.DB_PORT_INTERNAL : env.DB_PORT_EXTERNAL
        const PROTOCOL = type == 'internal' ? env.DB_PROTOCOL_INTERNAL : env.DB_PROTOCOL_EXTERNAL
        return PROTOCOL + "://" + username + ":" + password + "@" + HOST + ":" + PORT;
    }

    // Build external hostname that users will connect to the storage node
    buildHost() {
        let env = process.env;
        return env.DB_PROTOCOL_EXTERNAL + "://" + env.DB_HOST_EXTERNAL + ":" + env.DB_PORT_EXTERNAL;
    }

    // Total number of users in the system
    async totalUsers() {
        const couch = db.getCouch()
        const usersDb = couch.db.use('_users')
        const info = await usersDb.info()
        return info.doc_count
    }

    // Get some useful couch statistics and metrics to include in the status
    async getCouchStats() {
        const dsn = this.buildDsn(process.env.DB_USER, process.env.DB_PASS, 'internal');

        try {
            const metrics = await Axios.get(`${dsn}/_node/_local/_stats/couchdb/`);
            return {
                requestMeanTimeMS: metrics.data['request_time']['value']['arithmetic_mean'],
                requestTimeStdDevMS: metrics.data['request_time']['value']['standard_deviation'],
                continuousChangesClientCount: metrics.data['httpd']['clients_requesting_changes']['value']
            }
        } catch (err) {
            console.log(err);
            return undefined
        }
    }

}

const db = new Db()
export default db