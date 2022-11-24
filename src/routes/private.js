import express from 'express';
import UserController from '../controllers/user.js';

const router = express.Router();

router.post('/user/createDatabase', UserController.createDatabase);
router.post('/user/updateDatabase', UserController.updateDatabase);
router.post('/user/deleteDatabase', UserController.deleteDatabase);
router.post('/user/deleteDatabases', UserController.deleteDatabases);
router.post('/user/databases', UserController.databases);
router.post('/user/databaseInfo', UserController.databaseInfo);
router.post('/user/usage', UserController.usage);

export default router;