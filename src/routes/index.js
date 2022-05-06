import express from 'express';
import UserController from '../controllers/user';

const router = express.Router();

router.post('/user/createDatabase', UserController.createDatabase);
router.post('/user/updateDatabase', UserController.updateDatabase);
router.post('/user/deleteDatabase', UserController.deleteDatabase);

export default router;