import express from 'express';
import { streamOdds } from '../controllers/streamController.js';

const router = express.Router();

router.get('/odds', streamOdds);

export default router;
