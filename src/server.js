import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import router from './routes/index.js';
import requestValidator from './middleware/requestValidator.js';
import userManager from './components/userManager';
import UserController from './controllers/user';
import AuthManager from './components/authManager';
require('dotenv').config();

//const basicAuth = require('express-basic-auth');

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
app.get('/user/public', UserController.getPublic);
app.post('/user/generateAuthJwt', UserController.generateAuthJwt);
app.post('/user/authenticate', UserController.authenticate);
app.post('/user/get', UserController.get);

app.use(requestValidator);
app.use(router);

AuthManager.initDb();
userManager.ensurePublicUser();

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`)
});