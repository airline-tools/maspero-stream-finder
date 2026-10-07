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
   H264 STREAM DETECTION
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

    console.log("");
    console.log("Looking for Dailymotion player...");

    let frame = null;

    for (let attempt = 1; attempt <= 20; attempt++) {

        frame =
            getDailymotionFrame(page);

        if (frame) {

            console.log(
                `Dailymotion iframe found. Attempt ${attempt}`
            );

            break;
        }

        await page.waitForTimeout(1000);
    }

    if (!frame) {

        console.log(
            "Dailymotion iframe NOT FOUND."
        );

        return false;
    }


    console.log("");
    console.log("Dailymotion frame:");
    console.log(frame.url());


    await page.waitForTimeout(3000);


    /* -----------------------------------------
       SHOW BUTTONS
    ----------------------------------------- */

    const buttons =
        await frame
            .locator("button")
            .evaluateAll(
                elements =>
                    elements.map(
                        (element, index) => ({
                            index,

                            text:
                                (
                                    element.innerText ||
                                    ""
                                ).trim(),

                            aria:
                                element.getAttribute(
                                    "aria-label"
                                ) || "",

                            title:
                                element.getAttribute(
                                    "title"
                                ) || "",

                            cls:
                                typeof element.className ===
                                "string"
                                    ? element.className
                                    : ""
                        })
                    )
            )
            .catch(() => []);


    console.log("");
    console.log("DAILYMOTION BUTTONS:");
    console.log(
        JSON.stringify(
            buttons,
            null,
            2
        )
    );


    /* -----------------------------------------
       PLAY BUTTON
    ----------------------------------------- */

    const playSelectors = [

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


    for (const selector of playSelectors) {

        const button =
            frame
                .locator(selector)
                .first();

        if (
            await button.count()
        ) {

            try {

                await button.click({
                    timeout: 5000
                });

                console.log("");
                console.log(
                    "PLAY BUTTON CLICKED"
                );

                console.log(
                    `Selector: ${selector}`
                );

                return true;

            } catch (error) {

                console.log(
                    `Could not click ${selector}`
                );

            }
        }
    }


    /* -----------------------------------------
       CENTER CLICK FALLBACK
    ----------------------------------------- */

    try {

        const player =
            frame
                .locator("video")
                .first();

        if (
            await player.count()
        ) {

            const box =
                await player.boundingBox();

            if (box) {

                await page.mouse.click(
                    box.x +
                        box.width / 2,

                    box.y +
                        box.height / 2
                );

                console.log("");
                console.log(
                    "CLICKED PLAYER CENTER"
                );

                return true;
            }
        }

    } catch (error) {

        console.log(
            "Could not click player center."
        );

    }


    console.log("");
    console.log(
        "PLAY BUTTON NOT FOUND."
    );

    return false;
}


/* =========================================================
   STOP
========================================================= */

async function stopRealPlayer(page) {

    console.log("");
    console.log(
        "STOPPING PLAYER..."
    );


    const frame =
        getDailymotionFrame(page);


    if (!frame) {

        console.log(
            "Dailymotion frame not found while stopping."
        );

        return false;
    }


    /* -----------------------------------------
       TRY DAILYMOTION PAUSE BUTTON
    ----------------------------------------- */

    const pauseSelectors = [

        'button[aria-label*="Pause" i]',

        'button[title*="Pause" i]',

        'button[aria-label*="إيقاف" i]',

        'button[title*="إيقاف" i]',

        ".dmp_Player__pauseButton",

        '[class*="pauseButton"]',

        '[class*="pause-button"]',

        '[class*="pause_button"]'

    ];


    for (const selector of pauseSelectors) {

        const button =
            frame
                .locator(selector)
                .first();

        if (
            await button.count()
        ) {

            try {

                await button.click({
                    timeout: 5000
                });

                console.log(
                    "PLAYER STOPPED USING PLAYER BUTTON."
                );

                return true;

            } catch (error) {

                console.log(
                    `Could not stop using ${selector}`
                );

            }
        }
    }


    /* -----------------------------------------
       FALLBACK: PAUSE MEDIA
    ----------------------------------------- */

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
                "PLAYER STOPPED USING MEDIA PAUSE."
            );

            return true;
        }

    } catch (error) {

        console.log(
            "Could not pause media."
        );

    }


    console.log(
        "PLAYER STOP COULD NOT BE CONFIRMED."
    );

    return false;
}


/* =========================================================
   VERIFY PLAYBACK
========================================================= */

async function verifyPlayback(page) {

    console.log("");
    console.log(
        "Verifying actual playback..."
    );


    const frame =
        getDailymotionFrame(page);


    if (!frame) {

        console.log(
            "Dailymotion frame disappeared."
        );

        return false;
    }


    let previousTime = -1;


    for (
        let i = 1;
        i <= 20;
        i++
    ) {

        await page.waitForTimeout(
            1500
        );


        const state =
            await frame
                .locator("video, audio")
                .evaluateAll(
                    elements =>
                        elements.map(
                            element => ({
                                tag:
                                    element.tagName,

                                paused:
                                    element.paused,

                                readyState:
                                    element.readyState,

                                currentTime:
                                    element.currentTime,

                                duration:
                                    element.duration,

                                src:
                                    element.currentSrc ||
                                    element.src ||
                                    ""
                            })
                        )
                )
                .catch(() => []);


        console.log("");
        console.log(
            `PLAYBACK CHECK ${i}/20`
        );

        console.log(
            JSON.stringify(
                state,
                null,
                2
            )
        );


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

                console.log("");
                console.log(
                    "================================"
                );

                console.log(
                    "PLAYBACK CONFIRMED"
                );

                console.log(
                    `Current time: ${playing.currentTime}`
                );

                console.log(
                    "================================"
                );

                return true;
            }


            previousTime =
                playing.currentTime;
        }
    }


    console.log("");
    console.log(
        "PLAYBACK NOT CONFIRMED."
    );

    return false;
}


