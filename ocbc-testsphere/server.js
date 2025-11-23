
// const express = require('express');
// const path = require('path');
// const fs = require('fs');
// const { v4: uuidv4 } = require('uuid');
// const pixelmatch = require('pixelmatch');
// const { PNG } = require('pngjs');
// const { chromium, firefox, webkit } = require('playwright');

// const app = express();
// app.use(express.json());

// const RUNS_DIR = path.join(__dirname, 'runs');
// if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR);

// const state = {
//   // runId -> {
//   //   id, url, status, createdAt,
//   //   results: { [browser]: { screenshot, ok, error?, duration? } },
//   //   diffs: { [browser]: { against, diffPath, mismatchPct, note? } }
//   // }
//   runs: {}
// };

// // Serve dashboard
// app.use('/dashboard', express.static(path.join(__dirname, 'web')));
// // Serve generated artifacts
// app.use('/artifacts', express.static(RUNS_DIR));
// // Serve OCBC demo website
// app.use('/ocbc-demo', express.static(path.join(__dirname, 'ocbc-demo')));

// // API: list runs (newest first)
// app.get('/api/runs', (req, res) => {
//   const arr = Object.values(state.runs).sort((a, b) => b.createdAt - a.createdAt);
//   res.json(arr);
// });

// // API: get run by id
// app.get('/api/run/:id', (req, res) => {
//   const run = state.runs[req.params.id];
//   if (!run) return res.status(404).json({ error: 'not found' });
//   res.json(run);
// });

// // API: trigger a run
// app.post('/api/run', async (req, res) => {
//   const url = (req.body && req.body.url) || '';
//   if (!/^https?:\/\//i.test(url) && !/^\//.test(url)) {
//     return res.status(400).json({
//       error: 'Provide a valid http(s) URL (or a path served by this server).'
//     });
//   }

//   const id = uuidv4();
//   const run = {
//     id,
//     url,
//     status: 'queued',
//     createdAt: Date.now(),
//     results: {},
//     diffs: {},
//     note: 'Baseline: chromium. Diff: firefox & webkit vs chromium.'
//   };
//   state.runs[id] = run;

//   // respond immediately
//   res.json({ id, status: run.status });

//   // fire and forget
//   run.status = 'running';
//   try {
//     const dir = path.join(RUNS_DIR, id);
//     fs.mkdirSync(dir, { recursive: true });

//     const targets = [
//       { name: 'chromium', launcher: chromium },
//       { name: 'firefox', launcher: firefox },
//       { name: 'webkit', launcher: webkit }
//     ];

//     const viewport = { width: 1280, height: 800 };

//     // ---- PARALLEL SCREENSHOTS ----
//     await Promise.all(
//       targets.map(async (t) => {
//         let browser;
//         try {
//           const start = Date.now();
//           console.log(`[${new Date().toLocaleTimeString()}][run ${id}] Launching ${t.name}...`);

//           browser = await t.launcher.launch();
//           const ctx = await browser.newContext({ viewport });
//           const page = await ctx.newPage();

//           await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
//           // small settle wait for animations
//           await page.waitForTimeout(500);

//           const outPath = path.join(dir, `${t.name}.png`);
//           await page.screenshot({ path: outPath }); // viewport-only for consistent size

//           const duration = ((Date.now() - start) / 1000).toFixed(1);
//           run.results[t.name] = {
//             screenshot: `/artifacts/${id}/${t.name}.png`,
//             ok: true,
//             duration
//           };
//           console.log(
//             `[${new Date().toLocaleTimeString()}][run ${id}] ✅ ${t.name} done (${duration}s)`
//           );
//         } catch (err) {
//           console.error(
//             `[${new Date().toLocaleTimeString()}][run ${id}] ❌ ${t.name} failed:`,
//             err
//           );
//           run.results[t.name] = {
//             screenshot: null,
//             ok: false,
//             error: err.message
//           };
//         } finally {
//           if (browser) {
//             await browser.close().catch(() => {});
//           }
//         }
//       })
//     );

//     // ---- DIFF FIREFOX & WEBKIT AGAINST CHROMIUM ----
//     const baselinePath = path.join(dir, 'chromium.png');

