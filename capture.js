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

async function main() {

    const browser = await chromium.launch({
        headless: true
    });

    const page = await browser.newPage();

    let results = [];

    for (const station of STATIONS) {

        console.log("");
        console.log("SEARCHING:", station.name);

        let foundUrl = null;

        const handler = request => {

            const url = request.url();

            if (
                /live-aac-128\.m3u8/i.test(url)
            ) {

                foundUrl = url;

                console.log("");
                console.log("AAC-128 FOUND:");
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

        if (foundUrl) {

            results.push({
                name: station.name,
                url: foundUrl,
                quality: "AAC-128"
            });

        } else {

            console.log(
                "AAC-128 NOT FOUND"
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
