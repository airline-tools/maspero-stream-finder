const { chromium } = require("playwright");
const fs = require("fs");

const OUTPUT_FILE = "maspero-streams.json";
const DEBUG_DIR = "debug";
const MAX_WAIT_MS = 45000;      // أقصى وقت لكل محطة
const EXTRA_AFTER_FOUND_MS = 6000; // بعد ما نلاقي 64 نستنى شوية لو 128 ظهر

const STATIONS = [
    { name: "راديو مصر", frequency: "88.7 FM", url: "https://www.maspero.eg/stream/8" },
    { name: "صوت العرب", frequency: "612 AM", url: "https://www.maspero.eg/stream/9" },
    { name: "إذاعة البرنامج العام", frequency: "107.4 FM", url: "https://www.maspero.eg/stream/10" },
    { name: "الشباب والرياضة", frequency: "108 FM", url: "https://www.maspero.eg/stream/11" },
    { name: "البرنامج الثقافي ودراما FM", frequency: "91.5 FM", url: "https://www.maspero.eg/stream/12" },
    { name: "الأغاني", frequency: "105.8 FM", url: "https://www.maspero.eg/stream/13" },
    { name: "إذاعة القاهرة الكبرى", frequency: "102.2 FM", url: "https://www.maspero.eg/stream/14" },
    { name: "الشرق الأوسط", frequency: "89.5 FM", url: "https://www.maspero.eg/stream/16" },
    { name: "البرنامج الأوروبي", frequency: "95.4 FM", url: "https://www.maspero.eg/stream/18" }
];

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getQuality(url) {
    if (/aac-?128[^/?#]*\.m3u8(?:$|[?#])/i.test(url)) return "AAC-128";
    if (/aac-?64[^/?#]*\.m3u8(?:$|[?#])/i.test(url)) return "AAC-64";
    return null;
}

// يدور على لينكات AAC جوه أي نص (HTML / JS / JSON / playlist)
function extractFromText(text, baseUrl) {
    const found = [];
    const clean = text.replace(/\\\//g, "/");

    // لينكات كاملة
    const abs = clean.match(/https?:\/\/[^\s"'<>\\)]+?\.m3u8[^\s"'<>\\)]*/gi) || [];
    for (const u of abs) if (getQuality(u)) found.push(u);

    // لينكات نسبية جوه master playlist
    if (baseUrl && /\.m3u8/i.test(baseUrl)) {
        const lines = clean.split(/\r?\n/).map(l => l.trim());
        for (const l of lines) {
            if (l && !l.startsWith("#") && getQuality(l)) {
                try { found.push(new URL(l, baseUrl).href); } catch {}
            }
        }
    }
    return found;
}

async function tryPlay(page) {
    for (const frame of page.frames()) {
        try {
            await frame.evaluate(() => {
                document.querySelectorAll("audio,video").forEach(m => {
                    m.muted = true;
                    m.play().catch(() => {});
                });
            });
        } catch {}

        const selectors = [
            'button[aria-label*="play" i]',
            'button[title*="play" i]',
            '[class*="play" i]:not([class*="display" i])',
            '[id*="play" i]',
            '.vjs-big-play-button',
            '.jw-icon-display',
            'button'
        ];
        for (const sel of selectors) {
            try {
                const el = frame.locator(sel).first();
                if (await el.count()) {
                    await el.click({ timeout: 1500, force: true });
                    break;
                }
            } catch {}
        }
    }
}

async function main() {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });

    const browser = await chromium.launch({
        headless: true,
        args: [
            "--autoplay-policy=no-user-gesture-required",
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox"
        ]
    });

    try {
        const context = await browser.newContext({
            userAgent: UA,
            locale: "ar-EG",
            timezoneId: "Africa/Cairo",
            viewport: { width: 1366, height: 768 },
            extraHTTPHeaders: { "Accept-Language": "ar-EG,ar;q=0.9,en;q=0.8" }
        });

        await context.addInitScript(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        });

        const results = [];

        for (let i = 0; i < STATIONS.length; i++) {
            const station = STATIONS[i];
            console.log("\n==============================");
            console.log("SEARCHING:", station.name, "|", station.url);
            console.log("==============================");

            const page = await context.newPage();

            let aac128 = null;
            let aac64 = null;
            let firstFoundAt = null;
            const seen = new Set();
            const debugMedia = []; // أي m3u8 / ملفات صوت شفناها (للتشخيص)
            const startTime = Date.now();

            const register = (url, source) => {
                const quality = getQuality(url);
                if (!quality || seen.has(url)) return;
                seen.add(url);
                console.log(`[${((Date.now() - startTime) / 1000).toFixed(1)}s] ${quality} ${source}: ${url}`);
                if (quality === "AAC-128") aac128 = url;
                if (quality === "AAC-64") aac64 = url;
                if (!firstFoundAt) firstFoundAt = Date.now();
            };

            const onRequest = req => {
                const u = req.url();
                if (/\.m3u8|\.aac|\.ts(\?|$)|\.mp3/i.test(u)) debugMedia.push(`REQ ${u}`);
                register(u, "REQUEST");
            };

            const onResponse = async res => {
                const u = res.url();
                register(u, "RESPONSE");
                try {
                    const type = (res.headers()["content-type"] || "").toLowerCase();
                    const readable =
                        /\.m3u8/i.test(u) ||
                        /json|javascript|text\/html|mpegurl|text\/plain/.test(type);
                    if (!readable) return;
                    const body = await res.text();
                    if (body.length > 3_000_000) return;
                    for (const link of extractFromText(body, u)) register(link, "BODY");
                } catch {}
            };

            context.on("request", onRequest);
            context.on("response", onResponse);

            try {
                const resp = await page.goto(station.url, {
                    waitUntil: "domcontentloaded",
                    timeout: 60000
                });
                console.log("PAGE STATUS:", resp ? resp.status() : "no response");

                // ندور كمان في HTML الصفحة نفسها
                try {
                    const html = await page.content();
                    for (const link of extractFromText(html, null)) register(link, "HTML");
                } catch {}

                while (Date.now() - startTime < MAX_WAIT_MS) {
                    if (aac128) break;
                    if (aac64 && Date.now() - firstFoundAt > EXTRA_AFTER_FOUND_MS) break;

                    await tryPlay(page);
                    await sleep(3000);
                }
            } catch (error) {
                console.log("PAGE ERROR:", error.message);
            } finally {
                context.off("request", onRequest);
                context.off("response", onResponse);
            }

            const selectedUrl = aac128 || aac64;

            if (selectedUrl) {
                const quality = aac128 ? "AAC-128" : "AAC-64";
                console.log("SELECTED:", quality);
                results.push({
                    name: station.name,
                    frequency: station.frequency,
                    source: station.url,
                    url: selectedUrl,
                    quality
                });
            } else {
                console.log("NO AAC LINK FOUND");
                // تشخيص: صورة + عنوان + كل ميديا اتشافت
                try {
                    console.log("TITLE:", await page.title());
                    const txt = (await page.evaluate(() => document.body?.innerText || "")).slice(0, 300);
                    console.log("BODY TEXT:", txt.replace(/\s+/g, " "));
                    await page.screenshot({ path: `${DEBUG_DIR}/station-${i}.png`, fullPage: true });
                } catch {}
                console.log("MEDIA SEEN:", debugMedia.slice(0, 15));
            }

            await page.close().catch(() => {});
        }

        // ===== الدمج مع الملف القديم (زي ما هو) =====
        let previousResults = [];

        if (fs.existsSync(OUTPUT_FILE)) {
            try {
                const oldData = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
                if (!Array.isArray(oldData)) throw new Error("JSON is not an array");
                previousResults = oldData;
            } catch (error) {
                console.error("ERROR READING JSON:", error.message);
                console.error("UPDATE CANCELLED TO PROTECT OLD FILE.");
                process.exitCode = 1;
                return;
            }
        }

        const previousBySource = new Map(previousResults.map(x => [x.source, x]));
        const newBySource = new Map(results.map(x => [x.source, x]));

        let updated = 0, preserved = 0, unchanged = 0, added = 0;

        const mergedResults = STATIONS.map(station => {
            const oldStation = previousBySource.get(station.url);
            const newStation = newBySource.get(station.url);

            if (!newStation) {
                if (oldStation) {
                    preserved++;
                    console.log("PRESERVED OLD LINK:", station.name);
                    return oldStation;
                }
                console.log("NO OLD OR NEW LINK:", station.name);
                return null;
            }

            if (oldStation) {
                if (oldStation.url === newStation.url) {
                    unchanged++;
                    console.log("UNCHANGED:", station.name);
                    return oldStation;
                }
                updated++;
                console.log("UPDATED:", station.name);
                return newStation;
            }

            added++;
            console.log("NEW LINK:", station.name);
            return newStation;
        }).filter(Boolean);

        const knownSources = new Set(STATIONS.map(s => s.url));
        for (const oldStation of previousResults) {
            if (!knownSources.has(oldStation.source)) {
                mergedResults.push(oldStation);
                console.log("PRESERVED UNLISTED:", oldStation.name);
            }
        }

        const oldJson = JSON.stringify(previousResults, null, 2);
        const newJson = JSON.stringify(mergedResults, null, 2);

        if (oldJson !== newJson) {
            fs.writeFileSync(OUTPUT_FILE, newJson, "utf8");
            console.log("JSON UPDATED");
        } else {
            console.log("NO CHANGES - OLD JSON PRESERVED");
        }

        console.log("\n==============================");
        console.log("FOUND THIS RUN:", results.length);
        console.log("UPDATED LINKS:", updated);
        console.log("NEW LINKS:", added);
        console.log("UNCHANGED LINKS:", unchanged);
        console.log("PRESERVED OLD LINKS:", preserved);
        console.log("TOTAL SAVED:", mergedResults.length);
        console.log("==============================");
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error("ERROR:", error);
    process.exitCode = 1;
});