//     if (!fs.existsSync(baselinePath)) {
//       console.error(`[run ${id}] No chromium baseline found, skipping diffs.`);
//     } else {
//       const baseline = PNG.sync.read(fs.readFileSync(baselinePath));

//       for (const target of ['firefox', 'webkit']) {
//         try {
//           const targetPath = path.join(dir, `${target}.png`);
//           if (!fs.existsSync(targetPath)) {
//             console.warn(`[run ${id}] No screenshot for ${target}, skipping diff.`);
//             run.diffs[target] = {
//               against: 'chromium',
//               diffPath: null,
//               mismatchPct: null,
//               note: 'No screenshot'
//             };
//             continue;
//           }

//           const targetPng = PNG.sync.read(fs.readFileSync(targetPath));

//           // Use overlapping area in case of minor size differences
//           const width = Math.min(baseline.width, targetPng.width);
//           const height = Math.min(baseline.height, targetPng.height);
//           const area = width * height;

//           const baseCrop = new PNG({ width, height });
//           const targetCrop = new PNG({ width, height });

//           PNG.bitblt(baseline, baseCrop, 0, 0, width, height, 0, 0);
//           PNG.bitblt(targetPng, targetCrop, 0, 0, width, height, 0, 0);

//           const diff = new PNG({ width, height });
//           const mismatched = pixelmatch(
//             baseCrop.data,
//             targetCrop.data,
//             diff.data,
//             width,
//             height,
//             { threshold: 0.1 }
//           );

//           const diffPath = path.join(dir, `${target}-vs-chromium-diff.png`);
//           fs.writeFileSync(diffPath, PNG.sync.write(diff));

//           const mismatchPct = Math.round((mismatched / area) * 10000) / 100; // 2 dp

//           run.diffs[target] = {
//             against: 'chromium',
//             diffPath: `/artifacts/${id}/${target}-vs-chromium-diff.png`,
//             mismatchPct
//           };
//           console.log(`[run ${id}] Saved ${target} diff (${mismatchPct}%)`);
//         } catch (err) {
//           console.error(`[run ${id}] Error diffing ${target}:`, err);
//           run.diffs[target] = {
//             against: 'chromium',
//             diffPath: null,
//             mismatchPct: null,
//             note: err.message
//           };
//         }
//       }
//     }

//     run.status = 'done';
//     run.duration = ((Date.now() - run.createdAt) / 1000).toFixed(1);
//     console.log(`[run ${id}]  Total duration: ${run.duration}s`);
//   } catch (e) {
//     run.status = 'error';
//     run.error = (e && e.message) || String(e);
//     console.error('[run error]', e);
//   }
// });

// // Healthcheck
// app.get('/api/health', (req, res) => res.json({ ok: true }));


//  const port = process.env.PORT || 8080;
// app.listen(port, () => {
//  console.log(`OCBC TestSphere backend on http://localhost:${port}`);
//  console.log(`Open dashboard: http://localhost:${port}/dashboard`);
// });






















// const express = require("express");
// const path = require("path");
// const fs = require("fs");
// const { v4: uuidv4 } = require("uuid");
// const pixelmatch = require("pixelmatch");
// const { PNG } = require("pngjs");
// const { chromium, firefox, webkit } = require("playwright");

// const app = express();
// app.use(express.json());

// // ---------- Paths & in-memory state ----------

// const ROOT_DIR = __dirname;
// const RUNS_DIR = path.join(ROOT_DIR, "runs");

// if (!fs.existsSync(RUNS_DIR)) {
//   fs.mkdirSync(RUNS_DIR, { recursive: true });
// }

// const state = {
//   // runId -> {
//   //   id, url, status, createdAt,
//   //   results: { [browser]: { screenshot, ok, error?, duration? } },
//   //   diffs: { [browser]: { against, diffPath, mismatchPct, note? } }
//   // }
//   runs: {},
// };

// // ---------- Helper: normalize run before sending to client ----------

// /**
//  * Normalize a run:
//  * - If screenshots exist but status is still "running"/"queued", mark as "done".
//  * - Ensure we always have diff objects for firefox & webkit:
//  *   - If real pixelmatch diff exists, keep it.
//  *   - Otherwise fall back to using the browser screenshot as "diff".
//  */
// function normalizeRun(run) {
//   if (!run) return run;

