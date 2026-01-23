// /assets/js/site.js

document.addEventListener("DOMContentLoaded", () => {
  injectHeader();
  injectFooter();
  updateYear();
  initSiteSearch();
  initMobileNavToggle(); // ✅ works for injected OR hardcoded header
});

/* -------------------------
   Mobile nav toggle (injected + hardcoded)
-------------------------- */

function initMobileNavToggle() {
  const btn = document.getElementById("navBtn");
  const nav = document.getElementById("mobileNav");
  if (!btn || !nav) return;

  // prevent double-binding if called more than once
  if (btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", () => {
    const open = !nav.classList.contains("hidden");
    nav.classList.toggle("hidden", open);
    btn.setAttribute("aria-expanded", String(!open));
  });
}

/* -------------------------
   Header / Footer injection
-------------------------- */

function injectHeader() {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  mount.innerHTML = `
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
        <a href="/" class="font-semibold text-lg shrink-0">Floor Ref</a>

        <!-- Desktop search -->
        <div class="hidden md:block relative w-full max-w-md">
          <label class="sr-only" for="siteSearch">Search FloorRef</label>
          <input
            id="siteSearch"
            type="search"
            placeholder="Search specs, materials, terms…"
            autocomplete="off"
            class="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <div
            id="siteSearchResults"
            class="absolute left-0 right-0 mt-2 hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
            role="listbox"
            aria-label="Search results"
          ></div>
        </div>

        <nav class="hidden sm:flex gap-4 text-sm shrink-0">
          <a href="/materials/lvt/" class="text-slate-600 hover:text-slate-900">LVT</a>
          <a href="/materials/laminate/" class="text-slate-600 hover:text-slate-900">Laminate</a>
          <a href="/materials/hardwood/" class="text-slate-600 hover:text-slate-900">Hardwood</a>
          <a href="/materials/carpet/" class="text-slate-600 hover:text-slate-900">Carpet</a>
        </nav>

        <button
          id="navBtn"
          type="button"
          class="sm:hidden inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 shrink-0"
          aria-expanded="false"
          aria-controls="mobileNav"
        >
          Menu
        </button>
      </div>

      <!-- Mobile nav + search -->
      <div id="mobileNav" class="hidden sm:hidden border-t border-slate-200 bg-white">
        <div class="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-3 text-sm">

          <div class="relative">
            <label class="sr-only" for="siteSearchMobile">Search FloorRef</label>
            <input
              id="siteSearchMobile"
              type="search"
              placeholder="Search specs, materials, terms…"
              autocomplete="off"
              class="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <div
              id="siteSearchResultsMobile"
              class="absolute left-0 right-0 mt-2 hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
              role="listbox"
              aria-label="Search results"
            ></div>
          </div>

          <a class="text-slate-700 hover:text-slate-900" href="/materials/lvt/">LVT</a>
          <a class="text-slate-700 hover:text-slate-900" href="/materials/laminate/">Laminate</a>
          <a class="text-slate-700 hover:text-slate-900" href="/materials/hardwood/">Hardwood</a>
          <a class="text-slate-700 hover:text-slate-900" href="/materials/carpet/">Carpet</a>
        </div>
      </div>
    </header>
  `;

  // ✅ Do not bind click handlers here anymore.
  // initMobileNavToggle() runs after injection and also supports hardcoded headers.
}

function injectFooter() {
  const mount = document.getElementById("site-footer");
  if (!mount) return;

  mount.innerHTML = `
    <footer class="border-t border-slate-200 bg-white">
      <div class="mx-auto max-w-6xl px-4 py-8 text-sm text-slate-600">
        <div class="flex flex-wrap gap-4">
          <a href="/about/about.html" class="hover:text-slate-900">About</a>
          <a href="/contact/contact-us.html" class="hover:text-slate-900">Contact</a>
          <a href="/legal/privacy-policy.html" class="hover:text-slate-900">Privacy Policy</a>
        </div>
        <p class="mt-4 text-xs text-slate-500">
          © <span id="year"></span> Flooring Reference
        </p>
      </div>
    </footer>
  `;
}

function updateYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = new Date().getFullYear();
}

/* -------------------------
   Site Search (static index)
-------------------------- */

let __siteIndex = null;

async function loadSiteIndex() {
  if (__siteIndex) return __siteIndex;

  const cached = sessionStorage.getItem("floorref_site_index_v1");
  if (cached) {
    __siteIndex = JSON.parse(cached);
    return __siteIndex;
  }

  const res = await fetch("/search-index.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`search-index.json fetch failed: ${res.status}`);
  __siteIndex = await res.json();

  sessionStorage.setItem("floorref_site_index_v1", JSON.stringify(__siteIndex));
  return __siteIndex;
}

function initSiteSearch() {
  const inputDesktop = document.getElementById("siteSearch");
  const resultsDesktop = document.getElementById("siteSearchResults");
  const inputMobile = document.getElementById("siteSearchMobile");
  const resultsMobile = document.getElementById("siteSearchResultsMobile");

  if (!inputDesktop || !resultsDesktop) return;

  wireSearchBox(inputDesktop, resultsDesktop);
  if (inputMobile && resultsMobile) wireSearchBox(inputMobile, resultsMobile);

  // Close dropdown on click outside
  document.addEventListener("click", (e) => {
    const t = e.target;
    const clickedInside =
      inputDesktop.contains(t) || resultsDesktop.contains(t) ||
      (inputMobile && inputMobile.contains(t)) ||
      (resultsMobile && resultsMobile.contains(t));
    if (!clickedInside) {
      hideResults(resultsDesktop);
      if (resultsMobile) hideResults(resultsMobile);
    }
  });

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideResults(resultsDesktop);
      if (resultsMobile) hideResults(resultsMobile);
    }
  });
}

function wireSearchBox(inputEl, resultsEl) {
  let lastQuery = "";

  inputEl.addEventListener("input", async () => {
    const q = (inputEl.value || "").trim();
    lastQuery = q;

    if (q.length < 2) {
      hideResults(resultsEl);
      return;
    }

    try {
      const index = await loadSiteIndex();
      if (lastQuery !== q) return; // stale render guard

      const hits = searchIndex(index, q).slice(0, 8);
      renderResults(resultsEl, hits, q, false);
    } catch (err) {
      console.error(err);
      renderResults(resultsEl, [], q, true);
    }
  });

  inputEl.addEventListener("focus", () => {
    if ((inputEl.value || "").trim().length >= 2) {
      resultsEl.classList.remove("hidden");
    }
  });

  // Enter -> go to results page
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = (inputEl.value || "").trim();
      if (q.length >= 2) {
        window.location.href = `/search/?q=${encodeURIComponent(q)}`;
      }
    }
  });
}

function searchIndex(index, query) {
  const q = query.toLowerCase();

  return index
    .map((item) => {
      const title = (item.title || "").toLowerCase();
      const url = (item.url || "").toLowerCase();
      const keywords = (item.keywords || []).map(k => String(k || "").toLowerCase());

      let score = 0;
      if (title.includes(q)) score += 4;
      if (keywords.some(k => k.includes(q))) score += 3;
      if (url.includes(q)) score += 1;

      // extra: partial token matches
      const qTokens = normalize(query).split(/\s+/).filter(Boolean);
      if (qTokens.length) {
        const hay = [item.title || "", ...(item.keywords || [])].join(" ").toLowerCase();
        const tokenHits = qTokens.filter(t => hay.includes(t)).length;
        score += Math.min(2, tokenHits); // small bump
      }

      return { ...item, __score: score };
    })
    .filter(x => x.__score > 0)
    .sort((a, b) => b.__score - a.__score || (a.title || "").localeCompare(b.title || ""));
}

