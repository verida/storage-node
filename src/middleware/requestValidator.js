import AuthManager from "../components/authManager"

export default async function requestValidator(req, res, next) {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(' ')[1];
        const decodedToken = await AuthManager.verifyAccessToken(token)
        
        if (!decodedToken) {
            return res.sendStatus(401);
        }

        req.tokenData = {
            username: decodedToken.sub,
            did: decodedToken.did,
            contextName: decodedToken.contextName
        }

        next();
    } else {
        res.sendStatus(401);
    }
}