// The wiki: one script renders every page from data/wiki.json. The page kind and key come
// from <body data-page data-key>; links are relative to <html data-root>.
const ROOT = document.documentElement.dataset.root || "";
const PAGE = document.body.dataset.page, KEY = document.body.dataset.key;
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const U = {  // a secret item's page (moo-<hash>-<n>) is its card on the secret page
  item: s => s.startsWith("moo-") ? mooHref(s.split("-")[1]) : `${ROOT}item/${s}.html`, set: s => `${ROOT}set/${s}.html`, boss: s => `${ROOT}boss/${s}.html`,
  guide: s => `${ROOT}guide/${s}.html`, skill: s => `${ROOT}skill/${s}.html`, tool: s => `${ROOT}tools/${s}.html`, page: s => `${ROOT}${s}.html`,
  db: q => `${ROOT}items.html${q ? "?" + q : ""}`, art: p => ROOT + p,
  search: (q, k) => `${ROOT}search.html?q=${encodeURIComponent(q)}${k ? "&k=" + k : ""}`,
};
const DESIGN = ROOT + "design.html", RWMAP = ROOT + "runeword-map.html";
const PUBLIC = document.body.hasAttribute("data-public");  // the public site has no Design section (build.py --public)
const CATS = [["", "All items"], ["Gear", "All gear"], ["Uniques", "Uniques"], ["Sets", "Sets"], ["Runewords", "Runewords"], ["Charms", "Charms"],
  ["Jewels", "Jewels"], ["Quivers", "Quivers"], ["Currency", "Endgame currency"], ["Runes", "Runes"], ["Gems", "Gems"], ["Essences", "Essences"], ["Keys and organs", "Uber keys and organs"], ["Cube items", "Cube items"]];
const D2_CATS = ["Runes", "Gems", "Essences", "Keys and organs", "Cube items"];  // Diablo II currency categories
const GEM_SLOTS = [["weapon", "Weapons"], ["helm", "Armor"], ["helm", "Helms"], ["shield", "Shields"]];  // the game's order
const runeInfo = r => W.runeCatalog.find(x => x.n === r);
const runeSlug = r => runeInfo(r).s;
const MISC_FAMS = ["Reagents", "Stone fragments", "Remnants", "Keys and trophies", "Currency"];
const SOURCES = [["natural", "Natural drop"], ["boss", "Boss drop"], ["gilded", "Gilded Fallen"], ["descent", "The Descent"], ["cube", "Horadric Cube"]];
const CLASSES = ["Amazon", "Assassin", "Barbarian", "Druid", "Necromancer", "Paladin", "Sorceress", "Warlock"];
const ERAS = [["Classic", "Classic"], ["Lord of Destruction", "Lord of Destruction"], ["Resurrected", "Resurrected"], ["Reign of the Warlock", "Reign of the Warlock"], ["Legacy of the Horadrim", "Legacy of the Horadrim"]];
const SRC_LABEL = {natural: "Natural drop", "natural (pool)": "Natural drop", boss: "Boss drop", named: "Named drop", monster: "Monster drop", cube: "Horadric Cube", cubed: "Horadric Cube", waits: "Availability"};
let W, BY, recipeOutputs, STASH = JSON.parse(localStorage.lothStash || "{}");
const itemHay = i => i.hay ??= [i.n, i.b, i.t, i.set, i.g, i.fam, i.fl, i.desc, i.aliases, ...(i.l || []), ...Object.values(i.gl || {}).flat(), ...(i.runes || []), ...i.src.map(s => s[1])].join(" ").toLowerCase();
const saveStash = () => { localStorage.lothStash = JSON.stringify(STASH); };

document.addEventListener("click", e => {
  const route = e.target.closest(".source-routes [data-source-kind]");
  if (!route) return;
  const details = document.querySelector(".item-sources");
  details.open = true;
  details.querySelector(`[data-source-kind="${CSS.escape(route.dataset.sourceKind)}"]`)?.scrollIntoView({block: "center", behavior: "smooth"});
  e.preventDefault();
});

header();
const networkState = () => document.documentElement.classList.toggle("wiki-offline", !navigator.onLine);
networkState(); addEventListener("online", networkState); addEventListener("offline", networkState);

offline();
atlasPick();
designFolds();
copyBoxes();
notesRail();
if (PAGE === "guide" && KEY === "oils") oilCrafting();
performance.mark("wiki-data-start");
// Page scripts register their renderers after app.js; cached data can arrive before them.
Promise.all([
  fetch(ROOT + "data/wiki.json").then(r => r.json()),
  document.readyState === "loading" ? new Promise(r => document.addEventListener("DOMContentLoaded", r, {once: true})) : null,
]).then(async ([d]) => {
  recipeOutputs = new Set(d.recipeOutputs);
  if (["item", "recipes", "cube", "drops"].includes(PAGE) || document.querySelector("[data-recipes]"))
    d.recipes = await fetch(ROOT + "data/recipes.json").then(r => r.json());
  performance.mark("wiki-data-ready");
  W = d;
  if (d.build) $("#buildline")?.append(` · Build ${d.build}`);  // from wiki.json, so a release changes no page
  BY = Object.fromEntries(d.items.map(i => [i.s, i]));
  performance.mark("wiki-render-start");
  (PAGES[PAGE] || (() => {}))();
  sortTables();
  performance.mark("wiki-render-end");
  performance.measure("wiki-data", "wiki-data-start", "wiki-data-ready");
  performance.measure("wiki-render", "wiki-render-start", "wiki-render-end");
  markSection();
  navArt();
  const guides = new Set([...W.guides.map(g => g[0]), W.moo && mooSlug()]);  // a guide the site leaves out (build.py GO_LIVE) takes its links with it
  document.querySelectorAll('a[href*="guide/"]').forEach(a => { const k = a.getAttribute("href").match(/guide\/([\w-]+)\.html/)?.[1]; if (k && !guides.has(k)) a.remove(); });
  document.querySelectorAll(".bal-tabs").forEach(tabs => {  // Class balance's class tabs: #Druid opens on the Druid
    const pick = c => { if (!tabs.querySelector(`[data-baltab="${c}"]`)) return;
      tabs.querySelectorAll("[data-baltab]").forEach(x => { x.classList.toggle("on", x.dataset.baltab === c); x.setAttribute("aria-selected", x.dataset.baltab === c); });
      document.querySelectorAll(".bal-cls").forEach(p => p.hidden = p.id !== "bal-" + c); };
    tabs.onclick = e => { const b = e.target.closest("[data-baltab]"); if (b) { pick(b.dataset.baltab); history.replaceState(null, "", "#" + b.dataset.baltab); } };
    pick(decodeURIComponent(location.hash.slice(1)));
  });
  for (const a of document.querySelectorAll("a[data-tip]:not([class])")) if (BY[a.dataset.tip]) a.className = "q-" + BY[a.dataset.tip].q;  // item links wear the item's colour
  stashTabs();
  featureStrip();
  hoverTips();
  combos();
  document.addEventListener("click", e => {  // a tile's "Wear it": the tile is a link to its page, so this one goes to the planner
    const w = e.target.closest("[data-wear]");
    if (w) { e.preventDefault(); location.href = `${U.page("builds")}#wear=${w.dataset.wear}`; }
  });
});

// ---------- shared pieces ----------

// what players call them (diablo2.io's search knows these too)
const NICK = {shako: "Harlequin Crest", soj: "The Stone of Jordan", cta: "Call to Arms", hoto: "Heart of the Oak", botd: "Breath of the Dying",
  wf: "Windforce", tgods: "Thundergod's Vigor", arach: "Arachnid Mesh", mara: "Mara's Kaleidoscope", griffs: "Griffon's Eye", occy: "The Oculus",
  anni: "Annihilus", torch: "Hellfire Torch", coh: "Chains of Honor", bk: "Bul-Kathos' Wedding Band", wartrav: "War Traveler", hoz: "Herald of Zakarum",
  coa: "Crown of Ages", raven: "Raven Frost", gheeds: "Gheed's Fortune", ik: "Immortal King", tal: "Tal Rasha's Wrappings", nat: "Natalya's Odium",
  vipermagi: "Skin of the Vipermagi", skullder: "Skullder's Ire", titans: "Titan's Revenge", cot: "Crown of Thieves"};

// the top-bar menu that owns this page (briefs 089, 093): .on and aria-current; the home page marks none
// no Currency menu: runes sit under Runewords, gems, essences and the Token under Crafting, the rest under Endgame
const itemSec = i => i?.q === "rw" || i?.fam === "Runes" ? "Runewords" : ["Reagents", "Gems", "Essences"].includes(i?.fam) || /^Token/.test(i?.n) ? "Crafting"
  : i?.q === "misc" ? "Endgame" : "Gear";  // an item counts by its family (brief 108)
const dbSec = c => c === "Runewords" || c === "Runes" ? "Runewords" : ["Gems", "Essences", "Reagents"].includes(c) ? "Crafting" : c === "Currency" || D2_CATS.includes(c) ? "Endgame" : "Gear";
function markSection() {
  const sec = {db: dbSec(new URLSearchParams(location.search).get("c")), set: "Gear", item: itemSec(BY?.[KEY]), runewords: "Runewords", rwmap: "Runewords", rwcalc: "Runewords",
    bosses: "Endgame", boss: "Endgame", skills: "Skills", skill: "Skills", builds: "Builds", kit: "Gear", cube: "Crafting", recipes: "Crafting", notes: "Patch notes", news: "Patch notes", overview: "Get started",
    guide: W.guides.find(g => g[0] === KEY)?.[2], design: location.pathname.endsWith("design/runewords.html") ? "Runewords" : location.pathname.endsWith("design/endgame.html") ? "Endgame" : "Design"}[PAGE];
  const m = sec && document.querySelector(`#top .menu[data-sec="${sec}"]`);
  if (m) { m.classList.add("on", "mn-open"); m.firstElementChild.setAttribute("aria-current", "page"); }
  if (m?.querySelector(".drop")) m.firstElementChild.setAttribute("aria-expanded", true);  // the phone sheet opens on it
}

function navArt() {  // the menus' and the home doors' art: an item name, a boss key, a class, a base type or the stone
  for (const e of document.querySelectorAll("#top i[data-art], .hm-door i[data-art]")) {
    const a = e.dataset.art;
    if (a === "quiver-guide" || a === "blade-guide") {
      const names = a === "quiver-guide" ? ["Hexed Arrows"] : ["Plague's Harvest", "Pyrebrand", "Winter's Ruin"];
      e.outerHTML = `<span class="nav-${a}" aria-hidden="true">${names.map(n => `<img src="${U.art(W.items.find(i => i.n === n).a)}" alt="">`).join("")}</span>`;
      continue;
    }
    const i = W.items.find(x => x.n === a), b = W.bosses.find(x => x.s === a), c = W.classArt?.[a] || W.inv?.mercs?.find(m => m.n === a)?.img, g = W.baseArt?.[a];
    const src = a === "stone" ? ROOT + "brand/stone.svg" : i?.a ? U.art(i.a) : U.art(b?.img || c || g || "");
    if (a && (a === "stone" || i?.a || b?.img || c || g)) e.outerHTML = `<img${b || c ? ' class="mon"' : ""} src="${src}" alt="">`;
  }
}

// every table sorts by its column headers: press a header for ascending, again for descending, a third
// time for the page's own order. Tables drawn later (after the data loads, on every filter change) get the same, and a
// redrawn table keeps its sort, remembered by its id or its place on the page. A column where most cells start with
// a number sorts by value, roman tiers (I–X) and ranges (1–10, 30 → 33) by their first number; any other column as text.
// State lives in the markup (table data-srt="column direction", row data-srtn = first place) because pages copy their
// own HTML (the guide page does), which drops handlers; one click listener serves every table.
// On a phone a "Sort by" select above the table does the same; a table whose order is the answer (stone tiers,
// gem grades, releases by date) has class fixed-order and doesn't sort.
function sortTables() {
  let pressed = [];  // the last header pressed: a page that redraws on every click (the build planner) gets focus back
  const kept = {}, coll = new Intl.Collator("en", {numeric: true, sensitivity: "base"}), R = {I: 1, V: 5, X: 10};
  const roman = r => [...r].reduce((n, c, k) => n + (R[c] < R[r[k + 1]] ? -R[c] : R[c]), 0);
  const key = cell => {
    const t = (cell?.textContent || "").trim().replace(/\b[IVX]+\b/g, roman).replace(/^\+/, "").replace(/^−/, "-").replace(/(\d),(?=\d{3})/g, "$1");  // 1,500 is 1500
    return {t, n: parseFloat(t), e: /^[—–-]?$/.test(t)};  // e: empty or a dash, last either way
  };
  const head = t => t.tHead?.rows[0] || t.rows[0], body = t => [...t.tBodies].flatMap(b => [...b.rows]).filter(r => r !== head(t));
  const id = t => t.id || [...document.querySelectorAll("table")].indexOf(t) + " " + head(t).textContent;
  const keys = (rows, i) => {  // each row's key in column i, and whether the column sorts by value
    const ks = new Map(rows.map(r => [r, key(r.cells[i])])), full = [...ks.values()].filter(k => !k.e);
    return [ks, full.filter(k => !isNaN(k.n)).length * 2 > full.length];
  };
  const by = t => t.previousElementSibling?.matches(".srt-by") ? t.previousElementSibling : null;  // the phone's Sort by
  const sort = (t, i, dir) => {
    t.dataset.srt = kept[id(t)] = `${i} ${dir}`;
    [...head(t).cells].forEach((c, j) => c.classList.contains("srt") && c.setAttribute("aria-sort", j === i && dir ? dir > 0 ? "ascending" : "descending" : "none"));
    if (by(t)) $("select", by(t)).value = dir ? `${i} ${dir}` : "";
    const rows = body(t).sort((a, b) => a.dataset.srtn - b.dataset.srtn), [ks, num] = keys(rows, i);
    const cmp = (a, b) => a.e || b.e ? a.e - b.e : (!num || isNaN(a.n) || isNaN(b.n) || a.n === b.n ? coll.compare(a.t, b.t) : a.n - b.n) * dir;
    rows[0].parentNode.append(...(dir ? rows.sort((a, b) => cmp(ks.get(a), ks.get(b))) : rows));
  };
  const wire = t => {
    t.dataset.srt = "";
    const h = head(t), rows = body(t);
    if (!h || rows.length < 2 || t.classList.contains("fixed-order") || [...h.cells].some(c => c.tagName !== "TH") || t.querySelector("[rowspan]:not([rowspan='1']),[colspan]:not([colspan='1'])")) return;
    rows.forEach((r, n) => r.dataset.srtn = n);
    by(t)?.remove();  // a table redrawn in place gets a fresh one
    const opts = [...h.cells].filter(c => c.textContent.trim() && !c.querySelector("a,button,input,select")).map(c => {
      const [lo, hi] = keys(rows, c.cellIndex)[1] ? ["low to high", "high to low"] : ["A to Z", "Z to A"], n = esc(c.textContent.trim());
      return `<option value="${c.cellIndex} 1">${n}, ${lo}</option><option value="${c.cellIndex} -1">${n}, ${hi}</option>`;
    });
    if (opts.length) t.insertAdjacentHTML("beforebegin", `<label class="srt-by">Sort by <select><option value="">As listed</option>${opts.join("")}</select></label>`);
    for (const c of h.cells) {
      if (!c.textContent.trim() || c.querySelector("a,button,input,select")) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.append(...c.childNodes);
      c.append(b);
      c.classList.add("srt");
      c.setAttribute("aria-sort", "none");
      if (pressed[0] === id(t) && pressed[1] === c.cellIndex && document.activeElement === document.body) { b.focus({preventScroll: true}); pressed = []; }
    }
    if (kept[id(t)]) sort(t, ...kept[id(t)].split(" ").map(Number));
  };
  const all = () => document.querySelectorAll("table:not([data-srt])").forEach(wire);
  all();
  if (document.querySelector("table")) {
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; all(); });
    }).observe(document.body, {childList: true, subtree: true});
  }
  document.addEventListener("click", e => {  // capture: before a page's own listener redraws the table
    const th = e.target.closest("th.srt"), t = th?.closest("table");
    pressed = t ? [id(t), th.cellIndex] : [];
    if (!t) return;
    const [i, dir] = t.dataset.srt.split(" ").map(Number);
    sort(t, th.cellIndex, i !== th.cellIndex ? 1 : dir > 0 ? -1 : dir < 0 ? 0 : 1);
  }, true);
  document.addEventListener("change", e => {
    const s = e.target.closest(".srt-by select"), t = s?.parentNode.nextElementSibling;
    if (t?.tagName === "TABLE") sort(t, ...(s.value || "0 0").split(" ").map(Number));
  });
}

// "Save for offline" in every footer (on Help, its panel: build.py help_page()), the Help menu and the foot of the phone Menu sheet: sw.js (tools/wiki/pwa.py) saves the core wiki; this shows its
// size, the progress in MB and the result, asks the browser to keep it, and offers Add to Home Screen (Android) or the iPhone steps.
function offline() {
  const box = $("#offline"), [save, inst] = box.querySelectorAll("button"), msg = $("span", box), sw = navigator.serviceWorker;
  const mb = n => (n / 2 ** 20).toFixed(1), say = t => { msg.textContent = t; box.hidden = false; };
  const app = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform);
  document.querySelectorAll('a[href="#offline"]').forEach(a => a.onclick = e => {  // close the menu sheet; land on the button
    e.preventDefault();
    $("#top").classList.remove("open");
    $("#top .burger").setAttribute("aria-expanded", false);
    box.scrollIntoView({block: "center"});
    (save.hidden ? inst : save).focus();
  });
  save.hidden = true;
  if (!sw && !isSecureContext && $(".hp-away", box)) return $(".hp-away", box).hidden = false;  // Help: a quiet link to the secure site
  if (!sw) return say(isSecureContext ? "This browser can't save the wiki." : "To save for offline, open the https site.");
  let kept = "", got = 0, gotBytes = 0, saving = false;
  const post = m => sw.ready.then(r => (r.waiting || r.active).postMessage(m));  // waiting: a release still downloading
  sw.addEventListener("message", ({data: m, source}) => {
    if (m.kind === "status" && m.update) return source.postMessage("save");  // an update cut off earlier: carry on
    if (m.kind === "status" && m.saved) say("Saved: works offline");
    if (m.kind === "status" && !m.saved) {
      save.textContent = `Save for offline, ${mb(m.bytes)} MB`;
      $("#top .mn-save small").textContent = `, ${mb(m.bytes)} MB`;
      save.hidden = false;
      say(iphone && !app ? "On iPhone or iPad, tap Share, then Add to Home Screen. Open the wiki from the new icon and save there." : "");
    }
    if (m.kind === "progress") say(`${m.update ? "Updating" : "Saving"}: ${mb(m.have)} of ${mb(m.bytes)} MB`);
    if (m.kind === "error") { saving = save.disabled = save.hidden = false; msg.title = m.text; say("Saving stopped: a page didn't download. Tap Save again to carry on."); }
    if (m.kind !== "batch") return;
    got += m.fetched;
    gotBytes += m.fetchedBytes;
    if (m.left && (saving || m.update)) return source.postMessage("save");  // the worker that sent it: an update's is still installing
    saving = false;
    save.hidden = true;
    say(m.update ? `Updated: ${got} changed file${got === 1 ? "" : "s"}, ${mb(gotBytes)} MB` : `Saved: works offline. ${kept}`);
    got = gotBytes = 0;
  });
  sw.register(ROOT + "sw.js");
  sw.startMessages();
  post("status");
  save.onclick = async () => {
    saving = save.disabled = true;
    const ok = await navigator.storage?.persist?.();
    kept = ok ? "This browser will keep it." : ok === false ? "This browser may clear it if space runs low." : "";
    post("save");
  };
  let ask;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); ask = e; inst.hidden = box.hidden = false; });
  inst.onclick = () => ask.prompt().then(() => inst.hidden = true);
}

