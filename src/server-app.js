import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import router from './routes/index.js';
import requestValidator from './middleware/requestValidator.js';
import userManager from './components/userManager';
import AuthController from './controllers/auth';
import UserController from './controllers/user';
import AuthManager from './components/authManager';
require('dotenv').config();

// Set up the express app
const app = express();

let corsConfig = {
  //origin: process.env.CORS_HOST
};

// Parse incoming requests data
app.use(cors(corsConfig));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

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


module.exports=app