import express from 'express';
import UserController from '../controllers/user.js';
import AuthController from '../controllers/auth.js';
import SystemController from '../controllers/system.js';
import DidLookupController from '../services/lookup/controller.js'

const router = express.Router();

// Specify public endpoints
router.get('/auth/public', UserController.getPublic);
router.get('/status', SystemController.status);

router.post('/auth/generateAuthJwt', AuthController.generateAuthJwt);
router.post('/auth/authenticate', AuthController.authenticate);
router.post('/auth/connect', AuthController.connect);
router.post('/auth/regenerateRefreshToken', AuthController.regenerateRefreshToken);
router.post('/auth/invalidateDeviceId', AuthController.invalidateDeviceId);
router.post('/auth/isTokenValid', AuthController.isTokenValid);

router.get('/lookup/did/:did', DidLookupController.lookup)

export default router;