function header() {
  // diablo2.io's shape: each entry has the game's own art and one line of what's there. art: an item name or a boss key
  const pic = a => a === undefined ? "" : `<i data-art="${a || ""}"></i>`;  // filled by navArt() once the data is in
  const menu = (label, href, links, cls = "") => `<div class="menu${cls}" data-sec="${label}"><a href="${href}"${links ? ' aria-expanded="false"' : ""}>${label}</a>${links ? `<div class="drop${links.length > 12 ? " three" : links.length > 6 ? " two" : ""}">`
    + links.map(([h, t, a, s]) => `<a href="${h}">${pic(a)}<span><b>${t}</b>${s ? `<small>${s}</small>` : ""}</span></a>`).join("") + "</div>" : ""}</div>`;
  $("#top").innerHTML = `<a class="mark" href="${ROOT}index.html"><img class="st" src="${ROOT}brand/stone.svg" alt="Legacy of the Horadrim"><img class="wm" src="${ROOT}brand/wordmark.svg" alt=""></a>`
    + `<button class="burger" aria-expanded="false" aria-controls="topnav">Menu</button><nav id="topnav">`
    + menu("Get started", U.guide("about"), [[U.guide("about"), "About", "stone", "What Legacy of the Horadrim is"], [U.guide("install"), "Install", "Horadric Staff", "Set up on PC or Steam Deck"],
      [U.page("overview"), "Overview", "Perfect Diamond", "Everything Legacy of the Horadrim adds"]])
    + menu("Endgame", U.guide("endgame"), [[U.guide("endgame"), "Endgame overview", "baal", "What waits after Baal"], [U.guide("stones"), "Sanctuary Stones", "Sanctuary Stone XV", "Tiered areas in Hell"],
      [U.guide("descent"), "The Descent", "echo-of-mephisto", "Floors down to the echoes"],
      [U.guide("convergence"), "The Convergence", "Baal's Tentacle", "The five Unborn at once"],
      [U.guide("heaven"), "Heaven", "Angiris Seal", "The Silver City and The Wordless"],
      [U.guide("sentinels"), "Sentinels", "Barrow Seal Quarter", "Seal quarters, the Crypt and the Last Vigil"],
      [U.guide("new-encounters"), "New encounters", "Horadric Vault Sigil", "Gilded Fallen and the Horadric Vault"],
      [U.guide("sigils"), "Sigils and keys", "Key of Terror", "What opens each boss"], [U.guide("terror"), "Terror Zones", "Western Worldstone Shard", "Heralds, Sunders, the Uber Ancients"],
      [U.guide("legacy"), "Legacy ubers", "lilith", "Pandemonium and Uber Tristram"], [U.page("bosses"), "Bosses", "andariel", "Every boss, where and what"]])
    + menu("Gear", U.db("c=Gear"), [  // three columns of 5, 4 and 4: the database, the gear guides, sockets and socket jewellery
      [U.db("c=Uniques"), "Uniques", "Harlequin Crest", "Gold-named, rolled bonuses"],
      [U.db("c=Sets"), "Sets", "Tal Rasha's Adjudication", "Green-named, bonuses per piece"],
      [U.db("c=Charms"), "Charms", "Annihilus", "Work from your inventory"],
      [U.db("c=Jewels"), "Jewels", "Rainbow Facet", "Go in sockets"],
      [U.db("c=Gear"), "All gear", "Helm", "Every item you can wear"],
      [U.guide("quivers"), "Quivers", "quiver-guide", "Endless ammo, bonuses and sockets"],
      [U.guide("tomes"), "Charms and Journals", "Cain's Journal", "Carry limits and binding Leaves"],
      [U.guide("awakened"), "Awakened uniques", "The Wordless", "Feed a unique the power of runes"],
      [U.guide("blades"), "Binding Blades", "blade-guide", "Spell schools, crafting and upgrades"],
      [U.guide("sockets"), "Sockets and runeword bases", "Horn of Delving", "New slots, socket limits and rune order"],
      [U.guide("socket-jewellery"), "Socket jewellery", "Signet", "Signets, Pendants and their uniques"],
      [U.guide("gem-feeding"), "Gem feeding", "Perfect Ruby", "Grow uniques in the Cube"],
      [U.guide("runebands"), "Runebands", "Runeband of Enigma", "Endgame rings that finish a runeword"]])
    + menu("Runewords", U.page("runewords"), [[U.page("runewords"), "Find a runeword", "Xeth Rune", "By base, sockets and runes"], [RWMAP, "Runeword map", "Jah Rune", "Every runeword by level"],
      [U.tool("runewords"), "Rune bench", "Ber Rune", "What your runes can make"], [U.guide("runes"), "Runes and upgrading", "Zod Rune", "Every rune, Wax runewords and the Cube chain"]])
    + menu("Crafting", U.page("recipes"), [[U.page("recipes"), "Cube recipes", "Perfect Topaz", "Every recipe"], [U.guide("currency"), "Reagents and rolls", "Soul of Legend", "What each reagent does"], [U.tool("cube"), "Cube planner", "Horadric Cube", "What your stash can make"],
      [U.guide("oils"), "Oil crafting", "Clear Oil", "Oils and Perfect Gem recipes"],
      [U.guide("affixes"), "Magic and rare affixes", "Ring", "Prefixes, suffixes and item levels"],
      [U.guide("corruption"), "Corruption", "Hellforge Ember", "Permanent outcomes and their chances"]])
    + menu("Skills", U.page("skills"), [[U.guide("changes"), "Class balance", "Sorceress", "Every changed number"],
      [U.guide("skill-effects"), "Skill effects", "Perfect Sapphire", "Projectiles, areas, buffs and more"], ...CLASSES.map(c => [U.page("skills") + "#" + c, c, c])])
    + menu("Builds", U.page("builds"))
    + menu("Patch notes", U.page("notes"), [[U.page("notes"), "Patch notes", "Tome of Town Portal"], [U.page("news"), "News and announcements", "Scroll of Town Portal"]])
    + menu("Help", U.guide("known-issues"), [[U.guide("known-issues") + "#known-problems-in-this-release", "Known problems", "Key of Hate", "What's still broken in this release"],
      [U.guide("known-issues") + "#whats-wrong", "FAQ and troubleshooting", "Horadric Lens", "The game won't start, it crashed, where are my characters"],
      [U.guide("known-issues") + "#report-a-bug", "Feedback", "Token of Absolution", "Report a bug, suggest a change"],
      [document.body.dataset.discord, "Join the Discord", "Leaf of Cain", "Discuss the mod with other players"],
      [U.guide("known-issues") + "#offline", "Save for offline", "Cain's Journal", "Keep the wiki on your phone, no signal needed"]])
    + (PUBLIC ? "" : menu("Design", DESIGN, [[ROOT + "design/runewords.html", "Runeword map"], [ROOT + "design/endgame.html", "Endgame map"], [ROOT + "design/drops.html", "Drop map"], [ROOT + "design/uniques.html", "Unique map"], [ROOT + "design/stash.html", "Stash map"], [ROOT + "design/art.html", "Art register"], [ROOT + "design/handbook.html", "Builder handbook"], [ROOT + "design/rules.html", "Rules"], [DESIGN + "#docs", "Design docs"]], " aux"))
    + `<a class="mn-save" href="#offline">Save for offline<small></small></a></nav><div class="omni"><input id="omni" type="search" placeholder="Search the whole wiki…  /" autocomplete="off" aria-label="Search the wiki"><div id="sugg" hidden></div></div>`;
  const burger = $("#top .burger");  // narrow screens: the menus open as one sheet
  burger.onclick = () => burger.setAttribute("aria-expanded", $("#top").classList.toggle("open"));
  const sheet = matchMedia("(max-width:1180px)");  // in the sheet a menu's name folds its entries open; the current section starts open (markSection)
  document.querySelectorAll("#top .drop").forEach(d => d.previousElementSibling.onclick = e => {
    if (!sheet.matches) return;
    e.preventDefault();
    e.currentTarget.setAttribute("aria-expanded", d.parentNode.classList.toggle("mn-open"));
  });
  const box = $("#omni"), sug = $("#sugg");
  let hits = [], sel = -1;
  // grouped by kind, three of each with "All N": typing "fire" shows its items too, not nine skills
  const draw = () => {
    const q = box.value.trim();
    sug.hidden = !q;
    if (!W || !q) return;
    const groups = searchGroups(searchHits(q));
    hits = groups.flatMap(g => g[2].slice(0, 3));
    sug.innerHTML = mooReply(q) || groups.map(([k, t, hs]) => `<div class="sg-h">${t}${hs.length > 3 ? `<a href="${U.search(q, k)}">All ${hs.length} →</a>` : ""}</div>`
      + hs.slice(0, 3).map(e => `<a href="${searchHref(e)}" class="hit${hits.indexOf(e) === sel ? " on" : ""}">${searchArt(e)}<span class="q-${e.q || e.k}">${esc(e.n)}</span><small>${esc(searchSub(e))}</small></a>`).join("")).join("")
      + `<a href="${U.search(q)}" class="all${sel === hits.length ? " on" : ""}">Everything for “${esc(q)}” →</a>`;
  };
  box.addEventListener("input", () => { sel = -1; draw(); });
  box.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { sel = Math.max(-1, Math.min(hits.length, sel + (e.key === "ArrowDown" ? 1 : -1))); draw(); e.preventDefault(); }
    if (e.key === "Enter") location.href = sel >= 0 && sel < hits.length ? searchHref(hits[sel]) : U.search(box.value.trim());
    if (e.key === "Escape") { box.value = ""; draw(); box.blur(); }
  });
  box.addEventListener("blur", () => setTimeout(() => sug.hidden = true, 150));
  addEventListener("keydown", e => { if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); box.focus(); } });
}

// What a search finds: a nickname, then the whole first word ("ber" → Ber Rune before Berserk), a prefix, a word
// start, anywhere; LotH before Diablo II, Design last. A longer query that matches no name whole matches word by word,
// each missing word costing a step, so a broken link's "harlequin-crset" still finds Harlequin Crest.
const SKINDS = {item: "Items", rw: "Runewords", set: "Sets", skill: "Skills", boss: "Bosses", guide: "Guides", page: "Pages", design: "Design", moo: "Result"};
const skind = e => e.k === "item" && e.q === "rw" ? "rw" : e.k === "tool" ? "page" : e.k;
function searchHits(text) {
  const moo = mooKey(text);
  if (W.moo?.h[moo]) return [{k: "moo", n: "Moo.", s: moo}];  // egg 1: an exact secret name finds one hit at its card
  const q = text.toLowerCase().trim(), words = q.split(/[\s-]+/).filter(w => w.length > 1);
  const rank = (n, w) => n === w || n.startsWith(w + " ") ? 0 : n.startsWith(w) ? 1 : n.includes(" " + w) ? 2 : n.includes(w) ? 3 : 9;
  const group = e => { const i = e.k === "item" && BY[e.s]; return i ? [i.g, i.set, i.fam, i.b].join(" ").toLowerCase() : ""; };  // an item's group, set, family and base
  const score = e => { const n = e.n.toLowerCase(), whole = NICK[q] === e.n ? -1 : rank(n, q);
    const s = whole < 9 || words.length < 2 ? whole : 4 + Math.min(...words.map(w => rank(n, w))) + 3 * words.filter(w => !n.includes(w)).length;
    if (s < 6) return s;
    const context = e.k === "item" ? itemHay(BY[e.s]) : e.x || "";
    if (words.length && words.every(w => context.includes(w))) return 6;
    return s < 9 || !group(e).includes(q) ? s : 8; };
  return !q ? [] : W.search.map(e => [e, score(e)]).filter(x => x[1] < 9)
    .sort((a, b) => a[1] - b[1] || (a[0].k === "design") - (b[0].k === "design") || (a[0].o === "vanilla") - (b[0].o === "vanilla") || a[0].n.localeCompare(b[0].n)).map(x => x[0]);
}
const searchGroups = hits => [...new Set(hits.map(skind))].map(k => [k, SKINDS[k], hits.filter(e => skind(e) === k)]);  // the best hit's kind first
const searchHref = e => e.k === "moo" ? mooHref(e.s) : e.k === "skill" ? U.skill(e.s) : e.k === "item" ? U.item(e.s) : e.k === "set" ? U.set(e.s) : e.k === "boss" ? U.boss(e.s) : e.k === "guide" ? U.guide(e.s) : e.k === "tool" ? U.tool(e.s) : U.page(e.s);
const searchSub = e => e.k === "item" || e.k === "skill" || e.k === "guide" ? e.t : e.t || {set: "Set", boss: "Boss", tool: "Tool", page: "Page", design: "Design"}[e.k];

// The cow level's eggs: data/wiki.json holds only FNV-1a hashes of the secret names (moo.py); the secret page's
// data-moo attributes answer them, so neither a name nor a slug leaves that page.
const mooTerm = q => q.trim().toLowerCase().replace(/\s+/g, " ");
const mooKey = q => { let h = 0x811c9dc5; for (const c of mooTerm(q)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0; return h.toString(16).padStart(8, "0"); };
const mooSlug = () => W.moo.p.toString(16).padStart(8, "0");  // the page's hash as a number, so wiki.json never names its address
const mooHref = a => `${ROOT}guide/${mooSlug()}.html` + (a ? "#" + a : "");
// The secret items answer only their exact name: W.moo.it holds each one's entries under the name's hash, XORed with
// the name (moo.py seal). An unsealed one joins BY, and its name is kept in this browser, so a build wearing it reloads with it.
function unseal(q) {
  const term = mooTerm(q), key = new TextEncoder().encode(term);
  const got = (W.moo?.it?.[mooKey(q)] || []).map(c => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(c), (ch, i) => ch.charCodeAt(0) ^ key[i % key.length]))));
  for (const it of got) { BY[it.s] = it; if (it.sx) W.sets[it.set] ||= it.sx; }
  try { const had = JSON.parse(localStorage.getItem("loth-moo") || "[]"); if (got.length && !had.includes(term)) localStorage.setItem("loth-moo", JSON.stringify([...had, term])); } catch {}
  return got;
}
const HOOF = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M11 3C7 3 4 8 4 14c0 4 2 7 5 7 1.5 0 2-1 2-2zm2 0c4 0 7 5 7 11 0 4-2 7-5 7-1.5 0-2-1-2-2z"/></svg>';
const mooReply = q => W.moo && mooTerm(q) === "there is no cow level" ? `<p class="sr-none">...or is there? <a class="moo-hoof" href="${mooHref()}" aria-label="Follow the hoof prints">${HOOF}</a></p>` : "";  // egg 3
function moo() {  // a moo made in the browser, no sound file: a falling sawtooth through a low-pass
  const a = new AudioContext(), o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  o.type = "sawtooth"; o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(180, t + .3); o.frequency.exponentialRampToValueAtTime(90, t + 1.2);
  f.type = "lowpass"; f.frequency.value = 600;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.4, t + .15); g.gain.exponentialRampToValueAtTime(.001, t + 1.3);
  o.connect(f).connect(g).connect(a.destination); o.start(t); o.stop(t + 1.3);
}
function mooClicks(icon) {  // egg 2: n clicks, or n A/Enter presses on the focused icon (the Deck), one per scrap
  let n = 0;
  icon.tabIndex = 0;
  icon.onclick = icon.onkeydown = e => {
    if (e.repeat || e.key && e.key !== "Enter" && e.key !== " ") return;  // holding A is one press
    e.preventDefault();
    if (++n === W.moo.n) { moo(); setTimeout(() => location.href = mooHref(), 1300); }
  };
}

// A search result's picture: an item's art (a runeword its runes), a skill's icon, a boss's portrait, a set's first
// piece; a guide or a page gets its kind's letter.
function searchArt(e) {
  const i = e.k === "item" && BY[e.s], src = i ? (i.q === "rw" ? W.runeArt[i.runes[0]] : i.a)
    : e.k === "skill" ? W.skills.find(x => x.s === e.s)?.icon : e.k === "boss" ? W.bosses.find(x => x.s === e.s)?.img
    : e.k === "set" ? W.items.find(x => x.set === e.n && x.a)?.a : null;
  return `<span class="si">${src ? `<img src="${U.art(src)}" alt="" loading="lazy">` : `<b>${esc((e.k || "?")[0].toUpperCase())}</b>`}</span>`;
}

// The results page: every kind that matched, five of each with "all N", the chosen row's tooltip beside the list
// (under it on a phone; choosing it again opens its page). The 404 runs it on the missing link's words.
function searchPage(q, missing) {
  const st = {q, kind: new URLSearchParams(location.search).get("k") || "", sel: null, open: {}};
  const SK = Object.fromEntries(W.skills.map(s => [s.s, s])), BOSS = Object.fromEntries(W.bosses.map(b => [b.s, b]));
  const lvl = e => e.k === "skill" ? SK[e.s]?.rl : e.k === "item" ? BY[e.s]?.rl : e.k === "boss" ? BOSS[e.s]?.stats?.Hell?.lv : "";
  const card = (e, line, more = "") => `<div class="sr-card">${searchArt(e)}<h3>${esc(e.n)}</h3><p>${esc(line)}</p>${more}</div><div class="led-go"><a class="pill" href="${searchHref(e)}">Open its page</a></div>`;
  const panel = e => !e ? "" : e.k === "item" && BY[e.s] ? ledPanel(BY[e.s])
    : e.k === "skill" ? card(e, `${SK[e.s].cls} · ${SK[e.s].tree} · level ${SK[e.s].rl}`, `<p>${esc(SK[e.s].d.replace(/\n/g, " "))}</p>`)
    : e.k === "boss" ? card(e, BOSS[e.s]?.areas?.[0]?.n || "Boss") : card(e, searchSub(e));
  const row = e => `<button type="button" class="led-row${e === st.sel ? " on" : ""}" data-k="${e.k}" data-s="${esc(e.s)}"><span class="led-a">${searchArt(e)}</span>`
    + `<span class="led-n"><b class="q-${e.q || e.k}">${esc(e.n)}</b><small>${esc(searchSub(e))}</small></span><span class="led-l">${lvl(e) || ""}</span>`
    + `<span class="led-m">${(BY[e.s] && e.k === "item" ? BY[e.s].l || [] : []).slice(0, 2).map(esc).join("<br>")}</span></button>` + (e === st.sel ? `<div class="led-inl">${panel(e)}</div>` : "");
  $("#main").innerHTML = crumbs([[U.page("index"), "Home"], [null, missing ? "Page not found" : "Search"]])
    + (missing ? `<div class="sr-404"><h1>Page not found</h1><p>No page at <code>${esc(missing)}</code>. Search results for “${esc(q)}”:</p></div>` : `<h1 id="sr-h1"></h1>`)
    + `<form class="sr-box" role="search"><input id="sr-q" type="search" aria-label="Search the wiki" placeholder="Items, skills, guides, crafting…" autocomplete="off"><button>Search</button></form>
      <div class="pills sr-kinds" role="group" aria-label="Show"></div><div class="led"><div id="sr-list" aria-live="polite"></div><aside class="led-tip"></aside></div>`;
  const list = $("#sr-list");
  const draw = () => {
    const hits = searchHits(st.q), groups = searchGroups(hits), many = k => st.kind || st.open[k] ? Infinity : 5;
    const mention = st.q.length > 1 ? W.items.filter(i => itemHay(i).includes(st.q.toLowerCase())).length : 0;
    if (!groups.some(g => g[0] === st.kind)) st.kind = "";
    const shown = groups.filter(g => !st.kind || g[0] === st.kind);
    if (!shown.some(([k, , hs]) => hs.slice(0, many(k)).includes(st.sel))) st.sel = shown[0]?.[2][0] || null;
    $("#sr-q").value = st.q;
    if (!missing) $("#sr-h1").textContent = st.q ? `Search: “${st.q}”` : "Search";
    $(".sr-kinds").innerHTML = groups.length > 1 ? [["", "All", hits], ...groups].map(([k, t, hs]) => `<button type="button" class="pill${st.kind === k ? " on" : ""}" data-k="${k}" aria-pressed="${st.kind === k}">${t} ${hs.length}</button>`).join("") : "";
    list.innerHTML = mooReply(st.q) || (!st.q ? `<p class="sr-none">Type the name of an item, a skill, a boss or a guide.</p>`
      : shown.map(([k, t, hs]) => `<section><h2 class="sec">${t} <small>${hs.length}</small></h2><div class="led-hd"><span></span><span>Name</span><span>Level</span><span></span></div>${hs.slice(0, many(k)).map(row).join("")}`
        + (hs.length > many(k) ? `<button type="button" class="pill sr-more" data-open="${k}">All ${hs.length} ${t.toLowerCase()} →</button>` : "") + "</section>").join("")
        || `<p class="sr-none">Nothing matches “${esc(st.q)}”. Check the spelling, or try one word.</p>`)
      + (mention ? `<p><a class="pill sr-more" href="${U.db("q=" + encodeURIComponent(st.q))}">${mention === 1 ? "1 item mentions" : mention + " items mention"} “${esc(st.q)}” →</a></p>` : "");
    $(".led-tip").innerHTML = panel(st.sel);
  };
  const pick = r => { if (r.dataset.k === "moo") { location.href = mooHref(r.dataset.s); return; }
    const e = W.search.find(x => x.k === r.dataset.k && x.s === r.dataset.s);
    if (e === st.sel) { location.href = searchHref(e); return; }  // choosing the chosen row again opens it
    st.sel = e; draw(); list.querySelector(`.led-row[data-k="${e.k}"][data-s="${CSS.escape(e.s)}"]`)?.focus(); };
  $(".sr-kinds").onclick = e => { const b = e.target.closest("[data-k]"); if (b) { st.kind = b.dataset.k; draw(); } };
  list.onclick = e => { const o = e.target.closest("[data-open]"), r = e.target.closest(".led-row");
    if (o) { st.open[o.dataset.open] = 1; draw(); } else if (r) pick(r); };
  list.onkeydown = e => {
    const d = {ArrowDown: 1, ArrowUp: -1}[e.key], rows = [...list.querySelectorAll(".led-row")], n = d && rows[rows.indexOf(e.target) + d];
    if (n) { e.preventDefault(); n.classList.contains("on") ? n.focus() : pick(n); }
  };
  $(".sr-box").onsubmit = e => {
    e.preventDefault();
    const v = $("#sr-q").value.trim();
    if (missing) { location.href = U.search(v); return; }
    Object.assign(st, {q: v, kind: "", open: {}}); history.replaceState(null, "", "?q=" + encodeURIComponent(v)); draw();
  };
  draw();
}

