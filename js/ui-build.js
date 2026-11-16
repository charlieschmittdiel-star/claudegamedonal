// HoI4-style construction and research on screen: the Construction tab (builders, the queue, building by clicking
// provinces on the map) and the research screen (a tech tree by year, with slots, a queue and bonuses).
(function () {
  'use strict';
  var h = UI.h, num = UI.num;
  function $(id) { return document.getElementById(id); }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function money(v) { return EconUI.money(v); }
  function bar(v, cls) { var w = h('span', 'nbar' + (cls ? ' ' + cls : '')), i = h('i'); i.style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%'; w.appendChild(i); return w; }
  function toast(text, kind) {
    var box = $('toasts'), t = h('div', 'toast' + (kind ? ' ' + kind : ''), text); box.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4500);
  }
  var B = Econ.BUILDINGS;
  var ORDER = ['textile', 'ironworks', 'armoury', 'foundry', 'workshop', 'arsenal', 'dockyard', 'university', 'roads', 'estates', 'port', 'fort', 'battery', 'depot'];
  var GROUPS = [['Industry (uses a building slot)', ['textile', 'ironworks', 'armoury', 'foundry', 'workshop']], ['State works (use a building slot)', ['arsenal', 'dockyard', 'university']], ['Land and defence', ['roads', 'estates', 'port', 'fort', 'battery', 'depot']]];
  function refreshAll() { Game.save(); UI.refresh(); EconUI.refresh(true); }

  // ---------- placing buildings on the map ----------
  var placing = null, prevMode = null;
  function placeColor(id) {
    var p = Game.provinces[id], pl = Game.player;
    if (p.owner !== pl) return '#7d786c';
    if (!placing) { var s0 = Econ.slotInfo(id); return p.ctrl !== p.owner ? '#c9bfa6' : s0.free >= 6 ? '#3f8a4a' : s0.free >= 3 ? '#6fa55a' : s0.free > 0 ? '#a7c46e' : '#c9bfa6'; }
    if (Econ.buildBlock(id, placing)) return '#c9bfa6';
    var si = Econ.slotInfo(id), free = B[placing].kind === 'factory' || B[placing].kind === 'mil' || B[placing].kind === 'naval' || B[placing].kind === 'research' ? si.free : 6;
    return free >= 6 ? '#3f8a4a' : free >= 3 ? '#6fa55a' : '#a7c46e';
  }
  function startPlacing(type) {
    if (!Game.player) return;
    if (!placing) prevMode = MapView.mode();
    placing = type; setMode('build');
    if (UI.isPhone()) $('economy').hidden = true;
    setHint('Click your provinces to queue: ' + B[type].name + '. Green means it can go there (darker: more free slots). Right-click or Esc to finish.');
    arm();
  }
  function arm() {
    Game.pick = function (id) {
      if (!placing) return;
      if (id !== null) {
        var why = Econ.build(id, placing);
        if (why) toast(Game.provinces[id].name + ': ' + why, 'bad'); else { toast(B[placing].name + ' queued in ' + Game.provinces[id].name); refreshAll(); }
        MapView.redraw();
      }
      arm();
    };
  }
  function stopPlacing() {
    if (!placing) return; placing = null; Game.pick = null; setHint(null);
    setMode(prevMode && prevMode !== 'build' ? prevMode : 'political');
  }
  function setMode(m) { var sel = $('mode-select'); sel.value = m; sel.dispatchEvent(new Event('change')); MapView.redraw(); }
  function setHint(t) { var el = $('hint'); if (!el) return; if (t) { el.textContent = t; el.hidden = false; } else { el.textContent = ''; el.hidden = true; } }

  // ---------- Construction tab ----------
  function constructionTab(body, tag, mine) {
    var b = Econ.builders(tag), q = Econ.queueOf(tag), crews = Econ.crews(tag), working = 0; crews.forEach(function (x) { working += x[1]; });
    var hero = h('div', 'hero');
    [['Builders', String(b.total)], ['At work', working + ' / ' + b.total], ['Projects', String(q.length)]].forEach(function (x) { var d = h('div'); d.appendChild(h('div', 'p-kicker', x[0])); d.appendChild(h('div', 'big', x[1])); hero.appendChild(d); });
    body.appendChild(hero);
    var dl = h('dl', 'facts');
    function row(k, v) { dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, v)); }
    row('Where they come from', b.civ + ' civilian factories (each 12 levels of mills, works and workshops) + ' + b.artisans + ' artisans − ' + b.consumer + ' kept on consumer goods (' + pct(b.share) + ', set by the economy law)');
    row('Construction speed', '+' + Math.round(War.mod(tag, 'cons') * 100) + '% from research; roads add 10% a level where the work is');
    var last = Econ.N[tag].last; if (last) row('Spent on building last month', money(last.build || 0));
    body.appendChild(dl);
    body.appendChild(h('p', 'note', 'As in HoI4: projects are worked in queue order, at most ' + War.CONS.PER_PROJECT + ' builders on each; money and materials are paid as the work goes. Mills, arsenals, dockyards and universities need a free building slot in their region.'));
    if (mine) {
      GROUPS.forEach(function (g) {
        body.appendChild(h('h3', 'p-sub', g[0]));
        var grid = h('div', 'buildgrid');
        g[1].forEach(function (type) {
          var bd = B[type]; if (!bd) return;
          var c = btn('buildbtn' + (placing === type ? ' is-on' : ''), '', function () { if (placing === type) stopPlacing(); else startPlacing(type); EconUI.refresh(true); });
          c.appendChild(h('strong', null, bd.name)); c.appendChild(h('span', null, num(Econ.cpCost(type)) + ' work · ' + bd.blurb));
          grid.appendChild(c);
        });
        body.appendChild(grid);
      });
      if (placing) body.appendChild(btn('ghost', 'Finish placing (Esc)', function () { stopPlacing(); EconUI.refresh(true); }));
    }
    body.appendChild(h('h3', 'p-sub', 'Construction queue'));
    if (!q.length) { body.appendChild(h('p', 'note', mine ? 'Nothing queued. Choose a building above, then click provinces on the map.' : 'Nothing being built.')); return; }
    var list = h('div', 'cqueue');
    crews.forEach(function (x, i) {
      var pj = x[0], c = x[1], p = Game.provinces[pj.prov], eta = Econ.projectEta(pj), r = h('div', 'cq' + (c ? '' : ' idle'));
      var top = h('div', 'cq-top'), nm = h('span', 'cq-name');
      nm.appendChild(h('strong', null, B[pj.type].name)); nm.appendChild(document.createTextNode(' · '));
      nm.appendChild(btn('link', p.name, function () { Game.select(pj.prov); MapView.focusProvince(pj.prov); }));
      top.appendChild(nm);
      if (mine) {
        var acts = h('span', 'cq-acts');
        acts.appendChild(btn('ghost sq', '⤒', function () { Econ.moveProject(pj, 'top'); refreshAll(); }, 'To the front of the queue'));
        acts.appendChild(btn('ghost sq', '↑', function () { Econ.moveProject(pj, -1); refreshAll(); }, 'Up'));
        acts.appendChild(btn('ghost sq', '↓', function () { Econ.moveProject(pj, 1); refreshAll(); }, 'Down'));
        acts.appendChild(btn('ghost sq', '×', function () { Econ.cancelProject(pj); refreshAll(); }, 'Cancel (half the wages paid come back)'));
        top.appendChild(acts);
      }
      r.appendChild(top); r.appendChild(bar(pj.cp / pj.need, 'good'));
      r.appendChild(h('span', 'note', num(Math.round(pj.cp)) + ' / ' + num(pj.need) + ' · ' + c + ' builders' + (c ? ' · ' + (isFinite(eta) ? eta + ' days' : '—') : ' · waiting for builders') + (p.ctrl !== p.owner ? ' · halted: occupied' : '')));
      list.appendChild(r);
    });
    body.appendChild(list);
  }

  // ---------- research screen ----------
  var treeCat = 'inf';
  function techDaysFor(tag, t) { return Math.ceil(War.techDays(tag, t) / War.researchSpeed(tag, null)); }
  function slotsBlock(tag, mine, redraw) {
    var R = War.R[tag], wrap = h('div', 'rslots');
    R.slots.forEach(function (s, i) {
      var c = h('div', 'rslot' + (s ? '' : ' empty'));
      if (!s) { c.appendChild(h('span', 'note', 'Empty slot')); wrap.appendChild(c); return; }
      var t = War.TECH_BY[s.id], sp = War.researchSpeed(tag, s), left = Math.max(0, Math.ceil((s.need - s.prog) / sp));
      var top = h('div', 'pl-head'); top.appendChild(h('strong', null, t.name));
      if (mine) top.appendChild(btn('ghost sq', '×', function () { War.cancelResearch(tag, i); redraw(); }, 'Stop: the progress is lost'));
      c.appendChild(top); c.appendChild(bar(s.prog / s.need, 'good'));
      c.appendChild(h('span', 'note', left + ' days left' + (s.bonus ? ' · bonus +' + pct(s.bonus) : '')));
      wrap.appendChild(c);
    });
    return wrap;
  }
  function researchInfo(tag) {
    var R = War.R[tag], wrap = h('div', 'rinfo');
    wrap.appendChild(h('span', null, 'Research speed ' + (War.mod(tag, 'rspeed') >= 0 ? '+' : '') + pct(War.mod(tag, 'rspeed')) + ' (research and universities) · ' + R.slots.length + ' slots · ' + Math.floor(War.year()) + ': work ahead of its year takes +120% a year'));
    (R.bonus || []).forEach(function (b) { wrap.appendChild(h('span', 'rbonus', '★ ' + b.name + ': +' + pct(b.pct) + ' to the next ' + b.cats.map(function (c) { return War.TECH_CATS[c]; }).join(' or ') + ' research')); });
    if (R.queue && R.queue.length) wrap.appendChild(h('span', null, 'Queued: ' + R.queue.map(function (id, i) { return (i + 1) + '. ' + War.TECH_BY[id].name; }).join(', ')));
    return wrap;
  }
  function layout(cat) {
    var list = War.TECH.filter(function (t) { return t.cat === cat; }).sort(function (a, b) { return a.year - b.year || (a.path || '').localeCompare(b.path || ''); });
    var years = []; list.forEach(function (t) { if (years.indexOf(t.year) < 0) years.push(t.year); }); years.sort();
    var pos = {}, taken = {};
    var bands = cat === 'doc' ? { corps: 0, line: 1, mass: 2 } : null;
    // each card goes in the first row, from its parent's down, where the line to it runs through empty cells
    list.forEach(function (t) {
      var col = years.indexOf(t.year), row, par = t.req && pos[t.req] ? pos[t.req] : null;
      if (bands && t.path) row = bands[t.path];
      else {
        row = par ? par.row : 0;
        for (;;) {
          var ok = !taken[col + ':' + row];
          if (ok && par) for (var c = par.col + 1; c < col; c++) if (taken[c + ':' + row]) { ok = false; break; }
          if (ok) break; row++;
        }
      }
      taken[col + ':' + row] = 1; pos[t.id] = { col: col, row: row };
      if (par) for (var c2 = par.col + 1; c2 < col; c2++) taken[c2 + ':' + row] = 1;   // keep the line's lane clear
    });
    var rows = 0; for (var id in pos) rows = Math.max(rows, pos[id].row + 1);
    return { list: list, years: years, pos: pos, rows: rows };
  }
  function openTree() {
    var tag = Game.player; if (!tag || !War.R[tag]) return;
    var m = $('modal'); m.hidden = false; m.innerHTML = '';
    var card = h('div', 'modal-card wide tree'), head = h('div', 'drawer-head');
    head.appendChild(h('h2', null, 'Research'));
    head.appendChild(btn('x-btn', '×', function () { m.hidden = true; m.innerHTML = ''; m._refresh = null; }, 'Close (Esc)'));
    card.appendChild(head);
    var body = h('div', 'modal-body'); card.appendChild(body); m.appendChild(card);
    function redraw() {
      var sc = body.querySelector('.tree-scroll'), keep = sc ? sc.scrollLeft : 0;
      body.innerHTML = '';
      body.appendChild(slotsBlock(tag, true, redraw));
      body.appendChild(researchInfo(tag));
      var tabs = h('div', 'tabs tree-tabs');
      Object.keys(War.TECH_CATS).forEach(function (c) { var b = btn('tab' + (c === treeCat ? ' is-on' : ''), War.TECH_CATS[c], function () { treeCat = c; redraw(); }); tabs.appendChild(b); });
      body.appendChild(tabs);
      body.appendChild(tree(tag, treeCat, redraw));
      body.appendChild(h('p', 'note', 'Click research to start it in a free slot, or to queue it when the slots are full (it starts as soon as one frees). Shift-click always queues. Locked research can be queued behind what it needs.'));
      var sc2 = body.querySelector('.tree-scroll'); if (sc2) sc2.scrollLeft = keep;
    }
    m._refresh = function () { if (Game.date.day % 3 === 0) redraw(); };
    redraw();
  }
  function tree(tag, cat, redraw) {
    var L = layout(cat), R = War.R[tag], CW = 196, CH = 92, GX = 34, GY = 14, PAD = 8;
    var W = L.years.length * (CW + GX) + PAD * 2, H = Math.max(1, L.rows) * (CH + GY) + 28 + PAD;
    var sc = h('div', 'tree-scroll'), box = h('div', 'tree-box'); box.style.width = W + 'px'; box.style.height = H + 'px';
    // the years along the top
    L.years.forEach(function (y, i) { var yl = h('div', 'tree-year' + (y > War.year() ? ' ahead' : ''), String(y)); yl.style.left = (PAD + i * (CW + GX)) + 'px'; box.appendChild(yl); });
    // lines from what is needed to what it opens
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'tree-lines');
    L.list.forEach(function (t) {
      if (!t.req || !L.pos[t.req]) return;
      var a = L.pos[t.req], b = L.pos[t.id], x1 = PAD + a.col * (CW + GX) + CW, y1 = 28 + a.row * (CH + GY) + CH / 2, x2 = PAD + b.col * (CW + GX), y2 = 28 + b.row * (CH + GY) + CH / 2, mx = x1 + GX / 2;
      var pth = document.createElementNS(ns, 'path'); pth.setAttribute('d', 'M' + x1 + ' ' + y1 + ' H' + mx + ' V' + y2 + ' H' + x2);
      pth.setAttribute('class', R.done[t.req] ? 'done' : ''); svg.appendChild(pth);
    });
    box.appendChild(svg);
    L.list.forEach(function (t) {
      var p = L.pos[t.id], st = War.techState(tag, t.id), qi = (R.queue || []).indexOf(t.id), active = R.slots.filter(function (s) { return s && s.id === t.id; })[0];
      var c = btn('tnode ' + st.replace(' ', '-') + (qi >= 0 ? ' queued' : ''), '', function (e) {
        var why = null;
        if (st === 'done' || st === 'active') return;
        if (!e.shiftKey && st === 'open' && R.slots.indexOf(null) >= 0) why = War.startResearch(tag, t.id);
        else why = War.queueResearch(tag, t.id);
        if (why) toast(why, 'bad'); Game.save(); redraw(); EconUI.refresh(true);
      });
      c.style.left = (PAD + p.col * (CW + GX)) + 'px'; c.style.top = (28 + p.row * (CH + GY)) + 'px'; c.style.width = CW + 'px'; c.style.height = CH + 'px';
      var top = h('span', 'tn-top'); top.appendChild(h('strong', null, t.name));
      if (qi >= 0) top.appendChild(h('span', 'tn-q', String(qi + 1)));
      c.appendChild(top);
      c.appendChild(h('span', 'tn-eff', ProdUI.effText(t)));
      var hasBonus = (R.bonus || []).some(function (b) { return b.cats.indexOf(t.cat) >= 0; });
      c.appendChild(h('span', 'tn-st', st === 'done' ? 'Researched' : active ? Math.ceil((active.need - active.prog) / War.researchSpeed(tag, active)) + ' days left' : st === 'other path' ? 'Another doctrine' : (st === 'locked' ? 'Needs ' + War.TECH_BY[t.req].name + ' · ' : '') + techDaysFor(tag, t) + ' days' + (t.year > War.year() ? ' (ahead of time)' : '') + (hasBonus && st === 'open' ? ' ★' : '')));
      if (active) { var pb = h('span', 'tn-bar'), pi = h('i'); pi.style.width = Math.round(active.prog / active.need * 100) + '%'; pb.appendChild(pi); c.appendChild(pb); }
      box.appendChild(c);
    });
    sc.appendChild(box); return sc;
  }

  // ---------- wiring ----------
  function init() {
    MapView.addMode('build', placeColor);
    Game.on('context', function () { if (placing) { stopPlacing(); EconUI.refresh(true); } });
    Game.on('reset', function () { stopPlacing(); });
    document.addEventListener('keydown', function (e) {
      var t = e.target, tn = t && t.tagName; if (tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape' && placing) { stopPlacing(); EconUI.refresh(true); }
      else if ((e.key === 't' || e.key === 'T') && Game.player) { if ($('modal').hidden) openTree(); else if ($('modal').querySelector('.tree')) { $('modal').hidden = true; $('modal').innerHTML = ''; } }
      else if (e.key === 'Escape' && !$('modal').hidden && $('modal').querySelector('.tree')) { $('modal').hidden = true; $('modal').innerHTML = ''; }
    });
  }
  window.BuildUI = { init: init, constructionTab: constructionTab, openTree: openTree, slotsBlock: slotsBlock, researchInfo: researchInfo, placing: function () { return placing; }, startPlacing: startPlacing, stopPlacing: stopPlacing };
})();
