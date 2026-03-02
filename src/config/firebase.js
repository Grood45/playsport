import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

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

export const getDynamicDb = (sportId) => {
    const config = getFirebaseConfig(sportId);
    let firebaseApp;
    const apps = getApps();
    const existingApp = apps.find(a => a.name === config.projectId);

    if (existingApp) {
        firebaseApp = existingApp;
    } else {
        firebaseApp = initializeApp(config, config.projectId);
    }

    return getFirestore(firebaseApp);
};
