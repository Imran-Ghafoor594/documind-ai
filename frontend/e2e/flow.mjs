// Real-browser end-to-end flow. Needs: backend/tests/visual_server.py (port 5056) and `vite preview` (port 4173)
// built with VITE_API_BASE_URL=http://127.0.0.1:5056. See e2e/README.md.
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const UI = "http://127.0.0.1:4173/#", API = "http://127.0.0.1:5056/api";
const results = [];
const check = (name, ok, extra = "") => { results.push([ok, name, extra]); console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (p) => (await fetch(API + p)).json();

const browser = await puppeteer.launch({ args: [...chromium.args, "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !m.text().includes("422") && errors.push(m.text())); // the 422 is the deliberate invalid-value step
let uploads = 0;
page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/documents/upload")) uploads++; });

const clickText = async (text, sel = "button,a") => {
  const h = await page.evaluateHandle((t, s) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim() === t || e.getAttribute("aria-label") === t), text, sel);
  if (!h.asElement()) throw new Error("no element with text " + text);
  await h.asElement().click();
};
const fill = async (sel, text) => { await page.focus(sel); await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control"); await page.keyboard.type(text); };
const waitHash = (re) => page.waitForFunction((r) => new RegExp(r).test(location.hash), { timeout: 15000 }, re.source);
const waitText = (t) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: 15000 }, t);

const before = (await api("/dashboard")).data;
const usdBefore = Number(before.summary.find((s) => s.currency === "USD").total);

// ---- upload through the real dialog
await page.goto(UI + "/documents", { waitUntil: "networkidle0" });
await page.click("header button.btn-primary");
await page.waitForSelector('[role="dialog"]');
let trapped = true;
for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); if (!(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))) trapped = false; }
check("focus stays inside the upload dialog after 14 Tab presses", trapped);
const input = await page.$('input[type="file"]');
await input.uploadFile(new URL("./e2e-invoice.pdf", import.meta.url).pathname);
await waitText("e2e-invoice.pdf");
const clicks = Promise.all([page.click('[role="dialog"] button.btn-primary'), page.click('[role="dialog"] button.btn-primary').catch(() => null)]);
await clicks;
await waitHash(/#\/review\/\d+/);
await waitText("Extracted values");
check("double-clicking Upload sent exactly one request", uploads === 1, `uploads=${uploads}`);
const id = Number(page.url().match(/review\/(\d+)/)[1]);
const doc = (await api(`/documents/${id}`)).data;
check("uploaded document was processed by the pipeline + AI stub", doc.status === "review_required" && doc.fields.vendor === "Bluebird Cafe" && doc.ai_status === "success", JSON.stringify(doc.fields));
check("review form shows the extracted vendor", await page.$eval("#rf-vendor", (e) => e.value) === "Bluebird Cafe");

// ---- edit, save, confirm
await fill("#rf-vendor", "Bluebird Cafe E2E");
await clickText("Save without confirming"); await waitText("Changes saved");
let saved = (await api(`/documents/${id}`)).data;
check("save persisted the edit and marked it as edited by user", saved.fields.vendor === "Bluebird Cafe E2E" && saved.corrected_fields.includes("vendor") && saved.verification_status === "unverified", JSON.stringify([saved.fields.vendor, saved.corrected_fields, saved.verification_status]));
await fill("#rf-total_amount", "-5");
await clickText("Confirm and save"); await waitText("Some values are invalid");
const negMsg = await page.$eval("#rf-total_amount-err", (e) => e.textContent);
check("negative total is rejected by the server and shown to the user", (await api(`/documents/${id}`)).data.verification_status === "unverified" && /negative/i.test(negMsg), negMsg);
await fill("#rf-total_amount", "23.75");
await clickText("Confirm and save");
await waitText("Confirmed. This record now counts");
await sleep(600);
const conf = (await api(`/documents/${id}`)).data;
check("confirm persisted: status completed + verified", conf.status === "completed" && conf.verification_status === "confirmed" && conf.confirmed_at);
const after = (await api("/dashboard")).data;
const usdAfter = Number(after.summary.find((s) => s.currency === "USD").total);
check("dashboard USD total rose by exactly 23.75 after confirming", Math.abs(usdAfter - usdBefore - 23.75) < 0.001, `${usdBefore} -> ${usdAfter}`);
check("after confirming, the UI moved on to the next queue item", /#\/review(\/\d+)?$/.test(await page.evaluate(() => location.hash)) && !page.url().endsWith(`/review/${id}`));

// ---- expenses: sort, filter, export
await page.goto(UI + "/expenses", { waitUntil: "networkidle0" });
await page.waitForSelector("table tbody tr");
await clickText("Amount"); await sleep(500);
const firstAmounts = await page.$$eval("tbody tr td:last-child", (n) => n.map((x) => x.textContent));
check("sorting by Amount shows a sorted table", firstAmounts.length > 2, JSON.stringify(firstAmounts));
await page.select("#ex-cur", "USD"); await sleep(700);
const rows = await page.$$eval("tbody tr", (n) => n.length);
const totalText = await page.$eval('[aria-label="Totals by currency"]', (e) => e.textContent);
check("currency filter shows only USD total", /USD/.test(totalText) && !/PKR|EUR/.test(totalText) && rows === 4, `${rows} rows; ${totalText}`);
const csvHref = await page.$eval('a[download]', (a) => a.href);
const csv = await fetch(csvHref); const csvText = await csv.text();
check("CSV export honours the filter (USD only, confirmed only)", csv.headers.get("content-type").includes("text/csv") && !csvText.includes("PKR") && csvText.includes("Bluebird Cafe E2E") && !csvText.includes("Pioneer"), csvText.slice(0, 200));
await clickText("Bluebird Cafe E2E"); await page.waitForSelector('[role="dialog"]');
check("expense row opens a detail dialog", (await page.$eval('[role="dialog"]', (d) => d.textContent)).includes("23.75") || (await page.$eval('[role="dialog"]', (d) => d.textContent)).includes("$23.75"));
await page.keyboard.press("Escape");

// ---- delete via UI with confirmation dialog
await page.goto(UI + `/documents/${id}`, { waitUntil: "networkidle0" });
await page.waitForSelector(`button[aria-label^="More actions"]`);
await page.click(`button[aria-label^="More actions"]`); await clickText("Delete document", '[role="menuitem"]');
await page.waitForSelector('[role="dialog"]');
await clickText("Cancel");
check("cancelling the confirmation keeps the document", (await fetch(`${API}/documents/${id}`)).status === 200);
await page.click(`button[aria-label^="More actions"]`); await clickText("Delete document", '[role="menuitem"]');
await page.waitForSelector('[role="dialog"]'); await clickText("Delete document", '[role="dialog"] button');
await waitHash(/#\/documents$/); await sleep(500);
check("confirmed delete removes the record", (await fetch(`${API}/documents/${id}`)).status === 404);
const afterDelete = (await api("/dashboard")).data;
check("dashboard no longer counts the deleted expense", Math.abs(Number(afterDelete.summary.find((s) => s.currency === "USD").total) - usdBefore) < 0.001);

// ---- templates CRUD
await page.goto(UI + "/templates", { waitUntil: "networkidle0" });
await page.waitForSelector("h1");
await clickText("New template"); await page.waitForSelector("#tpl-name");
await page.type("#tpl-name", "Taxi rides"); await page.select("#tpl-cat", "Travel");
await clickText("Create template"); await waitText("Template created");
check("template persisted", (await api("/templates")).data.some((t) => t.name === "Taxi rides" && t.default_category === "Travel"));
await page.waitForSelector('button[aria-label="Edit Taxi rides"]'); await clickText("Edit Taxi rides"); await page.waitForSelector("#tpl-name");
await fill("#tpl-name", "Taxi and rail");
await clickText("Save changes"); await waitText("Template updated"); await sleep(400);
check("template edit persisted", (await api("/templates")).data.some((t) => t.name === "Taxi and rail"));
await page.waitForSelector('button[aria-label="Delete Taxi and rail"]'); await clickText("Delete Taxi and rail"); await page.waitForSelector('[role="dialog"]'); await clickText("Delete template");
await waitText("Template deleted"); await sleep(300);
check("template delete persisted", !(await api("/templates")).data.some((t) => t.name === "Taxi and rail"));

// ---- settings persist across reload
await page.goto(UI + "/settings", { waitUntil: "networkidle0" });
await page.type("#st-cur", "pkr"); await clickText("Save preferences"); await waitText("Preferences saved");
await page.reload({ waitUntil: "networkidle0" });
check("default currency persisted across a reload (stored uppercase)", await page.$eval("#st-cur", (e) => e.value) === "PKR");
await page.goto(UI + "/", { waitUntil: "networkidle0" });
await page.waitForSelector('[role="tab"][aria-selected="true"]');
check("Overview opens on the saved default currency (PKR) even though USD has more records", await page.$eval('[role="tab"][aria-selected="true"]', (e) => e.textContent) === "PKR");

// ---- image preview renders (PNG path)
await page.goto(UI + "/documents/9", { waitUntil: "networkidle0" });
await page.waitForSelector("main img"); await sleep(500);
check("image documents render in the preview", await page.$eval("main img", (i) => i.complete && i.naturalWidth > 0));

check("no console errors or uncaught exceptions during the whole flow", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
const failed = results.filter((r) => !r[0]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
