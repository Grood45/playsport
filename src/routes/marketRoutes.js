import express from 'express';
import { getMarketList } from '../controllers/marketController.js';

const router = express.Router();

router.get('/list', getMarketList);

export default router;
