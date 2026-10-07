// Shared helpers: a tiny static file server for the repo and a headless Chrome page that
// exposes window.renderFrame(n). Each frame depends only on n, so frames can be rendered
// in any order and in parallel pages.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.css': 'text/css' };

export function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cands = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  const hit = cands.find((c) => fs.existsSync(c));
  if (!hit) throw new Error('Chrome not found: set CHROME_PATH');
  return hit;
}

export async function launch() {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
}

export async function openPage(browser, port) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1440, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.error('[console]', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/src/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => window.__ready);
  return page;
}

// render frame n and return a PNG buffer of the canvas
export async function grab(page, n) {
  await page.evaluate((k) => window.renderFrame(k), n);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1440 }, optimizeForSpeed: true });
}
