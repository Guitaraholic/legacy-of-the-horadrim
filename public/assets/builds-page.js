// Skill planner, in the game's own tree art. Points = (level − 1) + 4 quest points per difficulty + elixirs.
// A skill takes points once its prerequisites have one, up to min(its max level, character level − its required
// level + 1), as in the game. The build packs into a short ?b= link (packBuild).
// Phase 1 adds gear: a paperdoll, an item picker, a line→stat parser (statsOf), a read-only
// stat sheet, gear's +skills feeding the tree numbers, and gear in the share link (version "2").
const TREE = {cols: [121, 383, 643], rows: [136, 318, 494, 674, 854, 1030], icon: 130, box: [145, 81, 56], w: 895, h: 1169, tabs: 90};

// The paperdoll is the mod's own HD panel (W.inv from build.py): each slot's rect from the player and hireling
// layouts, keyed by the game's location. Weapon swap II holds weapon2/offhand2; only the active pair counts.
const GEAR_SLOTS = ["helm", "amulet", "offhand", "weapon", "armor", "ring1", "gloves", "belt", "ring2", "boots"];
const LOC = {head: "helm", neck: "amulet", torso: "armor", right_arm: "weapon", left_arm: "offhand", right_hand: "ring1",
  left_hand: "ring2", belt: "belt", feet: "boots", gloves: "gloves"};
const PLAYER_KEYS = [...GEAR_SLOTS, "weapon2", "offhand2"];
const ELEM = {Fire: "fire", Cold: "cold", Lightning: "ltng", Poison: "pois", Magic: "mag"};  // "+2 to Fire Skills" -> skills.txt EType (a skill's el)
const ELEM_NAME = Object.fromEntries(Object.entries(ELEM).map(([n, e]) => [e, n]));
const arm = (k, sw) => sw && (k === "weapon" || k === "offhand") ? k + "2" : k;  // the slot a panel key holds in swap set sw
const SLOT_LABEL = {helm: "Helm", amulet: "Amulet", offhand: "Off-hand", weapon: "Weapon", armor: "Body armor",
  ring1: "Ring", gloves: "Gloves", belt: "Belt", ring2: "Ring", boots: "Boots", weapon2: "Weapon (II)", offhand2: "Off-hand (II)", charm: "Charm"};
// An item's t (slot-group title, from build.py's TITLES) sorted into a paperdoll slot: app.js's SLOTS, a ring in either hand.
const SLOT_TITLES = Object.fromEntries(SLOTS.map(([k, , ts]) => [k, new Set(ts)]));
SLOT_TITLES.ring1 = SLOT_TITLES.ring2 = SLOT_TITLES.ring;
// Which of a rune's or gem's three bonus lists (gl) a socket reads, by the base's own slot (brief 098: a weapon's,
// a shield's, else the helm's, which every other armour shares). A jewel brings its own lines wherever it sits.
const glKey = it => ["weapon", "helm", "shield"][it?.base?.ga] || ({weapon: "weapon", offhand: "shield"})[it?.base?.sl] || "helm";
const sockLines = (x, key) => !x ? [] : x.gl ? x.gl[key] || [] : x.l || [];
const DIFF_NAMES = ["Normal", "Nightmare", "Hell"];
let BuildFormat;
async function buildJSON(url, options) {
  const r = await fetch(url, {signal: AbortSignal.timeout(15000), ...options}), data = await r.json().catch(() => ({error: "The build link service isn't available here."}));
  if (!r.ok) throw new Error(data.error || "The build could not be loaded. Please try again.");
  return data;
}

// The level timeline (experiment): a build is its skill points in the order they're spent, each with the level it's spent
// at (st.o: [slug, level]), its stat points the same way (st.a: [attribute, level, points]), and gear sets that each start
// at a level (st.k). The level slider shows the build as it stands at any level. Quest points come at the levels players
// usually finish them and Remnants after Hell: typical levels the timeline assumes, not game data.
const QUEST_LV = [[8, 18, 27], [40, 46, 53], [68, 72, 76]];  // per difficulty: Den of Evil, Radament, Izual (two points)
const QUEST_NAMES = ["Den of Evil", "Radament", "Izual"], TOME_LV = [22, 50, 72], REMNANT_LV = 85;  // Lam Esen's Tome: stat points
const questSplit = () => W.planner.quests.skills === 4 ? [1, 1, 2] : [0, 0, W.planner.quests.skills];  // a difficulty's skill points, by quest
const classSkills = st => W.skills.filter(x => x.cls === st.c);
const respecAt = (st, l = st.l) => Math.max(1, ...(st.k || []).filter(k => k.kind === "respec" && k.l <= l).map(k => k.l));
const respecEnd = (st, l = st.l) => st.k?.find(k => k.kind === "respec" && k.l > l)?.l || 100;
function pointLevels(st) {  // the level each skill point is earned at, in order
  const out = [];
  for (let l = 2; l <= 99; l++) for (let i = 0; i < W.charstats[st.c].skillsPerLevel; i++) out.push(l);
  (W.planner.timeline?.quests || QUEST_LV).slice(0, st.q).forEach(ls => questSplit().forEach((n, i) => { for (let j = 0; j < n; j++) out.push(ls[i]); }));
  for (let i = 0; i < st.e; i++) out.push(W.planner.timeline?.remnants || REMNANT_LV);
  return out.sort((a, b) => a - b);
}
// The points in o that stay legal, first to last: under its skill's cap at its level, with its prerequisites spent before
// it, and (budget) within the points earned by its level. A point that isn't (a prerequisite removed) goes; settle() skips the
// budget, so turning quests off shows points over budget rather than deleting them.
function legal(st, o, budget = true) {
  const lv = pointLevels(st), sk = classSkills(st), kept = [];
  let had = [], from = 1;
  for (const [x, l] of o) {
    const phase = respecAt(st, l); if (phase !== from) { had = []; from = phase; }
    const s = sk.find(y => y.s === x);
    if (s && s.rl <= l && (!budget || had.length < lv.filter(e => e <= l).length) && had.filter(y => y === x).length < Math.min(s.max, l - s.rl + 1)
      && s.req.every(n => had.includes(sk.find(y => y.n === n)?.s))) { kept.push([x, l]); had.push(x); }
  }
  return kept;
}
// Moving the slider only projects the saved plan. It must never delete choices.
function settle(st) {
  const from = respecAt(st);
  st.p = {}; st.o.forEach(([x, l]) => { if (l >= from && l <= st.l) st.p[x] = (st.p[x] || 0) + 1; });
  st.pt = {}; st.a.forEach(([k, l, n]) => { if (l >= from && l <= st.l) st.pt[k] = (st.pt[k] || 0) + n; });
}
// A build saved before the timeline has counts at one level: spend them lowest required level first, each as early as it
// may go, and open it at the level where the last one lands (an old link counted every quest point from level 1).
function orderFrom(st, p) {
  const left = {...p}, sk = classSkills(st).sort((a, b) => a.rl - b.rl);
  st.o = [];
  for (let l = 1; l <= 99 && Object.values(left).some(Boolean); l++)
    for (let s; (s = sk.find(s => left[s.s] > 0 && legal(st, [...st.o, [s.s, l]]).length > st.o.length)); left[s.s]--) st.o.push([s.s, l]);
  st.l = Math.max(st.l, st.o.at(-1)?.[1] || 1);
}
// A gear set holds what's worn, the mercenary and the charms; the set shown is the last that starts by st.l.
const STAGE = ["g", "m", "ch", "sw", "mt", "mv", "mc", "ml"];
const stageAt = st => st.k.reduce((at, k, i) => k.l <= st.l ? i : at, 0);
const keepStage = st => STAGE.forEach(f => { st.k[st.ki][f] = st[f]; });
const showStage = st => { st.ki = stageAt(st); const e = {g: {}, m: {}, ch: [], sw: 0, mt: 0, mv: 0, mc: null}; STAGE.forEach(f => { st[f] = st.k[st.ki][f] ?? e[f]; });
  if (st.mc) { st.mt = Math.max(0, W.inv.mercs.findIndex(m => m.n === st.mc[0])); st.mv = Math.max(0, W.inv.mercs[st.mt].v.findIndex(v => v.n === st.mc[1])); } };

// Released v1–v5 skill positions are frozen here; future table ordering must not reinterpret them.
const LEGACY_SKILLS = {
  "Amazon": ["Magic Arrow","Fire Arrow","Inner Sight","Critical Strike","Jab","Cold Arrow","Multiple Shot","Dodge","Power Strike","Poison Javelin","Exploding Arrow","Slow Missiles","Avoid","Impale","Lightning Bolt","Ice Arrow","Guided Arrow","Penetrate","Charged Strike","Plague Javelin","Strafe","Immolation Arrow","Dopplezon","Evade","Fend","Freezing Arrow","Valkyrie","Pierce","Lightning Strike","Lightning Fury"],
  "Assassin": ["Fire Trauma","Claw Mastery","Psychic Hammer","Tiger Strike","Dragon Talon","Shock Field","Blade Sentinel","Quickness","Fists of Fire","Dragon Claw","Charged Bolt Sentry","Wake of Fire Sentry","Weapon Block","Cloak of Shadows","Cobra Strike","Blade Fury","Fade","Shadow Warrior","Claws of Thunder","Dragon Tail","Lightning Sentry","Inferno Sentry","Mind Blast","Blades of Ice","Dragon Flight","Death Sentry","Blade Shield","Venom","Shadow Master","Royal Strike"],
  "Barbarian": ["Bash","Blade Mastery","Axe Mastery","Mace Mastery","Howl","Find Potion","Leap","Double Swing","Pole Arm Mastery","Throwing Mastery","Spear Mastery","Taunt","Shout","Stun","Double Throw","Increased Stamina","Find Item","Leap Attack","Concentrate","Iron Skin","Battle Cry","Frenzy","Increased Speed","Battle Orders","Grim Ward","Whirlwind","Berserk","Natural Resistance","War Cry","Battle Command"],
  "Druid": ["Raven","Plague Poppy","Wearwolf","Shape Shifting","Firestorm","Oak Sage","Summon Spirit Wolf","Wearbear","Molten Boulder","Arctic Blast","Cycle of Life","Feral Rage","Maul","Eruption","Cyclone Armor","Heart of Wolverine","Summon Fenris","Rabies","Fire Claws","Twister","Vines","Hunger","Shock Wave","Volcano","Tornado","Spirit of Barbs","Summon Grizzly","Fury","Armageddon","Hurricane"],
  "Necromancer": ["Amplify Damage","Teeth","Bone Armor","Skeleton Mastery","Raise Skeleton","Dim Vision","Weaken","Poison Dagger","Corpse Explosion","Clay Golem","Iron Maiden","Terror","Bone Wall","Golem Mastery","Raise Skeletal Mage","Confuse","Life Tap","Poison Explosion","Bone Spear","BloodGolem","Attract","Decrepify","Bone Prison","Summon Resist","IronGolem","Lower Resist","Poison Nova","Bone Spirit","FireGolem","Revive"],
  "Paladin": ["Sacrifice","Smite","Might","Prayer","Resist Fire","Holy Bolt","Holy Fire","Thorns","Defiance","Resist Cold","Zeal","Charge","Blessed Aim","Cleansing","Resist Lightning","Vengeance","Blessed Hammer","Concentration","Holy Freeze","Vigor","Conversion","Holy Shield","Holy Shock","Sanctuary","Meditation","Fist of the Heavens","Fanaticism","Conviction","Redemption","Salvation"],
  "Sorceress": ["Fire Bolt","Warmth","Charged Bolt","Ice Bolt","Frozen Armor","Inferno","Static Field","Telekinesis","Frost Nova","Ice Blast","Blaze","Fire Ball","Nova","Lightning","Shiver Armor","Fire Wall","Enchant","Chain Lightning","Teleport","Glacial Spike","Meteor","Thunder Storm","Energy Shield","Blizzard","Chilling Armor","Fire Mastery","Hydra","Lightning Mastery","Frozen Orb","Cold Mastery"],
  "Warlock": ["Summon Goatman","Demonic Mastery","Death Mark","Summon Tainted","Summon Defiler","Blood Oath","Engorge","Blood Boil","Consume","Bind Demon","Levitate","Eldritch Blast","Hex Bane","Hex Siphon","Psychic Ward","Echoing Strike","Hex Purge","Blade Warp","Cleave","Mirrored Blades","Sigil Lethargy","Ring of Fire","Miasma Bolt","Sigil Rancor","Enhanced Entropy","Flame Wave","Miasma Chains","Sigil Death","Apocalypse","Abyss"],
};
const LEGACY_MERCS = [["Rogue",["Fire Arrow \u00b7 Exploding Arrow","Cold Arrow \u00b7 Freezing Arrow"]],["Desert Mercenary",["Prayer","Defiance","Blessed Aim","Thorns","Holy Freeze","Might"]],["Iron Wolf",["Fire Bolt \u00b7 Fire Ball \u00b7 Enchant","Glacial Spike \u00b7 Chilling Armor \u00b7 Ice Blast","Charged Bolt \u00b7 Lightning \u00b7 Static Field"]],["Barbarian",["Bash \u00b7 Stun \u00b7 Battle Cry","Frenzy \u00b7 Iron Skin \u00b7 Taunt"]]];
function unpackCore(code, ordered) {
  let b64 = (code || "").replace(/-/g, "+").replace(/_/g, "/");
  b64 = b64.padEnd(Math.ceil(b64.length / 4) * 4, "A");
  const raw = atob(b64);
  const bits = [...raw].flatMap(ch => ch.charCodeAt(0).toString(2).padStart(8, "0").split("").map(Number));
  let at = 0;
  const get = n => { let v = 0; for (let i = 0; i < n; i++) v = v * 2 + (bits[at++] || 0); return v; };
  const st = {c: CLASSES[get(3)], q: get(2), e: get(3), l: Math.max(1, Math.min(99, get(8))), p: {}, s: "", t: 0};
  const mine = LEGACY_SKILLS[st.c].map(id => classSkills(st).find(s => s.id === id) || {s: id});
  if (ordered) { st.o = []; for (let n; at < bits.length && (n = get(5));) st.o.push([mine[n - 1]?.s, get(7)]); }
  else for (const s of mine) { const n = get(5); if (n) st.p[s.s] = n; }
  return st;
}

const b64d = s => atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));

// v2+ add gear after a "~". v4 is [player's PLAYER_KEYS, merc's GEAR_SLOTS, charms as [slug, col, row], active swap];
// each slot null or [slug, ethereal?, socketSlugs]. v1/v2/v3 links still open (the share link carries gear).
const readSlots = (keys, arr, into) => keys.forEach((k, i) => { const g = arr?.[i]; if (g) into[k] = {s: g[0], eth: !!g[1], so: g[2] || [], b: g[3] || undefined, ...(g[4] != null ? {n: g[4]} : {}), ...(g[5] ? {a: g[5]} : {}), ...(g[6] ? {rn: g[6]} : {}), ...(g[7] ? {v: Object.fromEntries(g[7])} : {})}; });
// Named skills and mercenaries plus explicit gear fields keep new links independent of table order.
function packBuild(st, mine) {
  const k = st.k.map(k => { const m = W.inv.mercs[k.mt || 0], [mt, mv] = k.mc || [m.n, m.v[k.mv || 0].n];
    return {l: k.l, ...(k.kind ? {kind: k.kind} : {}), ...(k.ml ? {ml: k.ml} : {}), g: k.g || {}, m: k.m || {}, ch: k.ch || [], sw: k.sw || 0, mt, mv}; });
  const u = [...new Set(k.flatMap(k => [...Object.values(k.g), ...Object.values(k.m), ...k.ch.map(e => e[3] || {s: e[0]})])
    .flatMap(g => [g.s, ...(g.so || [])]).filter(s => s?.startsWith("moo-")).map(s => BY[s]?.n).filter(Boolean))].sort();
  return BuildFormat.encode({c: st.c, l: st.l, q: st.q, e: st.e, r: st.r || "", ...(st.n ? {n: st.n} : {}), o: st.o.map(([s, l]) => [mine.find(x => x.s === s)?.id || s, l]), a: st.a, k, ...(u.length ? {u} : {})});
}

function unpackBuild(code) {
  if (code?.[0] === "6") {
    const st = BuildFormat.decode(code), mine = classSkills(st);
    st.o = st.o.map(([id, l]) => [mine.find(s => s.id === id)?.s || id, l]);
    st.k = st.k.map(k => ({...k, mc: [k.mt, k.mv], mt: 0, mv: 0}));
    return {...st, p: {}, s: "", t: 0};
  }
  if (code?.[0] === "5") {
    const [coreCode, tail] = code.slice(1).split("~"), st = unpackCore(coreCode, true);
    st.k = [{l: 1}]; st.a = [];
    try { if (tail) { const [sets, a] = JSON.parse(b64d(tail)); st.a = a || [];
      st.k = sets.map(([l, g, m, ch, sw, [mt, mv] = []]) => { const k = {l, g: {}, m: {}, ch: ch || [], sw: sw || 0, mt: mt || 0, mv: mv || 0, mc: [LEGACY_MERCS[mt || 0][0], LEGACY_MERCS[mt || 0][1][mv || 0]]};
        readSlots(PLAYER_KEYS, g, k.g); readSlots(GEAR_SLOTS, m, k.m); return k; }); } } catch { throw new Error("The equipment in this build link is damaged. The link has been kept."); }
    return st;
  }
  if (!code || !"1234".includes(code[0])) return null;
  const [coreCode, gb64] = code.slice(1).split("~");
  const st = unpackCore(coreCode);
  st.g = {}; st.m = {}; st.ch = []; st.sw = 0;
  if (gb64) {
    try {
      const arr = JSON.parse(b64d(gb64));
      if (code[0] === "4") { readSlots(PLAYER_KEYS, arr[0], st.g); readSlots(GEAR_SLOTS, arr[1], st.m); st.ch = arr[2] || []; st.sw = arr[3] || 0; [st.mt, st.mv] = arr[4] || [0, 0]; st.pt = Object.fromEntries(ATTRS.map(([k], i) => [k, arr[5]?.[i] || 0])); }
      else { readSlots(GEAR_SLOTS, arr, st.g); readSlots(["helm", "armor", "weapon", "offhand"], arr.slice(10), st.m); }
    } catch { throw new Error("The equipment in this build link is damaged. The link has been kept."); }
  }
  const merc = LEGACY_MERCS[st.mt || 0]; st.mc = [merc[0], merc[1][st.mv || 0]];
  return st;
}

