// scripts/build-search-index.mjs
// Generates /search-index.json from HTML files.
// Run: node scripts/build-search-index.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "search-index.json");

const INCLUDE_DIRS = ["materials"];
const INCLUDE_ROOT_FILES = ["index.html"];
const SKIP_DIRS = new Set(["assets", "data", ".netlify", ".git", "node_modules"]);
const SKIP_FILES = new Set(["_headers", "_redirects", "robots.txt", "sitemap.xml", "ads.txt", "404.html"]);

// Path segments to skip when building URL-derived keywords
const SKIP_PATH_SEGMENTS = new Set(["materials", "specs", "index", ""]);

// Flooring domain synonyms — if a token matches a key, add the values as extra keywords
const DOMAIN_SYNONYMS = new Map([
  ["lvt",           ["luxury vinyl", "vinyl plank", "luxury vinyl tile", "luxury vinyl plank"]],
  ["lvp",           ["luxury vinyl plank", "vinyl plank", "lvt"]],
  ["spc",           ["rigid core", "stone plastic composite"]],
  ["wpc",           ["wood plastic composite", "flexible core"]],
  ["rigid core",    ["spc", "stone plastic composite"]],
  ["wear layer",    ["mil thickness", "wear layer mil"]],
  ["janka",         ["hardness", "janka hardness", "janka rating"]],
  ["ac rating",     ["abrasion class", "wear rating", "ac class"]],
  ["face weight",   ["pile weight", "carpet weight", "oz per sq yd"]],
  ["twist level",   ["twist per inch", "tpi", "yarn twist"]],
  ["pile height",   ["pile depth", "nap height"]],
  ["hardwood",      ["solid hardwood", "real wood", "wood flooring"]],
  ["engineered",    ["engineered hardwood", "engineered wood", "multi-ply"]],
  ["laminate",      ["laminate flooring", "hdf", "fiberboard"]],
  ["underlayment",  ["underlay", "foam pad", "attached pad"]],
  ["click lock",    ["floating floor", "snap lock", "click install"]],
  ["glue down",     ["glue-down", "adhesive install", "direct glue"]],
  ["carpet tile",   ["modular carpet", "interface", "carpet squares"]],
  ["broadloom",     ["wall to wall", "stretch-in carpet", "roll carpet"]],
]);

const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","by","can","do","does","don","for","from",
  "get","how","if","in","into","is","it","its","not","of","on","or","our",
  "that","the","their","this","to","used","use","vs","what","when","where",
  "which","why","with","without","you","your","we","they","them","also","about",
  "page","pages","site","reference","only","information","explained","explains",
  "common","including","overview","often","usually","most","some","many","any",
  "more","less","than","just","so","no","yes","all","both","each","few","same",
  "own","such","then","than","too","very","will","was","were","been","being",
  "have","has","had","may","might","would","could","should","shall","must",
  "floor","flooring","start","type","types","people","room","choosing","choose",
  "see","look","find","help","read","note","below","above","here","there","like",
  "need","want","know","make","take","give","come","go","way","time","good",
  "best","right","first","last","new","old","high","low","large","small",
  "different","other","another","next","back","well","even","still","already",
  "always","never","often","sometimes","usually","generally","typically",
  "important","useful","simple","basic","key","main","major","minor",
  "doesn","don't","isn","isn't","aren","aren't","wasn","wasn't","weren",
  "can't","cannot","won't","wouldn","couldn","shouldn","mustn",
  "tell","says","means","meaning","refers","called","known","defined",
  "necessarily","commonly","associated","typically","generally","usually",
  "describes","describe","orientation","method","methods","process",
  "universally","primarily","directly","indirectly","essentially","simply",
  "certain","particular","specific","various","several","multiple",
  "include","includes","including","such","per","between","among",
  "because","since","while","although","however","therefore","thus",
  "affect","affects","affected","effect","effects","impacts","impact",
]);

// ── HTML utilities ────────────────────────────────────────────────────────────

function stripTags(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickFirstMatch(html, regex) {
  const m = html.match(regex);
  return m ? (m[1] || "").trim() : "";
}

function decodeEntities(s) {
  return String(s || "")
    .replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"').replaceAll("&#039;", "'").replaceAll("&nbsp;", " ");
}

function getMetaDescription(html) {
  const m1 = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  if (m1?.[1]) return m1[1].trim();
  const m2 = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
  return m2?.[1]?.trim() || "";
}

function getTitle(html) {
  const t = pickFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) return decodeEntities(t);
  const h1 = pickFirstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return h1 ? decodeEntities(stripTags(h1)) : "";
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

// Extract FAQ Q&A from JSON-LD schema on the page
function extractFaqSchema(html) {
  const faqs = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj["@type"] === "FAQPage" && Array.isArray(obj.mainEntity)) {
        for (const q of obj.mainEntity) {
          if (q["@type"] === "Question") {
            faqs.push({
              question: String(q.name || ""),
              answer: String(q.acceptedAnswer?.text || ""),
            });
          }
        }
      }
    } catch { /* malformed JSON-LD, skip */ }
  }
  return faqs;
}

