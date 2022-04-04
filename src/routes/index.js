import express from 'express';
import UserController from '../controllers/user';

const router = express.Router();

router.get('/user/get', UserController.get);
router.post('/user/create', UserController.create);
router.post('/user/createDatabase', UserController.createDatabase);
router.post('/user/updateDatabase', UserController.updateDatabase);

export default router;