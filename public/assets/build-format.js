// Version 6 stores named choices, never positions in a release's exported tables.
export const SNAPSHOT_KEYS = "bases baseArt items sets skills trees classArt calc properties displayStats runeCatalog runes runeArt build charstats rollProps skillFunc propertyGroups statOps planner facts inv bp moo guides announcements".split(" ");
export const BUILD_LIMIT = 512 * 1024;
const classes = "Amazon Assassin Barbarian Druid Necromancer Paladin Sorceress Warlock".split(" ");
const slots = "helm amulet offhand weapon armor ring1 gloves belt ring2 boots weapon2 offhand2".split(" ");
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const name = s => typeof s === "string" && s.length > 0 && s.length <= 200;
export const releaseId = s => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
const gear = g => g && name(g.s) && (!g.so || Array.isArray(g.so) && g.so.length <= 6 && g.so.every(s => s == null || name(s)))
  && (!g.a || Array.isArray(g.a) && g.a.length <= 6 && g.a.every(name))
  && (g.n == null || integer(g.n, 0, 6)) && (g.rn == null || integer(g.rn, 0, 1000000))
  && (!g.v || typeof g.v === "object" && !Array.isArray(g.v) && Object.entries(g.v).every(([k, v]) => /^\d{1,3}$/.test(k) && Number.isFinite(v)));
