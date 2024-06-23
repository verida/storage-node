import AuthManager from '../components/authManager';
import ReplicationManager from '../components/replicationManager'
import CONFIG from '../config'

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
}

export default async function garbageCollection(req, res, next) {
    next()

    const random = getRandomInt(0, 100)
    if (random <= (CONFIG.GC_PERCENT*100)) {
        await ReplicationManager.clearExpired()
        await AuthManager.clearExpired()
    }
}