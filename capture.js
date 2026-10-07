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

const PREFERRED_QUALITIES = [
    480,
    360,
    240
];

const PLAY_WAIT = 5000;

const QUALITY_WAIT = 10000;

const REQUEST_TIMEOUT = 15000;


// ============================================================
// HELPERS
// ============================================================

function sleep(ms){

    return new Promise(
        resolve => setTimeout(resolve, ms)
    );

}


function getQualityFromUrl(url){

    if(!url) return null;

    const match =
        url.match(
            /live-h264-(\d+)\.m3u8/i
        );

    if(!match) return null;

    return Number(match[1]);

}


function isM3U8(url){

    return (
        typeof url === "string" &&
        /\.m3u8(?:$|\?)/i.test(url)
    );

}


function isH264M3U8(url){

    return (
        typeof url === "string" &&
        /live-h264-\d+\.m3u8/i.test(url)
    );

}


function normalizeUrl(url){

    if(!url) return null;

    return url
        .replace(/&amp;/g, "&")
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
// TEST STREAM
// ============================================================

async function testStream(page, url, quality){

    console.log("");
    console.log(
        `TEST ${quality || "UNKNOWN"}:`
    );

    console.log(url);


    const result =
        await fetchM3U8(
            page,
            url
        );


    if(!result.ok){

        console.log(
            `TEST ${quality || "UNKNOWN"}: FAILED`
        );

        return {

            ok: false,

            url,

            quality,

            status:
                result.status

        };

    }


    const text =
        result.text;


    // --------------------------------------------------------
    // Make sure this is actually an HLS playlist.
    // --------------------------------------------------------

    const isPlaylist =
        text.includes("#EXTINF") ||
        text.includes("#EXT-X-TARGETDURATION") ||
        text.includes("#EXT-X-MEDIA-SEQUENCE") ||
        text.includes("#EXT-X-STREAM-INF");


    if(!isPlaylist){

        console.log(
            `TEST ${quality || "UNKNOWN"}: INVALID M3U8`
        );

        return {

            ok: false,

            url,

            quality,

            status:
                result.status

        };

    }


    console.log(
        `TEST ${quality || "UNKNOWN"}: OK`
    );


    return {

        ok: true,

        url,

        quality,

        status:
            result.status

    };

}


// ============================================================
// PARSE MASTER PLAYLIST
// ============================================================

function parseMasterPlaylist(text, baseUrl){

    if(!text){

        return [];

    }


    if(
        !text.includes(
            "#EXT-X-STREAM-INF"
        )
    ){

        return [];

    }


    const lines =
        text
            .split(/\r?\n/)
            .map(
                line => line.trim()
            )
            .filter(Boolean);


    const variants = [];


    for(let i = 0; i < lines.length; i++){

        const line =
            lines[i];


        if(
            !line.startsWith(
                "#EXT-X-STREAM-INF:"
            )
        ){

            continue;

        }


        const bandwidthMatch =
            line.match(
                /BANDWIDTH=(\d+)/i
            );


        const resolutionMatch =
            line.match(
                /RESOLUTION=(\d+)x(\d+)/i
            );


        let url = null;


        for(
            let j = i + 1;
            j < lines.length;
            j++
        ){

            if(
                lines[j].startsWith("#")
            ){

                continue;

            }


            try{

                url =
                    new URL(
                        lines[j],
                        baseUrl
                    ).href;

            }catch(error){

                url = null;

            }


            break;

        }


        if(!url){

            continue;

        }


        let quality = null;


        if(resolutionMatch){

            quality =
                Number(
                    resolutionMatch[2]
                );

        }


        // Some manifests may not expose
        // resolution. Try URL as fallback.

        if(!quality){

            quality =
                getQualityFromUrl(
                    url
                );

        }


        variants.push({

            quality,

            bandwidth:
                bandwidthMatch
                    ?
                    Number(
                        bandwidthMatch[1]
                    )
                    :
                    null,

            url

        });

    }


    return variants;

}


// ============================================================
// SORT VARIANTS
// ============================================================

function sortVariants(variants){

    return [...variants].sort(
        (a,b) => {

            const aq =
                Number.isFinite(
                    a.quality
                )
                ?
                a.quality
                :
                0;


            const bq =
                Number.isFinite(
                    b.quality
                )
                ?
                b.quality
                :
                0;


            return bq - aq;

        }
    );

}


// ============================================================
// RESOLVE AND VERIFY M3U8
// ============================================================

async function resolveAndVerifyM3U8(
    page,
    url
){

    console.log("");
    console.log(
        "ANALYZING M3U8:"
    );

    console.log(url);


    const fetched =
        await fetchM3U8(
            page,
            url
        );


    if(!fetched.ok){

        console.log(
            "MASTER FETCH FAILED"
        );

        return null;

    }


    const text =
        fetched.text;


    // ========================================================
    // MASTER
    // ========================================================

    if(
        text.includes(
            "#EXT-X-STREAM-INF"
        )
    ){

        console.log(
            "MASTER PLAYLIST DETECTED"
        );


        const variants =
            parseMasterPlaylist(
                text,
                url
            );


        console.log(
            "MASTER VARIANTS:"
        );


        console.log(
            JSON.stringify(
                variants,
                null,
                2
            )
        );


        const ordered =
            sortVariants(
                variants
            );


        // ----------------------------------------------------
        // Preferred qualities first.
        // ----------------------------------------------------

        const priority = [];


        for(
            const preferred
            of PREFERRED_QUALITIES
        ){

            const matches =
                ordered.filter(
                    variant =>
                        variant.quality ===
                        preferred
                );


            priority.push(
                ...matches
            );

        }


        // ----------------------------------------------------
        // Then any other qualities.
        // ----------------------------------------------------

        for(
            const variant
            of ordered
        ){

            if(
                !priority.some(
                    item =>
                        item.url ===
                        variant.url
                )
            ){

                priority.push(
                    variant
                );

            }

        }


        // ----------------------------------------------------
        // TEST EVERY VARIANT.
        // ----------------------------------------------------

        for(
            const variant
            of priority
        ){

            const tested =
                await testStream(
                    page,
                    variant.url,
                    variant.quality
                );


            if(
                tested.ok
            ){

                console.log("");
                console.log(
                    "VERIFIED MASTER VARIANT:"
                );

                console.log(
                    JSON.stringify(
                        tested,
                        null,
                        2
                    )
                );


                return {

                    url:
                        tested.url,

                    quality:
                        tested.quality,

                    type:
                        "master-verified"

                };

            }

        }


        console.log(
            "NO MASTER VARIANT PASSED TEST"
        );


        return null;

    }


    // ========================================================
    // DIRECT H264
    // ========================================================

    if(
        isH264M3U8(url)
    ){

        const quality =
            getQualityFromUrl(
                url
            );


        const tested =
            await testStream(
                page,
                url,
                quality
            );


        if(
            tested.ok
        ){

            return {

                url:
                    tested.url,

                quality:
                    tested.quality,

                type:
                    "direct-h264-verified"

            };

        }

    }


    return null;

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


    const requestHandler =
        request => {

            const url =
                normalizeUrl(
                    request.url()
                );


            if(!isM3U8(url)){

                return;

            }


            const quality =
                getQualityFromUrl(
                    url
                );


            console.log("");
            console.log(
                "M3U8 REQUESTED"
            );

            console.log(url);


            if(quality){

                console.log(
                    `H264 ${quality} REQUESTED`
                );

            }


            captured.set(
                url,
                {

                    url,

                    quality,

                    time:
                        Date.now()

                }
            );

        };


    page.on(
        "request",
        requestHandler
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


        await sleep(
            PLAY_WAIT
        );


        // =====================================================
        // PLAY
        // =====================================================

        console.log("");
        console.log(
            "STARTING PLAYBACK..."
        );


        const clicked =
            await clickPlay(page);


        if(!clicked){

            console.log(
                "COULD NOT CLICK PLAY"
            );

        }


        // =====================================================
        // WAIT FOR MORE REQUESTS
        // =====================================================

        await sleep(
            3000
        );


        console.log("");
        console.log(
            "WAITING FOR M3U8 / QUALITY..."
        );


        await sleep(
            QUALITY_WAIT
        );


        // =====================================================
        // SNAPSHOT
        // =====================================================

        const requests =
            [...captured.values()];


        console.log("");
        console.log(
            "ALL M3U8 REQUESTS:"
        );


        console.log(
            JSON.stringify(
                requests,
                null,
                2
            )
        );


        // =====================================================
        // ANALYZE ALL M3U8
        // =====================================================

        const candidates = [];


        for(
            const request
            of requests
        ){

            if(
                !isM3U8(
                    request.url
                )
            ){

                continue;

            }


            const resolved =
                await resolveAndVerifyM3U8(
                    page,
                    request.url
                );


            if(
                resolved &&
                resolved.url
            ){

                candidates.push({

                    source:
                        request.url,

                    url:
                        resolved.url,

                    quality:
                        resolved.quality,

                    type:
                        resolved.type

                });

            }

        }


        // =====================================================
        // DIRECT H264 REQUESTS
        // =====================================================

        for(
            const request
            of requests
        ){

            if(
                !isH264M3U8(
                    request.url
                )
            ){

                continue;

            }


            const quality =
                request.quality;


            if(!quality){

                continue;

            }


            const alreadyTested =
                candidates.some(
                    candidate =>
                        candidate.url ===
                        request.url
                );


            if(
                alreadyTested
            ){

                continue;

            }


            const tested =
                await testStream(
                    page,
                    request.url,
                    quality
                );


            if(
                tested.ok
            ){

                candidates.push({

                    source:
                        request.url,

                    url:
                        request.url,

                    quality,

                    type:
                        "direct-h264-verified"

                });

            }

        }


        // =====================================================
        // REMOVE DUPLICATES
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


        // =====================================================
        // SORT
        // =====================================================

        finalCandidates.sort(
            (a,b) => {

                const aq =
                    Number.isFinite(
                        a.quality
                    )
                    ?
                    a.quality
                    :
                    0;


                const bq =
                    Number.isFinite(
                        b.quality
                    )
                    ?
                    b.quality
                    :
                    0;


                return bq - aq;

            }
        );


        console.log("");
        console.log(
            "AVAILABLE VERIFIED CANDIDATES:"
        );


        console.log(
            JSON.stringify(
                finalCandidates,
                null,
                2
            )
        );


        // =====================================================
        // PREFERRED QUALITY
        // =====================================================

        let selected = null;


        for(
            const preferred
            of PREFERRED_QUALITIES
        ){

            selected =
                finalCandidates.find(
                    candidate =>
                        candidate.quality ===
                        preferred
                );


            if(selected){

                break;

            }

        }


        if(!selected){

            selected =
                finalCandidates[0] ||
                null;

        }


        if(!selected){

            console.log("");
            console.log(
                "NO VERIFIED STREAM FOUND"
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
            "SELECTED:",
            selected.quality
                ?
                `H264 ${selected.quality}`
                :
                "UNKNOWN"
        );

        console.log(
            "FINAL VERIFIED STREAM:"
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
                selected.quality

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
        "Mode: M3U8 + REAL STREAM VERIFICATION"
    );

    console.log(
        "Priority: 480 > 360 > 240"
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
                            fresh.quality,

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
