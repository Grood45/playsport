import { collection, query, where } from 'firebase/firestore';
import { getDynamicDb } from '../config/firebase.js';

export const getMarketList = async (req, res) => {
    const { eventId, sportId } = req.query;

    if (!eventId || !sportId) {
        return res.status(400).json({ error: "eventId and sportId are required" });
    }

    try {
        const db = getDynamicDb(sportId);
        const { getDocs } = await import('firebase/firestore');

        const collectionsToCheck = ['Betfair', 'Bookmakers', 'Fancy', 'Sportsbook', 'Lottery'];

        const responseData = {
            fancyData: [],
            matchOddsData: [],
            bookmakersData: [],
            sportsbookData: [],
            binaryData: [],
            lotteryData: [],
            isScore: false,
            meta: {
                message: "Market List",
                status_code: 200,
                status: true
            }
        };

        const promises = collectionsToCheck.map(async (colName) => {
            const q = query(collection(db, colName), where('exEventId', '==', eventId));
            const snapshot = await getDocs(q);

            snapshot.forEach(doc => {
                const data = doc.data();

                let marketStatus = "OPEN";
                if (data.oddsData?.status) {
                    marketStatus = data.oddsData.status;
                } else if (data.isClosed === 1) {
                    marketStatus = "CLOSED";
                }

                const marketItem = {
                    market_type: colName,
                    market_id: data.exMarketId || doc.id,
                    market_name: data.marketName || data.name || "Unknown Market",
                    is_closed: data.isClosed ?? 0,
                    status: marketStatus,
                    total_matched: data.oddsData?.totalMatched || data.totalMatched || 0,
                    runners: (data.oddsData?.runners || data.runners || []).map(r => ({
                        id: r.selectionId,
                        name: (data.runnersData && r.selectionId && data.runnersData[r.selectionId])
                            ? data.runnersData[r.selectionId]
                            : `Selection ${r.selectionId}`
                    }))
                };

                if (colName === 'Fancy') responseData.fancyData.push(marketItem);
                else if (colName === 'Betfair') responseData.matchOddsData.push(marketItem);
                else if (colName === 'Bookmakers') responseData.bookmakersData.push(marketItem);
                else if (colName === 'Sportsbook') responseData.sportsbookData.push(marketItem);
                else if (colName === 'Lottery') responseData.lotteryData.push(marketItem);
            });
        });

        await Promise.all(promises);

        return res.status(200).json(responseData);

    } catch (error) {
        console.error("Error fetching market list:", error);
        return res.status(500).json({ error: "Internal Server Error while fetching markets" });
    }
};