//   const hasChromium =
//     run.results &&
//     run.results.chromium &&
//     run.results.chromium.ok &&
//     run.results.chromium.screenshot;

//   // If screenshots are there but status never got updated, mark as done
//   if (
//     (run.status === "running" || run.status === "queued") &&
//     hasChromium
//   ) {
//     run.status = "done";
//   }

//   if (!run.diffs) run.diffs = {};

//   // Guarantee entries for firefox & webkit
//   ["firefox", "webkit"].forEach((browser) => {
//     // If we already have a real diff, keep it
//     if (run.diffs[browser] && run.diffs[browser].diffPath) return;

//     const result =
//       run.results && run.results[browser] && run.results[browser].ok
//         ? run.results[browser]
//         : null;

//     if (result && result.screenshot) {
//       // Fallback: use the raw browser screenshot as "diff"
//       run.diffs[browser] = {
//         against: "chromium",
//         diffPath: result.screenshot,
//         mismatchPct: null,
//         note: "No diff image generated; using browser screenshot as fallback.",
//       };
//     }
//   });

//   return run;
// }

// // ---------- Static assets (dashboard + demo + artifacts) ----------

// app.use("/dashboard", express.static(path.join(ROOT_DIR, "web")));
// app.use("/artifacts", express.static(RUNS_DIR));
// app.use("/ocbc-demo", express.static(path.join(ROOT_DIR, "ocbc-demo")));

// // ---------- Core runner ----------

// async function executeVisualRun(run) {
//   const { id, url } = run;
//   run.status = "running";
//   run.results = run.results || {};
//   run.diffs = run.diffs || {};

//   try {
//     const dir = path.join(RUNS_DIR, id);
//     fs.mkdirSync(dir, { recursive: true });

//     const targets = [
//       { name: "chromium", launcher: chromium },
//       { name: "firefox", launcher: firefox },
//       { name: "webkit", launcher: webkit },
//     ];

//     const viewport = { width: 1280, height: 800 };

//     // ---- 1) TAKE SCREENSHOTS (SEQUENTIAL – safer on small containers) ----
//     for (const t of targets) {
//       let browser;
//       try {
//         const start = Date.now();
//         console.log(
//           `[${new Date().toLocaleTimeString()}][run ${id}] Launching ${t.name}...`
//         );

//         // In the Playwright Docker image, default launch options are fine.
//         browser = await t.launcher.launch({ headless: true });

//         const ctx = await browser.newContext({ viewport });
//         const page = await ctx.newPage();

//         await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
//         await page.waitForTimeout(500); // small settle wait

//         const outPath = path.join(dir, `${t.name}.png`);
//         await page.screenshot({ path: outPath, fullPage: true });

//         const duration = ((Date.now() - start) / 1000).toFixed(1);
//         run.results[t.name] = {
//           screenshot: `/artifacts/${id}/${t.name}.png`,
//           ok: true,
//           duration,
//         };

//         console.log(
//           `[${new Date().toLocaleTimeString()}][run ${id}] ✅ ${t.name} done (${duration}s)`
//         );
//       } catch (err) {
//         console.error(
//           `[${new Date().toLocaleTimeString()}][run ${id}] ❌ ${t.name} failed:`,
//           err
//         );
//         run.results[t.name] = {
//           screenshot: null,
//           ok: false,
//           error: err.message,
//         };
//       } finally {
//         if (browser) {
//           await browser.close().catch(() => {});
//         }
//       }
//     }

//     // ---- 2) DIFF FIREFOX & WEBKIT AGAINST CHROMIUM ----
//     const baselinePath = path.join(dir, "chromium.png");

//     if (!fs.existsSync(baselinePath)) {
//       console.error(`[run ${id}] No chromium baseline found, skipping diffs.`);
//     } else {
//       const baseline = PNG.sync.read(fs.readFileSync(baselinePath));

//       for (const target of ["firefox", "webkit"]) {
//         try {
//           const targetPath = path.join(dir, `${target}.png`);
//           if (!fs.existsSync(targetPath)) {
//             console.warn(
//               `[run ${id}] No screenshot for ${target}, skipping diff.`
//             );
//             run.diffs[target] = {
//               against: "chromium",
//               diffPath: null,
//               mismatchPct: null,
//               note: "No screenshot",
//             };
//             continue;
//           }

