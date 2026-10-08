import { spawn } from 'child_process';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9222;

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  'http://localhost:3000'
]);

await new Promise(r => setTimeout(r, 1500));

try {
  const versionRes = await fetch(`http://127.0.0.1:${port}/json/list`);
  const pages = await versionRes.json();
  const page = pages.find(p => p.url.includes('localhost:3000')) || pages[0];

  if (!page || !page.webSocketDebuggerUrl) {
    console.error('No page found:', pages);
    process.exit(1);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));
    ws.send(JSON.stringify({ id: 3, method: 'Page.navigate', params: { url: 'http://localhost:3000' } }));
  };

  const logs = [];
  const errors = [];

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push(`${msg.params.type}: ${msg.params.args.map(a => a.value || a.description).join(' ')}`);
    }
  };

  await new Promise(r => setTimeout(r, 2500));

  // Check DOM state
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

  const initialCheck = await evalExpr(`({
    title: document.title,
    navItems: Array.from(document.querySelectorAll('.dh-topnav__nav-btn')).map(el => el.textContent.trim()),
    hasHero: !!document.querySelector('.dh-home-overlay'),
    heroTitle: document.querySelector('.dh-home-overlay__title')?.innerText
  })`);

  console.log('INITIAL VIEW (HOME):', JSON.stringify(initialCheck, null, 2));

  // Switch to Map tab
  await evalExpr(`(() => {
    const mapTab = Array.from(document.querySelectorAll('.dh-topnav__nav-btn')).find(el => el.innerText.includes('Risk Map'));
    if (mapTab) mapTab.click();
  })()`);

  await new Promise(r => setTimeout(r, 2000));

  const mapCheck = await evalExpr(`({
    hasWorkspace: !!document.querySelector('.dh-workspace'),
    hasMapRegion: !!document.querySelector('.dh-workspace__map-region'),
    hasPanelRegion: !!document.querySelector('.dh-workspace__panel-region'),
    hasLeaflet: !!document.querySelector('.leaflet-container'),
    hasRouteSetup: !!document.querySelector('.dh-route-setup'),
    popularDestinations: Array.from(document.querySelectorAll('.dh-route-setup__chip')).map(el => el.textContent.trim()),
    mapWidth: document.querySelector('.dh-workspace__map-region')?.getBoundingClientRect().width,
    panelWidth: document.querySelector('.dh-workspace__panel-region')?.getBoundingClientRect().width
  })`);

  console.log('MAP WORKSPACE (SPLIT VIEW):', JSON.stringify(mapCheck, null, 2));

  const screenshotRes = await new Promise(resolve => {
    const id = 999999;
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
    const fs = await import('fs');
    fs.writeFileSync('d:\\Projetcs\\Drishti-Himalaya\\drishti_split_dashboard.png', Buffer.from(screenshotRes, 'base64'));
    console.log('SCREENSHOT SAVED: drishti_split_dashboard.png');
  }

  if (errors.length > 0) {
    console.error('EXCEPTIONS FOUND:', JSON.stringify(errors, null, 2));
  } else {
    console.log('ZERO JAVASCRIPT EXCEPTIONS!');
  }

} catch (e) {
  console.error('Test error:', e);
} finally {
  chrome.kill();
  process.exit(0);
}
