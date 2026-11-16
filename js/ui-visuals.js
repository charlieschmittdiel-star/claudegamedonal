// The look of the map and the settings: an animation loop for marching counters, battle smoke and storms;
// snow on the map in winter; city icons; river names; a minimap; colour-blind mode; and new games from
// 1805, 1809, 1812 or 1815.
(function () {
  'use strict';
  var h = UI.h;
  function $(id) { return document.getElementById(id); }
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  var KEY = 'coalition1805.settings', S = { cb: false, reduced: false, minimap: true, snow: true, cities: true, rivers: true };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || '{}'); Object.keys(saved).forEach(function (k) { S[k] = saved[k]; }); } catch (e) { /* defaults */ }
  function store() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* not saved */ } }

  // ---------- the animation loop ----------
  var last = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    if (document.hidden || t - last < 70) return;
    var want = window.__mapAnim || (War.com && Object.keys(War.com.storms).length > 0 && !S.reduced);
    if (!want) return;
    last = t; window.__mapAnim = false; MapView.refreshOverlay();
  }

  // ---------- province shapes (for snow and the minimap) ----------
  var shapes = null;
  function buildShapes() {
    if (shapes || !window.topojson) return shapes;
    var fc = topojson.feature(MAP.topology, MAP.topology.objects.provinces); shapes = [];
    fc.features.forEach(function (f) {
      var p = new Path2D(), polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(function (pt, i) { if (i) p.lineTo(pt[0], pt[1]); else p.moveTo(pt[0], pt[1]); }); p.closePath(); }); });
      shapes[f.id] = p;
    });
    return shapes;
  }

  // ---------- painters: snow, cities, rivers ----------
  var RIVERS = [
    ['Rhine', 'Koblenz', -60, 10, -1.25], ['Danube', 'Linz', 0, 18, 0.1], ['Danube', 'Belgrade', 10, 16, 0.2], ['Elbe', 'Magdeburg', 18, -6, -0.9], ['Oder', 'Frankfurt an der Oder', 14, 0, -1.4],
    ['Vistula', 'Warsaw', -16, 4, -1.3], ['Niemen', 'Kovno', -10, 14, 0.3], ['Dnieper', 'Smolensk', 12, 26, 1.3], ['Seine', 'Paris', -24, -8, 0.3], ['Loire', 'Orléans', -30, 14, 0.15],
    ['Rhône', 'Lyon', 12, 26, 1.45], ['Po', 'Mantua', -10, 14, 0.05], ['Ebro', 'Zaragoza', 14, 16, 0.55], ['Tagus', 'Toledo', 0, 14, 0.05], ['Thames', 'London', -24, 10, 0],
    ['Weser', 'Minden', 10, -14, -1.2], ['Main', 'Frankfurt', 20, 10, 0.1], ['Dvina', 'Riga', 30, 14, -0.5], ['Bug', 'Brest-Litovsk', 8, 0, -1.2], ['Douro', 'Porto', 30, 6, -0.05], ['Berezina', 'Minsk', 30, 12, 1.4]
  ];
  var cityList = null;
  function cities() {
    if (cityList) return cityList;
    var C = (window.ECON_DATA && ECON_DATA.CITIES) || {}; cityList = [];
    Game.provinces.forEach(function (p) { var w = C[p.name]; if (w && w >= 2) cityList.push([p.id, w]); });
    return cityList;
  }
  function paint(c, v) {
    var mode = MapView.mode(), base = mode === 'political' || mode === 'terrain';
    // snow lies where the weather is snow
    if (S.snow && base && War.winterAt && buildShapes()) {
      c.save(); c.translate(v.sx(0), v.sy(0)); c.scale(v.k, v.k);
      c.fillStyle = 'rgba(248,250,255,0.42)';
      Game.provinces.forEach(function (p) { if (p.x < v.x0 - 60 || p.x > v.x1 + 60 || p.y < v.y0 - 60 || p.y > v.y1 + 60) return; if (War.winterAt(p) && shapes[p.id]) c.fill(shapes[p.id]); });
      c.restore();
    }
    // city icons: little skylines for the great cities
    if (S.cities && v.k >= 1.3) cities().forEach(function (x) {
      var p = Game.provinces[x[0]]; if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) return;
      var X = v.sx(p.x) - (v.k >= 1.1 ? 26 : 18), Y = v.sy(p.y) + 1, s = Math.min(1.6, 0.7 + x[1] * 0.25);
      c.fillStyle = 'rgba(70,52,34,0.6)'; c.beginPath();
      c.rect(X - 5 * s, Y - 3 * s, 3 * s, 4 * s); c.rect(X - 2 * s, Y - 6 * s, 3 * s, 7 * s); c.rect(X + 1 * s, Y - 4 * s, 4 * s, 5 * s);
      c.moveTo(X - 2 * s, Y - 6 * s); c.lineTo(X - 0.5 * s, Y - 8.5 * s); c.lineTo(X + 1 * s, Y - 6 * s);
      c.fill();
    });
    // river names along the great rivers
    if (S.rivers && v.k >= 0.85 && (base || mode === 'supply')) {
      c.save(); c.font = 'italic 600 ' + Math.round(10 + 2 * Math.min(1, v.k - 0.85)) + 'px Spectral, Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      RIVERS.forEach(function (r) {
        var p = Game.provinceByName(r[1]); if (!p || p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) return;
        c.save(); c.translate(v.sx(p.x + r[2]), v.sy(p.y + r[3])); c.rotate(r[4]);
        c.lineWidth = 3; c.strokeStyle = 'rgba(232,240,245,0.8)'; c.strokeText(r[0], 0, 0); c.fillStyle = '#3d6f8f'; c.fillText(r[0], 0, 0); c.restore();
      });
      c.restore();
    }
  }

  // ---------- the minimap ----------
  var mm = null, mmDirty = true;
  function minimap() {
    if (!S.minimap || UI.isPhone && UI.isPhone()) { if (mm) mm.wrap.hidden = true; return; }
    if (!mm) {
      var wrap = h('div', 'minimap'), cv = document.createElement('canvas'), W = 220, H = Math.round(220 * MAP.height / MAP.width);
      cv.width = W * 2; cv.height = H * 2; cv.style.width = W + 'px'; cv.style.height = H + 'px'; wrap.appendChild(cv);
      $('stage').appendChild(wrap); mm = { wrap: wrap, cv: cv, W: W, H: H, base: document.createElement('canvas') };
      mm.base.width = cv.width; mm.base.height = cv.height;
      function go(e) { var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / W * MAP.width, y = (e.clientY - r.top) / H * MAP.height; MapView.focusPoint(x, y, MapView.view().k); }
      var down = false; cv.addEventListener('mousedown', function (e) { down = true; go(e); e.stopPropagation(); e.preventDefault(); });
      window.addEventListener('mousemove', function (e) { if (down) go(e); }); window.addEventListener('mouseup', function () { down = false; });
      wrap.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });
    }
    mm.wrap.hidden = false;
    var sc = mm.cv.width / MAP.width;
    if (mmDirty && buildShapes()) {
      var b = mm.base.getContext('2d'); b.setTransform(1, 0, 0, 1, 0, 0); b.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--sea') || '#a9c2cc'; b.fillRect(0, 0, mm.base.width, mm.base.height);
      b.setTransform(sc, 0, 0, sc, 0, 0);
      Game.provinces.forEach(function (p) { if (!shapes[p.id]) return; b.fillStyle = Game.nations[p.owner] ? Game.nations[p.owner].color : '#d9d0bb'; b.fill(shapes[p.id]); });
      mmDirty = false;
    }
    var c = mm.cv.getContext('2d'), v = MapView.view(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(mm.base, 0, 0);
    var x0 = -v.tx / v.k * sc, y0 = -v.ty / v.k * sc, w = v.width / v.k * sc, hh = v.height / v.k * sc;
    c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.strokeRect(x0, y0, w, hh); c.strokeStyle = '#14100a'; c.lineWidth = 1; c.strokeRect(x0 - 1.5, y0 - 1.5, w + 3, hh + 3);
    if (Game.player) War.battles.forEach(function (bt) { var p = Game.provinces[bt.prov]; c.fillStyle = '#b3261e'; c.beginPath(); c.arc(p.x * sc, p.y * sc, 3, 0, 6.2832); c.fill(); });
  }
  var lastView = '';
  function watchView() { if (mm) { var pn = $('panel'), open = pn && !pn.classList.contains('is-empty') && pn.offsetParent !== null; mm.wrap.style.right = open ? (pn.offsetWidth + 28) + 'px' : '12px'; } var v = MapView.view(), key = Math.round(v.k * 100) + ':' + Math.round(v.tx) + ':' + Math.round(v.ty); if (key !== lastView) { lastView = key; minimap(); } setTimeout(watchView, 200); }

  // ---------- settings ----------
  function settings() {
    var m = $('modal'); m.innerHTML = ''; m.hidden = false; m._refresh = null;
    var card = h('div', 'modal-card'), head = h('div', 'drawer-head'); head.appendChild(h('h2', null, 'Settings'));
    head.appendChild(btn('x-btn', '×', function () { m.hidden = true; m.innerHTML = ''; }, 'Close')); card.appendChild(head);
    var body = h('div', 'modal-body settings'); card.appendChild(body); m.appendChild(card);
    function toggle(key, label, note, after) {
      var row = h('label', 'set-row'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!S[key];
      cb.addEventListener('change', function () { S[key] = cb.checked; store(); apply(); if (after) after(); });
      row.appendChild(cb); var t = h('span'); t.appendChild(h('b', null, label)); if (note) t.appendChild(h('span', 'muted small', ' ' + note)); row.appendChild(t); body.appendChild(row);
    }
    body.appendChild(h('h3', 'p-sub', 'Map'));
    toggle('cb', 'Colour-blind mode', 'Blue and orange instead of green and red for friend and foe, supply and opinion.', function () { MapView.redraw(); });
    toggle('reduced', 'Reduced motion', 'No battle smoke, gliding counters or moving storms.');
    toggle('minimap', 'Minimap', 'A small map of the world in the corner: click it to jump.', minimap);
    toggle('snow', 'Snow in winter', 'Snow lies on the map where the weather is snow.', function () { MapView.refreshOverlay(); });
    toggle('cities', 'City icons', 'Skylines for the great cities when zoomed in.', function () { MapView.refreshOverlay(); });
    toggle('rivers', 'River names', 'Names along the great rivers when zoomed in.', function () { MapView.refreshOverlay(); });
    if (window.Feel && Feel.settingsSection) Feel.settingsSection(body);
    body.appendChild(h('h3', 'p-sub', 'New game'));
    body.appendChild(h('p', 'note', 'Start a new game at one of the great turning points. History up to then is already written: the treaties, the new kingdoms, the Continental System. This erases the current save.'));
    var grid = h('div', 'scen-grid');
    Object.keys(War.SCENARIOS).forEach(function (y) {
      var sc = War.SCENARIOS[y], c = h('div', 'scen'); c.appendChild(h('b', null, y + ': ' + sc.name)); c.appendChild(h('span', 'small muted', sc.blurb));
      c.appendChild(btn('ghost small', 'Start here', function () { if (!c._sure) { c._sure = true; this.textContent = 'Erase the save and start'; this.className = 'ghost small danger'; return; } m.hidden = true; m.innerHTML = ''; newGameAt(+y); }));
      grid.appendChild(c);
    });
    body.appendChild(grid);
  }
  function newGameAt(y) {
    Game.newGame();
    if (y !== 1805) {
      var r = War.scenario(y), sc = War.SCENARIOS[y];
      Game.date = { year: sc.year, month: sc.month, day: 1 };
      Econ.month = Math.round(((sc.year + (sc.month - 1) / 12) - (1805 + 8 / 12)) * 12);
      Econ.refreshAccess();
      Game.emit('owner'); Game.emit('reset');
    }
    MapView.redraw(); mmDirty = true; minimap();
    var t = h('div', 'toast', y === 1805 ? 'A new game from September 1805' : 'A new game from ' + War.SCENARIOS[y].blurb.split(':')[0] + ': choose your nation'); $('toasts').appendChild(t); setTimeout(function () { t.remove(); }, 5000);
  }
  function apply() { document.body.classList.toggle('cb', !!S.cb); document.body.classList.toggle('reduced', !!S.reduced); }

  window.Visuals = { cb: function () { return !!S.cb; }, reduced: function () { return !!S.reduced; }, settings: settings, newGameAt: newGameAt, minimap: minimap, shapes: buildShapes, init: function () {
    apply();
    MapView.addPainter(paint);
    var b = btn('ghost', '⚙', settings, 'Settings, colour-blind mode, and new games from 1805, 1809, 1812 or 1815'); b.id = 'settings-btn'; b.setAttribute('aria-label', 'Settings'); var help = $('help-btn'); help.parentNode.insertBefore(b, help);
    requestAnimationFrame(loop);
    Game.on('owner', function () { mmDirty = true; }); Game.on('month', function () { mmDirty = true; minimap(); }); Game.on('reset', function () { mmDirty = true; minimap(); });
    Game.on('day', function () { if (War.day % 7 === 0) { mmDirty = mmDirty || false; minimap(); } });
    Game.on('event', function (e) { if (e.type === 'surrender' || e.type === 'capital') mmDirty = true; });
    setTimeout(function () { minimap(); watchView(); }, 300);
  } };
  // colour-blind friendly map modes: wrap the opinion and supply colours
  window.Visuals.recolor = function (col) {
    if (!S.cb || typeof col !== 'string') return col;
    var m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(col); if (!m) return col;
    var r = +m[1], g = +m[2], b = +m[3];
    if (g > r + 25) return 'rgb(' + Math.round(r * 0.6) + ',' + Math.round(g * 0.75) + ',' + Math.min(255, b + 90) + ')';     // green → blue
    if (r > g + 25) return 'rgb(' + Math.min(255, r + 30) + ',' + Math.round(g * 0.9 + 50) + ',' + Math.round(b * 0.5) + ')';   // red → orange
    return col;
  };
})();