//           const targetPng = PNG.sync.read(fs.readFileSync(targetPath));

//           // Overlapping area in case of minor size differences
//           const width = Math.min(baseline.width, targetPng.width);
//           const height = Math.min(baseline.height, targetPng.height);
//           const area = width * height;

//           const baseCrop = new PNG({ width, height });
//           const targetCrop = new PNG({ width, height });

//           PNG.bitblt(baseline, baseCrop, 0, 0, width, height, 0, 0);
//           PNG.bitblt(targetPng, targetCrop, 0, 0, width, height, 0, 0);

//           const diff = new PNG({ width, height });
//           const mismatched = pixelmatch(
//             baseCrop.data,
//             targetCrop.data,
//             diff.data,
//             width,
//             height,
//             { threshold: 0.1 }
//           );

//           const diffPath = path.join(dir, `${target}-vs-chromium-diff.png`);
//           fs.writeFileSync(diffPath, PNG.sync.write(diff));

//           const mismatchPct = Math.round((mismatched / area) * 10000) / 100; // 2 dp

//           run.diffs[target] = {
//             against: "chromium",
//             diffPath: `/artifacts/${id}/${target}-vs-chromium-diff.png`,
//             mismatchPct,
//           };
//           console.log(
//             `[run ${id}] Saved ${target} diff (${mismatchPct}%) at ${run.diffs[target].diffPath}`
//           );
//         } catch (err) {
//           console.error(`[run ${id}] Error diffing ${target}:`, err);
//           run.diffs[target] = {
//             against: "chromium",
//             diffPath: null,
//             mismatchPct: null,
//             note: err.message,
//           };
//         }
//       }
//     }

//     // ---- 3) FINISH RUN ----
//     run.status = "done";
//     run.duration = ((Date.now() - run.createdAt) / 1000).toFixed(1);
//     console.log(`[run ${id}]  Total duration: ${run.duration}s`);
//   } catch (e) {
//     run.status = "error";
//     run.error = (e && e.message) || String(e);
//     console.error("[run error]", e);
//   }
// }

// // ---------- API routes ----------

// // List runs (newest first)
// app.get("/api/runs", (req, res) => {
//   const arr = Object.values(state.runs)
//     .sort((a, b) => b.createdAt - a.createdAt)
//     .map((run) => normalizeRun(run));
//   res.json(arr);
// });

// // Get run by id
// app.get("/api/run/:id", (req, res) => {
//   const run = state.runs[req.params.id];
//   if (!run) return res.status(404).json({ error: "not found" });
//   res.json(normalizeRun(run));
// });

// // Trigger a run (used by dashboard & local dev)
// app.post("/api/run", async (req, res) => {
//   const url = (req.body && req.body.url) || "";
//   if (!/^https?:\/\//i.test(url) && !/^\//.test(url)) {
//     return res.status(400).json({
//       error: "Provide a valid http(s) URL (or a path served by this server).",
//     });
//   }

//   const id = uuidv4();
//   const run = {
//     id,
//     url,
//     status: "queued",
//     createdAt: Date.now(),
//     results: {},
//     diffs: {},
//     note: "Baseline: chromium. Diff: firefox & webkit vs chromium.",
//   };
//   state.runs[id] = run;

//   // respond immediately
//   res.json({ id, status: run.status });

//   // fire and forget
//   await executeVisualRun(run);
// });

// // Simple healthcheck (for Railway, etc.)
// app.get("/api/health", (req, res) => res.json({ ok: true }));

// // ---------- Start server ----------

// const port = process.env.PORT || 8080;
// app.listen(port, () => {
//   console.log(`OCBC TestSphere backend on http://localhost:${port}`);
//   console.log(`Open dashboard: http://localhost:${port}/dashboard`);
// });







const express = require("express");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const pixelmatch = require("pixelmatch");
const { PNG } = require("pngjs");
const { chromium, firefox, webkit } = require("playwright");
const { loginAndWait } = require("./playwright/loginScenario");

const app = express();
app.use(express.json());

// ---------- Paths & in-memory state ----------

const ROOT_DIR = __dirname;
const RUNS_DIR = path.join(ROOT_DIR, "runs");

if (!fs.existsSync(RUNS_DIR)) {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
}

