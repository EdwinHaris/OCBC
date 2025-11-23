// ci-run.js
// Trigger a TestSphere run (works both locally and on Render)

const fetch = (...args) =>
  import("node-fetch").then(({ default: f }) => f(...args));

(async () => {
  const base =
    process.env.TESTSPHERE_BASE || "http://127.0.0.1:8080";       // Render or local
  const url =
    process.env.TARGET_URL || `${base.replace(/\/$/, "")}/ocbc-demo/`;
  const token = process.env.TESTSPHERE_TOKEN;

  const endpoint = `${base.replace(/\/$/, "")}/api/run`;

  console.log(`🚀 Triggering TestSphere run for: ${url}`);
  console.log(`➡️  POST ${endpoint}`);

  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["x-testsphere-token"] = token;             // optional auth

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ url }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}\n${text}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    console.log("✅ Run started:", data);
  } catch (err) {
    console.error("❌ Failed to trigger run:", err.message || err);
    process.exit(1);
  }
})();
// // ci-run.js
// // Trigger a TestSphere CI run (works both locally and on Render)

// const fetch = (...args) =>
//   import("node-fetch").then(({ default: f }) => f(...args));

// (async () => {
//   const base =
//     process.env.TESTSPHERE_BASE || "http://127.0.0.1:8080"; // Render or local
//   const url =
//     process.env.TARGET_URL || `${base.replace(/\/$/, "")}/ocbc-demo/`;
//   const token = process.env.TESTSPHERE_TOKEN;

//   // ✅ Use the CI-only endpoint
//   const endpoint = `${base.replace(/\/$/, "")}/api/ci-run`;

//   console.log(`🚀 Triggering TestSphere CI run for: ${url}`);
//   console.log(`➡️  POST ${endpoint}`);

//   try {
//     const headers = { "Content-Type": "application/json" };

//     // ✅ This matches what /api/ci-run expects in server.js
//     if (token) {
//       headers["Authorization"] = `Bearer ${token}`;
//     }

//     const res = await fetch(endpoint, {
//       method: "POST",
//       headers,
//       body: JSON.stringify({ url }),
//     });

//     const text = await res.text();
//     if (!res.ok) {
//       throw new Error(`HTTP ${res.status} ${res.statusText}\n${text}`);
//     }

//     let data;
//     try {
//       data = JSON.parse(text);
//     } catch {
//       data = text;
//     }

//     console.log("✅ CI run started:", data);
//   } catch (err) {
//     console.error("❌ Failed to trigger CI run:", err.message || err);
//     process.exit(1);
//   }
// })();
