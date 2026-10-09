const { chromium } = require("playwright");
const fs = require("fs");

const OUTPUT_FILE = "maspero-streams.json";

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


async function main() {

    const browser = await chromium.launch({
        headless: true
    });

    try {

        const page = await browser.newPage();

        const results = [];

        for (const station of STATIONS) {

            console.log("");
            console.log("==============================");
            console.log("SEARCHING:", station.name);
            console.log("FREQUENCY:", station.frequency);
            console.log("SOURCE:", station.url);
            console.log("==============================");

            let aac128 = null;
            let aac64 = null;

            const handler = request => {

                const url = request.url();

                if (
                    /\.(m3u8|mp3|aac|m4a|mpd)(?:$|[?#])/i.test(url) ||
                    /icecast|stream|audio|radio|live/i.test(url)
                ) {

                    console.log("MEDIA REQUEST:", url);

                    if (/live-aac-128\.m3u8/i.test(url)) {
                        aac128 = url;
                    } else if (/live-aac-64\.m3u8/i.test(url)) {
                        aac64 = url;
                    }
                }
            };

            page.on("request", handler);

            try {

                await page.goto(station.url, {
                    waitUntil: "domcontentloaded",
                    timeout: 60000
                });

                await sleep(15000);

            } catch (error) {

                console.log("PAGE ERROR:", error.message);

            } finally {

                page.off("request", handler);

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
                console.log("NO AAC-128 OR AAC-64 FOUND");
                console.log("OLD LINK WILL BE PRESERVED IF AVAILABLE");

            }

            await page.goto("about:blank").catch(() => {});

        }


        // Read the existing JSON without deleting its old data.
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


        // Index the old and newly discovered station links by source page.
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


        // Merge results station by station.
        const mergedResults = STATIONS.map(station => {

            const oldStation = previousBySource.get(station.url);
            const newStation = newBySource.get(station.url);

            // Search did not find a link: keep the old station unchanged.
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


            // A link was found and this station already exists.
            if (oldStation) {

                // Same stream URL: do not replace the existing record.
                if (oldStation.url === newStation.url) {

                    unchanged++;

                    console.log(
                        "UNCHANGED:",
                        station.name
                    );

                    return oldStation;

                }

                // Different stream URL: update to the newly discovered URL.
                updated++;

                console.log(
                    "UPDATED LINK:",
                    station.name
                );

                console.log("OLD:", oldStation.url);
                console.log("NEW:", newStation.url);

                return newStation;

            }


            // First discovery of a station not already in the JSON.
            added++;

            console.log(
                "NEW STATION LINK:",
                station.name
            );

            return newStation;

        }).filter(Boolean);


        // Preserve any existing entries not included in STATIONS.
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


        // Write only when the actual saved data has changed.
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
