// Regenerates docs/screenshots from the synthetic visual_server data.
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import fs from "node:fs";
const BASE = "http://127.0.0.1:4173/#", OUT = new URL("../../docs/screenshots", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ args: [...chromium.args, "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
const shoot = async (name, route, w, h, full = false) => {
  const page = await browser.newPage(); await page.setViewport({ width: w, height: h });
  await page.goto(BASE + route, { waitUntil: "networkidle0" }); await page.reload({ waitUntil: "networkidle0" }); await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); await page.close();
};
await shoot("overview", "/", 1440, 1000, true);
await shoot("documents-workspace", "/documents/9", 1440, 900);
await shoot("review-queue", "/review/9", 1440, 900);
await shoot("ai-extraction", "/extraction/9", 1440, 1100, true);
await shoot("expenses", "/expenses", 1440, 800);
await shoot("reports", "/reports", 1440, 1100, true);
await shoot("mobile-documents", "/documents/9", 390, 844);
await shoot("mobile-review", "/review/6", 390, 844);
await browser.close();
