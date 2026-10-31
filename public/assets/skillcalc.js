// A skill's tooltip at any level, as the game's skill tree prints it, from the JSON tools/wiki/skillcalc.py exports.
// SkillCalc.lines(data, "Fire Bolt", 12, name => planner level) -> {fixed, current, next, synergy, notes}.
// Calcs follow the game: whole numbers, division truncates, damage in 256ths shifted by HitShift.
// Assumed: character stats read by stat() are 0 unless a passive skill grants them or opts.stats (gear, by stat name) does; masteries from weapon/class
// skills show only their own; summons use Normal difficulty; character level (ulvl) is opts.clvl or 90.
var SkillCalc = (() => {
  const PAIRS = { 12: [1, 2], 34: [3, 4], 56: [5, 6], 78: [7, 8], 91: [9, 10], 21: [11, 12], 43: [13, 14], 65: [15, 16], 87: [17, 18], 92: [19, 20] };
  const DMG = [8, 16, 22, 28, Infinity], LEN = [8, 16, Infinity];  // the per-level bracket ends: 2-8, 9-16, 17-22, 23-28, 29+
  const OPS = { "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => b ? Math.trunc(a / b) : 0,
    "<": (a, b) => +(a < b), ">": (a, b) => +(a > b), "<=": (a, b) => +(a <= b), ">=": (a, b) => +(a >= b), "==": (a, b) => +(a === b), "!=": (a, b) => +(a !== b) };
  const cache = new Map();
  const f = v => parseFloat(v) || 0;

  // An expression compiled to a function of a scope {code(name), ref(fn, name, path)}.
  function compile(src) {
    const t = String(src).match(/\d+(?:\.\d+)?|[A-Za-z_]\w*|'[^']*'|<=|>=|==|!=|[-+*/<>?:(),.]/g) || ["0"];
    let i = 0;
    const eat = x => t[i] === x && ++i;
    const bin = (next, ops) => () => {
      let l = next();
      while (ops.includes(t[i])) { const op = OPS[t[i++]], a = l, b = next(); l = s => op(a(s), b(s)); }
      return l;
    };
    const prim = () => {
      const x = t[i++];
      if (x === "(") { const e = cond(); eat(")"); return e; }
      if (x === "-") { const e = prim(); return s => -e(s); }
      if (x === "+") return prim();
      if (/^\d/.test(x)) { const n = Math.trunc(+x); return () => n; }
      if (!eat("(")) return s => s.code(x);
      if (t[i]?.[0] === "'") {
        const name = t[i++].slice(1, -1), path = [];
        while (eat(".")) path.push(t[i++]);
        eat(")");
        return s => s.ref(x.toLowerCase(), name, path);
      }
      const args = [cond()];
      while (eat(",")) args.push(cond());
      eat(")");
      const fn = x.toLowerCase() === "max" ? Math.max : Math.min;  // min, max; rand(a, b) shows its low end
      return s => fn(...args.map(a => a(s)));
    };
    const cmp = bin(bin(bin(prim, ["*", "/"]), ["+", "-"]), ["<", ">", "<=", ">=", "==", "!="]);
    const cond = () => {
      const c = cmp();
      if (!eat("?")) return c;
      const a = cond(); eat(":"); const b = cond();
      return s => c(s) ? a(s) : b(s);
    };
    return cond();
  }
  const run = (src, scope) => {
    if (src === undefined || src === "") return 0;
    if (!cache.has(src)) cache.set(src, compile(src));
    return cache.get(src)(scope);
  };

  // Raise only the increments at or above each boost's starting level; synergies stay fixed.
  function curve(at, L, boosts = []) {
    const v = at(L);
    return v + boosts.reduce((sum, b) => sum + (v - (b.fromSkillLevel <= 1 ? 0 : at(Math.min(L, b.fromSkillLevel - 1)))) * b.pct / 100, 0);
  }

  // A base column plus its per-level columns, each applying inside one bracket of levels; past the last it keeps going.
  function columns(row, base, per, ends, L) {
    let v = f(row[base]), from = 2;
    ends.forEach((to, k) => { const n = Math.min(L, to) - from + 1;
      if (n > 0) v += f(row[per + (k + 1)]) * n;
      from = to + 1; });
    return v;
  }

  function scope(ctx, name, L, missile) {
    const row = missile ? ctx.data._missiles[name] || {} : (ctx.find(name) || {}).row || {};
    const owner = missile || name;  // the skill whose level this scope runs at
    const self = {
      field: col => {
        if (ctx.depth > 40) return 0;
        ctx.depth++;
        try { return run(row[col], self); } finally { ctx.depth--; }
      },
      dmg(base, per, sym, mastery) {  // 256ths
        if (L <= 0) return 0;
        let v = Math.trunc(curve(lv => columns(row, base, per, DMG, lv), L, owner === ctx.damageSkill ? ctx.damageBoosts : []) * 2 ** f(row.HitShift));
        v += Math.trunc(v * self.field(sym) / 100);
        return mastery ? Math.trunc(v * (100 + self.stat(`passive_${row.EType}_mastery`)) / 100) : v;
      },
      len: () => { const v = Math.trunc(columns(row, "ELen", "ELevLen", LEN, L)); return v + Math.trunc(v * self.field("ELenSymPerCalc") / 100); },
      stat(stat) {
        let sum = ctx.stats[stat] || 0;
        for (const [sk, k] of ctx.data._passives[stat] || []) {
          const lv = sk === owner ? L : ctx.levelOf(sk);
          if (lv > 0) sum += scope(ctx, sk, lv).field("passivecalc" + k);
        }
        return sum;
      },
      ref(fn, target, path) {
        if (fn === "stat") {
          if (!ctx.data._passives[target] && !(target in ctx.stats)) ctx.notes.add(`stat('${target}') is taken as 0`);
          return self.stat(target);
        }
        if (fn === "miss") return scope(ctx, target, L, owner).code(path[0]);
        const sk = ctx.find(target);
        if (!sk) { ctx.notes.add(`unknown skill '${target}'`); return 0; }
        if (fn === "sklvl") {
          const lv = /^\d+$/.test(path[0]) ? +path[0] : self.code(path[0]);
          return lv > 0 ? scope(ctx, sk.key, lv).code(path[1]) : 0;
        }
        const lv = sk.key === owner ? L : ctx.levelOf(sk.key);  // skill() and sksrc()
        if (path[0] === "lvl" || path[0] === "blvl") return lv;
        return lv > 0 ? scope(ctx, sk.key, lv).code(path[0]) : 0;
      },
      code(c) {
        if (c === "lvl" || c === "blvl") return L;
        let m = /^(ln|dm)(\d\d)$/.exec(c);
        if (m && PAIRS[m[2]]) {
          const a = self.code("par" + PAIRS[m[2]][0]), b = self.code("par" + PAIRS[m[2]][1]);
          return m[1] === "ln" ? a + (L - 1) * b : Math.trunc(Math.trunc(110 * L / (L + 6)) * (b - a) / 100) + a;
        }
        if ((m = /^par?(\d+)$/.exec(c))) return Math.trunc(f(row["Param" + m[1]]));
        if (missile) {
          const M = { rang: () => self.field("Range"), rad: () => self.field("Radius"),
            edmn: () => self.dmg("EMin", "MinELev", "EDmgSymPerCalc") >> 8, edmx: () => self.dmg("EMax", "MaxELev", "EDmgSymPerCalc") >> 8,
            edns: () => self.dmg("EMin", "MinELev", "EDmgSymPerCalc"), edxs: () => self.dmg("EMax", "MaxELev", "EDmgSymPerCalc"),
            damn: () => self.dmg("MinDamage", "MinLevDam", "DmgSymPerCalc") >> 8, damx: () => self.dmg("MaxDamage", "MaxLevDam", "DmgSymPerCalc") >> 8,
            edln: () => Math.trunc(columns(row, "ELen", "ELevLen", LEN, L)) };
          if (M[c]) return M[c]();
        } else {
          if ((m = /^m([123])(en|ex|el|rn|eo|ey|nm|xm)$/.exec(c))) {
            const ms = (ctx.find(name).miss || [])[m[1] - 1];
            const code = { en: "edmn", nm: "edmn", ex: "edmx", xm: "edmx", el: "edln", rn: "rang", eo: "edns", ey: "edxs" }[m[2]];
            return ms ? scope(ctx, ms, L, owner).code(code) : 0;
          }
          if ((m = /^(?:clc(\d)|ast(\d)|pst(\d)|ps(1\d))$/.exec(c)))
            return self.field(m[1] ? "calc" + (m[1] === "0" ? 10 : m[1]) : m[2] ? "aurastatcalc" + m[2] : "passivecalc" + (m[3] || m[4]));
          const usmc = () => L <= 0 ? 0 : Math.max(Math.trunc((f(row.mana) + f(row.lvlmana) * (L - 1)) * 2 ** f(row.manashift)), Math.trunc(f(row.minmana) * 256));
          const S = { usmc, mana: () => usmc() >> 8, mps: () => usmc() * 25 >> 8, ulvl: () => ctx.clvl,
            edmn: () => self.dmg("EMin", "EMinLev", "EDmgSymPerCalc") >> 8, edmx: () => self.dmg("EMax", "EMaxLev", "EDmgSymPerCalc") >> 8,
            edns: () => self.dmg("EMin", "EMinLev", "EDmgSymPerCalc"), edxs: () => self.dmg("EMax", "EMaxLev", "EDmgSymPerCalc"),
            enma: () => self.dmg("EMin", "EMinLev", "EDmgSymPerCalc", 1) >> 8, exma: () => self.dmg("EMax", "EMaxLev", "EDmgSymPerCalc", 1) >> 8,
            enms: () => self.dmg("EMin", "EMinLev", "EDmgSymPerCalc", 1), exms: () => self.dmg("EMax", "EMaxLev", "EDmgSymPerCalc", 1),
            edln: self.len, edma: self.len,
            pnma: () => self.dmg("MinDam", "MinLevDam", "DmgSymPerCalc") >> 8, pxma: () => self.dmg("MaxDam", "MaxLevDam", "DmgSymPerCalc") >> 8,
            pnms: () => self.dmg("MinDam", "MinLevDam", "DmgSymPerCalc"), pxms: () => self.dmg("MaxDam", "MaxLevDam", "DmgSymPerCalc"),
            toht: () => row.ToHitCalc ? self.field("ToHitCalc") : Math.trunc(f(row.ToHit) + f(row.LevToHit) * (L - 1)),
            mael: () => self.stat(`passive_${row.EType}_mastery`),
            // a weapon mastery's own tooltip shows the passive stat it grants
            math: () => self.bonus(/mastery_.*_th$/), madm: () => self.bonus(/mastery_.*_dmg$/), macr: () => self.bonus(/mastery_.*_crit$/),
            mapi: () => self.bonus(/^skill_pierce$/), manc: () => self.bonus(/noconsume$/), mair: () => self.bonus(/req_percent$/),
            len: () => self.field("auralencalc"), rng: () => self.field("aurarangecalc"), pets: () => self.field("petmax"), skpt: () => self.field("skpoints") };
          if (S[c]) return S[c]();
        }
        ctx.notes.add(`${c} is taken as 0`);
        return 0;
      },
      // A summon's numbers: its monster's Normal-difficulty damage plus the flat and percent damage this skill gives it.
      bonus(want) {
        let v = 0;
        for (const [k, stat] of Object.entries(row)) {
          const m = /^(aura|passive)stat(\d+)$/.exec(k);
          if (m && (want.test ? want.test(stat) : stat === want)) v += self.field((m[1] === "aura" ? "aurastatcalc" : "passivecalc") + m[2]);
        }
        return v;
      },
    };
    return self;
  }

  // printf as the tooltip strings use it: %d %+d %s %%. Fractions show to one decimal, rounded down, as the game does.
  const show = v => typeof v === "number" ? String(Math.trunc(v * 10) / 10) : v;
  const fmt = (s, vals) => { let k = 0; return s.replace(/%(\+?)\d*([dis%])/g, (_, plus, c) => {
    if (c === "%") return "%";
    const v = vals[k++];
    return v === undefined ? "?" : (plus && typeof v === "number" && v >= 0 ? "+" : "") + show(v);
  }); };

  function line(ctx, e, sc, [fn, a, b, ca, cb], L) {
    const A = () => fn === 74 && /Damage: \+?%\+?d%%$/.test(a) && ctx.damageBoosts.length
      ? Math.trunc(curve(lv => run(ca, scope(ctx, e.key, lv)), L, ctx.damageBoosts)) : run(ca, sc), B = () => run(cb, sc);
    const ratio = () => A() / (cb ? B() || 1 : 1);
    const plural = v => fmt(v === 1 || !b ? a : b, [v]);
    switch (fn) {
      case 13: { const hp = e.mon ? (e.mon.hp[0] + e.mon.hp[1]) / 2 : 0;
        return fmt(a, [Math.trunc(hp * (100 + A()) / 100) + B()]); }
      case 34: { if (!e.mon) return fmt(a, []);
        const flat = sc.bonus("item_normaldamage"), pct = 100 + sc.bonus("damagepercent");
        return fmt(a, e.mon.dmg.map(d => Math.trunc((d + flat) * pct / 100))); }
      case 18: return a;
      case 31: ctx.notes.add("curse durations are Normal difficulty's"); return plural(ratio());
      case 36: return plural(ratio());
      case 40: case 78: return fmt(a, [b]);
      case 41: case 75: return fmt(a, [A(), B()]);
      case 74: return fmt(a, [A()]);
      case 76: return fmt(a, [b, A()]);
      case 77: return fmt(a, [b, A(), B()]);
      case 79: return fmt(a, [b, ratio()]);
    }
    ctx.notes.add(`descline ${fn} is shown with its values in order`);
    return fmt(a, [...(a.includes("%s") ? [b] : []), A(), B()]);
  }

  function lines(data, skillName, lvl, levelOf = () => 0, opts = {}) {
    if (!data._lower) Object.defineProperty(data, "_lower", { value: new Map(Object.keys(data).map(k => [k.toLowerCase(), k])) });
    const ctx = { data, levelOf, clvl: opts.clvl ?? 90, damageSkill: skillName, damageBoosts: opts.damageBoosts ?? [], stats: opts.stats ?? {}, depth: 0, notes: new Set(),
      find: n => { const k = data[n] ? n : data._lower.get(String(n).toLowerCase()); return k && k[0] !== "_" ? Object.assign({ key: k }, data[k]) : null; } };
    const e = ctx.find(skillName);
    if (!e || !e.desc) return { fixed: [], current: [], next: [], synergy: [], notes: [`no skill '${skillName}'`] };
    // desc and dsc2 lines print bottom-up (line 1, usually Mana Cost, is last); dsc3 prints top-down.
    const at = (group, L) => L > 0 ? [...(e[group] || [])].reverse().map(l => line(ctx, e, scope(ctx, e.key, L), l, L)) : [];
    const sc = scope(ctx, e.key, Math.max(lvl, 1));
    const bonuses = (e.dsc3 || []).filter(([fn]) => fn !== 40 && fn !== 78).map(l => ({
      name: l[0] === 18 ? l[1] : l[2], text: line(ctx, e, sc, l, Math.max(lvl, 1)),
      percent: l[1].includes("%%") ? run(l[3], sc) / (l[0] === 79 ? run(l[4], sc) || 1 : 1) : 0,
    }));
    const aura = Object.fromEntries([1, 2, 3, 4, 5, 6].filter(i => e.row["aurastat" + i]).map(i => [e.row["aurastat" + i], sc.field("aurastatcalc" + i)]));
    return { fixed: at("dsc2", Math.max(lvl, 1)), current: at("desc", lvl), next: at("desc", lvl + 1),
             synergy: (e.dsc3 || []).map(l => line(ctx, e, sc, l, Math.max(lvl, 1))), bonuses, aura,
             auraLines: [...e.desc].reverse().filter(l => !["rng*2", "usmc"].includes(l[3])).map(l => line(ctx, e, sc, l, Math.max(lvl, 1))), notes: [...ctx.notes] };
  }

  return { lines, compile };
})();