// The filter parts the rails share (the database, the runeword finder, Crafting; #504, #535): a pill, and the Filters button that
// folds the rail on a phone; fWire's cb hears the new state
const fPill = (k, v, t, on = false, multi = false) => `<button type="button" class="pill${on ? " on" : ""}" aria-pressed="${on}" data-k="${k}" data-v="${esc(v)}"${multi ? " data-m" : ""}>${esc(t)}</button>`;
const fToggle = (open, n = 0) => `<button type="button" class="pill rwf-tog" aria-expanded="${open}">Filters${n ? ` (${n})` : ""}</button>`;
const fWire = (bar, cb) => bar.querySelector(".rwf-tog").onclick = e => { const o = bar.classList.toggle("open"); e.currentTarget.setAttribute("aria-expanded", o); cb?.(o); };

// A searchable picker with art, in place of a <select>: it keeps the select's id and value and fires "change", so a
// page reads it as one. opts: [value, label, art?]; past eight options it gets a search box.
function combo(id, opts, value, cls = "") {
  const on = opts.find(o => String(o[0]) === String(value)) || opts[0], pic = a => a ? `<img src="${U.art(a)}" alt="">` : "";
  return `<div class="combo ${cls}" id="${id}" data-v="${esc(String(on[0]))}"><button type="button" class="cb" aria-haspopup="listbox">${pic(on[2])}<span>${esc(on[1])}</span><i>▾</i></button>
    <div class="cl" role="listbox" hidden>${opts.length > 8 ? `<input type="search" class="cf" placeholder="Search…" aria-label="Search the options">` : ""}${opts.map(o =>
      `<button type="button" role="option" data-cv="${esc(String(o[0]))}"${String(o[0]) === String(on[0]) ? ' class="on"' : ""}>${pic(o[2])}<span>${esc(o[1])}</span></button>`).join("")}</div></div>`;
}
function combos() {  // once per page: open, filter, pick, close
  const shut = () => document.querySelectorAll(".combo .cl:not([hidden])").forEach(l => l.hidden = true);
  document.addEventListener("click", e => {
    const b = e.target.closest(".combo .cb"), o = e.target.closest(".combo [data-cv]");
    if (o) { const c = o.closest(".combo"); c.value = c.dataset.v = o.dataset.cv; shut(); c.dispatchEvent(new Event("change", {bubbles: true})); return; }
    if (b) { const l = b.nextElementSibling, open = l.hidden; shut(); l.hidden = !open; if (open) l.querySelector(".cf")?.focus(); return; }
    if (!e.target.closest(".combo .cl")) shut();
  });
  document.addEventListener("input", e => { if (e.target.matches(".combo .cf")) { const q = e.target.value.toLowerCase();
    e.target.parentElement.querySelectorAll("[data-cv]").forEach(o => o.hidden = !!q && !o.textContent.toLowerCase().includes(q)); } });
  document.addEventListener("keydown", e => { if (e.key === "Escape") shut(); });
  // the picker's own search box is an input too: its change must not reach the page, which reads the picker's value
  document.addEventListener("change", e => { if (e.target.matches(".combo .cf")) e.stopPropagation(); }, true);
}

// a runeword's runes' lines, one block per slot it fits (brief 098)
const runeBlocks = rb => Object.entries(rb || {}).map(([t, ls]) => `<div class="rb"><div class="w">Runes in ${esc(t)}:</div>${ls.map(l => `<div>${rng(l)}</div>`).join("")}</div>`).join("");
const rng = s => esc(s).replace(/(\d+)-(\d+)/g, '<span class="rng" title="Rolls between $1 and $2">$1-$2</span>');

// socks: a worn item's sockets ({n, lines, eth} from the build planner): their bonuses join its mods, as in the game.
// base: the plain base a runeword is made in (a W.bases entry): its name, damage or defense and requirements show.
// ctx: who would wear it (the build planner's tipCtx): a requirement they miss, or a class lock that isn't theirs, is red.
const DC = {0: "var(--white)", 1: "var(--red)", 2: "var(--set)", 3: "var(--magic)", 4: "var(--gold)", 5: "var(--grey)", 8: "#ffa800", 9: "var(--rare)", ";": "#b477dc"};  // the game's ÿc colour codes
function tip(i, {art = false, links = false, socks = null, base = null, ctx = null, fed = null} = {}) {
  const img = art ? (base?.a ? `<div class="art big"><img src="${U.art(base.a)}" alt=""></div>` : artBox(i, true)) : "";
  const tier = [i.base?.tier !== "Normal" && i.base?.tier, {unique: "Unique", set: "Set"}[i.q]].filter(Boolean).join(" ");  // "Elite Unique"
  const head = i.q === "rw"
    ? `<div class="bs rune">'${i.runes.join("")}'</div><div class="w">${base ? esc(base.n) : `${i.so}-socket ${esc(i.it)}`}</div>`
    : i.fam === "Runes" ? `<div class="bs">Rune</div>` : i.b ? `<div class="bs">${tier ? tier + " · " : ""}${esc(i.b)}</div>` : "";
  const df = i.df || base?.df, dm = i.dm || base?.dm && `${base.dm}${base.h2 ? " (two-handed)" : ""}`;
  const nums = [df && `Defense: <span class="v">${rng(df)}</span>`, dm && `Damage: <span class="v">${rng(dm)}</span>`].filter(Boolean).map(t => `<div class="w">${t}</div>`).join("");
  const b = base || i.base, rl = Math.max(i.rl || 0, base?.rl || 0);  // a runeword needs its own level and its base's
  const lock = b?.cls, ty = b?.ty || b?.type, mine = !ctx || (ctx.can ? ctx.can.includes(ty) : lock === ctx.cls);
  const req = [[b?.str, `Required Strength: ${b?.str}`, ctx?.str], [b?.dex, `Required Dexterity: ${b?.dex}`, ctx?.dex], [rl, `Required Level: ${rl}`, ctx?.lvl]]
    .filter(([n]) => n).map(([n, t, have]) => `<div class="w${have != null && n > have ? " bad" : ""}">${t}</div>`).join("")
    + (lock ? `<div class="w${mine ? "" : " bad"}">(${esc(lock)} Only)</div>` : "");
  const name = links ? `<a href="${U.item(i.s)}">${esc(i.n)}</a>` : esc(i.n);
  // a rune or gem reads as in the game: what it does in each slot, then its required level
  const sock = i.gl && `<div class="w">Can be Inserted into Socketed Items</div>`
    + `<div class="sock">${GEM_SLOTS.map(([k, t]) => `<div class="w">${t}: ${i.gl[k].map(rng).join(", ")}</div>`).join("")}</div>${req}`;
  return `<div class="d2tip q-${i.q}${i.fam === "Runes" ? " rune" : ""}">${img}<div class="nm">${name}</div>${head}${nums}${sock || req}`
    + (i.desc ? i.desc.split("\n").map((t, n) => `<div class="w"${DC[i.dc?.[n]] ? ` style="color:${DC[i.dc[n]]}"` : ""}>${esc(t)}</div>`).reverse().join("") : "")  // one line each, bottom up as the game draws them
    + `<div class="mods">${[...(i.l || []).filter(l => !socks || !/^Socketed \(/.test(l)), ...(socks?.lines || [])].map(l => `<div>${rng(l)}</div>`).join("")}`
    + (socks && (socks.n || socks.eth) ? `<div>${[socks.eth && "Ethereal (Cannot be Repaired)", socks.n && `Socketed (${socks.n})`].filter(Boolean).join(", ")}</div>` : "") + `</div>`
    + (fed ? `<div class="w">Fully fed · ${esc(fed.label)}</div><div class="mods">${fed.lines.map(l => `<div>${rng(l)}</div>`).join("")}</div>`
      + `<div class="w">Completion bonus</div><div class="mods">${fed.full.map(l => `<div>${rng(l)}</div>`).join("")}</div>` : "") + runeBlocks(i.rb)
    + (i.sb ? `<div class="sb">${Object.entries(i.sb).map(([n, ls]) => ls.map(l => `<div>${rng(l)} (${n} Items)</div>`).join("")).join("")}</div>` : "")
    + (i.set && W.sets[i.set] ? `<div class="setn">${esc(i.set)}</div>` : "")
    + (i.fl ? `<div class="fl">${esc(i.fl)}</div>` : "") + `</div>`;
}

function artBox(i, big) {
  if (i.q === "rw") return `<div class="art runes">${i.runes.map(r => W.runeArt[r] ? `<img src="${U.art(W.runeArt[r])}" alt="${r}" data-tip="${runeSlug(r)}">` : r).join("")}</div>`;
  return `<div class="art${big ? " big" : ""}">${i.a ? `<img src="${U.art(i.a)}"${i.aw ? ` width="${i.aw}" height="${i.ah}"` : ""} alt="" loading="lazy">` : ""}</div>`;
}

function srcLine(i) {  // a card's one drop line: drop_format.short; the item page keeps every source
  const s = i.sd || i.src[0]?.[1];
  if (s) return s;
  return recipeOutputs.has(i.s) ? "Made in the Horadric Cube" : i.q === "rw" ? `${i.so} sockets · ${i.it}` : "";
}

const eraTag = i => `<span class="tag era${i.o === "loth" ? " loth" : ""}">${esc(i.era)}</span>`;
// "Wear it" on a tile: what the planner can put on (builds.html#wear=, wear() in builds-page.js); rl 0 is a quest item
const wearIt = i => ["unique", "set", "rw"].includes(i.q) && i.rl > 0 ? `<span class="tag wearit" data-wear="${i.s}" title="Plan a build">Wear it</span>` : "";
function tile(i, opts = {}) {
  const tag = opts.tags ? eraTag(i) : "";
  if (i.q === "rw") return rwCard({href: U.item(i.s), tip: i.s, n: i.n, from: opts.current && i.o === "loth" ? "Legacy of the Horadrim runeword" : rwFrom(i), runes: i.runes, rl: i.rl, so: i.so, it: i.it, lines: i.l || [], rb: i.rb, fl: i.fl, foot: `<span></span>${tag}${wearIt(i)}`});  // the socket line already says where it goes
  return `<a class="tile" href="${U.item(i.s)}" data-tip="${i.s}" data-notip>${artBox(i)}${tip(i)}<div class="foot">${esc(srcLine(i))}${tag}${wearIt(i)}</div></a>`;
}

// A runeword card, as diablo2.io draws one: name, where it came from, its runes in socketing order, the level, then the
// sockets and bases it goes in, then its stats. The finder, the map, the database and the calculator share it.
const SOCKETS = {2: [[7, 3.5], [7, 10.5]], 3: [[7, 2], [7, 7], [7, 12]], 4: [[4, 4], [10, 4], [4, 10], [10, 10]],
  5: [[3.5, 3], [10.5, 3], [7, 7], [3.5, 11], [10.5, 11]], 6: [[4, 2], [10, 2], [4, 7], [10, 7], [4, 12], [10, 12]]};  // the game's socket layouts
const sockGlyph = n => `<svg class="sockg" viewBox="0 0 14 14" aria-hidden="true">${(SOCKETS[n] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.1"/>`).join("")}</svg>`;
const runeSeq = (runes, cls = () => "") => `<div class="rseq">${runes.map((r, k) => `${k ? "<i>▸</i>" : ""}<span class="${cls(r, k)}">${W.runeArt[r] ? `<img src="${U.art(W.runeArt[r])}" alt="">` : ""}${r}</span>`).join("")}</div>`;
const rwFrom = i => i.o === "loth" ? (i.ver === W.next ? "New in this build" : "Legacy of the Horadrim runeword") : `Patch ${esc(String(i.ver || "").replace(/^D2R /, ""))} runeword`;
const rwSock = (so, it) => `<div class="rwsock">${sockGlyph(so)}<span>${so} socket</span><b>${esc(it.replace(/ \/ /g, " · "))}</b></div>`;
const rwCard = c => `<a class="tile rwtile${c.cls ? " " + c.cls : ""}" href="${c.href}"${c.tip ? ` data-tip="${c.tip}" data-notip` : ""}>
  <div class="rwhead"><div class="nm">${esc(c.n)}</div><div class="from">${c.from}</div>${c.runes.length ? runeSeq(c.runes) : `<div class="rseq"><span>Runes to pick</span></div>`}<div class="req">Req level: ${c.rl}</div></div>
  ${rwSock(c.so, c.it)}<div class="d2tip q-rw"><div class="mods">${c.lines.map(l => `<div>${rng(l)}</div>`).join("")}</div>${runeBlocks(c.rb)}${c.fl ? `<div class="fl">${esc(c.fl)}</div>` : ""}</div>${c.foot ? `<div class="foot">${c.foot}</div>` : ""}</a>`;

const mini = s => { const i = BY[s]; return i ? `<a class="mini" href="${U.item(i.s)}" data-tip="${i.s}">${artBox(i)}<span class="q-${i.q}">${esc(i.n)}</span><small>${esc(i.t)}</small></a>` : ""; };

function stashTabs() {
  const tabs = $(".showcase-tabs");
  if (!tabs) return;
  const buttons = [...tabs.querySelectorAll("button")];
  const pick = button => buttons.forEach(b => {
    const selected = b === button, panel = document.getElementById(b.getAttribute("aria-controls"));
    b.setAttribute("aria-selected", selected);
    b.tabIndex = selected ? 0 : -1;
    panel.hidden = !selected;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", b.id);
  });
  tabs.addEventListener("click", e => { const b = e.target.closest("button"); if (b) pick(b); });
  tabs.addEventListener("keydown", e => {
    const at = buttons.indexOf(e.target);
    if (at < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const b = buttons[e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
    pick(b);
    b.focus();
  });
  pick(buttons[0]);
  tabs.hidden = false;
}

function hoverTips() {
  const box = document.createElement("div");
  box.id = "hover";
  box.popover = "manual";  // the top layer, so it shows over the item picker's dialog too
  document.body.append(box);
  let anchor;
  const show = e => {
    const a = e.target.closest("[data-tip], [data-fed-tip]");
    if (a === anchor || a?.contains(e.relatedTarget)) return;
    if (!a || a.hasAttribute("data-notip") || !BY[a.dataset.fedTip || a.dataset.tip]) return;
    anchor = a;
    box.innerHTML = tip(BY[a.dataset.fedTip || a.dataset.tip], {art: true, fed: a.dataset.fedTip ? JSON.parse(a.dataset.fed) : null,
      socks: a.dataset.socks ? JSON.parse(a.dataset.socks) : null, base: W.bases?.[a.dataset.base],
      ctx: a.dataset.who && window.tipCtx?.(a.dataset.who)});
    box.style.display = "block";
    if (box.matches(":popover-open")) box.hidePopover();
    box.showPopover();  // again each time, to sit above a dialog opened since
    const r = a.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + "px";
    box.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + "px";
  };
  const hide = () => { anchor = null; box.style.display = "none"; if (box.matches(":popover-open")) box.hidePopover(); };
  if (matchMedia("(hover: hover)").matches) {
    document.addEventListener("mouseover", show);
    document.addEventListener("mouseout", e => { const a = e.target.closest("[data-tip], [data-fed-tip]"); if (a && !a.contains(e.relatedTarget)) hide(); });
  }
  document.addEventListener("focusin", show);
  document.addEventListener("focusout", e => { const a = e.target.closest("[data-tip], [data-fed-tip]"); if (a && !a.contains(e.relatedTarget)) hide(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });
}

const notesUrl = v => U.page(v === W.next ? "notes" : "notes/" + v);
const release = v => v === W.next ? "this build" : `<a href="${notesUrl(v)}">${esc(v)}</a>`;
const fillTiles = () => {  // a generated body's item and recipe placeholders become tiles and recipe rows
  document.querySelectorAll(".slots").forEach(el => { el.className = "grid"; });
  document.querySelectorAll("span[data-item]").forEach(el => el.outerHTML = BY[el.dataset.item] ? tile(BY[el.dataset.item], {current: el.hasAttribute("data-current-item")}) : "");
  document.querySelectorAll("[data-recipes]").forEach(el => { const rx = new RegExp(el.dataset.recipes); el.innerHTML = W.recipes.filter(r => rx.test(r.t)).map(r => recipeRow(r)).join(""); });
};
const crumbs = parts => `<nav class="crumbs">${parts.map(([h, t]) => h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`).join("<i>›</i>")}</nav>`;
// "‹ Previous · Next ›" within the page's breadcrumb category (brief 098)
const pager = (list, cur, href) => { const k = list.indexOf(cur), p = list[k - 1], n = list[k + 1];
  return p || n ? `<nav class="pager">${p ? `<a href="${href(p)}">‹ ${esc(p.n)}</a>` : "<span></span>"}${n ? `<a href="${href(n)}">${esc(n.n)} ›</a>` : ""}</nav>` : ""; };
const panel = (title, body) => body ? `<section class="panel"><h2>${title}</h2>${body}</section>` : "";
// A cube recipe as its ingredients and result, each with its art where it's an item, or gear with art of its own ("Magic
// Ring"); gear like "Any Magic Armor" stays a word. An ingredient reads as its filters say (x.label: quality, tier,
// sockets), and the row ends with when it works (r.d: "Hell only"). mark: a class per ingredient (the cube planner's ok,
// miss, gear); when: false leaves the condition to the caller's own column.
const ichip = (s, text, cls = "", gear) => { const i = s && BY[s], a = i ? (i.q === "rw" ? W.runeArt[i.runes[0]] : i.a) : gear;
  const img = a ? `<img src="${U.art(a)}" alt="" loading="lazy">` : "";
  return s ? `<a class="ichip ${cls}" href="${U.item(s)}" data-tip="${s}">${img}<span class="q-${i?.q || "misc"}">${text}</span></a>` : `<span class="ichip gear ${cls}">${img}${text}</span>`; };
const recipeWhen = (r, any = "") => r.d ? `<span class="rcond gate">${esc(r.d)}</span>` : any && `<span class="rcond">${any}</span>`;
const recipeRow = (r, mark = () => "", when = true) => `<div class="recipe">${r.in.map(x => ichip(x.s, `${x.qty > 1 ? x.qty + "× " : ""}${esc(x.label || x.name)}`, mark(x), x.a)).join("<i>+</i>")}<i class="to">→</i>${r.outs.length > 1 ? r.outs.map(x => ichip(x.s, `${x.qty > 1 ? x.qty + "× " : ""}${esc(x.label || x.name)}`)).join("<i>+</i>") : r.os ? ichip(r.os, esc(BY[r.os].n)) : `<span class="ichip out">${esc(r.t.split("→").pop().trim())}</span>`}${when ? recipeWhen(r) : ""}</div>`;

// design/dev-recipes.html: the dev kits in the Cube recipes page's rail and rows, by status and category; each row
// ends with its status, its cube spaces and why (tools/wiki/dev_recipes.py).
function devRecipes(rows) {
  const st = {q: "", s: "", c: ""}, chip = (k, v, t) => fPill(k, v, t, st[k] === v);
  const statuses = ["Broken", "Retire", "Failed in play", "Passed", "Untested"], cats = [...new Set(rows.map(r => r.cat))];
  $("#dr").innerHTML = `<div class="dbwrap"><aside class="rail" id="rail"><input id="crq" type="search" placeholder="Filter by ingredient, result or source…" aria-label="Filter dev recipes">${fToggle(false)}
    <div class="facets"><h3>Status</h3><div class="pills" id="drs"></div><h3>Category</h3><div class="pills" id="drc"></div></div></aside>
    <div class="results"><h2 class="sec">Dev recipes <small id="cra"></small></h2><div class="cr-list"><div class="cr-hd"><span>Recipe</span><span>Status</span><span>Spaces and why</span></div><div id="crr"></div></div></div></div>`;
  const draw = () => {
    $("#drs").innerHTML = chip("s", "", "Every status") + statuses.map(s => chip("s", s, s)).join("");
    $("#drc").innerHTML = chip("c", "", "Every category") + cats.map(c => chip("c", c, c)).join("");
    const q = st.q.trim().toLowerCase(), hit = r => (!q || [r.d, r.src, r.why, ...r.in.map(x => x.name)].join(" ").toLowerCase().includes(q))
      && (!st.s || r.st === st.s) && (!st.c || r.cat === st.c);
    const rs = rows.filter(hit), open = !!(q || st.s || st.c);
    $("#cra").textContent = `${rs.length} of ${rows.length}`;
    $("#crr").innerHTML = cats.map(c => { const g = rs.filter(r => r.cat === c);
      return g.length ? fold("dr-" + slugify(c), `${esc(c)} <small>${g.length}</small>`, g.map(r => `<div class="cr-row" title="${esc(r.d)} · ${esc(r.src)}">${recipeRow(r, undefined, false)}`
        + `<span class="rcond dr-${slugify(r.st)}">${esc(r.st)}</span><small>${r.sp} space${r.sp === 1 ? "" : "s"}${r.why ? " · " + esc(r.why) : ""}</small></div>`).join(""), {open: open || undefined}) : ""; }).join("")
      || `<p class="empty">No dev recipe matches.</p>`;
  };
  $("#rail").addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b) { st[b.dataset.k] = b.dataset.v; draw(); $(`#rail [data-k="${b.dataset.k}"][data-v="${CSS.escape(b.dataset.v)}"]`).focus(); } });
  fWire($("#rail"));
  $("#crq").oninput = e => { st.q = e.target.value; draw(); };
  draw();
}