// ── Keyword building ──────────────────────────────────────────────────────────

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

// URL path → keyword phrases
// /materials/lvt/rigid-core/specs/construction/wear-layer.html
// → ["lvt", "rigid core", "construction", "wear layer"]
function urlToKeywords(urlPath) {
  const segments = urlPath
    .replace(/\.html$/, "")
    .split("/")
    .filter(s => s && !SKIP_PATH_SEGMENTS.has(s));

  return segments.map(s => s.replace(/-/g, " ")).filter(s => !STOPWORDS.has(s));
}

// Expand known domain terms → add synonyms
function expandSynonyms(phrases) {
  const extras = [];
  for (const phrase of phrases) {
    const p = phrase.toLowerCase();
    const syns = DOMAIN_SYNONYMS.get(p);
    if (syns) extras.push(...syns);
    // Also check if phrase contains a key
    for (const [key, vals] of DOMAIN_SYNONYMS) {
      if (p.includes(key) && !extras.includes(...vals)) {
        extras.push(...vals);
      }
    }
  }
  return extras;
}

// Extract spec-value patterns like "12 mil", "20 mil", "6mm", "8 mm", "40 oz"
function extractSpecValues(text) {
  const values = [];
  const re = /\b(\d+(?:\.\d+)?)\s*(mil|mm|oz|lbs?|psi|inch(?:es)?|in\b|sq\s*yd|g\/m2|g\/m²|tpi)\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = `${m[1]} ${m[2].toLowerCase()}`;
    if (!values.includes(v)) values.push(v);
  }
  return values;
}

// Build final keywords array for one entry
function buildKeywords({ title, h1, headings, faqs, bodyText, urlPath }) {
  const all = [];

  // 1. URL path tokens (highest signal — encode category + spec name)
  const urlTokens = urlToKeywords(urlPath);
  all.push(...urlTokens);

  // 2. Synonyms for URL tokens
  all.push(...expandSynonyms(urlTokens));

  // 3. Title and h1 tokens
  const titleTokens = tokenize(`${title} ${h1}`);
  all.push(...titleTokens);

  // 4. FAQ question phrases — search users ask questions, match them
  for (const { question, answer } of faqs) {
    // Whole question as a phrase (great for partial matching)
    const qClean = decodeEntities(question).toLowerCase();
    if (qClean && qClean.length < 120) all.push(qClean);
    // Key nouns from question + first sentence of answer only
    all.push(...tokenize(question));
    const firstSentence = answer.split(/[.!?]/)[0] || "";
    all.push(...tokenize(firstSentence).slice(0, 5));
  }

  // 5. Heading tokens
  for (const h of headings) all.push(...tokenize(h));

  // 6. Spec values found in body
  all.push(...extractSpecValues(bodyText));

  // 7. Synonyms for all collected phrases
  const phrases = [...new Set(all.filter(k => k.includes(" ")))];
  all.push(...expandSynonyms(phrases));

  // De-duplicate, preserve insertion order
  const seen = new Set();
  const out = [];
  for (const k of all) {
    const key = k.toLowerCase().trim();
    if (key && key.length >= 2 && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }

  return out.slice(0, 30);
}

// ── File traversal ────────────────────────────────────────────────────────────

function fileToUrl(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return `/${rel.replace(/index\.html$/, "")}`;
  return `/${rel}`;
}

function* walk(dirPath) {
  for (const e of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(full);
    } else {
      if (!SKIP_FILES.has(e.name)) yield full;
    }
  }
}

function collectHtmlFiles() {
  const files = [];
  for (const d of INCLUDE_DIRS) {
    const p = path.join(ROOT, d);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      for (const f of walk(p)) {
        if (f.toLowerCase().endsWith(".html")) files.push(f);
      }
    }
  }
  for (const f of INCLUDE_ROOT_FILES) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p);
  }
  return files;
}

// ── Entry builder ─────────────────────────────────────────────────────────────

function buildEntry(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  const urlPath = fileToUrl(filePath);

  const title = getTitle(html);
  if (!title) return null;

  const h1 = getH1(html);
  const headings = getHeadings(html);
  const faqs = extractFaqSchema(html);
  const metaDesc = getMetaDescription(html);
  const bodyText = stripTags(html).slice(0, 10000);

  // Snippet: meta description is best; fall back to first FAQ answer
  const snippet =
    metaDesc ||
    (faqs[0]?.answer ? faqs[0].answer.slice(0, 200) : "") ||
    bodyText.slice(0, 180);

  const keywords = buildKeywords({ title, h1, headings, faqs, bodyText, urlPath });

  return { title, url: urlPath, snippet: snippet.trim(), keywords };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const files = collectHtmlFiles();
  const entries = [];

  for (const f of files) {
    const entry = buildEntry(f);
    if (entry) entries.push(entry);
  }

  entries.sort((a, b) => a.url.localeCompare(b.url));
  fs.writeFileSync(OUT_FILE, JSON.stringify(entries, null, 2) + "\n", "utf8");
  console.log(`✅ Wrote ${entries.length} entries to ${path.relative(ROOT, OUT_FILE)}`);
}

main();
