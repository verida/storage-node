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

let serverOnline = false

const initDatabases = async () => {
  if (!serverOnline) {
    await AuthManager.initDb()
    await userManager.ensureDefaultDatabases()
    await didUtils.createDb()
    serverOnline = true
  }
}

app.use(async (req, res, next) => {
  if (!serverOnline) {
    try {
      await initDatabases()
    } catch (err) {
      return res.status(500).send({
        status: "fail",
        message: `Error initializing databases: ${err.message}`
      })
    }
  }

  next()
})
app.use(cors(corsConfig));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(garbageCollection)
app.use(didStorageRoutes);
app.use(publicRoutes);
app.use(requestValidator);
app.use(privateRoutes);

export default app;