function renderResults(resultsEl, hits, query, hadError = false) {
  if (hadError) {
    resultsEl.innerHTML = `
      <div class="px-4 py-3 text-sm text-slate-600">
        Search is temporarily unavailable.
      </div>
    `;
    resultsEl.classList.remove("hidden");
    return;
  }

  // No hits: show Did you mean?
  if (!hits.length) {
    const index = __siteIndex || [];
    const suggestions = getDidYouMeanSuggestions(index, query, 3);

    if (suggestions.length) {
      resultsEl.innerHTML = `
        <div class="px-4 py-2 text-xs text-slate-500 border-b border-slate-100">
          Did you mean:
        </div>
        ${suggestions.map(s => `
          <a href="${s.url}" class="block px-4 py-3 hover:bg-slate-50">
            <div class="text-sm font-semibold text-slate-900">${escapeHtml(s.title)}</div>
            <div class="mt-1 text-xs text-slate-600">
              ${escapeHtml(s.snippet || bestKeywordSnippet(s, query))}
            </div>
          </a>
        `).join("")}
      `;
      resultsEl.classList.remove("hidden");
      return;
    }

    resultsEl.innerHTML = `
      <div class="px-4 py-3 text-sm text-slate-600">
        No results for <span class="font-semibold">${escapeHtml(query)}</span>.
      </div>
    `;
    resultsEl.classList.remove("hidden");
    return;
  }

  // Normal hits: show title + snippet (NOT URL)
  resultsEl.innerHTML = hits
    .map((h) => `
      <a href="${h.url}" class="block px-4 py-3 hover:bg-slate-50">
        <div class="text-sm font-semibold text-slate-900">${escapeHtml(h.title)}</div>
        <div class="mt-1 text-xs text-slate-600">
          ${escapeHtml(h.snippet || bestKeywordSnippet(h, query))}
        </div>
      </a>
    `)
    .join("");

  resultsEl.classList.remove("hidden");
}

function hideResults(resultsEl) {
  if (!resultsEl) return;
  resultsEl.classList.add("hidden");
}

/* -------------------------
   Did you mean? helpers
-------------------------- */

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Levenshtein distance (tiny implementation) for typo tolerance
function levenshtein(a, b) {
  a = normalize(a);
  b = normalize(b);
  if (!a || !b) return Math.max(a.length, b.length);

  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      // ✅ FIXED: compare against b[j - 1], not b[i - 1]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function getDidYouMeanSuggestions(index, query, limit = 3) {
  const q = normalize(query);
  if (q.length < 2) return [];

  return (index || [])
    .map(item => {
      const title = item.title || "";
      const keywords = (item.keywords || []).join(" ");
      const hay = `${title} ${keywords}`.trim();

      // Combine: word overlap + small typo tolerance
      const overlap = overlapScore(q, hay); // 0..1
      const dist = levenshtein(q, title);
      const typoBonus = dist <= 2 ? 0.25 : (dist <= 3 ? 0.15 : 0);

      const score = overlap + typoBonus;
      return { item, score };
    })
    .filter(x => x.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.item);
}

function overlapScore(q, hay) {
  const qWords = normalize(q).split(" ").filter(Boolean);
  const hWords = normalize(hay).split(" ").filter(Boolean);
  if (!qWords.length || !hWords.length) return 0;

  let hits = 0;
  for (const w of qWords) {
    if (hWords.some(hw => hw.includes(w) || w.includes(hw))) hits++;
  }
  return hits / Math.max(qWords.length, hWords.length);
}

function bestKeywordSnippet(item, query) {
  // Fallback until snippets are filled everywhere
  const q = normalize(query);
  const kws = (item.keywords || []).map(k => String(k || ""));
  const hit = kws.find(k => normalize(k).includes(q));
  if (hit) return hit;
  return kws.length ? kws.slice(0, 3).join(", ") : "";
}

/* -------------------------
   Utilities
-------------------------- */

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