// The stat sheet's totals, read from each line's property tuple [property, min, max, param] (index.ts item_lines): the
// property's stats (W.properties) are itemstatcost names, and each adds its roll, the midpoint of a range, under the
// planner's own key. A stat that extends another by itemstatcost's op (W.statOps: per character level, time of day) adds into
// that one, at clvl for the per-level ones. Skill-shape stats (lh_, passive_, sundered immunities) sum under their own name.
// A line the sheet doesn't total and the tooltip doesn't cover goes to unread; the display text is only what it shows.
const SHEET = {strength: "str", dexterity: "dex", vitality: "vit", energy: "enr", maxhp: "life", maxmana: "mana", armorclass: "def",
  fireresist: "fireres", coldresist: "coldres", lightresist: "ltngres", poisonresist: "poisres",
  item_fasterattackrate: "ias", item_fastercastrate: "fcr", item_fastergethitrate: "fhr", item_fasterblockrate: "fbr", item_fastermovevelocity: "frw",
  item_magicbonus: "mf", item_goldbonus: "gf", tohit: "ar", lifedrainmindam: "ll", manadrainmindam: "ml",
  item_crushingblow: "cb", item_deadlystrike: "ds", item_openwounds: "ow", damageresist: "dr", toblock: "block", item_allskills: "allsk"};
const MAX_RES = {maxfireresist: "fireres", maxcoldresist: "coldres", maxlightresist: "ltngres", maxpoisonresist: "poisres"};
// Stats the tooltip shows and the sheet has no row for: read, not "unread". A property with no stat is named by its code.
const TOOLTIP_ONLY = new Set(("coldlength coldmaxdam coldmindam dmg% dmg-max dmg-min firemaxdam firemindam hpregen indestruct item_addexperience " +
  "item_armor_percent item_armorpercent_bytime item_armorpercent_perlevel item_attackertakesdamage item_attackertakeslightdamage item_cannotbefrozen item_damagetomana item_demon_tohit " +
  "item_demondamage_percent item_fractionaltargetac item_freeze item_halffreezeduration item_healafterkill item_howl item_ignoretargetac " +
  "item_knockback item_lightradius item_manaafterkill item_maxhp_percent item_maxmana_percent item_numsockets item_pierce item_poisonlengthresist " +
  "item_preventheal item_replenish_durability item_replenish_quantity item_req_percent item_slow item_staminadrainpct item_stupidity item_tohit_percent " +
  "item_undead_tohit item_undeaddamage_percent lightmaxdam lightmindam magic_damage_reduction magicmaxdam magicmindam manarecoverybonus maxdamage " +
  "maxstamina mindamage normal_damage_reduction poisonlength poisonmaxdam poisonmindam staminarecoverybonus armorclass_vs_missile").split(" "));
const ELEM_OF = {1: "fire"};  // item_elemskill's val1 (properties.txt fireskill); the tables number no other element
function statsOf(lines, clvl = 99, props = []) {
  const s = {str: 0, dex: 0, vit: 0, enr: 0, life: 0, mana: 0, def: 0, fireres: 0, coldres: 0, ltngres: 0, poisres: 0,
             ias: 0, fcr: 0, fhr: 0, fbr: 0, frw: 0, mf: 0, gf: 0, ar: 0, ll: 0, ml: 0, cb: 0, ds: 0, ow: 0, dr: 0, block: 0,
             allsk: 0, clsk: {}, tree: {}, single: {}, elem: {}, maxres: {}, stat: {}, unread: []};  // stat: what skill formulas read as stat('x'), by itemstatcost name
  const add = (o, k, n) => { o[k] = (o[k] || 0) + n; };
  const classes = Object.keys(W.charstats || {}), skillBy = par => (W.skills || []).find(x => x.sid === par || x.id.toLowerCase() === String(par).toLowerCase());
  (lines || []).forEach((line, i) => {
    const [code, lo, hi, par] = props[i] || [], key = code?.toLowerCase();
    const stats = W.propertyGroups?.includes(key) ? [] : W.properties?.[key]?.length ? W.properties[key] : key ? [key] : [];
    const read = stats.map(stat => {
      const [into, shift] = W.statOps?.[stat] || [stat, null];
      const n = shift != null ? Math.floor((+par || Math.round((+lo + +hi) / 2)) * clvl / 2 ** shift) : Math.round((+lo + +hi) / 2);
      const val = W.skillFunc?.[key];
      if (SHEET[into]) add(s, SHEET[into], n);
      else if (MAX_RES[into]) add(s.maxres, MAX_RES[into], n);
      else if (into.startsWith("passive_") || into.startsWith("item_pierce_") || into.startsWith("lh_") && !(W.displayStats || []).includes(into)) add(s.stat, into, n);
      else if (into === "item_addclassskills" && val != null && classes[val]) add(s.clsk, classes[val], n);
      else if (into === "item_elemskill" && ELEM_OF[val]) add(s.elem, ELEM_OF[val], n);
      else if (into === "item_addskill_tab" && val != null && classes[Math.floor(par / 3)]) add(s.tree, `${classes[Math.floor(par / 3)]}\u0000${(W.skills || []).find(x => x.cls === classes[Math.floor(par / 3)] && x.page === par % 3 + 1)?.tree}`, n);
      else if ((into === "item_singleskill" || into === "item_nonclassskill") && val != null && skillBy(par)) add(s.single, skillBy(par).n, n);
      else return TOOLTIP_ONLY.has(into);
      return true;
    });
    if (!read.some(Boolean)) s.unread.push(String(line).trim());
  });
  return s;
}

function slotMatches(item, slot, cls) {
  slot = slot.replace(/(weapon|offhand)2$/, "$1");
  if (cls && item.cls && item.cls !== "any" && item.cls !== cls) return false;
  if (cls && item.base?.cls && item.base.cls !== "any" && item.base.cls !== cls) return false;
  if (item.q === "rw") return true;  // by its bases (rwBases)
  return (SLOT_TITLES[slot] || new Set()).has(item.t) || slot === "offhand" && SLOT_TITLES.offhand.has(item.base?.type);
}
// rl 0 is build.py's quest-item tell (Staff of Kings, Khalim's Will, …: no required level because you can't wear them).
// What the picker offers: uniques, sets and runewords this wearer can use in this slot, and the plain bases (BASES).
const eligibleItems = (slot, st) => slot === "charm" ? (W.items || []).filter(i => i.ch && (i.rl || 0) > 0 && !st.ch.some(c => c[0] === i.s))
  : [...(W.items || []).filter(i => (i.q === "unique" || i.q === "set" || i.q === "rw") && (i.rl || 0) > 0), ...BASES].filter(i => itemFits(st, st.who, slot, i));
