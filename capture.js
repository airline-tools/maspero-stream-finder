const { chromium } = require("playwright");
const fs = require("fs");

const OUTPUT_FILE = "maspero-streams.json";

const stations = [
    {
        name: "راديو مصر",
        frequency: "88.7 FM",
        page: "https://www.maspero.eg/stream/8"
    },
    {
        name: "الشرق الأوسط",
        frequency: "89.5 FM",
        page: "https://www.maspero.eg/stream/16"
    },
    {
        name: "البرنامج الثقافي ودراما FM",
        frequency: "91.5 FM",
        page: "https://www.maspero.eg/stream/12"
    },
    {
        name: "إذاعة القاهرة الكبرى",
        frequency: "102.2 FM",
        page: "https://www.maspero.eg/stream/14"
    },
    {
        name: "الأغاني",
        frequency: "105.8 FM",
        page: "https://www.maspero.eg/stream/13"
    },
    {
        name: "إذاعة البرنامج العام",
        frequency: "107.4 FM",
        page: "https://www.maspero.eg/stream/10"
    },
    {
        name: "الشباب والرياضة",
        frequency: "108 FM",
        page: "https://www.maspero.eg/stream/11"
    }
];


/* =========================================================
   OLD DATA
========================================================= */

function loadOldData() {

    if (!fs.existsSync(OUTPUT_FILE)) {
        return {
            updated: null,
            stations: []
        };
    }

    try {
        return JSON.parse(
            fs.readFileSync(
                OUTPUT_FILE,
                "utf8"
            )
        );
    } catch (error) {
        return {
            updated: null,
            stations: []
        };
    }
}


function getOldStation(oldData, station) {

    if (!Array.isArray(oldData.stations)) {
        return null;
    }

    return oldData.stations.find(
        item =>
            item.name === station.name &&
            item.frequency === station.frequency
    ) || null;
}


/* =========================================================
   H264
========================================================= */

