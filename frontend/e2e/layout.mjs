// Layout sweep: 13 routes x 4 viewport widths; reports console errors, failed requests, horizontal overflow,
// clipped dialogs, drawer focus/Escape behaviour. See e2e/README.md.
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import fs from "node:fs";

const BASE = "http://127.0.0.1:4173/#";
const OUT = process.env.SHOTS_DIR ?? new URL("./shots", import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const VIEWPORTS = { desktop: [1440, 900], laptop: [1024, 768], tablet: [768, 1024], mobile: [390, 844] };
const ROUTES = ["/", "/documents", "/documents/1", "/documents/8", "/extraction/1", "/review/6", "/review/7", "/review/10", "/expenses", "/reports", "/templates", "/settings", "/help"];

const browser = await puppeteer.launch({ args: [...chromium.args, "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
const problems = [];
const log = (...a) => console.log(...a);

for (const [vp, [w, h]] of Object.entries(VIEWPORTS)) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  let current = "";
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`[${vp} ${current}] console.${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => problems.push(`[${vp} ${current}] PAGEERROR: ${String(e).slice(0, 200)}`));
  page.on("requestfailed", (r) => r.url().includes("/file") || problems.push(`[${vp} ${current}] request failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("/documents/10")) problems.push(`[${vp} ${current}] HTTP ${r.status()} ${r.url()}`); });

  for (const route of ROUTES) {
    current = route;
    await page.goto(BASE + route, { waitUntil: "networkidle0", timeout: 30000 });
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    const over = await page.evaluate(() => {
      const de = document.documentElement; const cw = de.clientWidth;
      const bad = [...document.body.querySelectorAll("*")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > cw + 1 && !el.closest("[data-allow-overflow]") && getComputedStyle(el).position !== "fixed"; });
      // ignore elements inside a scroll container (overflow-x:auto) - they scroll inside, the page doesn't
      const real = bad.filter((el) => { let p = el.parentElement; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return false; p = p.parentElement; } return true; });
      return { page: de.scrollWidth - cw, offenders: real.slice(0, 4).map((e) => e.tagName + "." + String(e.className).slice(0, 60)) };
    });
    if (over.page > 1 || over.offenders.length) problems.push(`[${vp} ${route}] HORIZONTAL OVERFLOW page=${over.page}px offenders=${JSON.stringify(over.offenders)}`);
    await page.screenshot({ path: `${OUT}/${vp}${route.replace(/\//g, "_") || "_root"}.png` });
  }

  current = "interactions";
  if (vp === "mobile" || vp === "tablet") {
    await page.goto(BASE + "/", { waitUntil: "networkidle0" });
    await page.click('button[aria-label="Open navigation menu"]'); await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: `${OUT}/${vp}_drawer.png` });
    const focusInDrawer = await page.evaluate(() => !!document.activeElement?.closest('[aria-label="Navigation menu"]'));
    if (!focusInDrawer) problems.push(`[${vp}] focus not moved into the open drawer`);
    await page.keyboard.press("Escape"); await new Promise((r) => setTimeout(r, 200));
    if (await page.$('[aria-label="Navigation menu"]')) problems.push(`[${vp}] Escape did not close drawer`);
  }
  await page.goto(BASE + "/documents", { waitUntil: "networkidle0" });
  await page.click("header button.btn-primary"); await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${OUT}/${vp}_upload_dialog.png` });
  const dlg = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); if (!d) return null; const r = d.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right, left: r.left, vw: innerWidth, vh: innerHeight }; });
  if (!dlg) problems.push(`[${vp}] upload dialog did not open`);
  else if (dlg.left < -1 || dlg.right > dlg.vw + 1 || dlg.top < -1 || dlg.bottom > dlg.vh + 1) problems.push(`[${vp}] upload dialog clipped ${JSON.stringify(dlg)}`);
  await page.keyboard.press("Escape"); await new Promise((r) => setTimeout(r, 200));
  if (await page.$('[role="dialog"]')) problems.push(`[${vp}] Escape did not close upload dialog`);

  if (vp === "desktop") {
    await page.goto(BASE + "/", { waitUntil: "networkidle0" });
    await page.type('input[role="combobox"]', "north"); await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: `${OUT}/desktop_search.png` });
    const opts = await page.$$eval('[role="option"]', (n) => n.map((x) => x.textContent?.slice(0, 40)));
    log("search results for 'north':", opts);
    if (opts.length !== 1) problems.push(`[desktop] global search expected 1 result for 'north', got ${opts.length}`);
    await page.goto(BASE + "/documents", { waitUntil: "networkidle0" });
  }
  await page.close();
}
await browser.close();
log(`\nPROBLEMS (${problems.length}):`); problems.forEach((p) => log(" -", p));
