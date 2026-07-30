import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SITE_PORT = 8767;
const DEBUG_PORT = 9224;
const BASE_URL = `http://127.0.0.1:${SITE_PORT}`;
const ROUTES = [
  '/mortgage/stamp-duty-calculator/',
  '/mortgage/overpayment-calculator/',
  '/mortgage/compare-mortgages/',
  '/mortgage/affordability-calculator/',
  '/mortgage/first-time-buyer-costs/',
  '/remortgage/',
];

async function waitForResponse(url, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForJson(url, attempts = 50) {
  return (await waitForResponse(url, attempts)).json();
}

class CdpClient {
  constructor(url) {
    this.nextId = 0;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async connect() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

function stop(process) {
  if (process && process.exitCode === null) process.kill('SIGTERM');
}

test('mortgage tools do not overflow real mobile viewports', { timeout: 30_000 }, async () => {
  const server = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '--bind', '127.0.0.1'], {
    cwd: new URL('..', import.meta.url),
    stdio: 'ignore',
  });
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--remote-allow-origins=*",
    '--user-data-dir=/tmp/moneyharbour-mobile-overflow-test',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    await waitForResponse(`${BASE_URL}/mortgage/stamp-duty-calculator/`);
    const pages = await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json`);
    const client = new CdpClient(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await client.connect();

    for (const width of [320, 390]) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });

      for (const route of ROUTES) {
        await client.send('Page.navigate', { url: `${BASE_URL}${route}` });
        await delay(150);
        const { result } = await client.send('Runtime.evaluate', {
          returnByValue: true,
          expression: `(() => {
            const viewportWidth = document.documentElement.clientWidth;
            const overflowers = [...document.querySelectorAll('body *')]
              .filter(element => !element.classList.contains('skip-link'))
              .map(element => {
                const rect = element.getBoundingClientRect();
                return { tag: element.tagName, id: element.id, className: String(element.className), left: rect.left, right: rect.right };
              })
              .filter(element => element.left < -0.5 || element.right > viewportWidth + 0.5);
            return {
              viewportWidth,
              documentWidth: document.documentElement.scrollWidth,
              bodyWidth: document.body.scrollWidth,
              overflowers,
            };
          })()`,
        });
        const measurement = result.value;
        assert.equal(measurement.viewportWidth, width, `${route} was not rendered at the requested ${width}px viewport`);
        assert.equal(measurement.documentWidth, width, `${route} overflows the ${width}px viewport`);
        assert.equal(measurement.bodyWidth, width, `${route} body overflows the ${width}px viewport`);
        assert.deepEqual(measurement.overflowers, [], `${route} has elements outside the ${width}px viewport`);
      }
    }

    client.close();
  } finally {
    stop(chrome);
    stop(server);
  }
});
