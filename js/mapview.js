// Map rendering and navigation. Draws the provinces from the topology onto a canvas, handles
// pan / zoom / touch, selection, map modes and labels. Reads everything from Game and redraws
// when Game says something changed.
//
// How it stays smooth: the map is drawn once into a canvas that is larger than the screen. While
// you drag or pinch, only that finished picture is moved and scaled (cheap). When the view settles,
// the map is redrawn sharply at the new position.
(function () {
  'use strict';
  var MAP = window.MAP, Game = window.Game, topojson = window.topojson;
  var W = MAP.width, H = MAP.height;
  var MAX_K = 9;
  var COL = { wild: '#b7b09d', sea: '#9fbccb', coast: '#3f5562', river: '#7da0b3', bProv: 'rgba(27,19,11,0.30)', bNat: '#23190f', brass: '#d0a94f', stage: '#0f151c' };
  var FONT = '"Spectral", "Iowan Old Style", "Palatino Linotype", Georgia, serif';

  var host, layers, base, over, bctx, octx, hit;
  var provP = [], provBox = [], lakeG, riverMajorG, riverMajorFarG, riverMinorG, coastG = null, coastFarG = null;
  // two levels of detail: every point close up, every fourth point of each shared border from further off
  var DETAIL = [{ topo: null, provP: provP, bProv: null, bNat: null, player: null, bd: true, pd: true }, { topo: null, provP: null, bProv: null, bNat: null, player: null, bd: true, pd: true }];
  var natLabelList = [], shownLabels = 0;
  // live view (what the player is steering) and committed view (what the canvas was last drawn at)
  var k = 1, tx = 0, ty = 0, minK = 0.2, cw = 1, ch = 1;
  var ck = 1, ctx = 0, cty = 0, mx = 0, my = 0, dpr = 1, commitTimer = null, lastCommit = 0;
  var insets = { left: 0, right: 0, bottom: 0 };
  var mode = 'political', terrainColor = {}, modeFns = {};
  var hoverId = null, anim = null, redrawQueued = false, bordersDirty = false;
  var topo = MAP.topology, obj = topo.objects.provinces;

  function r1(v) { return Math.round(v * 10) / 10; }
  function ringsToPath(rings, close) {
    var d = '';
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i]; if (r.length < 2) continue;
      d += 'M' + r1(r[0][0]) + ',' + r1(r[0][1]);
      for (var j = 1; j < r.length; j++) d += 'L' + r1(r[j][0]) + ',' + r1(r[j][1]);
      if (close) d += 'Z';
    }
    return d;
  }
  function geomPath(g) {
    if (!g) return '';
    if (g.type === 'Polygon') return ringsToPath(g.coordinates, true);
    if (g.type === 'MultiPolygon') return g.coordinates.map(function (p) { return ringsToPath(p, true); }).join('');
    if (g.type === 'MultiLineString') return ringsToPath(g.coordinates, false);
    if (g.type === 'LineString') return ringsToPath([g.coordinates], false);
    return '';
  }
  function geomBox(g) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(function (poly) {
      var r = poly[0]; for (var i = 0; i < r.length; i++) { var x = r[i][0], y = r[i][1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    });
    return [x0, y0, x1, y1];
  }
  function owner(g) { return Game.provinces[g.id].owner; }
  function luminance(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  function colorOf(id) {
    var p = Game.provinces[id];
    if (modeFns[mode]) return modeFns[mode](id);
    return mode === 'political' ? Game.nations[p.owner].color : terrainColor[p.terrain];
  }

  // ---------- build ----------
  function init(hostEl) {
    host = hostEl;
    layers = document.getElementById('layers');
    base = document.getElementById('map'); over = document.getElementById('overlay');
    try {   // paper grain: a still image the browser blends over the map, costing nothing on redraw
      var gcv = document.createElement('canvas'), gx = gcv.getContext('2d'), gs = 192, gimg = gx.createImageData(gs, gs), gseed = 7; gcv.width = gcv.height = gs;
      for (var gi = 0; gi < gs * gs; gi++) { gseed = (gseed * 16807) % 2147483647; var gv = 200 + (gseed % 56); gimg.data[gi * 4] = gv; gimg.data[gi * 4 + 1] = gv - 6; gimg.data[gi * 4 + 2] = gv - 16; gimg.data[gi * 4 + 3] = 255; }
      gx.putImageData(gimg, 0, 0);
      var gl = document.createElement('div'); gl.id = 'grain'; gl.setAttribute('aria-hidden', 'true'); gl.style.backgroundImage = 'url(' + gcv.toDataURL() + ')';
      base.parentNode.insertBefore(gl, over);
    } catch (e) { /* no grain, no matter */ }
    bctx = base.getContext('2d'); octx = over.getContext('2d');
    hit = document.createElement('canvas').getContext('2d');
    hit.canvas.width = hit.canvas.height = 1;

    var cs = getComputedStyle(document.documentElement);
    Object.keys(Game.terrain).forEach(function (t) { terrainColor[t] = cs.getPropertyValue(Game.terrain[t].css).trim() || '#bbb'; });

    var feats = topojson.feature(topo, obj).features;
    for (var i = 0; i < feats.length; i++) {
      var id = feats[i].id;
      provP[id] = new Path2D(geomPath(feats[i].geometry));
      provBox[id] = geomBox(feats[i].geometry);
    }
    // The world's coasts, rivers and borders are far too long to stroke whole on every redraw, so each is cut into
    // short stretches filed by map square, and only the squares in view are drawn.
    lakeG = binLines(parseRel(MAP.lakes), 0);
    var rm = parseRel(MAP.rivers.major); riverMajorG = binLines(rm, 160); riverMajorFarG = binLines(rm, 160, 3); riverMinorG = binLines(parseRel(MAP.rivers.minor), 160);

    rebuildBorders(); rebuildNationLabels(); updatePlayerEdge();
    bindInput();
    measure(); home(false);
    if (window.ResizeObserver) new ResizeObserver(function () { measure(); clampView(); commit(); }).observe(host);
    else window.addEventListener('resize', function () { measure(); clampView(); commit(); });
    // the display typeface may arrive after first paint: redraw the labels with it
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('400 13px Spectral'), document.fonts.load('600 20px Spectral'), document.fonts.load('700 13px Spectral')]).then(queueRedraw, function () { });
    }

    Game.on('owner', function () { bordersDirty = true; stripes = {}; queueRedraw(); });
    Game.on('select', drawOverlay);
    Game.on('player', function () { updatePlayerEdge(); queueRedraw(); });
    Game.on('reset', function () { bordersDirty = true; queueRedraw(); });
    // land changed hands somewhere: repaint only if some of it is on screen (the rest is picked up when the view next moves)
    Game.on('map', function () {
      var ids = window.War && War.changed, x0 = (-mx - ctx) / ck, y0 = (-my - cty) / ck, x1 = (cw + mx - ctx) / ck, y1 = (ch + my - cty) / ck;
      if (!ids || !ids.length || ids.length > 200) { queueRedraw(); return; }
      for (var i = 0; i < ids.length; i++) { var b = provBox[ids[i]]; if (b && !(b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1)) { queueRedraw(); return; } }
    });
  }

  function meshLines(t, filter) { return topojson.mesh(t, t.objects.provinces, filter).coordinates.map(function (l) { var pts = []; for (var i = 0; i < l.length; i++) pts.push(l[i][0], l[i][1]); return { pts: pts, closed: false }; }); }
  function rebuildBorders() { DETAIL[0].bd = DETAIL[1].bd = true; bordersDirty = false; }
  // the same map with every fourth point of each border kept: neighbours still meet exactly, since they share the thinned line
  function farTopo() {
    return { type: 'Topology', transform: topo.transform, bbox: topo.bbox, objects: topo.objects, arcs: topo.arcs.map(function (arc) {
      var n = arc.length; if (n <= 8) return arc;
      var out = [], x = 0, y = 0, px = 0, py = 0;
      for (var i = 0; i < n; i++) { x += arc[i][0]; y += arc[i][1]; if (i === 0 || i === n - 1 || i % 4 === 0) { out.push([x - px, y - py]); px = x; py = y; } }
      return out;
    }) };
  }
  // a coarse picture of where the land is, to tell a province's edge on the shore (hidden under the sea anyway) from one facing wilderness
  var mask = null, MS = 8;
  function landMask() {
    if (mask) return mask;
    var cv = document.createElement('canvas'), x = cv.getContext('2d', { willReadFrequently: true }), P = new Path2D(), rings = coastRings();
    cv.width = Math.ceil(W / MS); cv.height = Math.ceil(H / MS);
    for (var i = 0; i < rings.length; i++) P.addPath(rings[i].q);
    x.setTransform(1 / MS, 0, 0, 1 / MS, 0, 0); x.fillStyle = '#000'; x.fill(P, 'evenodd');
    var d = x.getImageData(0, 0, cv.width, cv.height).data, m = new Uint8Array(cv.width * cv.height);
    for (var j = 0; j < m.length; j++) m[j] = d[4 * j + 3] > 127 ? 1 : 0;
    return (mask = { w: cv.width, h: cv.height, m: m });
  }
  function isLand(x, y) { var M = landMask(), cx = Math.floor(x / MS), cy = Math.floor(y / MS); return cx < 0 || cy < 0 || cx >= M.w || cy >= M.h ? false : M.m[cy * M.w + cx] === 1; }
  function inland(x, y) { return isLand(x, y) && isLand(x - 20, y) && isLand(x + 20, y) && isLand(x, y - 20) && isLand(x, y + 20); }
  function inlandStretch(pts, a, e) { var m = (a + e) >> 1, n = 0; if (inland(pts[2 * a], pts[2 * a + 1])) n++; if (inland(pts[2 * m], pts[2 * m + 1])) n++; if (inland(pts[2 * e], pts[2 * e + 1])) n++; return n >= 2; }
  function detail() {
    var L = DETAIL[ck >= 0.7 ? 0 : 1], t = L.topo || (L.topo = L === DETAIL[0] ? topo : farTopo());
    if (!L.provP) { L.provP = []; topojson.feature(t, t.objects.provinces).features.forEach(function (f) { L.provP[f.id] = new Path2D(geomPath(f.geometry)); }); }
    if (L.bd) {
      L.bProv = binLines(meshLines(t, function (a, b) { return a !== b && owner(a) === owner(b); }), 160);
      L.bNat = binLines(meshLines(t, function (a, b) { return a !== b && owner(a) !== owner(b); }), 160)
        .concat(binLines(meshLines(t, function (a, b) { return a === b; }), 40, 1, inlandStretch));
      L.bd = false;
    }
    if (L.pd) {
      var pl = Game.player;
      L.player = pl ? binLines(meshLines(t, function (a, b) { return a !== b && (owner(a) === pl) !== (owner(b) === pl); }), 160)
        .concat(binLines(meshLines(t, function (a, b) { return a === b && owner(a) === pl; }), 40, 1, inlandStretch)) : null;
      L.pd = false;
    }
    return L;
  }
  // "M x,y l dx,dy dx,dy ... [z]" strings (as the map data stores them) into lists of points
  function parseRel(str) {
    var out = [], parts = str.split('M');
    for (var i = 1; i < parts.length; i++) {
      var s = parts[i], closed = false, last = s.charAt(s.length - 1); if (last === 'z' || last === 'Z') { closed = true; s = s.slice(0, -1); }
      var l = s.indexOf('l'), head = (l < 0 ? s : s.slice(0, l)).split(','), x = +head[0], y = +head[1], pts = [x, y];
      if (l >= 0) { var nums = s.slice(l + 1).trim().split(/[ ,]+/); for (var j = 0; j + 1 < nums.length; j += 2) { x += +nums[j]; y += +nums[j + 1]; pts.push(x, y); } }
      out.push({ pts: pts, closed: closed });
    }
    return out;
  }
  // file lines by map square: long lines are cut into stretches of `chunk` points (0 keeps each line whole, for shapes that are filled)
  var CELL = 640;
  function binLines(lines, chunk, step, keep) {
    var cells = {}, list = []; step = step || 1;
    function put(pts, a, e, closeTo) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, j;
      for (j = a; j <= e; j++) { var X = pts[2 * j], Y = pts[2 * j + 1]; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
      var key = Math.floor((x0 + x1) / 2 / CELL) + ',' + Math.floor((y0 + y1) / 2 / CELL), cell = cells[key];
      if (!cell) { cell = cells[key] = { p: new Path2D(), b: [x0, y0, x1, y1] }; list.push(cell); }
      else { if (x0 < cell.b[0]) cell.b[0] = x0; if (y0 < cell.b[1]) cell.b[1] = y0; if (x1 > cell.b[2]) cell.b[2] = x1; if (y1 > cell.b[3]) cell.b[3] = y1; }
      cell.p.moveTo(pts[2 * a], pts[2 * a + 1]);
      for (j = a + 1; j <= e; j++) if ((j - a) % step === 0 || j === e) cell.p.lineTo(pts[2 * j], pts[2 * j + 1]);
      if (closeTo === 'z') cell.p.closePath(); else if (closeTo) cell.p.lineTo(closeTo[0], closeTo[1]);
    }
    for (var i = 0; i < lines.length; i++) {
      var pts = lines[i].pts, n = pts.length / 2; if (n < 2) continue;
      if (!chunk) { put(pts, 0, n - 1, lines[i].closed ? 'z' : null); continue; }
      for (var a = 0; a < n - 1; a += chunk) { var e = Math.min(n - 1, a + chunk); if (keep && !keep(pts, a, e)) continue; put(pts, a, e, lines[i].closed && e === n - 1 ? [pts[0], pts[1]] : null); }
    }
    return list;
  }
  // one path holding every stretch of a filed set that lies in view
  function inView(g, x0, y0, x1, y1) {
    var P = new Path2D();
    for (var i = 0; i < g.length; i++) { var b = g[i].b; if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue; P.addPath(g[i].p); }
    return P;
  }
  function updatePlayerEdge() { DETAIL[0].pd = DETAIL[1].pd = true; }
  function queueRedraw() {
    if (redrawQueued) return; redrawQueued = true;
    requestAnimationFrame(function () {
      redrawQueued = false;
      if (bordersDirty) { rebuildBorders(); updatePlayerEdge(); rebuildNationLabels(); }
      draw(); drawOverlay();
    });
  }

  // ---------- nation labels: the largest connected block of each nation carries its name ----------
  function nationBlocks(tag) {
    var provs = Game.provinces, seen = {}, blocks = [];
    for (var i = 0; i < provs.length; i++) {
      if (provs[i].owner !== tag || seen[i]) continue;
      var stack = [i], ids = []; seen[i] = 1;
      while (stack.length) {
        var a = stack.pop(); ids.push(a);
        var nb = provs[a].adj.concat(provs[a].straits);
        for (var j = 0; j < nb.length; j++) { var b = nb[j]; if (!seen[b] && provs[b].owner === tag) { seen[b] = 1; stack.push(b); } }
      }
      blocks.push(ids);
    }
    return blocks;
  }
  function blockBox(ids) {
    var provs = Game.provinces, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, area = 0, sx = 0, sy = 0;
    ids.forEach(function (id) {
      var p = provs[id]; area += p.area; sx += p.x * p.area; sy += p.y * p.area;
      x0 = Math.min(x0, p.x - p.r); x1 = Math.max(x1, p.x + p.r); y0 = Math.min(y0, p.y - p.r); y1 = Math.max(y1, p.y + p.r);
    });
    return { x0: x0, y0: y0, x1: x1, y1: y1, area: area, cx: sx / area, cy: sy / area };
  }
  // Find the widest, tallest spot inside the block for a horizontal name: try rows across the block,
  // keep the longest unbroken run of provinces on each row, and check how much height there is around it.
  function fitLabel(ids, len) {
    var provs = ids.map(function (id) { return Game.provinces[id]; }), bb = blockBox(ids), best = null;
    for (var t = 0.08; t <= 0.93; t += 0.05) {
      var y = bb.y0 + (bb.y1 - bb.y0) * t;
      var row = provs.filter(function (p) { return Math.abs(p.y - y) <= Math.max(p.r, 6); }).sort(function (a, b) { return a.x - b.x; });
      if (!row.length) continue;
      var runs = [], cur = [row[0]], i;
      for (i = 1; i < row.length; i++) {
        if (row[i].x - row[i].r - (row[i - 1].x + row[i - 1].r) > 22) { runs.push(cur); cur = [row[i]]; } else cur.push(row[i]);
      }
      runs.push(cur);
      for (var r = 0; r < runs.length; r++) {
        var run = runs[r], xa = run[0].x - run[0].r, xb = run[run.length - 1].x + run[run.length - 1].r, w = xb - xa, cx = (xa + xb) / 2;
        var up = y, down = y, changed = true, col = provs.filter(function (p) { return Math.abs(p.x - cx) <= Math.max(p.r, w * 0.22); });
        while (changed) {
          changed = false;
          for (i = 0; i < col.length; i++) {
            var p = col[i], pa = p.y - p.r, pb = p.y + p.r;
            if (pa <= down + 12 && pb >= up - 12 && (pa < up || pb > down)) { up = Math.min(up, pa); down = Math.max(down, pb); changed = true; }
          }
        }
        var size = Math.min(w * 0.88 / (len * 0.8), 2 * Math.min(y - up, down - y) * 0.55, 160);
        if (!best || size > best.size) best = { x: cx, y: y, size: size };
      }
    }
    return best || { x: bb.cx, y: bb.cy, size: 3 };
  }
  function rebuildNationLabels() {
    natLabelList = [];
    Object.keys(Game.nations).forEach(function (tag) {
      var blocks = nationBlocks(tag); if (!blocks.length) return;
      var name = Game.nations[tag].short.toUpperCase(), light = luminance(Game.nations[tag].color) < 0.42, cap = Game.nations[tag].capital, n = 0;
      blocks.map(function (ids) { return { ids: ids, area: blockBox(ids).area, home: ids.some(function (id) { return Game.provinces[id].name === cap; }) }; })
        .sort(function (a, b) { return (b.home - a.home) || b.area - a.area; })
        .forEach(function (b, i) {
          if (i > 0 && (b.ids.length < 3 || n >= 6)) return;
          var f = fitLabel(b.ids, name.length); if (i > 0 && f.size < 9) return;
          natLabelList.push({ tag: tag, text: name, x: f.x, y: f.y, size: Math.max(f.size, 2.6), light: light }); n++;
        });
    });
  }

  // ---------- drawing ----------
  var stripes = {};
  function stripe(color) {
    if (stripes[color]) return stripes[color];
    var s = Math.round(9 * dpr), cv = document.createElement('canvas'), x = cv.getContext('2d'); cv.width = cv.height = s;
    x.strokeStyle = color; x.lineWidth = s * 0.38; x.lineCap = 'square';
    x.beginPath(); x.moveTo(-s, s); x.lineTo(s, -s); x.moveTo(0, s); x.lineTo(s, 0); x.moveTo(0, 2 * s); x.lineTo(2 * s, 0); x.stroke();
    return (stripes[color] = bctx.createPattern(cv, 'repeat'));
  }
  // ---------- map art: paper grain, terrain marks ----------
  // the sea with its water-lines, drawn once at map scale and then copied: stroking the whole coastline five times
  // on every redraw is far too slow
  // The sea is drawn from tiles made as they are first needed (the whole world at full size would not fit in memory). A tile only looks at the stretches of coast that cross it, so making one takes a few milliseconds.
  var TILE = 1024, seaTiles = {}, tileUse = 0, coast = null, LODS = [1, 0.5, 0.25];
  function coastRings() {
    if (coast) return coast; coast = [];
    var parts = MAP.sea.split('z'), CH = 240;
    for (var i = 1; i < parts.length; i++) {
      var s = parts[i]; if (!s) continue;
      var l = s.indexOf('l'), head = s.slice(1, l < 0 ? s.length : l).split(','), x = +head[0], y = +head[1];
      var nums = l < 0 ? [] : s.slice(l + 1).split(/[ ,]/), pts = [x, y], j;
      for (j = 0; j + 1 < nums.length; j += 2) { x += +nums[j]; y += +nums[j + 1]; pts.push(x, y); }
      var n = pts.length / 2, ring = { p: new Path2D(s + 'z'), q: null, b: [1e9, 1e9, -1e9, -1e9], ch: [], pts: pts }, step = n >= 24 ? 4 : 1;
      if (step > 1) ring.q = new Path2D();                                       // a coarser outline for the far views
      for (var a = 0; a < n; a += CH) {
        var e = Math.min(n, a + CH), cp = new Path2D(), cq = step > 1 ? new Path2D() : null, cb = [1e9, 1e9, -1e9, -1e9];
        for (j = a; j <= e; j++) {
          var k2 = j === n ? 0 : j, X = pts[2 * k2], Y = pts[2 * k2 + 1];       // the last stretch runs back to the start
          if (j === a) cp.moveTo(X, Y); else cp.lineTo(X, Y);
          if (cq && ((j - a) % step === 0 || j === e)) { if (j === a) { cq.moveTo(X, Y); if (a === 0) ring.q.moveTo(X, Y); else ring.q.lineTo(X, Y); } else { cq.lineTo(X, Y); if (j < n) ring.q.lineTo(X, Y); } }
          if (X < cb[0]) cb[0] = X; if (Y < cb[1]) cb[1] = Y; if (X > cb[2]) cb[2] = X; if (Y > cb[3]) cb[3] = Y;
        }
        ring.ch.push({ p: cp, q: cq || cp, b: cb });
        if (cb[0] < ring.b[0]) ring.b[0] = cb[0]; if (cb[1] < ring.b[1]) ring.b[1] = cb[1]; if (cb[2] > ring.b[2]) ring.b[2] = cb[2]; if (cb[3] > ring.b[3]) ring.b[3] = cb[3];
      }
      if (ring.q) ring.q.closePath(); else ring.q = ring.p;
      coast.push(ring);
    }
    var cl = coast.map(function (r) { return { pts: r.pts, closed: true }; });
    coastG = binLines(cl, 160); coastFarG = binLines(cl.filter(function (l, i) { var b = coast[i].b; return b[2] - b[0] > 3 || b[3] - b[1] > 3; }), 160, 4);
    coast.forEach(function (r) { r.pts = null; });
    return coast;
  }
  var BANDS = [[11, 'rgba(255,255,255,0.09)'], [8.6, null], [6.2, 'rgba(255,255,255,0.15)'], [4.4, null], [2.4, 'rgba(36,62,80,0.13)']];
  // A tile is first made flat (sea colour only: a few milliseconds) and gets its water-lines a moment later, one tile
  // a frame, so panning into new waters never stalls.
  function seaTile(L, ix, iy, full) {
    var key = L + ':' + ix + ',' + iy, t = seaTiles[key];
    if (t && (!t.flat || !full)) { t.use = ++tileUse; return t; }
    if (!t) {
      var keys = Object.keys(seaTiles);
      if (keys.length >= 20) { var old = keys.sort(function (a, b) { return seaTiles[a].use - seaTiles[b].use; })[0]; delete seaTiles[old]; }
      var cv = document.createElement('canvas'); cv.width = cv.height = TILE;
      t = seaTiles[key] = { cv: cv, use: 0, flat: true };
    }
    var x = t.cv.getContext('2d');
    var S = LODS[L], size = TILE / S, tx0 = ix * size, ty0 = iy * size, m = 14 / S, X0 = tx0 - m, Y0 = ty0 - m, X1 = tx0 + size + m, Y1 = ty0 + size + m;
    var fillP = new Path2D(), lineP = new Path2D(), rings = coastRings(), any = false, tiny = L === 2 ? 4 : L === 1 ? 1.5 : 0;
    fillP.rect(tx0 - 2 / S, ty0 - 2 / S, size + 4 / S, size + 4 / S);
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i], b = r.b; if (b[2] < X0 || b[0] > X1 || b[3] < Y0 || b[1] > Y1) continue;
      if (b[2] - b[0] < tiny && b[3] - b[1] < tiny) continue;                      // specks vanish from afar
      fillP.addPath(L ? r.q : r.p);
      if (full) for (var j = 0; j < r.ch.length; j++) { var c = r.ch[j].b; if (c[2] < X0 || c[0] > X1 || c[3] < Y0 || c[1] > Y1) continue; lineP.addPath(L ? r.ch[j].q : r.ch[j].p); any = true; }
    }
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, TILE, TILE);
    x.setTransform(S, 0, 0, S, -tx0 * S, -ty0 * S); x.lineJoin = 'bevel';
    if (any) {
      // the water-lines are stroked freely, then everything on the land side is cut away
      (L ? BANDS_FAR : BANDS).forEach(function (bd) { x.strokeStyle = bd[1] || COL.sea; x.lineWidth = bd[0] / S; x.stroke(lineP); });
      x.globalCompositeOperation = 'destination-in'; x.fillStyle = '#000'; x.fill(fillP, 'evenodd');
      x.globalCompositeOperation = 'destination-over';
    }
    x.fillStyle = COL.sea; x.fill(fillP, 'evenodd'); x.globalCompositeOperation = 'source-over';
    t.flat = !full; t.use = ++tileUse;
    return t;
  }
  var BANDS_FAR = [[10, 'rgba(255,255,255,0.1)'], [6.4, null], [3.2, 'rgba(255,255,255,0.14)']];
  function drawSea(c, x0, y0, x1, y1) {
    c.imageSmoothingEnabled = true;
    var L = ck >= 0.6 ? 0 : ck >= 0.3 ? 1 : 2, size = TILE / LODS[L], t0 = performance.now(), made = 0, waiting = false;
    for (var iy = Math.max(0, Math.floor(y0 / size)); iy <= Math.min(Math.floor((H - 1) / size), Math.floor(y1 / size)); iy++)
      for (var ix = Math.max(0, Math.floor(x0 / size)); ix <= Math.min(Math.floor((W - 1) / size), Math.floor(x1 / size)); ix++) {
        var have = seaTiles[L + ':' + ix + ',' + iy], full = !have || have.flat ? (!anim && made < 1 && performance.now() - t0 < 25) : false;
        var t = seaTile(L, ix, iy, full); if (full) made++; if (t.flat) waiting = true;
        c.drawImage(t.cv, ix * size, iy * size, size + 0.5 / ck, size + 0.5 / ck);
      }
    if (waiting) queueRedraw();                                                    // come back next frame for the water-lines
  }

  // a few small marks inside each rough province: peaks for mountains, humps for hills, trees for forest, reeds for marsh
  var marks = null;
  function terrainMarks() {
    if (marks) return marks;
    marks = [];
    var test = document.createElement('canvas').getContext('2d'), provs = Game.provinces, seed = 1234567;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < provs.length; i++) {
      var p = provs[i], t = p.terrain; if (t !== 'm' && t !== 'h' && t !== 'f' && t !== 's') continue;
      var bx = provBox[i], want = Math.min(t === 'm' ? 9 : 6, Math.max(1, Math.round((bx[2] - bx[0]) * (bx[3] - bx[1]) / (t === 'm' ? 260 : 420))));
      for (var tries = 0, got = 0; tries < want * 6 && got < want; tries++) {
        var x = bx[0] + rnd() * (bx[2] - bx[0]), y = bx[1] + rnd() * (bx[3] - bx[1]);
        if (Math.hypot(x - p.x, y - p.y) < 9) continue;                      // keep clear of the name
        if (!test.isPointInPath(provP[i], x, y)) continue;
        marks.push([x, y, t, 0.8 + rnd() * 0.5]); got++;
      }
    }
    return marks;
  }
  var markLayer = null;
  function markArt() {
    if (markLayer) return markLayer;
    var S = Math.min(1.1, 3200 / Math.max(W, H)), cv = document.createElement('canvas'), x = cv.getContext('2d');
    cv.width = Math.ceil(W * S); cv.height = Math.ceil(H * S); x.setTransform(S, 0, 0, S, 0, 0); x.lineJoin = 'round'; x.lineCap = 'round';
    drawMarks(x, 0, 0, W, H, 1 / S, 0.8);
    return (markLayer = { cv: cv });
  }
  function drawMarks(c, x0, y0, x1, y1, px, zk) {
    var list = terrainMarks(), s = zk * px;
    c.lineWidth = 1 * px; c.strokeStyle = 'rgba(48,32,16,0.26)'; c.fillStyle = 'rgba(48,32,16,0.22)';
    c.beginPath();
    for (var i = 0; i < list.length; i++) {
      var m = list[i], x = m[0], y = m[1]; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      var z = m[3] * s;
      if (m[2] === 'm') { c.moveTo(x - 4 * z, y + 2.5 * z); c.lineTo(x - 1 * z, y - 2.5 * z); c.lineTo(x + 1.2 * z, y + 0.5 * z); c.lineTo(x + 2.4 * z, y - 1 * z); c.lineTo(x + 4.5 * z, y + 2.5 * z); }
      else if (m[2] === 'h') { c.moveTo(x - 3.5 * z, y + 1.5 * z); c.quadraticCurveTo(x, y - 2.5 * z, x + 3.5 * z, y + 1.5 * z); }
      else if (m[2] === 's') { c.moveTo(x - 3 * z, y + 1.5 * z); c.lineTo(x + 3 * z, y + 1.5 * z); c.moveTo(x - 1.5 * z, y + 1.5 * z); c.lineTo(x - 2 * z, y - 1.5 * z); c.moveTo(x + 1 * z, y + 1.5 * z); c.lineTo(x + 1.5 * z, y - 1.8 * z); }
      else { c.moveTo(x + 1.6 * z, y); c.arc(x, y, 1.6 * z, 0, 6.2832); c.moveTo(x + 1.3 * z + 3 * z, y + 1.2 * z); c.arc(x + 3 * z, y + 1.2 * z, 1.3 * z, 0, 6.2832); }
    }
    c.stroke();
  }

  var painters = [];
  function toWorld(c) { c.setTransform(dpr * ck, 0, 0, dpr * ck, dpr * (ctx + mx), dpr * (cty + my)); }
  function draw() {
    var c = bctx, provs = Game.provinces, i;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = COL.stage; c.fillRect(0, 0, base.width, base.height);
    toWorld(c);
    var x0 = (-mx - ctx) / ck, y0 = (-my - cty) / ck, x1 = (cw + mx - ctx) / ck, y1 = (ch + my - cty) / ck;
    c.fillStyle = COL.wild; c.fillRect(0, 0, W, H);
    var D = detail(), shape = D.provP;
    for (i = 0; i < provs.length; i++) {
      var bx = provBox[i]; if (bx[2] < x0 || bx[0] > x1 || bx[3] < y0 || bx[1] > y1) continue;
      c.fillStyle = colorOf(i); c.fill(shape[i]);
      var pv = provs[i];
      if (pv.ctrl && pv.ctrl !== pv.owner && mode === 'political') { // occupied: the occupier's colour in stripes
        c.save(); c.clip(shape[i]); c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = stripe(Game.nations[pv.ctrl].color); c.fillRect(0, 0, base.width, base.height); c.restore();
      }
    }
    var px = 1 / ck; // one screen pixel in map units, so line widths stay constant on screen
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = COL.river;
    if (ck >= 0.6) { c.globalAlpha = 0.8; c.lineWidth = 0.8 * px; c.stroke(inView(riverMinorG, x0, y0, x1, y1)); c.globalAlpha = 1; }
    c.lineWidth = (ck >= 0.3 ? 1.4 : 1) * px; c.stroke(inView(ck >= 0.6 ? riverMajorG : riverMajorFarG, x0, y0, x1, y1));
    if (ck >= 0.85 && (mode === 'political' || mode === 'terrain')) drawMarks(c, x0, y0, x1, y1, 0.94, 0.8);
    if (ck >= 0.28) { c.strokeStyle = COL.bProv; c.lineWidth = 0.8 * px; c.stroke(inView(D.bProv, x0, y0, x1, y1)); }   // from far off only the frontiers of nations show
    var natV = inView(D.bNat, x0, y0, x1, y1);
    if (ck >= 0.8) { c.strokeStyle = 'rgba(35,25,15,0.16)'; c.lineWidth = 4.5 * px; c.stroke(natV); }      // a soft shade along national borders, close up
    c.strokeStyle = COL.bNat; c.lineWidth = (ck >= 0.28 ? 1.6 : 1.1) * px; c.stroke(natV);
    if (D.player) { c.strokeStyle = COL.brass; c.globalAlpha = 0.9; c.lineWidth = 2.6 * px; c.stroke(inView(D.player, x0, y0, x1, y1)); c.globalAlpha = 1; }
    // the sea and its water-lines along the shore, as on an old chart (from the cached layer)
    drawSea(c, x0, y0, x1, y1);
    coastRings();
    c.strokeStyle = COL.coast; c.lineWidth = 0.9 * px; c.stroke(inView(ck >= 0.6 ? coastG : coastFarG, x0, y0, x1, y1));
    var lakeV = inView(lakeG, x0, y0, x1, y1); c.fillStyle = COL.sea; c.fill(lakeV); c.lineWidth = 0.6 * px; c.stroke(lakeV);
    c.strokeStyle = '#0c1117'; c.lineWidth = 3 * px; c.strokeRect(0, 0, W, H);
    drawLabels(c, x0, y0, x1, y1);
  }

  function drawLabels(c, x0, y0, x1, y1) {
    var provs = Game.provinces, i;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    var sx = function (x) { return x * ck + ctx + mx; }, sy = function (y) { return y * ck + cty + my; };

    // nation names scale with the map, like lettering on a chart
    for (i = 0; i < natLabelList.length; i++) {
      var n = natLabelList[i], size = n.size * ck;
      if (size < 8.5 || size > 130) continue;
      c.font = '600 ' + size.toFixed(1) + 'px ' + FONT;
      if ('letterSpacing' in c) c.letterSpacing = (size * 0.14).toFixed(1) + 'px';
      c.fillStyle = n.light ? 'rgba(255,255,255,0.72)' : 'rgba(26,18,10,0.62)';
      if (mode !== 'political') c.fillStyle = 'rgba(26,18,10,0.5)';
      c.fillText(n.text, sx(n.x), sy(n.y));
    }
    if ('letterSpacing' in c) c.letterSpacing = '0px';

    // province names and capital stars keep a constant size on screen and appear as there is room
    shownLabels = 0;
    c.strokeStyle = 'rgba(255,252,240,0.78)'; c.fillStyle = '#17110a';
    for (i = 0; i < provs.length; i++) {
      var p = provs[i]; if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      var capTag = Game.isCapital(i), major = capTag && Game.nations[capTag].major, room = p.r * ck;
      var showName = major ? room >= 7 && ck >= 0.75 : capTag ? room >= 11 && ck >= 1.1 : room >= 17 && ck >= 1.25;
      var showStar = capTag && (major ? ck >= 0.45 : room >= 8);
      if (!showName && !showStar) continue;
      var X = sx(p.x), Y = sy(p.y);
      if (showStar) { c.font = '11px ' + FONT; c.lineWidth = 2.2; c.strokeText('★', X, Y); c.fillText('★', X, Y); }
      if (showName) {
        c.font = (capTag ? '700 ' : '400 ') + '12.5px ' + FONT; c.lineWidth = 3;
        var yy = capTag ? Y + 12 : Y;
        c.strokeText(p.name, X, yy); c.fillText(p.name, X, yy); shownLabels++;
      }
    }
  }

  // hover and selection sit on their own layer so they never force the whole map to redraw
  function drawOverlay() {
    var c = octx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, over.width, over.height);
    var sel = Game.selected;
    if (hoverId === null && sel === null) { paintExtras(c); return; }
    toWorld(c);
    c.save(); c.clip(landNear(sel !== null && hoverId !== null && hoverId !== sel ? unionBox(provBox[sel], provBox[hoverId]) : provBox[sel !== null ? sel : hoverId]), 'evenodd');
    if (hoverId !== null && hoverId !== sel) { c.fillStyle = 'rgba(255,255,255,0.16)'; c.fill(provP[hoverId]); }
    if (sel !== null) {
      c.fillStyle = 'rgba(255,255,255,0.30)'; c.fill(provP[sel]);
      c.strokeStyle = COL.brass; c.lineWidth = 3 / ck; c.lineJoin = 'round'; c.stroke(provP[sel]);
    }
    c.restore();
    paintExtras(c);
  }
  // armies, battles and routes are drawn by whoever registered a painter, in screen pixels
  function paintExtras(c) {
    if (!painters.length) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var v = { k: ck, x0: (-mx - ctx) / ck, y0: (-my - cty) / ck, x1: (cw + mx - ctx) / ck, y1: (ch + my - cty) / ck,
      sx: function (x) { return x * ck + ctx + mx; }, sy: function (y) { return y * ck + cty + my; },
      world: function () { toWorld(c); }, screen: function () { c.setTransform(dpr, 0, 0, dpr, 0, 0); } };
    for (var i = 0; i < painters.length; i++) painters[i](c, v);
  }

  // the land (coast rings with the lakes punched out) around a box: enough of it to clip a highlight to the shore
  function unionBox(a, b) { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; }
  function landNear(b) {
    var P = new Path2D(), rings = coastRings(), i;
    for (i = 0; i < rings.length; i++) { var r = rings[i].b; if (r[2] < b[0] || r[0] > b[2] || r[3] < b[1] || r[1] > b[3]) continue; P.addPath(rings[i].p); }
    for (i = 0; i < lakeG.length; i++) { var l = lakeG[i].b; if (l[2] < b[0] || l[0] > b[2] || l[3] < b[1] || l[1] > b[3]) continue; P.addPath(lakeG[i].p); }
    return P;
  }
  function onLand(x, y) {
    var rings = coastRings(), inside = false, i;
    for (i = 0; i < rings.length; i++) { var r = rings[i].b; if (x < r[0] || x > r[2] || y < r[1] || y > r[3]) continue; if (hit.isPointInPath(rings[i].p, x, y, 'evenodd')) inside = !inside; }
    if (!inside) return false;
    for (i = 0; i < lakeG.length; i++) { var l = lakeG[i].b; if (x < l[0] || x > l[2] || y < l[1] || y > l[3]) continue; if (hit.isPointInPath(lakeG[i].p, x, y)) return false; }
    return true;
  }
  // Which province is at this point of the stage? null for sea, lakes, unclaimed land or off the map.
  function pick(sx, sy) {
    var x = (sx - tx) / k, y = (sy - ty) / k;
    if (x < 0 || y < 0 || x > W || y > H) return null;
    if (!onLand(x, y)) return null;
    for (var i = 0; i < provP.length; i++) {
      var b = provBox[i]; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (hit.isPointInPath(provP[i], x, y)) return i;
    }
    return null;
  }

  // ---------- view ----------
  function measure() {
    var r = host.getBoundingClientRect();
    cw = Math.max(1, r.width); ch = Math.max(1, r.height);
    mx = Math.round(cw * 0.3); my = Math.round(ch * 0.3); // overscan, so panning shows map rather than blank edges
    var w = cw + 2 * mx, h = ch + 2 * my;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    while (w * dpr * h * dpr > 9e6 && dpr > 1) dpr = Math.max(1, dpr * 0.9); // keep the backing store affordable
    layers.style.left = -mx + 'px'; layers.style.top = -my + 'px';
    layers.style.width = w + 'px'; layers.style.height = h + 'px';
    [base, over].forEach(function (cv) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); });
    minK = Math.min(cw / W, ch / H);
  }
  function clampView() {
    k = Math.max(minK, Math.min(MAX_K, k));
    var mw = W * k, mh = H * k;
    tx = mw <= cw ? (cw - mw) / 2 : Math.min(0, Math.max(cw - mw, tx));
    ty = mh <= ch ? (ch - mh) / 2 : Math.min(0, Math.max(ch - mh, ty));
  }
  // Redraw sharply at the live view.
  function commit() {
    if (commitTimer) { clearTimeout(commitTimer); commitTimer = null; }
    ck = k; ctx = tx; cty = ty; lastCommit = Date.now();
    layers.style.transform = '';
    draw(); drawOverlay();
  }
  // Show the live view by moving the finished picture, and schedule a sharp redraw for when things settle.
  function apply() {
    var s = k / ck, dx = tx + mx - s * (ctx + mx), dy = ty + my - s * (cty + my);
    if (Math.abs(s - 1) < 1e-6 && Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) layers.style.transform = '';
    else layers.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px) scale(' + s.toFixed(5) + ')';
    var far = s > 3 || s < 0.33 || Math.abs(tx - ctx) > mx * 1.5 || Math.abs(ty - cty) > my * 1.5;
    if (far && Date.now() - lastCommit > 450) { commit(); return; }
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = setTimeout(commit, 140);
  }
  function setView(nk, ntx, nty) { k = nk; tx = ntx; ty = nty; clampView(); apply(); }
  function stopAnim() { if (anim) { cancelAnimationFrame(anim); anim = null; } }
  function animateTo(nk, ntx, nty, instant) {
    stopAnim();
    // clamp the target first so the tween ends where the view will rest
    var sk = k, stx = tx, sty = ty; k = nk; tx = ntx; ty = nty; clampView(); nk = k; ntx = tx; nty = ty; k = sk; tx = stx; ty = sty;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (instant || reduce) { k = nk; tx = ntx; ty = nty; commit(); return; }
    var t0 = null, dur = 380;
    // tween the map point at the screen centre and the zoom (log scale): steadier than tweening offsets
    var cx0 = (cw / 2 - stx) / sk, cy0 = (ch / 2 - sty) / sk, cx1 = (cw / 2 - ntx) / nk, cy1 = (ch / 2 - nty) / nk;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var u = Math.min(1, (ts - t0) / dur), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      var kk = sk * Math.pow(nk / sk, e), cx = cx0 + (cx1 - cx0) * e, cy = cy0 + (cy1 - cy0) * e;
      k = kk; tx = cw / 2 - cx * kk; ty = ch / 2 - cy * kk; apply();
      if (u < 1) anim = requestAnimationFrame(step); else { anim = null; k = nk; tx = ntx; ty = nty; commit(); }
    }
    anim = requestAnimationFrame(step);
  }
  function zoomAt(factor, sx, sy, animate) {
    var nk = Math.max(minK, Math.min(MAX_K, k * factor));
    var wx = (sx - tx) / k, wy = (sy - ty) / k;
    if (animate) animateTo(nk, sx - wx * nk, sy - wy * nk); else { stopAnim(); setView(nk, sx - wx * nk, sy - wy * nk); }
  }
  function freeCenter() { return { x: insets.left + (cw - insets.left - insets.right) / 2, y: (ch - insets.bottom) / 2 }; }
  function centerOn(x, y, nk, instant) { var c = freeCenter(); animateTo(nk, c.x - x * nk, c.y - y * nk, instant); }
  function home(animate) {
    // Open on the heart of the map: wide screens see nearly everything, narrow ones start on central Europe.
    var eu = Game.provinceByName && Game.provinceByName('Prague'), ex = eu ? eu.x : W * 0.51, ey = eu ? eu.y + 60 : H * 0.3;
    var nk = Math.max(minK, Math.min(1.2, Math.max(cw / 2700, ch / 1900)));
    animateTo(nk, cw / 2 - ex * nk, ch / 2 - ey * nk, !animate);
  }
  function fit() { animateTo(minK, 0, 0); }
  function focusProvince(id) {
    var p = Game.provinces[id]; if (!p) return;
    var want = Math.min(MAX_K, Math.max(k, Math.min(4.2, 60 / Math.max(4, p.r))));
    centerOn(p.x, p.y, want);
  }
  function focusNation(tag) {
    var ids = []; Game.provinces.forEach(function (p) { if (p.owner === tag) ids.push(p.id); });
    if (!ids.length) return;
    var b = blockBox(ids), fw = Math.max(80, cw - insets.left - insets.right), fh = Math.max(80, ch - insets.bottom);
    var nk = Math.min(fw / (b.x1 - b.x0 + 30), fh / (b.y1 - b.y0 + 30)) * 0.88;
    centerOn((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, Math.max(minK, Math.min(5, nk)));
  }
  // Bring a province into the part of the map that panels do not cover, keeping the current zoom.
  function reveal(id) {
    var p = Game.provinces[id]; if (!p) return;
    var X = p.x * k + tx, Y = p.y * k + ty, pad = 40;
    if (X < insets.left + pad || X > cw - insets.right - pad || Y < pad || Y > ch - insets.bottom - pad) centerOn(p.x, p.y, k);
  }
  function setInsets(i) { insets.left = i.left || 0; insets.right = i.right || 0; insets.bottom = i.bottom || 0; }
  function setMode(m) {
    if (m !== 'political' && m !== 'terrain' && !modeFns[m]) return;
    mode = m; queueRedraw();
  }

  // ---------- input ----------
  // Mouse (laptop): left-click a counter selects it, left-click land shows its country, double-click shows the province,
  // left-drag draws a selection box, right-click gives orders, right- or middle-drag moves the map, the wheel zooms;
  // on a trackpad two-finger scroll moves the map and pinch zooms. Keyboard: W A S D or arrows move the map, + and - zoom.
  // Touch: drag to move, pinch to zoom, tap a counter to pick it, then tap land to march there; tap land for its
  // country, double-tap for the province. With a painting tool on (front lines), one finger paints and two pinch.
  function bindInput() {
    var pointers = {}, count = 0, start = null, pinch = null, moved = false, lastTap = 0, lastTapPos = null;
    var tip = document.getElementById('tooltip'), box = document.getElementById('selbox');
    function pos(e) { var r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function onMap(e) { return e.target === host || layers.contains(e.target); }
    function setHover(id, e) {
      if (id !== hoverId) { hoverId = id; drawOverlay(); }
      if (!tip) return;
      if (id === null) {
        var sn = Game.seaName && e ? Game.seaName((pos(e).x - tx) / k, (pos(e).y - ty) / k) : null;
        if (!sn) { tip.hidden = true; return; }
        tip.textContent = ''; var bi = document.createElement('i'); bi.textContent = sn; tip.appendChild(bi); tip.hidden = false;
        var q0 = pos(e); tip.style.left = Math.max(4, Math.min(cw - tip.offsetWidth - 4, q0.x + 14)) + 'px'; tip.style.top = Math.max(4, Math.min(ch - tip.offsetHeight - 4, q0.y + 16)) + 'px';
        return;
      }
      var p = Game.provinces[id], n = Game.nations[p.owner];
      tip.textContent = ''; var b = document.createElement('b'); b.textContent = p.name; var s = document.createElement('span'); s.textContent = '  ' + n.short;
      tip.appendChild(b); tip.appendChild(s); tip.hidden = false;
      var q = pos(e), tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.max(4, Math.min(cw - tw - 4, q.x + 14)) + 'px';
      tip.style.top = Math.max(4, Math.min(ch - th - 4, q.y + 16)) + 'px';
    }
    function two() { var a = []; for (var id in pointers) a.push(pointers[id]); return a; }
    function showBox(a, b) {
      if (!box) return;
      if (!a) { box.hidden = true; return; }
      box.hidden = false; box.style.left = Math.min(a.x, b.x) + 'px'; box.style.top = Math.min(a.y, b.y) + 'px';
      box.style.width = Math.abs(a.x - b.x) + 'px'; box.style.height = Math.abs(a.y - b.y) + 'px';
    }
    // a click or tap on the map: a tool waiting for a province gets it first, then unit counters, then orders for
    // the divisions you have picked, then the land itself. Returns the province id when the tap fell on plain land,
    // which the caller turns into the owner's country (one tap) or the province (a double tap); null otherwise.
    function click(p, e) {
      var id = pick(p.x, p.y), mod = !!(e.shiftKey || e.ctrlKey || e.metaKey), touch = e.pointerType !== 'mouse';
      if (Game.pick) { var fn = Game.pick; Game.pick = null; fn(id); return null; }
      if (Game.unitClick && Game.unitClick(p.x, p.y, mod)) return null;
      if (Game.mapTap && Game.mapTap(id, { touch: touch, mod: mod })) return null;
      if (id === null) { if (!(Game.seaClick && Game.seaClick((p.x - tx) / k, (p.y - ty) / k))) Game.select(null); return null; }
      if (!Game.provinceClick) { Game.select(id); return null; }
      return id;
    }
    // the country waits a moment, so a panel sliding up over the spot cannot swallow the second tap of a double tap
    var DBL_MS = 300, landTimer = null, landId = null;
    function flushLand() { if (landTimer) { clearTimeout(landTimer); landTimer = null; if (landId !== null) Game.provinceClick(landId); } landId = null; }
    function landTap(id, p) {
      landId = id; lastTap = Date.now(); lastTapPos = p;
      landTimer = setTimeout(function () { landTimer = null; var i = landId; landId = null; if (i !== null) Game.provinceClick(i); }, DBL_MS);
    }
    // dragging with a painting tool (front lines and the like): fill in the provinces between two samples, so a
    // quick swipe does not skip the small ones
    function paintTo(p) {
      var a = start.last || start, dx = p.x - a.x, dy = p.y - a.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 5));
      for (var i = 1; i <= n && Game.paint; i++) Game.paint(pick(a.x + dx * i / n, a.y + dy * i / n));
      start.last = { x: p.x, y: p.y };
    }

    host.addEventListener('pointerdown', function (e) {
      if (!onMap(e)) return;
      var mouse = e.pointerType === 'mouse'; if (mouse && e.button > 2) return;
      stopAnim();
      var p = pos(e); pointers[e.pointerId] = p; count++;
      try { host.setPointerCapture(e.pointerId); } catch (err) { /* not capturable: fine */ }
      if (count === 1) {
        // a finger or left button paints while a painting tool is on; otherwise a finger pans and the left button boxes
        var painting = !!Game.paint && (!mouse || e.button === 0);
        start = { x: p.x, y: p.y, tx: tx, ty: ty, mode: painting ? 'paint' : !mouse ? 'pan' : e.button === 0 ? 'box' : 'pan', button: mouse ? e.button : 0, mouse: mouse };
        moved = false; pinch = null;
      } else if (count === 2) {
        var a = two(), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx2 = (a[0].x + a[1].x) / 2, my2 = (a[0].y + a[1].y) / 2;
        pinch = { d: Math.max(1, d), k: k, wx: (mx2 - tx) / k, wy: (my2 - ty) / k }; moved = true; start = null;
      }
      setHover(null);
      if (mouse && e.button === 1) e.preventDefault();
    });
    host.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) {
        if (e.pointerType === 'mouse') { if (onMap(e)) { var q = pos(e); setHover(pick(q.x, q.y), e); } else setHover(null); }
        return;
      }
      var p = pos(e); pointers[e.pointerId] = p;
      if (count === 1 && start) {
        var dx = p.x - start.x, dy = p.y - start.y;
        if (!moved && Math.hypot(dx, dy) > 6) {
          moved = true;
          if (start.mode === 'pan') host.classList.add('is-dragging');
          else if (start.mode === 'paint' && Game.paint) { Game.paint(pick(start.x, start.y)); start.last = { x: start.x, y: start.y }; }
        }
        if (!moved) return;
        if (start.mode === 'pan') setView(k, start.tx + dx, start.ty + dy);
        else if (start.mode === 'box') showBox(start, p);
        else if (start.mode === 'paint' && Game.paint) paintTo(p);
      } else if (count >= 2 && pinch) {
        var a = two(), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx2 = (a[0].x + a[1].x) / 2, my2 = (a[0].y + a[1].y) / 2;
        var nk = Math.max(minK, Math.min(MAX_K, pinch.k * d / pinch.d));
        setView(nk, mx2 - pinch.wx * nk, my2 - pinch.wy * nk);
      }
    });
    function up(e) {
      if (!pointers[e.pointerId]) return;
      delete pointers[e.pointerId]; count = Math.max(0, count - 1);
      try { host.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      if (count === 0) {
        host.classList.remove('is-dragging'); showBox(null);
        var p = pos(e), ok = e.type === 'pointerup' && start;
        if (ok && !moved) {
          if (start.mouse && start.button === 2) { var id = pick(p.x, p.y); if (id !== null) Game.emit('context', id, { shift: e.shiftKey }); else Game.emit('seaContext', { x: (p.x - tx) / k, y: (p.y - ty) / k }); }
          else if (start.mouse && start.button === 1) { /* middle click: nothing */ }
          else {
            // left click or tap; a second one quickly in the same spot opens the province (pinch or the wheel zooms)
            var now = Date.now(), near = lastTapPos && Math.hypot(p.x - lastTapPos.x, p.y - lastTapPos.y) < (start.mouse ? 8 : 24);
            if (landTimer && now - lastTap < DBL_MS + 50 && near) { clearTimeout(landTimer); landTimer = null; var dId = landId; landId = null; Game.select(dId); }
            else { flushLand(); var land = click(p, e); if (land !== null) landTap(land, p); }
          }
        } else if (ok && moved) {
          if (start.mode === 'box') Game.emit('box', { x0: Math.min(start.x, p.x), y0: Math.min(start.y, p.y), x1: Math.max(start.x, p.x), y1: Math.max(start.y, p.y) }, { shift: e.shiftKey });
          else if (start.mode === 'paint' && Game.paintEnd) Game.paintEnd();
        }
        start = null; pinch = null;
      } else if (count === 1) {
        // one finger left after a pinch: carry on as a pan, never as a tap
        var rest = two()[0]; start = { x: rest.x, y: rest.y, tx: tx, ty: ty, mode: 'pan', button: 0, mouse: false }; pinch = null; moved = true;
      }
    }
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
    host.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !pointers[e.pointerId]) setHover(null); });
    host.addEventListener('contextmenu', function (e) { if (onMap(e)) e.preventDefault(); });
    host.addEventListener('wheel', function (e) {
      if (!onMap(e)) return;
      e.preventDefault();
      var p = pos(e), dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 30 : e.deltaX;
      if (e.ctrlKey) { zoomAt(Math.exp(-dy * 0.012), p.x, p.y, false); return; }                 // pinch on a trackpad
      var wheel = dx === 0 && Math.abs(dy) >= 50 && dy === Math.round(dy);                         // a mouse wheel moves in big whole steps
      if (wheel) zoomAt(Math.exp(-dy * 0.0016), p.x, p.y, false);
      else { stopAnim(); setView(k, tx - dx, ty - dy); }                                           // two fingers on a trackpad: move the map
    }, { passive: false });
    document.addEventListener('keydown', function (e) {
      var t = e.target, tagName = t && t.tagName; if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      var step = 110, c = freeCenter(), key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'ArrowLeft' || key === 'a') setView(k, tx + step, ty);
      else if (key === 'ArrowRight' || key === 'd') setView(k, tx - step, ty);
      else if (key === 'ArrowUp' || key === 'w') setView(k, tx, ty + step);
      else if (key === 'ArrowDown' || key === 's') setView(k, tx, ty - step);
      else if (key === '+' || key === '=') zoomAt(1.5, c.x, c.y, true);
      else if (key === '-' || key === '_') zoomAt(1 / 1.5, c.x, c.y, true);
      else return;
      e.preventDefault();
    });
  }

  window.MapView = {
    init: init, setMode: setMode, fit: fit, home: home, focusProvince: focusProvince, focusNation: focusNation, setInsets: setInsets,
    focusPoint: function (x, y, nk) { centerOn(x, y, Math.min(MAX_K, Math.max(k, nk || 0.9))); },
    zoomIn: function () { var c = freeCenter(); zoomAt(1.6, c.x, c.y, true); },
    zoomOut: function () { var c = freeCenter(); zoomAt(1 / 1.6, c.x, c.y, true); },
    view: function () { return { k: k, tx: tx, ty: ty, minK: minK, maxK: MAX_K, width: cw, height: ch }; },
    // the borders between provinces chosen by a test on each pair of neighbours, as a drawable path in map units
    borderPath: function (test) { return new Path2D(geomPath(topojson.mesh(topo, obj, function (a, b) { return a !== b && (test(a.id, b.id) || test(b.id, a.id)); }))); },
    toStage: function (x, y) { return { x: x * k + tx, y: y * k + ty }; },
    addMode: function (name, fn) { modeFns[name] = fn; }, addPainter: function (fn) { painters.push(fn); }, refreshOverlay: function () { drawOverlay(); }, mode: function () { return mode; },
    reveal: reveal, pick: pick, colorOf: colorOf, labelsShown: function () { return shownLabels; }, redraw: queueRedraw
  };
})();
