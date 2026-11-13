// page.mjs: drives the board's page in headless Chrome for the page tests (page.test.mjs). startBoard runs this repo's
// board on a spare port with a throwaway config and state folder (no machine it can reach, no Linear key), and
// openPage loads a view with a snapshot fixture in place of the board's own: a script run before the page's wraps
// fetch so /api/snapshot answers with the fixture. Every uncaught page error is collected. Chrome is found at $CHROME,
// then the usual macOS and Linux places; chromePath() is null when there is none, and the tests skip.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOARD = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'board.mjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function chromePath() {
  const tries = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return tries.find((p) => p && fs.existsSync(p)) ?? null;
}

// The board on port, with its config and state in a fresh folder. Resolves { base, stop }.
// queueBoard adds keys to the throwaway config's queueBoard (realms, spreadRealms), so a test can start a board as configured.
export async function startBoard(port, { queueBoard = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-page-'));
  const config = {
    paths: { stateDir: path.join(dir, 'state'), sharedDir: path.join(dir, 'shared') },
    repoPath: path.join(dir, 'repo'), workspaceCwd: path.join(dir, 'repo'),
    linear: { apiKeyFile: path.join(dir, 'no-key') },
    dispatcher: { enabledHosts: ['forge-test.invalid'] },
    queueBoard: { port, bind: ['127.0.0.1'], extUsage: false, musicDir: path.join(dir, 'music'), repoRoots: [path.join(dir, 'repo')], ...queueBoard },
  };
  for (const d of ['state', 'shared', 'repo', 'music']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
  const env = { ...process.env, AGENT_QUEUE_CONFIG: path.join(dir, 'config.json'), QUEUE_BOARD_PORT: String(port) };
  delete env.LINEAR_API_KEY;
  const child = spawn(process.execPath, [BOARD], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) {
    if (await fetch(`${base}/healthz`).then((r) => r.ok).catch(() => false)) {
      return { base, stop: () => { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); } };
    }
    if (child.exitCode != null) break;
    await wait(250);
  }
  child.kill();
  throw new Error(`the board did not start on ${port}: ${err.slice(-400)}`);
}

// A headless Chrome. Resolves { open, close }: open(url, { width, height, fixture, settle, expr }) loads the page with the
// fixture snapshot, waits settle ms, evaluates expr (an expression that may return a promise of JSON-able data) and
// resolves { errors, value, png } with a screenshot as PNG bytes.
export async function startChrome(port) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-chrome-'));
  const chrome = spawn(chromePath(), ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let tabs = null;
  for (let i = 0; i < 40 && !tabs; i += 1) {
    await wait(250);
    tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null);
  }
  if (!tabs) { chrome.kill(); throw new Error('headless Chrome did not answer'); }
  // Chrome writes to its profile while it shuts down, so the folder goes once it has exited.
  const close = async () => {
    const gone = new Promise((r) => (chrome.exitCode != null ? r() : chrome.once('exit', r)));
    chrome.kill();
    await Promise.race([gone, wait(5000)]);
    fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  async function open(url, { width = 1790, height = 1260, fixture = null, settle = 6000, expr = 'null' } = {}) {
    const tab = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    let id = 0;
    const errors = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    });
    const call = (method, params = {}) => new Promise((res, rej) => {
      const me = ++id;
      const on = (e) => {
        const m = JSON.parse(e.data);
        if (m.id !== me) return;
        ws.removeEventListener('message', on);
        if (m.error) rej(new Error(`${method}: ${m.error.message}`)); else res(m.result);
      };
      ws.addEventListener('message', on);
      ws.send(JSON.stringify({ id: me, method, params }));
    });
    try {
      await call('Runtime.enable');
      await call('Page.enable');
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: width < 768 ? 2 : 1, mobile: width < 768 });
      if (fixture) {
        const source = `(() => { const fix = ${JSON.stringify(JSON.stringify(fixture))}; const real = window.fetch.bind(window);
          window.__fixture = (s) => { window.__fix = s; };
          window.fetch = (u, o) => (String(u).startsWith('/api/snapshot') ? Promise.resolve(new Response(window.__fix ? JSON.stringify(window.__fix) : fix, { headers: { 'content-type': 'application/json' } })) : real(u, o)); })();`;
        await call('Page.addScriptToEvaluateOnNewDocument', { source });
      }
      await call('Page.navigate', { url });
      await wait(settle);
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) errors.push(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      return { errors, value: r.result?.value ?? null, png: Buffer.from(shot.data, 'base64') };
    } finally {
      ws.close();
      await fetch(`http://127.0.0.1:${port}/json/close/${tab.id}`).catch(() => {});
    }
  }
  return { open, close };
}
