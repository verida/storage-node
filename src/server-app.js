import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import privateRoutes from './routes/private.js';
import publicRoutes from './routes/public.js';
import didStorageRoutes from './services/didStorage/routes.js';

import requestValidator from './middleware/requestValidator.js';
import garbageCollection from './middleware/garbageCollection.js';
import userManager from './components/userManager.js';
import AuthManager from './components/authManager.js';
import didUtils from './services/didStorage/utils.js';

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
app.use(garbageCollection)
app.use(didStorageRoutes);
app.use(publicRoutes);
app.use(requestValidator);
app.use(privateRoutes);

AuthManager.initDb();
userManager.ensureDefaultDatabases();
didUtils.createDb()

export default app;
