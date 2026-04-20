import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';

const config = { projectId: "t20-cricket-add9b" };
const app = initializeApp(config);
const db = getFirestore(app);

const scoreQuery = query(
        collection(db, 'Sportsbook'), 
        where('exEventId', '==', '3544687543453'),
        where('marketName', '==', 'Ball By Ball')
    );

getDocs(scoreQuery).then(snap => {
   console.log("Documents found:", snap.size);
   snap.forEach(doc => console.log(doc.id));
   process.exit(0);
}).catch(err => {
   console.error("Query Error:", err.message);
   process.exit(1);
});