function oilCrafting() {
  const root = $("[data-oil-crafting]");
  if (!root) return;
  const pickers = [...root.querySelectorAll(".oc-picker")], panels = [...root.querySelectorAll("[data-oc-panel]")];
  const defaults = Object.fromEntries(pickers.map(p => [p.dataset.view, p.querySelector("button").dataset.pick]));
  const selected = {...defaults};
  let view = "oil";
  const draw = () => {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (!hash.size) Object.assign(selected, defaults);
    view = hash.get("view") === "item" || (!hash.has("view") && hash.has("item")) ? "item" : "oil";
    for (const picker of pickers) {
      const key = picker.dataset.view, value = hash.get(key);
      if ([...picker.children].some(b => b.dataset.pick === value)) selected[key] = value;
      picker.hidden = key === "item" && view !== "item";
      for (const button of picker.children) {
        const on = button.dataset.pick === selected[key];
        button.classList.toggle("on", on);
        button.setAttribute("aria-selected", on);
        button.tabIndex = on ? 0 : -1;
      }
    }
    panels.forEach(p => { p.hidden = p.dataset.ocPanel !== view || p.dataset.pick !== selected[view]; });
    root.querySelector("[data-oc-heading]").textContent = panels.find(p => !p.hidden).dataset.name;
    root.querySelectorAll("[data-oc-view]").forEach(b => {
      const on = b.dataset.ocView === view;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
    });
  };
  const save = () => { location.hash = new URLSearchParams({view, [view]: selected[view]}).toString(); };
  root.addEventListener("click", e => {
    const button = e.target.closest("button");
    if (button?.dataset.ocView) { view = button.dataset.ocView; save(); }
    else if (button?.dataset.pick) { view = button.closest(".oc-picker").dataset.view; selected[view] = button.dataset.pick; save(); }
  });
  root.addEventListener("keydown", e => {
    const button = e.target.closest(".oc-picker button");
    if (!button || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const buttons = [...button.parentElement.children], index = buttons.indexOf(button);
    const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click(); buttons[next].focus();
  });
  window.addEventListener("hashchange", draw);
  draw();
}

function bindingBlades() {  // the craft matrix: a blade's button shows its panel; the hash keeps the pick
  const root = $("[data-binding-blades]");
  if (!root) return;
  const buttons = [...root.querySelectorAll(".bb-blade")], panels = [...root.querySelectorAll(".bb-panel")];
  let lastButton = buttons[0];
  const draw = () => {
    const hash = location.hash.slice(1), pick = buttons.some(b => b.dataset.pick === hash) ? hash : buttons[0].dataset.pick;
    buttons.forEach(b => { const on = b.dataset.pick === pick; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    panels.forEach(p => { p.hidden = p.dataset.pick !== pick; });
  };
  root.addEventListener("click", e => {
    if (e.target.closest(".gg-back-to-choice")) { lastButton.focus({preventScroll:true}); lastButton.scrollIntoView({block:"center"}); return; }
    const b = e.target.closest(".bb-blade");
    if (b) {
      lastButton = b;
      history.replaceState(null, "", "#" + b.dataset.pick); draw();
      const heading = panels.find(p => !p.hidden).querySelector("h2");
      heading?.focus({preventScroll:true});
      if (innerWidth <= 1050) heading?.scrollIntoView({block:"start"});
    }
  });
  window.addEventListener("hashchange", draw);
  draw();
}

// ---------- pages ----------

const PAGES = {
  sitemap() {  // build.py sitemap() wrote every page by section; the box narrows them word by word, as the item database does
    $("#sm-q").oninput = e => { const words = e.target.value.toLowerCase().split(/\s+/).filter(Boolean);
      document.querySelectorAll(".sm-sec").forEach(sec => { let n = 0;
        sec.querySelectorAll("li").forEach(li => { li.hidden = !words.every(w => li.textContent.toLowerCase().includes(w)); n += !li.hidden; });
        sec.hidden = !n; sec.querySelector("small").textContent = n; }); };
  },
  home() {
    const gear = (q, title, href) => {
      const fresh = W.items.filter(i => i.o === "loth" && i.q === q && (i.a || i.runes)).sort((a, b) => (b.ver === W.next) - (a.ver === W.next) || String(b.ver || "").localeCompare(String(a.ver || ""), undefined, {numeric: true}) || b.rl - a.rl).slice(0, 4);
      const count = W.items.filter(i => i.o === "loth" && i.q === q).length;
      return `<section><div class="hm-gear-head"><h3>${title}</h3><span>${count}</span></div><div class="hm-wnu">${fresh.map(i => `<a href="${U.item(i.s)}" data-tip="${i.s}">${artBox(i)}<span class="q-${i.q}">${esc(i.n)}</span></a>`).join("")}</div><a class="pill" href="${href}">Browse ${title.toLowerCase()} →</a></section>`;
    };
    $(".hm-wn").insertAdjacentHTML("beforeend", `<div class="hm-gear">${gear("unique", "Uniques", U.db("c=Uniques"))}${gear("rw", "Runewords", U.page("runewords") + "?o=loth&sort=new")}</div>`);
  },

  db() {
    const p = new URLSearchParams(location.search);
    const st = {q: p.get("q") || "", c: p.get("c") || "", t: p.get("t") || "", cls: p.get("cls") || "", lvl: p.get("lvl") || "",
      f: (p.get("f") || "").split(",").filter(Boolean), src: (p.get("src") || "").split(",").filter(Boolean), era: (p.get("era") || "").split(",").filter(Boolean),
      hist: (p.get("hist") || "").split(",").filter(Boolean), sort: p.get("sort") || "rl"};
    const inCat = i => !st.c || (st.c === "Currency" ? MISC_FAMS.includes(i.fam) : st.c === "Gear" ? i.q !== "misc" || i.fam === "Quivers" || i.jewellery : i.fam === st.c);
    const lab = Object.fromEntries(Object.values(W.facets).flat());
    $("#main").innerHTML = `${crumbs([[U.page("index"), "Home"], [null, st.c ? dbSec(st.c) : "Gear"]])}<div class="catalog-head"><h1>${esc(CATS.find(c => c[0] === st.c)?.[1] || "Gear")}</h1><nav class="tool-links" aria-label="Gear tools"><a class="pill" href="${U.page("runewords")}">Find a runeword</a><a class="pill" href="${U.page("builds")}">Plan a build</a></nav></div><div class="dbwrap"><aside class="rail" id="rail"></aside><div class="results"><div class="bar" id="bar"></div><div id="res"></div><div id="more"></div></div></div>`;
    const sync = (rail = true) => {
      clearTimeout(searchTimer);
      limit = STEP;
      const u = new URLSearchParams();
      for (const [k, v] of Object.entries(st)) if ((v === true || v.length) && !(k === "sort" && v === "rl")) u.set(k, Array.isArray(v) ? v.join(",") : v === true ? "1" : v);
      history.replaceState(null, "", "?" + u);
      draw(rail);
    };
    const STEP = 100;
    let limit = STEP, searchTimer;
    let opened, showFilters = [st.t, st.cls, st.lvl, ...st.f, ...st.src, ...st.era, ...st.hist].some(Boolean), shown = [], sel;
    let era;
    const more = () => { $("#more").innerHTML = shown.length > limit ? `<button type="button" class="pill" data-db-more>Show ${Math.min(STEP, shown.length - limit)} more</button>` : ""; };
    const paint = () => {  // the list (the default) or the cards on their slot shelves, as the reader last chose
      if (!shown.slice(0, limit).some(i => i.s === sel)) sel = shown[0]?.s;
      $("#res").innerHTML = !shown.length ? `<p class="empty">Nothing matches. Remove a filter.</p>`
        : VIEW() === "list" ? ledger(shown.slice(0, limit), sel, era) : shelves(shown.slice(0, limit), i => tile(i, {tags: true}));
      more();
    };
    $("#more").onclick = e => {
      if (!e.target.closest("[data-db-more]")) return;
      const next = shown.slice(limit, limit + STEP);
      limit += STEP;
      if (VIEW() === "list") $('[role="listbox"]', $("#res")).insertAdjacentHTML("beforeend", next.map(i => ledRow(i, false, era)).join(""));
      else {
        const holder = document.createElement("div"), res = $("#res");
        holder.innerHTML = shelves(shown.slice(0, limit), () => "");
        for (const grid of holder.querySelectorAll(".grid")) {
          const old = $(`[data-shelf="${CSS.escape(grid.dataset.shelf)}"]`, res);
          if (old) grid.append(...old.children);
          const batch = next.filter(i => shelfName(i) === grid.dataset.shelf);
          grid.insertAdjacentHTML("beforeend", batch.map(i => tile(i, {tags: true})).join(""));
        }
        res.replaceChildren(...holder.childNodes);
      }
      more();
    };
    ledgerKeys($("#res"), s => {
      if (s === sel) return;
      sel = s;
      const res = $("#res"), row = $(`.led-row[data-s="${CSS.escape(s)}"]`, res);
      for (const r of res.querySelectorAll(".led-row.on")) { r.classList.remove("on"); r.setAttribute("aria-selected", "false"); }
      row.classList.add("on");
      row.setAttribute("aria-selected", "true");
      $(".led-inl", res)?.remove();
      const panel = ledPanel(BY[s]);
      row.insertAdjacentHTML("afterend", `<div class="led-inl">${panel}</div>`);
      $(".led-tip", res).innerHTML = panel;
    });
    onView(paint);
    const draw = (redrawRail = true) => {
      const words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
      const base = W.items.filter(inCat);
      const types = [...new Set(base.map(i => i.t))].sort();
      const res = base.filter(i => (!st.t || i.t === st.t) && (!st.cls || i.cls === st.cls) && (!st.lvl || i.rl <= +st.lvl)
        && st.f.every(f => i.f.includes(f)) && (!st.src.length || st.src.some(s => i.sk.includes(s))) && (!st.era.length || st.era.includes(i.era))
        && st.hist.every(h => h === "loth" ? i.chg || i.o === "loth" : i.v33) && words.every(w => itemHay(i).includes(w)))
        .sort((a, b) => (words.length ? (a.o !== "loth") - (b.o !== "loth") : 0) || (st.sort === "n" ? a.n.localeCompare(b.n) : st.sort === "il" ? b.il - a.il : (a.q === "misc") - (b.q === "misc") || a.rl - b.rl || a.n.localeCompare(b.n)));  // gear before currency
      res.unshift(...unseal(st.q));  // a secret item answers its exact name alone
      const on = (k, v, multi) => multi ? st[k].includes(v) : st[k] === v;
      const pill = (k, v, t, multi) => fPill(k, v, t, on(k, v, multi), multi);
      // the filters in a rail beside the list, each group under its heading; on a phone they fold behind Filters
      if (redrawRail) {
        const rail = $("#rail"), top = rail.scrollTop;  // the rail redraws on every change: keep its scroll and the stat groups the reader opened
        opened = new Set([...rail.querySelectorAll("details[open] summary")].map(x => x.textContent).concat(rail.childElementCount ? [] : ["Offensive"]));
        const n = [st.t, st.cls, st.lvl, ...st.f, ...st.src, ...st.era, ...st.hist].filter(Boolean).length;  // what Filters hides
        rail.classList.toggle("open", showFilters);
        rail.innerHTML = `<input id="q" type="search" placeholder="Filter by name, stat, place…" aria-label="Filter items" value="${esc(st.q)}">${fToggle(showFilters, n)}
          <div class="facets"><h3>Category</h3><div class="pills">${CATS.map(([c, t]) => pill("c", c, t)).join("")}</div>
          <h3>Type</h3>${combo("type", [["", "Any type"], ...types.map(t => [t, t, W.items.find(i => i.t === t && i.a)?.a])], st.t)}
          <p><a data-affix-link href="${U.guide("affixes")}${st.t ? "?typeName=" + encodeURIComponent(st.t) : ""}">Magic and rare affixes →</a></p>
          <h3>Class only</h3><div class="pills">${pill("cls", "", "Any")}${CLASSES.map(c => pill("cls", c, c)).join("")}</div>
          <h3>Usable at level</h3><input id="lvl" type="number" min="1" max="99" placeholder="Any" aria-label="Usable at level" value="${esc(st.lvl)}">
          <h3>Era</h3><div class="pills">${ERAS.map(([e, t]) => pill("era", e, t, true)).join("")}</div>
          <h3>History</h3><div class="pills">${pill("hist", "loth", "Changed in LotH", true)}${pill("hist", "v33", "Changed in 3.3", true)}</div>
          <h3>Where it comes from</h3><div class="pills">${SOURCES.map(([k, t]) => pill("src", k, t, true)).join("")}</div>
          ${Object.entries(W.facets).map(([g, fs]) => `<details${fs.some(([k]) => st.f.includes(k)) || opened.has(g) ? " open" : ""}><summary>${g}</summary><div class="pills">${fs.map(([k, t]) => pill("f", k, t, true)).join("")}</div></details>`).join("")}
          </div>`;
        rail.scrollTop = top;
      }
      const active = [st.q && ["q", `“${st.q}”`], st.t && ["t", st.t], st.cls && ["cls", st.cls], st.lvl && ["lvl", `level ≤ ${st.lvl}`],
        ...st.src.map(s => ["src:" + s, SOURCES.find(x => x[0] === s)[1]]), ...st.era.map(e => ["era:" + e, e]), ...st.hist.map(h => ["hist:" + h, h === "loth" ? "Changed in LotH" : "Changed in 3.3"]), ...st.f.map(f => ["f:" + f, lab[f]])].filter(Boolean);
      const ours = res.filter(i => i.o === "loth").length;
      $("#bar").innerHTML = `<b>${res.length}</b> ${res.length === 1 ? "item" : "items"}${ours < res.length ? ` <span class="split"><span class="tag loth">LotH</span> ${ours} · <span class="tag">D2</span> ${res.length - ours}</span>` : ""}${active.map(([k, t]) => `<button class="chip" data-x="${k}">${esc(t)} ✕</button>`).join("")}
        ${active.length ? `<button class="chip reset" data-x="all">Reset</button>` : ""}
        ${combo("sort", [["rl", "Sort: required level"], ["n", "Sort: name"], ["il", "Sort: item level"]], st.sort || "rl", "end")}${viewToggle()}`;
      shown = res;
      era = shown.some(i => i.era !== shown[0].era);
      paint();
      wire();
    };
    const wire = () => {
      $("#q").oninput = e => { st.q = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => sync(false), 120); };
      $("#type").onchange = e => { st.t = e.target.value; sync(); };
      $("#lvl").onchange = e => { st.lvl = e.target.value; sync(); };
      $("#sort").onchange = e => { st.sort = e.target.value; sync(); };
      fWire($("#rail"), o => showFilters = o);
      document.querySelectorAll("#rail .pill[data-k]").forEach(b => b.onclick = () => {
        const {k, v} = b.dataset;
        if (b.hasAttribute("data-m")) st[k] = st[k].includes(v) ? st[k].filter(x => x !== v) : [...st[k], v];
        else { st[k] = v; if (k === "c") st.t = ""; }
        sync();
        $(`#rail [data-k="${k}"][data-v="${CSS.escape(v)}"]`).focus();  // the rail redraws: keep the reader's place for Tab and the D-pad
      });
      document.querySelectorAll("#bar .chip").forEach(b => b.onclick = () => {
        const [k, v] = b.dataset.x.split(":");
        if (k === "all") Object.assign(st, {q: "", t: "", cls: "", lvl: "", f: [], src: [], era: [], hist: []});
        else if (v) st[k] = st[k].filter(x => x !== v); else st[k] = "";
        sync();
      });
    };
    draw();
  },

  search() { searchPage(new URLSearchParams(location.search).get("q") || ""); },
  notfound() {  // the host serves 404.html at the broken address: search for its last part's words
    const path = decodeURIComponent(location.pathname), last = path.split("/").filter(Boolean).pop() || "";
    searchPage(last === "404.html" ? "" : last.replace(/\.html?$/, "").replace(/[-_+.]/g, " "), path);
  },

  runewords() {  // the finder as a ledger: runes and bases in fixed columns, the picked word's tooltip beside them
    const p = new URLSearchParams(location.search), list = k => (p.get(k) || "").split(",").filter(Boolean);
    const st = {q: p.get("q") || "", b: p.get("b") || "", so: list("so"), r: list("r"), o: list("o"), only: p.get("only") === "1", lvl: p.get("lvl") || "",
      era: list("era"), hist: list("hist"), f: list("f"), sort: p.get("sort") || "rl"};
    const rws = W.items.filter(i => i.q === "rw");
    const onBase = Object.fromEntries(W.rwmap.rows.map(r => [r.n, new Set(r.w.map(([k]) => W.rwmap.words[k].s).filter(Boolean))]));
    const newest = i => i.o === "loth" ? 99 : ERAS.findIndex(([e]) => e === i.era);
    const some = f => rws.some(f);  // offer only filters some runeword can meet (no Classic runewords, no Experience stat…)
    st.hist = st.hist.filter(h => h === "loth" && some(i => i.chg));  // a stale ?hist= with no pill to clear it would hide every runeword
    const img = a => a ? `<img src="${U.art(a)}" alt="">` : "";
    const pill = fPill;  // draw() marks the ones that are on
    const STEP = 12;  // about one screen of rows; Show more pages on, as the item database does
    let sel, limit = STEP;
    $("#main").innerHTML = `${crumbs([[U.page("index"), "Home"], [null, "Runewords"]])}<div class="catalog-head"><h1>Find a runeword</h1>
      <nav class="tool-links" aria-label="Rune tools"><a class="pill" href="${U.tool("runewords")}">Rune bench</a><a class="pill" href="${U.guide("runes")}">Rune upgrades</a><a class="pill" href="${RWMAP}">Runeword map</a></nav></div>
      <div class="dbwrap"><aside class="rail" id="rail"><input id="q" type="search" placeholder="Name, rune or stat…" aria-label="Filter runewords" value="${esc(st.q)}">${fToggle(false)}
        <div class="facets"><h3>Sockets</h3><div class="pills">${[2, 3, 4, 5, 6].map(n => pill("so", String(n), n)).join("")}</div>
        <h3>From</h3><div class="pills">${pill("o", "loth", "Legacy of the Horadrim")}${pill("o", "vanilla", "Diablo II")}</div>
        <h3>Base type</h3>${combo("base", [["", "Any base"], ...W.rwmap.rows.map(r => [r.n, r.n, W.baseArt[r.n]])], st.b)}
        <h3>Usable at level</h3><input id="lvl" type="number" min="1" max="99" placeholder="Any" aria-label="Usable at level" value="${esc(st.lvl)}">
        <h3>Era</h3><div class="pills">${ERAS.filter(([e]) => some(i => i.era === e)).map(([e, t]) => pill("era", e, t)).join("")}</div>
        ${some(i => i.chg) ? `<h3>History</h3><div class="pills">${pill("hist", "loth", "Changed in LotH")}</div>` : ""}
        ${Object.entries(W.facets).map(([g, fs]) => [g, fs.filter(([k]) => some(i => i.f.includes(k)))]).filter(([, fs]) => fs.length)
          .map(([g, fs]) => `<details${fs.some(([k]) => st.f.includes(k)) ? " open" : ""}><summary>${g}</summary><div class="pills">${fs.map(([k, t]) => pill("f", k, t)).join("")}</div></details>`).join("")}
        <h3>Rune</h3>${combo("rune", [["", "Any rune"], ...W.runes.map(r => [r, r, W.runeArt[r]])], st.r.length === 1 ? st.r[0] : "")}
        <h3>Runes you have</h3><div class="rwf-runes" role="group" aria-label="Runes you have">${W.runes.map(r => `<button type="button" class="rwf-rn" data-k="r" data-v="${r}" data-tip="${runeSlug(r)}">${img(W.runeArt[r])}<span>${r}</span></button>`).join("")}</div>
        <label class="chk"><input type="checkbox" id="only"${st.only ? " checked" : ""}> Only these runes</label></div></aside>
      <div class="results"><div class="bar" id="bar"></div><div id="res"></div><p id="more"></p></div></div>`;
    const panel = i => `${tile(i, {tags: true})}<div class="led-go"><a class="pill" href="${U.tool("runewords")}#${i.runes.join(",")}">Check my runes</a><a class="pill" href="${U.page("builds")}#wear=${i.s}">Plan a build</a></div>`;
    const row = i => `<button type="button" class="led-row${i.s === sel ? " on" : ""}" role="option" aria-selected="${i.s === sel}" data-s="${i.s}">
      <span class="led-n"><b class="q-rw">${esc(i.n)}</b><small>${rwFrom(i)}</small></span>
      <span class="rwl-r">${i.runes.map(r => `<span${st.r.includes(r) ? ' class="have"' : ""}>${img(W.runeArt[r])}${r}</span>`).join("")}</span>
      <span class="rwl-b"><span>${sockGlyph(i.so)}<b>${i.so}</b></span>${i.it.split(" / ").map(t => `<span>${img(W.baseArt[t])}${esc(t)}</span>`).join("")}</span>
      <span class="led-l">${i.rl}</span><span class="led-m">${(i.l || []).slice(0, 2).map(esc).join("<br>")}</span></button>${i.s === sel ? `<div class="led-inl">${panel(i)}</div>` : ""}`;
    const draw = () => {
      const u = new URLSearchParams();
      for (const [k, v] of Object.entries(st)) if ((v === true || v.length) && !(k === "sort" && v === "rl")) u.set(k, Array.isArray(v) ? v.join(",") : v === true ? "1" : v);
      history.replaceState(null, "", "?" + u);
      document.querySelectorAll("#rail [data-k]").forEach(b => { const on = st[b.dataset.k].includes(b.dataset.v); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
      const words = st.q.toLowerCase().split(/\s+/).filter(Boolean), dir = st.sort[0] === "-" ? -1 : 1, key = st.sort.replace("-", "");
      const res = rws.filter(i => (!st.b || onBase[st.b]?.has(i.s)) && (!st.so.length || st.so.includes(String(i.so))) && (!st.lvl || i.rl <= +st.lvl) && (!st.o.length || st.o.includes(i.o))
        && (!st.era.length || st.era.includes(i.era)) && st.hist.every(() => i.chg) && st.f.every(f => i.f.includes(f))
        && (st.only ? i.runes.every(r => st.r.includes(r)) : st.r.every(r => i.runes.includes(r))) && words.every(w => itemHay(i).includes(w)))
        .sort((a, b) => dir * (key === "n" ? a.n.localeCompare(b.n) : key === "new" ? newest(b) - newest(a) : a[key] - b[key]) || a.rl - b.rl || a.n.localeCompare(b.n));
      const shown = res.slice(0, limit);
      if (!shown.some(i => i.s === sel)) sel = shown[0]?.s;
      const ours = res.filter(i => i.o === "loth").length, any = st.q || st.b || st.lvl || st.only || st.so.length || st.r.length || st.o.length || st.era.length || st.hist.length || st.f.length;
      $("#bar").innerHTML = `<b>${res.length}</b> ${res.length === 1 ? "runeword" : "runewords"} <span class="split"><span class="tag loth">LotH</span> ${ours} · <span class="tag">D2</span> ${res.length - ours}</span>${any ? `<button type="button" class="chip reset" id="reset">Clear filters</button>` : ""}
        ${combo("sort", [["rl", "required level"], ["-rl", "required level, highest first"], ["n", "name"], ["-n", "name, Z to A"], ["so", "sockets"], ["-so", "sockets, most first"], ["new", "newest first"]].map(([v, t]) => [v, "Sort: " + t]), st.sort, "end")}${viewToggle()}`;
      const hd = (k, t) => `<button type="button" data-sort="${k}"${key === k ? ` class="on" aria-label="${t}, sorted ${dir > 0 ? "up" : "down"}"` : ""}>${t}${key === k ? (dir > 0 ? " ▲" : " ▼") : ""}</button>`;
      $("#res").innerHTML = !res.length ? `<p class="empty">No runeword fits. Remove a filter.</p>`
        : VIEW() === "cards" ? shelves(shown, i => tile(i, {tags: true})) : `<div class="led rwl"><div><div class="led-hd"><span>${hd("n", "Runeword")}</span><span class="rwl-x">Runes, in order</span><span>${hd("so", "Sockets · bases")}</span><span>${hd("rl", "Req. level")}</span><span class="rwl-x">What it gives</span></div>
          <div role="listbox" aria-label="Runewords">${shown.map(row).join("")}</div></div><aside class="led-tip">${panel(BY[sel])}</aside></div>`;
      const pickedRune = st.r.length === 1 ? st.r[0] : "";
      $("#rune .cb").innerHTML = `${pickedRune ? img(W.runeArt[pickedRune]) : ""}<span>${pickedRune || "Any rune"}</span><i>▾</i>`;
      $("#rune").dataset.v = pickedRune;
      document.querySelectorAll("#rune [data-cv]").forEach(b => b.classList.toggle("on", b.dataset.cv === pickedRune));
      $("#more").innerHTML = res.length > limit ? `<button type="button" class="pill" id="morebtn">Show ${Math.min(STEP * 2, res.length - limit)} more</button>` : "";
    };
    const redo = () => { limit = STEP; draw(); };  // a new filter starts from the top of its list
    $("#rail").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (!b) return; const {k, v} = b.dataset; st[k] = st[k].includes(v) ? st[k].filter(x => x !== v) : [...st[k], v]; redo(); });
    $("#rune").addEventListener("change", e => { st.r = e.currentTarget.dataset.v ? [e.currentTarget.dataset.v] : []; redo(); });
    $("#base").addEventListener("change", e => { st.b = e.currentTarget.dataset.v; redo(); });
    $("#q").oninput = e => { st.q = e.target.value; redo(); };
    $("#lvl").onchange = e => { st.lvl = e.target.value; redo(); };
    $("#only").onchange = e => { st.only = e.target.checked; redo(); };
    $("#more").onclick = e => { if (e.target.id === "morebtn") { limit += STEP * 2; draw(); } };
    fWire($("#rail"));
    $("#bar").addEventListener("click", e => { if (e.target.id === "reset") location.href = U.page("runewords"); });
    $("#bar").addEventListener("change", e => { if (e.target.id === "sort") { st.sort = e.target.dataset.v; draw(); } });
    $("#res").addEventListener("click", e => {
      const s = e.target.closest("[data-sort]");
      if (s) { st.sort = st.sort === s.dataset.sort ? "-" + s.dataset.sort : s.dataset.sort; draw(); $(`[data-sort="${s.dataset.sort}"]`).focus(); }
    });
    onView(draw);
    ledgerKeys($("#res"), s => { sel = s; draw(); });
    draw();
  },

  item() {
    const i = BY[KEY];
    const mechanics = $("#item-mechanics")?.outerHTML || "";
    const affixLink = $("[data-affix-link]")?.outerHTML || "";
    const fam = MISC_FAMS.includes(i.fam) ? "Currency" : i.fam;
    const made = W.recipes.filter(r => r.outs.some(x => x.s === i.s)), used = W.recipes.filter(r => r.in.some(x => x.s === i.s || x.ss?.includes(i.s)));
    const rune = i.fam === "Runes" && i.n.replace(/ Rune$/, ""), chain = rune && runeInfo(rune);
    const rws = rune ? W.items.filter(x => x.q === "rw" && x.runes.includes(rune)) : [];
    const grades = i.fam === "Gems" ? W.items.filter(x => x.fam === "Gems" && x.t === i.t).sort((a, b) => a.rl - b.rl) : [];
    const opens = W.bosses.filter(b => b.st === "built" && b.keys.some(k => k.s === i.s));
    const similar = rune || grades.length ? [] : [...new Map(W.items.filter(x => x.n !== i.n && x.t === i.t && x.fam === i.fam && (x.o === "loth" || i.o === "vanilla"))
      .sort((a, b) => Math.abs(a.rl - i.rl) - Math.abs(b.rl - i.rl)).map(x => [x.n, x])).values()].slice(0, 6);  // a unique's variants (The Canticle's auras) show once
    const set = i.set && W.sets[i.set];
    const bare = !i.l.length && !i.desc && !i.gl;  // nothing for the tooltip to say: it carries the answer and the stash slot, as the game's description would
    const facts = [chain?.rank && ["Rune", "#" + chain.rank], i.il && ["Item level", i.il],
      i.base?.sock && ["Max sockets", i.base.sock], i.st && !bare && ["Stash", i.st], i.era && ["From", i.o === "loth" ? i.era : `${i.era} (${i.ver})`], W.spins?.[i.s] && ["Whirlwind", W.spins[i.s]], W.spellLevels?.[i.s] && ["Spell levels", W.spellLevels[i.s]]].filter(Boolean);
    const where = whereList(i);
    const sec = itemSec(i);
    $("#main").innerHTML = crumbs([[U.page("index"), "Home"], [{Runewords: U.page("runewords"), Crafting: U.page("recipes"), Endgame: U.guide("sigils")}[sec] || U.db("c=Gear"), sec], [U.db("c=" + fam), CATS.find(c => c[0] === fam)?.[1] || fam],
      ...i.q === "rw" ? [] : [[U.db(`c=${fam}&t=${encodeURIComponent(i.t)}`), i.t]], [null, i.n]].filter((c, k, a) => !k || c[1] !== a[k - 1][1]))  // no "Runewords › Runewords"
      + (i.ans && !bare ? `<p class="ia-ans">${esc(i.ans)}</p>` : "")
      + `<div class="itempage"><div class="lead">${artBox(i, true)}${tip(bare ? {...i, desc: [i.st, i.ans].filter(Boolean).join("\n")} : i)}
        ${i.q === "rw" ? `<a class="pill" href="${U.tool("runewords")}#${i.runes.join(",")}">Check my runes</a>` : ""}
        ${(g => g ? `<a class="pill" href="${U.guide(g[0]) + (g[2] || "")}">${g[1]}</a>` : "")(  // the guides off the menus link from their items
          i.fam === "Quivers" ? ["quivers", "Quiver families and affixes"] : i.s === "horadric-vault-sigil" ? ["new-encounters", "The Horadric Vault", "#horadric-vault"] : rune ? ["runes", "Runes and upgrading"] : i.fam === "Gems" ? ["gems", "Gems"] : i.fam === "Essences" || /^Token/.test(i.n) ? ["essences", "Essences and the Token"]
          : / Worldstone Shard$/.test(i.n) ? ["terror", "Worldstone Shards", "#worldstone-shards"] : i.fam === "Stone fragments" ? ["stones", "the Fractured Halls", "#the-fractured-halls"]
          : /^The (Wordless|Whispering|Chanting|Commanding)$/.test(i.n) ? ["endgame", "the Wordless", "#the-wordless"]
          : i.s === "hellforge-ember" ? ["corruption", "Corruption: outcomes and chances"] : W.blades?.includes(i.s) ? ["blades", "Binding Blades guide"] : null)}
        ${W.reagentGuides[i.s] ? `<a class="pill" href="${U.guide("currency")}#${W.reagentGuides[i.s]}">How the rolls work</a><a class="pill" href="${U.guide("currency")}#craft-${i.s}">Reagent recipes</a>` : ""}
        ${affixLink}
        ${W.oilIngredients?.includes(i.mc) ? `<a class="pill" href="${U.guide("oils")}">Used in Oil crafting</a>` : ""}
        ${["unique", "set", "rw"].includes(i.q) ? `<a class="pill" href="${U.page("builds")}#wear=${i.s}">Plan a build</a>` : ""}</div><div class="side">
        ${facts.length ? panel("At a glance", `<dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`) : ""}
        ${i.q !== "rw" ? panel("Where to find it", '<span id="where-to-find-it"></span>' + (where ? `${sourceRoutes(i)}<details class="item-sources"><summary>All sources and difficulties</summary><ul class="src">${where}</ul></details>` : made.length ? ""
          : i.il || i.q === "misc" ? `<p>Drop source not listed. Item level ${i.il || 1}.</p>` : "<p>Not a random drop.</p>")
          + (i.co ? `<p><a class="pill" href="${U.page("recipes")}">Made in the Horadric Cube</a></p>` : `<p><a class="pill online-drop" href="${ROOT}drops/${i.s}.html">Compare detailed drop odds →</a></p><p class="offline-drop">Detailed odds need a connection. Item sources above are saved offline.</p>`)) : ""}
        ${basesPanel(i)}
        ${panel("Opens the way to", opens.map(b => `<a href="${U.boss(b.s)}">${esc(b.n)}</a>`).join(", "))}
        ${chain?.rank ? panel("Before and after", `<div class="minis">${[chain.before, chain.after].filter(Boolean).map(r => mini(runeSlug(r))).join("")}</div>`) : ""}
        ${panel("Made in the Horadric Cube", made.map(r => recipeRow(r)).join(""))}
        ${panel("Used in the Horadric Cube", used.map(r => recipeRow(r)).join(""))}
        ${set ? panel(`Part of <a href="${U.set(set.s)}">${esc(set.n)}</a>`, setGrid(set, set.pieces.length) + `<div class="minis">${set.pieces.filter(s => s !== i.s).map(mini).join("")}</div>`) : ""}
        ${i.base?.type && i.base.type !== i.b ? panel("Base item", `<dl><dt>Type</dt><dd>${esc(i.base.type)}</dd></dl>`) : ""}
        ${panel("History", historyPanel(i))}
        ${panel("Similar items", similar.length ? `<div class="minis">${similar.map(x => mini(x.s)).join("")}</div>` : "")}
      </div></div>`
      + mechanics
      + (rws.length ? `<h2 class="sec">Runewords with ${esc(rune)} <small>${rws.length}</small></h2><div class="grid">${rws.map(x => tile(x, {tags: true})).join("")}</div>` : "")
      + (grades.length ? `<h2 class="sec">Every grade of ${esc(i.t)}</h2><div class="grid">${grades.map(x => tile(x)).join("")}</div>` : "")
      + (i.q === "rw" ? whereItSits(i) : "")
      + pager(W.items.filter(x => x.fam === i.fam && x.t === i.t).sort((a, b) => a.rl - b.rl || a.n.localeCompare(b.n)), i, x => U.item(x.s));
    if (KEY === W.moo?.k) mooClicks($(".itempage .art"));
    dataTips();
  },

  rwmap() { PAGES.design(); },

  design() {  // server-rendered; the runeword map's chart gets its tooltips, and a pressed dot shows its words
    fillTiles();
    document.querySelectorAll(".rwc[data-runes]").forEach(c => c.insertAdjacentHTML("afterbegin", c.dataset.runes.split(" ").filter(r => W.runeArt[r]).map(r => `<img src="${U.art(W.runeArt[r])}" alt="">`).join("")));
    const panel = $("#rwpanel"), {words, rows} = W.rwmap;
    const show = ws => { panel.innerHTML = ws.map(w => tile(BY[w.s], {tags: true})).join(""); };
    if (panel) {
      $(".rw").addEventListener("click", e => {
        const a = e.target.closest("a[data-row]");
        if (!a) return;
        e.preventDefault();
        show(rows[a.dataset.row].w.filter(x => x[1] === +a.dataset.lv && words[x[0]].c === a.dataset.colour).map(x => words[x[0]]));
        history.replaceState(null, "", a.getAttribute("href"));
        panel.scrollIntoView({block: "nearest"});
      });
      const linked = () => { const w = words.find(w => "#" + w.id === location.hash); if (w) { show([w]); panel.scrollIntoView({block: "nearest"}); } };
      linked(); addEventListener("hashchange", linked);
    }
    const dr = $("#dr-data");
    if (dr && $("#dr")) devRecipes(JSON.parse(dr.textContent));
    const dm = $(".dm");  // the drop map: a dot opens the hover's panel, with its sources, on a press or focus too
    if (dm) {
      const tipOf = a => { a.dispatchEvent(new MouseEvent("mouseover", {bubbles: true})); const p = document.createElement("p"); p.className = "dm-note"; p.textContent = a.title; $("#hover").append(p); };
      dm.addEventListener("click", e => { const a = e.target.closest("td a"); if (a) { e.preventDefault(); a.focus(); tipOf(a); } });
      dm.addEventListener("focusin", e => { const a = e.target.closest("td a"); if (a) tipOf(a); });
      dm.addEventListener("focusout", e => e.target.closest("td a")?.dispatchEvent(new MouseEvent("mouseout", {bubbles: true})));
    }
    dataTips();
  },

  set() {
    const s = W.sets[KEY], pieces = s.pieces.map(p => BY[p]), cls = pieces.find(p => p.cls !== "any")?.cls;
    const by = {};  // pieces that drop from the same places share one line
    for (const p of pieces) (by[whereList(p) || `<li>Drop source not listed. Item level ${p.il}.</li>`] ||= []).push(p);
    $("#main").innerHTML = crumbs([[U.page("index"), "Home"], [U.db("c=Gear"), "Gear"], [U.db("c=Sets"), "Sets"], [null, s.n]])
      + `<h1 class="q-set">${esc(s.n)}</h1><p class="lede">${pieces.length} pieces · required level ${[...new Set([Math.min(...pieces.map(p => p.rl)), Math.max(...pieces.map(p => p.rl))])].join("–")}${cls ? ` · ${esc(cls)} only` : ""}</p>`
      + `<div class="sp-row">${pieces.map(p => `<a class="tile" href="${U.item(p.s)}">${artBox(p)}${tip(p)}<div class="foot">${eraTag(p)}</div></a>`).join("")}</div>`
      + `<h2 class="sec">Set bonuses</h2>${setGrid(s, pieces.length)}`
      + panel("Where each piece drops", Object.entries(by).map(([w, ps]) => `<h3 class="sp-who">${ps.length === pieces.length ? "Every piece"
        : ps.map(p => `<a class="q-set" href="${U.item(p.s)}" data-tip="${p.s}">${esc(p.n)}</a>`).join(", ")}</h3><ul class="src">${w}</ul>`).join(""));
  },

  bosses() {  // the campaign's, ours, the legacy ubers': each with its levels by difficulty
    const levels = b => b.uber && !b.areas[0] ? `<span class="lv">Hell only</span>` : !b.areas[0] ? `<span class="lv">Any difficulty</span>`
      : b.uber || !b.areas[0].N ? `<span class="lv">Hell only · area level <b>${b.areas[0].H}</b></span>`
      : `<span class="lv">Area level ${[["Normal", b.areas[0].N], ["Nightmare", b.areas[0].NM], ["Hell", b.areas[0].H]].map(([d, l]) => `${d} <b>${l}</b>`).join(" · ")}</span>`;
    const hell = b => { const h = b.stats.Hell || {}, imm = immunities(h), bits = [h.lv && `monster level <b>${h.lv}</b>`, imm.length && `immune to ${imm.join(", ")}`].filter(Boolean);
      return bits.length ? `<span class="lv">Hell: ${bits.join(" · ")}</span>` : ""; };
    const href = b => U.boss(b.s);
    const card = b => `<a class="card boss" href="${href(b)}">${look(b, "small")}
      <b>${esc(b.n)}</b><p>${esc(b.how)}</p>${levels(b)}${hell(b)}
      <span class="icons">${b.drops.slice(0, 6).map(s => BY[s]?.a ? `<img src="${U.art(BY[s].a)}" alt="">` : "").join("")}</span></a>`;
    // one boss a row, so levels and immunities line up; no origin badge, as each group is one origin.
    // On a phone a row is 48 px: the name over one line of its Hell level, immunities and key; the boss's page has the rest
    const row = b => { const h = b.stats.Hell || {}, more = b.drops.length - 4, imm = immunities(h);
      const sub = [h.lv && `Hell · level ${h.lv}`, imm.length && `Immune to ${imm.map(n => n[0].toUpperCase() + n.slice(1)).join(", ")}`, b.keys.length && b.keys.map(k => k.n).join(", ")].filter(Boolean).join(" · ");
      return `<tr><td class="lb-a">${look(b, "row")}</td><td class="lb-n"><a href="${href(b)}">${esc(b.n)}</a>${sub ? `<small class="lb-sub">${esc(sub)}</small>` : ""}</td>
        <td data-l="Where">${esc(b.how)}</td><td data-l="Hell level" class="num">${h.lv || "—"}</td><td data-l="Immune" class="lb-im">${imm.join(", ") || "—"}</td>
        <td data-l="Opens with">${b.keys.map(k => k.s ? `<a href="${U.item(k.s)}" data-tip="${k.s}">${esc(k.n)}</a>` : esc(k.n)).join(", ") || "—"}</td>
        <td data-l="Drops">${b.drops.slice(0, 4).map(s => BY[s] ? `<a href="${U.item(s)}" data-tip="${s}">${BY[s].a ? `<img src="${U.art(BY[s].a)}" alt="${esc(BY[s].n)}">` : esc(BY[s].n)}</a>` : "").join("")
          + (more > 0 ? `<a class="lb-more" href="${href(b)}">+${more} more</a>` : "") || "—"}</td></tr>`; };
    const roster = bs => `<table class="lb"><thead><tr><th></th><th>Boss</th><th>Where</th><th class="num" title="Monster level in Hell">Hell level</th><th>Immune</th><th>Opens with</th><th>Drops</th></tr></thead><tbody>${bs.map(row).join("")}</tbody></table>`;
    // the Stone maps' own table, from wiki.json (stone-roster.json, the built superuniques, boss-sizes.json): a boss no zone preset places is the Design section's
    const stone = W.bosses.filter(b => b.tier != null);
    const srow = b => `<tr><td class="lb-a">${look(b, "row")}</td><td class="lb-n"><a href="${href(b)}">${esc(b.n)}</a></td>
      <td data-l="Tier">T${b.tier}</td><td data-l="Map">${esc(b.map)}</td>
      <td data-l="Size" class="num" title="Its body drawn at this scale">${b.size}×</td><td data-l="Drops from">${esc(b.tc?.Hell || "—")}</td></tr>`;
    const paint = () => { $("#main").innerHTML = crumbs([[U.page("index"), "Home"], [U.guide("endgame"), "Endgame"], [null, "Bosses"]]) + `<div class="vhead"><h1>Bosses</h1>${viewToggle()}</div><p class="lede">Where each boss waits, what opens the way, and what it drops.</p>`
      + BOSS_GROUPS.map(([g, lede, f, order]) => { const bs = W.bosses.filter(f).sort(order);
        return `<h2 class="sec">${g}</h2><p class="lede">${lede}</p>${VIEW() === "list" ? roster(bs) : `<div class="cards">${bs.map(card).join("")}</div>`}`; }).join("")
      + (stone.length ? `<h2 class="sec">The Sanctuary Stones</h2><p class="lede">Hell only. <a href="${U.guide("stones")}">Stone tiers and destinations</a>.</p>`
        + (VIEW() === "list" ? `<table class="lb"><thead><tr><th></th><th>Boss</th><th>Tier</th><th>Map</th><th class="num">Size</th><th>Drops from</th></tr></thead><tbody>${stone.map(srow).join("")}</tbody></table>` : `<div class="cards">${stone.map(card).join("")}</div>`) : ""); };
    onView(paint);
    paint();
  },

  boss() {  // the four facts a player checks before a fight in one strip; no column waits on the portrait
    const b = W.bosses.find(x => x.s === KEY), h = b.stats.Hell || {}, area = b.areas[0], num = n => n.toLocaleString("en");
    const encounter = {"gilded-fallen": "#gilded-fallen", "the-gilded-wretch": "#horadric-vault"}[b.s];
    const guide = encounter ? "new-encounters" : b.keys.some(k => /Sigil/.test(k.n)) ? "descent" : b.uber ? "endgame" : null;
    const pool = {
      "gilded-fallen": `<p data-reward-pool>Unique rewards are drawn from the <a href="${U.guide("new-encounters")}#its-hoard">Gilded Cache and Gilded Hoard pools</a>.</p>`,
      "the-gilded-wretch": `<p data-reward-pool>One random unique or set item from the <a href="${U.guide("new-encounters")}#horadric-vault">Horadric Vault prize pool</a>.</p>`,
    }[b.s] || "";
    const fact = (t, v, sub) => v ? `<div class="bp-fact"><small>${t}</small>${v}${sub ? `<span>${sub}</span>` : ""}</div>` : "";  // no number, no box
    const res = RESISTS.filter(([k]) => h[k] != null).map(([k, n]) => `<span class="bp-${k}">${n[0].toUpperCase() + n.slice(1)} ${h[k] >= 100 ? `<span class="immune">Immune</span>` : h[k] + "%"}</span>`).join("");
    $("#main").innerHTML = crumbs([[U.page("index"), "Home"], [U.guide("endgame"), "Endgame"], [U.page("bosses"), "Bosses"], [null, b.n]])
      + `<div class="bp-hero"><div><h1>${esc(b.n)}</h1>${area ? `<p class="bp-sub">${esc(area.n)}${b.uber ? " · Hell only" : ""}</p>` : ""}<div class="bp-facts">`
      + (h.lv ? fact("Monster level in Hell", `<b>${h.lv}</b>`, area && (b.uber || !area.N ? `Area level ${area.H}` : `Area level Normal ${area.N || "—"} · Nightmare ${area.NM || "—"} · Hell ${area.H || "—"}`))
        : area ? fact("Area level in Hell", `<b>${area.H || "—"}</b>`, !b.uber && area.N && `Normal ${area.N || "—"} · Nightmare ${area.NM || "—"}`) : "")  // superuniques: the build has no level of their own
      + fact("Life in Hell", h.hn != null && `<b>${num(h.hn)}</b>`, h.hx > h.hn && `Up to ${num(h.hx)}`)
      + fact("Resists in Hell", `<div class="bp-res">${res || "—"}</div>`)
      + fact("Key", `<b class="bp-key">${b.keys.map(k => k.s ? `<a href="${U.item(k.s)}" data-tip="${k.s}">${esc(k.n)}</a>` : esc(k.n)).join(", ") || "None"}</b>`)
      + `</div></div>${look(b)}</div><div class="bp-cols${b.drops.length > 6 ? " bp-many" : ""}">`
      + panel("How to get there", `<p>${esc(b.how)}</p>` + (guide ? `<p><a href="${U.guide(guide) + (encounter || "")}">${W.guides.find(g => g[0] === guide)[1]}</a></p>` : ""))
      + panel("Special rewards", `<p>Chance per kill · one player, 0% magic find.</p>`
        + pool + (b.drops.length ? `<div class="pn-grid pn-rewards">${b.drops.map(s => { const i = BY[s]; return `<a class="pn-item q-${i.q}" data-tip="${s}" href="${U.item(s)}"><span class="pn-itemart">${i.a ? `<img src="${U.art(i.a)}" alt="">` : ""}</span><span class="pn-cardtext"><b class="pn-name">${esc(i.n)}</b><small data-drop-line>${esc(bossDropText(b.odds[s]))}</small></span></a>`; }).join("")}</div>` : pool ? "" : "<p>No notable drops recorded.</p>")
        + `<p>${b.s === "the-gilded-wretch" ? "" : "Also drops ordinary loot. "}Use the <a href="${U.page("drops")}">drop explorer</a> for detailed item chances.</p>`
        + (b.s === "the-countess" ? `<p>The Countess also has a separate rune drop roll.</p>` : "")
        + (b.drops.some(s => BY[s]?.fam === "Remnants") ? `<p><a href="${U.guide("remnants")}">What a Remnant does</a>.</p>` : ""))
      + `</div>` + (b.hell ? `<details class="panel"><summary>Hell loot pools</summary><p>Pool chances per kill; these are not the chance of each item in a pool. Letters mark item tiers; terrorized kills roll a tier or an act higher.</p><div class="bp-hl">${hellList("Base drops", b.hell)}${b.terror ? hellList("When terrorized", b.terror) : ""}</div></details>` : "")
      + panel("By difficulty", `<div class="bp-scroll">${statsTable(b.stats)}</div>`)
      + pager(BOSS_GROUPS.flatMap(([, , f, order]) => W.bosses.filter(f).sort(order)).filter(x => x.st === "built").concat(W.bosses.filter(b => b.tier != null && b.st === "built")), b, x => U.boss(x.s));
  },

  guide() {  // no rail, round 1 card 13: the breadcrumb and the endgame lane say where you are; section links sit in a row under the title
    fillTiles();
    if (KEY === "currency") {
      const reveal = () => {
        const target = document.getElementById(location.hash.slice(1));
        for (let parent = target?.parentElement; parent; parent = parent.parentElement) if (parent.tagName === "DETAILS") parent.open = true;
        target?.scrollIntoView();
      };
      document.fonts.ready.then(reveal); addEventListener("hashchange", reveal);
    }
    if (KEY === "sockets") {
      const catalogs = [...document.querySelectorAll("[data-slot-words]")];
      const paint = () => {
        document.querySelector("[data-slot-view]").innerHTML = viewToggle(VIEW("cards"));  // runeword catalogues open as cards
        for (const catalog of catalogs) {
          const items = catalog.dataset.slotWords.split(",").map(s => BY[s]);
          catalog.innerHTML = VIEW("cards") === "cards" ? `<div class="grid">${items.map(tile).join("")}</div>`
            : `<div class="gg-word-rows"><div class="gg-word-head"><span>Runeword</span><span>Runes in order</span><span>Sockets · bases</span><span>Level</span></div>${items.map(i => `<a class="gg-word-row" href="${ROOT}item/${i.s}.html" data-tip="${i.s}"><b class="q-rw">${esc(i.n)}</b><span>${runeSeq(i.runes)}</span><span>${sockGlyph(i.so)} ${i.so} · ${esc(i.it)}</span><span>${i.rl}</span></a>`).join("")}</div>`;
        }
      };
      onView(paint); paint();
    }
    if (KEY === "blades") bindingBlades();
    document.querySelectorAll("[data-journal-variant]").forEach(b => b.addEventListener("click", () => {
      const group = b.closest(".gg-journal-group");
      group.querySelectorAll("[data-jvariant]").forEach(p => { p.hidden = p.dataset.jvariant !== b.dataset.journalVariant; });
      group.querySelectorAll("[data-journal-variant]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    }));
    document.querySelectorAll('.gg-jump a, .gg-family-link, .gg-slot a').forEach(a => a.addEventListener("click", () => {
      const target = document.getElementById(a.hash.slice(1));
      if (target?.matches("details")) target.open = true;
    }));
    document.querySelector(`[data-moo="${CSS.escape(location.hash.slice(1))}"]`)?.scrollIntoView();  // egg 1's hash lands on its card
    $("#main").addEventListener("click", e => {  // the gem grid's grade buttons: that grade's sprites and powers (guide_pics.gems)
      const b = e.target.closest(".cg [data-g]");
      if (!b) return;
      const t = b.closest("table");
      t.querySelectorAll("[data-g]").forEach(x => x.classList.toggle("on", x.dataset.g === b.dataset.g));
      t.querySelectorAll("button[data-g]").forEach(x => x.setAttribute("aria-pressed", x === b));
    });
    if (KEY === "new-encounters") {
      const reveal = () => { const cache = $("#its-hoard"); if (location.hash === "#its-hoard") cache.open = true; };
      reveal(); addEventListener("hashchange", reveal);
    }
    const hoard = $(".gfhoard");  // a monster's loot (data:hoard): the database's list, lowest level first, or its cards
    if (hoard) {
      const list = hoard.dataset.hoard.split(",").map(s => BY[s]).filter(Boolean).sort((a, b) => (a.rl || 0) - (b.rl || 0) || a.n.localeCompare(b.n));
      if (!list.length) return hoard.remove();
      let sel = list[0].s;
      const paint = () => { hoard.innerHTML = `<div class="gfh-bar"><span>${list.length} uniques, lowest level first</span>${viewToggle()}</div>`
        + (VIEW() === "list" ? ledger(list, sel) : `<div class="grid">${list.map(i => tile(i)).join("")}</div>`); };
      ledgerKeys(hoard, s => { sel = s; paint(); });
      onView(paint);
      paint();
    }
  },

  kit() { location.replace(U.page("builds") + "#wear"); },  // the old list is the Build planner's "What can I wear" now

  overview() {  // What Legacy of the Horadrim adds: server-drawn, What's different and First steps folded in
    fillTiles();
    const reveal = () => document.getElementById(location.hash.slice(1))?.scrollIntoView();
    document.fonts.ready.then(reveal); addEventListener("hashchange", reveal);
  },

  moved() { location.replace($("#main a").href); },  // What's different and First steps: the Overview now

  news() {
    fillTiles();
  },

  notes() {
    fillTiles();
  },

  recipes() {
    // Every recipe uses the same Cube card or compact line, with shared filters.
    // The same recipe for each kind of gear (Armor, Weapon, Ring … + Jawbone of Lies → reroll magic) reads as one row,
    // led by the gear's quality ("Magic: Any Armor / Weapon / Ring").
    const out = r => r.t.split("→").pop().trim().replace(/\s*\([^)]*\)$/, "");
    const folded = rs => Object.values(rs.reduce((by, r, i) => {
      const gear = r.in.filter(x => !x.s), one = gear.length === 1 && !r.os, g = gear[0];
      const q = g?.q ? g.q.replace(/\b\w/g, c => c.toUpperCase()) : "", note = g?.label?.match(/ \(.*\)$/)?.[0] || "";
      const slot = (g?.label || g?.name || "").replace(note, "").replace(q + " ", "");  // "Any Magic Armor (no sockets)" → "Any Armor"
      const key = one ? JSON.stringify([r.in.filter(x => x.s).map(x => [x.s, x.qty]), g.q, note, out(r), r.d]) : i;
      if (by[key]) { if (!by[key].slots.includes(slot)) by[key].slots.push(slot); by[key].in[0].label = (q ? q + ": " : "") + by[key].slots.join(" / ") + note; }
      else by[key] = one ? {...r, slots: [slot], in: [{...g}, ...r.in.filter(x => x.s)], t: "→ " + out(r)} : r;
      return by;
    }, {}));
    const grp = r => r.g + (r.o === "vanilla" ? " (Diablo II)" : "");
    const groups = [...new Set(W.recipes.map(grp))], gates = [...new Set(W.recipes.map(r => r.d).filter(Boolean))];
    const words = x => `${x.qty > 1 ? x.qty + " × " : ""}${esc(x.label || x.name)}`;
    const art = x => { const i = x.s && BY[x.s]; return i ? (i.q === "rw" ? W.runeArt[i.runes[0]] : i.a) : x.a; };
    const cell = x => { const a = art(x), inner = a ? `<img src="${U.art(a)}" alt="${esc(x.label || x.name)}" loading="lazy">` : `<em>${esc((x.label || x.name).replace(/^Any /, ""))}</em>`;
      return x.s ? `<a href="${U.item(x.s)}" data-tip="${x.s}">${inner}</a>` : `<span>${inner}</span>`; };
    const cube = ins => { const cells = ins.flatMap(x => Array.from({length: Math.min(x.qty, 12)}, () => cell(x)));
      return `<div class="cr-cube">${cells.concat(Array(Math.max(0, 12 - cells.length)).fill("<span></span>")).slice(0, 12).join("")}</div>`; };
    const card = r => {
      const o = BY[r.os];
      return `<article class="cr-card"><h3>${o ? `<a class="q-${o.q}" href="${U.item(o.s)}">${esc(o.n)}</a>` : esc(out(r))}</h3>
        <div class="cr-make">${cube(r.in)}<i class="to">→</i>
          <div class="cr-out">${o?.a ? `<a href="${U.item(o.s)}" data-tip="${o.s}"><img src="${U.art(o.a)}" alt="${esc(o.n)}" loading="lazy"></a>` : ""}<b>${esc(out(r))}</b>${recipeWhen(r, "Any difficulty")}</div></div>
        <p class="cr-ins">${r.in.map(words).join(" + ")}</p></article>`;
    };
    if (!localStorage.lothRecipeView) localStorage.lothRecipeView = "cards";
    const st = {q: "", g: "", w: ""}, limits = {};
    const chip = (k, v, t) => fPill(k, v, t, st[k] === v);
    $("#main").innerHTML = crumbs([[U.page("index"), "Home"], [U.page("recipes"), "Crafting"], [null, "Cube recipes"]]) + `<h1>Cube recipes</h1><p class="lede">Put the ingredients in the Horadric Cube and press Transmute. <a href="${U.tool("cube")}">Find recipes for your ingredients</a>.</p>
      <div class="dbwrap"><aside class="rail" id="rail"><input id="crq" type="search" placeholder="Filter by ingredient or result…" aria-label="Filter recipes">${fToggle(false)}
      <div class="facets"><h3>Group</h3><div class="pills" id="crg"></div><h3>Difficulty</h3><div class="pills" id="crw"></div></div></aside>
      <div class="results"><div class="bar"><h2 class="sec">All recipes <small id="cra"></small></h2><div id="crview"></div></div><div class="cr-list"><div class="cr-hd" id="crhead"><span>Recipe</span><span>Difficulty</span><span>Group</span></div><div id="crr"></div></div></div></div>`;
    const draw = () => {
      $("#crg").innerHTML = chip("g", "", "All groups") + groups.map(g => chip("g", g, g)).join("");
      $("#crw").innerHTML = chip("w", "", "Every recipe") + chip("w", "any", "Any difficulty") + gates.map(d => chip("w", d, d)).join("");
      const q = st.q.trim().toLowerCase(), hit = r => (!q || [r.t, ...r.in.map(x => x.label || x.name)].join(" ").toLowerCase().includes(q))
        && (!st.g || grp(r) === st.g) && (!st.w || (st.w === "any" ? !r.d : r.d === st.w));
      const rows = W.recipes.filter(hit), grid = localStorage.lothRecipeView !== "list";
      $("#crview").innerHTML = viewToggle(grid ? "cards" : "list");
      $("#crhead").hidden = grid;
      $("#cra").textContent = `${rows.length} of ${W.recipes.length}`;
      $("#crr").innerHTML = groups.map(g => { const rs = folded(rows.filter(r => grp(r) === g)).sort((a, b) => Number(!a.in.some(x => BY[x.s]?.fam === "Reagents")) - Number(!b.in.some(x => BY[x.s]?.fam === "Reagents")) || Number(!!BY[a.os]) - Number(!!BY[b.os])), id = "cr-" + slugify(g);
        const shown = rs.slice(0, limits[g] || 48);
        const how = {"Gem upgrades": ["gems", "Gems"], "Rune upgrades": ["runes", "Runes and upgrading"]}[g.replace(/ \(Diablo II\)$/, "")];  // their guides are off the menus
        return rs.length ? fold(id, `${esc(g)} <small>${rs.length}</small>`, (how ? `<p>What each grade does: <a href="${U.guide(how[0])}">${how[1]}</a>.</p>` : "") + (grid ? `<div class="cr-cards">${shown.map(card).join("")}</div>` : shown.map(r => `<div class="cr-row">${recipeRow(r, undefined, false)}${recipeWhen(r, "Any difficulty")}<small>${esc(grp(r))}</small></div>`).join("")),
          {open: true}).replace(/<\/details>$/, (rs.length > shown.length ? `<button type="button" class="pill cr-more" data-group="${esc(g)}">Show ${Math.min(48, rs.length - shown.length)} more · ${rs.length - shown.length} remaining</button>` : "") + "</details>") : ""; }).join("")
        || `<p class="empty">No recipe matches.</p>`;
    };
    $("#rail").addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b) { st[b.dataset.k] = b.dataset.v; draw(); $(`#rail [data-k="${b.dataset.k}"][data-v="${CSS.escape(b.dataset.v)}"]`).focus(); } });
    $("#crr").addEventListener("click", e => { const b = e.target.closest("[data-group]"); if (b) { const g = b.dataset.group, id = b.closest("details").id; limits[g] = (limits[g] || 48) + 48; draw(); const group = document.getElementById(id); (group.querySelector(".cr-more") || group.querySelector("summary")).focus({preventScroll: true}); } });
    $("#crview").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) { localStorage.lothRecipeView = b.dataset.view; draw(); $("#crview").querySelector(`[data-view="${b.dataset.view}"]`)?.focus(); } });
    fWire($("#rail"));
    $("#crq").oninput = e => { st.q = e.target.value; draw(); };
    draw();
  },

  rwcalc() {  // the runes across the top, the results full width under them
    const want = location.hash.slice(1).split(",").filter(Boolean);
    const st = {so: "", ty: "", v: true, sort: "rl"};
    let layout = localStorage.getItem("loth-rune-layout") === "grid" ? "grid" : "bench";
    $("#main").innerHTML = crumbs([[U.page("index"), "Home"], [U.page("runewords"), "Runewords"], [null, "Rune bench"]]) + `<div class="rune-bench-head"><h1>Rune bench</h1><div class="rune-bench-help"><p>Set your rune counts below. Your stash is shared with the <a href="${U.tool("cube")}">Cube planner</a>. <a href="${U.guide("runes")}">Rune upgrades</a>.</p><p>Click a rune to add one. Right-click to remove one.</p></div></div>
      <div class="rune-bench-bar"><div id="rune-layout" class="pills" aria-label="Rune layout"></div></div><div class="rune-tray"><div class="rcalc" id="runes" style="--rune-columns:${Math.ceil(W.runes.length / 3)}"></div></div><div class="bar" id="rwbar"></div><div id="rwres"></div>`;
    const rws = W.items.filter(i => i.q === "rw");
    const types = [...new Set(rws.flatMap(r => r.it.split(" / ")))].sort();
    const draw = () => {
      $("#runes").classList.toggle("bench", layout === "bench");
      $("#rune-layout").innerHTML = ["bench", "grid"].map(v => `<button class="pill${layout === v ? " on" : ""}" data-layout="${v}" aria-pressed="${layout === v}"><svg viewBox="0 0 18 12" aria-hidden="true">${(v === "grid" ? [[1,1],[6,1],[11,1],[1,6],[6,6],[11,6]] : [[1,1],[6,1],[11,1],[1,5],[11,5],[1,9],[11,9]]).map(([x,y]) => `<rect x="${x}" y="${y}" width="3" height="2"/>`).join("")}</svg>${v === "bench" ? "Rune bench" : "Grid"}</button>`).join("");
      $("#runes").innerHTML = W.runes.map(r => `<div class="rcalc-c${STASH[r] ? " have" : ""}${want.includes(r) ? " want" : ""}" style="--rune-col:${runeInfo(r).bench[0]};--rune-row:${runeInfo(r).bench[1]}"><button type="button" class="rune-pick" data-r="${r}" data-d="1" aria-label="Add one ${r}">${W.runeArt[r] ? `<img src="${U.art(W.runeArt[r])}" alt="">` : ""}<span>${r}</span></button><div class="rcalc-count"><button type="button" data-r="${r}" data-d="-1" aria-label="Remove one ${r}"${STASH[r] ? "" : " disabled"}>−</button><output aria-label="${r} count">${STASH[r] || 0}</output><button type="button" data-r="${r}" data-d="1" aria-label="Add one ${r}">+</button></div></div>`).join("");
      const need = rw => { const c = {}; rw.runes.forEach(r => c[r] = (c[r] || 0) + 1); return Object.entries(c).reduce((m, [r, n]) => m + Math.max(0, n - (STASH[r] || 0)), 0); };
      const list = rws.filter(r => (st.v || r.o === "loth") && (!st.so || r.so === +st.so) && (!st.ty || r.it.split(" / ").includes(st.ty)));
      const scored = list.map(r => [r, need(r)]).sort((a, b) => a[1] - b[1] || (st.sort === "n" ? a[0].n.localeCompare(b[0].n) : a[0].rl - b[0].rl));
      $("#rwbar").innerHTML = `<div class="pills socks">${["", 2, 3, 4, 5, 6].map(n => `<button class="pill${String(st.so) === String(n) ? " on" : ""}" data-so="${n}">${n ? sockGlyph(n) + " " + n : "Any sockets"}</button>`).join("")}</div>
        ${combo("ty", [["", "Any item type"], ...types.map(t => [t, t, W.baseArt[t]])], st.ty)}
        <label class="chk"><input type="checkbox" id="rv"${st.v ? " checked" : ""}> Include Diablo II runewords</label><button class="pill" id="clear">Clear my runes</button>${combo("sort", [["rl", "Sort: required level"], ["n", "Sort: name"]], st.sort, "end")}${viewToggle()}`;
      // what you can make first; the ones a rune short fold under one line. The LotH badge shows only beside Diablo II's
      const now = scored.filter(x => !x[1]), near = scored.filter(x => x[1] === 1), mixed = new Set(list.map(r => r.o === "loth")).size > 1;
      const rows = xs => VIEW() === "cards" ? shelves(xs.map(([r]) => r), r => tile(r, {tags: true})) : `<div class="rwlist"><div class="rwresult-head"><span>Runeword</span><span>Sockets</span><span>Runes in order</span><span>What it gives</span><span>Base · plan</span></div>${xs.map(([r]) => rwRow(r, mixed)).join("")}</div>`;
      $("#rwres").innerHTML = !W.runes.some(r => STASH[r]) ? `<p class="empty">Add your runes above.</p>`
        : !now.length && !near.length ? `<p class="empty">No runeword is even one rune short. Add more runes.</p>`
        : (now.length ? `<h2 class="sec">You can make <small>${now.length}</small></h2>${rows(now)}` : `<p class="empty">Nothing yet. Each of these needs one more rune.</p>`)
          + (near.length ? fold("rw-short", near.length === 1 ? "1 more needs a rune you don't have" : `${near.length} more need runes you don't have`, rows(near), {shut: true, open: now.length ? undefined : true}) : "");
      $("#sort").onchange = e => { st.sort = e.currentTarget.dataset.v; draw(); };
      $("#ty").onchange = e => { st.ty = e.target.value; draw(); };
      $("#rv").onchange = e => { st.v = e.target.checked; draw(); };
    };
    const rwRow = (r, mixed) => { const left = {...STASH}; return `<div class="rwrow"><div class="rwresult-name"><a href="${U.item(r.s)}" data-tip="${r.s}" class="q-rw">${esc(r.n)}</a><small>Level ${r.rl}${mixed && r.o === "loth" ? ' · <span class="tag loth">LotH</span>' : ""}</small></div>
      <div class="rwresult-sockets">${sockGlyph(r.so)}<b>${r.so}</b><small>sockets</small></div>
      ${runeSeq(r.runes, x => { const ok = (left[x] || 0) > 0; if (ok) left[x]--; return ok ? "ok" : "miss"; })}<div class="mods">${(r.l || []).slice(0, 3).map(l => `<div>${rng(l)}</div>`).join("")}</div>
      <div class="rwresult-plan"><div class="rw-bases">${r.it.split(" / ").map(t => `<span>${W.baseArt[t] ? `<img src="${U.art(W.baseArt[t])}" alt="">` : ""}${esc(t)}</span>`).join("")}</div><a class="pill" href="${U.page("builds")}#wear=${r.s}">Plan with it →</a></div></div>`; };
    $("#rune-layout").onclick = e => { const b = e.target.closest('[data-layout]'); if (b) { layout = b.dataset.layout; localStorage.setItem("loth-rune-layout", layout); draw(); } };
    $("#runes").addEventListener("contextmenu", e => {
      const b = e.target.closest(".rune-pick");
      if (!b) return;
      e.preventDefault();
      STASH[b.dataset.r] = Math.max(0, (STASH[b.dataset.r] || 0) - 1); saveStash(); draw();
      $(`#runes .rune-pick[data-r="${b.dataset.r}"]`).focus();
    });
    onView(draw);
    $("#runes").addEventListener("click", e => {
      const b = e.target.closest("button[data-r]");
      if (!b) return;
      const {r, d} = b.dataset;
      STASH[r] = Math.max(0, (STASH[r] || 0) + +d); saveStash(); draw();
      $(`#runes [data-r="${r}"][data-d="${d === "-1" && !STASH[r] ? "1" : d}"]`).focus();
    });
    $("#rwbar").addEventListener("click", e => {
      const so = e.target.closest("[data-so]");
      if (so) { st.so = so.dataset.so; draw(); }
      if (e.target.id === "clear") { W.runes.forEach(r => delete STASH[r]); saveStash(); draw(); }
    });
    draw();
  },

  cube() {
    const gem = /^(Chipped |Flawed |Flawless |Perfect )?(Amethyst|Diamond|Emerald|Ruby|Sapphire|Topaz|Skull)$/;
    const rune = n => n.endsWith(" Rune") ? n.slice(0, -5) : null;
    const misc = new Set(W.items.filter(i => i.q === "misc").map(i => i.n));
    const kindOf = x => rune(x.name) ? "Runes" : gem.test(x.name) ? "Gems" : misc.has(x.name) ? "Reagents"
      : /^Leaf of/.test(x.name) ? "Leaves" : /Key of|Essence|Worldstone Shard|Diablo's Horn|Baal's Eye|Mephisto's Brain|Wirt's Leg|Token|Standard of|Tome of|Scroll/.test(x.name) ? "Other ingredients" : null;
    const key = x => rune(x.name) || x.name;
    const slugOf = Object.fromEntries(W.items.map(i => [i.n, i.s]));
    const ings = {Runes: new Set(W.runes)};
    for (const r of W.recipes) for (const x of r.in) { const k = kindOf(x); if (k) (ings[k] ||= new Set()).add(key(x)); }
    // the gear the last planned build wears (the build planner keeps it): a recipe's gear ingredient counts as had when
    // an item of that kind and quality is worn ("Rare: Armor" is any rare armour piece; no quality named is any)
    const gear = (() => { try { return JSON.parse(localStorage.getItem("loth-gear") || "[]"); } catch { return []; } })();
    // the quality the cube checks on a gear ingredient (x.q: "rare", "superior"); a planned normal item stands in for superior
    const fits = (g, x) => g.kinds.includes(x.name) && (!x.q || g.q === x.q || x.q === "superior" && g.q === "normal");
    const short = x => Math.max(0, x.qty - gear.filter(g => fits(g, x)).length);  // how many more the build would need to wear
    // only gear a build can wear is counted; the rest (a jewel, a potion, a quest item) stays a word
    const WEARS = new Set(["Any Armor", "Helm", "Armor", "Gloves", "Boots", "Belt", "Any Shield", "Weapon", "Ring", "Amulet", "Charm", "Small Charm", "Large Charm", "Grand Charm", ...Object.values(W.bases).map(b => b.ty)]);
    const counts = x => st.g && !kindOf(x) && WEARS.has(x.name);
    const st = {v: false, g: gear.length > 0};
    $("#main").innerHTML = crumbs([[U.page("index"), "Home"], [null, "Cube planner"]]) + `<h1>Cube planner</h1>
      <p class="lede">Count your ingredients to find recipes. Required equipment is listed but not counted. Rune counts are shared with the Runeword calculator.</p>
      <div class="tool"><div><input type="search" id="ingq" placeholder="Find an ingredient…" aria-label="Find an ingredient"><div id="stash"></div></div><div><div class="bar"><label class="chk"><input type="checkbox" id="cv"> Include Diablo II recipes</label>${gear.length ? `<label class="chk"><input type="checkbox" id="cg" checked> Count the gear my build wears</label>` : ""}</div>
      <p class="mut" id="cgear">${gear.length ? `From your <a href="${U.page("builds")}">planned build</a>: ${gear.map(g => esc(g.n)).join(", ")}.` : `Plan a build and its gear counts here too (a rare helm, a magic ring).`}</p><div id="cres"></div></div></div>`;
    const order = ["Reagents", "Leaves", "Runes", "Gems", "Other ingredients"];
    const rarity = n => {
      const rank = W.reagentOrder.indexOf(slugOf[n]);
      return rank >= 0 ? rank : /Sealed Breath$/.test(n) ? 1000 : 100 + (BY[slugOf[n]]?.il || 0);
    };
    const draw = () => {
      $("#stash").innerHTML = order.filter(k => ings[k]).map(k => fold("cp-" + slugify(k), `${k} <small>${ings[k].size}</small>`, `<div class="ings">${[...ings[k]].sort((a, b) => k === "Runes" ? W.runes.indexOf(a) - W.runes.indexOf(b) : k === "Reagents" ? rarity(a) - rarity(b) || a.localeCompare(b) : a.localeCompare(b))
        .map(n => [n, W.runes.includes(n) ? runeSlug(n) : slugOf[n]])
        .map(([n, s]) => [n, s, s && (BY[s]?.q === "rw" ? null : BY[s]?.a)])
        .map(([n, s, a]) => `<div class="ing${STASH[n] ? " have" : ""}" data-name="${esc(n.toLowerCase())}"><button data-n="${esc(n)}" data-d="1"${s ? ` data-tip="${s}"` : ""}>${a ? `<img src="${U.art(a)}" alt="" loading="lazy">` : "<span></span>"}<b>${esc(n)}</b></button>${s ? `<a class="go" href="${U.item(s)}" aria-label="${esc(n)}">›</a>` : ""}<span class="cnt">${STASH[n] || 0}</span><button class="minus" data-n="${esc(n)}" data-d="-1">−</button></div>`).join("")}</div>`)).join("");
      const rows = W.recipes.filter(r => st.v || r.o === "ours").map(r => {
        const counted = r.in.filter(kindOf), miss = counted.reduce((m, x) => m + Math.max(0, x.qty - (STASH[key(x)] || 0)), 0)
          + r.in.filter(counts).reduce((m, x) => m + short(x), 0);
        return [r, miss, counted.length];
      }).filter(([, m, c]) => c && m <= 1).sort((a, b) => a[1] - b[1]);
      const row = ([r]) => recipeRow(r, x => !kindOf(x) ? (!counts(x) ? "gear" : short(x) ? "miss" : "ok") : (STASH[key(x)] || 0) >= x.qty ? "ok" : "miss");
      const ready = rows.filter(x => x[1] === 0), near = rows.filter(x => x[1] === 1);
      $("#cres").innerHTML = (ready.length ? `<h2 class="sec">Ready to transmute <small>${ready.length}</small></h2><div class="recipes">${ready.map(row).join("")}</div>` : `<p class="empty">Nothing ready yet. Count the ingredients in your stash.</p>`)
        + (near.length ? fold("cp-short", `One ingredient short <small>${near.length}</small>`, `<div class="recipes">${near.map(row).join("")}</div>`) : "");
      document.querySelectorAll("#stash button").forEach(b => b.onclick = () => { const n = b.dataset.n; STASH[n] = Math.max(0, (STASH[n] || 0) + +b.dataset.d); saveStash(); draw(); });
      const q = $("#ingq").value.trim().toLowerCase();  // the ingredient search: hide the tiles that don't match and the groups left empty, open the rest
      document.querySelectorAll("#stash .ing").forEach(t => t.hidden = !!q && !t.dataset.name.includes(q));
      document.querySelectorAll("#stash details").forEach(d => { d.hidden = !d.querySelector(".ing:not([hidden])"); if (q && !d.hidden) d.open = true; });
    };
    $("#cv").onchange = e => { st.v = e.target.checked; draw(); };
    if ($("#cg")) $("#cg").onchange = e => { st.g = e.target.checked; draw(); };
    $("#ingq").oninput = draw;
    draw();
  },
};

