const { chromium } = require("playwright");
const fs = require("fs");

const MASPERO_URL =
    "https://www.maspero.eg/stream/";

const OUTPUT_FILE =
    "maspero-streams.json";

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

console.log("");
console.log("Starting Maspero Stream Finder...");
console.log("Quality detection: AFTER SECOND PLAY");
console.log("Priority: 480 > 360 > 240");
console.log("");


// ============================================================
// HELPERS
// ============================================================

function sleep(ms){

    return new Promise(
        resolve => setTimeout(resolve, ms)
    );

}


function getQuality(url){

    if(!url) return null;

    const match =
        url.match(
            /live-h264-(\d+)\.m3u8/i
        );

    if(!match) return null;

    return Number(match[1]);

}


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

async function clickRealPlayButton(page){

    const frame =
        getDailymotionFrame(page);

    if(!frame){

        console.log(
            "PLAY: DAILYMOTION FRAME NOT FOUND"
        );

        return false;

    }


    const selectors = [

        'button[aria-label*="Play" i]',
        'button[title*="Play" i]',

        '[aria-label*="Play video" i]',
        '[title*="Play video" i]',

        'button[aria-label*="تشغيل" i]',
        'button[title*="تشغيل" i]',

        '.dmp_PlaybackControlsButton[aria-label*="Play" i]'

    ];


    for(const selector of selectors){

        try{

            const button =
                frame.locator(selector).first();

            if(
                await button.count() &&
                await button.isVisible().catch(()=>false)
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

            // Try next selector.

        }

    }


    // Fallback: click video itself.

    try{

        const video =
            frame.locator("video").first();

        if(await video.count()){

            await video.click({
                position:{
                    x:200,
                    y:100
                },
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
// STOP
// ============================================================

async function stopPlayer(page){

    console.log("");
    console.log("STOP...");


    const frame =
        getDailymotionFrame(page);

    if(!frame){

        console.log(
            "STOP: DAILYMOTION FRAME NOT FOUND"
        );

        return false;

    }


    const pauseSelectors = [

        'button[aria-label*="Pause" i]',
        'button[title*="Pause" i]',

        '[aria-label*="Pause video" i]',
        '[title*="Pause video" i]',

        'button[aria-label*="إيقاف" i]',
        'button[aria-label*="إيقاف مؤقت" i]',
        'button[title*="إيقاف" i]',

        '.dmp_PlaybackControlsButton[aria-label*="Pause" i]'

    ];


    for(const selector of pauseSelectors){

        try{

            const button =
                frame.locator(selector).first();

            if(
                await button.count() &&
                await button.isVisible().catch(()=>false)
            ){

                await button.click({
                    force:true
                });

                console.log(
                    "STOP CLICKED:",
                    selector
                );

                await sleep(1500);

                return true;

            }

        }catch(error){

            // Try next selector.

        }

    }


    // ========================================================
    // FALLBACK
    // ========================================================

    console.log(
        "STOP BUTTON NOT FOUND - TRYING MEDIA PAUSE"
    );


    try{

        const paused =
            await frame
                .locator("video, audio")
                .evaluateAll(
                    elements => {

                        let changed = false;

                        elements.forEach(
                            media => {

                                if(!media.paused){

                                    media.pause();

                                    changed = true;

                                }

                            }
                        );

                        return changed;

                    }
                );


        console.log(
            "MEDIA PAUSE RESULT:",
            paused
        );


        await sleep(1500);

        return paused;

    }catch(error){

        console.log(
            "MEDIA PAUSE ERROR:",
            error.message ||
            String(error)
        );

        return false;

    }

}


// ============================================================
// VERIFY PLAYBACK
// ============================================================

async function verifyPlayback(page){

    const frame =
        getDailymotionFrame(page);

    if(!frame){

        console.log(
            "PLAYBACK NOT CONFIRMED: FRAME NOT FOUND"
        );

        return false;

    }


    for(let i = 0; i < 12; i++){

        try{

            const state =
                await frame
                    .locator("video, audio")
                    .evaluateAll(
                        elements => {

                            return elements.map(
                                media => ({
                                    paused:
                                        media.paused,

                                    readyState:
                                        media.readyState,

                                    currentTime:
                                        media.currentTime,

                                    duration:
                                        media.duration
                                })
                            );

                        }
                    );


            const playing =
                state.some(
                    media =>
                        !media.paused &&
                        media.readyState >= 2 &&
                        media.currentTime > 0
                );


            if(playing){

                console.log(
                    "PLAYBACK CONFIRMED"
                );

                return true;

            }

        }catch(error){

            // Continue checking.

        }


        await sleep(1000);

    }


    console.log(
        "PLAYBACK NOT CONFIRMED"
    );

    return false;

}


// ============================================================
// DIAGNOSTIC: DAILYMOTION BUTTONS
// ============================================================

async function logDailymotionButtons(page){

    const frame =
        getDailymotionFrame(page);

    if(!frame){

        console.log(
            "DAILYMOTION BUTTONS: FRAME NOT FOUND"
        );

        return;

    }


    try{

        const buttons =
            await frame
                .locator("button")
                .evaluateAll(
                    elements =>
                        elements.map(
                            (element,index) => ({
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
                                        ?
                                        element.className
                                        :
                                        ""
                            })
                        )
                );


        console.log("");
        console.log(
            "DAILYMOTION BUTTONS AFTER PLAY:"
        );

        console.log(
            JSON.stringify(
                buttons,
                null,
                2
            )
        );

        console.log("");

    }catch(error){

        console.log(
            "BUTTON DIAGNOSTIC ERROR:",
            error.message ||
            String(error)
        );

    }

}


// ============================================================
// MAIN
// ============================================================

async function main(){

    const browser =
        await chromium.launch({
            headless:true
        });


    const page =
        await browser.newPage();


    const results = [];


    for(const station of STATIONS){

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


        const streams = [];


        // ====================================================
        // CAPTURE REQUESTS
        // ====================================================

        const requestHandler =
            request => {

                const url =
                    request.url();


                if(
                    !/live-h264-\d+\.m3u8/i
                        .test(url)
                ){

                    return;

                }


                const quality =
                    getQuality(url);


                if(!quality){

                    return;

                }


                console.log(
                    `H264 ${quality} REQUESTED`
                );

                console.log(url);


                streams.push({

                    quality,

                    url,

                    time:Date.now()

                });

            };


        page.on(
            "request",
            requestHandler
        );


        try{

            // =================================================
            // OPEN PAGE
            // =================================================

            await page.goto(
                station.url,
                {
                    waitUntil:"domcontentloaded",
                    timeout:60000
                }
            );


            console.log(
                "PAGE LOADED"
            );


            await sleep(5000);


            // =================================================
            // FIRST PLAY
            // =================================================

            console.log("");
            console.log(
                "FIRST PLAY..."
            );


            await clickRealPlayButton(page);


            await sleep(3000);


            await verifyPlayback(page);


            // =================================================
            // DIAGNOSTIC BUTTON LIST
            // =================================================

            await logDailymotionButtons(page);


            // =================================================
            // STOP
            // =================================================

            const stopped =
                await stopPlayer(page);


            console.log(
                "STOP RESULT:",
                stopped
            );


            await sleep(2500);


            // =================================================
            // SECOND PLAY
            // =================================================

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

            console.log("");


            // Important:
            // Ignore every request captured before
            // the second Play.

            streams.length = 0;


            const secondPlayTime =
                Date.now();


            await clickRealPlayButton(page);


            const playbackConfirmed =
                await verifyPlayback(page);


            if(playbackConfirmed){

                console.log(
                    "SECOND PLAYBACK CONFIRMED"
                );

            }else{

                console.log(
                    "SECOND PLAYBACK NOT CONFIRMED"
                );

            }


            // =================================================
            // WAIT FOR QUALITY REQUESTS
            // =================================================

            console.log("");
            console.log(
                "WAITING FOR QUALITY REQUESTS..."
            );


            await sleep(12000);


            // =================================================
            // FILTER ONLY REQUESTS AFTER SECOND PLAY
            // =================================================

            const afterSecondPlay =
                streams.filter(
                    item =>
                        item.time >= secondPlayTime
                );


            console.log("");
            console.log(
                "STREAMS AFTER SECOND PLAY:"
            );


            console.log(
                JSON.stringify(
                    afterSecondPlay,
                    null,
                    2
                )
            );


            // =================================================
            // AVAILABLE QUALITIES
            // =================================================

            const qualities =
                [
                    ...new Set(
                        afterSecondPlay
                            .map(
                                item =>
                                    item.quality
                            )
                    )
                ]
                .sort(
                    (a,b) =>
                        b-a
                );


            console.log("");
            console.log(
                "AVAILABLE QUALITIES AFTER SECOND PLAY:",
                qualities
            );


            // =================================================
            // SELECT QUALITY
            // =================================================

            let selected = null;


            for(const preferred of [
                480,
                360,
                240
            ]){

                const found =
                    afterSecondPlay.find(
                        item =>
                            item.quality ===
                            preferred
                    );


                if(found){

                    selected = found;

                    break;

                }

            }


            // =================================================
            // RESULT
            // =================================================

            if(selected){

                console.log("");
                console.log(
                    "SELECTED:",
                    `H264 ${selected.quality}`
                );

                console.log(
                    "FINAL STREAM:"
                );

                console.log(
                    selected.url
                );


                results.push({

                    name:
                        station.name,

                    url:
                        selected.url,

                    quality:
                        selected.quality

                });


            }else{

                console.log("");
                console.log(
                    "NO VERIFIED H264 STREAM AFTER SECOND PLAY"
                );


                // Do NOT save an unverified stream.

                results.push({

                    name:
                        station.name,

                    url:
                        null,

                    quality:
                        null

                });

            }


        }catch(error){

            console.log("");
            console.log(
                "ERROR:",
                error.message ||
                String(error)
            );


            results.push({

                name:
                    station.name,

                url:
                    null,

                quality:
                    null

            });

        }


        page.off(
            "request",
            requestHandler
        );


        await page.goto(
            "about:blank"
        ).catch(()=>{});


        await sleep(1000);

    }


    // ========================================================
    // SAVE
    // ========================================================

    console.log("");
    console.log(
        "========================================"
    );

    console.log(
        "SAVING RESULTS"
    );

    console.log(
        "========================================"
    );

    console.log("");


    let existing = [];


    if(fs.existsSync(OUTPUT_FILE)){

        try{

            existing =
                JSON.parse(
                    fs.readFileSync(
                        OUTPUT_FILE,
                        "utf8"
                    )
                );

        }catch(error){

            existing = [];

        }

    }


    const output =
        existing.map(
            oldStation => {

                const fresh =
                    results.find(
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

                        console.log(
                            "CHANGED:",
                            fresh.name
                        );

                    }


                    return {

                        ...oldStation,

                        url:
                            fresh.url,

                        quality:
                            fresh.quality

                    };

                }


                console.log(
                    "KEEPING OLD STREAM:",
                    oldStation.name
                );


                return oldStation;

            }
        );


    // Add stations that do not already exist.

    for(const fresh of results){

        const exists =
            output.some(
                item =>
                    item.name ===
                    fresh.name
            );


        if(
            !exists &&
            fresh.url
        ){

            output.push(fresh);

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
        "DONE."
    );


    await browser.close();

}


main().catch(
    error => {

        console.error(
            error
        );

        process.exit(1);

    }
);