const state = {
  // runId -> {
  //   id, url, status, createdAt,
  //   results: {
  //     [browser]: {
  //       screenshotBefore?,
  //       screenshotAfter?,
  //       screenshot, // kept for backward-compat (after-login)
  //       ok,
  //       error?,
  //       duration?
  //     }
  //   },
  //   diffs: { [browser]: { against, diffPath, mismatchPct, note? } }
  // }
  runs: {},
};

// ---------- Helper: normalize run before sending to client ----------

/**
 * Normalize a run:
 * - If screenshots exist but status is still "running"/"queued", mark as "done".
 * - Ensure we always have diff objects for firefox & webkit:
 *   - If real pixelmatch diff exists, keep it.
 *   - Otherwise fall back to using the browser AFTER-login screenshot as "diff".
 */
function normalizeRun(run) {
  if (!run) return run;

  const hasChromium =
    run.results &&
    run.results.chromium &&
    run.results.chromium.ok &&
    run.results.chromium.screenshot;

  // If screenshots are there but status never got updated, mark as done
  if (
    (run.status === "running" || run.status === "queued") &&
    hasChromium
  ) {
    run.status = "done";
  }

  if (!run.diffs) run.diffs = {};

  // Guarantee entries for firefox & webkit
  ["firefox", "webkit"].forEach((browser) => {
    // If we already have a real diff, keep it
    if (run.diffs[browser] && run.diffs[browser].diffPath) return;

    const result =
      run.results && run.results[browser] && run.results[browser].ok
        ? run.results[browser]
        : null;

    if (result && result.screenshot) {
      // Fallback: use the AFTER-login screenshot as "diff"
      run.diffs[browser] = {
        against: "chromium",
        diffPath: result.screenshot,
        mismatchPct: null,
        note: "No diff image generated; using browser screenshot as fallback.",
      };
    }
  });

  return run;
}

// ---------- Static assets (dashboard + demo + artifacts) ----------

app.use("/dashboard", express.static(path.join(ROOT_DIR, "web")));
app.use("/artifacts", express.static(RUNS_DIR));
app.use("/ocbc-demo", express.static(path.join(ROOT_DIR, "ocbc-demo")));

// ---------- Core runner ----------

