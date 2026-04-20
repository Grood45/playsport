import https from 'https';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getDynamicDb } from '../config/firebase.js';

const FAST_SOURCE_DOMAIN = 'https://playsport09.com';

const resolveVideoUrl = (video, baseUrl) => {
    if (!video || !video.url) return video;
    
    // Replace the source placeholder with our own domain to point clients back to us
    return {
        ...video,
        url: video.url.replace('{$domain}', baseUrl)
    };
};

export const imageProxyController = (req, res) => {
    const { filename } = req.params;
    const targetUrl = `${FAST_SOURCE_DOMAIN}/api/users/images/${filename}`;

    // Pass through Range header if present (crucial for video scrubbing)
    const options = {
        headers: req.headers.range ? { 'range': req.headers.range } : {}
    };

    https.get(targetUrl, options, (proxyRes) => {
        // Pass through status code
        res.status(proxyRes.statusCode);

        // Pass through essential headers for video streaming
        const headersToForward = [
            'content-type', 
            'content-range', 
            'accept-ranges', 
            'content-length', 
            'cache-control'
        ];

        headersToForward.forEach(header => {
            if (proxyRes.headers[header]) {
                res.setHeader(header, proxyRes.headers[header]);
            }
        });

        // Ensure we have at least a default Content-Type for videos
        if (!res.getHeader('content-type') && filename.endsWith('.mp4')) {
            res.setHeader('Content-Type', 'video/mp4');
        }

        proxyRes.pipe(res);
    }).on('error', (err) => {
        console.error("Image Proxy Error:", err.message);
        res.status(500).json({ error: "Failed to proxy image/video" });
    });
};

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

export const streamBallByBall = (req, res) => {
    const { eventId, sportId } = req.query;

    if (!eventId || !sportId) {
        return res.status(400).json({ error: "eventId and sportId are required" });
    }

    // 1. Mandatory Headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Initial targetChange payload
    res.write(`data: ${JSON.stringify({ type: 'connected', message: "Stream started" })}\n\n`);

    const db = getDynamicDb(sportId);
    let isConnectionOpen = true;

    const streamData = (source, data, actionType) => {
        if (!isConnectionOpen) return;

        const marketId = data.exMarketId || data.id || "Unknown_ID";

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

        let marketStatus = "OPEN";
        if (data.oddsData?.status) {
            marketStatus = data.oddsData.status;
        } else if (data.isClosed === 1) {
            marketStatus = "CLOSED";
        }

        const protocol = req.protocol;
        const host = req.get('host');
        const baseUrl = `${protocol}://${host}`;

        const payload = {
            action: actionType,
            market_type: source,
            market_id: marketId,
            market_name: data.marketName || data.name || "Unknown Market",
            is_closed: data.isClosed ?? 0,
            status: marketStatus,
            total_matched: data.oddsData?.totalMatched || data.totalMatched || 0,
            video: resolveVideoUrl(data.oddsData?.video, baseUrl),
            runners: (data.oddsData?.runners || data.runners || []).map(r => ({
                id: r.selectionId,
                name: (data.runnersData && r.selectionId && data.runnersData[r.selectionId])
                    ? data.runnersData[r.selectionId]
                    : `Selection ${r.selectionId}`,
                status: r.status || marketStatus,
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

    // Use Sportsbook collection and filter by exEventId and marketName === 'Ball By Ball'
    const collectionName = 'Sportsbook';

    const scoreQuery = query(
        collection(db, collectionName),
        where('exEventId', '==', eventId),
        where('marketName', '==', 'Ball By Ball')
    );

    const unsubscribe = onSnapshot(scoreQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            streamData(collectionName, change.doc.data(), change.type);
        });
    }, (error) => {
        console.error("Ball-by-Ball Listen Error:", error.message);
    });

    // 2. Handle Client Disconnect
    req.on('close', () => {
        console.log(`Ball-by-ball client disconnected from eventId: ${eventId}`);
        isConnectionOpen = false;
        unsubscribe();
    });
};
