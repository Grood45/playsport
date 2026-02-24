import express from 'express';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import cors from 'cors';

const app = express();
app.use(cors());

// --- FIREBASE CONFIGURATION ---
const getFirebaseConfig = (sportId) => {
    switch (String(sportId)) {
        case "4": return { projectId: "t20-cricket-add9b" };
        case "2": return { projectId: "tennis-101ef" };
        case "1": return { projectId: "soccer-57fb9" };
        case "7": return { projectId: "other-sports-1bba3" }; // Horse Racing
        case "4339": return { projectId: "other-sports-1bba3" }; // Greyhound
        case "66104": return { projectId: "other-sports-1bba3" }; // Lottery
        default: return { projectId: "t20-cricket-add9b" }; // Fallback
    }
};

const getDynamicDb = (sportId) => {
    const config = getFirebaseConfig(sportId);
    let firebaseApp;
    const apps = getApps();
    const existingApp = apps.find(a => a.name === config.projectId);

    if (existingApp) {
        firebaseApp = existingApp;
    } else {
        firebaseApp = initializeApp(config, config.projectId); // Use projectId as app name to manage multiple apps
    }

    return getFirestore(firebaseApp);
};
// ------------------------------

/**
 * GET /api/stream/odds
 * 
 * Query Params Required:
 * - eventId: Event ID to listen to (e.g., 400202621913741835)
 * - sportId: Sport ID (1=Soccer, 2=Tennis, 4=Cricket)
 */
app.get('/api/stream/odds', (req, res) => {
    const { eventId, sportId } = req.query;

    if (!eventId || !sportId) {
        return res.status(400).json({ error: "eventId and sportId are required" });
    }

    // 1. Mandatory Headers for SSE (Server-Sent Events)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Flush headers to establish the initial connection
    res.flushHeaders();

    // Initial message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: "Stream started" })}\n\n`);

    const db = getDynamicDb(sportId);
    let isConnectionOpen = true;
    const unsubscribes = [];

    const streamData = (source, data) => {
        if (!isConnectionOpen) return;

        // Clean, structured payload (removed all-field dump to avoid confusion)
        const payload = {
            market_type: source,
            market_name: data.marketName || data.name || "Unknown Market",
            is_closed: data.isClosed ?? 0,
            status: data.oddsData?.status || (data.isClosed === 0 ? "OPEN" : "CLOSED"),
            total_matched: data.oddsData?.totalMatched || data.totalMatched || 0,
            runners: (data.oddsData?.runners || data.runners || []).map(r => ({
                id: r.selectionId,
                name: (data.runnersData && r.selectionId && data.runnersData[r.selectionId])
                    ? data.runnersData[r.selectionId]
                    : `Selection ${r.selectionId}`,
                status: r.status,
                back: [
                    { price: r.price?.back?.[0]?.price || 0, size: r.price?.back?.[0]?.size || 0 },
                    { price: r.price?.back?.[1]?.price || 0, size: r.price?.back?.[1]?.size || 0 },
                    { price: r.price?.back?.[2]?.price || 0, size: r.price?.back?.[2]?.size || 0 }
                ],
                lay: [
                    { price: r.price?.lay?.[0]?.price || 0, size: r.price?.lay?.[0]?.size || 0 },
                    { price: r.price?.lay?.[1]?.price || 0, size: r.price?.lay?.[1]?.size || 0 },
                    { price: r.price?.lay?.[2]?.price || 0, size: r.price?.lay?.[2]?.size || 0 }
                ]
            }))
        };

        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // --- BETFAIR QUERY ---
    const betfairQuery = query(collection(db, 'Betfair'), where('exEventId', '==', eventId));
    const unsubBetfair = onSnapshot(betfairQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
                streamData("Betfair", change.doc.data());
            }
        });
    }, (error) => console.error("Betfair Listen Error:", error.message));
    unsubscribes.push(unsubBetfair);

    // --- BOOKMAKERS QUERY ---
    const bookmakerQuery = query(collection(db, 'Bookmakers'), where('exEventId', '==', eventId));
    const unsubBookmaker = onSnapshot(bookmakerQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
                streamData("Bookmakers", change.doc.data());
            }
        });
    }, (error) => console.error("Bookmaker Listen Error:", error.message));
    unsubscribes.push(unsubBookmaker);

    // --- FANCY QUERY ---
    const fancyQuery = query(collection(db, 'Fancy'), where('exEventId', '==', eventId));
    const unsubFancy = onSnapshot(fancyQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
                streamData("Fancy", change.doc.data());
            }
        });
    }, (error) => console.error("Fancy Listen Error:", error.message));
    unsubscribes.push(unsubFancy);

    // --- SPORTSBOOK QUERY ---
    const sportsbookQuery = query(collection(db, 'Sportsbook'), where('exEventId', '==', eventId));
    const unsubSportsbook = onSnapshot(sportsbookQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
                streamData("Sportsbook", change.doc.data());
            }
        });
    }, (error) => console.error("Sportsbook Listen Error:", error.message));
    unsubscribes.push(unsubSportsbook);

    // --- LOTTERY QUERY ---
    const lotteryQuery = query(collection(db, 'Lottery'), where('exEventId', '==', eventId));
    const unsubLottery = onSnapshot(lotteryQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
                streamData("Lottery", change.doc.data());
            }
        });
    }, (error) => console.error("Lottery Listen Error:", error.message));
    unsubscribes.push(unsubLottery);

    // 2. Handle Client Disconnect
    req.on('close', () => {
        console.log(`Client disconnected from eventId: ${eventId}`);
        isConnectionOpen = false;
        unsubscribes.forEach(unsub => unsub());
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Kingexchange SSE Stream API Server is running on port ${PORT}`);
    console.log(`Client URL Format: http://localhost:${PORT}/api/stream/odds?eventId={EVENT_ID}&sportId={SPORT_ID}`);
});
