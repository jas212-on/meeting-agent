import { chromium } from "playwright";
import path from "node:path";

const log = (...msg: unknown[]): void =>
  console.log(`[${new Date().toISOString()}]`, ...msg);

async function main(): Promise<void> {
  const arg = process.argv.indexOf("--profile");
  const profileDir = path.resolve(
    arg === -1 ? "profiles/meet" : process.argv[arg + 1],
  );

  log("Opening Chrome with persistent profile for one-time login...");
  log(`Profile directory: ${profileDir}`);
  log("Log into your Google account, then close the Chrome window.");

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "chrome",
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://accounts.google.com");

  const closing = await new Promise<void>((resolve) => {
    context.on("close", () => resolve());
    process.on("SIGINT", async () => {
      await context.close();
      resolve();
    });
  });
  void closing;

  log("Profile saved. You can now run: npm start -- --url <meet-link>");
}

void main();