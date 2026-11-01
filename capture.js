
const { chromium } = require("playwright");
const fs = require("fs");

const OUTPUT_FILE = "maspero-streams.json";

const AD_WAIT_MS = 12000;
const CAPTURE_WAIT_MS = 12000;

const STATIONS = [
    {
        name: "راديو مصر",
        frequency: "88.7 FM",
        url: "https://www.maspero.eg/stream/8"
    },
    {
        name: "صوت العرب",
        frequency: "612 AM",
        url: "https://www.maspero.eg/stream/9"
    },
    {
        name: "إذاعة البرنامج العام",
        frequency: "107.4 FM",
        url: "https://www.maspero.eg/stream/10"
    },
    {
        name: "الشباب والرياضة",
        frequency: "108 FM",
        url: "https://www.maspero.eg/stream/11"
    },
    {
        name: "البرنامج الثقافي ودراما FM",
        frequency: "91.5 FM",
        url: "https://www.maspero.eg/stream/12"
    },
    {
        name: "الأغاني",
        frequency: "105.8 FM",
        url: "https://www.maspero.eg/stream/13"
    },
    {
        name: "إذاعة القاهرة الكبرى",
        frequency: "102.2 FM",
        url: "https://www.maspero.eg/stream/14"
    },
    {
        name: "الشرق الأوسط",
        frequency: "89.5 FM",
        url: "https://www.maspero.eg/stream/16"
    },
    {
        name: "البرنامج الأوروبي",
        frequency: "95.4 FM",
        url: "https://www.maspero.eg/stream/18"
    }
];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getAACQuality(url) {
    if (/aac-128\.m3u8(?:$|[?#])/i.test(url)) {
        return "AAC-128";
    }

    if (/aac-64\.m3u8(?:$|[?#])/i.test(url)) {
        return "AAC-64";
    }

    return null;
}

async function main() {
    const browser = await chromium.launch({
        headless: true
    });

    try {
        const context = await browser.newContext();
        const results = [];

        for (const station of STATIONS) {
            console.log("");
            console.log("==============================");
            console.log("SEARCHING:", station.name);
            console.log("FREQUENCY:", station.frequency);
            console.log("SOURCE:", station.url);
            console.log("==============================");

            let captureStarted = false;

            let aac128 = null;
            let aac64 = null;

            // Prevent duplicate logging of the same URL.
            const seenUrls = new Set();

            const page = await context.newPage();

            // Use Chromium DevTools Protocol Network events.
            const cdp = await context.newCDPSession(page);

            await cdp.send("Network.enable");

            const inspectUrl = (url, eventType) => {
                if (!captureStarted || !url) return;

                const quality = getAACQuality(url);
                if (!quality) return;

                if (seenUrls.has(url)) return;
                seenUrls.add(url);

                console.log(`${quality} ${eventType}:`, url);

                if (quality === "AAC-128") {
                    aac128 = url;
                } else if (quality === "AAC-64") {
                    aac64 = url;
                }
            };

            const onRequest = event => {
                inspectUrl(event.request.url, "REQUEST");
            };

            const onResponse = event => {
                inspectUrl(event.response.url, "RESPONSE");
            };

            cdp.on("Network.requestWillBeSent", onRequest);
            cdp.on("Network.responseReceived", onResponse);

            try {
                await page.goto(station.url, {
                    waitUntil: "domcontentloaded",
                    timeout: 60000
                });

                console.log("WAITING 12 SECONDS FOR ADVERTISEMENT...");

                await sleep(AD_WAIT_MS);

                // Ignore every AAC link detected before this point.
                captureStarted = true;

                console.log("AD PERIOD FINISHED");
                console.log("CDP NETWORK CAPTURE STARTED");
                console.log("PRIORITY: AAC-128, THEN AAC-64");

                await sleep(CAPTURE_WAIT_MS);

            } catch (error) {
                console.log("PAGE ERROR:", error.message);

            } finally {
                captureStarted = false;

                cdp.off("Network.requestWillBeSent", onRequest);
                cdp.off("Network.responseReceived", onResponse);

                await cdp.detach().catch(() => {});
                await page.close().catch(() => {});
            }

            const selectedUrl = aac128 || aac64;

            if (selectedUrl) {
                const quality = aac128 ? "AAC-128" : "AAC-64";

                console.log("");
                console.log("SELECTED:", quality);
                console.log(selectedUrl);

                results.push({
                    name: station.name,
                    frequency: station.frequency,
                    source: station.url,
                    url: selectedUrl,
                    quality: quality
                });

            } else {
                console.log("");
                console.log("NO AAC-128 OR AAC-64 FOUND AFTER AD");
                console.log("OLD LINK WILL BE PRESERVED IF AVAILABLE");
            }
        }

        // Read existing JSON without deleting old data.
        let previousResults = [];

        if (fs.existsSync(OUTPUT_FILE)) {
            try {
                const oldData = JSON.parse(
                    fs.readFileSync(OUTPUT_FILE, "utf8")
                );

                if (!Array.isArray(oldData)) {
                    throw new Error("Existing JSON is not an array");
                }

                previousResults = oldData;

            } catch (error) {
                console.error(
                    "ERROR READING EXISTING JSON:",
                    error.message
                );

                console.error(
                    "UPDATE CANCELLED TO PROTECT THE OLD FILE."
                );

                process.exitCode = 1;
                return;
            }
        }

        // Index old and newly discovered links by source page.
        const previousBySource = new Map(
            previousResults.map(station => [station.source, station])
        );

        const newBySource = new Map(
            results.map(station => [station.source, station])
        );

        let updated = 0;
        let preserved = 0;
        let unchanged = 0;
        let added = 0;

        // Merge station results.
        const mergedResults = STATIONS.map(station => {
            const oldStation = previousBySource.get(station.url);
            const newStation = newBySource.get(station.url);

            // No new link: preserve old record.
            if (!newStation) {
                if (oldStation) {
                    preserved++;

                    console.log(
                        "PRESERVED OLD LINK:",
                        station.name,
                        oldStation.url
                    );

                    return oldStation;
                }

                console.log(
                    "NO LINK FOUND AND NO OLD LINK:",
                    station.name
                );

                return null;
            }

            // Existing station.
            if (oldStation) {
                if (oldStation.url === newStation.url) {
                    unchanged++;

                    console.log("UNCHANGED:", station.name);

                    return oldStation;
                }

                updated++;

                console.log("UPDATED LINK:", station.name);
                console.log("OLD:", oldStation.url);
                console.log("NEW:", newStation.url);

                return newStation;
            }

            // Newly discovered station.
            added++;

            console.log("NEW STATION LINK:", station.name);

            return newStation;

        }).filter(Boolean);

        // Preserve entries not included in STATIONS.
        const knownSources = new Set(
            STATIONS.map(station => station.url)
        );

        for (const oldStation of previousResults) {
            if (!knownSources.has(oldStation.source)) {
                mergedResults.push(oldStation);

                console.log(
                    "PRESERVED UNLISTED STATION:",
                    oldStation.name
                );
            }
        }

        // Write only if saved data has changed.
        const oldJson = JSON.stringify(previousResults, null, 2);
        const newJson = JSON.stringify(mergedResults, null, 2);

        if (oldJson !== newJson) {
            fs.writeFileSync(
                OUTPUT_FILE,
                newJson,
                "utf8"
            );

            console.log("");
            console.log("JSON UPDATED");

        } else {
            console.log("");
            console.log("NO CHANGES - OLD JSON PRESERVED");
        }

        console.log("");
        console.log("==============================");
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
