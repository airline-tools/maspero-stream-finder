const { chromium } = require("playwright");
const fs = require("fs");

const OUTPUT_FILE = "maspero-streams.json";

const STATIONS = [
    {
        name: "راديو مصر",
        url: "https://www.maspero.eg/stream/8"
    },
    {
        name: "الشرق الأوسط",
        url: "https://www.maspero.eg/stream/9"
    },
    {
        name: "البرنامج الثقافي ودراما FM",
        url: "https://www.maspero.eg/stream/10"
    },
    {
        name: "إذاعة القاهرة الكبرى",
        url: "https://www.maspero.eg/stream/11"
    },
    {
        name: "الأغاني",
        url: "https://www.maspero.eg/stream/12"
    },
    {
        name: "إذاعة البرنامج العام",
        url: "https://www.maspero.eg/stream/13"
    },
    {
        name: "الشباب والرياضة",
        url: "https://www.maspero.eg/stream/14"
    }
];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeUrl(url) {
    if (!url) return null;

    return url
        .replace(/&amp;/g, "&")
        .replace(/#.*$/, "")
        .trim();
}

function isM3U8(url) {
    return (
        typeof url === "string" &&
        /\.m3u8(?:$|\?)/i.test(url)
    );
}

function getQuality(url) {

    if (/live-h264-480\.m3u8/i.test(url))
        return 480;

    if (/live-h264-360\.m3u8/i.test(url))
        return 360;

    if (/live-h264-240\.m3u8/i.test(url))
        return 240;

    if (/live-aac-128\.m3u8/i.test(url))
        return 128;

    if (/live-aac-64\.m3u8/i.test(url))
        return 64;

    return 0;
}

async function clickPlay(page) {

    for (const frame of page.frames()) {

        try {

            const selectors = [
                'button[aria-label="Play"]',
                'button[aria-label*="Play" i]',
                'button[title*="Play" i]',
                '.playback_button',
                '.playback_button.video_button_icon'
            ];

            for (const selector of selectors) {

                const button =
                    frame.locator(selector).first();

                if (
                    await button.count() &&
                    await button.isVisible().catch(() => false)
                ) {

                    await button.click({
                        force: true
                    }).catch(() => {});

                    console.log(
                        "PLAY CLICKED:",
                        selector
                    );

                    return true;
                }
            }

        } catch (error) {
            // continue
        }
    }

    return false;
}

async function captureStation(page, station) {

    console.log("");
    console.log("========================================");
    console.log("OPENING:", station.name);
    console.log(station.url);
    console.log("========================================");

    const found = new Map();

    const requestHandler = request => {

        try {

            const url =
                normalizeUrl(request.url());

            if (!isM3U8(url))
                return;

            const quality =
                getQuality(url);

            console.log("");
            console.log("M3U8 FOUND:");
            console.log(url);
            console.log("QUALITY:", quality);

            found.set(url, {
                url,
                quality
            });

        } catch (error) {
            console.log(
                "REQUEST ERROR:",
                error.message
            );
        }
    };

    const responseHandler = response => {

        try {

            const url =
                normalizeUrl(response.url());

            if (!isM3U8(url))
                return;

            const status =
                response.status();

            console.log("");
            console.log("M3U8 RESPONSE:");
            console.log(status);
            console.log(url);

            if (status >= 200 && status < 400) {

                const quality =
                    getQuality(url);

                found.set(url, {
                    url,
                    quality,
                    status
                });

            }

        } catch (error) {
            console.log(
                "RESPONSE ERROR:",
                error.message
            );
        }
    };

    page.on(
        "request",
        requestHandler
    );

    page.on(
        "response",
        responseHandler
    );

    try {

        await page.goto(
            station.url,
            {
                waitUntil: "domcontentloaded",
                timeout: 60000
            }
        );

        console.log("PAGE LOADED");

        // Give autoplay a chance
        await sleep(5000);

        // If autoplay did not start, click Play once
        if (found.size === 0) {

            console.log(
                "NO STREAM YET - CLICKING PLAY"
            );

            await clickPlay(page);

        }

        // Wait for the actual browser request
        await sleep(10000);

        const candidates =
            [...found.values()];

        console.log("");
        console.log(
            "FOUND STREAMS:",
            candidates.length
        );

        console.log(
            JSON.stringify(
                candidates,
                null,
                2
            )
        );

        if (!candidates.length) {

            console.log(
                "NO STREAM FOUND:",
                station.name
            );

            return null;
        }

        /*
         * Prefer:
         * 480 H264
         * 360 H264
         * 240 H264
         * AAC 128
         * AAC 64
         * anything else
         */

        candidates.sort(
            (a, b) =>
                b.quality - a.quality
        );

        const selected =
            candidates[0];

        console.log("");
        console.log(
            "SELECTED:",
            station.name
        );

        console.log(
            selected.url
        );

        console.log(
            "QUALITY:",
            selected.quality
        );

        return {

            name:
                station.name,

            url:
                selected.url,

            quality:
                selected.quality,

            verified:
                true

        };

    } catch (error) {

        console.log("");
        console.log(
            "STATION ERROR:",
            station.name
        );

        console.log(
            error.message ||
            String(error)
        );

        return null;

    } finally {

        page.off(
            "request",
            requestHandler
        );

        page.off(
            "response",
            responseHandler
        );
    }
}

async function main() {

    console.log("");
    console.log(
        "STARTING MASPERO STREAM FINDER"
    );

    console.log(
        "MODE: SIMPLE BROWSER CAPTURE"
    );

    console.log("");

    const browser =
        await chromium.launch({
            headless: true
        });

    const page =
        await browser.newPage();

    const results = [];

    for (const station of STATIONS) {

        const result =
            await captureStation(
                page,
                station
            );

        if (result) {

            results.push(
                result
            );
        }

        await page.goto(
            "about:blank"
        ).catch(() => {});

        await sleep(1000);
    }

    console.log("");
    console.log(
        "========================================"
    );

    console.log(
        "FINAL RESULTS"
    );

    console.log(
        "========================================"
    );

    console.log(
        JSON.stringify(
            results,
            null,
            2
        )
    );

    /*
     * Keep only the 7 current Maspero stations.
     * Replace their URLs with the fresh ones.
     */

    let existing = [];

    if (
        fs.existsSync(
            OUTPUT_FILE
        )
    ) {

        try {

            existing =
                JSON.parse(
                    fs.readFileSync(
                        OUTPUT_FILE,
                        "utf8"
                    )
                );

        } catch (error) {

            existing = [];

        }
    }

    const output =
        existing.map(oldStation => {

            const fresh =
                results.find(
                    item =>
                        item.name ===
                        oldStation.name
                );

            if (fresh) {

                console.log("");
                console.log(
                    "UPDATED:",
                    fresh.name
                );

                console.log(
                    fresh.url
                );

                return {
                    ...oldStation,
                    url: fresh.url,
                    quality: fresh.quality,
                    verified: true
                };
            }

            return oldStation;
        });

    /*
     * Add stations that do not exist yet
     */

    for (const fresh of results) {

        const exists =
            output.some(
                item =>
                    item.name ===
                    fresh.name
            );

        if (!exists) {

            output.push(
                fresh
            );
        }
    }

    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(
            output,
            null,
            2
        ),
        "utf8"
    );

    console.log("");
    console.log(
        "========================================"
    );

    console.log(
        "SAVED:",
        OUTPUT_FILE
    );

    console.log(
        "FOUND:",
        results.length,
        "/",
        STATIONS.length
    );

    console.log(
        "========================================"
    );

    await browser.close();
}

main().catch(error => {

    console.error(
        "FATAL ERROR:",
        error.message ||
        String(error)
    );

    process.exit(1);

});
