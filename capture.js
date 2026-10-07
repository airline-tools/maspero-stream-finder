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
   LOAD OLD DATA
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

        console.log(
            "Could not read existing JSON."
        );

        return {
            updated: null,
            stations: []
        };

    }

}


/* =========================================================
   FIND OLD STATION
========================================================= */

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
   H264 STREAM CHECK
========================================================= */

function isH264Stream(url) {

    if (!url) {
        return false;
    }

    if (!/\.m3u8(?:[?#]|$)/i.test(url)) {
        return false;
    }

    return /live-h264-(?:240|360|480)\.m3u8/i.test(url);

}


/* =========================================================
   GET QUALITY
========================================================= */

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
   CAPTURE + VERIFY PLAYBACK
========================================================= */

async function captureStation(browser, station) {

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


    let playbackStarted =
        false;


    /* =====================================================
       CAPTURE H264 REQUESTS
    ===================================================== */

    page.on(
        "request",
        request => {

            const url =
                request.url();


            if (!isH264Stream(url)) {
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

            console.log(url);

        }
    );


    try {

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


        /* =================================================
           FIND VIDEO / AUDIO ELEMENTS
        ================================================= */

        const mediaInfo =
            await page.evaluate(
                () => {

                    const media =
                        [
                            ...document.querySelectorAll(
                                "video, audio"
                            )
                        ];

                    return media.map(
                        element => ({

                            tag:
                                element.tagName,

                            paused:
                                element.paused,

                            readyState:
                                element.readyState,

                            currentTime:
                                element.currentTime,

                            src:
                                element.currentSrc ||
                                element.src ||
                                ""

                        })
                    );

                }
            );


        console.log("");
        console.log(
            "MEDIA ELEMENTS:"
        );

        console.log(
            JSON.stringify(
                mediaInfo,
                null,
                2
            )
        );


        /* =================================================
           TRY TO PLAY MEDIA
        ================================================= */

        const playResult =
            await page.evaluate(
                async () => {

                    const media =
                        [
                            ...document.querySelectorAll(
                                "video, audio"
                            )
                        ];

                    const results = [];

                    for (
                        const element of media
                    ) {

                        try {

                            element.muted = true;

                            const result =
                                element.play();


                            if (
                                result &&
                                typeof result.then === "function"
                            ) {

                                await result;

                            }


                            results.push({

                                tag:
                                    element.tagName,

                                playing:
                                    !element.paused,

                                readyState:
                                    element.readyState,

                                currentTime:
                                    element.currentTime

                            });

                        }
                        catch (error) {

                            results.push({

                                tag:
                                    element.tagName,

                                playing:
                                    false,

                                error:
                                    error.message

                            });

                        }

                    }


                    return results;

                }
            );


        console.log("");
        console.log(
            "PLAY RESULT:"
        );

        console.log(
            JSON.stringify(
                playResult,
                null,
                2
            )
        );


        /* =================================================
           WAIT FOR ACTUAL PLAYBACK
        ================================================= */

        for (
            let i = 0;
            i < 15;
            i++
        ) {

            await page.waitForTimeout(
                2000
            );


            const state =
                await page.evaluate(
                    () => {

                        const media =
                            [
                                ...document.querySelectorAll(
                                    "video, audio"
                                )
                            ];


                        return media.map(
                            element => ({

                                tag:
                                    element.tagName,

                                paused:
                                    element.paused,

                                readyState:
                                    element.readyState,

                                currentTime:
                                    element.currentTime,

                                src:
                                    element.currentSrc ||
                                    element.src ||
                                    ""

                            })
                        );

                    }
                );


            console.log("");
            console.log(
                `PLAYBACK CHECK ${i + 1}/15`
            );

            console.log(
                JSON.stringify(
                    state,
                    null,
                    2
                )
            );


            /*
             * Actual playback means:
             *
             * paused = false
             * readyState >= 2
             * currentTime > 0
             */

            const playingMedia =
                state.find(
                    media =>
                        media.paused === false &&
                        media.readyState >= 2 &&
                        media.currentTime > 0
                );


            if (playingMedia) {

                playbackStarted =
                    true;


                console.log("");
                console.log(
                    "========================================"
                );

                console.log(
                    "PLAYBACK CONFIRMED"
                );

                console.log(
                    `MEDIA: ${playingMedia.tag}`
                );

                console.log(
                    `CURRENT TIME: ${playingMedia.currentTime}`
                );

                console.log(
                    "========================================"
                );

                break;

            }

        }


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
       DO NOT ACCEPT ANY STREAM WITHOUT PLAYBACK
    ===================================================== */

    if (!playbackStarted) {

        console.log("");
        console.log(
            "PLAYBACK NOT CONFIRMED"
        );

        console.log(
            `REJECTED: ${station.name}`
        );


        await page.close();

        return null;

    }


    /* =====================================================
       PLAYBACK CONFIRMED
       NOW SELECT QUALITY
    ===================================================== */

    console.log("");
    console.log(
        "AVAILABLE H264 QUALITIES:"
    );

    console.log(
        [...streams.keys()]
            .sort(
                (a, b) =>
                    b - a
            )
    );


    let selectedStream =
        null;


    /*
     * 480 FIRST
     */

    if (streams.has(480)) {

        selectedStream =
            streams.get(480);

        console.log("");
        console.log(
            "SELECTED QUALITY: 480"
        );

    }

    /*
     * 360 SECOND
     */

    else if (streams.has(360)) {

        selectedStream =
            streams.get(360);

        console.log("");
        console.log(
            "SELECTED QUALITY: 360"
        );

    }

    /*
     * 240 LAST
     */

    else if (streams.has(240)) {

        selectedStream =
            streams.get(240);

        console.log("");
        console.log(
            "SELECTED QUALITY: 240"
        );

    }


    await page.close();


    if (!selectedStream) {

        console.log("");
        console.log(
            "PLAYBACK WORKED BUT NO H264 STREAM WAS CAPTURED."
        );

        return null;

    }


    console.log("");
    console.log(
        "SELECTED STREAM:"
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

    console.log(
        "Starting Maspero Stream Finder..."
    );

    console.log(
        "Playback verification: ENABLED"
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


        /* =================================================
           CAPTURE FAILED
        ================================================= */

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

            }
            else {

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


        /* =================================================
           CHECK CHANGE
        ================================================= */

        if (
            !oldStation ||
            oldStation.stream !== newStream
        ) {

            console.log("");
            console.log(
                `CHANGED: ${station.name}`
            );

            changed = true;

        }
        else {

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


    /* =====================================================
       NO CHANGES
    ===================================================== */

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


    /* =====================================================
       WRITE JSON
    ===================================================== */

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