// A group that folds: shut on a phone unless the page's #hash names it; a redraw keeps the reader's open or shut,
// and open forces it either way
const PHONE = () => matchMedia("(max-width:640px)").matches;
const fold = (id, sum, body, {shut = PHONE() && location.hash !== "#" + id, open} = {}) => { const was = document.getElementById(id);
  return `<details class="cr-grp" id="${id}"${open ?? (was ? was.open : !shut) ? " open" : ""}><summary>${sum}</summary>${body}</details>`; };
const slugify = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The database and Bosses show a list or cards: list by default, the reader's choice kept in the browser for both.
const VIEW = (fallback = "list") => ["cards", "list"].includes(localStorage.lothView) ? localStorage.lothView : fallback;  // the reader's last pick, else the page's default
const viewToggle = (view = VIEW()) => `<div class="vtog" role="group" aria-label="View">${[["list", "List", "M2 3h16v3H2zM2 8.5h16v3H2zM2 14h16v3H2z"], ["cards", "Cards", "M2 2h7v7H2zM11 2h7v7h-7zM2 11h7v7H2zM11 11h7v7h-7z"]]
  .map(([v, t, d]) => `<button type="button" data-view="${v}" aria-pressed="${view === v}" aria-label="${t}" title="${t}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="${d}"/></svg></button>`).join("")}</div>`;
