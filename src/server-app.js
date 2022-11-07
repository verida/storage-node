import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import basicAuth from 'express-basic-auth';

import privateRoutes from './routes/private.js';
import publicRoutes from './routes/public.js';
import didStorageRoutes from './services/didStorage/routes'

import requestValidator from './middleware/requestValidator.js';
import userManager from './components/userManager.js';
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
app.use(didStorageRoutes);
app.use(publicRoutes);
app.use(requestValidator);
app.use(privateRoutes);

AuthManager.initDb();
userManager.ensureDefaultDatabases();

export default app;
