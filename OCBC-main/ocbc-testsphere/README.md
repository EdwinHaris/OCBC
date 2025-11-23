# OCBC TestSphere — Cross‑Browser Visual Testing Platform

**Goal:** Automatically run Playwright across Chromium, Firefox, and WebKit, take screenshots, diff browsers, and present a dashboard with results and downloadable artifacts.

## Features
- 🚀 One‑click run from the **dashboard**
- 🌐 **Cross‑browser**: Chromium (baseline), Firefox, WebKit
- 🖼️ **Visual diffs** (pixelmatch) – firefox/webkit vs chromium
- 📊 **Trend chart** (Chart.js) of mismatch percentage
- 📁 Stores artifacts under `./runs/<runId>/`
- 🧩 Simple **Express** API + static **React** dashboard (no bundler)
- 🐳 **Dockerfile** for easy demo
- 🔒 Ready to point at staging URLs (respect policies; do not test live without permission)

## Quick Start
```bash
npm ci
npm run test:install   # installs Playwright browsers & OS deps
npm start              # http://localhost:8080/dashboard
npm run watch:demo
```
Then enter a URL to test (e.g., https://www.ocbc.com/).

## API
- `GET /api/runs` → list of runs (JSON)
- `GET /api/run/:id` → specific run (JSON)
- `POST /api/run` with `{ "url": "https://example.com" }` → triggers a run

## How It Works
1. Backend launches **Playwright** on three engines and captures full‑page screenshots.
2. **Chromium** acts as baseline.
3. **pixelmatch** compares Firefox and WebKit vs baseline → creates diff images + mismatch %.
4. Dashboard polls `/api/runs`, renders cards, and draws a trend chart.

## Notes
- To target specific pages behind login, consider staging flags or test routes.
- For more stability, add waits for specific selectors instead of `networkidle` only.
- You can extend to run custom Playwright scripts per URL.

## Docker
```bash
docker build -t ocbc-testsphere .
docker run --rm -p 8080:8080 ocbc-testsphere
```

## Roadmap (nice‑to‑have)
- Per‑page **Playwright journeys** (selectors, assertions)
- **A11y audit** (axe-core) + performance budget
- **Baseline history** per page + alerts (Slack/Email)
- **Auth harness** for SSO/MFA in staging
