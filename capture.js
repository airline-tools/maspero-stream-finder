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

    }
    catch (error) {

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

function getOldStation(
    oldData,
    station
) {

    if (
        !Array.isArray(
            oldData.stations
        )
    ) {

        return null;

    }

    return oldData.stations.find(
        function (item) {

            return (
                item.name === station.name &&
                item.frequency === station.frequency
            );

        }
    ) || null;

}


/* =========================================================
   CHECK H264 STREAM
========================================================= */

function isH264Stream(url) {

    if (!url) {

        return false;

    }

    if (
        !/\.m3u8(?:[?#]|$)/i.test(url)
    ) {

        return false;

    }

    if (
        /\/cdn\/manifest\//i.test(url)
    ) {

        return false;

    }

    if (
        /dmxleo\.dailymotion\.com/i.test(url)
    ) {

        return false;

    }

    return /live-h264-(?:240|360|480)\.m3u8/i.test(url);

}


/* =========================================================
   GET H264 QUALITY
========================================================= */

function getQuality(url) {

    const match =
        url.match(
            /live-h264-(\d+)\.m3u8/i
        );

    if (!match) {

        return 0;

    }

    const value =
        Number(match[1]);


    /*
     * Prefer 480.
     */

    if (value === 480) return 100;

    if (value === 360) return 90;

    if (value === 240) return 80;


    return 0;

}


/* =========================================================
   CAPTURE STATION
========================================================= */

async function captureStation(
    browser,
    station
) {

    if (!station.page) {

        console.log(
            `SKIP: ${station.name} - page not configured`
        );

        return null;

    }


    console.log("");
    console.log(
        `Opening ${station.name}`
    );

    console.log(
        `Page: ${station.page}`
    );


    const page =
        await browser.newPage();


    const streams =
        new Set();


    /* =====================================================
       CAPTURE NETWORK REQUESTS
    ===================================================== */

    page.on(
        "request",
        function (request) {

            const url =
                request.url();


            if (
                isH264Stream(url)
            ) {

                streams.add(url);


                console.log("");
                console.log(
                    "H264 FOUND:"
                );

                console.log(
                    url
                );

            }

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


        /*
         * Give the player enough time
         * to request the stream.
         */

        await page.waitForTimeout(
            20000
        );

    }
    catch (error) {

        console.log(
            `ERROR: ${station.name}`
        );

        console.log(
            error.message
        );


        await page.close();

        return null;

    }


    await page.close();


    const results =
        [...streams];


    if (
        results.length === 0
    ) {

        console.log(
            `NO H264 FOUND: ${station.name}`
        );

        return null;

    }


    /* =====================================================
       SORT BY QUALITY

       480 → 360 → 240
    ===================================================== */

    results.sort(
        function (a, b) {

            return (
                getQuality(b) -
                getQuality(a)
            );

        }
    );


    const selectedStream =
        results[0];


    console.log("");
    console.log(
        `SELECTED H264 STREAM: ${station.name}`
    );

    console.log(
        selectedStream
    );


    return selectedStream;

}


/* =========================================================
   MAIN
========================================================= */

(async function () {

    console.log(
        "Starting Maspero H264 Stream Finder..."
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

           Keep old valid stream.
        ================================================= */

        if (!newStream) {

            if (
                oldStation &&
                oldStation.stream
            ) {

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
        "================================"
    );

    console.log(
        "maspero-streams.json UPDATED"
    );

    console.log(
        "================================"
    );

})();
