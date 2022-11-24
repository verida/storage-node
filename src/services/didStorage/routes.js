import express from 'express';
import DidStorageController from './controller.js';

const router = express.Router();

// Specify public endpoints
router.post('/did/:did/migrate', DidStorageController.migrate);
router.post('/did/:did', DidStorageController.create);
router.put('/did/:did', DidStorageController.update);
router.delete('/did/:did', DidStorageController.delete);
router.get('/did/:did', DidStorageController.get);

export default router;