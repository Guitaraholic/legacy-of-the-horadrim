(() => {
  const guide = document.querySelector('[data-affix-guide]');
  if (!guide) return;
  const root = document.documentElement.dataset.root || '';
  const field = name => guide.querySelector(`[data-ag="${name}"]`);
  const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const status = guide.querySelector('[data-ag-status]');
  const results = guide.querySelector('[data-affix-results]');
  const range = (lo, hi) => lo === hi ? String(lo) : `${lo}–${hi}`;
  const affixLevel = (ilvl, qlvl, magic) => {
    const level = Math.max(Math.min(ilvl, 99), qlvl);
    return Math.min(99, magic ? level + magic : level < 99 - Math.floor(qlvl / 2) ? level - Math.floor(qlvl / 2) : level * 2 - 99);
  };
  fetch(root + 'data/affix-guide.json').then(r => {
    if (!r.ok) throw new Error('Affix data unavailable');
    return r.json();
  }).then(data => {
    const params = new URLSearchParams(location.search);
    const type = params.get('type') || Object.keys(data.types).find(c => data.types[c].n === params.get('typeName') || data.types[c].slot === params.get('typeName')) || 'ring';
    if (data.types[type]) field('type').value = type;
    for (const name of ['quality', 'ilvl', 'q']) {
      if (params.has(name)) field(name).value = params.get(name);
    }
    field('family').insertAdjacentHTML('beforeend', [...new Set(data.affixes.map(a => a.family))].sort().map(f => `<option>${esc(f)}</option>`).join(''));
    field('family').value = params.get('family') || '';
    const pickBase = preferred => {
      const t = data.types[field('type').value];
      field('base').innerHTML = t.bases.map(([code, name]) => `<option value="${esc(code)}">${esc(name)}</option>`).join('');
      if (t.bases.some(b => b[0] === preferred)) field('base').value = preferred;
      field('quality').querySelector('[value="rare"]').disabled = !t.rare;
      if (!t.rare) field('quality').value = 'magic';
    };
    pickBase(params.get('base'));
    let limit = 100;
    const draw = (more = false) => {
      if (!more) limit = 100;
      const t = data.types[field('type').value], base = t.bases.find(b => b[0] === field('base').value);
      const ilvl = field('ilvl').value, words = field('q').value.toLowerCase().split(/\s+/).filter(Boolean);
      const chain = new Set(t.up), rows = [];
      for (const a of data.affixes) {
        if (!a.it.some(c => chain.has(c)) || a.et.some(c => chain.has(c)) || field('quality').value === 'rare' && !a.rare
            || field('family').value && a.family !== field('family').value
            || !words.every(w => [a.n, ...a.lines, a.group, a.family].join(' ').toLowerCase().includes(w))) continue;
        const levels = [];
        for (let i = 1; i <= 99; i++) {
          const level = affixLevel(i, base[2], base[3]);
          if (level >= a.level && (!a.maxLevel || level <= a.maxLevel)) levels.push(i);
        }
        if (!levels.length || ilvl && !levels.includes(Number(ilvl))) continue;
        rows.push({...a, itemLevels: range(levels[0], levels.at(-1))});
      }
      rows.sort((a, b) => a.family.localeCompare(b.family) || a.kind.localeCompare(b.kind) || (a.group || 0) - (b.group || 0) || a.level - b.level || a.n.localeCompare(b.n));
      guide.querySelector('[data-ag-base]').textContent = `${t.n} · ${t.slot || 'Inventory'} · ${base[1]} · Base quality level ${base[2]}${base[3] ? ` · Magic level ${base[3]}` : ''}${ilvl ? ` · Affix level ${affixLevel(Number(ilvl), base[2], base[3])}` : ''}`;
      status.textContent = `${rows.length} eligible affixes${ilvl ? ` at item level ${ilvl}` : ''} · ${field('quality').value === 'rare' ? 'Rare' : 'Magic'} · ${base[1]}`;
      const groups = Map.groupBy(rows.slice(0, limit), a => a.family);
      guide.querySelector('[data-ag-more]').hidden = rows.length <= limit;
      results.innerHTML = rows.length ? [...groups].map(([family, affixes]) => `<section><h2 class="sect">${esc(family)}</h2><div class="ag-scroll"><table class="fixed-order ag-matrix"><caption>${esc(base[1])} · ${esc(family)}</caption><thead><tr><th scope="col">Affix / group</th><th scope="col">Stat range</th><th scope="col">Item levels</th><th scope="col">Affix levels</th><th scope="col">Required level</th></tr></thead><tbody>${affixes.map(a => `<tr data-affix="${esc(a.id)}"><th scope="row">${esc(a.n)} <span class="tag${a.origin === 'loth' ? ' loth' : ''}">${a.origin === 'loth' ? 'LotH' : 'D2'}</span><small>${a.kind === 'p' ? 'Prefix' : 'Suffix'} · Group ${esc(a.group ?? 'none')} · ${a.rare ? 'Magic / rare' : 'Magic only'}</small></th><td>${a.lines.map(esc).join('<br>')}</td><td>${a.itemLevels}</td><td>${a.maxLevel ? range(a.level, a.maxLevel) : `${a.level}+`}</td><td>${a.required}${a.classLevel ? `<small>${esc(a.class)}: ${a.classLevel}</small>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`).join('') : '<p class="empty">No affixes match these filters. Try another item level, quality or stat family.</p>';
      const url = new URL(location.href);
      url.search = '';
      for (const name of ['type', 'base', 'quality', 'ilvl', 'family', 'q']) if (field(name).value) url.searchParams.set(name, field(name).value);
      history.replaceState(null, '', url);
    };
    guide.addEventListener('input', e => {
      if (!e.target.matches('[data-ag]')) return;
      if (e.target.dataset.ag === 'type') pickBase();
      draw();
    });
    guide.querySelector('[data-ag-more]').onclick = () => { limit += 100; draw(true); };
    draw();
  }).catch(() => {
    status.textContent = 'Could not load the affix matrix. Reload the page to try again.';
  });
})();
