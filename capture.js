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

function loadOldData(){

    if(!fs.existsSync(OUTPUT_FILE)){

        return {
            updated: null,
            stations: []
        };

    }

    try{

        return JSON.parse(
            fs.readFileSync(
                OUTPUT_FILE,
                "utf8"
            )
        );

    }
    catch(error){

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
){

    if(
        !Array.isArray(
            oldData.stations
        )
    ){

        return null;

    }

    return oldData.stations.find(
        function(item){

            return (
                item.name === station.name &&
                item.frequency === station.frequency
            );

        }
    ) || null;

}


/* =========================================================
   CHECK AAC HLS
========================================================= */

function isAacStream(url){

    if(!url){

        return false;

    }

    /*
     * Must be an HLS playlist.
     */

    if(
        !/\.m3u8(?:[?#]|$)/i.test(url)
    ){

        return false;

    }

    /*
     * We specifically want AAC radio streams.
     */

    if(
        !/live-aac-/i.test(url)
    ){

        return false;

    }

    /*
     * Ignore generic Dailymotion manifests.
     */

    if(
        /\/cdn\/manifest\//i.test(url)
    ){

        return false;

    }

    if(
        /dmxleo\.dailymotion\.com/i.test(url)
    ){

        return false;

    }

    return true;

}


/* =========================================================
   GET AAC QUALITY
========================================================= */

function getQuality(url){

    const match =
        url.match(
            /live-aac-(\d+)\.m3u8/i
        );

    if(!match){

        return 0;

    }

    const value =
        Number(
            match[1]
        );

    /*
     * Prefer 128 if available.
     * Then 64.
     */

    if(value === 128) return 100;

    if(value === 64) return 90;

    return 50;

}


/* =========================================================
   CAPTURE STATION
========================================================= */

async function captureStation(
    browser,
    station
){

    if(!station.page){

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
        function(request){

            const url =
                request.url();


            if(
                isAacStream(url)
            ){

                streams.add(url);

                console.log("");
                console.log(
                    "AAC FOUND:"
                );

                console.log(
                    url
                );

            }

        }
    );


    try{

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
         * Give the Maspero player enough
         * time to start the stream.
         */

        await page.waitForTimeout(
            20000
        );

    }
    catch(error){

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


    if(
        results.length === 0
    ){

        console.log(
            `NO AAC FOUND: ${station.name}`
        );

        return null;

    }


    /*
     * Highest AAC quality first.
     */

    results.sort(
        function(a,b){

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
        `SELECTED AAC STREAM: ${station.name}`
    );

    console.log(
        selectedStream
    );


    return selectedStream;

}


/* =========================================================
   MAIN
========================================================= */

(async function(){

    console.log(
        "Starting Maspero AAC Stream Finder..."
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


    for(
        const station of stations
    ){

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


        /*
         * If capture failed,
         * keep the previous valid link.
         */

        if(!newStream){

            if(
                oldStation &&
                oldStation.stream
            ){

                outputStations.push({

                    name:
                        station.name,

                    frequency:
                        station.frequency,

                    stream:
                        oldStation.stream

                });

            }
            else{

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


        /*
         * Compare with old link.
         */

        if(
            !oldStation ||
            oldStation.stream !== newStream
        ){

            console.log("");
            console.log(
                `CHANGED: ${station.name}`
            );

            changed = true;

        }
        else{

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

    if(!changed){

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
