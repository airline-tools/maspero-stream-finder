const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch({
        headless: true
    });

    const page = await browser.newPage();

    const streams = [];

    page.on("request", request => {
        const url = request.url();

        if (/\.m3u8(?:[?#]|$)/i.test(url)) {
            console.log("M3U8 FOUND:");
            console.log(url);
            streams.push(url);
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

    if (streams.length === 0) {
        console.log("NO M3U8 FOUND");
    } else {
        console.log(`FOUND ${streams.length} M3U8 STREAM(S)`);

        streams.forEach((url, index) => {
            console.log(`${index + 1}: ${url}`);
        });
    }

    await browser.close();
})();
