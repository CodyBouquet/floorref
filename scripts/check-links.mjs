// scripts/check-links.mjs
// Fails the build if any internal links point to missing pages/files.
// Run: node scripts/check-links.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// What to scan (adjust if you want)
const INCLUDE_DIRS = ["materials", "specs"];
const INCLUDE_ROOT_FILES = ["index.html"];

// Skip crawling these directories
const SKIP_DIRS = new Set(["assets", "data", "scripts", ".netlify", ".git", "node_modules"]);

// Ignore these href patterns
const IGNORE_HREF_PREFIXES = [
  "mailto:",
  "tel:",
  "javascript:",
];

// Ignore these URL path prefixes (optional; keep minimal to avoid false positives)
const IGNORE_PATH_PREFIXES = [
  // If you link to search results with query strings, keep this:
  // "/search/",
];

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

// Convert a file path to its site URL path (similar to your other scripts)
function fileToUrl(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).join("/");

  if (rel === "index.html") return "/";

  if (rel.endsWith("/index.html")) {
    const dir = rel.replace(/index\.html$/, "");
    return `/${dir}`; // already ends with /
  }

  return `/${rel}`; // keep .html for non-index pages
}

function stripQueryAndHash(href) {
  // remove ?query and #hash
  const q = href.indexOf("?");
  const h = href.indexOf("#");
  const cut = (q === -1) ? h : (h === -1 ? q : Math.min(q, h));
  return cut === -1 ? href : href.slice(0, cut);
}

function isExternalHref(href) {
  return /^https?:\/\//i.test(href) || /^\/\//.test(href);
}

function getHrefTargets(html) {
  // Very small anchor href extractor (good enough for static HTML)
  // Matches href="..." and href='...'
  const hrefs = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = (m[2] || "").trim();
    if (href) hrefs.push(href);
  }
  return hrefs;
}

function exists(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function urlPathToCandidateFiles(urlPath) {
  // urlPath is like "/materials/lvt/" or "/specs/wear-layer.html"
  // Return an array of possible filesystem targets.
  if (!urlPath.startsWith("/")) return [];

  // Normalize: ensure leading slash, collapse double slashes
  let p = urlPath.replace(/\/{2,}/g, "/");

  // Root
  if (p === "/") return [path.join(ROOT, "index.html")];

  // If ends with "/" -> directory index.html
  if (p.endsWith("/")) {
    return [path.join(ROOT, p.slice(1), "index.html")];
  }

  // If has extension -> direct file
  if (path.extname(p)) {
    return [path.join(ROOT, p.slice(1))];
  }

  // No trailing slash and no extension:
  // could be "/x/y/" (index) or "/x/y.html"
  return [
    path.join(ROOT, p.slice(1) + ".html"),
    path.join(ROOT, p.slice(1), "index.html"),
  ];
}

function resolveHrefToPathname(href, pageUrlPath) {
  // Ignore empty or just hashes
  if (!href || href === "#") return null;

  // Ignore mailto/tel/etc
  for (const pre of IGNORE_HREF_PREFIXES) {
    if (href.toLowerCase().startsWith(pre)) return null;
  }

  // Ignore external
  if (isExternalHref(href)) return null;

  // Strip query/hash for file existence checking
  const clean = stripQueryAndHash(href);
  if (!clean) return null;

  // Ignore special cases
  if (clean.startsWith("#")) return null;

  // Resolve relative -> absolute pathname using a fake origin
  const base = new URL(pageUrlPath, "https://floorref.com");
  const resolved = new URL(clean, base);
  const pathname = resolved.pathname;

  // Optional ignore by path prefix
  if (IGNORE_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return pathname;
}

function collectHtmlFiles() {
  const files = [];

  for (const d of INCLUDE_DIRS) {
    const p = path.join(ROOT, d);
    if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) continue;
    for (const f of walk(p)) {
      if (f.toLowerCase().endsWith(".html")) files.push(f);
    }
  }

  for (const f of INCLUDE_ROOT_FILES) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p);
  }

  return files;
}

function main() {
  const htmlFiles = collectHtmlFiles();
  const broken = [];

  for (const filePath of htmlFiles) {
    const html = fs.readFileSync(filePath, "utf8");
    const pageUrlPath = fileToUrl(filePath);

    const hrefs = getHrefTargets(html);

    for (const href of hrefs) {
      const pathname = resolveHrefToPathname(href, pageUrlPath);
      if (!pathname) continue;

      const candidates = urlPathToCandidateFiles(pathname);

      // If no candidates, skip
      if (!candidates.length) continue;

      const ok = candidates.some(exists);

      if (!ok) {
        broken.push({
          fromFile: path.relative(ROOT, filePath).split(path.sep).join("/"),
          fromUrl: pageUrlPath,
          href,
          resolvedPath: pathname,
          tried: candidates.map((p) => path.relative(ROOT, p).split(path.sep).join("/")),
        });
      }
    }
  }

  if (broken.length) {
    console.error(`\n❌ Broken internal links found: ${broken.length}\n`);
    for (const b of broken.slice(0, 200)) {
      console.error(`- From: ${b.fromFile} (${b.fromUrl})`);
      console.error(`  Link: ${b.href}`);
      console.error(`  Resolved: ${b.resolvedPath}`);
      console.error(`  Tried: ${b.tried.join(" OR ")}`);
      console.error("");
    }
    if (broken.length > 200) {
      console.error(`(Showing first 200 of ${broken.length})\n`);
    }
    process.exit(1); // <-- fail deploy
  }

  console.log(`✅ Link check passed (${htmlFiles.length} pages scanned)`);
}

main();
