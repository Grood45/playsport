import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getDynamicDb } from '../config/firebase.js';

export const streamOdds = (req, res) => {
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

    const streamData = (source, data, actionType) => {
        if (!isConnectionOpen) return;

        // Ensure we always have a market ID
        const marketId = data.exMarketId || data.id || "Unknown_ID";

        // Handle completely REMOVED markets from Firestore
        if (actionType === "removed") {
            const payload = {
                action: "removed",
                market_type: source,
                market_id: marketId,
                status: "REMOVED",
                is_closed: 1
            };
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
            return;
        }

        // Handle SUSPENDED/CLOSED correctly based on firestore properties
        let marketStatus = "OPEN";
        if (data.oddsData?.status) {
            marketStatus = data.oddsData.status;
        } else if (data.isClosed === 1) {
            marketStatus = "CLOSED";
        }

        // Clean, structured payload for ADDED and MODIFIED
        const payload = {
            action: actionType, // "added" or "modified"
            market_type: source,
            market_id: marketId,
            market_name: data.marketName || data.name || "Unknown Market",
            is_closed: data.isClosed ?? 0,
            status: marketStatus,
            total_matched: data.oddsData?.totalMatched || data.totalMatched || 0,
            runners: (data.oddsData?.runners || data.runners || []).map(r => ({
                id: r.selectionId,
                name: (data.runnersData && r.selectionId && data.runnersData[r.selectionId])
                    ? data.runnersData[r.selectionId]
                    : `Selection ${r.selectionId}`,
                status: r.status || marketStatus, // Pass runner status (e.g., SUSPENDED/ACTIVE)
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
            streamData("Betfair", change.doc.data(), change.type);
        });
    }, (error) => console.error("Betfair Listen Error:", error.message));
    unsubscribes.push(unsubBetfair);

    // --- BOOKMAKERS QUERY ---
    const bookmakerQuery = query(collection(db, 'Bookmakers'), where('exEventId', '==', eventId));
    const unsubBookmaker = onSnapshot(bookmakerQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            streamData("Bookmakers", change.doc.data(), change.type);
        });
    }, (error) => console.error("Bookmaker Listen Error:", error.message));
    unsubscribes.push(unsubBookmaker);

    // --- FANCY QUERY ---
    const fancyQuery = query(collection(db, 'Fancy'), where('exEventId', '==', eventId));
    const unsubFancy = onSnapshot(fancyQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            streamData("Fancy", change.doc.data(), change.type);
        });
    }, (error) => console.error("Fancy Listen Error:", error.message));
    unsubscribes.push(unsubFancy);

    // --- SPORTSBOOK QUERY ---
    const sportsbookQuery = query(collection(db, 'Sportsbook'), where('exEventId', '==', eventId));
    const unsubSportsbook = onSnapshot(sportsbookQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            streamData("Sportsbook", change.doc.data(), change.type);
        });
    }, (error) => console.error("Sportsbook Listen Error:", error.message));
    unsubscribes.push(unsubSportsbook);

    // --- LOTTERY QUERY ---
    const lotteryQuery = query(collection(db, 'Lottery'), where('exEventId', '==', eventId));
    const unsubLottery = onSnapshot(lotteryQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            streamData("Lottery", change.doc.data(), change.type);
        });
    }, (error) => console.error("Lottery Listen Error:", error.message));
    unsubscribes.push(unsubLottery);

    // 2. Handle Client Disconnect
    req.on('close', () => {
        console.log(`Client disconnected from eventId: ${eventId}`);
        isConnectionOpen = false;
        unsubscribes.forEach(unsub => unsub());
    });
};
