/* OCBC TestSphere — Express backend */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');
const { chromium, firefox, webkit } = require('playwright');

const app = express();
app.use(express.json());

const RUNS_DIR = path.join(__dirname, 'runs');
if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR);

const state = {
  // runId -> { id, url, status, createdAt, profile, client, results, diffs }
  runs: {}
};

// Serve dashboard
app.use('/dashboard', express.static(path.join(__dirname, 'web')));
// Serve generated artifacts
app.use('/artifacts', express.static(RUNS_DIR));

// API: list runs (newest first)
app.get('/api/runs', (req, res) => {
  const arr = Object.values(state.runs).sort((a, b) => b.createdAt - a.createdAt);
  res.json(arr);
});

// API: get run by id
app.get('/api/run/:id', (req, res) => {
  const run = state.runs[req.params.id];
  if (!run) return res.status(404).json({ error: 'not found' });
  res.json(run);
});

// API: trigger a run
app.post('/api/run', async (req, res) => {
  const url = (req.body && req.body.url) || '';
  if (!/^https?:\/\//i.test(url) && !/^\//.test(url)) {
    return res
      .status(400)
      .json({ error: 'Provide a valid http(s) URL (or a path served by this server).' });
  }

  // Auto-detect viewport & device from client info
  const client = req.body && req.body.client;
  const isMobile = !!(client && client.isMobile);
  const width = client && client.width ? Math.round(client.width) : 1280;
  const height = client && client.height ? Math.round(client.height) : 800;
  const deviceScaleFactor = client && client.dpr ? client.dpr : 1;
  const userAgent = client && client.ua ? client.ua : undefined;

  const id = uuidv4();
  const run = {
    id,
    url,
    status: 'queued',
    createdAt: Date.now(),
    results: {},
    diffs: {},
    note: 'Baseline: chromium. Diff: firefox & webkit vs chromium.',
    profile: isMobile ? 'auto-mobile' : 'auto-desktop',
    client
  };
  state.runs[id] = run;

  res.json({ id, status: run.status });

  // fire and forget
  run.status = 'running';
  try {
    const dir = path.join(RUNS_DIR, id);
    fs.mkdirSync(dir, { recursive: true });

    const targets = [
      { name: 'chromium', launcher: chromium },
      { name: 'firefox', launcher: firefox },
      { name: 'webkit', launcher: webkit }
    ];

    const viewport = { width, height };

    // Take screenshots per browser
    for (const t of targets) {
      const browser = await t.launcher.launch();

      // Build context options per browser
      const contextOptions = {
        viewport,
        deviceScaleFactor,
        userAgent
      };

      // Only Chromium/WebKit support isMobile – skip for Firefox
      if (isMobile && (t.name === 'chromium' || t.name === 'webkit')) {
        contextOptions.isMobile = true;
      }

      const ctx = await browser.newContext(contextOptions);
      const page = await ctx.newPage();

      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(500); // settle animations

      const outPath = path.join(dir, `${t.name}.png`);

      // Timestamp badge (bottom-right)
      const ts = new Date().toLocaleString('en-SG', {
        hour12: false,
        timeZone: 'Asia/Singapore'
      });

      await page.addStyleTag({
        content: `
          #__ts_badge__ {
            position: fixed; right: 10px; bottom: 10px;
            padding: 4px 8px; border-radius: 6px;
            background: rgba(0,0,0,.6); color: #fff;
            font: 12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Inter,Roboto,Helvetica,Arial,sans-serif;
            z-index: 2147483647; pointer-events: none;
          }`
      });

      await page.evaluate((text) => {
        const el = document.createElement('div');
        el.id = '__ts_badge__';
        el.textContent = `📅 ${text}`;
        document.body.appendChild(el);
      }, ts);

      // IMPORTANT: viewport-only screenshot (no fullPage)
      await page.screenshot({ path: outPath, fullPage: true });


      // Clean up badge
      await page.evaluate(() => {
        const el = document.getElementById('__ts_badge__');
        if (el) el.remove();
      });

      await browser.close();
      run.results[t.name] = { screenshot: `/artifacts/${id}/${t.name}.png`, ok: true };
    }

        // Diff firefox and webkit against chromium
    const baseline = PNG.sync.read(fs.readFileSync(path.join(dir, 'chromium.png')));

    for (const target of ['firefox', 'webkit']) {
      const targetPng = PNG.sync.read(fs.readFileSync(path.join(dir, `${target}.png`)));

      // Use the overlapping area between baseline and target
      const width = Math.min(baseline.width, targetPng.width);
      const height = Math.min(baseline.height, targetPng.height);
      const area = width * height;

      // Crop both images to the common region so sizes never break the diff
      const baselineCrop = new PNG({ width, height });
      const targetCrop = new PNG({ width, height });

      PNG.bitblt(baseline, baselineCrop, 0, 0, width, height, 0, 0);
      PNG.bitblt(targetPng, targetCrop, 0, 0, width, height, 0, 0);

      const diff = new PNG({ width, height });

      const mismatched = pixelmatch(
        baselineCrop.data,
        targetCrop.data,
        diff.data,
        width,
        height,
        { threshold: 0.1 }
      );

      const diffPath = path.join(dir, `${target}-vs-chromium-diff.png`);
      fs.writeFileSync(diffPath, PNG.sync.write(diff));

      const mismatchPct = Math.round((mismatched / area) * 10000) / 100; // 2 dp

      run.diffs[target] = {
        against: 'chromium',
        diffPath: `/artifacts/${id}/${target}-vs-chromium-diff.png`,
        mismatchPct
      };
    }


    run.status = 'done';
  } catch (e) {
    run.status = 'error';
    run.error = (e && e.message) || String(e);
    console.error('[run error]', e);
  }
});

// Healthcheck
app.get('/api/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`OCBC TestSphere backend on http://localhost:${port}`);
  console.log(`Open dashboard: http://localhost:${port}/dashboard`);
});
