import express from 'express';
import { streamOdds, streamBallByBall } from '../controllers/streamController.js';

const router = express.Router();

router.get('/odds', streamOdds);
router.get('/ballbyball', streamBallByBall);

export default router;
