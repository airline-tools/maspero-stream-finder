
const { chromium } = require("playwright");
const fs = require("fs");

const OUTPUT_FILE = "maspero-streams.json";

const STATIONS = [
    { name: "راديو مصر", frequency: "88.7 FM", url: "https://www.maspero.eg/stream/8" },
    { name: "صوت العرب", frequency: "612 AM", url: "https://www.maspero.eg/stream/9" },
    { name: "إذاعة البرنامج العام", frequency: "107.4 FM", url: "https://www.maspero.eg/stream/10" },
    { name: "الشباب والرياضة", frequency: "108 FM", url: "https://www.maspero.eg/stream/11" },
    { name: "البرنامج الثقافي ودراما FM", frequency: "91.5 FM", url: "https://www.maspero.eg/stream/12" },
    { name: "الأغاني", frequency: "105.8 FM", url: "https://www.maspero.eg/stream/13" },
    { name: "إذاعة القاهرة الكبرى", frequency: "102.2 FM", url: "https://www.maspero.eg/stream/14" },
    { name: "الشرق الأوسط", frequency: "89.5 FM", url: "https://www.maspero.eg/stream/16" },
    { name: "البرنامج الأوروبي", frequency: "95.4 FM", url: "https://www.maspero.eg/stream/18" }
];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getQuality(url) {
    if (/live-aac-128\.m3u8(?:$|[?#])/i.test(url)) return "AAC-128";
    if (/live-aac-64\.m3u8(?:$|[?#])/i.test(url)) return "AAC-64";
    return null;
}

async function main() {
    const browser = await chromium.launch({
        headless: true,
        args: ["--autoplay-policy=no-user-gesture-required"]
    });

    try {
        const context = await browser.newContext();
        const results = [];

        for (const station of STATIONS) {
            console.log("\n==============================");
            console.log("SEARCHING:", station.name);
            console.log("SOURCE:", station.url);
            console.log("==============================");

            const page = await context.newPage();

            let aac128 = null;
            let aac64 = null;
            let pageLoaded = false;

            const seen = new Set();
            const startTime = Date.now();

            const inspect = (url, source) => {
                const quality = getQuality(url);

                if (!quality || seen.has(url)) return;

                seen.add(url);

                const seconds = ((Date.now() - startTime) / 1000).toFixed(1);

                console.log(`[${seconds}s] ${quality} ${source}: ${url}`);

                if (quality === "AAC-128") aac128 = url;
                if (quality === "AAC-64") aac64 = url;
            };

            const onRequest = request => {
                inspect(request.url(), "REQUEST");
            };

            const onResponse = response => {
                inspect(response.url(), "RESPONSE");
            };

            try {
                // Listen to requests from the page and its frames.
                context.on("request", onRequest);
                context.on("response", onResponse);

                // Retry opening the station page up to three times.
                for (let attempt = 1; attempt <= 3; attempt++) {
                    console.log(`PAGE ATTEMPT: ${attempt}/3`);

                    try {
                        const response = await page.goto(station.url, {
                            waitUntil: "domcontentloaded",
                            timeout: 60000
                        });

                        const status = response ? response.status() : 0;
                        console.log("PAGE STATUS:", status);

                        if (response && response.ok()) {
                            pageLoaded = true;
                            break;
                        }

                        console.log("PAGE NOT READY - RETRYING...");

                    } catch (error) {
                        console.log("PAGE ERROR:", error.message);
                    }

                    if (attempt < 3) {
                        await sleep(5000);
                    }
                }

                if (pageLoaded) {
                    console.log("SEARCHING FOR AAC-128 / AAC-64...");
                    await sleep(25000);
                } else {
                    console.log("PAGE UNAVAILABLE AFTER 3 ATTEMPTS");
                }

            } catch (error) {
                console.log("CAPTURE ERROR:", error.message);

            } finally {
                context.off("request", onRequest);
                context.off("response", onResponse);
                await page.close().catch(() => {});
            }

            const selectedUrl = aac128 || aac64;

            if (selectedUrl) {
                const quality = aac128 ? "AAC-128" : "AAC-64";

                console.log("SELECTED:", quality);

                results.push({
                    name: station.name,
                    frequency: station.frequency,
                    source: station.url,
                    url: selectedUrl,
                    quality
                });
            } else {
                console.log("NO AAC LINK FOUND");
            }
        }

        // Read the previous JSON without risking its contents.
        let previousResults = [];

        if (fs.existsSync(OUTPUT_FILE)) {
            try {
                const oldData = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));

                if (!Array.isArray(oldData)) {
                    throw new Error("JSON is not an array");
                }

                previousResults = oldData;

            } catch (error) {
                console.error("ERROR READING JSON:", error.message);
                console.error("UPDATE CANCELLED TO PROTECT OLD FILE.");
                process.exitCode = 1;
                return;
            }
        }

        const previousBySource = new Map(
            previousResults.map(item => [item.source, item])
        );

        const newBySource = new Map(
            results.map(item => [item.source, item])
        );

        let updated = 0;
        let preserved = 0;
        let unchanged = 0;
        let added = 0;

        const mergedResults = STATIONS.map(station => {
            const oldStation = previousBySource.get(station.url);
            const newStation = newBySource.get(station.url);

            if (!newStation) {
                if (oldStation) {
                    preserved++;
                    console.log("PRESERVED OLD LINK:", station.name);
                    return oldStation;
                }

                console.log("NO OLD OR NEW LINK:", station.name);
                return null;
            }

            if (oldStation) {
                if (oldStation.url === newStation.url) {
                    unchanged++;
                    console.log("UNCHANGED:", station.name);
                    return oldStation;
                }

                updated++;
                console.log("UPDATED:", station.name);
                return newStation;
            }

            added++;
            console.log("NEW LINK:", station.name);
            return newStation;

        }).filter(Boolean);

        // Preserve entries that are not in the current station list.
        const knownSources = new Set(STATIONS.map(item => item.url));

        for (const oldStation of previousResults) {
            if (!knownSources.has(oldStation.source)) {
                mergedResults.push(oldStation);
                console.log("PRESERVED UNLISTED:", oldStation.name);
            }
        }

        const oldJson = JSON.stringify(previousResults, null, 2);
        const newJson = JSON.stringify(mergedResults, null, 2);

        if (oldJson !== newJson) {
            fs.writeFileSync(OUTPUT_FILE, newJson, "utf8");
            console.log("JSON UPDATED");
        } else {
            console.log("NO CHANGES - OLD JSON PRESERVED");
        }

        console.log("\n==============================");
        console.log("FOUND THIS RUN:", results.length);
        console.log("UPDATED LINKS:", updated);
        console.log("NEW LINKS:", added);
        console.log("UNCHANGED LINKS:", unchanged);
        console.log("PRESERVED OLD LINKS:", preserved);
        console.log("TOTAL SAVED:", mergedResults.length);
        console.log("==============================");

    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error("ERROR:", error);
    process.exitCode = 1;
});
