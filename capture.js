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


// ============================================================
// SETTINGS
// ============================================================

const PLAY_WAIT = 5000;

const AAC_WAIT = 10000;

const REQUEST_TIMEOUT = 15000;


// ============================================================
// HELPERS
// ============================================================

function sleep(ms){

    return new Promise(
        resolve => setTimeout(resolve, ms)
    );

}


function isM3U8(url){

    return (
        typeof url === "string" &&
        /\.m3u8(?:$|\?)/i.test(url)
    );

}


function isAAC128M3U8(url){

    return (
        typeof url === "string" &&
        /live-aac-128\.m3u8(?:$|\?)/i.test(url)
    );

}


function normalizeUrl(url){

    if(!url) return null;

    return url
        .replace(/&amp;/g, "&")
        .replace(/#.*$/, "")
        .trim();

}


// ============================================================
// DAILYMOTION FRAME
// ============================================================

function getDailymotionFrame(page){

    const frame =
        page.frames().find(
            frame =>
                /geo\.dailymotion\.com/i
                    .test(frame.url())
        );

    return frame || null;

}


// ============================================================
// PLAY
// ============================================================

async function clickPlay(page){

    const frame =
        getDailymotionFrame(page);

    if(!frame){

        console.log(
            "PLAY: DAILYMOTION FRAME NOT FOUND"
        );

        return false;

    }


    const selectors = [

        'button[aria-label="Play"]',

        'button[aria-label*="Play" i]',

        'button[title*="Play" i]',

        '.playback_button',

        '.playback_button.video_button_icon',

        'button[aria-label*="تشغيل" i]'

    ];


    for(const selector of selectors){

        try{

            const button =
                frame.locator(selector).first();

            if(
                await button.count() &&
                await button.isVisible().catch(
                    ()=>false
                )
            ){

                await button.click({
                    force:true
                });

                console.log(
                    "PLAY CLICKED:",
                    selector
                );

                return true;

            }

        }catch(error){

            // Continue.

        }

    }


    try{

        const video =
            frame.locator("video").first();

        if(await video.count()){

            await video.click({
                force:true
            });

            console.log(
                "PLAY CLICKED: VIDEO FALLBACK"
            );

            return true;

        }

    }catch(error){

        // Ignore.

    }


    console.log(
        "PLAY BUTTON NOT FOUND"
    );

    return false;

}


// ============================================================
// FETCH M3U8
// ============================================================

async function fetchM3U8(page, url){

    try{

        const response =
            await page.request.get(
                url,
                {
                    timeout: REQUEST_TIMEOUT,
                    failOnStatusCode: false
                }
            );


        const status =
            response.status();


        console.log(
            "HTTP:",
            status
        );


        if(status < 200 || status >= 300){

            return {

                ok: false,

                status,

                text: null

            };

        }


        const text =
            await response.text();


        if(
            !text ||
            !text.includes("#EXTM3U")
        ){

            return {

                ok: false,

                status,

                text: null

            };

        }


        return {

            ok: true,

            status,

            text

        };

    }catch(error){

        console.log(
            "FETCH ERROR:",
            error.message ||
            String(error)
        );

        return {

            ok: false,

            status: null,

            text: null

        };

    }

}


// ============================================================
// TEST AAC-128 STREAM
// ============================================================

async function testAAC128Stream(page, url){

    console.log("");
    console.log(
        "TEST AAC-128:"
    );

    console.log(url);


    const result =
        await fetchM3U8(
            page,
            url
        );


    if(!result.ok){

        console.log(
            "TEST AAC-128: FAILED"
        );

        return {

            ok: false,

            url,

            quality:
                "AAC-128",

            status:
                result.status

        };

    }


    const text =
        result.text;


    const isPlaylist =
        text.includes("#EXTINF") ||
        text.includes("#EXT-X-TARGETDURATION") ||
        text.includes("#EXT-X-MEDIA-SEQUENCE") ||
        text.includes("#EXT-X-STREAM-INF");


    if(!isPlaylist){

        console.log(
            "TEST AAC-128: INVALID M3U8"
        );

        return {

            ok: false,

            url,

            quality:
                "AAC-128",

            status:
                result.status

        };

    }


    console.log(
        "TEST AAC-128: OK"
    );


    return {

        ok: true,

        url,

        quality:
            "AAC-128",

        status:
            result.status

    };

}


// ============================================================
// CAPTURE ONE STATION
// ============================================================

async function captureStation(page, station){

    console.log("");
    console.log(
        "========================================"
    );

    console.log(
        "OPENING:",
        station.name
    );

    console.log(
        station.url
    );

    console.log(
        "========================================"
    );

    console.log("");


    const captured =
        new Map();


    let playbackDetected =
        false;


    let playClicked =
        false;


    // ========================================================
    // REAL BROWSER REQUEST CAPTURE
    // ========================================================

    const requestHandler =
        request => {

            try{

                const url =
                    normalizeUrl(
                        request.url()
                    );


                if(!isM3U8(url)){

                    return;

                }


                console.log("");
                console.log(
                    "M3U8 REQUESTED BY BROWSER:"
                );

                console.log(url);


                // ------------------------------------------------
                // AAC-128 TARGET
                // ------------------------------------------------

                if(
                    isAAC128M3U8(url)
                ){

                    console.log("");
                    console.log(
                        "******** AAC-128 FOUND ********"
                    );

                    console.log(
                        url
                    );

                    console.log(
                        "*******************************"
                    );


                    captured.set(
                        url,
                        {

                            url,

                            type:
                                "AAC-128",

                            time:
                                Date.now()

                        }
                    );

                }

            }catch(error){

                console.log(
                    "REQUEST HANDLER ERROR:",
                    error.message ||
                    String(error)
                );

            }

        };


    // ========================================================
    // REAL BROWSER RESPONSE CAPTURE
    // ========================================================

    const responseHandler =
        response => {

            try{

                const url =
                    normalizeUrl(
                        response.url()
                    );


                if(!isM3U8(url)){

                    return;

                }


                console.log("");
                console.log(
                    "M3U8 RESPONSE:"
                );

                console.log(
                    "HTTP:",
                    response.status()
                );

                console.log(url);


                // ------------------------------------------------
                // AAC-128 RESPONSE
                // ------------------------------------------------

                if(
                    isAAC128M3U8(url)
                ){

                    playbackDetected =
                        true;


                    console.log("");
                    console.log(
                        "******** AAC-128 RESPONSE ********"
                    );

                    console.log(
                        "HTTP:",
                        response.status()
                    );

                    console.log(
                        url
                    );

                    console.log(
                        "***********************************"
                    );


                    captured.set(
                        url,
                        {

                            url,

                            type:
                                "AAC-128",

                            status:
                                response.status(),

                            time:
                                Date.now()

                        }
                    );

                }

            }catch(error){

                console.log(
                    "RESPONSE HANDLER ERROR:",
                    error.message ||
                    String(error)
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


    try{

        // =====================================================
        // OPEN
        // =====================================================

        await page.goto(
            station.url,
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


        // =====================================================
        // WAIT FOR AUTOPLAY
        // =====================================================

        console.log("");
        console.log(
            "WAITING FOR AUTOPLAY..."
        );


        await sleep(
            PLAY_WAIT
        );


        // =====================================================
        // CHECK VIDEO STATE
        // =====================================================

        let videoState =
            null;


        try{

            const frame =
                getDailymotionFrame(
                    page
                );


            if(frame){

                const video =
                    frame
                        .locator(
                            "video"
                        )
                        .first();


                if(
                    await video.count()
                ){

                    videoState =
                        await video.evaluate(
                            element => {

                                return {

                                    paused:
                                        element.paused,

                                    readyState:
                                        element.readyState,

                                    currentTime:
                                        element.currentTime,

                                    ended:
                                        element.ended,

                                    currentSrc:
                                        element.currentSrc ||
                                        element.src ||
                                        ""

                                };

                            }
                        );

                }

            }

        }catch(error){

            console.log(
                "VIDEO STATE CHECK FAILED:",
                error.message ||
                String(error)
            );

        }


        console.log("");
        console.log(
            "VIDEO STATE:"
        );

        console.log(
            videoState
        );


        // =====================================================
        // DECIDE WHETHER PLAY IS NEEDED
        // =====================================================

        const playbackAlreadyStarted =
            (
                videoState &&
                videoState.paused === false &&
                (
                    videoState.readyState >= 2 ||
                    videoState.currentTime > 0
                )
            ) ||
            playbackDetected ||
            captured.size > 0;


        if(
            playbackAlreadyStarted
        ){

            console.log("");
            console.log(
                "PLAYBACK ALREADY ACTIVE"
            );

            console.log(
                "NO PLAY CLICK REQUIRED"
            );

        }else{

            console.log("");
            console.log(
                "PLAYBACK NOT ACTIVE"
            );

            console.log(
                "CLICKING PLAY ONCE..."
            );


            playClicked =
                await clickPlay(
                    page
                );


            if(playClicked){

                console.log(
                    "PLAY ACTION SENT"
                );

            }else{

                console.log(
                    "PLAY ACTION FAILED"
                );

            }

        }


        // =====================================================
        // WAIT FOR AAC-128
        // =====================================================

        console.log("");
        console.log(
            "WAITING FOR AAC-128 REQUEST..."
        );


        await sleep(
            AAC_WAIT
        );


        // =====================================================
        // SNAPSHOT
        // =====================================================

        const requests =
            [...captured.values()];


        console.log("");
        console.log(
            "AAC-128 STREAM REQUESTS:"
        );


        console.log(
            JSON.stringify(
                requests,
                null,
                2
            )
        );


        // =====================================================
        // TEST ALL AAC-128 CANDIDATES
        // =====================================================

        const candidates = [];


        for(
            const request
            of requests
        ){

            if(
                !isAAC128M3U8(
                    request.url
                )
            ){

                continue;

            }


            const tested =
                await testAAC128Stream(
                    page,
                    request.url
                );


            if(
                tested.ok
            ){

                candidates.push({

                    source:
                        request.url,

                    url:
                        request.url,

                    quality:
                        "AAC-128",

                    type:
                        "browser-direct-aac-128",

                    status:
                        tested.status

                });

            }

        }


        // =====================================================
        // UNIQUE CANDIDATES
        // =====================================================

        const unique =
            new Map();


        for(
            const candidate
            of candidates
        ){

            if(
                !unique.has(
                    candidate.url
                )
            ){

                unique.set(
                    candidate.url,
                    candidate
                );

            }

        }


        const finalCandidates =
            [...unique.values()];


        console.log("");
        console.log(
            "VERIFIED AAC-128 STREAMS:"
        );


        console.log(
            JSON.stringify(
                finalCandidates,
                null,
                2
            )
        );


        // =====================================================
        // SELECT AAC-128
        // =====================================================

        const selected =
            finalCandidates[0] ||
            null;


        // =====================================================
        // NO STREAM
        // =====================================================

        if(!selected){

            console.log("");
            console.log(
                "NO AAC-128 STREAM FOUND"
            );

            console.log(
                "SEARCH FOR THIS STATION FAILED:"
            );

            console.log(
                station.name
            );

            return null;

        }


        // =====================================================
        // FINAL
        // =====================================================

        console.log("");
        console.log(
            "========================================"
        );

        console.log(
            "SELECTED: AAC-128"
        );

        console.log(
            "SOURCE:",
            selected.type
        );

        console.log(
            "FINAL VERIFIED AAC-128 STREAM:"
        );

        console.log(
            selected.url
        );

        console.log(
            "========================================"
        );


        return {

            name:
                station.name,

            url:
                selected.url,

            quality:
                "AAC-128"

        };

    }catch(error){

        console.log("");
        console.log(
            "STATION ERROR:",
            error.message ||
            String(error)
        );

        return null;

    }finally{

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


// ============================================================
// MAIN
// ============================================================

async function main(){

    console.log("");
    console.log(
        "Starting Maspero Stream Finder..."
    );

    console.log(
        "Mode: BROWSER M3U8 + AAC-128 SEARCH"
    );

    console.log(
        "Target: live-aac-128.m3u8"
    );

    console.log(
        "Playback: AUTOPLAY FIRST -> PLAY ONLY IF NEEDED"
    );

    console.log("");
    console.log(
        "========================================"
    );
    console.log(
        "SEARCHING AAC-128 FOR ALL MASPERO STATIONS"
    );
    console.log(
        "========================================"
    );
    console.log("");


    const browser =
        await chromium.launch({
            headless:true
        });


    const page =
        await browser.newPage();


    const freshResults = [];


    for(
        const station
        of STATIONS
    ){

        const result =
            await captureStation(
                page,
                station
            );


        if(result){

            freshResults.push(
                result
            );

        }


        await page.goto(
            "about:blank"
        ).catch(()=>{});


        await sleep(
            1000
        );

    }


    // ========================================================
    // FRESH RESULTS
    // ========================================================

    console.log("");
    console.log(
        "========================================"
    );

    console.log(
        "FRESH AAC-128 RESULTS"
    );

    console.log(
        "========================================"
    );


    console.log(
        JSON.stringify(
            freshResults,
            null,
            2
        )
    );


    // ========================================================
    // LOAD OLD JSON
    // ========================================================

    let existing = [];


    if(
        fs.existsSync(
            OUTPUT_FILE
        )
    ){

        try{

            existing =
                JSON.parse(
                    fs.readFileSync(
                        OUTPUT_FILE,
                        "utf8"
                    )
                );

        }catch(error){

            console.log(
                "OLD JSON INVALID - STARTING EMPTY"
            );

            existing = [];

        }

    }


    // ========================================================
    // MERGE
    // ========================================================

    const output =
        existing.map(
            oldStation => {

                const fresh =
                    freshResults.find(
                        item =>
                            item.name ===
                            oldStation.name
                    );


                if(
                    fresh &&
                    fresh.url
                ){

                    if(
                        fresh.url !==
                        oldStation.url
                    ){

                        console.log("");
                        console.log(
                            "CHANGED:",
                            fresh.name
                        );

                        console.log(
                            "OLD:",
                            oldStation.url
                        );

                        console.log(
                            "NEW:",
                            fresh.url
                        );

                    }


                    return {

                        ...oldStation,

                        url:
                            fresh.url,

                        quality:
                            "AAC-128",

                        verified:
                            true

                    };

                }


                console.log(
                    "KEEPING OLD STREAM:",
                    oldStation.name
                );


                return oldStation;

            }
        );


    // ========================================================
    // ADD NEW
    // ========================================================

    for(
        const fresh
        of freshResults
    ){

        const exists =
            output.some(
                item =>
                    item.name ===
                    fresh.name
            );


        if(!exists){

            output.push({

                ...fresh,

                verified:
                    true

            });

        }

    }


    // ========================================================
    // SAVE
    // ========================================================

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
        "AAC-128 SEARCH COMPLETE"
    );

    console.log(
        "========================================"
    );

    console.log("");


    await browser.close();

}


main().catch(
    error => {

        console.error(
            "FATAL ERROR:",
            error
        );

        process.exit(1);

    }
);