async function executeVisualRun(run) {
  const { id, url } = run;
  run.status = "running";
  run.results = run.results || {};
  run.diffs = run.diffs || {};

  try {
    const dir = path.join(RUNS_DIR, id);
    fs.mkdirSync(dir, { recursive: true });

    const targets = [
      { name: "chromium", launcher: chromium },
      { name: "firefox", launcher: firefox },
      { name: "webkit", launcher: webkit },
    ];

    const viewport = { width: 1280, height: 800 };

    // ---- 1) TAKE SCREENSHOTS (BEFORE + AFTER LOGIN) ----
    for (const t of targets) {
      let browser;
      try {
        const start = Date.now();
        console.log(
          `[${new Date().toLocaleTimeString()}][run ${id}] Launching ${t.name}...`
        );

        browser = await t.launcher.launch({ headless: true });
        const ctx = await browser.newContext({ viewport });
        const page = await ctx.newPage();

        // 1) Go to the page once
        await page.goto(url, {
          waitUntil: "networkidle",
          timeout: 60_000,
        });

        // 2) BEFORE-login screenshot
        const beforePath = path.join(dir, `${t.name}-before.png`);
        await page.screenshot({ path: beforePath, fullPage: true });

        // 3) Perform login (WITHOUT reloading)
        //    We pass skipGoto: true so loginAndWait doesn't call page.goto again.
        await loginAndWait(page, url, { skipGoto: true });

        // 4) AFTER-login screenshot
        const afterPath = path.join(dir, `${t.name}.png`);
        await page.screenshot({ path: afterPath, fullPage: true });

        const duration = ((Date.now() - start) / 1000).toFixed(1);

        // Store both before & after paths (and keep 'screenshot' pointing to AFTER)
        run.results[t.name] = {
          screenshotBefore: `/artifacts/${id}/${t.name}-before.png`,
          screenshotAfter: `/artifacts/${id}/${t.name}.png`,
          screenshot: `/artifacts/${id}/${t.name}.png`,
          ok: true,
          duration,
        };

        console.log(
          `[${new Date().toLocaleTimeString()}][run ${id}] ✅ ${t.name} done (${duration}s)`
        );
      } catch (err) {
        console.error(
          `[${new Date().toLocaleTimeString()}][run ${id}] ❌ ${t.name} failed:`,
          err
        );
        run.results[t.name] = {
          screenshotBefore: null,
          screenshotAfter: null,
          screenshot: null,
          ok: false,
          error: err.message,
        };
      } finally {
        if (browser) {
          await browser.close().catch(() => {});
        }
      }
    }

    // ---- 2) DIFF FIREFOX & WEBKIT AGAINST CHROMIUM (AFTER LOGIN) ----
    const baselinePath = path.join(dir, "chromium.png");

    if (!fs.existsSync(baselinePath)) {
      console.error(`[run ${id}] No chromium baseline found, skipping diffs.`);
    } else {
      const baseline = PNG.sync.read(fs.readFileSync(baselinePath));

      for (const target of ["firefox", "webkit"]) {
        try {
          const targetPath = path.join(dir, `${target}.png`);
          if (!fs.existsSync(targetPath)) {
            console.warn(
              `[run ${id}] No screenshot for ${target}, skipping diff.`
            );
            run.diffs[target] = {
              against: "chromium",
              diffPath: null,
              mismatchPct: null,
              note: "No screenshot",
            };
            continue;
          }

          const targetPng = PNG.sync.read(fs.readFileSync(targetPath));

          // Overlapping area in case of minor size differences
          const width = Math.min(baseline.width, targetPng.width);
          const height = Math.min(baseline.height, targetPng.height);
          const area = width * height;

          const baseCrop = new PNG({ width, height });
          const targetCrop = new PNG({ width, height });

          PNG.bitblt(baseline, baseCrop, 0, 0, width, height, 0, 0);
          PNG.bitblt(targetPng, targetCrop, 0, 0, width, height, 0, 0);

          const diff = new PNG({ width, height });
          const mismatched = pixelmatch(
            baseCrop.data,
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
            against: "chromium",
            diffPath: `/artifacts/${id}/${target}-vs-chromium-diff.png`,
            mismatchPct,
          };
          console.log(
            `[run ${id}] Saved ${target} diff (${mismatchPct}%) at ${run.diffs[target].diffPath}`
          );
        } catch (err) {
          console.error(`[run ${id}] Error diffing ${target}:`, err);
          run.diffs[target] = {
            against: "chromium",
            diffPath: null,
            mismatchPct: null,
            note: err.message,
          };
        }
      }
    }

    // ---- 3) FINISH RUN ----
    run.status = "done";
    run.duration = ((Date.now() - run.createdAt) / 1000).toFixed(1);
    console.log(`[run ${id}]  Total duration: ${run.duration}s`);
  } catch (e) {
    run.status = "error";
    run.error = (e && e.message) || String(e);
    console.error("[run error]", e);
  }
}

// ---------- API routes ----------

// List runs (newest first)
app.get("/api/runs", (req, res) => {
  const arr = Object.values(state.runs)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((run) => normalizeRun(run));
  res.json(arr);
});

// Get run by id
app.get("/api/run/:id", (req, res) => {
  const run = state.runs[req.params.id];
  if (!run) return res.status(404).json({ error: "not found" });
  res.json(normalizeRun(run));
});

// Trigger a run (used by dashboard & local dev)
app.post("/api/run", async (req, res) => {
  const url = (req.body && req.body.url) || "";
  if (!/^https?:\/\//i.test(url) && !/^\//.test(url)) {
    return res.status(400).json({
      error: "Provide a valid http(s) URL (or a path served by this server).",
    });
  }

  const id = uuidv4();
  const run = {
    id,
    url,
    status: "queued",
    createdAt: Date.now(),
    results: {},
    diffs: {},
    note: "Baseline: chromium. Diff: firefox & webkit vs chromium.",
  };
  state.runs[id] = run;

  // respond immediately
  res.json({ id, status: run.status });

  // fire and forget
  await executeVisualRun(run);
});

// Simple healthcheck (for Railway, etc.)
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------- Start server ----------

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`OCBC TestSphere backend on http://localhost:${port}`);
  console.log(`Open dashboard: http://localhost:${port}/dashboard`);
});