const onView = paint => document.addEventListener("click", e => {
  const b = e.target.closest("[data-view]");
  if (!b) return;
  localStorage.lothView = b.dataset.view;
  document.querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-pressed", x.dataset.view === b.dataset.view));
  paint();
  $(`[data-view="${b.dataset.view}"]`)?.focus();
});
// the paper doll's slots in its order: the build planner's slot, the card view's shelf, and the item types (t, build.py's
// TITLES) it takes; any other type (charms, runes, runewords…) is its own shelf
const SLOTS = [["helm", "Helms", ["Helms"]], ["armor", "Body armor", ["Body armor"]], ["weapon", "Weapons", ["Axes", "Wands", "Clubs", "Scepters", "Maces", "Hammers", "Swords",
  "Knives", "Daggers", "Spears", "Polearms", "Staves", "Bows", "Crossbows", "Javelins", "Throwing axes", "Throwing knives", "Orbs", "Claws"]],
  ["offhand", "Shields and off-hands", ["Shields", "Voodoo heads", "Grimoires"]], ["gloves", "Gloves", ["Gloves"]], ["belt", "Belts", ["Belts"]], ["boots", "Boots", ["Boots"]],
  ["amulet", "Amulets", ["Amulets"]], ["ring", "Rings", ["Rings"]]];
