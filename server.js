import express from 'express';
import cors from 'cors';

// Import Routes
import streamRoutes from './src/routes/streamRoutes.js';
import marketRoutes from './src/routes/marketRoutes.js';

const app = express();
app.use(cors());

// --- API ROUTES ---
app.use('/api/stream', streamRoutes);
app.use('/api/markets', marketRoutes);

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`🚀 Kingexchange API Server is running on port ${PORT}`);
    console.log(`Client Stream URL Format: http://localhost:${PORT}/api/stream/odds?eventId={EVENT_ID}&sportId={SPORT_ID}`);
    console.log(`Market List URL Format:   http://localhost:${PORT}/api/markets/list?eventId={EVENT_ID}&sportId={SPORT_ID}`);
});
