// scripts/build-top-pages-from-ga4.mjs
// Builds /data/top-pages.json using GA4 pagePath view data.
// Requires env:
//  - GA4_PROPERTY_ID (number, e.g. 123456789)
//  - GA4_SERVICE_ACCOUNT_JSON (service account json string)
// Optional env:
//  - TOP_PAGES_LIMIT (default 24)
//  - TOP_PAGES_DAYS (default 7)

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const SA_JSON = process.env.GA4_SERVICE_ACCOUNT_JSON;

const TOP_PAGES_LIMIT = Number(process.env.TOP_PAGES_LIMIT || 300);
const TOP_PAGES_DAYS = Number(process.env.TOP_PAGES_DAYS || 7);

if (!PROPERTY_ID) {
  console.error("Missing env GA4_PROPERTY_ID");
  process.exit(1);
}
if (!SA_JSON) {
  console.error("Missing env GA4_SERVICE_ACCOUNT_JSON");
  process.exit(1);
}

const SEARCH_INDEX_PATH = path.join(ROOT, "search-index.json");
const OUT_PATH = path.join(ROOT, "data", "top-pages.json");

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt({ client_email, private_key, scope }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(private_key);
  return `${unsigned}.${base64url(signature)}`;
}

async function getAccessToken(serviceAccount) {
  const jwt = signJwt({
    client_email: serviceAccount.client_email,
    private_key: serviceAccount.private_key,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
  });

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${t}`);
  }

  const json = await res.json();
  return json.access_token;
}

function normalizePath(p) {
  // Normalize GA pagePath and site URLs to match your search-index style.
  // - strip query/hash
  // - ensure leading slash
  // - collapse double slashes
  // - keep trailing slash if present (materials)
  // - keep .html for specs files
  let out = String(p || "").trim();
  if (!out) return "";

  out = out.split("?")[0].split("#")[0];
  if (!out.startsWith("/")) out = "/" + out;
  out = out.replace(/\/{2,}/g, "/");

  // canonicalize: "/index.html" -> "/"
  if (out === "/index.html") out = "/";

  // canonicalize materials index.html -> folder
  out = out.replace(/\/index\.html$/i, "/");

  return out;
}

function loadSearchIndex() {
  if (!fs.existsSync(SEARCH_INDEX_PATH)) {
    throw new Error(`Missing ${SEARCH_INDEX_PATH}. Run your search index build first.`);
  }
  const raw = fs.readFileSync(SEARCH_INDEX_PATH, "utf8");
  const idx = JSON.parse(raw);

  // Map normalized URL -> entry
  const map = new Map();
  for (const item of idx) {
    const u = normalizePath(item.url);
    map.set(u, item);
  }
  return map;
}

async function runReport(accessToken) {
  // GA4 Data API
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`;

  const end = "today";
  const start = `${TOP_PAGES_DAYS}daysAgo`;

  // screenPageViews is typically what you want for “most used”
  const payload = {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }],
    orderBys: [
      { metric: { metricName: "screenPageViews" }, desc: true }
    ],
    limit: TOP_PAGES_LIMIT,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GA4 runReport failed: ${res.status} ${t}`);
  }

  return res.json();
}

function buildTopPages(gaRows, indexMap) {
  const items = [];

  // Exact paths we never want to show
  const BLOCKED_EXACT = new Set([
    "/",              // home
    "/about",
    "/about/",
    "/contact",
    "/contact/",
    "/legal",
    "/legal/",
    "/search",
    "/search/",
    "/404.html",
  ]);

  // Sections we never want to show (and their children)
  const BLOCKED_PREFIXES = [
    "/about/",
    "/contact/",
    "/legal/",
    "/search/",
  ];

  for (const row of gaRows) {
    const pagePath = row.dimensionValues?.[0]?.value || "";
    const viewsStr = row.metricValues?.[0]?.value || "0";

    const url = normalizePath(pagePath);
    const views = Number(viewsStr) || 0;

    if (!url) continue;

    // ❌ Exclusions
    if (BLOCKED_EXACT.has(url)) continue;
    if (BLOCKED_PREFIXES.some(prefix => url.startsWith(prefix))) continue;

    // Only include pages that exist in the search index
    const match = indexMap.get(url);
    if (!match) continue;

    items.push({
      title: match.title,
      url: match.url,
      blurb: match.snippet || match.blurb || "",
      score: views,
    });
  }

  // Sort by usage
  items.sort((a, b) => b.score - a.score);

  return items;
}

async function main() {
  const serviceAccount = JSON.parse(SA_JSON);

  const indexMap = loadSearchIndex();

  const token = await getAccessToken(serviceAccount);
  const report = await runReport(token);

  const rows = report.rows || [];
  const topPages = buildTopPages(rows, indexMap);

  // Ensure output dir exists
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

  fs.writeFileSync(OUT_PATH, JSON.stringify(topPages, null, 2) + "\n", "utf8");
  console.log(`✅ Wrote ${topPages.length} items to data/top-pages.json (last ${TOP_PAGES_DAYS} days)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