const shelfName = i => SLOTS.find(([, , ts]) => ts.includes(i.t))?.[1] || i.t;
const shelves = (list, card) => { const by = Map.groupBy(list, shelfName), rank = s => SLOTS.findIndex(([, n]) => n === s) + 1 || 99;
  return [...by].sort(([a], [b]) => rank(a) - rank(b)).map(([s, is]) => `${by.size > 1 ? `<h2 class="sec">${esc(s)} <small>${is.length}</small></h2>` : ""}<div class="grid" data-shelf="${esc(s)}">${is.map(card).join("")}</div>`).join(""); };
// the list: rows to scan (an era tag only where the rows differ), and the selected row's in-game tooltip beside them (under the row on a phone); the D-pad walks the rows
const ledWhere = i => srcLine(i) || "—";
const ledPanel = i => `${tip(i, {art: true})}${i.q !== "rw" ? `<div class="led-src"><b>Where to find it</b><br>${esc(ledWhere(i))}</div>` : ""}`
  + `<div class="led-go"><a class="pill" href="${U.item(i.s)}">Item page</a>${["unique", "set", "rw"].includes(i.q) && i.rl > 0 ? `<a class="pill" href="${U.page("builds")}#wear=${i.s}">Plan a build</a>` : ""}</div>`;
const ledRow = (i, on, era = true) => `<button type="button" class="led-row${on ? " on" : ""}" role="option" aria-selected="${on}" data-s="${i.s}">`
  + `<span class="led-a">${i.q === "rw" ? (W.runeArt[i.runes[0]] ? `<img src="${U.art(W.runeArt[i.runes[0]])}" alt="">` : "") : i.a ? `<img src="${U.art(i.a)}" alt="" loading="lazy">` : ""}</span>`
  + `<span class="led-n"><b class="q-${i.q}">${esc(i.n)}</b><small>${esc(i.q === "rw" ? i.runes.join(" ") : [i.b || i.t, i.cls && i.cls !== "any" && `${i.cls} only`].filter(Boolean).join(" · "))}</small>${era ? eraTag(i) : ""}</span>`
  + `<span class="led-l">${i.rl || ""}</span><span class="led-m">${(i.l || []).slice(0, 2).map(esc).join("<br>")}</span><span class="led-w">${esc(ledWhere(i))}</span></button>`
  + (on ? `<div class="led-inl">${ledPanel(i)}</div>` : "");
