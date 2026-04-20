const resolveVideoUrl = (video, baseUrl) => {
    if (!video || !video.url) return video;
    
    // Replace the source placeholder with our own domain to point clients back to us
    return {
        ...video,
        url: video.url.replace('{$domain}', baseUrl)
    };
};

const mockData = {
    video: {
        url: "{$domain}/api/users/images/ballbyball-1741678020467.mp4",
        runs: "0 RUNS",
        duration: 16
    }
};

const baseUrl = "http://localhost:3005";
const resolved = resolveVideoUrl(mockData.video, baseUrl);

console.log("Original URL:", mockData.video.url);
console.log("Resolved URL:", resolved.url);

const expectedUrl = "http://localhost:3005/api/users/images/ballbyball-1741678020467.mp4";

if (resolved.url === expectedUrl) {
    console.log("✅ TEST PASSED");
} else {
    console.log("❌ TEST FAILED");
    console.log("Expected:", expectedUrl);
    console.log("Received:", resolved.url);
    process.exit(1);
}
