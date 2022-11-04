import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import basicAuth from 'express-basic-auth';

import router from './routes/index.js';
import requestValidator from './middleware/requestValidator.js';
import userManager from './components/userManager.js';
import UserController from './controllers/user.js';
import AuthController from './controllers/auth.js';
import AuthManager from './components/authManager.js';

dotenv.config();

// Set up the express app
const app = express();

let corsConfig = {
  //origin: process.env.CORS_HOST
};

// Parse incoming requests data
app.use(cors(corsConfig));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Specify public endpoints
app.get('/auth/public', UserController.getPublic);
app.post('/auth/generateAuthJwt', AuthController.generateAuthJwt);
app.post('/auth/authenticate', AuthController.authenticate);
app.post('/auth/connect', AuthController.connect);
app.post('/auth/regenerateRefreshToken', AuthController.regenerateRefreshToken);
app.post('/auth/invalidateDeviceId', AuthController.invalidateDeviceId);
app.post('/auth/isTokenValid', AuthController.isTokenValid);

app.use(requestValidator);
app.use(router);

AuthManager.initDb();
userManager.ensureDefaultDatabases();

export default app;
