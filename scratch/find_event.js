import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const config = { projectId: "t20-cricket-add9b" };
const app = initializeApp(config);
const db = getFirestore(app);

const findEvent = async () => {
    const q = query(collection(db, 'Sportsbook'), where('marketName', '==', 'Ball By Ball'));
    const snap = await getDocs(q);
    if (snap.empty) {
        console.log("No Ball By Ball markets found.");
    } else {
        const doc = snap.docs[0].data();
        console.log(`Found Event! eventId: ${doc.exEventId}, sportId: 4`);
    }
    process.exit(0);
};

findEvent();
