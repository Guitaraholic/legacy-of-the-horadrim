// Skills reference: skills.html (one class, its three trees) and skill/<slug>.html (one skill: what it does,
// its numbers level by level, its synergies, and its history). The build planner is builds-page.js.
// One changed line as the Class balance card draws it (class_balance.py line()): label, then before → after.
const balLine = ([label, before, after, lvl]) => `<div class="bal-ch"><span>${esc(label)}${lvl ? `<small>at level ${lvl}</small>` : ""}</span>
  <b>${before == null ? "<s>none</s>" : `<s>${esc(before)}</s>`}<i>→</i>${after == null ? "removed" : esc(after)}</b></div>`;
const relName = v => release(v).replace(/-dev<\/a>/, "</a>").replace(/^this build/, "This build");  // a dev build's version reads as its number
const short = {"Level": "Lvl", "Chance of losing durability": "Dur. loss"};  // the level table's headings on a phone

const trees = c => [3, 2, 1].map(p => W.skills.filter(s => s.cls === c && s.page === p).sort((a, b) => a.row - b.row || a.col - b.col));
const changed = s => !!(s.ln?.length || s.chg);
const changeLines = s => s.ln?.length ? `<div class="bal-lines">${s.ln.map(balLine).join("")}</div>` : "";

// skills.html (card 22): one class at a time; each tree in the game's own grid, levels running down, the changed skills
// ringed; the chosen skill's change in words beside the trees. Narrow, one tree at a time as a list, each row a link.
PAGES.skills = () => {
  const narrow = matchMedia("(max-width:1000px)");
  const st = {c: CLASSES.includes(decodeURIComponent(location.hash.slice(1))) ? decodeURIComponent(location.hash.slice(1)) : CLASSES[0], t: 0, sel: null};
  $("#main").innerHTML = crumbs([[U.page("index"), "Home"], [null, "Skills"]]) + `<h1>Skills</h1>
    <p class="lede">Gold rings mark changed skills. <a href="${U.page("builds")}">Plan a character</a>.</p>
    <nav class="effect-links" aria-label="Skill effects"><a class="pill" href="${U.guide("skill-effects")}">Skill effects</a>${W.effectGuides.map(([slug, title]) => `<a class="pill" href="${U.guide(slug)}">${esc(title)}</a>`).join("")}</nav>
    <div class="classtabs sk-ctabs" role="tablist" aria-label="Class">${CLASSES.map(c => `<button type="button" class="ctab" role="tab" data-c="${c}">${W.classArt[c] ? `<img src="${U.art(W.classArt[c])}" alt="">` : ""}<span>${c}</span></button>`).join("")}</div>
    <p class="sk-key"><span><i></i>Changed by Legacy of the Horadrim</span><span id="sk-n"></span></p>
    <div class="sk-ttabs" role="tablist" aria-label="Skill tree"></div><div class="sk-grid"></div>`;
  const tile = s => `<a class="sk-t${changed(s) ? " chg" : ""}" href="${U.skill(s.s)}" data-s="${s.s}" style="grid-row:${s.row};grid-column:${s.col}">`
    + `${s.icon ? `<img src="${U.art(s.icon)}" alt="" loading="lazy">` : "<span></span>"}<b>${esc(s.n)}</b><small>required level ${s.rl}</small>`
    + `${changed(s) && s.w ? `<em>${esc(s.w)}</em>` : ""}</a>`;
  const side = s => `<header>${s.icon ? `<img src="${U.art(s.icon)}" alt="">` : ""}<div><h2>${esc(s.n)}</h2><span class="mut">${esc(s.tree)} · required level ${s.rl}</span></div></header>
    <p>${esc(s.d.replace(/\n/g, " "))}</p>
    ${changed(s) ? `<div class="sk-chg"><h3>What Legacy of the Horadrim changed</h3>${changeLines(s)}${s.w ? `<p class="bal-why">${esc(s.w)}</p>` : ""}</div>`
      : `<p class="mut">Unchanged from Diablo II${s.max !== s.vmax ? `, apart from its maximum level: ${s.vmax} → ${s.max}` : ""}.</p>`}
    ${s.req.length ? `<p><span class="mut">Needs</span> ${s.req.map(esc).join(", ")}</p>` : ""}${s.syn.length ? `<p><span class="mut">Bonuses from</span> ${s.syn.map(esc).join(", ")}</p>` : ""}
    <p class="sk-go"><a class="pill" href="${U.skill(s.s)}">Open skill page</a><a class="pill" href="${U.page("builds")}#c=${s.cls}&s=${s.s}">Plan a build with it</a></p>`;
  const draw = () => {
    const ts = trees(st.c), sk = ts.flat(), lv = [1, 2, 3, 4, 5, 6].map(r => Math.min(...sk.filter(s => s.row === r).map(s => s.rl)));
    if (!sk.some(s => s.s === st.sel)) st.sel = (sk.find(changed) || sk[0]).s;
    document.querySelectorAll(".sk-ctabs .ctab").forEach(b => { b.classList.toggle("on", b.dataset.c === st.c); b.setAttribute("aria-selected", b.dataset.c === st.c); });
    $("#sk-n").textContent = `${sk.filter(changed).length} of ${sk.length} ${st.c} skills changed`;
    $(".sk-ttabs").innerHTML = ts.map((t, k) => `<button type="button" role="tab" aria-selected="${k === st.t}" data-t="${k}">${esc(t[0]?.tree || "")}</button>`).join("");
    $(".sk-grid").innerHTML = `<div class="sk-lv" aria-hidden="true"><span></span>${lv.map(l => `<span>level ${l}</span>`).join("")}</div>`
      + ts.map((t, k) => `<section class="sk-tree${k === st.t ? " on" : ""}"><h2>${esc(t[0]?.tree || "")}</h2><div class="sk-tg">${t.map(tile).join("")}</div></section>`).join("")
      + `<aside class="sk-side" aria-live="polite">${side(sk.find(s => s.s === st.sel))}</aside>`;
    $(`.sk-t[data-s="${st.sel}"]`)?.setAttribute("aria-current", "true");
  };
  $(".sk-ctabs").onclick = e => { const b = e.target.closest("[data-c]"); if (b) { st.c = b.dataset.c; st.t = 0; history.replaceState(null, "", "#" + st.c); draw(); } };
  addEventListener("hashchange", () => {  // the top menu's Skills → Druid links here as skills.html#Druid
    const c = decodeURIComponent(location.hash.slice(1));
    if (CLASSES.includes(c) && c !== st.c) { st.c = c; st.t = 0; draw(); }
  });
  $(".sk-ttabs").onclick = e => { const b = e.target.closest("[data-t]"); if (b) { st.t = +b.dataset.t; draw(); } };
  $(".sk-grid").onclick = e => {  // wide: a skill shows its change beside the trees; narrow: its row opens its page
    const a = e.target.closest(".sk-t"); if (!a || narrow.matches || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault(); st.sel = a.dataset.s; draw(); $(`.sk-t[data-s="${st.sel}"]`)?.focus();
  };
  draw();
};

PAGES.skill = () => {
  const s = W.skills.find(x => x.s === KEY), mine = W.skills.filter(x => x.cls === s.cls), byName = n => mine.find(x => x.n === n);
  const link = n => byName(n) ? `<a href="${U.skill(byName(n).s)}">${esc(n)}</a>` : esc(n);
  // level table: one row per level, one column per tooltip line ("Label: value", or a number inside the text)
  let table = "", fixed = [], syn = [];
  if (window.SkillCalc && W.calc?.[s.id]) {
    const rows = [], cols = [];
    for (let lvl = 1; lvl <= s.max; lvl++) {
      const r = SkillCalc.lines(W.calc, s.id, lvl, () => 0, {clvl: 99}), row = {};
      if (lvl === 1) { fixed = r.fixed; syn = r.synergy; }
      for (const line of r.current) {
        const i = line.indexOf(": "), key = i > 0 ? line.slice(0, i) : line.replace(/[\d.+-]+/g, "#");
        if (!cols.includes(key)) cols.push(key);
        row[key] = i > 0 ? line.slice(i + 2) : (line.match(/[\d.+-]+/g) || []).join("–");
      }
      rows.push(row);
    }
    const th = c => short[c] ? `<th><span class="skp-long">${esc(c)}</span><span class="skp-short">${short[c]}</span></th>` : `<th>${esc(c)}</th>`;
    table = `<div class="lvtable skp-lv"><table><tr>${th("Level")}${cols.map(c => th(c.replace("#", "").trim())).join("")}</tr>
      ${rows.map((r, i) => `<tr${i + 1 > s.vmax ? ' class="loth"' : ""}><td>${i + 1}</td>${cols.map(c => `<td>${esc(r[c] ?? "")}</td>`).join("")}</tr>`).join("")}</table></div>
      <p class="mut small">Hard points only, no synergies or +skills. ${s.max > s.vmax ? `Levels ${s.vmax + 1}–${s.max} (shaded) are reachable with hard points only in Legacy of the Horadrim.` : ""}</p>`;
  }
  // LotH's change: the Class balance card's lines and reason (ln, w), first on the page; no raw table fields
  const dir = {buff: "made it stronger", nerf: "made it weaker", mixed: "made it stronger in some ways, weaker in others", change: "changed it"};
  const change = s.ln?.length || s.max !== s.vmax ? `<section class="panel skp-chg"><h2>What Legacy of the Horadrim changed</h2>
    ${s.w ? `<p>${esc(s.w)}</p>` : ""}<div class="bal-lines">${(s.ln || []).map(balLine).join("")}
    ${s.max !== s.vmax ? balLine(["Maximum level", s.vmax, s.max]) : ""}</div></section>` : "";
  const by = mine.filter(x => x.syn.includes(s.n));
  const facts = [s.req.length && `Needs ${s.req.map(link).join(", ")}`, s.syn.length && `Bonuses from ${s.syn.map(link).join(", ")}`,
    by.length && `Boosts ${by.map(x => link(x.n)).join(", ")}`, s.max === s.vmax && `Maximum Level: ${s.max}`, ...fixed.map(esc)].filter(Boolean);
  const hist = `<ul class="hist"><li><b>${esc(s.era)}</b> ${s.era === "Reign of the Warlock" ? "Added with the Warlock" : "Part of the original class"}</li>
    ${s.v33?.length ? `<li><b>3.3</b> Changed by Blizzard</li>` : ""}
    ${(s.rel || []).map(([v, d]) => `<li><b>${relName(v)}</b> Legacy of the Horadrim ${dir[d]}</li>`).join("")}
    ${!s.rel?.length && s.chg ? `<li><b>${relName(s.cv)}</b> Changed by Legacy of the Horadrim</li>` : ""}
    ${s.max !== s.vmax ? `<li><b>${s.mv ? relName(s.mv) : "Legacy of the Horadrim"}</b> Maximum level ${s.vmax} → ${s.max}</li>` : ""}</ul>`;
  $("#main").innerHTML = crumbs([[U.page("index"), "Home"], [U.page("skills"), "Skills"], [U.page("skills") + "#" + s.cls, s.cls], [null, s.n]])
    + `<div class="skpage"><div class="skhead big">${s.icon ? `<img src="${U.art(s.icon)}" alt="">` : ""}<div><h1>${esc(s.n)}</h1>
      <p class="mut">${esc(s.cls)} · ${esc(s.tree)} · required level ${s.rl}</p><p>${esc(s.d).replace(/\n/g, "<br>")}</p>
      <a class="pill" href="${U.page("builds")}#c=${s.cls}&s=${s.s}">Plan a build with ${esc(s.n)}</a></div></div>
      <nav class="effect-links" aria-label="Effects that apply to this skill">${W.effectGuides.filter(([, , stat]) => W.skillShape[stat]?.includes(s.id)).map(([slug, title]) => `<a class="pill" href="${U.guide(slug)}">${esc(title)}</a>`).join("")}</nav>
      ${change}${facts.length ? `<p class="skp-facts">${facts.join(" · ")}</p>` : ""}
      ${panel("By level", table)}
      ${syn.length ? panel("Synergies", `<div class="calc syn">${syn.map(l => `<div>${esc(l)}</div>`).join("")}</div>`) : ""}
      ${panel("History", hist)}</div>` + pager(trees(s.cls).flat(), s, x => U.skill(x.s));
};
