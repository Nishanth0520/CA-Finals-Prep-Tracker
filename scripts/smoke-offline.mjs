import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.setOffline(true);
const page = await context.newPage();
const pageErrors = [];
const networkRequests = [];

page.on("pageerror", error => pageErrors.push(error.message));
page.on("request", request => {
  if (/^https?:/i.test(request.url())) networkRequests.push(request.url());
});

try {
  const fileUrl = pathToFileURL(path.resolve("index.html")).href;
  await page.goto(fileUrl, { waitUntil: "load", timeout: 20000 });
  try {
    await page.waitForFunction(() => {
      const root = document.getElementById("root");
      return !!root && !root.querySelector("[data-ca-loading]") && root.innerText.trim().length > 100;
    }, null, { timeout: 20000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      bootError: window.__caBootError || "",
      consoleErrors: window.__caConsoleErrors || [],
      appStarted: window.__caAppStarted,
      rootHtml: (document.getElementById("root")?.innerHTML || "").slice(0, 2500),
      bodyText: document.body.innerText.slice(0, 2500)
    }));
    throw new Error("Tracker did not render offline: " + error.message + " | " + JSON.stringify(diagnostic));
  }

  const checks = await page.evaluate(() => ({
    appStarted: window.__caAppStarted === true,
    reactLoaded: !!window.React && typeof window.React.useState === "function",
    reactDomLoaded: !!window.ReactDOM && typeof window.ReactDOM.createRoot === "function",
    excelLoaded: !!window.ExcelJS && typeof window.ExcelJS.Workbook === "function",
    rootTextLength: document.getElementById("root").innerText.length,
    storageWorks: (() => {
      try {
        localStorage.setItem("__offline_smoke_test", "ok");
        const ok = localStorage.getItem("__offline_smoke_test") === "ok";
        localStorage.removeItem("__offline_smoke_test");
        return ok;
      } catch { return false; }
    })()
  }));

  const failures = [];
  for (const [key, value] of Object.entries(checks)) {
    if (key === "rootTextLength" ? value <= 100 : value !== true) failures.push(key + "=" + value);
  }
  if (pageErrors.length) failures.push("page errors: " + pageErrors.join(" | "));
  if (networkRequests.length) failures.push("unexpected network requests: " + networkRequests.join(" | "));
  if (failures.length) throw new Error("Offline browser smoke test failed: " + failures.join("; "));

  console.log("Offline browser smoke test passed:", JSON.stringify(checks));
} finally {
  await browser.close();
}
