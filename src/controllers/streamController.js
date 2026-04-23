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

/**
 * StreamManager handles singleton Firestore listeners per event.
 * This prevents opening 5 new listeners for every single user.
 */
class StreamManager {
    constructor() {
        this.streams = new Map(); // key: sportId_eventId
    }

    getStreamKey(sportId, eventId) {
        return `${sportId}_${eventId}`;
    }

    subscribe(sportId, eventId, res) {
        const key = this.getStreamKey(sportId, eventId);
        
        if (!this.streams.has(key)) {
            console.log(`[StreamManager] Creating new listener for ${key}`);
            this.streams.set(key, this.createListener(sportId, eventId));
        }

        const stream = this.streams.get(key);
        stream.clients.add(res);

        // Send current state to the new client immediately
        stream.lastData.forEach((data, marketKey) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        });

        return () => {
            stream.clients.delete(res);
            if (stream.clients.size === 0) {
                console.log(`[StreamManager] No more clients for ${key}. Closing listener.`);
                stream.unsubscribes.forEach(unsub => unsub());
                this.streams.delete(key);
            }
        };
    }

    createListener(sportId, eventId) {
        const db = getDynamicDb(sportId);
        const clients = new Set();
        const lastData = new Map(); // market_id -> last_payload (to send to new users)
        const unsubscribes = [];

        const broadcast = (source, data, actionType) => {
            const marketId = data.exMarketId || data.id || "Unknown_ID";
            const marketKey = `${source}_${marketId}`;

            let marketStatus = "OPEN";
            if (data.oddsData?.status) {
                marketStatus = data.oddsData.status;
            } else if (data.isClosed === 1) {
                marketStatus = "CLOSED";
            }

            const payload = {
                action: actionType,
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

            // Handle removal
            if (actionType === "removed") {
                payload.status = "REMOVED";
                payload.is_closed = 1;
                lastData.delete(marketKey);
            } else {
                lastData.set(marketKey, payload);
            }

            const message = `data: ${JSON.stringify(payload)}\n\n`;
            clients.forEach(client => {
                try {
                    client.write(message);
                } catch (e) {
                    console.error("Broadcast write error:", e.message);
                }
            });
        };

        const collections = ['Betfair', 'Bookmakers', 'Fancy', 'Sportsbook', 'Lottery'];
        collections.forEach(col => {
            const q = query(collection(db, col), where('exEventId', '==', eventId));
            const unsub = onSnapshot(q, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    broadcast(col, change.doc.data(), change.type);
                });
            }, (error) => console.error(`${col} Listen Error:`, error.message));
            unsubscribes.push(unsub);
        });

        return { clients, unsubscribes, lastData };
    }
}

const oddsManager = new StreamManager();

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

    // 1. Mandatory Headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

    // Flush headers to establish the initial connection
    res.flushHeaders();

    // Initial message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: "Stream started" })}\n\n`);

    // Subscribe to the shared listener
    const unsubscribe = oddsManager.subscribe(sportId, eventId, res);

    // Handle Client Disconnect
    req.on('close', () => {
        console.log(`Client disconnected from eventId: ${eventId}`);
        unsubscribe();
    });
};


class BallByBallManager {
    constructor() {
        this.streams = new Map();
    }

    getStreamKey(sportId, eventId) {
        return `${sportId}_${eventId}`;
    }

    subscribe(sportId, eventId, res, baseUrl) {
        const key = this.getStreamKey(sportId, eventId);
        
        if (!this.streams.has(key)) {
            this.streams.set(key, this.createListener(sportId, eventId, baseUrl));
        }

        const stream = this.streams.get(key);
        stream.clients.add(res);

        stream.lastData.forEach((data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        });

        return () => {
            stream.clients.delete(res);
            if (stream.clients.size === 0) {
                stream.unsubscribe();
                this.streams.delete(key);
            }
        };
    }

    createListener(sportId, eventId, baseUrl) {
        const db = getDynamicDb(sportId);
        const clients = new Set();
        const lastData = new Map();

        const broadcast = (data, actionType) => {
            const marketId = data.exMarketId || data.id || "Unknown_ID";
            let marketStatus = "OPEN";
            if (data.oddsData?.status) {
                marketStatus = data.oddsData.status;
            } else if (data.isClosed === 1) {
                marketStatus = "CLOSED";
            }

            const payload = {
                action: actionType,
                market_type: 'Sportsbook',
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

            if (actionType === "removed") {
                lastData.delete(marketId);
            } else {
                lastData.set(marketId, payload);
            }

            const message = `data: ${JSON.stringify(payload)}\n\n`;
            clients.forEach(client => {
                try {
                    client.write(message);
                } catch (e) {}
            });
        };

        const q = query(
            collection(db, 'Sportsbook'),
            where('exEventId', '==', eventId),
            where('marketName', '==', 'Ball By Ball')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                broadcast(change.doc.data(), change.type);
            });
        }, (error) => console.error("Ball-by-Ball Listen Error:", error.message));

        return { clients, unsubscribe, lastData };
    }
}

const ballByBallManager = new BallByBallManager();

export const streamBallByBall = (req, res) => {
    const { eventId, sportId } = req.query;

    if (!eventId || !sportId) {
        return res.status(400).json({ error: "eventId and sportId are required" });
    }

    // 1. Mandatory Headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Initial message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: "Stream started" })}\n\n`);

    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const unsubscribe = ballByBallManager.subscribe(sportId, eventId, res, baseUrl);

    // Handle Client Disconnect
    req.on('close', () => {
        console.log(`Ball-by-ball client disconnected from eventId: ${eventId}`);
        unsubscribe();
    });
};

