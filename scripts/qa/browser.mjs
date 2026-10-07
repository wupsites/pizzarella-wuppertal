import { existsSync, readdirSync } from 'node:fs';
/** Pfad zum vorinstallierten Chromium (PLAYWRIGHT_BROWSERS_PATH) oder CHROME_PATH. */
export function browserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (existsSync(base)) {
    const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
    if (dir) return `${base}/${dir}/chrome-linux/chrome`;
  }
  return undefined;
}
