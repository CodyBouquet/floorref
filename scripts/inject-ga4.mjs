// scripts/inject-ga4.mjs
// Injects the GA4 gtag snippet into HTML files at build time.
// Idempotent: won't duplicate. If present, it can update the ID.
// Run: node scripts/inject-ga4.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// ✅ Your GA4 Measurement ID
const GA_ID = "G-KJPSMV89KV";

// Which folders/pages to modify:
const INCLUDE_DIRS = ["materials", "specs", "about", "contact", "legal", "search"];
const INCLUDE_ROOT_FILES = ["index.html", "404.html"]; // include 404 if you want tracking there

// Skip these directories entirely
const SKIP_DIRS = new Set(["assets", "data", "scripts", ".netlify", ".git", "node_modules"]);

function* walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dirPath, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function write(p, s) {
  fs.writeFileSync(p, s, "utf8");
}

function collectHtmlFiles() {
  const files = [];

  for (const d of INCLUDE_DIRS) {
    const dir = path.join(ROOT, d);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    for (const f of walk(dir)) {
      if (f.toLowerCase().endsWith(".html")) files.push(f);
    }
  }

  for (const f of INCLUDE_ROOT_FILES) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p);
  }

  return files;
}

// Remove any existing gtag snippet so we can re-insert cleanly.
// This prevents duplicates and lets us update GA_ID later.
function stripExistingGtag(html) {
  // Remove the external script tag:
  html = html.replace(
    /<script\b[^>]*src=["']https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-[A-Z0-9]+["'][^>]*>\s*<\/script>\s*/gi,
    ""
  );

  // Remove inline gtag init blocks (common patterns)
  html = html.replace(
    /<script>\s*window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]\s*;\s*function\s+gtag\(\)\s*\{\s*dataLayer\.push\(arguments\)\s*;\s*\}\s*gtag\(\s*['"]js['"]\s*,\s*new Date\(\)\s*\)\s*;\s*gtag\(\s*['"]config['"]\s*,\s*['"]G-[A-Z0-9]+['"]\s*\)\s*;\s*<\/script>\s*/gi,
    ""
  );

  // Remove a more flexible inline block that contains gtag('config','G-...')
  html = html.replace(
    /<script>\s*[\s\S]*?gtag\(\s*['"]config['"]\s*,\s*['"]G-[A-Z0-9]+['"]\s*\)\s*;?[\s\S]*?<\/script>\s*/gi,
    (match) => {
      // Only remove if it looks like a GA gtag bootstrap (has dataLayer + gtag definition)
      const looksLikeGtag =
        /googletagmanager\.com\/gtag\/js/i.test(match) ||
        /window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]/i.test(match) ||
        /function\s+gtag\s*\(\)/i.test(match);
      return looksLikeGtag ? "" : match;
    }
  );

  return html;
}

function buildSnippet() {
  return `
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA_ID}');
</script>
`.trim();
}

function injectIntoHead(html, snippet) {
  const headOpenMatch = html.match(/<head\b[^>]*>/i);
  if (!headOpenMatch) return null;

  const headOpen = headOpenMatch[0];
  const idx = html.indexOf(headOpen);
  if (idx === -1) return null;

  const insertPos = idx + headOpen.length;

  return (
    html.slice(0, insertPos) +
    "\n  " +
    snippet.replace(/\n/g, "\n  ") +
    "\n" +
    html.slice(insertPos)
  );
}

function main() {
  const files = collectHtmlFiles();
  const snippet = buildSnippet();

  let changed = 0;

  for (const filePath of files) {
    const before = read(filePath);

    // Strip any existing GA bootstrap we recognize
    let html = stripExistingGtag(before);

    // If it already contains *this* GA_ID somewhere else, we still normalize by injecting once
    const after = injectIntoHead(html, snippet);

    if (!after) continue;

    if (after !== before) {
      write(filePath, after);
      changed++;
    }
  }

  console.log(`✅ GA4 injected/normalized in ${changed} file(s) (ID: ${GA_ID})`);
}

main();