const ledger = (list, sel, era = list.some(x => x.era !== list[0].era)) => `<div class="led"><div><div class="led-hd"><span></span><span>Item</span><span>Level</span><span>Stats</span><span>Where</span></div>`
  + `<div role="listbox" aria-label="Items">${list.map(i => ledRow(i, i.s === sel, era)).join("")}</div></div><aside class="led-tip">${ledPanel(BY[sel])}</aside></div>`;
const ledgerKeys = (el, pick) => {  // a click or an up/down press picks a row; the redraw keeps its focus
  const go = s => { pick(s); el.querySelector(`.led-row[data-s="${CSS.escape(s)}"]`)?.focus(); };
  el.addEventListener("click", e => { const r = e.target.closest(".led-row"); if (r) go(r.dataset.s); });
  el.addEventListener("keydown", e => {
    const r = e.target.closest(".led-row"), d = {ArrowDown: 1, ArrowUp: -1}[e.key];
    if (!r || !d) return;
    const rows = [...el.querySelectorAll(".led-row")], n = rows[rows.indexOf(r) + d];
    e.preventDefault();
    if (n) go(n.dataset.s);
  });
};

// the bosses page's groups, in its order; boss pages page through the same order
const ACT_BOSSES = ["andariel", "duriel", "mephisto", "diablo", "baal"];
const BOSS_GROUPS = [
  ["The campaign", "Every difficulty. The five act bosses, then the side bosses whose Hell kills drop the uber keys.", b => b.o !== "loth" && !b.uber, (a, b) => (ACT_BOSSES.indexOf(a.s) + 1 || 9) - (ACT_BOSSES.indexOf(b.s) + 1 || 9)],
  ["New in Legacy of the Horadrim", "Ours: the Gilded Fallen across the campaign, the Descent's echoes and the pinnacle fights.", b => b.o === "loth" && b.tier == null, () => 0],
  ["The legacy ubers", "Diablo II's Hell-only fights: Pandemonium's three, then Uber Tristram.", b => b.o !== "loth" && b.uber, () => 0]];

// a boss's numbers by difficulty, from the built mod's tables (brief 099); 100 or more resistance is immunity
const RESISTS = [["dm", "physical"], ["ma", "magic"], ["fi", "fire"], ["co", "cold"], ["li", "lightning"], ["po", "poison"]];
const immunities = s => RESISTS.filter(([k]) => s[k] >= 100).map(([, n]) => n);
const statsTable = stats => {
  const ds = Object.keys(stats), num = n => n.toLocaleString("en");
  const rows = [["lv", "Monster level", s => s.lv], ["hn", "Life", s => s.hn != null && (s.hn === s.hx ? num(s.hn) : `${num(s.hn)}-${num(s.hx)}`)],
    ["xp", "Experience", s => s.xp != null && num(s.xp)], ["df", "Defense", s => s.df != null && num(s.df)],
    ...RESISTS.map(([k, n]) => [k, `${n[0].toUpperCase() + n.slice(1)} resist`, s => s[k] >= 100 ? `<span class="immune">Immune</span>` : s[k] != null && s[k] + "%"])];
  const shown = rows.filter(([k]) => ds.some(d => stats[d][k] != null));
  return shown.length ? `<table><tr><th></th>${ds.map(d => `<th>${d}</th>`).join("")}</tr>${shown.map(([, t, f]) => `<tr><th>${t}</th>${ds.map(d => `<td>${f(stats[d]) || "—"}</td>`).join("")}</tr>`).join("")}</table>` : "";
};

// a boss's Hell drop list: the game's pool, then LotH's pools beside it, each line's chance per kill; items link to their pages
const bossDropText = text => [...new Set(text.split("; ").map(line => line.replace(/^.*? · (?=Normal|Nightmare|Hell)/, "")
  .replace(/ · 0% magic find/g, "") + (line.includes("(terrorized)") ? " (terrorized)" : "")))].join("; ");
const hellList = (t, d) => { const li = ([n, s, c]) => `<li>${s ? `<a href="${U.item(s)}" data-tip="${s}">${esc(n)}</a>` : esc(n)}<b data-drop-line>${esc(bossDropText(c))}</b></li>`;
  return `<div><h3>${t}</h3><ul class="src">${d.rows.map(li).join("")}</ul>${d.also.length ? `<h3>LotH adds</h3><ul class="src">${d.also.map(li).join("")}</ul>` : ""}</div>`; };
// a boss's picture (brief 092): Blizzard's art, its D2R HD model render (render_monsters.py, #33) or the diablo2.io sprite;
// echoes, shades and the Gilded Fallen get their own cast. No picture: an empty frame the same size. The footer credits the art.
const look = (b, size = "") => `<figure class="look ${size} look-${/^(echo-|shade-)/.test(b.s) ? "echo" : b.s}${b.img?.includes("monsters-hd/") ? " hd" : b.img ? "" : " empty"}">${b.img ? `<img src="${U.art(b.img)}" alt="${esc(b.n)}">` : ""}</figure>`;

function basesPanel(i) {
  if (!i.bs?.length) return "";
  const by = {};
  for (const c of i.bs) (by[W.bases[c].ty] ||= []).push(c);
  return panel(`Bases <small>${i.bs.length}</small>`, Object.entries(by).map(([ty, cs]) =>
    `<details${Object.keys(by).length < 4 ? " open" : ""}><summary>${esc(ty)} <small>${cs.length}</small></summary><div class="bases">${cs.map(c => {
      const b = W.bases[c];
      return `<div class="base">${b.a ? `<img src="${U.art(b.a)}" alt="" loading="lazy">` : "<span></span>"}<b class="tier-${b.tier[0]}">${esc(b.n)}</b>`
        + `<small>${b.tier}${b.rl ? ` · level ${b.rl}` : ""}${b.str ? ` · ${b.str} Str` : ""}${b.dex ? ` · ${b.dex} Dex` : ""} · up to ${b.so} sockets</small></div>`;
    }).join("")}</div></details>`).join(""));
}

// what you have with each count worn: bonuses down, pieces worn across, a tick from the count each starts at; a phone reads
// it as a list. Its rows climb in order, so it opts out of sortTables (data-srt).
function setGrid(s, n) {
  const counts = [...Array(n - 1)].map((_, k) => k + 2), from = k => k === "Full set" ? n : parseInt(k);
  return `<table class="sp-grid" data-srt=""><thead><tr><th>Bonus</th>${counts.map(c => `<th>${c === n ? `Full set (${n})` : c === 2 ? "2 pieces" : c}</th>`).join("")}</tr></thead><tbody>`
    + s.bonus.map(([k, t], r) => { const first = !r || k !== s.bonus[r - 1][0];  // the first bonus of its count carries the phone's label
      return `<tr class="${from(k) === n ? "full" : "set"}${first ? " sp-first" : ""}"><td>${first ? `<small>${from(k) === n ? "Full set" : `With ${from(k)} or more pieces`}</small>` : ""}${esc(t)}</td>`
        + counts.map(c => c >= from(k) ? `<td class="on">✓</td>` : "<td></td>").join("") + "</tr>"; }).join("") + "</tbody></table>";
}

function srcText(t) {
  const page = n => W.bosses.find(b => b.st === "built" && b.n === n.replace(/ \(\w+\)$/, ""));
  return t.split("; ").map(line => {
    const parts = line.split(/ · (?=(?:Normal|Nightmare|Hell)(?: \(quest kill\))? ·)/);
    if (parts.length !== 2) return esc(line);
    return parts[0].split(" · ").map(n => { const b = page(n); return b ? `<a href="${U.boss(b.s)}">${esc(n)}</a>` : esc(n); }).join(" · ") + " · " + esc(parts[1]);
  }).join("; ");
}

function sourceRoutes(i) {
  const group = s => s[2]?.startsWith("boss/") ? "boss" : /^(Plain monsters|Champions|Unique monsters)/.test(s[1]) ? "world" : s[0];
  const kinds = [...new Set(i.src.map(group))];
  return `<div class="source-routes">${kinds.map(k => {
    const entries = i.src.filter(s => group(s) === k);
    const preview = entries.slice(0, k === "boss" ? 3 : 1).map(s => {
      const lines = s[1].split("; ");
      const text = lines.find(t => t.includes(" · Hell · ")) || lines[0];
      return `<small>${esc(text)}</small>`;
    }).join("");
    return `<a href="#where-to-find-it" data-source-kind="${esc(entries[0][0])}"><b>${esc({world: "World drop", boss: "Boss encounters", monster: "Monster pools"}[k] || SRC_LABEL[k] || k)}</b>${preview}<span>All sources and difficulties →</span></a>`;
  }).join("")}</div>`;
}

function whereList(i) {  // an item's sources and boss drops, as <li> rows
  return i.src.map(([k, t, h]) => `<li data-source-kind="${esc(k)}"${k === "monster" ? " data-drop-line" : ""}><b>${esc(SRC_LABEL[k] || k)}</b> ${h ? `<a href="${ROOT}${h}">${esc(t)}</a>` : t.split("; ").map(line => `<span class="source-entry">${srcText(line)}</span>`).join('<span class="source-separator">; </span>')}</li>`).join("");
}

function historyPanel(i) {  // when it was added, what Blizzard changed in 3.3, what we changed
  const v33 = fs => [fs.some(f => /LadderSeason/.test(f)) && "no longer ladder-only", fs.some(f => /^(prop|par|min|max)\d/.test(f)) && "stats changed",
    fs.includes("lvl req") && "required level changed", fs.includes("lvl") && "item level changed"].filter(Boolean).join(", ") || "data changed";
  return `<ul class="hist">${i.ver ? `<li><b>Added in ${i.o !== "loth" ? esc(i.ver) : i.ver === W.next ? release(i.ver) : "Legacy of the Horadrim"}</b>${i.o === "loth" ? "" : " " + esc(i.era)}</li>` : ""}
    ${i.v33 ? `<li><b>3.3</b> Changed by Blizzard: ${esc(v33(i.v33))}</li>` : ""}
    ${i.chg ? `<li><b>Changed in ${release(i.cv)}</b> by Legacy of the Horadrim<ul>${i.chg.map(c => `<li>${esc(c)}</li>`).join("")}</ul></li>` : ""}</ul>`;
}

function copyBoxes() {  // Install's copy boxes (lightbox card 1 A): the button shows only where the clipboard works (https)
  if (!navigator.clipboard) return;
  for (const b of document.querySelectorAll(".in-copy button")) {
    b.hidden = false;
    b.onclick = () => navigator.clipboard.writeText(b.previousElementSibling.textContent).then(() => { b.textContent = "Copied"; setTimeout(() => b.textContent = "Copy", 2000); });
  }
}

function designFolds() {  // the long Design pages (card 44 A, #541): a #link opens its fold, and the open fold is in the address
  const bar = $(".df-strip");
  if (!bar) return;
  const links = [...bar.querySelectorAll(".df-links a")], btn = $(".df-btn", bar);
  const here = () => document.getElementById(decodeURIComponent(location.hash.slice(1)));
  const mark = () => { const t = here(); links.forEach(a => a.toggleAttribute("aria-current", !!t && !!document.getElementById(a.hash.slice(1))?.contains(t))); };
  const go = () => { const t = here(), d = t?.closest("details.df-sec"); if (d) { d.open = true; t.scrollIntoView(); } mark(); };
  const size = () => document.documentElement.style.setProperty("--df-h", bar.offsetHeight + "px");
  btn.onclick = () => btn.setAttribute("aria-expanded", bar.classList.toggle("open"));
  bar.addEventListener("click", e => { if (e.target.closest(".df-links a")) { bar.classList.remove("open"); btn.setAttribute("aria-expanded", false); } });
  document.addEventListener("toggle", e => {
    const d = e.target;
    if (!d.matches?.("details.df-sec")) return;
    if (d.open) history.replaceState(null, "", "#" + d.id);
    else if (here() === d) history.replaceState(null, "", location.pathname + location.search);
    mark();
  }, true);
  addEventListener("hashchange", go);
  addEventListener("resize", size);
  size();
  go();
}

function atlasPick() {  // the Stones atlas: a picked Stone's card opens under the climb, in place; without this, :target does it
  const box = $(".smdets");
  if (!box) return;
  const show = id => {
    const card = $(`#sm-${id}`);
    if (!card) return false;
    box.classList.add("js");
    box.querySelectorAll(".smdet").forEach(c => c.classList.toggle("on", c === card));
    document.querySelectorAll(".smtile").forEach(t => t.toggleAttribute("aria-current", t.dataset.sm === id));
    return card;
  };
  const first = $(".smdet").id.slice(3);
  show(location.hash.slice(4) || first);
  addEventListener("popstate", () => show(location.hash.slice(4) || first));  // Back and Forward step through the picked Stones
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-sm]"), card = a && show(a.dataset.sm);
    if (!card) return;
    e.preventDefault();
    if (location.hash !== `#sm-${a.dataset.sm}`) history.pushState(null, "", `#sm-${a.dataset.sm}`);
    if (!a.classList.contains("smtile")) $(".smladder").scrollIntoView({behavior: "smooth"});
    else if (matchMedia("(max-width:900px)").matches) card.scrollIntoView({behavior: "smooth", block: "nearest"});
  });
}

function dataTips() {  // [data-t] text follows the pointer (the runeword charts)
  if ($("#tip") || !document.querySelector("[data-t]")) return;
  const tip = document.body.appendChild(document.createElement("div"));
  tip.id = "tip";
  document.addEventListener("mousemove", e => {
    const c = e.target.closest?.("[data-t]");
    tip.style.display = c ? "block" : "none";
    if (c) [tip.textContent, tip.style.left, tip.style.top] = [c.dataset.t, e.clientX + 12 + "px", e.clientY + 12 + "px"];
  });
}

const RW_LABEL = {vanilla: "Diablo II", built: "LotH · El–Zod", wax: "LotH · wax runes", generic: "any weapon"};
const RW_LAYER = ["generic", "vanilla", "built", "wax"];  // draw order: ours on top

// Same colours as runeword_map.py; small dots fit through any weapon.
const RW_COLOUR = {vanilla: "var(--van)", built: "var(--ours)", wax: "var(--wax)"};
const rwDot = (cx, cy, st, any) => { const c = RW_COLOUR[st];
  const look = any ? `r="3" fill="${c}" opacity=".55"` : `r="5.5" fill="${c}"`;
  return `<circle cx="${cx}" cy="${cy}" ${look}/>`; };

function whereItSits(i) {  // the word's rows from the runeword map, with its neighbours (brief 084)
  const {words} = W.rwmap, me = words.find(w => w.s === i.s), at = words.indexOf(me);
  const rows = W.rwmap.rows.filter(r => r.w.some(e => e[0] === at));
  if (!rows.length) return "";
  const {low, top} = W.rwmap, left = 160, width = 1000, rowH = 36, height = rows.length * rowH + 26;
  const x = lv => left + (Math.min(Math.max(lv, low), top) - low) / (top - low) * (width - left - 16);
  const href = w => w.s ? U.item(w.s) : `${RWMAP}#${w.id}`;
  const svg = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Where ${esc(i.n)} sits"><rect x="${x(61)}" y="0" width="${x(top) - x(61)}" height="${height - 18}" fill="var(--panel2)" opacity=".7"/>`];
  for (let t = low; t <= top; t += 10) svg.push(`<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="${height - 18}" stroke="var(--line)"/><text x="${x(t)}" y="${height - 4}" text-anchor="middle">${t}</text>`);
  rows.forEach((r, k) => {
    const y = k * rowH + 24;
    svg.push(`<text class="lbl" x="0" y="${y + 4}">${esc(r.n)}</text><line x1="${left}" x2="${width - 16}" y1="${y}" y2="${y}" stroke="var(--line2)"/>`);
    const byLv = {};  // one dot per level, as on the map: the top word decides its look, every word is in its tooltip
    for (const [w, lv, layer] of r.w) (byLv[lv] ||= []).push([words[w], layer === "generic"]);
    for (const [lv, ws] of Object.entries(byLv)) {
      ws.sort((a, b) => (a[1] - b[1]) || RW_LAYER.indexOf(b[0].c) - RW_LAYER.indexOf(a[0].c));
      const [w, any] = ws[0], tipText = ws.map(([v, g]) => `${v.n} (${RW_LABEL[v.c]}${g ? ", any weapon" : ""})`).join("; ");
      svg.push(`<a href="${href(w)}">${rwDot(x(lv), y, w.c, any)}</a>`.replace("/>", ` data-t="${lv} · ${esc(tipText)}"/>`));
    }
    svg.push(`<circle cx="${x(me.lv)}" cy="${y}" r="10" fill="none" stroke="var(--title)" stroke-width="1.5" pointer-events="none"/><text class="me" x="${x(me.lv)}" y="${y - 13}" text-anchor="middle">${esc(me.n)}</text>`);
  });
  const chip = w => `<a class="rwc ${w.c}" href="${href(w)}">${esc(w.n)}<i>${w.lv}</i></a>`;
  const near = r => {
    const on = r.w.filter(e => e[2] !== "generic" && e[0] !== at).map(e => words[e[0]]);
    const best = on.filter(w => w.st === "vanilla").sort((a, b) => b.lv - a.lv)[0];
    return [["Before", on.filter(w => w.lv <= me.lv).at(-1)], ["After", on.find(w => w.lv > me.lv)], ["Vanilla's best", best]]
      .filter(([, w]) => w).map(([t, w]) => `<span>${t} ${chip(w)}</span>`).join("");
  };
  const key = (st, any, text) => `<span><svg class="sw" viewBox="0 0 14 14">${rwDot(7, 7, st, any)}</svg>${text}</span>`;
  return `<section class="rw rwmap"><h2 class="sec" id="where">Runewords by required level</h2>
    <div class="legend">${key("vanilla", false, "Diablo II")}${key("built", false, "Legacy of the Horadrim · El–Zod")}${key("wax", false, "Legacy of the Horadrim · wax runes")}
      ${key("vanilla", true, "small: any weapon")}<span><svg class="sw" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="none" stroke="var(--title)" stroke-width="1.5"/></svg>${esc(me.n)}</span></div>
    <div class="scroll">${svg.join("")}</svg></div><ul class="near">${rows.map(r => `<li><b>${esc(r.n)}</b>${near(r)}</li>`).join("")}</ul>
    <p><a href="${RWMAP}">Runeword map →</a></p></section>`;
}

// Endgame life comparison: chart and complete roster use the same player setting.
document.addEventListener('click', event => {
  const button = event.target.closest('[data-egplayers]');
  if (!button) return;
  const players = Number(button.dataset.egplayers);
  document.querySelectorAll('[data-egplayers]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  document.querySelectorAll('[data-egchart]').forEach(chart => { chart.hidden = Number(chart.dataset.egchart) !== players; });
  document.querySelectorAll('[data-eglife]').forEach(life => { life.textContent = (Number(life.dataset.eglife) * (players + 1) / 2).toLocaleString('en-US'); });
});

// The endgame's feature strip scrolls by hand; it turns a card every six seconds until the reader touches, scrolls or
// tabs into it, pauses under the pointer, and never moves for readers who ask for less motion.
function featureStrip() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.eg-strip').forEach(strip => {
    let paused = false, stopped = false;
    strip.addEventListener('pointerenter', () => { paused = true; });
    strip.addEventListener('pointerleave', () => { paused = false; });
    ['pointerdown', 'focusin', 'wheel', 'keydown'].forEach(e => strip.addEventListener(e, () => { stopped = true; }, {passive: true}));
    setInterval(() => {
      if (paused || stopped || document.hidden) return;
      const step = strip.firstElementChild.offsetWidth + parseFloat(getComputedStyle(strip).columnGap);
      strip.scrollTo({left: strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2 ? 0 : strip.scrollLeft + step, behavior: 'smooth'});
    }, 6000);
  });
}

// Patch notes and news, cards 1 A and 2 A: the rail marks the section in view; the narrow Contents bar closes after a jump.
function notesRail() {
  const byId = new Map([...document.querySelectorAll(".pn-rail a[href^='#']")].map(a => [a.getAttribute("href").slice(1), a]));
  const heads = [...document.querySelectorAll(".pn-notes h2[id], .pn-notes h3[id]")].filter(h => byId.has(h.id));
  let cur;
  const mark = () => {
    let on = heads[0];
    for (const h of heads) if (h.getBoundingClientRect().top < 230) on = h;
    if (on === cur) return;
    if (cur) byId.get(cur.id).removeAttribute("aria-current");
    cur = on; byId.get(on.id).setAttribute("aria-current", "location");
  };
  if (heads.length) { addEventListener("scroll", mark, {passive: true}); mark(); }
  document.querySelectorAll(".pn-jump a").forEach(a => a.addEventListener("click", () => { a.closest("details").open = false; }));
}
