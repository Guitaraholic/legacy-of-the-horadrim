// Per-item source data is loaded only after following “Where does it drop?”.
(() => {
  const origin = i => i.o === "loth" ? "LotH" : "Vanilla";
  const option = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
  const select = (id, title, choices) => `<label for="${id}">${title}<select id="${id}">${choices.map(([v, t]) => option(v, t)).join("")}</select></label>`;
  const sortChoices = fields => fields.flatMap(([k, t]) => [[k, `${t}, ascending`], ["-" + k, `${t}, descending`]]);
  const headers = fields => `<thead><tr>${fields.map(([k, t]) => `<th aria-sort="none"><button type="button" data-dpx-sort="${k}">${t}</button></th>`).join("")}</tr></thead>`;
  function sortWire(box, draw) {
    const sel = $("#dpx-sort");
    box.addEventListener("click", e => {
      const b = e.target.closest("[data-dpx-sort]");
      if (!b) return;
      sel.value = sel.value === b.dataset.dpxSort ? "-" + b.dataset.dpxSort : b.dataset.dpxSort;
      draw();
      $(`[data-dpx-sort="${b.dataset.dpxSort}"]`, box)?.focus();
    });
    sel.onchange = draw;
  }
  function sorted(rows, value, get) {
    const desc = value.startsWith("-"), key = value.replace(/^-/, "");
    return rows.sort((a, b) => {
      const x = get(a, key), y = get(b, key);
      if (x == null || y == null) return (x == null) - (y == null);
      return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "en", {numeric: true})) * (desc ? -1 : 1);
    });
  }
  function markSort() {
    const value = $("#dpx-sort").value;
    document.querySelectorAll("[data-dpx-sort]").forEach(b => b.parentElement.setAttribute("aria-sort",
      value.replace(/^-/, "") === b.dataset.dpxSort ? value.startsWith("-") ? "descending" : "ascending" : "none"));
  }
  PAGES.dropindex = () => {
    const fields = [["n", "Item / base"], ["o", "Origin"], ["fam", "Type"]];
    $("#dpx-index").innerHTML = `<div class="dbwrap dpx"><aside class="rail dpx-controls">
      <label for="dpx-q">Find an item<input id="dpx-q" type="search" placeholder="Item or base name"></label>
      ${select("dpx-origin", "Origin", [["", "All origins"], ["loth", "LotH"], ["vanilla", "Vanilla"]])}
      ${select("dpx-family", "Type", [["", "All types"], ...[...new Set(W.items.map(i => i.fam))].sort().map(f => [f, f])])}
      ${select("dpx-sort", "Sort by", sortChoices(fields))}</aside><div class="dpx-main"><p id="dpx-count" role="status"></p>
      <table class="dpx-table">${headers(fields)}<tbody id="dpx-rows"></tbody></table><button class="pill" id="dpx-more" type="button">Show more</button></div></div>`;
    let limit = 50;
    const draw = () => {
      const q = $("#dpx-q").value.toLowerCase();
      const rows = sorted(W.items.filter(i => !i.co && `${i.n} ${i.b}`.toLowerCase().includes(q)
        && (!$("#dpx-origin").value || i.o === $("#dpx-origin").value) && (!$("#dpx-family").value || i.fam === $("#dpx-family").value)), $("#dpx-sort").value,
      (i, k) => k === "o" ? origin(i) : i[k]);
      $("#dpx-count").textContent = `${rows.length} ${rows.length === 1 ? "item" : "items"} · showing ${Math.min(limit, rows.length)}`;
      $("#dpx-rows").innerHTML = rows.slice(0, limit).map(i => `<tr><td><a class="dpx-item q-${i.q}" href="${ROOT}drops/${i.s}.html">${i.a ? `<img src="${U.art(i.a)}" alt="">` : '<span class="dpx-frame"></span>'}<span>${esc(i.n)}<small>${esc(i.b)}</small></span></a></td>
        <td data-label="Origin">${origin(i)}</td><td data-label="Type">${esc(i.fam)}</td></tr>`).join("") || '<tr><td colspan="3">No items match. Clear the search or change a filter.</td></tr>';
      $("#dpx-more").hidden = limit >= rows.length;
      markSort();
    };
    for (const id of ["q", "origin", "family"]) $("#dpx-" + id).addEventListener("input", () => { limit = 50; draw(); });
    $("#dpx-more").onclick = () => { limit += 100; draw(); };
    sortWire($("#dpx-index"), draw);
    draw();
  };
  function chanceText(q) {
    if (!q) return "0%";
    const digits = Math.max(2, 3 - Math.floor(Math.log10(q * 100)));
    const pct = q < 1 ? Math.min(Number((q * 100).toFixed(digits)), 99.99) : 100;
    return `${pct}%${q < 0.01 ? ` (1 in ${Math.round(1 / q).toLocaleString("en-US")})` : ""}`;
  }
  PAGES.drops = async () => {
    const box = $("#dpx-explorer"), i = BY[KEY];
    try {
      const [sources, data] = await Promise.all(["data/drop-sources.json", `data/drops/${KEY}.json.gz`].map(p => fetch(ROOT + p).then(r => {
        if (!r.ok) throw new Error("Source request failed");
        return p.endsWith(".gz") ? new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).json() : r.json();
      })));
      for (const [root, curve] of Object.entries(data.curves)) if (Array.isArray(curve)) data.curves[root] = curve.map(([level, q, reason]) => [level, q > 0 ? "yes" : "no", q, reason || chanceText(q)]);
      for (const [root, curve] of Object.entries(data.curves)) if (typeof curve === "number") data.curves[root] = data.curves[curve];
      const fields = [["n", "Source"], ["d", "Difficulty / level"], ["can", "Can drop here"], ["q", "Chance per kill / opening"]];
      let limit = 50, selected = null;
      const sourceText = (s, p) => p[2] == null ? p[3] : `${s.n} · ${s.d}${s.k === "Quest kill" ? " (quest kill)" : ""} · ${p[2] === 0 ? "0%" : p[3]}${i.q === "unique" || i.q === "set" ? " · 0% magic find" : ""}`;
      const point = (s, level = s.l) => {
        if (data.curves[s.r] && !level && s.k !== "Event reward" && (i.q !== "misc" || s.u)) return [0, "unknown", null, "Built tables do not identify the monster or chest level; quality eligibility and odds depend on that level"];
        return data.curves[s.r]?.findLast(p => p[0] <= (level || 1)) || [0, "no", 0, i.q === "rw" ? "Made by socketing runes" : "No drop route"];
      };
      box.innerHTML = `<div class="dbwrap dpx"><aside class="rail dpx-controls">
        <label for="dpx-q">Find a source<input id="dpx-q" type="search" placeholder="Boss, zone or monster"></label>
        ${select("dpx-view", "Sources", [["boss", "Bosses and named sources"], ["area", "Zone and monster"]])}
        ${select("dpx-diff", "Difficulty", [["", "All difficulties"], ...["Normal", "Nightmare", "Hell"].map(d => [d, d])])}
        <div id="dpx-area-controls" hidden>${select("dpx-zone", "Zone", [["", "All zones"], ...[...new Set(sources.filter(s => s.v === "area").map(s => s.z))].sort().map(z => [z, z])])}
        ${select("dpx-kind", "Monster type", [["", "All types"], ...["Regular", "Champion", "Unique"].map(k => [k, k])])}</div>
        <label class="dpx-check"><input id="dpx-impossible" type="checkbox">Include sources with no drop route</label>
        ${select("dpx-sort", "Sort by", sortChoices(fields))}</aside><div class="dpx-main">
        ${data.once ? '<p>Each Remnant grants its skill point once per character.</p>' : ""}
        ${i.q === "rw" ? '<p>Socket runes to make this runeword; its item page links to rune drop sources.</p>' : ""}
        <div class="dpx-stated">${panel("Other ways to obtain it", W.recipes.filter(r => r.outs.some(x => x.s === i.s)).map(r => recipeRow(r)).join(""))}</div>
        <section id="dpx-curve" class="dpx-curve" hidden><h2 class="sec">Chance by area level</h2><p id="dpx-curve-context"></p>
          <label for="dpx-level">Comparison area level <output id="dpx-level-value"></output><input id="dpx-level" type="range" min="1" max="109"></label>
          <p id="dpx-level-result" role="status"></p><div id="dpx-plot"></div><details><summary>View chart values</summary><ol id="dpx-values"></ol></details></section>
        <p id="dpx-context"></p><p id="dpx-count" role="status"></p><table class="dpx-table">${headers(fields)}<tbody id="dpx-rows"></tbody></table>
        <button class="pill" id="dpx-more" type="button">Show more</button>
        <p id="dpx-curve-hint">Choose “Zone and monster”, then select a source to compare area levels.</p></div></div>`;
      const chart = () => {
        if (selected == null) return;
        const s = sources[selected], level = +$("#dpx-level").value, got = point(s, level + s.off);
        const values = Array.from({length: 109}, (_, n) => point(s, n + 1 + s.off));
        const known = values.filter(p => p[2] != null && p[2] > 0);
        $("#dpx-curve").hidden = !known.length;
        if (!known.length) { $("#dpx-plot").innerHTML = ""; return; }
        $("#dpx-level-value").value = level;
        $("#dpx-level-result").textContent = `Area level ${level} · monster level ${level + s.off}: ${got[1] === "yes" ? "Can drop here" : got[1] === "no" ? "Cannot drop here" : "—"}${" · " + sourceText(s, got)}`;
        $("#dpx-values").innerHTML = values.map((p, n) => `<li>Area level ${n + 1}: ${esc(sourceText(s, p))}</li>`).join("");
        const max = Math.max(...known.map(p => p[2])), x = n => 68 + (n - 1) / 108 * 620, y = q => 174 - q / max * 140;
        let paths = "", drawing = false;
        values.forEach((p, n) => { if (p[2] == null) { drawing = false; return; } paths += `${drawing ? "L" : "M"}${x(n + 1)},${y(p[2])} `; drawing = true; });
        $("#dpx-plot").innerHTML = `<svg viewBox="0 0 720 220" role="img" aria-label="${esc(i.n)}: chance by area level for ${esc(s.n)}"><path d="M68 25V174H688" class="dpx-axis"/><path d="${paths}" class="dpx-line"/>
          ${[1, 30, 60, 90, 109].map(n => `<text x="${x(n)}" y="198" text-anchor="middle">${n}</text>`).join("")}
          <text x="64" y="38" text-anchor="end">${(max * 100).toPrecision(2)}%</text><text x="64" y="178" text-anchor="end">0%</text><text x="370" y="218" text-anchor="middle">Area level</text>
          ${got[2] != null ? `<circle cx="${x(level)}" cy="${y(got[2])}" r="4"/>` : ""}</svg>`;
      };
      const draw = () => {
        const area = $("#dpx-view").value === "area", query = $("#dpx-q").value.toLowerCase();
        $("#dpx-area-controls").hidden = !area;
        $("#dpx-context").textContent = `${area ? "Zone and monster sources" : "Bosses and named sources"} · players 1 · no Magic Find.`;
        const rows = sorted(sources.map((s, ix) => ({...s, ix, p: point(s)})).filter(s => s.v === $("#dpx-view").value
          && (!$("#dpx-diff").value || s.d === $("#dpx-diff").value)
          && (!area || !$("#dpx-zone").value || s.z === $("#dpx-zone").value) && (!area || !$("#dpx-kind").value || s.k === $("#dpx-kind").value)
          && `${s.n} ${s.z} ${s.k}`.toLowerCase().includes(query) && ($("#dpx-impossible").checked || s.p[1] !== "no")), $("#dpx-sort").value,
        (s, k) => k === "q" ? s.p[2] : k === "can" ? s.p[1] : k === "d" ? ["Normal", "Nightmare", "Hell"].indexOf(s.d) * 1000 + s.l : s.n);
        if (area && !rows.some(s => s.ix === selected)) selected = rows[0]?.ix ?? null;
        $("#dpx-count").textContent = `${rows.length} ${rows.length === 1 ? "source" : "sources"} · showing ${Math.min(limit, rows.length)}`;
        $("#dpx-rows").innerHTML = rows.slice(0, limit).map(s => `<tr${selected === s.ix && area ? ' class="dpx-selected"' : ""}>
          <td>${area ? `<button class="dpx-source" data-dpx-source="${s.ix}" aria-pressed="${selected === s.ix}">${esc(s.n)}</button>` : s.h ? `<a class="dpx-source" href="${ROOT}${s.h}">${esc(s.n)}</a>` : `<span class="dpx-source">${esc(s.n)}</span>`}<small>${esc([s.z, s.k].filter(Boolean).join(" · "))}</small></td>
          <td data-label="Difficulty / level">${s.d}${s.l ? `<small>Monster level ${s.l}</small>` : ""}</td>
          <td data-label="Can drop here">${s.p[1] === "yes" ? "Yes" : s.p[1] === "no" ? "No" : "—"}</td>
          <td data-label="Chance per kill / opening">${s.p[2] > 0 ? `<b data-drop-line>${esc(sourceText(s, s.p))}</b>` : s.p[1] === "yes" || s.p[1] === "unknown" ? esc(s.p[3]) : "—"}</td></tr>`).join("") || '<tr><td colspan="4">No sources match. Change a filter or include sources with no drop route. Recipes and item details are linked above.</td></tr>';
        $("#dpx-more").hidden = limit >= rows.length;
        $("#dpx-curve").hidden = !area || selected == null;
        $("#dpx-curve-hint").hidden = area && selected != null;
        if (area && selected != null) {
          const s = sources[selected];
          $("#dpx-curve-context").textContent = `${s.z} · ${s.n} · ${s.k} · ${s.d}. Actual area level ${s.a}; monster level ${s.l}. ${s.d === "Normal" ? "In Normal difficulty, monsters use their own levels; the comparison below is hypothetical." : "The comparison uses this monster and difficulty at each area level."}`;
          $("#dpx-level").value = Math.min(109, Math.max(1, s.d === "Normal" ? s.l - s.off : s.a));
          chart();
        }
        markSort();
      };
      for (const id of ["q", "view", "diff", "zone", "kind", "impossible"]) $("#dpx-" + id).addEventListener("input", () => { limit = 50; draw(); });
      $("#dpx-more").onclick = () => { limit += 100; draw(); };
      $("#dpx-rows").onclick = e => {
        const b = e.target.closest("[data-dpx-source]");
        if (b) { selected = +b.dataset.dpxSource; draw(); $(`[data-dpx-source="${selected}"]`)?.focus(); }
      };
      $("#dpx-level").oninput = chart;
      sortWire(box, draw);
      draw();
    } catch (e) {
      box.innerHTML = '<p>Drop sources could not load. Reload this page to try again, or return to the item details above.</p>';
      console.error(e);
    }
  };
})();
