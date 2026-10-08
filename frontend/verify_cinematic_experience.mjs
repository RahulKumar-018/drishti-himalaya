import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9223;

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1600,900',
  'http://localhost:3000'
]);

await new Promise(r => setTimeout(r, 2000));

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

  const captureScreenshot = async (filename) => {
    return new Promise(resolve => {
      const id = Math.floor(Math.random() * 100000);
      const handler = (evt) => {
        const res = JSON.parse(evt.data);
        if (res.id === id) {
          ws.removeEventListener('message', handler);
          fs.writeFileSync(filename, Buffer.from(res.result.data, 'base64'));
          console.log(`Saved screenshot: ${filename}`);
          resolve(filename);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({
        id,
        method: 'Page.captureScreenshot',
        params: { format: 'png' }
      }));
    });
  };

  ws.onopen = () => {
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));
    ws.send(JSON.stringify({ id: 3, method: 'Page.navigate', params: { url: 'http://localhost:3000' } }));
  };

  await new Promise(r => setTimeout(r, 2500));

  // Step 1: Skip intro if button exists
  const skipped = await evalExpr(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.toLowerCase().includes('skip intro') || el.innerText.toLowerCase().includes('explore corridor'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  })()`);
  console.log('Skipped intro:', skipped);

  await new Promise(r => setTimeout(r, 2000));

  // Check 3D scene elements
  const sceneInfo = await evalExpr(`(() => {
    return {
      title: document.title,
      wordmark: !!document.querySelector('.wordmark'),
      canvas: !!document.querySelector('canvas'),
      routeSelector: !!document.querySelector('.route-selector'),
      terrainMeta: !!document.querySelector('.terrain-meta'),
      corridorContext: document.querySelector('.corridor-context strong')?.innerText,
      startInput: document.querySelector('.route-selector input')?.value,
    };
  })()`);
  console.log('3D Scene Info:', sceneInfo);

  await captureScreenshot('drishti_3d_cinematic.png');

  // Step 2: Click a segment in SegmentOverlay or trigger segment selection to open IntelligencePanel
  const clickedSeg = await evalExpr(`(() => {
    const marker = document.querySelector('.segment-marker');
    if (marker) {
      marker.click();
      return true;
    }
    return false;
  })()`);
  console.log('Clicked segment marker:', clickedSeg);

  await new Promise(r => setTimeout(r, 1500));
  await captureScreenshot('drishti_3d_intelligence_panel.png');

  // Step 3: Switch to 2D GIS Map
  const switchedTo2D = await evalExpr(`(() => {
    const btn = Array.from(document.querySelectorAll('.theme-button')).find(el => el.innerText.includes('2D MAP') || el.innerText.includes('2D'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  })()`);
  console.log('Switched to 2D GIS Map:', switchedTo2D);

  await new Promise(r => setTimeout(r, 2500));

  const mapInfo = await evalExpr(`(() => {
    return {
      leafletContainer: !!document.querySelector('.leaflet-container'),
      legend: !!document.querySelector('.dh-risk-legend'),
      layerControl: !!document.querySelector('.dh-map-floating-controls'),
    };
  })()`);
  console.log('2D Map Info:', mapInfo);

  await captureScreenshot('drishti_2d_gis_map.png');

  // Step 4: Switch back to 3D Terrain
  const switchedTo3D = await evalExpr(`(() => {
    const btn = Array.from(document.querySelectorAll('.theme-button')).find(el => el.innerText.includes('3D TERRAIN') || el.innerText.includes('3D'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  })()`);
  console.log('Switched back to 3D Terrain:', switchedTo3D);

  await new Promise(r => setTimeout(r, 2000));
  await captureScreenshot('drishti_3d_restored.png');

  // Step 5: Switch to Dashboard
  const switchedToDash = await evalExpr(`(() => {
    const btn = Array.from(document.querySelectorAll('.theme-button')).find(el => el.innerText.includes('DASHBOARD'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  })()`);
  console.log('Switched to Dashboard:', switchedToDash);

  await new Promise(r => setTimeout(r, 2000));
  await captureScreenshot('drishti_dashboard_view.png');

  ws.close();
} catch (e) {
  console.error('Error in verification:', e);
} finally {
  chrome.kill();
  process.exit(0);
}
