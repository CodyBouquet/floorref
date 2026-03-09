// scripts/build-search-index.mjs
// Auto-generates /search-index.json from your HTML files (static-site friendly).
// Run: node scripts/build-search-index.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root = parent of /scripts
const ROOT = path.resolve(__dirname, "..");

// Where to write (matches your site.js fetch("/search-index.json"))
const OUT_FILE = path.join(ROOT, "search-index.json");

// Folders to crawl (edit freely)
const INCLUDE_DIRS = [
  "materials"
];

// Specific root files to include (optional)
const INCLUDE_ROOT_FILES = ["index.html"];

// Files/dirs to skip
const SKIP_DIRS = new Set(["assets", "data", ".netlify", ".git", "node_modules"]);
const SKIP_FILES = new Set(["_headers", "_redirects", "robots.txt", "sitemap.xml", "ads.txt", "404.html"]);

const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","by","can","do","does","for","from","get","how",
  "if","in","into","is","it","its","of","on","or","our","that","the","their","this",
  "to","used","use","vs","what","when","where","which","why","with","without","you",
  "your","we","they","them","also","about","page","pages","site","reference","only",
  "information","explained","explains","common","including","overview"
]);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function stripTags(html) {
  // Remove scripts/styles then strip remaining tags.
  const noScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  return noScripts
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickFirstMatch(html, regex) {
  const m = html.match(regex);
  return m ? (m[1] || "").trim() : "";
}

function getMetaDescription(html) {
  // Handles: <meta name="description" content="...">
  // and:     <meta content="..." name="description">
  const m1 = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  if (m1?.[1]) return m1[1].trim();
  const m2 = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
  if (m2?.[1]) return m2[1].trim();
  return "";
}

function getTitle(html) {
  const t = pickFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) return decodeEntities(t);
  const h1 = pickFirstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return decodeEntities(stripTags(h1));
  return "";
}

function getH1(html) {
  const h1 = pickFirstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return h1 ? decodeEntities(stripTags(h1)) : "";
}

function getHeadings(html) {
  const headings = [];
  const re = /<(h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const txt = decodeEntities(stripTags(m[2] || ""));
    if (txt) headings.push(txt);
  }
  return headings;
}

function getFirstParagraph(html) {
  const p = pickFirstMatch(html, /<p[^>]*>([\s\S]*?)<\/p>/i);
  return p ? decodeEntities(stripTags(p)) : "";
}

function decodeEntities(s) {
  return String(s || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&nbsp;", " ");
}

function normalizeToken(t) {
  return String(t)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(text) {
  const norm = normalizeToken(text);
  if (!norm) return [];
  return norm.split(/\s+/).filter(Boolean);
}

function buildKeywords({ title, h1, headings, bodyText }) {
  const source = [title, h1, ...(headings || []), bodyText].join(" ");
  const tokens = tokenize(source);

  // word frequencies
  const freq = new Map();
  for (const tok of tokens) {
    if (tok.length < 3) continue;
    if (STOPWORDS.has(tok)) continue;
    freq.set(tok, (freq.get(tok) || 0) + 1);
  }

  // prioritize words that appear in title/h1/headings
  const boostSource = [title, h1, ...(headings || [])].join(" ");
  const boostTokens = new Set(tokenize(boostSource));
  for (const tok of boostTokens) {
    if (!freq.has(tok)) continue;
    freq.set(tok, freq.get(tok) + 3);
  }

  // sort by score
  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([w]) => w);

  // add a few phrase keywords from headings/title (bigrams)
  const phraseSource = [title, h1, ...(headings || [])].join(" ");
  const phraseTokens = tokenize(phraseSource);
  const phrases = [];
  for (let i = 0; i < phraseTokens.length - 1; i++) {
    const a = phraseTokens[i], b = phraseTokens[i + 1];
    if (STOPWORDS.has(a) || STOPWORDS.has(b)) continue;
    if (a.length < 3 || b.length < 3) continue;
    const phrase = `${a} ${b}`;
    // avoid duplicates / junk
    if (!phrases.includes(phrase)) phrases.push(phrase);
    if (phrases.length >= 6) break;
  }

  // Final: phrases first (more “human”), then top single words
  const out = [...phrases, ...topWords];

  // de-dupe
  return [...new Set(out)].slice(0, 18);
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

  // other html files keep .html (matches your existing patterns in /materials/)
  if (rel.endsWith(".html")) return `/${rel}`;

  return `/${rel}`;
}

function* walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dirPath, e.name);

    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full);
    } else {
      if (SKIP_FILES.has(e.name)) continue;
      yield full;
    }
  }
}

function collectHtmlFiles() {
  const files = [];

  // Include specified directories
  for (const d of INCLUDE_DIRS) {
    const p = path.join(ROOT, d);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      for (const f of walk(p)) {
        if (f.toLowerCase().endsWith(".html")) files.push(f);
      }
    }
  }

  // Include selected root files
  for (const f of INCLUDE_ROOT_FILES) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p);
  }

  return files;
}

function buildEntry(filePath) {
  const html = readText(filePath);

  const title = getTitle(html);
  const h1 = getH1(html);
  const headings = getHeadings(html);

  const metaDesc = getMetaDescription(html);
  const firstP = getFirstParagraph(html);

  // snippet: prefer meta description, else first paragraph, else fallback
  const snippet = (metaDesc || firstP || "").trim();

  // body text (for keyword derivation only, keep it short-ish)
  const bodyText = stripTags(html).slice(0, 8000);

  const keywords = buildKeywords({ title, h1, headings, bodyText });

  const url = fileToUrl(filePath);

  // Basic guardrails
  if (!title) return null;
  return { title, url, snippet, keywords };
}

function main() {
  const files = collectHtmlFiles();

  const entries = [];
  for (const f of files) {
    const entry = buildEntry(f);
    if (entry) entries.push(entry);
  }

  // Sort stable by URL
  entries.sort((a, b) => a.url.localeCompare(b.url));

  fs.writeFileSync(OUT_FILE, JSON.stringify(entries, null, 2) + "\n", "utf8");
  console.log(`✅ Wrote ${entries.length} entries to ${path.relative(ROOT, OUT_FILE)}`);
}

main();
