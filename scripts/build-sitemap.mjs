// scripts/build-sitemap.mjs
// Generates /sitemap.xml from your HTML files.
// Run: node scripts/build-sitemap.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const OUT_FILE = path.join(ROOT, "sitemap.xml");

// ✅ Your canonical site URL (set this!)
const SITE_ORIGIN = "https://floorref.com"; //

// Only include these folders in sitemap
const INCLUDE_DIRS = ["materials", "specs"];

// Root files to include (homepage only by default)
const INCLUDE_ROOT_FILES = ["index.html"];

// Skip directories everywhere
const SKIP_DIRS = new Set(["assets", "data", "scripts", ".netlify", ".git", "node_modules"]);

// Skip specific files (always)
const SKIP_FILES = new Set(["404.html"]);

// If you want to exclude URL prefixes too (extra safety)
const EXCLUDE_URL_PREFIXES = ["/search/", "/about/", "/contact/", "/legal/"];

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

function fileToUrl(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).join("/");

  // Root index.html -> "/"
  if (rel === "index.html") return "/";

  // Folder index.html -> "/folder/subfolder/"
  if (rel.endsWith("/index.html")) {
    const dir = rel.replace(/index\.html$/, "");
    return `/${dir}`;
  }

  // other html files keep .html (matches your /specs/*.html)
  return `/${rel}`;
}

function collectHtmlFiles() {
  const files = [];

  // Directories
  for (const d of INCLUDE_DIRS) {
    const p = path.join(ROOT, d);
    if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) continue;
    for (const f of walk(p)) {
      if (!f.toLowerCase().endsWith(".html")) continue;
      if (SKIP_FILES.has(path.basename(f))) continue;
      files.push(f);
    }
  }

  // Root files
  for (const f of INCLUDE_ROOT_FILES) {
    if (SKIP_FILES.has(f)) continue;
    const p = path.join(ROOT, f);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p);
  }

  return files;
}

function escapeXml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function main() {
  const files = collectHtmlFiles();

  const urls = files
    .map((f) => fileToUrl(f))
    .filter((u) => u && !EXCLUDE_URL_PREFIXES.some((p) => u.startsWith(p)));

  // De-dupe + sort
  const unique = [...new Set(urls)].sort((a, b) => a.localeCompare(b));

  const now = new Date().toISOString();

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    unique
      .map((u) => {
        const loc = `${SITE_ORIGIN}${u}`;
        return (
          `  <url>\n` +
          `    <loc>${escapeXml(loc)}</loc>\n` +
          `    <lastmod>${now}</lastmod>\n` +
          `  </url>\n`
        );
      })
      .join("") +
    `</urlset>\n`;

  fs.writeFileSync(OUT_FILE, xml, "utf8");
  console.log(`✅ Wrote ${unique.length} URLs to ${path.relative(ROOT, OUT_FILE)}`);
  if (SITE_ORIGIN.includes("YOUR-DOMAIN")) {
    console.warn("⚠️  Reminder: set SITE_ORIGIN to your real domain in scripts/build-sitemap.mjs");
  }
}

main();
