// Option A's layer over app.js (moo.py's page only; mp- prefix). The page carries its own items (#mp-items): they join BY
// for this page view only, so the house tooltip, list rows and cards draw them, and app.js / data/wiki.json still name nothing.
// The drops: the database's left rail (kind, slot, class), the hoard's list with the selected item's tooltip beside it,
// or cards (the List/Cards choice is the reader's, as on every list). A click on any item on the page selects it there. Every name and caption comes from the page's JSON: this file names nothing.
(() => {
  const own = JSON.parse(document.getElementById("mp-items").textContent);
  const guide = PAGES.guide;
  PAGES.guide = function () {
    for (const i of own.items) { i.hay = [i.n, i.b, i.t, i.set, i.fl, ...i.l].join(" ").toLowerCase(); BY[i.s] = i; }
    Object.assign(W.sets, own.sets);
    guide.call(this);
    loot();
  };
  const SLOT = i => i.kind === "relic" ? "Relics" : SLOTS.find(([, , ts]) => ts.includes(i.t))?.[1] || i.t;
  const ORDER = [...SLOTS.map(([, n]) => n), "Charms", "Relics"];  // the paper doll's order, as the cards' shelves
  const KINDS = [["", "All"], ["unique", "Uniques"], ["set", Object.keys(own.sets)[0]], ["relic", "Relics"]];
  const set = Object.values(own.sets)[0];
  const st = {q: "", k: "", slot: "", cls: ""};
  let sel, showFilters = false;
  const list = () => own.items.filter(i => (!st.k || i.kind === st.k) && (!st.slot || SLOT(i) === st.slot) && (!st.cls || i.cls === st.cls)
    && st.q.toLowerCase().split(/\s+/).filter(Boolean).every(w => i.hay.includes(w)))
    .sort((a, b) => ORDER.indexOf(SLOT(a)) - ORDER.indexOf(SLOT(b)) || a.n.localeCompare(b.n));
  const setBox = i => i.set ? `<div class="led-src mp-set"><b>${esc(set.n)}</b>: ${set.pieces.map(s => `<a href="#${s}" data-tip="${s}" class="q-set">${esc(BY[s].n)}</a>`).join(", ")}`
    + `<ul>${set.bonus.map(([k, t]) => `<li><span>${esc(k)}</span> ${esc(t)}</li>`).join("")}</ul></div>` : "";
  const panel = i => ledPanel(i).replace(/<div class="led-go">[\s\S]*?<\/div>/, "") + setBox(i);  // no item page: this page is its one page
  const row = (i, on) => ledRow(i, on, false).replace(`data-s="${i.s}"`, `data-s="${i.s}" data-moo="${i.moo}" id="${i.s}"`)
    .replace(/<div class="led-inl">[\s\S]*$/, on ? `<div class="led-inl">${panel(i)}</div>` : "");
  const card = i => `<div class="tile mp-card${i.s === sel ? " on" : ""}" id="${i.s}" data-moo="${i.moo}" data-s="${i.s}" tabindex="0">${artBox(i)}${tip(i)}<div class="foot"><span>${esc(i.src[0][1])}</span></div></div>`;
  const setCard = () => `<div class="tile mp-card mp-setcard" id="${set.s}" data-moo="${set.moo}"><div class="d2tip q-set"><div class="nm">${esc(set.n)}</div><div class="w">${set.pieces.length} pieces</div>`
    + `<div class="mods">${set.bonus.map(([k, t]) => `<div>${esc(t)} (${esc(k)})</div>`).join("")}</div></div></div>`;
  const count = (f, v) => own.items.filter(i => f(i) === v).length;

  function loot() {
    const box = $("#mp-loot");
    box.innerHTML = `<div class="dbwrap mp-db"><aside class="rail" id="mp-rail"></aside><div class="results"><div class="bar" id="mp-bar"></div><div id="mp-res"></div></div></div>`;
    const draw = () => {
      const shown = list(), rail = $("#mp-rail");
      if (!shown.some(i => i.s === sel)) sel = shown[0]?.s;
      rail.classList.toggle("open", showFilters);
      const n = [st.k, st.slot, st.cls].filter(Boolean).length;
      rail.innerHTML = `<input id="mp-q" type="search" placeholder="Filter by name or stat…" aria-label="Filter the drops" value="${esc(st.q)}">${fToggle(showFilters, n)}<div class="facets">`
        + `<h3>Kind</h3><div class="pills">${KINDS.map(([v, t]) => fPill("k", v, `${t} ${v ? count(i => i.kind, v) : own.items.length}`, st.k === v)).join("")}</div>`
        + `<h3>Slot</h3><div class="pills">${fPill("slot", "", "Any", !st.slot)}${ORDER.filter(s => count(SLOT, s)).map(s => fPill("slot", s, `${s} ${count(SLOT, s)}`, st.slot === s)).join("")}</div>`
        + `<h3>Class only</h3><div class="pills">${fPill("cls", "", "Any", !st.cls)}${CLASSES.filter(c => count(i => i.cls, c)).map(c => fPill("cls", c, `${c} ${count(i => i.cls, c)}`, st.cls === c)).join("")}</div></div>`;
      $("#mp-bar").innerHTML = `<b>${shown.length}</b> ${shown.length === 1 ? "item" : "items"} <span class="mp-odds">${esc(own.captions[st.k] ?? own.captions[""])}</span>${viewToggle()}`;
      const cards = VIEW() === "cards";
      $("#mp-res").innerHTML = !shown.length ? `<p class="empty">Nothing matches. Remove a filter.</p>` : cards
        ? shelves(shown, card) + (!st.slot && !st.cls && !st.q && (!st.k || st.k === "set") ? `<h2 class="sec">${esc(set.n)} <small>set bonuses</small></h2><div class="grid">${setCard()}</div>` : "")
        : `<div class="led"><div><div class="led-hd"><span></span><span>Item</span><span>Level</span><span>Stats</span><span>Where</span></div>`
          + `<div role="listbox" aria-label="The drops">${shown.map(i => row(i, i.s === sel)).join("")}</div></div><aside class="led-tip">${panel(BY[sel])}</aside></div>`;
      wire();
    };
    const pick = (s, focus = true) => {
      if (s === set.s) { Object.assign(st, {q: "", k: "set", slot: "", cls: ""}); s = set.pieces[0]; }  // the set's link: its pieces, its bonuses beside them
      if (!BY[s] || !own.items.some(i => i.s === s)) return false;
      if (!list().some(i => i.s === s)) Object.assign(st, {q: "", k: "", slot: "", cls: ""});
      sel = s; draw();
      const el = document.getElementById(s);
      el?.scrollIntoView({block: "nearest"});
      if (focus) el?.focus({preventScroll: true});
      return true;
    };
    const wire = () => {
      $("#mp-q").oninput = e => { st.q = e.target.value; draw(); const q = $("#mp-q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); };
      fWire($("#mp-rail"), o => showFilters = o);
      box.querySelectorAll("#mp-rail .pill[data-k]").forEach(b => b.onclick = () => { st[b.dataset.k] = b.dataset.v; draw(); $(`#mp-rail [data-k="${b.dataset.k}"][data-v="${CSS.escape(b.dataset.v)}"]`).focus(); });
    };
    ledgerKeys(box, s => { sel = s; draw(); });
    box.addEventListener("click", e => { const c = e.target.closest(".mp-card[data-s]"); if (c) { sel = c.dataset.s; draw(); } });
    box.addEventListener("keydown", e => { const c = e.target.closest(".mp-card[data-s]"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(c.dataset.s); } });
    onView(draw);
    draw();
    // a click on any of the page's items (the route, the pool's icons, the giver's link) selects it in the drops; egg 1's hash does too
    document.addEventListener("click", e => {
      const a = e.target.closest('a[href^="#"]'), s = a && decodeURIComponent(a.getAttribute("href").slice(1));
      if (s && pick(s)) { e.preventDefault(); history.replaceState(null, "", "#" + s); }
    });
    const h = decodeURIComponent(location.hash.slice(1)), byHash = h === set.moo || h === set.s ? set : own.items.find(i => i.moo === h || i.s === h);
    if (byHash) setTimeout(() => pick(byHash.s, false), 0);
  }
})();
