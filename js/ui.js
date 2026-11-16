// Panels and controls around the map: province / nation details, nation list, search, map modes.
(function () {
  'use strict';
  var Game = window.Game, MapView = window.MapView;
  var $ = function (id) { return document.getElementById(id); };
  var panel, body, stage, view = null; // view: {type:'province', id} | {type:'nation', tag} | null

  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
  function num(n) { return n.toLocaleString('en-US'); }
  function isPhone() { return window.matchMedia('(max-width: 720px)').matches; }

  function chipProvince(id) {
    var p = Game.province(id), b = h('button', 'chip'); b.type = 'button';
    var dot = h('i'); dot.style.background = Game.nations[p.owner].color; b.appendChild(dot); b.appendChild(document.createTextNode(p.name));
    b.addEventListener('click', function () { Game.select(id); MapView.focusProvince(id); });
    return b;
  }
  function chipNation(tag) {
    var n = Game.nations[tag], b = h('button', 'chip'); b.type = 'button';
    var dot = h('i'); dot.style.background = n.color; b.appendChild(dot); b.appendChild(document.createTextNode(n.short));
    b.addEventListener('click', function () { showNation(tag, true); });
    return b;
  }
  function fact(dl, k, v) { dl.appendChild(h('dt', null, k)); var dd = h('dd'); if (typeof v === 'string') dd.textContent = v; else dd.appendChild(v); dl.appendChild(dd); }
  function section(title, nodes) { var s = h('div'); s.appendChild(h('h3', 'p-sub', title)); var c = h('div', 'chips'); nodes.forEach(function (n) { c.appendChild(n); }); s.appendChild(c); return s; }

  function playBlock(tag) {
    var n = Game.nations[tag], wrap = h('div');
    if (Game.player === tag) { wrap.appendChild(h('p', 'playing', 'You are playing as ' + n.short + '.')); }
    else {
      var b = h('button', 'primary', 'Play as ' + n.short); b.type = 'button';
      b.addEventListener('click', function () { Game.setPlayer(tag); });
      wrap.appendChild(b);
    }
    return wrap;
  }

  function renderProvince(id) {
    var p = Game.province(id), n = Game.nations[p.owner], capOf = Game.isCapital(id);
    body.innerHTML = '';
    var head = h('div');
    head.appendChild(h('div', 'p-kicker', (capOf ? 'Capital province' : 'Province') + (p.ctrl !== p.owner ? ' · occupied by ' + Game.nations[p.ctrl].short : '')));
    head.appendChild(h('h2', 'p-title', p.name));
    body.appendChild(head);

    var ob = h('button', 'p-owner'); ob.type = 'button';
    var sw = h('span', 'swatch'); sw.style.background = n.color; ob.appendChild(sw); ob.appendChild(h('strong', null, n.name));
    ob.addEventListener('click', function () { showNation(p.owner, false); });
    body.appendChild(ob);

    var dl = h('dl', 'facts');
    var t = h('span'); var dot = h('i', 'dot'); dot.style.background = 'var(' + Game.terrain[p.terrain].css + ')'; t.appendChild(dot); t.appendChild(document.createTextNode(Game.terrain[p.terrain].name));
    fact(dl, 'Terrain', t);
    fact(dl, 'Area', '≈ ' + num(p.area) + ' km²');
    if (p.coastal && p.sea >= 0 && window.War && War.seas && War.seas[p.sea]) {
      var sb = h('button', 'chip', War.seas[p.sea].name); sb.type = 'button'; sb.addEventListener('click', function () { showSea(p.sea); });
      var blk = War.blockaded(id, p.ctrl) && Econ.P[id].b.port > 0, cs = h('span'); cs.appendChild(sb); if (blk) cs.appendChild(h('span', 'warn-inline', ' blockaded'));
      fact(dl, 'Coast', cs);
    } else fact(dl, 'Coast', p.coastal ? 'Coastal' : 'Inland');
    if (window.War && War.provs && War.provs[id].vp !== undefined) {
      var wp = War.provs[id], st = War.states && War.states[wp.state], wx = War.weatherAt(wp);
      if (st) fact(dl, 'Region', st.name + (st.provs.length > 1 ? ' (' + st.provs.length + ' provinces)' : ''));
      fact(dl, 'Victory points', String(wp.vp));
      var rk = War.foreignRule && War.foreignRule(wp);
      if (rk) { var rs = h('span'); rs.textContent = Math.round(War.resist[id] * 100) + '% (' + (rk === 'occupied' ? 'occupied' : 'annexed') + ' land of ' + Game.nations[War.core[id]].short + ')'; if (War.resist[id] >= 0.4) rs.className = 'warn-inline'; fact(dl, 'Resistance', rs); }
      fact(dl, 'Weather', wx ? wx.name + (wx.move > 1 ? ', marching ' + Math.round((wx.move - 1) * 100) + '% slower' : '') + (wx.atk < 1 ? ', attacks ' + Math.round((1 - wx.atk) * 100) + '% weaker' : '') : 'Fair');
    }
    body.appendChild(dl);
    if (window.WarUI) body.appendChild(window.WarUI.provinceSection(id));
    if (window.EconUI) body.appendChild(window.EconUI.provinceSection(id));

    if (p.adj.length) body.appendChild(section('Borders', p.adj.map(chipProvince)));
    if (p.straits.length) body.appendChild(section('Short sea crossings', p.straits.map(chipProvince)));
    if (!p.adj.length && !p.straits.length) body.appendChild(h('p', 'note', 'An island with no land neighbours. Reaching it will need ships.'));

    body.appendChild(h('hr', 'rule'));
    body.appendChild(playBlock(p.owner));
  }

  function renderNation(tag) {
    var n = Game.nations[tag], st = Game.nationStats(tag), cap = Game.capitalOf(tag);
    body.innerHTML = '';
    var head = h('div');
    head.appendChild(h('div', 'p-kicker', n.major ? 'Great power' : 'Nation'));
    head.appendChild(h('h2', 'p-title', n.name));
    body.appendChild(head);

    var dl = h('dl', 'facts');
    if (cap && cap.owner === tag) fact(dl, 'Capital', chipProvince(cap.id));
    else fact(dl, 'Capital', n.capital ? n.capital + ' (lost)' : st.provinces ? 'Beyond this map' : 'None');
    fact(dl, 'Provinces', num(st.provinces));
    fact(dl, 'Area', '≈ ' + num(st.area) + ' km²');
    if (window.EconUI) window.EconUI.nationFacts(dl, tag, fact);
    body.appendChild(dl);

    var seen = {}, land = [], sea = [];
    Game.provinces.forEach(function (p) {
      if (p.owner !== tag) return;
      p.adj.forEach(function (q) { var o = Game.province(q).owner; if (o !== tag && !seen[o]) { seen[o] = 1; land.push(o); } });
    });
    Game.provinces.forEach(function (p) {
      if (p.owner !== tag) return;
      p.straits.forEach(function (q) { var o = Game.province(q).owner; if (o !== tag && !seen[o]) { seen[o] = 1; sea.push(o); } });
    });
    var byName = function (a, b) { return Game.nations[a].short.localeCompare(Game.nations[b].short); };
    if (window.WarUI) body.appendChild(window.WarUI.nationSection(tag));
    if (window.DiploUI) body.appendChild(window.DiploUI.nationSection(tag));
    if (window.PolUI) body.appendChild(window.PolUI.nationSection(tag));
    if (window.ComUI) body.appendChild(window.ComUI.nationSection(tag));
    if (land.length) body.appendChild(section('Land borders with', land.sort(byName).map(chipNation)));
    if (sea.length) body.appendChild(section('Across a strait from', sea.sort(byName).map(chipNation)));

    body.appendChild(h('hr', 'rule'));
    body.appendChild(playBlock(tag));
  }

  function syncPanel() {
    var open = !!view;
    panel.classList.toggle('is-empty', !open);
    stage.classList.toggle('has-panel', open);
    if (!open) { MapView.setInsets({}); return; }
    if (isPhone()) MapView.setInsets({ bottom: panel.offsetHeight });
    else MapView.setInsets({ right: panel.offsetWidth + 16 });
  }
  function render(keepScroll) {
    var top = panel.scrollTop;
    if (!view) body.innerHTML = '';
    else if (view.type === 'province') renderProvince(view.id);
    else if (view.type === 'sea') { body.innerHTML = ''; if (window.NavyUI) body.appendChild(window.NavyUI.seaPanel(view.zone)); }
    else renderNation(view.tag);
    panel.scrollTop = keepScroll ? top : 0;
    syncPanel();
  }
  function showSea(zone) {
    if (Game.selected !== null) { Game.selected = null; MapView.refreshOverlay(); }
    var same = view && view.type === 'sea' && view.zone === zone;
    view = { type: 'sea', zone: zone }; render(same);
  }
  function showNation(tag, focus) {
    view = { type: 'nation', tag: tag }; render();
    if (focus) MapView.focusNation(tag);
  }

  function updatePlayerChip() {
    var n = Game.player ? Game.nations[Game.player] : null;
    $('player-swatch').style.background = n ? n.color : '';
    $('player-name').textContent = n ? n.short : 'Choose nation';
  }

  function buildNationList() {
    var ul = $('nations-list'); ul.innerHTML = '';
    var tags = Object.keys(Game.nations).map(function (t) { return { tag: t, st: Game.nationStats(t) }; }).filter(function (x) { return x.st.provinces > 0; });
    tags.sort(function (a, b) { var A = Game.nations[a.tag], B = Game.nations[b.tag]; return ((B.major ? 1 : 0) - (A.major ? 1 : 0)) || (Econ.N[b.tag] ? Econ.N[b.tag].pop : 0) - (Econ.N[a.tag] ? Econ.N[a.tag].pop : 0); });   // the great powers first, then by people
    tags.forEach(function (x) {
      var n = Game.nations[x.tag], li = h('li'), b = h('button'); b.type = 'button';
      var sw = h('span', 'swatch'); sw.style.background = n.color; b.appendChild(sw);
      b.appendChild(h('span', null, n.name));
      b.appendChild(h('span', 'n-count', x.st.provinces + (x.st.provinces === 1 ? ' province' : ' provinces')));
      b.addEventListener('click', function () { if (isPhone()) $('nations').hidden = true; showNation(x.tag, true); });
      li.appendChild(b); ul.appendChild(li);
    });
  }

  function findProvince(q) {
    var s = Game.normalize(q); if (!s) return null;
    var exact = Game.provinceByName(q); if (exact) return exact;
    var starts = null, has = null;
    Game.provinces.forEach(function (p) { var n = Game.normalize(p.name); if (!starts && n.indexOf(s) === 0) starts = p; if (!has && n.indexOf(s) > 0) has = p; });
    return starts || has;
  }

  function init() {
    panel = $('panel'); body = $('panel-body'); stage = $('stage');

    Game.on('select', function (id) { view = id === null ? null : { type: 'province', id: id }; render(); if (id !== null) MapView.reveal(id); });
    Game.on('player', function () { updatePlayerChip(); render(true); });
    Game.on('owner', function () { render(true); if (!$('nations').hidden) buildNationList(); });
    Game.on('reset', function () { view = null; render(); updatePlayerChip(); $('nations').hidden = true; });

    $('panel-close').addEventListener('click', function () { if (Game.selected !== null) Game.select(null); else { view = null; render(); } });

    $('zoom-in').addEventListener('click', MapView.zoomIn);
    $('zoom-out').addEventListener('click', MapView.zoomOut);
    $('zoom-fit').addEventListener('click', MapView.fit);

    var dlist = $('province-names');
    Game.provinces.map(function (p) { return p.name; }).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (nm) { var o = document.createElement('option'); o.value = nm; dlist.appendChild(o); });
    var input = $('search-input');
    function go() {
      var p = findProvince(input.value);
      if (!p) { input.setCustomValidity('No province by that name. Try a city, such as Vienna.'); try { input.reportValidity(); } catch (e) { /* no bubble available */ } return; }
      input.setCustomValidity(''); input.value = ''; input.blur();
      Game.select(p.id); MapView.focusProvince(p.id);
    }
    $('search').addEventListener('submit', function (e) { e.preventDefault(); go(); });
    input.addEventListener('input', function () { input.setCustomValidity(''); if (Game.provinceByName(input.value)) go(); });

    $('nations-btn').addEventListener('click', function () { var d = $('nations'); d.hidden = !d.hidden; if (!d.hidden) buildNationList(); });
    $('nations-close').addEventListener('click', function () { $('nations').hidden = true; });
    $('player-chip').addEventListener('click', function () {
      if (Game.player) showNation(Game.player, true);
      else { $('nations').hidden = false; buildNationList(); }
    });
    window.addEventListener('resize', syncPanel);

    updatePlayerChip(); render();
  }

  window.UI = { init: init, showNation: showNation, showSea: showSea, refresh: function () { if (view) render(true); }, view: function () { return view; }, h: h, num: num, isPhone: isPhone };
})();