function isH264Stream(url) {

    if (!url) {
        return false;
    }

    if (!/\.m3u8(?:[?#]|$)/i.test(url)) {
        return false;
    }

    if (/\/cdn\/manifest\//i.test(url)) {
        return false;
    }

    return /live-h264-\d+\.m3u8/i.test(url);
}


function getQuality(url) {

    const match =
        url.match(
            /live-h264-(\d+)\.m3u8/i
        );

    if (!match) {
        return 0;
    }

    return Number(match[1]);
}


/* =========================================================
   DAILYMotion FRAME
========================================================= */

function getDailymotionFrame(page) {

    return page.frames().find(
        frame =>
            /geo\.dailymotion\.com/i.test(
                frame.url()
            )
    ) || null;
}


/* =========================================================
   PLAY
========================================================= */

async function clickRealPlayButton(page) {

    const frame =
        getDailymotionFrame(page);

    if (!frame) {
        console.log(
            "Dailymotion frame NOT FOUND."
        );
        return false;
    }

    const selectors = [

        'button[aria-label*="Play" i]',
        'button[title*="Play" i]',

        'button[aria-label*="تشغيل" i]',
        'button[title*="تشغيل" i]',

        ".dmp_Player__playButton",
        ".dmp_Player__play",
        ".dmp_Player__centerPlayButton",

        '[class*="playButton"]',
        '[class*="play-button"]',
        '[class*="play_button"]'
    ];


    for (const selector of selectors) {

        const button =
            frame
                .locator(selector)
                .first();

        if (
            await button.count()
        ) {

            try {

                await button.click({
                    timeout: 3000
                });

                console.log(
                    `PLAY CLICKED: ${selector}`
                );

                return true;

            } catch (error) {}
        }
    }


    /* Center click fallback */

    try {

        const video =
            frame
                .locator("video")
                .first();

        if (
            await video.count()
        ) {

            const box =
                await video.boundingBox();

            if (box) {

                await page.mouse.click(
                    box.x +
                        box.width / 2,

                    box.y +
                        box.height / 2
                );

                console.log(
                    "PLAY CLICKED: CENTER"
                );

                return true;
            }
        }

    } catch (error) {}


    console.log(
        "PLAY BUTTON NOT FOUND."
    );

    return false;
}


/* =========================================================
   STOP
========================================================= */

async function stopPlayer(page) {

    const frame =
        getDailymotionFrame(page);

    if (!frame) {
        return false;
    }


    const selectors = [

        'button[aria-label*="Pause" i]',
        'button[title*="Pause" i]',

        'button[aria-label*="إيقاف" i]',
        'button[title*="إيقاف" i]',

        ".dmp_Player__pauseButton",

        '[class*="pauseButton"]',
        '[class*="pause-button"]',
        '[class*="pause_button"]'
    ];


    for (const selector of selectors) {

        const button =
            frame
                .locator(selector)
                .first();

        if (
            await button.count()
        ) {

            try {

                await button.click({
                    timeout: 3000
                });

                console.log(
                    `STOP CLICKED: ${selector}`
                );

                return true;

            } catch (error) {}
        }
    }


    /* Fallback */

    try {

        const result =
            await frame
                .locator("video, audio")
                .evaluateAll(
                    elements => {

                        let stopped = false;

                        elements.forEach(
                            element => {

                                try {

                                    if (
                                        !element.paused
                                    ) {

                                        element.pause();

                                        stopped = true;
                                    }

                                } catch (e) {}
                            }
                        );

                        return stopped;
                    }
                );

        if (result) {

            console.log(
                "STOPPED USING MEDIA PAUSE"
            );

            return true;
        }

    } catch (error) {}


    return false;
}


/* =========================================================
   VERIFY PLAYBACK
========================================================= */

async function verifyPlayback(page) {

    const frame =
        getDailymotionFrame(page);

    if (!frame) {
        return false;
    }


    let previousTime = -1;


    for (
        let i = 0;
        i < 12;
        i++
    ) {

        await page.waitForTimeout(
            1000
        );


        const state =
            await frame
                .locator("video, audio")
                .evaluateAll(
                    elements =>
                        elements.map(
                            element => ({
                                paused:
                                    element.paused,

                                readyState:
                                    element.readyState,

                                currentTime:
                                    element.currentTime
                            })
                        )
                )
                .catch(() => []);


        const playing =
            state.find(
                media =>
                    media.paused === false &&
                    media.readyState >= 2 &&
                    media.currentTime > 0
            );


        if (playing) {

            if (
                previousTime >= 0 &&
                playing.currentTime >
                    previousTime
            ) {

                console.log(
                    "PLAYBACK CONFIRMED"
                );

                return true;
            }

            previousTime =
                playing.currentTime;
        }
    }


    console.log(
        "PLAYBACK NOT CONFIRMED"
    );

    return false;
}


/* =========================================================
   CAPTURE ONE STATION
========================================================= */

async function captureStation(
    browser,
    station
) {

    console.log("");
    console.log(
        "========================================"
    );

    console.log(
        `OPENING: ${station.name}`
    );

    console.log(
        station.page
    );

    console.log(
        "========================================"
    );


    const page =
        await browser.newPage();


    /*
       IMPORTANT:

       streamsBeforePlay2 = everything that happened
       before the SECOND PLAY.

       We will completely ignore it.
    */

    const allStreams =
        [];


    page.on(
        "request",
        request => {

            const url =
                request.url();

            if (
                !isH264Stream(url)
            ) {
                return;
            }

            const quality =
                getQuality(url);

            allStreams.push({

                quality: quality,

                url: url,

                time: Date.now()

            });

            console.log("");
            console.log(
                `H264 ${quality} REQUESTED`
            );

            console.log(url);
        }
    );


    try {

        /* -------------------------------------
           OPEN
        ------------------------------------- */

        await page.goto(
            station.page,
            {
                waitUntil:
                    "domcontentloaded",

                timeout:
                    60000
            }
        );


        console.log(
            "PAGE LOADED"
        );


        await page.waitForTimeout(
            3000
        );


        /* -------------------------------------
           FIRST PLAY
        ------------------------------------- */

        console.log("");
        console.log(
            "FIRST PLAY..."
        );


        const firstPlay =
            await clickRealPlayButton(
                page
            );


        if (!firstPlay) {

            await page.close();

            return null;
        }


        await verifyPlayback(
            page
        );


        await page.waitForTimeout(
            4000
        );


        /* -------------------------------------
           STOP
        ------------------------------------- */

        console.log("");
        console.log(
            "STOP..."
        );


        await stopPlayer(
            page
        );


        await page.waitForTimeout(
            2000
        );


        /* -------------------------------------
           IMPORTANT POINT
        ------------------------------------- */

        const secondPlayStartedAt =
            Date.now();


        console.log("");
        console.log(
            "========================================"
        );

        console.log(
            "SECOND PLAY STARTING"
        );

        console.log(
            "Streams before this point will be ignored."
        );

        console.log(
            "========================================"
        );


        /* -------------------------------------
           SECOND PLAY
        ------------------------------------- */

        const secondPlay =
            await clickRealPlayButton(
                page
            );


        if (!secondPlay) {

            await page.close();

            return null;
        }


        const secondPlayback =
            await verifyPlayback(
                page
            );


        if (!secondPlayback) {

            await page.close();

            return null;
        }


        console.log("");
        console.log(
            "SECOND PLAYBACK CONFIRMED"
        );


        /* -------------------------------------
           WAIT FOR NEW REQUESTS
        ------------------------------------- */

        await page.waitForTimeout(
            12000
        );


        /* -------------------------------------
           ONLY REQUESTS AFTER SECOND PLAY
        ------------------------------------- */

        const validStreams =
            allStreams.filter(
                item =>
                    item.time >=
                    secondPlayStartedAt
            );


        console.log("");
        console.log(
            "========================================"
        );

        console.log(
            "STREAMS AFTER SECOND PLAY:"
        );

        console.log(
            JSON.stringify(
                validStreams,
                null,
                2
            )
        );

        console.log(
            "========================================"
        );


        /* -------------------------------------
           KEEP HIGHEST QUALITY
        ------------------------------------- */

        const byQuality =
            new Map();


        validStreams.forEach(
            item => {

                byQuality.set(
                    item.quality,
                    item.url
                );

            }
        );


        const qualities =
            [...byQuality.keys()]
                .sort(
                    (a, b) => b - a
                );


        console.log("");
        console.log(
            "AVAILABLE QUALITIES AFTER SECOND PLAY:"
        );

        console.log(
            qualities
        );


        let selectedStream =
            null;


        if (
            byQuality.has(480)
        ) {

            selectedStream =
                byQuality.get(480);

            console.log(
                "SELECTED: H264 480"
            );

        } else if (
            byQuality.has(360)
        ) {

            selectedStream =
                byQuality.get(360);

            console.log(
                "SELECTED: H264 360"
            );

        } else if (
            byQuality.has(240)
        ) {

            selectedStream =
                byQuality.get(240);

            console.log(
                "SELECTED: H264 240"
            );
        }


        await page.close();


        if (!selectedStream) {

            console.log(
                "NO VALID STREAM AFTER SECOND PLAY."
            );

            return null;
        }


        console.log("");
        console.log(
            "FINAL STREAM:"
        );

        console.log(
            selectedStream
        );


        return selectedStream;


    } catch (error) {

        console.log("");
        console.log(
            `ERROR: ${station.name}`
        );

        console.log(
            error.message
        );


        await page.close();

        return null;
    }
}


/* =========================================================
   MAIN
========================================================= */

(async () => {

    console.log("");
    console.log(
        "Starting Maspero Stream Finder..."
    );

    console.log(
        "Quality detection: AFTER SECOND PLAY"
    );

    console.log(
        "Priority: 480 > 360 > 240"
    );


    const oldData =
        loadOldData();


    const browser =
        await chromium.launch({
            headless: true
        });


    const outputStations =
        [];


    let changed =
        false;


    for (
        const station of stations
    ) {

        const oldStation =
            getOldStation(
                oldData,
                station
            );


        const newStream =
            await captureStation(
                browser,
                station
            );


        if (!newStream) {

            console.log("");
            console.log(
                `CAPTURE FAILED: ${station.name}`
            );


            if (
                oldStation &&
                oldStation.stream
            ) {

                console.log(
                    "KEEPING PREVIOUS STREAM"
                );


                outputStations.push({

                    name:
                        station.name,

                    frequency:
                        station.frequency,

                    stream:
                        oldStation.stream

                });

            } else {

                outputStations.push({

                    name:
                        station.name,

                    frequency:
                        station.frequency,

                    stream:
                        ""

                });
            }


            continue;
        }


        if (
            !oldStation ||
            oldStation.stream !==
                newStream
        ) {

            console.log("");
            console.log(
                `CHANGED: ${station.name}`
            );

            changed =
                true;

        } else {

            console.log("");
            console.log(
                `UNCHANGED: ${station.name}`
            );
        }


        outputStations.push({

            name:
                station.name,

            frequency:
                station.frequency,

            stream:
                newStream

        });
    }


    await browser.close();


    if (!changed) {

        console.log("");
        console.log(
            "NO CHANGES DETECTED."
        );

        console.log(
            "JSON NOT MODIFIED."
        );

        process.exit(0);
    }


    const output = {

        updated:
            new Date().toISOString(),

        stations:
            outputStations

    };


    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(
            output,
            null,
            4
        ) + "\n",
        "utf8"
    );


    console.log("");
    console.log(
        "========================================"
    );

    console.log(
        "maspero-streams.json UPDATED"
    );

    console.log(
        "========================================"
    );

})();
