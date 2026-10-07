const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch({
        headless: true
    });

    const page = await browser.newPage();

    const streams = new Set();

    page.on("request", request => {
        const url = request.url();

        if (
            /\.m3u8(?:[?#]|$)/i.test(url) &&
            /live-aac-64\.m3u8/i.test(url)
        ) {
            streams.add(url);
        }
    });

    console.log("Opening Maspero...");

    await page.goto(
        "https://www.maspero.eg/stream/8",
        {
            waitUntil: "domcontentloaded",
            timeout: 60000
        }
    );

    console.log("Page loaded.");

    await page.waitForTimeout(20000);

    const results = [...streams];

    console.log(`AAC STREAMS FOUND: ${results.length}`);

    if (results.length === 0) {
        console.log("NO AAC M3U8 FOUND");
    } else {

        // آخر رابط ملتقط
        const stream = results[results.length - 1];

        console.log("");
        console.log("======================================");
        console.log("FINAL M3U8 STREAM:");
        console.log(stream);
        console.log("======================================");
        console.log("");
    }

    await browser.close();

})();