/* =========================================================
   CAPTURE STATION
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


    const streams =
        new Map();


    /* -----------------------------------------
       NETWORK CAPTURE
    ----------------------------------------- */

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


            streams.set(
                quality,
                url
            );


            console.log("");
            console.log(
                `H264 ${quality} FOUND`
            );

            console.log(
                url
            );

        }
    );


    try {

        /* -------------------------------------
           OPEN PAGE
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
            "Page loaded."
        );


        /* -------------------------------------
           FIRST PLAY
        ------------------------------------- */

        const clicked =
            await clickRealPlayButton(
                page
            );


        if (!clicked) {

            console.log("");
            console.log(
                "COULD NOT START PLAYER."
            );

            await page.close();

            return null;
        }


        /* -------------------------------------
           WAIT FOR FIRST PLAYBACK
        ------------------------------------- */

        await page.waitForTimeout(
            5000
        );


        const firstPlayback =
            await verifyPlayback(
                page
            );


        if (!firstPlayback) {

            console.log("");
            console.log(
                "FIRST PLAYBACK NOT CONFIRMED."
            );

            await page.close();

            return null;
        }


        /* -------------------------------------
           STOP
        ------------------------------------- */

        const stopped =
            await stopRealPlayer(
                page
            );


        if (!stopped) {

            console.log("");
            console.log(
                "STOP COULD NOT BE CONFIRMED."
            );

            await page.close();

            return null;
        }


        /* -------------------------------------
           WAIT AFTER STOP
        ------------------------------------- */

        await page.waitForTimeout(
            2000
        );


        /* -------------------------------------
           CLEAR OLD CAPTURE
        ------------------------------------- */

        streams.clear();


        console.log("");
        console.log(
            "OLD CAPTURE CLEARED."
        );


        /* -------------------------------------
           SECOND PLAY
        ------------------------------------- */

        const clickedAgain =
            await clickRealPlayButton(
                page
            );


        if (!clickedAgain) {

            console.log("");
            console.log(
                "COULD NOT RESTART PLAYER."
            );

            await page.close();

            return null;
        }


        console.log("");
        console.log(
            "SECOND PLAY STARTED."
        );


        /* -------------------------------------
           VERIFY SECOND PLAYBACK
        ------------------------------------- */

        const secondPlayback =
            await verifyPlayback(
                page
            );


        if (!secondPlayback) {

            console.log("");
            console.log(
                "SECOND PLAYBACK NOT CONFIRMED."
            );

            await page.close();

            return null;
        }


        console.log("");
        console.log(
            "SECOND PLAYBACK CONFIRMED."
        );


        /* -------------------------------------
           GIVE NETWORK TIME
        ------------------------------------- */

        console.log("");
        console.log(
            "WAITING FOR H264 QUALITY STREAMS..."
        );


        await page.waitForTimeout(
            10000
        );


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


    /* =====================================================
       SELECT HIGHEST AVAILABLE QUALITY
    ===================================================== */

    console.log("");
    console.log(
        "AVAILABLE H264 QUALITIES:"
    );


    const qualities =
        [...streams.keys()]
            .sort(
                (a, b) => b - a
            );


    console.log(
        qualities
    );


    let selectedStream =
        null;


    if (
        streams.has(480)
    ) {

        selectedStream =
            streams.get(480);

        console.log("");
        console.log(
            "SELECTED H264 480"
        );

    } else if (
        streams.has(360)
    ) {

        selectedStream =
            streams.get(360);

        console.log("");
        console.log(
            "SELECTED H264 360"
        );

    } else if (
        streams.has(240)
    ) {

        selectedStream =
            streams.get(240);

        console.log("");
        console.log(
            "SELECTED H264 240"
        );

    }


    await page.close();


    if (!selectedStream) {

        console.log("");
        console.log(
            "NO H264 STREAM CAPTURED."
        );

        return null;
    }


    console.log("");
    console.log(
        "FINAL SELECTED STREAM:"
    );

    console.log(
        selectedStream
    );


    return selectedStream;
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
        "Playback verification: ENABLED"
    );

    console.log(
        "Playback sequence: PLAY -> STOP -> PLAY"
    );

    console.log(
        "Preferred quality: H264 480"
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


        /* -------------------------------------
           CAPTURE FAILED
        ------------------------------------- */

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
                    "Keeping previous stream."
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


        /* -------------------------------------
           COMPARE
        ------------------------------------- */

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


    /* -----------------------------------------
       NO CHANGES
    ----------------------------------------- */

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


    /* -----------------------------------------
       SAVE
    ----------------------------------------- */

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