// "Plan with it" from an item or runeword page or a database tile (builds.html#wear=<slug>): put it in the first free
// slot it fits, or the first it fits; a charm in the bag; a runeword opens its base step there. An item for another class switches an empty build to that class.
function wear(st, it) {
  if (!it || !["unique", "set", "rw"].includes(it.q)) return;
  const lock = it.base?.cls || (it.cls !== "any" && it.cls), empty = !st.o.length && !st.a.length && !st.k.some(k => Object.keys(k.g || {}).length || Object.keys(k.m || {}).length || k.ch?.length);
  if (lock && lock !== st.c && empty) st.c = lock;
  if (it.ch) {  // a charm goes in the bag, once, where it has room
    const spot = !st.ch.some(c => c[0] === it.s) && charmSpot(st, it.ch);
    if (spot) { st.ch.push([it.s, ...spot]); st.who = "c"; st.pick = "charm"; st.at = st.ch.length - 1; st.tab = "gear"; }
    return;
  }
  // the active weapon set's hands, the main hand first (a Barbarian's or an Assassin's off-hand takes a weapon too)
  const order = ["weapon", "offhand", ...GEAR_SLOTS.filter(k => k !== "weapon" && k !== "offhand")].map(k => arm(k, st.sw));
  const keys = order.filter(k => itemFits(st, "p", k, it)), slot = keys.find(k => !st.g[k]) || keys[0];
  if (!slot) return;
  st.who = "p"; st.pick = slot; st.tab = "gear";
  if (it.q === "rw") { st.pickTab = "rw"; st.rw = it.s; st.open = true; }
  else { st.g[slot] = {s: it.s, eth: false, so: []}; addRecent(it.s, slot, "p"); }
}
// What the build wears, for the cube planner's gear ingredients: each worn item's kinds ("Any Armor", "Ring" …, as the
// recipes name them) and its quality (a plain base is normal), and the charms in the bag by their size.
const ARMOR_KINDS = {helm: ["Helm"], armor: ["Armor"], gloves: ["Gloves"], boots: ["Boots"], belt: ["Belt"], offhand: ["Any Shield"]};
function gearKinds(st) {
  const q = it => ({base: "normal", rw: "runeword"})[it.q] || it.q;
  return [...worn(st).map(k => [k, itemOf(st.g[k])]).filter(([, it]) => it).map(([k, it]) => {
    const slot = k.replace(/2$/, ""), weapon = slot === "weapon" || it.base?.sl === "weapon";
    return {n: it.n, q: q(it), kinds: weapon ? ["Weapon", it.base?.type || W.bases[st.g[k].b]?.ty].filter(Boolean) : /^ring/.test(slot) ? ["Ring"] : slot === "amulet" ? ["Amulet"] : ["Any Armor", ...(ARMOR_KINDS[slot] || [])]};
  }), ...st.ch.map(charmOf).filter(Boolean).map(it => ({n: it.n, q: it.q, kinds: ["Charm", it.b]}))];  // b: Small Charm …
}
// The affix pools (data/affixes.json from tools/wiki/affixes.py), loaded once: id -> affix, and each item type's Equiv
// chain by name. A plain base with affixes (g.a) is a magic item, one prefix and one suffix at most, or a rare, up to three
// of each; it lives in BY under its base and affixes, so the slot, the tooltip and the stat sheet read it like any item.
let AFX = null;
const loadAffixes = redraw => AFX || fetch(ROOT + "data/affixes.json").then(r => r.json()).then(d => { AFX = {...d, by: Object.fromEntries(d.affixes.map(a => [a.id, a]))}; redraw(); });
// plain: the item before its rolls (g.v), for the roll sliders
function itemOf(g, plain) {
  let it = g && BY[g.s];
  if (it && g.a?.length && AFX) {
    const key = `${g.s}~${g.a.join(".")}~${g.rn || 0}`, af = g.a.map(id => AFX.by[id]).filter(Boolean);
    const p = af.filter(a => a.k === "p"), x = af.filter(a => a.k === "s"), rare = p.length > 1 || x.length > 1;
    it = BY[key] ||= {...it, s: key, q: rare ? "rare" : "magic", b: it.n, n: rare ? rareName(it, g) : [p[0]?.n, it.n, x[0]?.n].filter(Boolean).join(" "),
      l: af.flatMap(a => a.l), lp: af.flatMap(a => a.lp), rl: Math.max(it.rl || 0, ...af.map(a => a.rl || 0))};
  }
  if (!it || plain || !g.v || !Object.keys(g.v).length) return it;
  const key = `${it.s}~v${Object.entries(g.v).map(e => e.join(":")).join(",")}`;
  return BY[key] ||= {...it, s: key, lp: (it.lp || []).map((t, i) => g.v[i] != null && rollOf(t) ? [t[0], g.v[i], g.v[i], ...t.slice(3)] : t), l: (it.l || []).map((l, i) => g.v[i] != null && rollOf(it.lp?.[i]) ? rollTo(l, g.v[i]) : l)};
}
// Property functions distinguish scalar rolls from damage bounds, proc levels, charges and per-level values.
// The numeric range is replaced for display only; the bounds come from the tuple.
const ROLL = /(\d+)-(\d+)/;
const rollOf = p => p && W.rollProps.includes(p[0].toLowerCase()) && +p[1] >= 0 && +p[2] > +p[1] && [+p[1], +p[2]];
const rollTo = (l, v) => l.replace(ROLL, v).replace(/-\((\d+|#)\)/, "-$1");  // -(20-35)% rolled reads -27%
// A rare's name as the game rolls it: a rareprefix word and a raresuffix word that fit the base ("Doom Halo"). It's
// drawn from the base, so it holds while affixes change; rn steps to another ("New name").
function rareName(it, g) {
  const up = new Set(AFX.types[it.base.tc] || []), fit = ([, a, e]) => a.some(c => up.has(c)) && !e.some(c => up.has(c));
  const p = AFX.names.p.filter(fit), x = AFX.names.s.filter(fit), h = [...g.s].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) + (g.rn || 0) * 7919;
  return p.length && x.length ? `${p[h % p.length][0]} ${x[Math.floor(h / p.length) % x.length][0]}` : `Rare ${it.n}`;
}
// The prefixes and suffixes a base can roll (an itype up its Equiv chain and no etype), that spawn, for the wearer's class.
const pool = (base, st) => { const up = new Set(AFX.types[base.base.tc] || []);
  return AFX.affixes.filter(a => a.k !== "a" && a.sp && a.fr && a.it.some(c => up.has(c)) && !a.et.some(c => up.has(c)) && (!a.cls || st.who !== "m" && a.cls === st.c)); };
// A side's places: three on gear, one on a charm, as charms are only ever magic.
const most = st => st.pick === "charm" ? 1 : 3;
// Why an affix can't join the ones chosen: its group is taken, its side is full, or it's magic-only on what would be a rare.
function affixBar(a, list, n = 3) {
  const next = [...list, a], p = next.filter(x => x.k === "p").length, x = next.filter(x => x.k === "s").length;
  return list.some(y => y.g === a.g) ? "Same group as one you have" : p > n || x > n ? n === 1 ? `A charm takes one ${a.k === "p" ? "prefix" : "suffix"}` : `Three ${a.k === "p" ? "prefixes" : "suffixes"} at most`
    : (p > 1 || x > 1) && next.some(y => !y.r) ? "Magic only: a rare can't have it with these" : "";
}
// A plain (white) base as an item, so the picker, the slots and the tooltip treat it like any other; its sockets are g.n.
let BASES = [];
const baseItems = () => Object.entries(W.bases).map(([c, b]) => BY["b-" + c] = {s: "b-" + c, n: b.n, q: "base", t: "", b: "", a: b.a, rl: b.rl, l: b.l || [], lp: b.lp || [], df: b.df, dm: b.dm, cls: "any",
  base: {type: b.ty, tc: b.tc, str: b.str, dex: b.dex, sock: b.so, cls: b.cls || "", tier: b.tier, h2: b.h2, h12: b.h12, sl: b.sl, ga: b.ga, ws: b.ws, wc: b.wc, wc2: b.wc2, code: c}});
// The three charm sizes as plain bases (their item type codes name the affix pools), a made charm's start. A made charm in the
// bag is [slug, col, row, {s, a, v}]: the last its affixes and rolls, as a slot's gear holds them.
let CHARMS = [];
const charmItems = () => [["cm1", "Small Charm", "Small Charm", "scha", 1], ["cm2", "Large Charm", "Medium Charm", "mcha", 2], ["cm3", "Grand Charm", "Large Charm", "lcha", 3]]
  .map(([c, n, type, tc, h]) => BY["c-" + c] = {s: "c-" + c, n, q: "base", t: "", b: n, a: W.baseArt[n], rl: 1, l: [], ch: h, cls: "any", base: {type, tc, tier: `${h} cell${h > 1 ? "s" : ""} tall`, code: c}});
const charmOf = e => itemOf(e[3] || {s: e[0]});
// Whether a wearer can hold an item in a slot. A hand slot, or a plain base, goes by its base (fits); the rest by the
// slot's item group, and for the merc by his can list. A runeword needs one base that fits. The player is only offered
// items for his class (it.cls, from class-only stats: Torch of Iro is a Necromancer's wand though any class may hold it).
function itemFits(st, who, slot, it) {
  if (it.q === "rw") return rwBases(it, slot, st, who).length > 0;
  const b = it.base || {};
  if (b.sl && (/^(weapon|offhand)/.test(slot) || it.q === "base")) return fits(st, who, slot, {...b, ty: b.type}) && (who === "m" || !it.cls || it.cls === "any" || it.cls === st.c);
  return slotMatches(it, slot, who === "m" ? null : st.c) && (who !== "m" || mercType(st).can.includes(b.type));
}
// A base in a slot: its own slot, its class lock for the player, the merc's hands (one-handed only for an h1 merc). The
// player's off-hand also takes a second weapon: a one-handed one for a Barbarian (a two-handed sword too, h12), claws
// for an Assassin.
function fits(st, who, slot, b) {
  slot = slot.replace(/^ring[12]$/, "ring").replace(/2$/, "");
  if (who === "m") {
    const m = mercType(st);
    if (slot === "weapon") return b.sl === "weapon" && m.wield.includes(b.ty) && !(m.h1 && b.h2);
    if (slot === "offhand") return m.offh.includes(b.ty) && !b.h2;
    return b.sl === slot && m.can.includes(b.ty);
  }
  if (b.cls && b.cls !== st.c) return false;
  if (slot === "offhand" && b.sl === "weapon") return st.c === "Barbarian" ? !b.h2 || !!b.h12 : st.c === "Assassin" && /^Hand to Hand/.test(b.ty);
  return b.sl === slot;
}
// The base in a hand (a runeword's chosen one, else the item's own), and whether the off-hand is shut by a two-handed
// weapon in the same set: a Barbarian swings a two-handed sword (h12) in one hand.
const handBase = g => { const it = g && BY[g.s]; return !it ? null : it.q === "rw" ? W.bases[g.b] : it.base; };
const blocked = (st, who, slot) => { if (!/^offhand/.test(slot)) return false;
  const b = handBase((who === "m" ? st.m : st.g)[slot.replace("offhand", "weapon")]); return !!b?.h2 && !(who === "p" && st.c === "Barbarian" && b.h12); };
const worn = st => GEAR_SLOTS.map(k => arm(k, st.sw)).filter(k => !blocked(st, "p", k));  // the active weapon pair, never the other; not an off-hand a two-hander shuts
const wornFacets = (st, excludeSlot) => {
  const set = new Set();
  for (const k of worn(st)) { if (k === excludeSlot) continue; const it = itemOf(st.g[k]); if (it) (it.f || []).forEach(f => set.add(f)); }
  return set;
};
function rankItems(items, slot, st) {  // "Suggested for this build" first: plain facet-overlap count, then by required level
  const worn = wornFacets(st, slot);
  const score = i => (i.f || []).reduce((n, f) => n + (worn.has(f) ? 1 : 0), 0);
  const suggested = items.filter(i => score(i) > 0).sort((a, b) => score(b) - score(a) || (a.rl || 0) - (b.rl || 0));
  const rest = items.filter(i => score(i) === 0).sort((a, b) => (a.rl || 0) - (b.rl || 0));
  return {suggested, rest};
}

// Every line gear contributes: equipped items' own lines, active set partial bonuses (sb, by pieces worn),
// a worn runeword's rune bonuses (rb), and what fills the other items' sockets (socketsOf); properties returns their raw tuples.
function gearLines(st, properties = false) {
  const field = properties ? "lp" : "l";
  const pieces = {};  // a set's distinct pieces worn: one ring in both ring slots is one piece, as in the game
  for (const k of worn(st)) { const it = st.g[k] && BY[st.g[k].s]; if (it?.set) (pieces[it.set] ||= new Set()).add(it.s); }
  const setCounts = Object.fromEntries(Object.entries(pieces).map(([set, p]) => [set, p.size]));
  const lines = [];
  for (const e of st.ch) lines.push(...(charmOf(e)?.[field] || []));  // charms count in the bag, as in the game
  for (const k of worn(st)) {
    const g = st.g[k]; if (!g) continue;
    const it = itemOf(g); if (!it) continue;
    lines.push(...(it[field] || []));
    if (it.q === "set" && it.sb && setCounts[it.set]) for (const [n, ls] of Object.entries(properties ? it.sp || {} : it.sb)) if (+n <= setCounts[it.set]) lines.push(...ls);
    if (it.q === "rw" && it.rb) lines.push(...Object.values(properties ? it.rp : it.rb).flat());
    if (it.q !== "rw") lines.push(...socketsOf(it, g, k)[properties ? "props" : "lines"]);
  }
  // the set's own bonuses ("2 pieces" … "Full set"), on top of each piece's
  for (const [set, n] of Object.entries(setCounts)) for (const [at, l, p] of W.sets[set]?.bonus || [])
    if (at === "Full set" ? n >= W.sets[set].pieces.length : parseInt(at) <= n) lines.push(properties ? p : l);
  return lines;
}

// One panel in the mod's HD pixels, cropped to [y0, y1]: slots and boxes are % of its width and that height.
const box = (r, y0, h) => `left:${(r[0] / W.inv.w * 100).toFixed(2)}%;top:${((r[1] - y0) / h * 100).toFixed(2)}%;width:${(r[2] / W.inv.w * 100).toFixed(2)}%;height:${(r[3] / h * 100).toFixed(2)}%`;
// A worn item's sockets: how many, what fills them (a runeword's runes, else the gems and runes chosen for each),
// and the lines they add in this slot. The tooltip shows them and the slot draws them.
function socketsOf(it, g, slot) {
  if (it.q === "rw") return {n: it.runes.length, max: it.runes.length, so: [], fills: it.runes.map(r => W.runeArt[r]), lines: [], eth: g.eth};
  // a plain base has the sockets chosen for it (g.n); an item its own ("Socketed (n)", a range's top unless rolled),
  // more if a socket quest added them (g.n), up to the base's limit (max)
  const sockets = (it.lp || []).filter(p => W.properties[p[0].toLowerCase()]?.includes("item_numsockets"));
  const made = !!it.base?.code;  // a plain base, or the magic or rare item made from one: its sockets are chosen
  const own = made ? g.n ?? it.base.sock : Math.max(0, ...sockets.map(([, lo, hi, par]) => +hi || +lo || +par || 0));
  const max = Math.max(own, it.base?.sock || 0), so = (g.so || []).slice(0, max);
  const n = made ? own : Math.max(own, g.n || 0, so.reduce((k, s, i) => s ? i + 1 : k, 0));
  return {n, max, so: so.slice(0, n), fills: Array.from({length: n}, (_, k) => BY[so[k]]?.a), lines: so.slice(0, n).flatMap(s => sockLines(BY[s], glKey(it))), props: so.slice(0, n).flatMap(s => BY[s]?.gp?.[glKey(it)] || BY[s]?.lp || []), eth: g.eth};
}
// A plain base whose sockets all hold runes that spell a runeword this base and wearer allow: the game makes it.
function spells(st, slot, g) {
  const it = g && BY[g.s];
  if (it?.q !== "base" || g.a?.length) return null;  // magic and rare items take no runeword
  const s = socketsOf(it, g, slot), names = s.so.map(x => BY[x]?.fam === "Runes" ? BY[x].n.replace(/ Rune$/, "") : "");
  return s.n && names.length === s.n && names.every(Boolean)
    && W.items.find(r => r.q === "rw" && r.runes.join() === names.join() && rwBases(r, slot, st).includes(it.base.code)) || null;
}
const tipBase = (it, g) => it.q === "rw" && g?.b ? ` data-base="${g.b}"` : "";
const tipWho = who => ` data-who="${who}"`;
const tipSocks = (it, g, slot) => { const s = socketsOf(it, g, slot); return s.n || s.eth ? ` data-socks="${esc(JSON.stringify({n: s.n, lines: s.lines, eth: s.eth ? 1 : 0}))}"` : ""; };
// Where the game puts n sockets in a tall box (weapons, armor, shields) or a square one (helms), as % of the box.
const SOCKET_AT = {tall: [[], [[50, 50]], [[50, 32], [50, 68]], [[50, 22], [50, 50], [50, 78]], [[30, 32], [70, 32], [30, 68], [70, 68]],
  [[30, 22], [70, 22], [50, 50], [30, 78], [70, 78]], [[30, 22], [70, 22], [30, 50], [70, 50], [30, 78], [70, 78]]],
  square: [[], [[50, 50]], [[50, 30], [50, 70]], [[30, 30], [70, 30], [50, 70]], [[30, 30], [70, 30], [30, 70], [70, 70]]]};
function socketDots(it, g, slot, r) {
  const s = socketsOf(it, g, slot), at = (r[3] / r[2] > 1.3 ? SOCKET_AT.tall : SOCKET_AT.square)[s.n];
  return at ? `<span class="socks">${at.map(([x, y], k) => `<i${it.q === "rw" ? "" : ` data-sk="${k}"`} style="left:${x}%;top:${y}%">${s.fills[k] ? `<img src="${U.art(s.fills[k])}" alt="">` : ""}</i>`).join("")}</span>` : "";
}
// off: a hand this merc doesn't use; shut: an off-hand a two-handed weapon fills (red, and what's in it doesn't count).
function invSlot(r, y0, h, slot, g, sel, who, off, shut) {
  const it = itemOf(g), label = (who === "m" ? "Mercenary's " : "") + SLOT_LABEL[slot];
  return `<button class="islot${it ? " have" : ""}${sel ? " sel" : ""}${off ? " off" : ""}${shut ? " shut" : ""}" data-slot="${slot}" data-who="${who}" style="${box(r, y0, h)}" aria-label="${esc(label)}${it ? ": " + esc(it.n) : ""}"
    ${off ? ` title="This mercenary holds nothing in his off-hand" disabled` : shut ? ` title="A two-handed weapon fills both hands"` : it ? "" : ` title="${esc(label)}"`}${it ? ` data-tip="${it.s}"${tipSocks(it, g, slot)}${tipBase(it, g)}` : ""}>${it ? gearArt(it, g) + socketDots(it, g, slot, r) + (g.eth ? '<i class="eth">eth</i>' : "") : ""}</button>`;
}
// A worn item's picture: a runeword shows the base it's made in (g.b), as the game does; anything else its own art.
const gearArt = (it, g) => it.q === "rw" && W.bases[g?.b]?.a ? `<div class="art"><img src="${U.art(W.bases[g.b].a)}" alt=""></div>` : artBox(it);
// The bases a runeword can be made in for this slot and wearer: its own list (it.bs, plain bases with the sockets
// for its runes), the slot's kind of base, then the player's class locks or the merc's limits.
const rwBases = (it, slot, st, who = st.who) => (it.bs || []).filter(c => W.bases[c] && fits(st, who, slot, W.bases[c]));
const Y0 = 150;  // the panels start just above the swap tabs and the helm
function playerPanel(st, compact = false) {
  const inv = W.inv, [gx, gy, cols, rows, cell] = inv.grid, h = (compact ? Math.max(...Object.values(inv.slots).map(r => r[1] + r[3])) : gy + rows * cell) + 22 - Y0, sel = k => st.who === "p" && st.pick === k;
  const tabs = inv.swap.map(r => `<div class="swap" style="${box(r, Y0, h)}">${[0, 1].map(n => `<button class="${st.sw === n ? "on" : ""}" data-swap="${n}">${n ? "II" : "I"}</button>`).join("")}</div>`).join("");
  const at = (c, r, n) => box([gx + c * cell, gy + r * cell, cell, n * cell], Y0, h);
  const cells = Array.from({length: cols * rows}, (_, i) => `<button class="cell" data-cell="${i % cols},${Math.floor(i / cols)}" style="${at(i % cols, Math.floor(i / cols), 1)}" aria-label="Bag cell"></button>`).join("");
  const charms = st.ch.map((e, i) => { const it = charmOf(e), [, c, r] = e; return it ? `<button class="islot have charm${st.who === "c" && st.at === i ? " sel" : ""}" data-charm="${i}" data-tip="${it.s}" style="${at(c, r, it.ch || 1)}" aria-label="${esc(it.n)}">${artBox(it)}</button>` : ""; }).join("");
  const slots = Object.entries(inv.slots).map(([loc, r]) => { const k = arm(LOC[loc], st.sw); return invSlot(r, Y0, h, k, st.g[k], sel(k), "p", false, blocked(st, "p", k)); }).join("");
  return `<div class="inv" style="aspect-ratio:${inv.w}/${h}">${tabs}${slots}${compact ? "" : cells + charms}</div>`;
}
// The merc as hired: his type, with his variant's own hands over it (x: the Frenzy Barbarian's two swords).
const mercType = st => { const m = W.inv.mercs[st.mt || 0]; return m && {...m, ...(m.v[st.mv || 0]?.x || {})}; };
const mercLevel = st => Math.min(st.l, st.ml || st.l);
const mercSkill = (st, n) => {
  const rows = mercType(st)?.v[st.mv || 0]?.lv?.[n], l = mercLevel(st);
  const row = rows && [...rows].reverse().find(r => r[0] <= l);
  return row ? Math.max(0, row[1] + Math.floor((l - row[0]) * row[2] / 32)) : 0;
};
function mercPanel(st) {
  const inv = W.inv, h = Math.max(...Object.values(inv.merc).map(r => r[1] + r[3])) + 22 - Y0, hand = mercType(st)?.offh.length;  // the Iron Wolf's shield, the Frenzy Barbarian's second sword
  const slots = Object.entries(inv.merc).map(([loc, r]) => { const k = LOC[loc]; return invSlot(r, Y0, h, k, st.m[k], st.who === "m" && st.pick === k, "m", k === "offhand" && !hand, blocked(st, "m", k)); }).join("");
  return `<div class="inv merc" style="aspect-ratio:${inv.w}/${h}">${slots}</div>`;
}
// Beside the merc's panel: its four types, then the chosen type's variants with their skills (hireling.txt, Hell).
function mercSide(st) {
  const m = mercType(st), skill = n => { const s = W.skills.find(x => x.n === n); return s ? `<a href="${U.skill(s.s)}">${esc(n)}</a>` : esc(n); };
  return `<h3>Mercenary <a class="more" href="${U.guide("mercenaries")}">All of them →</a></h3><div class="mtypes">${W.inv.mercs.map((x, i) => `<button class="mtype${i === (st.mt || 0) ? " on" : ""}" data-mt="${i}" title="${esc(x.n)}, Act ${["", "I", "II", "III", "IV", "V"][x.act]}">${x.img ? `<img src="${U.art(x.img)}" alt="">` : ""}<span>${esc(x.n)}</span></button>`).join("")}</div>
    <div class="mvars">${m.v.map((v, i) => `<button class="mvar${i === (st.mv || 0) ? " on" : ""}" data-mv="${i}"><b>${esc(v.n)}</b><small>${v.sk.map(esc).join(", ")} · ${esc(v.d.join(", "))}</small></button>`).join("")}</div>
    <label>Mercenary level <input id="merc-level" type="number" min="1" max="${st.l}" value="${mercLevel(st)}"></label>
    <p class="mut">Skills: ${m.v[st.mv || 0]?.sk.map(n => `${skill(n)} (${mercSkill(st, n)})`).join(", ")}</p>`;
}
// The first spot where a charm h cells tall fits, from (c, r) on, column by column as the game fills a bag.
function charmSpot(st, h, from) {
  const [, , cols, rows] = W.inv.grid, used = new Set();
  for (const [s, c, r] of st.ch) for (let k = 0; k < (BY[s]?.ch || 1); k++) used.add(`${c},${r + k}`);
  const fits = (c, r) => r + h <= rows && [...Array(h).keys()].every(k => !used.has(`${c},${r + k}`));
  if (from && fits(...from)) return from;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) if (fits(c, r)) return [c, r];
  return null;
}
const wearing = st => (st.who === "m" ? st.m : st.who === "c" ? {charm: st.ch[st.at]?.[3]} : st.g);  // a made charm's affixes, as a slot's
function gearControls(st, slot, it) {
  const g = wearing(st)[slot], s = socketsOf(it, g, slot), rw = spells(st, slot, g);
  // a plain base's socket count, then a square per socket (art, or + to fill it), and one more while a quest could add a socket
  const count = it.base?.code && s.max ? `<div class="nsock"><small>Sockets</small>${Array.from({length: s.max + 1}, (_, n) => `<button class="pill${n === s.n ? " on" : ""}" data-nsock="${n}">${n}</button>`).join("")}</div>` : "";
  const squares = it.q !== "rw" && s.max ? `<div class="sqs">${s.fills.map((a, k) => `<button class="sq" data-sk="${k}" title="Socket ${k + 1}: ${esc(BY[s.so[k]]?.n || "empty")}"${s.so[k] ? ` data-tip="${s.so[k]}"` : ""}>${a ? `<img src="${U.art(a)}" alt="">` : "+"}</button>`).join("")}${!it.base?.code && s.n < s.max ? `<button class="sq add" data-addsock="1" title="Add a socket, as Larzuk's quest does">+1</button>` : ""}</div>` : "";
  return `<div class="worn"><div class="bsk" data-tip="${it.s}"${tipWho(st.who)}${tipSocks(it, g, slot)}${tipBase(it, g)}>${gearArt(it, g)}<div><b class="q-${it.q}">${esc(it.n)}</b><br><small>${esc(it.q === "rw" ? W.bases[g.b]?.n || it.it : it.base?.n || "")}</small></div></div>
    <div class="gctl">
    ${it.q === "rw" ? `<button class="pill" data-rebase="${it.s}">Change base</button>` : it.base?.code ? `<button class="pill" data-affixes="1">${g.a?.length ? "Edit affixes" : "Add affixes"}</button>` : ""}
    <label><input type="checkbox" data-eth="${slot}"${g.eth ? " checked" : ""}> Ethereal</label>
    <button class="pill" data-clear="${slot}">Remove</button>
    ${it.q === "rw" ? `<div class="gsock"><small>Runes: ${it.runes.join(" ")}</small></div>` : count + squares}
    ${rolls(g)}
    ${rw ? `<div class="rwmake"><div><b>${esc(s.so.map(x => BY[x].n.replace(/ Rune$/, "")).join(" "))} is ${esc(rw.n)}.</b> ${esc(it.n)} can take it.</div><button class="pill on" data-makerw="${rw.s}">Make ${esc(rw.n)}</button></div>` : ""}
  </div></div>`;
}
// A slider for each line the item rolls, from its low to its high end; Perfect sets them all to the high end.
function rolls(g) {
  const it = itemOf(g, true), ls = (it?.l || []).map((l, i) => [l, i, rollOf(it.lp?.[i])]).filter(x => x[2]);
  return ls.length ? `<div class="rolls"><div class="rh"><small>Rolls</small><button class="pill" data-perfect="1">Perfect</button></div>${ls.map(([l, i, m]) => {
    const v = g.v?.[i] ?? Math.round((m[0] + m[1]) / 2);
    return `<label><span>${esc(rollTo(l, "#"))}</span><input type="range" min="${m[0]}" max="${m[1]}" value="${v}" data-roll="${i}"><b>${v}</b></label>`;
  }).join("")}</div>` : "";
}
// The socket picker: runes, gems and jewels with their art, filling one socket at a time (st.sock), in order.
const SOCK_TABS = ["Runes", "Gems", "Jewels"];
const socketables = tab => (W.items || []).filter(i => i.fam === tab && (tab !== "Gems" || i.gl));
function sockGrid(st) {
  const g = wearing(st)[st.pick], it = BY[g.s], key = glKey(it), q = (st.search || "").trim().toLowerCase();
  const all = socketables(st.sockTab || "Runes").filter(x => !q || (x.n + " " + sockLines(x, key).join(" ")).toLowerCase().includes(q));
  return `<div class="sogrid">${all.map(x => `<button class="so${g.so?.[st.sock] === x.s ? " on" : ""}" data-fill="${x.s}" data-tip="${x.s}"><img src="${U.art(x.a)}" alt=""><b>${esc(x.n.replace(/ Rune$/, ""))}</b><small>${esc(sockLines(x, key)[0] || "")}</small>${x.o === "loth" ? '<i class="tag ours">LotH</i>' : ""}</button>`).join("") || `<p class="empty">Nothing matches.</p>`}</div>`;
}
function sockBody(st) {
  const g = wearing(st)[st.pick], it = itemOf(g), s = socketsOf(it, g, st.pick), tab = st.sockTab || "Runes";
  return `<header><h2>${esc(it.n)}: socket ${st.sock + 1} of ${s.n}</h2><button class="rx" data-close="1" aria-label="Close">✕</button></header>
    <div class="sqs">${s.fills.map((a, k) => `<button class="sq${k === st.sock ? " on" : ""}" data-sk="${k}">${a ? `<img src="${U.art(a)}" alt="">` : "+"}</button>`).join("")}<button class="pill" data-fill="">Empty this socket</button></div>
    <div class="classtabs" role="tablist">${SOCK_TABS.map(k => `<button class="ctab${k === tab ? " on" : ""}" data-socktab="${k}">${k}</button>`).join("")}</div>
    <input type="search" data-search placeholder="Search ${tab.toLowerCase()}: a name or what it adds" value="${esc(st.search || "")}"><div class="plist">${sockGrid(st)}</div>`;
}

function pickerTabs(on, tabs = [["unique", "Unique"], ["set", "Set"], ["rw", "Runeword"], ["base", "Base"], ["rare", "Rare"]]) {
  return `<div class="classtabs" role="tablist">${tabs.map(([k, label]) => `<button class="ctab${k === on ? " on" : ""}" data-picktab="${k}">${esc(label)}</button>`).join("")}</div>`;
}
function pickerList(st) {
  const slot = st.pick, tab = pickTab(st);
  const all = tab === "magic" ? CHARMS : eligibleItems(slot, st).filter(i => slot === "charm" || i.q === (tab === "rare" ? "base" : tab));  // a rare starts as a plain base
  const q = (st.search || "").trim().toLowerCase();
  const eggs = tab === "rare" || tab === "magic" ? [] : unseal(q).filter(i => slot === "charm" ? i.ch && !st.ch.some(c => c[0] === i.s) : itemFits(st, st.who, slot, i));
  const filtered = [...eggs, ...(q ? all.filter(i => i.n.toLowerCase().includes(q)) : all)];
  const {suggested, rest} = rankItems(filtered, slot, st);
  const row = i => `<div class="bsk" data-pickitem="${i.s}" data-tip="${i.s}"${tipWho(st.who)}>${artBox(i)}<div><b class="q-${i.q}">${esc(i.n)}</b><br><small>${i.q === "base" ? esc([i.base.tier, i.dm && "Damage " + i.dm, i.df && "Defense " + i.df, i.base.sock && `up to ${i.base.sock} sockets`].filter(Boolean).join(" · ")) : `req level ${i.rl || 0}`}</small></div></div>`;
  return `${suggested.length ? `<h3>Suggested for this build</h3><div class="bsum">${suggested.map(row).join("")}</div>` : ""}
    <h3>${suggested.length ? "The rest" : "Eligible items"}</h3>
    <div class="bsum">${rest.length ? rest.map(row).join("") : filtered.length ? "" : `<p class="empty">Nothing fits ${esc(SLOT_LABEL[slot].toLowerCase())} for ${esc(st.c)} yet.</p>`}</div>`;
}
// The side panel beside the player's panel: the selected slot's item and its controls, then recently used items.
function gearSide(st) {
  let head = `<p class="empty">Click a slot to equip it, a weapon tab to switch to swap II, or a bag cell to add a charm.</p>`;
  if (st.pick === "charm" && st.ch[st.at]) {
    const g = st.ch[st.at][3], it = charmOf(st.ch[st.at]);
    head = `<h3>Charm</h3><div class="worn"><div class="bsk" data-tip="${it.s}">${artBox(it)}<div><b class="q-${it.q}">${esc(it.n)}</b><br><small>${esc(it.b)}</small></div></div>
      <div class="gctl">${g ? `<button class="pill" data-affixes="1">${g.a.length ? "Edit affixes" : "Add affixes"}</button>` : ""}<button class="pill" data-uncharm="${st.at}">Remove</button>${g ? rolls(g) : ""}</div></div>`;
  } else if (st.pick && st.pick !== "charm") {
    const g = wearing(st)[st.pick], it = itemOf(g);
    head = `<h3>${st.who === "m" ? "Mercenary's " + SLOT_LABEL[st.pick].toLowerCase() : SLOT_LABEL[st.pick]}</h3>`
      + (it ? gearControls(st, st.pick, it) : "") + `<button class="pill" data-open="1">${it ? "Change item" : "Choose an item"}</button>`;
  }
  const rec = recent();
  return head + `<h3>Recently used</h3>` + (rec.length ? `<div class="recent">${rec.map(([s, slot, who], i) => { const it = BY[s]; return it ? `<div class="rrow"><button class="bsk" data-recent="${i}" data-tip="${s}"${tipWho(who)} title="Equip on ${esc((who === "m" ? "the mercenary's " : "") + SLOT_LABEL[slot].toLowerCase())}">${artBox(it)}<span><b class="q-${it.q}">${esc(it.n)}</b><small>${esc((who === "m" ? "Merc · " : "") + SLOT_LABEL[slot])}</small></span></button><button class="rx" data-unrecent="${i}" aria-label="Drop ${esc(it.n)} from the list">✕</button></div>` : ""; }).join("")}</div>` : `<p class="empty">Items you pick appear here, ready to equip again.</p>`);
}
// Recently used items, kept in this browser: [slug, slot, who, runeword base?], newest first, twelve at most.
const recent = () => { try { return JSON.parse(localStorage.getItem("loth-recent") || "[]"); } catch { return []; } };
// Pinned builds and fork lineage live in this browser only: a build's code is its link, so a pin is a code and a name
const stored = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "") ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const remember = list => { try { localStorage.setItem("loth-recent", JSON.stringify(list.slice(0, 12))); } catch {} };
const addRecent = (s, slot, who, b) => remember([[s, slot, who, ...(b ? [b] : [])], ...recent().filter(r => !(r[0] === s && r[1] === slot && r[2] === who && r[3] === b))]);

// The item picker, a modal dialog: tabs, a search and the list for the selected slot.
// A runeword's second step: the plain bases it can go in, by type, then by required level. Picking one equips both.
function baseStep(st) {
  const it = BY[st.rw], by = {};
  for (const c of rwBases(it, st.pick, st)) (by[W.bases[c].ty] = by[W.bases[c].ty] || []).push(c);
  const row = c => { const b = W.bases[c];
    return `<button class="bsk" data-pickbase="${c}" data-tip="${it.s}" data-base="${c}"${tipWho(st.who)}><div class="art">${b.a ? `<img src="${U.art(b.a)}" alt="">` : ""}</div><div><b>${esc(b.n)}</b><br><small>${esc([b.tier, b.dm && "Damage " + b.dm, b.df && "Defense " + b.df, b.rl && "level " + b.rl, b.str && b.str + " Str", b.dex && b.dex + " Dex"].filter(Boolean).join(" · "))}</small></div></button>`; };
  return `<p class="mut"><button class="pill" data-unrw="1">← Runewords</button> <b class="q-rw">${esc(it.n)}</b> · ${esc(it.runes.join(" "))}: pick a plain or superior base with ${it.so} sockets.</p>
    <div class="plist">${Object.entries(by).map(([ty, cs]) => `<h3>${esc(ty)}</h3><div class="bsum">${cs.map(row).join("")}</div>`).join("") || `<p class="empty">No base here can take ${esc(it.n)}.</p>`}</div>`;
}
// The rare maker: the item as it reads now, its three prefix and three suffix places, and its base's pool for one side.
function affixBody(st) {
  const g = wearing(st)[st.pick], it = itemOf(g), side = st.afk || "p", list = (g.a || []).map(id => AFX?.by[id]).filter(Boolean);
  const place = (a, k) => a ? `<button class="aslot filled" data-unaffix="${a.id}" title="Take it off"><span class="k">${k.toUpperCase()}</span><b>${esc(a.n)}</b><small>${esc(a.l.join(", "))}</small><i>✕</i></button>`
    : `<button class="aslot${k === side ? " sel" : ""}" data-afk="${k}"><span class="k">${k.toUpperCase()}</span><span class="plus">+</span><small>Add a ${k === "p" ? "prefix" : "suffix"}</small></button>`;
  const places = k => [...Array(most(st)).keys()].map(i => place(list.filter(a => a.k === k)[i], k)).join("");
  return `<header><h2>${esc(SLOT_LABEL[st.pick])}: <span class="q-${it.q}">${esc(it.n)}</span></h2><button class="rx" data-close="1" aria-label="Close">✕</button></header>
    ${!AFX ? `<p class="empty">Loading the affix pools…</p>` : `<div class="afx"><div>${tip(it, {art: true})}<h3>Prefixes</h3>${places("p")}<h3>Suffixes</h3>${places("s")}${it.q === "rare" ? `<button class="pill" data-rename="1">New name</button> ` : ""}<button class="pill on" data-close="1">Done</button></div>
    <div><div class="classtabs" role="tablist">${[["p", "Prefixes"], ["s", "Suffixes"]].map(([k, l]) => `<button class="ctab${k === side ? " on" : ""}" data-afk="${k}">${l}</button>`).join("")}</div>
    <input type="search" data-search placeholder="Search ${side === "p" ? "prefixes" : "suffixes"}: life, resist, skills…" value="${esc(st.search || "")}"><div class="plist">${affixList(st)}</div></div></div>`}`;
}
function affixList(st) {
  const g = wearing(st)[st.pick], side = st.afk || "p", q = (st.search || "").trim().toLowerCase(), list = (g.a || []).map(id => AFX.by[id]).filter(Boolean);
  const rows = pool(BY[g.s], st).filter(a => a.k === side && (!q || (a.n + " " + a.l.join(" ")).toLowerCase().includes(q))).sort((a, b) => b.lv - a.lv);
  return `<div class="alist">${rows.map(a => { const on = list.includes(a), why = on ? "" : affixBar(a, list, most(st));
    return `<button class="arow${on ? " on" : ""}${why ? " clash" : ""}" data-affix="${a.id}"><b>${esc(a.n)}</b><i class="tag${a.o === "loth" ? " ours" : ""}">${a.o === "loth" ? "LotH" : "D2"}</i>
      <small>item level ${a.lv}${a.ml ? "–" + a.ml : "+"} · req ${a.rl}${a.r ? "" : " · magic only"}</small><span>${esc(a.l.join(" · "))}</span>${why ? `<em>${esc(why)}</em>` : ""}</button>`; }).join("") || `<p class="empty">Nothing matches.</p>`}</div>`;
}
const pickTab = st => st.pick === "charm" ? st.chTab || "unique" : st.pickTab || "unique";
function pickerBody(st) {
  if (st.affix) return affixBody(st);
  if (st.sock != null) return sockBody(st);
  const slot = st.pick, tab = pickTab(st);
  const title = slot === "charm" ? "Add a charm" : `${st.who === "m" ? "Mercenary's " + SLOT_LABEL[slot].toLowerCase() : SLOT_LABEL[slot]}`;
  return `<header><h2>${esc(title)}</h2><button class="rx" data-close="1" aria-label="Close">✕</button></header>
    ${slot === "charm" ? pickerTabs(tab, [["unique", "Unique"], ["magic", "Magic"]]) : pickerTabs(tab)}
    ${st.rw ? baseStep(st) : `${tab === "rare" ? `<p class="mut">Pick the base, then its affixes: one prefix and one suffix make it magic, more make it rare.</p>` : tab === "magic" ? `<p class="mut">Pick the size, then one prefix and one suffix at most: charms are only ever magic.</p>` : ""}<input type="search" data-search placeholder="Search ${esc(SLOT_LABEL[slot].toLowerCase())} items" value="${esc(st.search || "")}" autofocus><div class="plist">${pickerList(st)}</div>`}`;
}

// The four attributes: the class's base, the points placed (st.pt), and gear; quests count completed difficulties.
const ATTRS = [["str", "Strength"], ["dex", "Dexterity"], ["vit", "Vitality"], ["enr", "Energy"]];
const statPoints = st => W.charstats[st.c].statPerLevel * (st.l - 1) + W.planner.quests.stats * (W.planner.timeline?.tomes || TOME_LV).slice(0, st.q).filter(l => l <= st.l).length;
const placed = st => ATTRS.reduce((n, [k]) => n + (st.pt?.[k] || 0), 0);
function attrs(st, g = statsOf(gearLines(st), st.l, gearLines(st, true))) {
  const cs = W.charstats?.[st.c] || {};
  return Object.fromEntries(ATTRS.map(([k]) => [k, (cs[k] || 0) + (st.pt?.[k] || 0) + (g[k] || 0)]));
}
// aur: resists the build's auras add (auras(): gear and merc auras, not the player's own, which runs one at a time).
function sheet(st, aur = {}, compact = false) {
  const g = statsOf(gearLines(st), st.l, gearLines(st, true));
  const cs = W.charstats?.[st.c] || {}, a = attrs(st, g), left = statPoints(st) - placed(st);
  const {vit, enr} = a;
  // the four attributes, prominent: total, then base + points + gear, and a points box with − and +
  const attrRows = ATTRS.map(([k, label]) => `<div class="attr"><span class="an">${label}</span><b>${a[k]}</b>
    <small>${cs[k] || 0}${st.pt?.[k] ? ` + ${st.pt[k]}` : ""}${g[k] ? ` + ${g[k]} gear` : ""}</small>
    <span class="ab"><button data-ad="${k}" data-n="-1" aria-label="One point less">−</button><input type="number" min="0" data-attr="${k}" value="${st.pt?.[k] || 0}" aria-label="${label} points"><button data-ad="${k}" data-n="1" aria-label="One point more">+</button></span></div>`).join("");
  // the class's starting Vitality and Energy count one each (a level-1 Sorceress has 30 + 10 life, 35 mana); points above them at the per-point rate
  const life = Math.round((cs.life || 0) + (cs.vit || 0) + (vit - (cs.vit || 0)) * (cs.lifePerVit || 0) + (st.l - 1) * (cs.lifePerLevel || 0) + g.life);
  const mana = Math.round((cs.enr || 0) + (enr - (cs.enr || 0)) * (cs.manaPerMagic || 0) + (st.l - 1) * (cs.manaPerLevel || 0) + g.mana);
  const elems = [["Fire", "fireres"], ["Cold", "coldres"], ["Lightning", "ltngres"], ["Poison", "poisres"]];
  const resRow = (label, key) => {
    const raw = (g[key] || 0) + (aur[key] || 0), cap = Math.min(W.planner.resist.hard, W.planner.resist.base + (g.maxres[key] || 0));
    return `<tr><th>${label}</th>${DIFF_NAMES.map(d => `<td>${Math.min(cap, Math.max(W.planner.difficulty[d].floor, raw + W.planner.difficulty[d].penalty))}%</td>`).join("")}</tr>`;
  };
  if (compact) return `<h3>At level ${st.l}</h3><dl class="sv-stats">${ATTRS.map(([k, label]) => `<dt>${label}</dt><dd>${a[k]}</dd>`).join("")}
    <dt>Life</dt><dd>${life}</dd><dt>Mana</dt><dd>${mana}</dd><dt>Cast rate</dt><dd>${g.fcr}%</dd><dt>Hit recovery</dt><dd>${g.fhr}%</dd><dt>Run/Walk</dt><dd>+${g.frw}%</dd>
    <dt>Hell resists</dt><dd>${elems.map(([label, k]) => `<span title="${label}">${Math.min(W.planner.resist.hard, W.planner.resist.base + (g.maxres[k] || 0), Math.max(W.planner.difficulty.Hell.floor, (g[k] || 0) + (aur[k] || 0) + W.planner.difficulty.Hell.penalty))}%</span>`).join(" / ")}</dd></dl>`;
  const treeTotal = Object.entries(g.tree || {}).filter(([k]) => k.startsWith(st.c + "\u0000")).reduce((a, [, n]) => a + n, 0);
  return `<h2 class="sec">Stat sheet <small class="ptsleft${left < 0 ? " over" : ""}">${left} of ${statPoints(st)} stat points left</small></h2>
    <div class="attrs">${attrRows}</div>
    <dl class="sheet">
      <dt>Life</dt><dd>${life}</dd><dt>Mana</dt><dd>${mana}</dd><dt>Defense</dt><dd>${g.def || 0}</dd>
      <dt>Magic find</dt><dd>${g.mf || 0}%</dd><dt>Run/Walk</dt><dd>+${g.frw || 0}%</dd>
      <dt>+Skills</dt><dd>All ${g.allsk || 0} · ${esc(st.c)} ${g.clsk?.[st.c] || 0} · tabs +${treeTotal} · ${Object.keys(g.single || {}).length} named skill${Object.keys(g.single || {}).length === 1 ? "" : "s"}${Object.entries(g.elem || {}).map(([e, n]) => ` · ${ELEM_NAME[e]} +${n}`).join("")}</dd>
    </dl>
    <table class="resists"><thead><tr><th>Resist${Object.keys(aur).length ? ' <small title="Gear and mercenary auras included">with auras</small>' : ""}</th>${DIFF_NAMES.map(d => `<th>${d}</th>`).join("")}</tr></thead>
      <tbody>${elems.map(([l, k]) => resRow(l, k)).join("")}</tbody></table>
    ${speedBlock(st, g)}
    ${g.unread.length ? `<details class="unread"><summary>${g.unread.length} item stat${g.unread.length === 1 ? " isn't" : "s aren't"} counted above</summary><ul>${g.unread.map(l => `<li>${esc(l)}</li>`).join("")}</ul></details>` : ""}`;
}

// Speed breakpoints (tools/wiki/breakpoints.json, #152): the frames an action takes now, and how much more reaches the
// next breakpoint. Sources give the Warlock the Necromancer's tables; skills and auras that add speed aren't counted.
const BP_CLASS = c => c === "Warlock" ? "Necromancer" : c;
const invested = (st, ...names) => W.skills.some(s => s.cls === st.c && names.includes(s.n) && st.p[s.s]);
const BP_CAP = 200;  // no gear reaches past this: rows beyond it (Paladin FHR 4680) are left off the bar and the hint
function bpRow(label, pct, all, note = "") {
  const rows = all.filter(r => r[0] <= Math.max(BP_CAP, pct));
  const at = rows.filter(r => pct >= r[0]).pop(), next = rows.find(r => r[0] > pct), top = rows[rows.length - 1][0] || 1;
  const need = next && next[0] - pct, ticks = rows.slice(1).map(r => `<i style="left:${Math.min(100, r[0] / top * 100)}%" title="${r[0]}%: ${r[1]} frames"></i>`).join("");
  return `<div class="bp"><div class="bph"><b>${label}</b> <span>${pct}% · ${at[1]} frames</span>${note ? ` <small>${esc(note)}</small>` : ""}</div>
    <div class="bpbar">${ticks}<em style="left:${Math.min(100, pct / top * 100)}%"></em></div>
    <div class="bpn${need && need <= 10 ? " near" : ""}">${next ? `${need <= 10 ? "Only " : ""}+${need}% more reaches ${next[1]} frames (${next[0]}%)` : "At the fastest reachable breakpoint"}</div></div>`;
}
function speedBlock(st, g) {
  const bp = W.bp; if (!bp) return "";
  const c = BP_CLASS(st.c), hb = handBase(st.g[arm("weapon", st.sw)]), two = !!hb?.h2 && !(st.c === "Barbarian" && hb.h12), one = !two;
  const wc = (two && hb.wc2) || hb?.wc || "hth";  // a two-handed sword swings its 2hs animation held in both hands
  const pick = (kind, key) => bp[kind]?.[c]?.[key] || bp[kind]?.[c]?.default;
  const out = [bpRow("Cast", g.fcr || 0, st.c === "Druid" ? bp.fcr.Druid.human : pick("fcr", "default"))];
  if (st.c === "Sorceress" && invested(st, "Lightning", "Chain Lightning")) out.push(bpRow("Cast: Lightning", g.fcr || 0, bp.fcr.Sorceress.lightning));
  const fhr = st.c === "Druid" ? (wc === "1hs" && one ? "human_1h_swinging" : "human_other") : st.c === "Paladin" ? (["2ht", "stf"].includes(wc) ? "spear_staff" : "default_other_weapons") : "default";
  out.push(bpRow("Hit recovery", g.fhr || 0, pick("fhr", fhr)));
  const fbr = st.c === "Amazon" && wc === "1hs" && one ? "one_handed_swinging" : st.c === "Paladin" && invested(st, "Holy Shield") ? "holy_shield" : st.c === "Druid" ? "human" : "default";
  out.push(bpRow("Block", g.fbr || 0, pick("fbr", fbr)));
  const wsm = hb?.ws || 0, rows = W.planner.ias[c]?.[wc]?.[wsm];
  if (rows) {  // the standard attack with the main-hand weapon
    out.push(bpRow("Attack", g.ias || 0, rows, `standard attack, ${hb ? W.bases[hb.code]?.n || hb.n || hb.type || "weapon" : "unarmed"}${wsm ? `, weapon speed ${wsm > 0 ? "+" : ""}${wsm}` : ""}`));
  }
  return `<h3 class="bph3">Speed</h3><div class="bps">${out.join("")}</div>
    <p class="bpnote">Breakpoints from gear only; skills and auras that add speed aren't counted${st.c === "Warlock" ? ". Warlock estimates use Necromancer breakpoints" : ""}.</p>`;
}

function stepStrip(st, spentN, availN) {
  const filled = worn(st).filter(k => st.g[k]).length, firstEmpty = worn(st).find(k => !st.g[k]);
  const steps = [
    {k: "class", t: "Class", ok: true, s: `${st.c}, level ${st.l}`},
    {k: "skills", t: "Skills", ok: spentN === availN, s: spentN === availN ? `All ${availN} points spent` : `${availN - spentN} point${availN - spentN === 1 ? "" : "s"} left to spend`},
    {k: "gear", t: "Gear", ok: filled === GEAR_SLOTS.length, s: filled === GEAR_SLOTS.length ? "All ten slots filled" : `${SLOT_LABEL[firstEmpty]} is empty`},
    {k: "stats", t: "Stats", ok: true, s: "Attributes, life, mana and resists, below"},
    {k: "share", t: "Share", ok: true, s: "Copy the link below to share"},
  ];
  return `<div class="steps" role="tablist">${steps.map((x, i) => `<button class="step${x.ok ? " ok" : ""}" data-steptab="${x.k}"><b>${i + 1} · ${esc(x.t)}</b><span>${esc(x.s)}</span></button>`).join("")}</div>`;
}

PAGES.builds = async () => {
  const qs = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
  // a shared link's build, else the last one planned here (so "Plan with it" elsewhere adds to it), else a new one
  const last = !h.get("c") && (() => { try { return localStorage.getItem("loth-build"); } catch { return null; } })();
  // "Plan a build" right after viewing a shared build in this tab adds to that build (as your own fork), not to your last one
  const viewed = h.get("wear") && !qs.get("b") && !qs.get("share") && (() => { try { return sessionStorage.getItem("loth-viewed"); } catch { return null; } })();
  let code = qs.get("b") || viewed || last, st, live, release = "", releases = [], migration = null;
  try {
    $("#main").innerHTML = '<p class="empty" role="status">Loading build and release…</p>';
    const runtimeRelease = document.documentElement.dataset.buildRelease;
    BuildFormat = await import(new URL(ROOT + "assets/build-format.js" + (runtimeRelease ? "?release=" + runtimeRelease : ""), location.href).href);
    const [liveWiki, liveAffixes] = await Promise.all([buildJSON(ROOT + "data/wiki.json?current=1"), buildJSON(ROOT + "data/affixes.json?current=1")]);
    live = BuildFormat.snapshot(liveWiki, liveAffixes);
    if (qs.get("share")) { const saved = await buildJSON(ROOT + "api/b/" + encodeURIComponent(qs.get("share"))); code = saved.build; release = saved.release || ""; }
    release ||= code?.[0] === "6" ? BuildFormat.decode(code).r : "";
    if (release && !runtimeRelease && !qs.get("share") && !qs.get("b")) { location.replace(U.page("builds") + "?b=" + encodeURIComponent(code) + location.hash); return; }
    // Offline, a build on the release this browser registered opens on the saved copy only when both its data and its
    // calculator code match what was registered; any other release is refused
    const known = stored("loth-releases", {}), codeMark = () => Promise.all(["builds-page.js", "skillcalc.js", "app.js", "build-format.js"]
      .map(f => fetch(ROOT + "assets/" + f).then(r => r.text()))).then(texts => BuildFormat.fingerprint(live) + ":" + BuildFormat.fingerprint(texts));
    const data = release ? await buildJSON(ROOT + "api/releases/" + release).catch(async error => { if (known[release] && known[release] === await codeMark().catch(() => "")) return live; throw error; }) : live;
    if (!release) {
      try { release = (await buildJSON(ROOT + "api/releases", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({expected: BuildFormat.fingerprint(live)})})).id;
        store("loth-releases", {...Object.fromEntries(Object.entries(known).slice(-19)), [release]: await codeMark()}); }
      catch { /* Static/offline previews can edit drafts; Share still requires a saved release. */ }
    }
    W = {...W, ...data.wiki}; BY = Object.fromEntries(W.items.map(it => [it.s, it]));
    AFX = {...data.affixes, by: Object.fromEntries(data.affixes.affixes.map(a => [a.id, a]))};
    stored("loth-moo", []).forEach(unseal);
    st = unpackBuild(code);
    if (code && !st) throw new Error("This build link is not supported. Its link and your saved build have been kept.");
    st?.u?.forEach(unseal);
    st ||= {c: h.get("c") || "Amazon", l: 1, q: 3, e: 5, p: {}, o: [], a: [], k: [{l: 1}], s: h.get("s") || "", t: 0};
    st.r = release;
  if (!st.k) {  // a link from before the timeline: its points in order, one gear set from level 1, its stat points at its level
    orderFrom(st, st.p); st.guess = true; st.k = [{l: 1, ...Object.fromEntries(STAGE.map(f => [f, st[f]]))}];
    st.a = []; st.pt0 = st.pt; st.pt = {};  // its stat points are spread over the levels once setStat exists, below
  }
  showStage(st);
  packBuild(st, classSkills(st));
  } catch (error) {
    $("#main").innerHTML = `<h1>Build unavailable</h1><p role="alert">${esc(error.message)}</p><p>Your saved build has not been replaced.</p><button class="pill" id="retrybuild">Try again</button>`;
    $("#retrybuild").onclick = () => location.reload(); return;
  }
  // A link that isn't the build you last planned is someone else's: view it as it is; the first change forks it, so the
  // shared link keeps pointing at the original and your version gets a link of its own
  let shared = viewed || (!h.get("wear") && (qs.get("share") || qs.get("b") && (code !== last || ["summary", "detail"].includes(qs.get("v")))) ? code : null), fresh = !!shared && !viewed, sharedL = unpackBuild(shared)?.l;
  let forkOf = shared ? null : stored("loth-forks", {})[last] || null;
  let view = shared && !viewed ? qs.get("v") === "detail" ? "detail" : "summary" : "edit";
  const readonly = () => view !== "edit";
  st.who = st.who || "p"; st.tab = st.tab || "build";
  for (const g of [st.g, st.m]) for (const [k, x] of Object.entries(g)) { const it = BY[x.s]; if (it?.q === "rw" && !x.b) x.b = rwBases(it, k, st, g === st.m ? "m" : "p")[0]; }  // older links carry no base
  st.pickTab = st.pickTab || "unique"; st.search = st.search || "";
  // builds.html#wear, "What can I wear" (card 10): the same build on the paper doll alone, a slot's fits listed beside it
  const wearView = location.hash === "#wear";
  if (wearView) { st.pickTab = "unique"; if (st.who === "m") { st.who = "p"; st.pick = null; } }
  BASES = baseItems(); CHARMS = charmItems();
  for (const i of W.items) if (i.fam === "Quivers") SLOT_TITLES.offhand.add(i.t);
  // what the hover tooltip checks an item against (app.js tip): the player's class, level and attributes, or the merc's hands
  window.tipCtx = who => { const m = who === "m" && mercType(st), a = who === "p" && attrs(st);
    return m ? {can: [...m.can, ...m.wield, ...m.offh], lvl: mercLevel(st)} : who === "p" ? {cls: st.c, lvl: st.l, str: a.str, dex: a.dex} : null; };
  const mine = () => classSkills(st), by = s => mine().find(x => x.s === s), byName = n => mine().find(x => x.n === n);
  st.s = h.get("s") || st.s;
  if (st.s && by(st.s)) st.t = 3 - by(st.s).page;
  wear(st, BY[h.get("wear")]);
  const avail = () => pointLevels(st).filter(l => l <= st.l).length, spent = () => Object.values(st.p).reduce((a, b) => a + b, 0);
  const cap = s => Math.max(0, Math.min(s.max, st.l - s.rl + 1));
  const open = s => s.req.every(n => (st.p[byName(n)?.s] || 0) > 0) && cap(s) > 0;
  // The build's level: where its last skill or stat point is spent. At the build's end, a point added goes in at the
  // earliest level the game allows after the last one (the points earned, the skill's required level, one level a point),
  // its missing prerequisites first, and the slider follows: two points in one skill and 25 in another lands where that
  // needs. With the slider earlier, it goes in there, or at the next level with a point to spare. A point that would push
  // a later one over budget is refused with a note. One removed is the latest spent by then; removing it also clears points that needed it.
  const inPath = e => e[1] >= respecAt(st) && e[1] < respecEnd(st);
  const buildLevel = () => Math.max(respecAt(st), ...st.o.filter(inPath).map(e => e[1]), ...st.a.filter(inPath).map(e => e[1]));
  const place = (x, from) => { const n = legal(st, st.o).length + 1;  // nothing else drops, even over budget
    for (let l = Math.max(from, respecAt(st)); l < respecEnd(st); l++) { const i = st.o.filter(e => e[1] <= l).length, next = [...st.o.slice(0, i), [x, l], ...st.o.slice(i)]; if (legal(st, next).length === n) return [next, l]; }
    return null; };
  const add = (s, d) => {
    st.note = ""; st.guess = false;
    if (d > 0 && st.o.filter(e => inPath(e) && e[0] === s.s).length >= s.max) st.note = `${s.n} is at its most, ${s.max} points.`;
    else if (d > 0) {
      const end = st.l >= buildLevel(), need = [], walk = x => { if (!need.includes(x) && !st.o.some(e => inPath(e) && e[0] === x.s)) { x.req.map(byName).forEach(r => r && walk(r)); need.push(x); } };
      s.req.map(byName).forEach(r => r && walk(r)); need.push(s); need.sort((a, b) => a.rl - b.rl);  // a prerequisite never needs a higher level
      const was = st.o;
      let from = end ? Math.max(respecAt(st), st.o.filter(inPath).at(-1)?.[1] || 1) : st.l;
      for (const x of need) { const got = place(x.s, from); if (!got) { st.o = was; break; } [st.o, from] = got; }
      if (st.o === was) st.note = end ? `No skill point left for ${s.n} by level 99.` : `No point to spare for ${s.n} at level ${st.l}: the points from here on are spent. Remove a later one first.`;
      else if (end) toLevel(Math.max(st.l, buildLevel()));  // never lower: gear or a slide may have set it higher
    }
    if (d < 0 && (st.p[s.s] || 0) > 0) { st.o.splice(st.o.findLastIndex(e => inPath(e) && e[0] === s.s && e[1] <= st.l), 1); st.o = legal(st, st.o, false); }
    settle(st); st.s = s.s;
  };
  // Stat points the same way: at the build's end they're spread over the levels from the last ones placed, as each level
  // earns them, and the slider follows; earlier, from the slider's level on. Each level keeps within the points it has, and
  // so does every later one. Taken back from the latest placed by then.
  const placedBy = l => st.a.reduce((n, e) => n + (e[1] >= respecAt(st, l) && e[1] <= l ? e[2] : 0), 0);
  const free = l => Math.min(...[l, ...st.a.filter(inPath).map(e => e[1]).filter(x => x > l)].map(x => statPoints({...st, l: x}) - placedBy(x)));
  const setStat = (k, want) => {
    let d = Math.max(0, want) - (st.pt[k] || 0);
    st.note = "";
    if (d > 0) {
      const end = st.l >= buildLevel();
      for (let l = end ? Math.max(respecAt(st), ...st.a.filter(inPath).map(e => e[1])) : st.l; d > 0 && l < respecEnd(st); l++) {
        const n = Math.min(d, free(l)); if (n <= 0) continue;
        const e = st.a.find(([x, y]) => x === k && y === l);
        if (e) e[2] += n; else st.a.push([k, l, n]);
        st.a.sort((x, y) => x[1] - y[1]); d -= n;
      }
      const short = d;
      if (end) toLevel(Math.max(st.l, buildLevel()));
      if (short > 0) st.note = end ? `No stat points left for ${short} more by level 99.` : `No stat point to spare at level ${st.l}: the points from here on are placed. Remove a later one first.`;
    }
    for (let j = st.a.length - 1; d < 0 && j >= 0; j--) { const e = st.a[j]; if (inPath(e) && e[0] === k && e[1] <= st.l) { const t = Math.min(e[2], -d); e[2] -= t; d += t; } }
    st.a = st.a.filter(e => e[2] > 0);
  };
  // What the gear set in use holds: worn items and what fills their sockets, the mercenary's, and the charms.
  const gearItems = () => [...[...worn(st).map(k => [k, st.g[k]]), ...GEAR_SLOTS.map(k => [k, st.m[k]])].flatMap(([k, g]) => { const it = itemOf(g);
    return it ? [it, ...(it.q === "rw" ? [] : socketsOf(it, g, k).so.map(x => BY[x]))] : []; }), ...st.ch.map(charmOf)].filter(Boolean);
  // Gear that needs a higher level than the slider moves the slider there, unless a later gear set starts first.
  const reachGear = () => { const next = st.k[st.ki + 1], need = Math.max(0, ...gearItems().map(it => it.rl || 0));
    if (need > st.l && (!next || need < next.l)) toLevel(need); };
  const toLevel = l => { keepStage(st); st.l = Math.max(1, Math.min(99, l)); st.note = ""; showStage(st); settle(st); };
  if (st.pt0) { ATTRS.forEach(([k]) => st.pt0[k] && setStat(k, st.pt0[k])); delete st.pt0; }
  if (h.get("wear")) reachGear();  // "Plan with it" from an item page
  const bonusFrom = s => s.syn.map(byName).filter(x => x && st.p[x.s]);
  // A skill's change in player words (wiki.json s.ln and s.w, #461), drawn as the skill page's balLine
  const lotLine = ([label, before, after, lvl]) => `<div class="bal-ch"><span>${esc(label)}${lvl ? `<small>at level ${lvl}</small>` : ""}</span>
    <b>${before == null ? "<s>none</s>" : `<s>${esc(before)}</s>`}<i>→</i>${after == null ? "removed" : esc(after)}</b></div>`;
  let GEAR_SK = {allsk: 0, clsk: {}, tree: {}, single: {}, elem: {}, stat: {}};  // gear's +skills, recomputed once per draw()
  const levelOf = name => {
    const sk = mine().find(x => x.id === name);
    if (!sk) return 0;
    let n = st.p[sk.s] || 0;
    if (!n) return 0;  // item bonuses never unlock a skill with no point in it
    n += GEAR_SK.allsk || 0;
    n += GEAR_SK.clsk?.[st.c] || 0;
    if (sk.tree && GEAR_SK.tree?.[`${st.c}\u0000${sk.tree}`]) n += GEAR_SK.tree[`${st.c}\u0000${sk.tree}`];
    if (GEAR_SK.single?.[sk.n]) n += GEAR_SK.single[sk.n];
    if (sk.el && GEAR_SK.elem?.[sk.el]) n += GEAR_SK.elem[sk.el];
    return Math.max(0, n);
  };
  const numbers = (s, lvl) => window.SkillCalc && W.calc?.[s.id] && lvl > 0 ? SkillCalc.lines(W.calc, s.id, lvl, levelOf, {clvl: st.l, stats: GEAR_SK.stat}) : null;
  const lines = xs => xs.map(l => `<div>${esc(l)}</div>`).join("");
  const S = TREE.w, px = v => `${(v / S * 100).toFixed(2)}%`;  // tree coordinates as % of the page width
  const tree = () => {
    const page = 3 - st.t, art = W.trees[st.c]?.[st.t];
    const names = [3, 2, 1].map(p => mine().find(s => s.page === p)?.tree || "");
    return `<div class="tpanel" style="background-image:url(${U.art(art)});aspect-ratio:${TREE.w}/${TREE.h}">
      ${names.map((n, i) => `<button class="ttab${i === st.t ? " on" : ""}" data-t="${i}" style="left:${px(i * TREE.w / 3)};width:${px(TREE.w / 3)}">${esc(n)}</button>`).join("")}
      ${arrows(page)}
      ${mine().filter(s => s.page === page).map(s => {
        const n = st.p[s.s] || 0, x = TREE.cols[s.col - 1], y = TREE.rows[s.row - 1], k = state(s);
        const tip = {lvl: `${s.n}: needs character level ${s.rl}`, pre: `${s.n}: needs ${s.req.join(", ")} first`, max: `${s.n}: maxed`}[k] || s.n;
        return `<button class="ticon ${k}${n && k !== "max" ? " have" : ""}${st.s === s.s ? " sel" : ""}${rel(s)}" data-s="${s.s}" title="${esc(tip)}"
          style="left:${px(x)};top:${(y / TREE.h * 100).toFixed(2)}%;width:${px(TREE.icon)}">${s.icon ? `<img src="${U.art(s.icon)}" alt="${esc(s.n)}">` : esc(s.n)}
          ${k === "lvl" ? `<em>Lvl ${s.rl}</em>` : ""}</button>
          <span class="tbox ${k}${n ? " have" : ""}" style="left:${px(x + TREE.box[0])};top:${((y + TREE.box[1]) / TREE.h * 100).toFixed(2)}%;width:${px(TREE.box[2])}">${n || ""}${n && levelOf(s.id) > n ? `<i>+${levelOf(s.id) - n}</i>` : ""}</span>`;
      }).join("")}</div>
      <p class="legend"><span class="lg ready"></span>Can take points <span class="lg have"></span>Invested <span class="lg max"></span>Maxed <span class="lg pre"></span>Needs a skill first <span class="lg lvl"></span>Needs a higher level <span class="lg syn"></span>Synergy of the selected skill</p>`;
  };
  // a skill's state in the tree: lvl (character level too low), pre (a prerequisite has no point), max, ready
  const state = s => cap(s) === 0 ? "lvl" : !open(s) ? "pre" : (st.p[s.s] || 0) >= cap(s) ? "max" : spent() >= avail() ? "full" : "ready";
  const rel = s => { const sel = by(st.s); return sel && s !== sel && (sel.syn.includes(s.n) || s.syn.includes(sel.n)) ? " syn" : ""; };
  // prerequisite arrows over the game's own: lit once the prerequisite has a point (tree coordinates, see TREE)
  const arrows = page => {
    const c = s => [TREE.cols[s.col - 1] + TREE.icon / 2, TREE.rows[s.row - 1] + TREE.icon / 2];
    const segs = mine().filter(s => s.page === page).flatMap(s => s.req.map(byName).filter(p => p && p.page === page).map(p => {
      const [x1, y1] = c(p), [x2, y2] = c(s), d = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / d, uy = (y2 - y1) / d, g = TREE.icon / 2 + 8;
      const cls = st.p[p.s] ? "lit" : st.s === s.s || st.s === p.s ? "sel" : "";
      return `<line class="${cls}" x1="${x1 + ux * g}" y1="${y1 + uy * g}" x2="${x2 - ux * g}" y2="${y2 - uy * g}" marker-end="url(#ah${cls === "lit" ? "l" : cls === "sel" ? "s" : ""})"/>`;
    }));
    return `<svg class="tarrows" viewBox="0 0 ${TREE.w} ${TREE.h}"><defs><marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path d="M0 0L10 5L0 10z"/></marker>
      <marker id="ahl" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path class="lit" d="M0 0L10 5L0 10z"/></marker>
      <marker id="ahs" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path class="sel" d="M0 0L10 5L0 10z"/></marker></defs>${segs.join("")}</svg>`;
  };
  // what this skill gives the skills it boosts: their synergy line naming it, and its total from the points spent
  const boosts = s => mine().filter(x => x.syn.includes(s.n)).map(x => {
    const r = numbers(x, Math.max(1, st.p[x.s] || 0)), bonus = r?.bonuses.find(b => b.name === s.n), line = bonus?.text;
    const per = bonus?.percent, n = st.p[s.s] || 0;
    return `<li><a href="#" data-pick="${x.s}">${esc(x.n)}</a> ${line ? esc(line.slice(s.n.length + 1)) : ""}${per && n ? ` <b>now ${per * n > 0 ? "+" : ""}${per * n}%</b>` : ""}</li>`;
  }).join("");
  const detail = s => {
    if (!s) return `<p class="empty">${readonly() ? "Select a skill to read its details." : "Use − and + to change skill points, or press a skill icon to add one."}</p>`;
    const n = st.p[s.s] || 0, tot = levelOf(s.id), num = numbers(s, Math.max(1, tot));
    return `<div class="skhead">${s.icon ? `<img src="${U.art(s.icon)}" alt="">` : ""}<div><h2>${esc(s.n)}</h2><p class="mut">${esc(s.tree)} · required level ${s.rl}</p></div></div>
      <p>${esc(s.d).replace(/\n/g, "<br>")}</p>
      <div class="pts big"><button data-d="-1" data-s="${s.s}" aria-label="Remove a point">−</button><b>${n}</b> / ${s.max}<button data-d="1" data-s="${s.s}" aria-label="Add a point">+</button>
        ${s.max !== s.vmax ? `<small>Diablo II caps it at ${s.vmax}</small>` : ""}</div>
      ${num ? `<h3>${n ? `Current level: ${tot}${tot > n ? ` <small>(${n} + ${tot - n} from gear)</small>` : ""}` : "At level 1"}</h3><div class="calc">${lines(num.fixed)}${lines(num.current)}</div>
        ${n && n < s.max ? `<h3>Next level</h3><div class="calc next">${lines(num.next)}</div>` : ""}
        ${num.bonuses.length ? `<h3>Receives bonuses from</h3><ul class="boost">${num.bonuses.map(b => { const g = byName(b.name); return `<li>${g ? `<a href="#" data-pick="${g.s}">${esc(g.n)}</a> ${esc(b.text.slice(g.n.length + 1))}${st.p[g.s] ? ` <b>(${st.p[g.s]} points)</b>` : ""}` : esc(b.text)}</li>`; }).join("")}</ul>` : ""}` : ""}
      ${(() => { const b = boosts(s); return b ? `<h3>Boosts</h3><ul class="boost">${b}</ul>` : ""; })()}
      <dl>${s.req.length ? `<dt>Needs</dt><dd>${s.req.map(r => `<a href="#" data-pick="${byName(r)?.s}">${esc(r)}</a>`).join(", ")}</dd>` : ""}
</dl>
      ${s.ln?.length ? `<h3>Changed in Legacy of the Horadrim</h3>${s.w ? `<p>${esc(s.w)}</p>` : ""}<div class="bal-lines">${s.ln.map(lotLine).join("")}</div>` : ""}
      <p><a href="${U.skill(s.s)}">Read the full skill page →</a></p>`;
  };
  // The sidebar's skill list: every skill with points, by total level (st.so: -1 highest first, 1 lowest first).
  const summary = () => {
    const dir = st.so || -1;
    const picked = mine().filter(s => st.p[s.s]).sort((a, b) => dir * (levelOf(a.id) - levelOf(b.id)) || a.n.localeCompare(b.n));
    const head = `<h2 class="sec">Skills <span class="sorts"><button class="${dir < 0 ? "on" : ""}" data-sort="-1" title="Highest level first">Level ↓</button><button class="${dir > 0 ? "on" : ""}" data-sort="1" title="Lowest level first">Level ↑</button></span></h2>`;
    if (!picked.length) return head + `<p class="empty">Spend points and your skills appear here, with their levels and what feeds them.</p>`;
    return head + `<div class="sklist">${picked.map(s => {
      const feeds = bonusFrom(s), tot = levelOf(s.id);
      return `<button class="bsk${st.s === s.s ? " on" : ""}" data-s="${s.s}">${s.icon ? `<img src="${U.art(s.icon)}" alt="">` : "<span></span>"}<span class="nm">
        <b>${esc(s.n)}</b>${feeds.length ? `<small class="feeds">Boosted by ${feeds.map(f => `${esc(f.n)} ${st.p[f.s]}`).join(", ")}</small>` : `<small>${esc(s.tree)}</small>`}</span>
        <span class="lv">${tot}${tot > st.p[s.s] ? `<i>${st.p[s.s]} + ${tot - st.p[s.s]}</i>` : ""}</span></button>`;
    }).join("")}</div>`;
  };
  // Every aura on the build, the strongest first: gear and charms on either wearer ("Level n Aura When Equipped"), the
  // merc's own (hireling.txt's row hired nearest below the player's level), and the player's aura skills with points. The
  // same aura doesn't stack: the highest level counts, the rest are listed under it.
  const AURA_FROM = {p: 0, g: 1, m: 2};
  const auraList = () => {
    const out = [], skill = par => {
      const entry = Object.entries(W.calc).find(([id, e]) => e.row?.aura === "1" && (e.sid === par || id.toLowerCase() === String(par).toLowerCase() || e.name === par));
      if (!entry) return null;
      const [id, e] = entry, page = W.skills.find(x => x.n === e.name);
      return page && {...page, id};  // hidden auras (the Ancients' pierce) share a skilldesc, not that skill's stats
    };
    const gear = (g, keys, whose) => keys.map(k => itemOf(g[k])).filter(Boolean).forEach(it => (it.lp || []).forEach(([code, lo, hi, par]) => {
      const s = W.properties[code.toLowerCase()]?.includes("item_aura") && skill(par);
      if (s) out.push({s, n: s.n, lv: +hi || +lo, lo: +lo, from: it.n + whose, k: "g"}); }));
    gear(st.g, worn(st), "");
    gear(Object.fromEntries(st.ch.map((e, i) => [i, e[3] || {s: e[0]}])), Object.keys(st.ch), "");
    gear(st.m, GEAR_SLOTS.filter(k => !blocked(st, "m", k)), " (mercenary)");
    const m = mercType(st), v = m?.v[st.mv || 0];
    for (const n of v?.sk || []) {
      const s = skill(n), lv = mercSkill(st, n);
      if (s && lv) out.push({s, n: s.n, lv, from: `Your ${m.n}`, k: "m"});
    }
    for (const s of mine().filter(s => st.p[s.s] && W.calc[s.id]?.row.aura === "1")) out.push({s, n: s.n, lv: levelOf(s.id), from: "Your skill, one at a time", k: "p"});
    const by = {};
    for (const a of out.sort((a, b) => b.lv - a.lv || AURA_FROM[a.k] - AURA_FROM[b.k])) (by[a.s.id] = by[a.s.id] || []).push(a);
    return Object.values(by).map(([top, ...rest]) => {
      const s = top.s, r = window.SkillCalc && W.calc?.[s.id] && SkillCalc.lines(W.calc, s.id, top.lv, top.k === "p" ? levelOf : () => 0, {clvl: top.k === "m" ? mercLevel(st) : st.l, stats: top.k === "p" ? GEAR_SK.stat : {}});
      return {...top, s, rest, fx: r?.auraLines || [], stats: r?.aura || {}};
    }).sort((a, b) => b.lv - a.lv || AURA_FROM[a.k] - AURA_FROM[b.k]);
  };
  // the resists gear and merc auras add to the stat sheet (the player's own aura is a choice, so it isn't counted)
  const auraRes = list => {
    const out = {};
    for (const a of list) if (a.k !== "p") for (const [stat, n] of Object.entries(a.stats)) if (n > 0 && ["fireres", "coldres", "ltngres", "poisres"].includes(SHEET[stat])) out[SHEET[stat]] = (out[SHEET[stat]] || 0) + n;
    return out;
  };
  const auras = list => `<h2 class="sec">Auras</h2>` + (!list.length ? `<p class="empty">No auras on this build. Gear, a mercenary or your own aura skills add them here.</p>`
    : `<div class="sklist">${list.map(a => `<a class="bsk" href="${U.skill(a.s.s)}">${a.s.icon ? `<img src="${U.art(a.s.icon)}" alt="">` : "<span></span>"}<span class="nm">
        <b>${esc(a.n)}</b><small>${esc(a.from)}${a.fx.length ? " · " + esc(a.fx.join(", ")) : ""}</small>${a.rest.map(o => `<small class="weak">${esc(o.from)}, level ${o.lv}: doesn't stack</small>`).join("")}</span>
        <span class="lv">${a.lo && a.lo !== a.lv ? `${a.lo}-${a.lv}` : a.lv}</span></a>`).join("")}</div>`);
  // What a slot takes at this class and level, the highest required level first; a pick lands in the build
  const wearSide = () => {
    const slot = st.pick, g = slot && slot !== "charm" && st.g[slot], it = itemOf(g);
    if (!slot) return `<p class="empty">Press a slot to see what fits it, or your inventory for charms.</p>`;
    const list = eligibleItems(slot, st).filter(i => i.q !== "base" && (i.rl || 0) <= st.l)
      .sort((a, b) => (b.rl || 0) - (a.rl || 0) || a.n.localeCompare(b.n));
    const who = `a level ${st.l} ${st.c}`;
    return `<h3>${esc(slot === "charm" ? "Charms" : SLOT_LABEL[slot])} · ${list.length} fit${list.length === 1 ? "s" : ""} ${esc(who)}</h3>
      ${it ? `<div class="wear-now">Wearing <b class="q-${it.q}">${esc(it.n)}</b> <button class="pill" data-clear="${slot}">Remove</button></div>` : ""}
      <div class="bsum">${list.map(i => `<button class="bsk" data-pickitem="${i.s}" data-tip="${i.s}"${tipWho("p")}>${artBox(i)}<div><b class="q-${i.q}">${esc(i.n)}</b><br><small>${esc([`Req. level ${i.rl || 1}`, i.q === "rw" ? "Runeword" : i.base?.n].filter(Boolean).join(" · "))}</small></div></button>`).join("") || `<p class="empty">Nothing here fits ${esc(who)} yet.</p>`}</div>`;
  };
  const wearPage = () => crumbs([[U.page("index"), "Home"], [U.db("c=Gear"), "Gear"], [null, "What can I wear"]]) + `<h1>What can I wear</h1>
      <p class="lede">Press a slot to see what a level ${st.l} ${esc(st.c)} can wear there. What you choose goes into your build in the <a href="${U.page("builds")}">Build planner</a>.</p>
      <div class="classtabs" role="tablist">${CLASSES.map(c => `<button class="ctab${c === st.c ? " on" : ""}" data-c="${c}" role="tab" aria-selected="${c === st.c}">${W.classArt?.[c] ? `<img src="${U.art(W.classArt[c])}" alt="">` : ""}<span>${c}</span></button>`).join("")}</div>
      <div class="bar plan"><label>Character level <input type="number" id="lvl" min="1" max="99" value="${st.l}"></label></div>
      <div class="planner"><div>${playerPanel(st)}</div><aside class="panel gside wearside">${wearSide()}</aside></div>`;
  // The level slider's row: the level, the points by then, the gear sets as buttons (each a tick on the track), and
  // quest and Remnant points below the track. It stays on screen while the page scrolls.
  const at = l => `calc(9px + (100% - 18px) * ${((l - 1) / 98).toFixed(4)})`;  // a level's spot on the track, under the thumb's centre
  const stageName = (k, i) => k.kind === "respec" ? `Respec at ${k.l}` : `Gear ${i + 1} · ${k.l}–${st.k[i + 1] ? st.k[i + 1].l - 1 : 99}`;
  const stages = () => st.k.map((k, i) => `<button class="pill${i === st.ki ? " on" : ""}" data-tlgo="${k.l}">${stageName(k, i)}</button>`).join("");
  const stageActions = () => readonly() ? "" : `<span class="tlsets"><button class="pill" data-tlnew="gear"${st.k[st.ki].l === st.l ? " disabled" : ""}>Gear set from ${st.l}</button><button class="pill" data-tlnew="respec"${st.k[st.ki].kind === "respec" && st.k[st.ki].l === st.l ? " disabled" : ""}>Respec at ${st.l}</button>${st.ki ? `<button class="pill" data-tldel="1">Remove stage ${st.ki + 1}</button>` : ""}</span>`;
  const tlHead = () => { const n = avail(), left = n - spent();
    return `<button class="pill" data-tlstep="-1" aria-label="One level down">−</button><label class="tll">Level <input type="number" id="lvl" min="1" max="99" value="${st.l}" aria-label="Character level"></label><button class="pill" data-tlstep="1" aria-label="One level up">+</button>
      <span class="tlpts">${n} skill point${n === 1 ? "" : "s"} by level ${st.l}${left > 0 ? ` · <b>${left} to spend</b>` : left < 0 ? ` · <b class="over">${-left} over</b>` : ""} · ${statPoints(st)} stat points${statPoints(st) > placed(st) ? ` · <b>${statPoints(st) - placed(st)} to place</b>` : ""}${st.q || st.e ? ` <small title="The game gives quest points when the quest is done; the timeline puts them at the levels players usually finish them">◆ quest points at typical levels</small>` : ""}</span>
      <span class="tlsets">${stages()}</span>
      ${stageActions()}
      ${respecAt(st) > 1 ? `<small class="tlhint">Respec at ${respecAt(st)}: all earned skill and stat points free again. Use Akara’s free respec or a Token of Absolution.</small>` : ""}
      <small class="tlhint">${st.guess ? "Order guessed from an older link: points spent as early as each may go." : st.l >= buildLevel() ? "Click a skill or add stat points and the level rises to where the game allows them." : "Sliding back: a point you add goes in at this level, or the next with a point to spare."}</small>
      ${st.note ? `<p class="tlwarn">${esc(st.note)}</p>` : ""}`; };
  const tlMarks = () => st.k.slice(1).map((k, i) => `<button class="tlset" data-tlgo="${k.l}" style="left:${at(k.l)}" title="${stageName(k, i + 1)}" aria-label="${stageName(k, i + 1)}"></button>`).join("");
  const tlBelow = () => {
    const q = questSplit();
    const marks = (W.planner.timeline?.quests || QUEST_LV).slice(0, st.q).flatMap((ls, d) => ls.map((l, i) => [l, `${QUEST_NAMES[i]}${d ? ", " + DIFF_NAMES[d] : ""}: +${q[i]} skill point${q[i] > 1 ? "s" : ""} (typical level)`]))
      .concat(st.e ? [[W.planner.timeline?.remnants || REMNANT_LV, `${st.e} Remnant${st.e > 1 ? "s" : ""}: +${st.e} skill point${st.e > 1 ? "s" : ""} (after Hell)`]] : []);
    return [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99].map(l => `<span class="tln" style="left:${at(l)}">${l}</span>`).join("")
      + marks.map(([l, t]) => `<button class="tlq" data-tlgo="${l}" style="left:${at(l)}" title="${esc(t)}" aria-label="${esc(t)}"></button>`).join("");
  };
  // The skill order: the points in the order they're spent, a run of one skill as one chip with its levels, split at the
  // slider; the points past it dimmed.
  const tlOrder = () => {
    const runs = [];
    st.o.forEach(([x, l]) => { const r = runs.at(-1); if (r && r.s === x && respecAt(st, r.from) === respecAt(st, l) && (r.to > st.l || l <= st.l)) { r.n++; r.to = l; } else runs.push({s: x, n: 1, from: l, to: l}); });
    if (!runs.length) return `<div class="tlorder"><b>Skill order</b><p class="empty">${readonly() ? "No skill points planned." : "Click skills in the order you'd take them; each lands at the level it needs."}</p></div>${statOrder()}`;
    const lvls = r => r.to > r.from ? `${r.from}–${r.to}` : r.from, cut = runs.findIndex(r => r.from > st.l);
    return `<div class="tlorder"><b>Skill order</b>${runs.map((r, i) => { const s = by(r.s);
      if (!s) return `<span class="tlrun">Unavailable skill: ${esc(r.s)} · ${r.n} points at ${lvls(r)}</span>`;
      return `${respecAt(st, r.from) > 1 && (!i || respecAt(st, runs[i - 1].from) !== respecAt(st, r.from)) ? `<b class="tlrespec">Respec at ${respecAt(st, r.from)}</b>` : ""}${i === cut ? `<span class="tlnow">Level ${st.l}</span>` : ""}<button class="tlrun${r.from > st.l ? " later" : ""}${st.s === s.s ? " sel" : ""}" data-tlgo="${r.to}" data-tls="${s.s}" title="${esc(`${s.n}: ${r.n} point${r.n > 1 ? "s" : ""}, level ${lvls(r)}`)}">${s.icon ? `<img src="${U.art(s.icon)}" alt="">` : ""}<span>${esc(s.n)}${r.n > 1 ? ` <b>×${r.n}</b>` : ""}</span><small>${lvls(r)}</small></button>`; }).join("")}${cut < 0 ? `<span class="tlnow">Level ${st.l}</span>` : `<span class="tlmore">+${runs.length - cut} later</span>`}</div>${statOrder()}`;
  };
  // The stat points in the order they're placed, a run of one attribute as one chip
  const statOrder = () => { const runs = [];
    st.a.forEach(([k, l, n]) => { const r = runs.at(-1); if (r && r.k === k && respecAt(st, r.from) === respecAt(st, l) && (r.to > st.l || l <= st.l)) { r.n += n; r.to = l; } else runs.push({k, n, from: l, to: l}); });
    return runs.length ? `<div class="tlorder"><b>Stat order</b>${runs.map((r, i) => `${respecAt(st, r.from) > 1 && (!i || respecAt(st, runs[i - 1].from) !== respecAt(st, r.from)) ? `<b class="tlrespec">Respec at ${respecAt(st, r.from)}</b>` : ""}<button class="tlrun${r.from > st.l ? " later" : ""}" data-tlgo="${r.to}"><span>${ATTRS.find(a => a[0] === r.k)[1]} <b>+${r.n}</b></span><small>${r.to > r.from ? `${r.from}–${r.to}` : r.from}</small></button>`).join("")}</div>` : ""; };
  const requirements = () => {
    const a = attrs(st), out = [];
    for (const [who, gear, keys] of [["p", st.g, worn(st)], ["m", st.m, GEAR_SLOTS]]) for (const k of keys) {
      const it = itemOf(gear[k]); if (!it) continue;
      const l = who === "m" ? mercLevel(st) : st.l;
      if ((it.rl || 0) > l) out.push(`${who === "m" ? "Mercenary: " : ""}${it.n} needs level ${it.rl} (level ${l})`);
      if (who === "p") for (const [key, label] of [["str", "needs Strength"], ["dex", "needs Dexterity"]]) {
        const base = it.q === "rw" ? W.bases[gear[k].b] : it.base;
        const need = +(it[key] ?? base?.[key] ?? 0);
        if (need > a[key]) out.push(`${it.n} ${label} ${need} (${a[key]} at level ${st.l})`);
      }
    }
    return out.map(n => `<p class="tlwarn">${esc(n)}</p>`).join("");
  };
  // The gear set in use, its levels, and items it holds that need a higher level than the slider's
  const gearHead = () => { const k = st.k[st.ki], next = st.k[st.ki + 1];
    return `<h2 class="sec">Gear <small>${st.k.length > 1 ? `Gear set ${st.ki + 1} of ${st.k.length}: ` : ""}levels ${k.l}–${next ? next.l - 1 : 99}</small></h2>
      <div class="tlgear">
        <small>${st.k.length > 1 ? "Each gear set holds its gear, mercenary and charms until the next one starts." : "Start a new gear set at a level and the gear changes there as you slide."}</small>
        ${requirements()}</div>`; };
  const modes = () => `<nav class="sv-modes" aria-label="Build view"><button class="pill${view === "summary" ? " on" : ""}" data-view="summary">Summary</button><button class="pill${view === "detail" ? " on" : ""}" data-view="detail">Detail</button><button class="pill" data-view="edit">Edit</button></nav>`;
  const sharedHead = () => `<div class="sv-head">${W.classArt?.[st.c] ? `<img src="${U.art(W.classArt[st.c])}" alt="">` : ""}<div><h1>${esc(label())}</h1><p class="mut">${esc(st.c)} · ${esc(W.build || "Unreleased")} · Read-only</p></div>${modes()}</div>`;
  const compactTrees = () => [3, 2, 1].map(p => {
    const ss = mine().filter(s => s.page === p);
    return `<div class="sv-tree"><h3>${esc(ss[0]?.tree || "")}</h3><div class="sv-grid">${ss.map(s => {
      const n = st.p[s.s] || 0;
      return `<button class="sv-sk${n ? " on" : ""}" style="grid-column:${s.col};grid-row:${s.row}" data-svsk="${s.s}" aria-label="${esc(s.n)}: ${n} points">${s.icon ? `<img src="${U.art(s.icon)}" alt="">` : ""}${n ? `<i>${n}</i>` : ""}</button>`;
    }).join("")}</div></div>`;
  }).join("");
  const compactBody = () => { const m = mercType(st), al = auraList();
    return `<div class="sv-board"><div class="sv-trees">${compactTrees()}</div><div class="sv-doll"><h3>Gear</h3>${playerPanel(st, true)}
      <div class="sv-charms">${st.ch.map(e => { const it = charmOf(e); return it ? `<button class="pill" data-tip="${it.s}" data-who="p">${esc(it.n)}</button>` : ""; }).join("")}</div></div>
      <div class="sv-merc"><h3>Mercenary <small>${esc(m.n)} · ${esc(m.v[st.mv || 0]?.n || "")} · level ${mercLevel(st)}</small></h3>${mercPanel(st)}${sheet(st, auraRes(al), true)}</div></div>
      <div class="sv-orders">${tlOrder()}</div>${requirements()}`;
  };
  const backup = () => {
    try { localStorage.setItem("loth-restore", JSON.stringify(now())); return true; }
    catch { st.note = "This browser cannot keep a build to restore. Free browser storage before replacing it."; draw(); return false; }
  };
  const restoreBar = () => stored("loth-restore", null) ? `<div class="build-restore" role="status">Build reset. <button class="pill" data-restore="1">Restore</button><button class="pill" data-dismissrestore="1" aria-label="Dismiss saved build">Dismiss</button></div>` : "";
  const draw = () => {
    keepStage(st); settle(st);
    if (fresh) { shared = now(); sharedL = st.l; fresh = false; }
    if (shared && !viewing()) forkOf = shared;  // the first change forks it
    GEAR_SK = statsOf(gearLines(st), st.l, gearLines(st, true));
    document.title = `${label()} · Legacy of the Horadrim`;
    document.body.dataset.buildView = view;
    if (wearView) $("#main").innerHTML = wearPage();
    else {  // the slider is drawn once and never redrawn, so a drag carries on while the page under it changes
      if (!$("#tl")) $("#main").innerHTML = `<div id="ptop"></div><div class="tl"><div class="tlh"></div><div class="tltrack"><div class="tlm"></div>
        <input type="range" id="tl" min="1" max="99" aria-label="Character level"><div class="tlb"></div></div></div><div id="pbody"></div>`;
      $("#ptop").innerHTML = readonly() ? sharedHead() + (view === "detail" ? releaseBar() : "") : crumbs([[U.page("index"), "Home"], [null, "Builds"]]) + `<h1>Build planner</h1>
      <p class="lede">Skills take up to ${Math.max(...W.skills.map(s => s.max))} hard points; ${W.facts.elixirs} Remnants grant one extra skill point each.</p>
      ${stepStrip(st, spent(), avail())}
      <div class="classtabs" role="tablist">${CLASSES.map(c => `<button class="ctab${c === st.c ? " on" : ""}" data-c="${c}" role="tab" aria-selected="${c === st.c}">${W.classArt?.[c] ? `<img src="${U.art(W.classArt[c])}" alt="">` : ""}<span>${c}</span></button>`).join("")}</div>
      <label class="build-name">Build name <input id="build-name" maxlength="200" value="${esc(st.n || "")}" placeholder="Name your build"></label>${restoreBar()}
      <div class="bar plan">
        <span class="lab" title="Den of Evil, Radament and Izual for skill points, Lam Esen's Tome for stat points">Quests ${combo("q", [[0, "None"], [1, "Normal"], [2, "Normal + Nightmare"], [3, "All three difficulties"]], st.q)}</span>
        <span class="lab">Remnants ${combo("e", [0, 1, 2, 3, 4, 5].map(n => [n, String(n)]), st.e)}</span>
        <button class="pill" id="pin">${pinned() ? "Pinned ✓" : "Pin build"}</button><button class="pill" id="share">Share build</button><button class="pill" id="reset">Reset</button></div>
      ${releaseBar()}${lineage()}<div id="sharebox" role="status"></div>${pinList()}
      <h2 class="sec">Levelling <small>the build at each level, and the order points go in</small></h2>`;
      $(".tlh").innerHTML = view === "summary" ? `<b>Level <input type="number" id="lvl" min="1" max="99" value="${st.l}" aria-label="Character level"></b><span class="tlsets">${stages()}</span>` : tlHead(); $(".tlm").innerHTML = tlMarks(); $(".tlb").innerHTML = view === "summary" ? "" : tlBelow();
      if (+$("#tl").value !== st.l) $("#tl").value = st.l;
      $("#tl").style.setProperty("--tlp", `${(st.l - 1) / 98 * 100}%`);
      $("#pbody").innerHTML = view === "summary" ? compactBody() : `${tlOrder()}
      <div class="bpage"><div class="bwrap" data-active="${st.tab}">
        <div data-sec="build">
          <div class="planner"><div>${tree()}</div><aside class="panel skdet">${detail(by(st.s))}</aside></div>
        </div>
        <div data-sec="gear">
          ${gearHead()}
          <div class="planner"><div>${playerPanel(st, readonly())}</div><aside class="panel gside">${readonly() ? requirements() : gearSide(st)}</aside></div>
          <h2 class="sec">Mercenary</h2>
          <div class="planner"><div>${mercPanel(st)}</div><aside class="panel gside">${mercSide(st)}</aside></div>
        </div>
      </div>
      <aside class="panel sheetbox">${(al => sheet(st, auraRes(al)) + auras(al))(auraList())}${summary()}</aside></div>`;
      if (readonly()) $("#main").querySelectorAll('[data-ad],[data-attr],[data-d],[data-mt],[data-mv],#merc-level').forEach(e => { e.disabled = true; });
    }
    if (st.open && st.pick) { dlg.innerHTML = pickerBody(st); if (!dlg.open) dlg.showModal(); dlg.querySelector("[data-search]")?.focus(); }
    else if (dlg.open) dlg.close();
    clearTimeout(saving); saving = setTimeout(persist, 300);
  };
  // The address and the saved build are written once the clicks or the drag stop (and as the page closes): browsers limit
  // how often a page may change its address (Safari throws past 100 in 30 seconds), and a fast run of clicks passes that.
  let saving = 0, leavingForCopy = false;
  const persist = () => {
    if (leavingForCopy) return;
    clearTimeout(saving);
    const address = qs.get("share") && viewing() ? `?share=${encodeURIComponent(qs.get("share"))}` : `?b=${now()}`;
    try { viewing() ? sessionStorage.setItem("loth-viewed", shared) : sessionStorage.removeItem("loth-viewed"); } catch {}
    if (!viewing()) {
      if (forkOf) store("loth-forks", Object.fromEntries([[now(), forkOf], ...Object.entries(stored("loth-forks", {}))].slice(0, 50)));
      try { localStorage.setItem("loth-build", now()); localStorage.setItem("loth-gear", JSON.stringify(gearKinds(st))); } catch {}
    }
    try { history.replaceState(null, "", address + (readonly() ? `&v=${view}` : "") + (wearView ? "#wear" : st.s ? "#s=" + st.s : "")); }
    catch { $("#sharebox").textContent = "The browser could not update this address. Use Share build to save a link."; }
  };
  addEventListener("pagehide", persist);
  const now = () => packBuild(st, mine());
  // Reading a shared build includes sliding its level: only a change to the build itself forks it
  const viewing = () => shared && packBuild({...st, l: sharedL}, mine()) === shared;
  const pinned = () => stored("loth-pins", []).some(p => p.b === now());
  const label = () => { const top = mine().filter(s => st.p[s.s]).sort((a, b) => st.p[b.s] - st.p[a.s])[0]; return st.n || `${st.c} ${st.l}${top ? " · " + top.n : ""}`; };
  const lineage = () => viewing() ? `<p class="fork">Editing this shared build creates your own version and link; the original stays unchanged.</p>`
    : forkOf ? `<p class="fork">Your version of <a href="?b=${esc(forkOf)}">a shared build</a>. Every change gives it a new link; pin the ones you want to keep.</p>` : "";
  const releaseBar = () => `<div class="bar plan"><span>Release: <b>${esc(W.build || "Unreleased")}</b>${st.r ? " · saved values" : ""}</span>
    <label>Copy to release <select id="release-target"><option value="choose">Choose a release…</option><option value="">Current · ${esc(live.wiki.build || "Unreleased")}</option>
    ${releases.filter(r => r.id !== st.r).map(r => `<option value="${r.id}">${esc(r.build)}</option>`).join("")}</select></label></div>
    ${BuildFormat.warnings(BuildFormat.decode(now()), {wiki: W, affixes: AFX}).map(n => `<p class="tlwarn">${esc(n)}</p>`).join("")}
    ${legal(st, st.o, false).length < st.o.length ? '<p class="tlwarn">Some saved skill points are unavailable at their planned levels in this release. They have been kept; review their order before sharing.</p>' : ""}`;
  const releaseDlg = document.querySelector("#releasedlg") || document.body.appendChild(Object.assign(document.createElement("dialog"), {id: "releasedlg", className: "pickdlg"}));
  const openMigration = async id => {
    releaseDlg.innerHTML = '<div class="panel"><h2 id="release-title">Copy build to another release</h2><p role="status">Loading release…</p><button class="pill" data-cancelcopy>Cancel</button></div>';
    releaseDlg.setAttribute("aria-labelledby", "release-title"); releaseDlg.showModal();
    try {
      const data = id ? await buildJSON(ROOT + "api/releases/" + id) : live;
      const raw = BuildFormat.decode(now()), result = BuildFormat.migrate(raw, {wiki: W, affixes: AFX}, data, id), notes = result.notes;
      migration = {data, build: BuildFormat.encode(result.build), source: now()};
      releaseDlg.innerHTML = `<div class="panel"><h2 id="release-title">Copy to ${esc(data.wiki.build || "Unreleased")}</h2>
        <p>The original build stays on ${esc(W.build || "its release")}. This copy keeps every planned level, gear set and choice, and uses the selected release’s values.</p>
        ${notes.length ? `<ul>${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : '<p>No changed choices were found in this build.</p>'}
        ${result.blocked.length ? `<p>This release cannot keep these choices. Choose another release or resolve them before copying:</p><ul>${result.blocked.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
        <p role="alert" id="copyerror"></p><button class="pill" data-createcopy${result.blocked.length ? " disabled" : ""}>Create copy</button> <button class="pill" data-cancelcopy>Keep original</button></div>`;
      releaseDlg.querySelector(result.blocked.length ? "[data-cancelcopy]" : "[data-createcopy]").focus();
    } catch (error) { releaseDlg.innerHTML = `<div class="panel"><h2 id="release-title">Release unavailable</h2><p role="alert">${esc(error.message)}</p><button class="pill" data-cancelcopy>Keep original</button></div>`; }
  };
  releaseDlg.onclick = async e => {
    if (e.target.closest("[data-cancelcopy]") || e.target === releaseDlg) { releaseDlg.close(); return; }
    const button = e.target.closest("[data-createcopy]"); if (!button) return;
    button.disabled = true; button.textContent = "Saving copy…";
    try {
      const saved = await buildJSON(ROOT + "api/b", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({build: migration.build, expected: BuildFormat.fingerprint(migration.data)})});
      store("loth-forks", {...stored("loth-forks", {}), [saved.build]: migration.source});
      leavingForCopy = true; clearTimeout(saving);
      try { localStorage.setItem("loth-build", saved.build); } catch {}
      location.assign(saved.url);
    } catch (error) { $("#copyerror").textContent = error.message; button.disabled = false; button.textContent = "Create copy"; }
  };
  const pinList = () => { const pins = stored("loth-pins", []); return pins.length ? `<div class="pins"><b>Pinned</b>${pins.map(p => `<span class="pinb${p.b === now() ? " on" : ""}"><a href="?b=${esc(p.b)}">${esc(p.n)}</a><button data-unpin="${esc(p.b)}" aria-label="Unpin ${esc(p.n)}">✕</button></span>`).join("")}</div>` : ""; };
  // The picker lives outside #main so a redraw of the page leaves it standing; Escape or a click outside closes it.
  const dlg = document.querySelector("#pickdlg") || document.body.appendChild(Object.assign(document.createElement("dialog"), {id: "pickdlg", className: "pickdlg"}));
  dlg.addEventListener("close", () => { if (st.open) { st.open = false; st.rw = st.sock = null; st.affix = false; draw(); } });
  const onClick = e => {
    const mode = e.target.closest("[data-view]");
    if (mode) {
      if (mode.dataset.view === "edit") { forkOf = shared; shared = null; fresh = false; }
      view = mode.dataset.view; $("#main").innerHTML = ""; draw(); return;
    }
    if (readonly()) {
      const t = e.target.closest("button,a[data-pick]");
      if (t?.dataset.tlgo || t?.dataset.tlstep) { toLevel(t.dataset.tlgo ? +t.dataset.tlgo : st.l + +t.dataset.tlstep); draw(); }
      else if (t?.dataset.t) { st.t = +t.dataset.t; draw(); }
      else if (t?.dataset.steptab) { st.tab = t.dataset.steptab === "gear" ? "gear" : "build"; draw(); }
      else if (t?.dataset.s || t?.dataset.pick) { e.preventDefault(); st.s = t.dataset.s || t.dataset.pick; st.t = 3 - by(st.s).page; draw(); }
      return;
    }
    if (e.target === dlg) { st.open = false; st.rw = st.sock = null; st.affix = false; draw(); return; }  // the backdrop
    const sk = e.target.closest("[data-sk]");  // a socket square, or a socket on the item in its slot: open the socket picker there
    if (sk) {
      const slot = sk.closest(".islot");
      if (slot) { st.who = slot.dataset.who; st.pick = slot.dataset.slot; }
      st.sock = +sk.dataset.sk; st.search = ""; st.open = true; draw(); return;
    }
    const t = e.target.closest("button,a[data-pick],.bsk");
    if (!t || t.closest(".combo")) return;  // a dropdown (Quests, Remnants) opens and picks itself (app.js combos); a redraw here would close it
    const g = st.pick && wearing(st)[st.pick];
    if (t.dataset.close) { st.open = false; st.rw = st.sock = null; st.affix = false; }
    else if (t.dataset.fill != null) {  // fill this socket, then move on to the next empty one; none left closes the picker
      const s = socketsOf(itemOf(g), g, st.pick);
      g.so = Array.from({length: Math.max(s.max, g.so?.length || 0)}, (_, k) => g.so?.[k] || null);
      g.so[st.sock] = t.dataset.fill || null;
      const next = g.so.findIndex((x, k) => k < s.n && !x);
      if (!t.dataset.fill || next < 0) { st.open = false; st.sock = null; } else st.sock = next;
      st.search = "";
    }
    else if (t.dataset.affixes) { st.affix = true; st.afk = st.afk || "p"; st.search = ""; st.open = true; }
    else if (t.dataset.rename) g.rn = (g.rn || 0) + 1;
    else if (t.dataset.perfect) { const it = itemOf(g, true); g.v = Object.fromEntries((it.l || []).map((l, i) => [i, rollOf(it.lp?.[i])]).filter(x => x[1]).map(([i, m]) => [i, m[1]])); }
    else if (t.dataset.ad) setStat(t.dataset.ad, (st.pt[t.dataset.ad] || 0) + +t.dataset.n);
    else if (t.dataset.afk) { st.afk = t.dataset.afk; st.search = ""; }
    else if (t.dataset.unaffix) { g.a = g.a.filter(id => id !== t.dataset.unaffix); g.v = undefined; }
    else if (t.dataset.affix) {  // take it off, or put it on if nothing bars it
      const list = (g.a || []).map(id => AFX.by[id]), a = AFX.by[t.dataset.affix];
      if (g.a?.includes(a.id)) g.a = g.a.filter(id => id !== a.id); else if (!affixBar(a, list, most(st))) g.a = [...(g.a || []), a.id];
      g.v = undefined;  // the lines moved
    }
    else if (t.dataset.socktab) { st.sockTab = t.dataset.socktab; st.search = ""; }
    else if (t.dataset.nsock) { g.n = +t.dataset.nsock; g.so = (g.so || []).slice(0, g.n); }
    else if (t.dataset.addsock) g.n = socketsOf(itemOf(g), g, st.pick).n + 1;
    else if (t.dataset.makerw) { wearing(st)[st.pick] = {s: t.dataset.makerw, eth: g.eth, so: [], b: BY[g.s].base.code}; addRecent(t.dataset.makerw, st.pick, st.who, BY[g.s].base.code); }
    else if (t.dataset.open) st.open = true;
    else if (t.dataset.sort) st.so = +t.dataset.sort;
    else if (t.dataset.mt || t.dataset.mv) {  // a new merc type or variant drops what he can't hold
      st.mc = null;
      if (t.dataset.mt) { st.mt = +t.dataset.mt; st.mv = 0; } else st.mv = +t.dataset.mv;
      for (const [k, x] of Object.entries(st.m)) { const it = BY[x.s];
        if (!(it?.q === "rw" ? rwBases(it, k, st, "m").includes(x.b) : it && itemFits(st, "m", k, it))) delete st.m[k]; }
    }
    else if (t.dataset.unrecent) { const r = recent(); r.splice(+t.dataset.unrecent, 1); remember(r); }
    else if (t.dataset.recent) {
      const [s, slot, who, b] = recent()[+t.dataset.recent], it = BY[s];
      if (slot !== "charm" && !(it.q === "rw" ? !b || rwBases(it, slot, st, who).includes(b) : itemFits(st, who, slot, it))) return;  // not for this class or merc: its tooltip says why
      if (slot === "charm") { const spot = !st.ch.some(c => c[0] === s) && charmSpot(st, it.ch || 1); if (spot) { st.ch.push([s, ...spot]); st.who = "c"; st.pick = "charm"; st.at = st.ch.length - 1; } }
      else if (it.q === "rw" && !b) { st.who = who; st.pick = slot; st.pickTab = "rw"; st.rw = s; st.open = true; }  // which base: ask
      else { (who === "m" ? st.m : st.g)[slot] = {s, eth: false, so: [], b}; st.who = who; st.pick = slot; }
      addRecent(s, slot, who, b);
    }
    else if (t.dataset.swap) { st.sw = +t.dataset.swap; if (/^(weapon|offhand)2?$/.test(st.pick || "") && st.who === "p") st.pick = arm(st.pick.replace(/2$/, ""), st.sw); }
    else if (t.dataset.cell) { st.who = "c"; st.pick = "charm"; st.at = -1; st.cellAt = t.dataset.cell.split(",").map(Number); st.search = ""; st.open = true; }
    else if (t.dataset.charm) { st.who = "c"; st.pick = "charm"; st.at = +t.dataset.charm; st.search = ""; }
    else if (t.dataset.uncharm) { st.ch.splice(+t.dataset.uncharm, 1); st.pick = null; }
    else if (t.dataset.slot) { st.who = t.dataset.who; st.pick = t.dataset.slot; st.search = ""; st.rw = st.sock = null; st.affix = false; st.open = !wearing(st)[st.pick]; }  // an empty slot opens the picker
    else if (t.dataset.pickitem && st.pick === "charm") {
      const it = BY[t.dataset.pickitem], spot = charmSpot(st, it.ch || 1, st.cellAt);
      if (!spot) alert("No room for that charm in the bag.");
      else if (it.q === "base") { st.ch.push([it.s, ...spot, {s: it.s, a: []}]); st.at = st.ch.length - 1; st.affix = true; st.afk = "p"; st.search = ""; }  // a made charm: on to its affixes
      else { st.ch.push([it.s, ...spot]); st.at = st.ch.length - 1; addRecent(it.s, "charm", "c"); st.open = false; }
    }
    else if (t.dataset.pickitem) { if (st.pick) { const it = BY[t.dataset.pickitem];
      if (it.q === "rw") st.rw = it.s;  // on to its base
      else if (st.pickTab === "rare") { wearing(st)[st.pick] = {s: it.s, eth: false, so: [], a: []}; st.affix = true; st.afk = "p"; st.search = ""; }  // on to its affixes
      else { wearing(st)[st.pick] = {s: it.s, eth: false, so: []}; addRecent(it.s, st.pick, st.who); st.open = false; } } }
    else if (t.dataset.pickbase) { const g = wearing(st)[st.pick];
      wearing(st)[st.pick] = {s: st.rw, eth: g?.s === st.rw && g.eth, so: [], b: t.dataset.pickbase}; addRecent(st.rw, st.pick, st.who, t.dataset.pickbase); st.rw = null; st.open = false; }
    else if (t.dataset.unrw) st.rw = null;
    else if (t.dataset.rebase) { st.pickTab = "rw"; st.rw = t.dataset.rebase; st.open = true; }
    else if (t.dataset.clear) { delete wearing(st)[t.dataset.clear]; }
    else if (t.dataset.picktab) { st[st.pick === "charm" ? "chTab" : "pickTab"] = t.dataset.picktab; st.rw = null; }
    else if (t.dataset.steptab) { st.tab = t.dataset.steptab === "gear" ? "gear" : "build"; }
    else if (t.dataset.c) { if (t.dataset.c === st.c || !backup()) return; st.c = t.dataset.c; st.n = ""; st.o = []; st.a = []; st.note = ""; st.l = 1; st.k = [{l: 1}]; showStage(st); st.s = ""; st.t = 0; }
    else if (t.dataset.t) st.t = +t.dataset.t;
    else if (t.dataset.pick) { e.preventDefault(); st.s = t.dataset.pick; st.t = 3 - by(st.s).page; }
    else if (t.id === "reset") { if (!backup()) return; st.n = ""; st.o = []; st.a = []; st.note = ""; st.l = 1; st.k = [{l: 1}]; showStage(st); }
    else if (t.dataset.restore) {
      const saved = stored("loth-restore", null); if (!saved) return;
      leavingForCopy = true; clearTimeout(saving);
      try { localStorage.setItem("loth-build", saved); localStorage.removeItem("loth-restore"); } catch {}
      location.assign(U.page("builds") + "?b=" + encodeURIComponent(saved)); return;
    }
    else if (t.dataset.dismissrestore) { try { localStorage.removeItem("loth-restore"); } catch {} }
    else if (t.id === "pin") { const pins = stored("loth-pins", []); store("loth-pins", pinned() ? pins.filter(p => p.b !== now()) : [{b: now(), n: label()}, ...pins].slice(0, 24)); }
    else if (t.dataset.unpin) store("loth-pins", stored("loth-pins", []).filter(p => p.b !== t.dataset.unpin));
    else if (t.id === "share") {
      t.disabled = true; t.textContent = "Saving build…";
      const source = now();
      buildJSON(ROOT + "api/b", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({build: source, expected: BuildFormat.fingerprint(live)})})
        .then(saved => {
          navigator.clipboard?.writeText(saved.url).catch(() => {});
          $("#sharebox").innerHTML = `<div class="share"><label>Saved build link <input readonly value="${esc(saved.url)}" onfocus="this.select()"></label><small>This link keeps this build and its release values.</small></div>`;
          $("#sharebox input").focus();
        }).catch(error => {  // no link service (the public site, an offline copy): the full link carries the whole build
          persist();
          $("#sharebox").innerHTML = `<div class="share"><label>Build link <input readonly value="${esc(location.href.split("#")[0])}" onfocus="this.select()"></label><small>${esc(error.message)} This full link still carries the whole build.</small></div>`;
          $("#sharebox input").focus(); })
        .finally(() => { const button = $("#share"); if (button) { button.disabled = false; button.textContent = "Share build"; } });
      return;
    }
    else if (t.dataset.tlstep) toLevel(st.l + +t.dataset.tlstep);
    else if (t.dataset.tlgo) { toLevel(+t.dataset.tlgo); if (t.dataset.tls) { st.s = t.dataset.tls; st.t = 3 - by(st.s).page; } }
    else if (t.dataset.tlnew) {
      if (t.dataset.tlnew === "respec") {
        if (!backup()) return;
        const end = respecEnd(st);
        st.o = st.o.filter(e => e[1] < st.l || e[1] >= end); st.a = st.a.filter(e => e[1] < st.l || e[1] >= end);
      }
      keepStage(st);
      if (st.k[st.ki].l === st.l) st.k[st.ki].kind = t.dataset.tlnew;
      else st.k.push({...structuredClone(st.k[st.ki]), l: st.l, kind: t.dataset.tlnew});
      st.k.sort((a, b) => a.l - b.l); showStage(st);
    }
    else if (t.dataset.tldel) {
      if (!backup()) return;
      if (st.k[st.ki].kind === "respec") { const end = respecEnd(st, st.k[st.ki].l); st.o = st.o.filter(e => e[1] < st.k[st.ki].l || e[1] >= end); st.a = st.a.filter(e => e[1] < st.k[st.ki].l || e[1] >= end); }
      st.k.splice(st.ki, 1); showStage(st);
    }
    else if (t.dataset.d) add(by(t.dataset.s), +t.dataset.d);
    else if (t.classList.contains("ticon")) add(by(t.dataset.s), 1);
    else if (t.dataset.s) { st.s = t.dataset.s; st.t = 3 - by(st.s).page; }
    if (["pickitem", "pickbase", "recent", "affix", "fill", "makerw"].some(k => t.dataset[k])) reachGear();  // what raises an item's required level
    if (wearView) st.open = !!(st.rw || st.affix || st.sock != null);  // the list beside the doll stands in for the picker, but a runeword still asks for its base
    draw();
  };
  $("#main").addEventListener("click", onClick);
  dlg.onclick = onClick;
  dlg.oninput = e => { if (e.target.matches("[data-search]")) { st.search = e.target.value; const l = dlg.querySelector(".plist"); if (l) l.innerHTML = st.affix ? affixList(st) : st.sock != null ? sockGrid(st) : pickerList(st); } };
  $("#main").addEventListener("change", e => {
    if (e.target.id === "release-target") { if (e.target.value !== "choose") openMigration(e.target.value); e.target.value = "choose"; return; }
    if (readonly() && !["lvl", "tl"].includes(e.target.id)) return;
    if (e.target.id === "lvl" || e.target.id === "tl") toLevel(+e.target.value || 1);
    if (e.target.id === "q") st.q = +e.target.value;
    if (e.target.id === "e") st.e = +e.target.value;
    if (e.target.id === "build-name") st.n = e.target.value.trim();
    if (e.target.id === "merc-level") st.ml = Math.max(1, Math.min(st.l, Math.floor(+e.target.value) || 1));
    if (e.target.dataset.roll) { const g = wearing(st)[st.pick]; g.v = {...g.v, [e.target.dataset.roll]: +e.target.value}; }
    if (e.target.dataset.attr) setStat(e.target.dataset.attr, Math.floor(+e.target.value) || 0);
    if (e.target.dataset.eth) { const g = wearing(st)[e.target.dataset.eth]; if (g) g.eth = e.target.checked; }
    draw();
  });
  let frame = 0;
  $("#main").addEventListener("input", e => {
    if (e.target.id === "tl") { toLevel(+e.target.value); cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); }  // the build follows the slider as it moves
    if (e.target.dataset.roll) e.target.nextElementSibling.textContent = e.target.value;  // the number follows the slider; the change commits it
    if (e.target.matches("[data-search]")) { st.search = e.target.value; const l = $("#main .plist"); if (l) l.innerHTML = pickerList(st); }  // (the picker's search: dlg.oninput)
  });
  const skillTip = e => {
    const a = e.target.closest("[data-svsk]"), box = $("#hover"); if (!a || !box) return;
    box.innerHTML = `<div class="tip sv-skill-tip">${detail(by(a.dataset.svsk))}</div>`;
    box.querySelectorAll("button").forEach(b => b.remove());
    box.querySelectorAll("a").forEach(b => { b.tabIndex = -1; });
    box.setAttribute("role", "tooltip"); a.setAttribute("aria-describedby", "hover");
    box.style.display = "block";
    if (box.matches(":popover-open")) box.hidePopover();
    box.showPopover();
    const r = a.getBoundingClientRect();
    box.style.left = `${Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, r.right + 8))}px`;
    box.style.top = `${Math.max(8, Math.min(innerHeight - box.offsetHeight - 8, r.top))}px`;
  };
  const hideSkillTip = e => {
    if (!e.target.closest("[data-svsk]") || e.target.closest("[data-svsk]").contains(e.relatedTarget)) return;
    const box = $("#hover"); if (box) { box.style.display = "none"; if (box.matches(":popover-open")) box.hidePopover(); }
  };
  $("#main").addEventListener("mouseover", skillTip);
  $("#main").addEventListener("focusin", skillTip);
  $("#main").addEventListener("click", skillTip);
  $("#main").addEventListener("mouseout", hideSkillTip);
  $("#main").addEventListener("focusout", hideSkillTip);
  draw();
  buildJSON(ROOT + "api/releases").then(data => { releases = data; draw(); }).catch(() => {});
};