const equipment = g => g && typeof g === "object" && !Array.isArray(g) && Object.entries(g).every(([k, v]) => slots.includes(k) && gear(v));
export function validate(st) {
  if (!st || !classes.includes(st.c) || !integer(st.l, 1, 99) || !integer(st.q, 0, 3) || !integer(st.e, 0, 5)
    || (st.n != null && (typeof st.n !== "string" || st.n.length > 200))
    || !(st.r === "" || releaseId(st.r))
    || (st.u != null && (!Array.isArray(st.u) || st.u.length > 100 || !st.u.every(name)))
    || !Array.isArray(st.o) || st.o.length > 16384 || !st.o.every((e, i) => Array.isArray(e) && e.length === 2 && name(e[0]) && integer(e[1], 1, 99) && (!i || e[1] >= st.o[i - 1][1]))
    || !Array.isArray(st.a) || st.a.length > 40000 || !st.a.every(e => Array.isArray(e) && e.length === 3 && ["str", "dex", "vit", "enr"].includes(e[0]) && integer(e[1], 1, 99) && integer(e[2], 1, 10000))
    || !Array.isArray(st.k) || !st.k.length || st.k.length > 99 || !st.k.every((k, i) => integer(k.l, 1, 99) && (i ? k.l > st.k[i - 1].l : k.l === 1)
      && (k.kind == null || ["gear", "respec"].includes(k.kind)) && (k.ml == null || integer(k.ml, 1, 99))
      && equipment(k.g) && equipment(k.m) && integer(k.sw, 0, 1) && name(k.mt) && name(k.mv)
      && Array.isArray(k.ch) && k.ch.length <= 84 && k.ch.every(e => Array.isArray(e) && name(e[0]) && integer(e[1], 0, 11) && integer(e[2], 0, 6) && (!e[3] || gear(e[3])))))
    throw new Error("This build is incomplete or damaged. Its link and your saved build have been kept.");
  return st;
}
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])])) : value;
export const canonical = value => JSON.stringify(sorted(value));
// Detect stale browser data even on an HTTP LAN preview; immutable IDs use server-side SHA-256.
export function fingerprint(value) {
  const text = canonical(value); let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) {const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b, 33) ^ c;}
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}
export function encode(st) {
  const bytes = new TextEncoder().encode(canonical(validate(st)));
  let raw = ""; for (const byte of bytes) raw += String.fromCharCode(byte);
  const code = "6" + btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (code.length > BUILD_LIMIT) throw new Error("This build is too large to save. Remove unused gear sets and try again.");
  return code;
}
export function decode(code) {
  if (typeof code !== "string" || code.length > BUILD_LIMIT || !/^6[A-Za-z0-9_-]+$/.test(code)) throw new Error("This build link is not supported.");
  const raw = atob(code.slice(1).replace(/-/g, "+").replace(/_/g, "/"));
  return validate(JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(Uint8Array.from(raw, c => c.charCodeAt(0)))));
}
export function validCode(code) {
  if (typeof code !== "string" || code.length > BUILD_LIMIT) return false;
  try {
    if (code[0] === "6") { decode(code); return true; }
    return /^[1-5][A-Za-z0-9_-]{1,4096}(?:~[A-Za-z0-9_-]+)?$/.test(code);
  } catch { return false; }
}
export const TIMELINE = {quests: [[8, 18, 27], [40, 46, 53], [68, 72, 76]], tomes: [22, 50, 72], remnants: 85};
export const snapshot = (wiki, affixes) => {
  const data = structuredClone({wiki: Object.fromEntries(SNAPSHOT_KEYS.map(k => [k, wiki[k]])), affixes: {affixes: affixes.affixes, types: affixes.types, names: affixes.names}});
  data.wiki.planner = {...data.wiki.planner, timeline: data.wiki.planner.timeline || TIMELINE};
  return data;
};
const gearChoices = st => st.k.flatMap(k => [...Object.values(k.g), ...Object.values(k.m), ...k.ch.map(e => e[3] || {s: e[0]})]);
function secretData(st, data) {
  if (!st.u?.length) return data;
  const wiki = {...data.wiki, items: [...data.wiki.items]};
  for (const term of st.u.map(n => n.trim().toLowerCase().replace(/\s+/g, " "))) {
    let h = 0x811c9dc5;
    for (const c of term) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    const key = new TextEncoder().encode(term);
    for (const encoded of wiki.moo?.it?.[h.toString(16).padStart(8, "0")] || []) {
      const it = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (c, i) => c.charCodeAt(0) ^ key[i % key.length])));
      if (!wiki.items.some(i => i.s === it.s)) wiki.items.push(it);
    }
  }
  return {...data, wiki};
}
const item = (wiki, slug) => wiki.items.find(it => it.s === slug) || (slug.startsWith("b-") ? wiki.bases[slug.slice(2)] : slug.startsWith("c-") ? {n: slug} : null);
export function warnings(st, data) {
  data = secretData(st, data);
  const out = [], skills = data.wiki.skills.filter(s => s.cls === st.c);
  for (const [id] of st.o) if (!skills.some(s => s.id === id)) out.push(`Unavailable skill: ${id}. Its planned points have been kept.`);
  for (const g of gearChoices(st)) {
    if (!item(data.wiki, g.s)) out.push(`Unavailable item: ${g.s}. Its gear choice has been kept.`);
    for (const id of g.a || []) if (!data.affixes.affixes.some(a => a.id === id)) out.push(`Unavailable affix: ${id}. Its choice has been kept.`);
    for (const s of g.so || []) if (s && !item(data.wiki, s)) out.push(`Unavailable socket fill: ${s}. Its choice has been kept.`);
    if (g.b && !data.wiki.bases[g.b]) out.push(`Unavailable runeword base: ${g.b}. Its choice has been kept.`);
  }
  for (const k of st.k) if (!data.wiki.inv.mercs.some(m => m.n === k.mt && m.v.some(v => v.n === k.mv))) out.push(`Unavailable mercenary: ${k.mt}, ${k.mv}. The choice has been kept.`);
  return [...new Set(out)];
}
export function migrationNotes(st, from, to) {
  from = secretData(st, from); to = secretData(st, to);
  const notes = warnings(st, to), skill = (data, id) => data.wiki.skills.find(s => s.id === id);
  for (const id of new Set(st.o.map(e => e[0]))) {
    const a = skill(from, id), b = skill(to, id);
    if (a && b && (canonical(a) !== canonical(b) || canonical(from.wiki.calc[a.id]) !== canonical(to.wiki.calc[b.id]))) notes.push(`${a.n}: skill values or requirements changed. Planned levels stay as entered.`);
  }
  for (const s of new Set(gearChoices(st).flatMap(g => [g.s, ...(g.so || []).filter(Boolean)]))) {
    const a = item(from.wiki, s), b = item(to.wiki, s);
    if (a && b && canonical(a) !== canonical(b)) notes.push(`${a.n || s}: item values or requirements changed. Review saved rolls in the copy.`);
  }
  for (const id of new Set(gearChoices(st).flatMap(g => g.a || []))) {
    const a = from.affixes.affixes.find(a => a.id === id), b = to.affixes.affixes.find(a => a.id === id);
    if (a && b && canonical(a) !== canonical(b)) notes.push(`${a.n}: affix values changed. Review the copy’s saved rolls.`);
  }
  if (canonical(from.wiki.charstats) !== canonical(to.wiki.charstats) || canonical(from.wiki.planner) !== canonical(to.wiki.planner)) notes.push("Character or levelling rules changed. Skill and stat allocations keep their original levels; review the copy for unavailable points.");
  return notes;
}
export function migrate(st, from, to, release) {
  from = secretData(st, from); to = secretData(st, to);
  const copy = structuredClone(st), blocked = [], notes = migrationNotes(st, from, to);
  copy.r = release;
  const tuples = (data, g) => g.a?.length ? g.a.flatMap(id => data.affixes.affixes.find(a => a.id === id)?.lp || []) : item(data.wiki, g.s)?.lp || [];
  for (const g of gearChoices(copy)) {
    const old = structuredClone(g), it = item(from.wiki, old.s);
    if (it?.id != null) {
      const replacement = to.wiki.items.find(i => i.id === it.id && i.q === it.q);
      if (replacement) g.s = replacement.s;
    }
    if (g.so) g.so = g.so.map(s => { const it = s && item(from.wiki, s); return it?.id != null ? to.wiki.items.find(i => i.id === it.id && i.q === it.q)?.s || s : s; });
    if (g.a) g.a = g.a.map(id => {
      const a = from.affixes.affixes.find(a => a.id === id);
      const candidates = a ? to.affixes.affixes.filter(b => a.n === b.n && a.k === b.k && a.g === b.g && a.lv === b.lv) : [];
      if (candidates.length !== 1) { blocked.push(`Cannot match affix ${a?.n || id} safely in this release.`); return id; }
      return candidates[0].id;
    });
    if (!g.v) continue;
    const before = tuples(from, old), after = tuples(to, g), values = {};
    const key = p => p && canonical([p[0], p[3] || ""]);
    for (const [index, value] of Object.entries(g.v)) {
      const p = before[index], matches = after.map((p, i) => [p, i]).filter(([q]) => key(q) === key(p));
      if (!p || matches.length !== 1) { blocked.push(`Cannot match a saved roll on ${it?.n || old.s} safely in this release.`); continue; }
      const [q, i] = matches[0], lo = +q[1], hi = +q[2];
      values[i] = Math.max(lo, Math.min(hi, value));
      if (values[i] !== value) notes.push(`${it?.n || old.s}: ${p[0]} roll changes from ${value} to ${values[i]} to fit the new range.`);
    }
    g.v = values;
  }
  for (const k of copy.k) for (const e of k.ch) {
    const it = item(from.wiki, e[0]);
    if (it?.id != null) e[0] = to.wiki.items.find(i => i.id === it.id && i.q === it.q)?.s || e[0];
  }
  // Missing choices cannot be silently replaced by an empty slot or another mercenary.
  blocked.push(...warnings(copy, to));
  return {build: copy, notes: [...new Set(notes)], blocked: [...new Set(blocked)]};
}
export async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(typeof value === "string" ? value : canonical(value))))]
    .map(n => n.toString(16).padStart(2, "0")).join("");
}
