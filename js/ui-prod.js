// Screens for production lines, research, doctrines and laws (tabs in the State drawer), and forts on the map.
(function () {
  'use strict';
  var Game = window.Game, War = window.War, Econ = window.Econ, UI = window.UI, MapView = window.MapView;
  var h = UI.h, num = UI.num;
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function redraw() { Game.save(); if (window.EconUI) window.EconUI.refresh(true); }
  function bar(v, cls) { var tr = h('div', 'bar-track'), f = h('div', 'bar-fill ' + (cls || '')); f.style.width = Math.round(Math.min(1, v) * 100) + '%'; tr.appendChild(f); return tr; }

  // ---------- production ----------
  function productionTab(body, tag, mine) {
    var n = Econ.N[tag], total = War.milFactories(tag), used = War.assignedFactories(tag), lines = War.lines[tag] || [];
    var hero = h('div', 'hero');
    var a = h('div'); a.appendChild(h('div', 'p-kicker', 'Military factories')); a.appendChild(h('div', 'big', String(total)));
    var b = h('div'); b.appendChild(h('div', 'p-kicker', 'Idle')); b.appendChild(h('div', 'big' + (total - used > 0 ? ' neg' : ''), String(total - used)));
    hero.appendChild(a); hero.appendChild(b); body.appendChild(hero);
    body.appendChild(h('p', 'note', 'Each Arsenal level in a province you hold is one military factory. Assign them to lines. A line starts at ' + pct(0.1) + ' efficiency and improves every month, up to ' + pct(0.6 + War.mod(tag, 'prodeff')) + '; switching what it makes starts it over. Lines buy their iron, timber, coal and cloth on your market.'));
    lines.forEach(function (L, i) {
      var P = War.PROD[L.eq], row = h('div', 'pline'), head = h('div', 'pl-head');
      if (mine) {
        var sel = document.createElement('select'); sel.id = 'pl-' + i;
        Object.keys(War.PROD).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = War.PROD[k].name; if (k === L.eq) o.selected = true; sel.appendChild(o); });
        sel.addEventListener('change', function () { War.changeLine(tag, i, sel.value); redraw(); });
        var lab = h('label', 'sr', 'What line ' + (i + 1) + ' makes'); lab.setAttribute('for', sel.id); head.appendChild(lab); head.appendChild(sel);
      } else head.appendChild(h('strong', null, P.name));
      var ctl = h('div', 'pl-ctl');
      if (mine) ctl.appendChild(btn('ghost sq', '−', function () { War.setLine(tag, i, L.f - 1); redraw(); }, 'One factory fewer'));
      ctl.appendChild(h('span', 'pl-f', L.f + (L.f === 1 ? ' factory' : ' factories')));
      if (mine) ctl.appendChild(btn('ghost sq', '+', function () { War.setLine(tag, i, L.f + 1); redraw(); }, 'One factory more'));
      if (mine) ctl.appendChild(btn('ghost sq', '×', function () { War.removeLine(tag, i); redraw(); }, 'Remove this line'));
      head.appendChild(ctl); row.appendChild(head);
      var top = h('div', 'bar-top'); top.appendChild(h('span', null, 'Efficiency')); top.appendChild(h('span', 'n', pct(L.eff))); row.appendChild(top); row.appendChild(bar(L.eff / 0.8, 'plan'));
      var out = War.lineOutput(tag, L), inputs = Object.keys(P.input).map(function (g) { return Math.round(out * P.input[g] * 10) / 10 + ' ' + g; }).join(', ');
      row.appendChild(h('span', 'note', '≈ ' + (out >= 10 ? Math.round(out) : out.toFixed(1)) + ' ' + P.name.toLowerCase() + ' a month · needs ' + inputs + (L.fill !== undefined && L.fill < 0.95 ? ' · short of materials: running at ' + pct(L.fill) : '')));
      body.appendChild(row);
    });
    if (mine) {
      var add = h('div', 'acts');
      Object.keys(War.PROD).forEach(function (k) { add.appendChild(btn('ghost', '+ ' + War.PROD[k].name + ' line', function () { War.addLine(tag, k); redraw(); })); });
      body.appendChild(add);
    }

    body.appendChild(h('h3', 'p-sub', 'Arsenal'));
    var need = { muskets: 0, artillery: 0, horses: 0, uniforms: 0 }, made = n.made || {};
    War.divs.forEach(function (d) { if (d.tag !== tag) return; var eq = War.stats(d).eq; for (var g in need) need[g] += (eq[g] || 0) * (1 - d.str) + (eq[g] || 0) * 0.01; });
    var wrap = h('div', 'tbl-wrap'), tbl = h('table', 'market'), hd = h('tr');
    ['Equipment', 'In store', 'Made', 'Army needs'].forEach(function (t, i) { hd.appendChild(h('th', i ? 'n' : null, t)); }); tbl.appendChild(hd);
    [['muskets', 'Muskets'], ['artillery', 'Cannon'], ['uniforms', 'Uniforms'], ['horses', 'Horses (bought on the market)']].forEach(function (x) {
      var tr = h('tr'); tr.appendChild(h('td', null, x[1])); tr.appendChild(h('td', 'n', num(Math.floor(n.stockpile[x[0]] || 0))));
      tr.appendChild(h('td', 'n', made[x[0]] ? num(Math.round(made[x[0]])) : '—'));
      tr.appendChild(h('td', 'n ' + (need[x[0]] > (n.stockpile[x[0]] || 0) ? 'imp' : ''), num(Math.round(need[x[0]])))); tbl.appendChild(tr);
    });
    wrap.appendChild(tbl); body.appendChild(wrap);
    body.appendChild(h('p', 'note', 'Divisions in the field wear out 1% of their arms each month. If the arsenal runs dry, they lose strength and cannot be brought back up to full.'));
    if (mine) body.appendChild(h('p', 'note', 'To get more factories, click one of your larger provinces and build an Arsenal.'));
  }

  // ---------- research ----------
  function researchTab(body, tag, mine) {
    var R = War.R[tag]; if (!R) return;
    if (window.BuildUI) {
      if (mine) body.appendChild(btn('primary', 'Open the tech tree (T)', function () { BuildUI.openTree(); }));
      body.appendChild(h('h3', 'p-sub', 'Research slots'));
      body.appendChild(BuildUI.slotsBlock(tag, mine, function () { EconUI.refresh(true); }));
      body.appendChild(BuildUI.researchInfo(tag));
      var done = Object.keys(R.done).length; body.appendChild(h('p', 'note', done + ' of ' + War.TECH.length + ' researched.'));
      return;
    }
    body.appendChild(h('p', 'note', 'It is ' + Math.floor(War.year()) + '. Research dated after the current year takes longer: +120% for each year ahead of its time.'));
    body.appendChild(h('h3', 'p-sub', 'Research slots'));
    R.slots.forEach(function (s, i) {
      var row = h('div', 'pline');
      if (!s) { row.appendChild(h('span', 'note', 'Empty slot: choose something below.')); body.appendChild(row); return; }
      var t = War.TECH_BY[s.id], top = h('div', 'pl-head'); top.appendChild(h('strong', null, t.name));
      if (mine) top.appendChild(btn('ghost sq', '×', function () { War.cancelResearch(tag, i); redraw(); }, 'Stop: the progress is lost'));
      row.appendChild(top); row.appendChild(bar(s.prog / s.need, 'xp'));
      row.appendChild(h('span', 'note', (s.need - s.prog) + ' days left · ' + effText(t)));
      body.appendChild(row);
    });
    Object.keys(War.TECH_CATS).forEach(function (cat) {
      body.appendChild(h('h3', 'p-sub', War.TECH_CATS[cat] + (cat === 'doc' ? (R.path ? ': ' + { corps: 'Corps system', line: 'Linear tactics', mass: 'Mass levy' }[R.path] : ': choose one path') : '')));
      var grid = h('div', 'techs');
      War.TECH.filter(function (t) { return t.cat === cat; }).forEach(function (t) {
        var st = War.techState(tag, t.id), days = War.techDays(tag, t), ahead = t.year > War.year();
        var b = btn('tech ' + st.replace(' ', '-'), '', function () { if (!mine) return; var r = War.startResearch(tag, t.id); if (r) { var w = document.querySelector('.tech-msg'); if (w) w.textContent = r; } redraw(); });
        b.disabled = !mine || st !== 'open';
        var top = h('span', 'tech-top'); top.appendChild(h('strong', null, t.name)); top.appendChild(h('span', 'tech-year' + (ahead ? ' ahead' : ''), String(t.year))); b.appendChild(top);
        b.appendChild(h('span', 'tech-eff', effText(t)));
        b.appendChild(h('span', 'tech-st', st === 'done' ? 'Researched' : st === 'active' ? 'Being researched' : st === 'locked' ? 'Needs ' + War.TECH_BY[t.req].name : st === 'other path' ? 'Another doctrine' : days + ' days'));
        grid.appendChild(b);
      });
      body.appendChild(grid);
    });
    body.appendChild(h('p', 'note tech-msg', ''));
  }
  var KEY = { inf_atk: 'infantry attack', inf_def: 'infantry defence', inf_brk: 'infantry breakthrough', light_atk: 'light infantry attack', light_def: 'light infantry defence', mil_atk: 'militia attack', mil_def: 'militia defence',
    cav_atk: 'cavalry attack', cav_def: 'cavalry defence', cav_brk: 'cavalry breakthrough', cav_spd: 'cavalry speed', art_atk: 'artillery attack', art_brk: 'artillery breakthrough', art_spd: 'artillery speed',
    atk: 'attack', def: 'defence', brk: 'breakthrough', org: 'organisation', regen: 'organisation recovery', entr: 'digging in', reinf: 'reserves joining battle', plan: 'planning speed', planmax: 'max planning',
    trainxp: 'experience of new divisions', mp: 'recruits each month', mpcap: 'recruit cap', spd: 'speed', river: 'less river penalty', cas: 'fewer casualties', attr: 'less attrition', supply: 'less supply use',
    fort: 'fort strength', fortmax: 'fort levels', prodeff: 'max production efficiency', prodout: 'military production', prodgrow: 'efficiency growth', factory: 'mill output', land: 'farm output',
    grain_out: 'grain', cloth_out: 'cloth', iron_out: 'iron', hills_def: 'defence in hills', cons: 'construction speed', slots: 'building slots', rspeed: 'research speed', cgoods: 'consumer goods',
    nspd: 'ship speed', nrepair: 'repair speed', ngun: 'naval guns', nadm: 'admirals', nspot: 'spotting at sea', nscreen: 'frigate and brig guns', nprod: 'dockyard output', nfrig: 'frigates', nhp: 'hulls' };
  function effText(t) {
    var parts = Object.keys(t.eff).map(function (k) { var v = t.eff[k]; return k === 'fortmax' ? '+' + v + ' fort level' : k === 'rslot' ? '+' + v + ' research slot' : (v > 0 ? '+' : '') + Math.round(v * 100) + '% ' + (KEY[k] || k); });
    if (t.note && !/path$/.test(t.note) && !/[%+−]/.test(t.note)) parts.unshift(t.note);
    return parts.join(', ') || t.note || '';
  }

  // ---------- laws (shown on the Budget tab) ----------
  function lawsSection(tag, mine) {
    var wrap = h('div', 'econ'), L = War.laws[tag]; if (!L) return wrap;
    wrap.appendChild(h('h3', 'p-sub', 'Laws'));
    ['conscription', 'economy'].forEach(function (g) {
      var grp = War.LAWS[g], row = h('div', 'slider'), lab = h('label', null, grp.name), sel = document.createElement('select'); sel.id = 'law-' + g; lab.setAttribute('for', sel.id); sel.disabled = !mine;
      grp.opts.forEach(function (o) { var op = document.createElement('option'); op.value = o.id; op.textContent = o.name; if (L[g] === o.id) op.selected = true; sel.appendChild(op); });
      var cur = grp.opts.filter(function (o) { return o.id === L[g]; })[0], note = h('span', 'note', cur ? cur.blurb : '');
      sel.addEventListener('change', function () { var r = War.setLaw(tag, g, sel.value); if (r) { note.textContent = r; sel.value = L[g]; note.classList.add('bad-note'); } else redraw(); });
      row.appendChild(lab); row.appendChild(sel); row.appendChild(note); wrap.appendChild(row);
    });
    return wrap;
  }

  // ---------- forts on the map ----------
  function paintForts(c, v) {
    if (v.k < 0.9) return;
    var P = Econ.P;
    Game.provinces.forEach(function (p) {
      var f = P[p.id].b.fort; if (!f || p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) return;
      var X = v.sx(p.x) + (v.k >= 1.1 ? 22 : 14), Y = v.sy(p.y) + 2, s = 5;
      c.fillStyle = '#e8e2d2'; c.strokeStyle = '#14100a'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(X - s, Y + s); c.lineTo(X - s, Y - s); c.lineTo(X - s / 3, Y - s); c.lineTo(X - s / 3, Y - s / 2); c.lineTo(X + s / 3, Y - s / 2); c.lineTo(X + s / 3, Y - s); c.lineTo(X + s, Y - s); c.lineTo(X + s, Y + s); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#14100a'; c.font = '700 8px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(f), X, Y + 1.5);
    });
  }

  function init() { MapView.addPainter(paintForts); }
  window.ProdUI = { init: init, productionTab: productionTab, researchTab: researchTab, lawsSection: lawsSection, effText: effText };
})();
