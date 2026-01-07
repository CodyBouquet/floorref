// scripts/inject-social-meta.mjs
// Adds canonical + OpenGraph + Twitter meta tags to HTML files at build time.
// Run: node scripts/inject-social-meta.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const SITE_ORIGIN = "https://floorref.com";
const SITE_NAME = "Flooring Reference";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/assets/og-default.png`;

// What to process
const INCLUDE_DIRS = ["materials", "specs", "about", "contact", "legal", "search"];
const INCLUDE_ROOT_FILES = ["index.html"]; // keep it tight; do not include 404
const SKIP_DIRS = new Set(["assets", "data", "scripts", ".netlify", ".git", "node_modules"]);
const SKIP_FILES = new Set(["404.html"]);

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
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return `/${rel.replace(/index\.html$/, "")}`;
  return `/${rel}`;
}

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

function writeFile(p, s) {
  fs.writeFileSync(p, s, "utf8");
}

function escapeHtmlAttr(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : "";
}

function getMetaDescription(html) {
  const m1 = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  if (m1?.[1]) return m1[1].trim();
  const m2 = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
  if (m2?.[1]) return m2[1].trim();
  return "";
}

function removeExistingTag(html, kind, key) {
  // Remove existing og/twitter/canonical tags so we can re-insert cleanly
  if (kind === "canonical") {
    return html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>\s*/gi, "");
  }
  if (kind === "property") {
    const re = new RegExp(`<meta\\b[^>]*property=["']${key}["'][^>]*>\\s*`, "gi");
    return html.replace(re, "");
  }
  if (kind === "name") {
    const re = new RegExp(`<meta\\b[^>]*name=["']${key}["'][^>]*>\\s*`, "gi");
    return html.replace(re, "");
  }
  return html;
}

function injectIntoHead(html, tagsBlock) {
  const headClose = html.search(/<\/head\s*>/i);
  if (headClose === -1) return html; // no head? bail
  return html.slice(0, headClose) + tagsBlock + "\n" + html.slice(headClose);
}

function buildTags({ canonicalUrl, title, description, isHome }) {
  const ogType = isHome ? "website" : "article";

  // Keep it safe for attributes
  const t = escapeHtmlAttr(title || SITE_NAME);
  const d = escapeHtmlAttr(description || "Plain-English flooring specifications and terminology.");
  const u = escapeHtmlAttr(canonicalUrl);

  return [
    `<!-- Canonical + Open Graph -->`,
    `<link rel="canonical" href="${u}" />`,
    `<meta property="og:site_name" content="${escapeHtmlAttr(SITE_NAME)}" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${escapeHtmlAttr(DEFAULT_OG_IMAGE)}" />`,
    `<meta name="twitter:card" content="summary" />`,
  ].join("\n");
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

function main() {
  const files = collectHtmlFiles();
  let changed = 0;

  for (const filePath of files) {
    let html = readFile(filePath);

    const urlPath = fileToUrl(filePath);
    const canonicalUrl = `${SITE_ORIGIN}${urlPath}`;
    const title = getTitle(html);
    const description = getMetaDescription(html);
    const isHome = urlPath === "/";

    // Remove existing tags we control
    html = removeExistingTag(html, "canonical");
    html = removeExistingTag(html, "property", "og:site_name");
    html = removeExistingTag(html, "property", "og:type");
    html = removeExistingTag(html, "property", "og:title");
    html = removeExistingTag(html, "property", "og:description");
    html = removeExistingTag(html, "property", "og:url");
    html = removeExistingTag(html, "property", "og:image");
    html = removeExistingTag(html, "name", "twitter:card");

    const tagsBlock = "\n" + buildTags({ canonicalUrl, title, description, isHome }) + "\n";
    const out = injectIntoHead(html, tagsBlock);

    if (out !== html) {
      writeFile(filePath, out);
      changed++;
    }
  }

  console.log(`✅ Injected social meta into ${changed} file(s)`);
}

main();
