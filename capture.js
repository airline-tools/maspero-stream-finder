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


            if (/live-aac-128\.m3u8/i.test(url)) {

                aac128 = url;

                console.log("");
                console.log("AAC-128 FOUND:");
                console.log(url);

            }

            else if (/live-aac-64\.m3u8/i.test(url)) {

                aac64 = url;

                console.log("");
                console.log("AAC-64 FOUND:");
                console.log(url);

            }

        };


        page.on("request", handler);


        try {

            await page.goto(

                station.url,

                {
                    waitUntil: "domcontentloaded",
                    timeout: 60000
                }

            );


            await sleep(15000);


        } catch (error) {

            console.log(
                "PAGE ERROR:",
                error.message
            );

        }


        page.off("request", handler);


        const selectedUrl =
            aac128 || aac64;


        if (selectedUrl) {

            const quality =
                aac128
                    ? "AAC-128"
                    : "AAC-64";


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

            console.log(
                "NO AAC-128 OR AAC-64 FOUND"
            );

        }


        await page.goto(
            "about:blank"
        ).catch(() => {});

    }


    fs.writeFileSync(

        OUTPUT_FILE,

        JSON.stringify(

            results,

            null,

            2

        ),

        "utf8"

    );


    console.log("");
    console.log("==============================");
    console.log("SAVED:", OUTPUT_FILE);
    console.log("FOUND:", results.length);
    console.log("==============================");


    await browser.close();

}


main().catch(error => {

    console.error(
        "ERROR:",
        error.message
    );

    process.exit(1);

});
