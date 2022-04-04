import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import router from './routes/index.js';
import requestValidator from './middleware/requestValidator.js';
import userManager from './components/userManager';
import UserController from './controllers/user';
require('dotenv').config();

const basicAuth = require('express-basic-auth');

// Set up the express app
const app = express();

let corsConfig = {
  //origin: process.env.CORS_HOST
};

// Parse incoming requests data
app.use(cors(corsConfig));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.get('/user/public', UserController.getPublic);
app.use(basicAuth({
  authorizer: requestValidator.authorize,
  authorizeAsync: true,
  unauthorizedResponse: requestValidator.getUnauthorizedResponse
}));
app.use(function(req, res, next) {
  // Replace "_" in username with ":" to ensure DID is valid
  // This is caused because HTTP Basic Auth doesn't support ":" in username
  req.auth.user = req.auth.user.replace(/_/g, ':');
  next();
});
app.use(router);

userManager.ensurePublicUser();

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`)
});