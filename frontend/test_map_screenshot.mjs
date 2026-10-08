import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9222;

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1600,900',
  'http://localhost:3000'
]);

await new Promise(r => setTimeout(r, 1500));

try {
  const versionRes = await fetch(`http://127.0.0.1:${port}/json/list`);
  const pages = await versionRes.json();
  const page = pages.find(p => p.url.includes('localhost:3000')) || pages[0];

  const ws = new WebSocket(page.webSocketDebuggerUrl);

  const evalExpr = async (expr) => {
    return new Promise(resolve => {
      const id = Math.floor(Math.random() * 100000);
      const handler = (evt) => {
        const res = JSON.parse(evt.data);
        if (res.id === id) {
          ws.removeEventListener('message', handler);
          resolve(res.result?.result?.value);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true }
      }));
    });
  };

  ws.onopen = () => {
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));
    ws.send(JSON.stringify({ id: 3, method: 'Page.navigate', params: { url: 'http://localhost:3000' } }));
  };

  await new Promise(r => setTimeout(r, 2500));

  // Click on "Risk Map"
  await evalExpr(`(() => {
    const btn = Array.from(document.querySelectorAll('.dh-topnav__nav-btn')).find(el => el.innerText.includes('Risk Map'));
    if (btn) btn.click();
  })()`);

  await new Promise(r => setTimeout(r, 3000));

  // Take screenshot
  const screenshotRes = await new Promise(resolve => {
    const id = 888888;
    const handler = (evt) => {
      const res = JSON.parse(evt.data);
      if (res.id === id) {
        ws.removeEventListener('message', handler);
        resolve(res.result?.data);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method: 'Page.captureScreenshot' }));
  });

  if (screenshotRes) {
    fs.writeFileSync('d:\\Projetcs\\Drishti-Himalaya\\drishti_split_map_view.png', Buffer.from(screenshotRes, 'base64'));
    console.log('SCREENSHOT SAVED: drishti_split_map_view.png');
  }

} catch (e) {
  console.error('Error:', e);
} finally {
  chrome.kill();
  process.exit(0);
}
