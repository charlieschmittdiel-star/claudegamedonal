// The navy on screen: sea regions and their borders, fleet counters at sea and in harbour, sea battles and
// blockades on the map; the sea panel (click the water) with fleet orders; and the Navy tab.
(function () {
  'use strict';
  var h = UI.h, num = UI.num;
  function $(id) { return document.getElementById(id); }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function money(v) { return EconUI.money(v); }
  function toast(text, kind) {
    var box = $('toasts'), t = h('div', 'toast' + (kind ? ' ' + kind : ''), text); box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5200);
  }
  function bar(v, cls) { var w = h('span', 'nbar' + (cls ? ' ' + cls : '')), i = h('i'); i.style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%'; w.appendChild(i); return w; }
  var S = War.SHIPS, ORDER = War.SHIP_ORDER, M = War.MISSIONS;
  var selFleet = null;

  // ---------- which sea is under a point ----------
  var grid = null;
  function decodeGrid() {
    var G = MAP.seaGrid; if (!G) return;
    var CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' + Array.from({ length: 120 }, function (_, i) { return String.fromCharCode(0xC0 + i); }).join(''), cells = new Int8Array(G.w * G.h).fill(-1), rows = G.rows.split('|');
    for (var y = 0; y < G.h; y++) {
      var re = /(.)(\d+)/g, m, x = 0;
      while ((m = re.exec(rows[y] || '')) && x < G.w) { var z = m[1] === '.' ? -1 : CH.indexOf(m[1]), n = +m[2]; for (var i = 0; i < n && x < G.w; i++) cells[y * G.w + x++] = z; }
    }
    grid = { cell: G.cell, w: G.w, h: G.h, z: cells };
  }
  function zoneAt(wx, wy) {
    if (!grid) return null;
    var gx = Math.floor(wx / grid.cell), gy = Math.floor(wy / grid.cell);
    for (var r = 0; r <= 2; r++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      var x = gx + dx, y = gy + dy; if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue;
      var z = grid.z[y * grid.w + x]; if (z >= 0) return z;
    }
    return null;
  }

  // ---------- fleets on the map ----------
  function myFleet(f) { return f && f.tag === Game.player; }
  function visibleFleet(f) {
    var pl = Game.player; if (!pl || !War.fog || War.allied(pl, f.tag)) return true;
    return f.inPort ? War.seen(f.base) >= 1 : War.seaSeen(pl, f.zone) === 2;
  }
  // where each fleet sits, in map units: at sea by its region (sliding along its route), in harbour beside its port
  function fleetSpot(f) {
    if (f.inPort) { var p = Game.provinces[f.base]; return { x: p.x, y: p.y, port: true, key: 'p' + f.base }; }
    var z = War.seas[f.zone];
    if (f.path.length) {
      var n = War.seas[f.path[0]], need = Math.max(1, Math.ceil(War.seaKm(f.zone, f.path[0]) / (War.fleetSpeed(f) * 26))), t = Math.min(1, f.prog / need);
      return { x: z.x + (n.x - z.x) * t, y: z.y + (n.y - z.y) * t, key: 'm' + f.id };
    }
    return { x: z.x, y: z.y, key: 'z' + f.zone };
  }
  var hits = [];
  function layout(k) {
    var groups = {}, order = [];
    War.fleets.forEach(function (f) {
      if (!f.ships.length || !visibleFleet(f)) return;
      var s = fleetSpot(f), g = groups[s.key]; if (!g) { g = groups[s.key] = { x: s.x, y: s.y, port: s.port, list: [] }; order.push(g); } g.list.push(f);
    });
    var out = [], big = k >= 1.1, w = big ? 30 : 24, ht = big ? 15 : 12;
    order.forEach(function (g) {
      g.list.sort(function (a, b) { return (a.tag === Game.player ? 0 : 1) - (b.tag === Game.player ? 0 : 1) || b.ships.length - a.ships.length; });
      var show = g.list.slice(0, 6), n = show.length;
      show.forEach(function (f, i) {
        var ox = (i - (n - 1) / 2) * (w + 3), oy = g.port ? (big ? 12 : 8) : -ht / 2;
        out.push({ f: f, wx: g.x, wy: g.y, ox: ox - w / 2, oy: oy, w: w, h: ht, port: g.port });
      });
    });
    return out;
  }
  function hullPath(c, x, y, w, hgt) { // a small ship: hull and a sail
    c.beginPath(); c.moveTo(x, y + hgt * 0.55); c.lineTo(x + w, y + hgt * 0.55); c.lineTo(x + w * 0.8, y + hgt); c.lineTo(x + w * 0.2, y + hgt); c.closePath();
    c.moveTo(x + w * 0.45, y); c.lineTo(x + w * 0.45, y + hgt * 0.5); c.lineTo(x + w * 0.1, y + hgt * 0.45); c.closePath();
  }
  function lum(hex) { var n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
  var borderP = null;
  function paint(c, v) {
    if (!War.seas || !War.seas.length) return;
    var k = v.k, pl = Game.player;
    // sea borders and names
    if (!borderP && MAP.seaBorders) { borderP = new Path2D(); MAP.seaBorders.forEach(function (L) { borderP.moveTo(L[0][0], L[0][1]); for (var i = 1; i < L.length; i++) borderP.lineTo(L[i][0], L[i][1]); }); }
    var uv = UI.view(), selZone = uv && uv.type === 'sea' ? uv.zone : null;
    if (borderP) { v.world(); c.strokeStyle = 'rgba(28,58,86,0.42)'; c.lineWidth = 1.1 / k; c.setLineDash([5 / k, 4 / k]); c.stroke(borderP); c.setLineDash([]); v.screen(); }
    if (k >= 0.42) {
      c.textAlign = 'center'; c.textBaseline = 'middle';
      War.seas.forEach(function (z) {
        if (z.lx < v.x0 - 200 || z.lx > v.x1 + 200 || z.ly < v.y0 - 50 || z.ly > v.y1 + 50) return;
        var X = v.sx(z.lx), Y = v.sy(z.ly) + (z.lx === z.x && z.ly === z.y ? 22 : 0), on = z.id === selZone;
        c.font = 'italic ' + (on ? '700 ' : '') + Math.round(Math.max(10, Math.min(15, 9 + k * 3))) + 'px Spectral, Georgia, serif';
        c.fillStyle = on ? 'rgba(20,40,64,0.95)' : 'rgba(30,62,92,0.62)'; c.fillText(z.name, X, Y);
        if (pl && on) { var sp = War.superiority(pl, z.id); if (War.enemyPowerAt(pl, z.id) > 0 || sp !== 0.5) { var bw = 60; c.fillStyle = 'rgba(20,14,8,0.6)'; c.fillRect(X - bw / 2, Y + 9, bw, 4); c.fillStyle = sp >= 0.5 ? '#3f8a4a' : '#b3261e'; c.fillRect(X - bw / 2, Y + 9, bw * sp, 4); } }
      });
    }
    // blockaded harbours
    if (pl && k >= 0.5) {
      Game.provinces.forEach(function (p) {
        if (!p.coastal || p.sea < 0 || !(Econ.P[p.id].b.port > 0) || p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) return;
        if (p.ctrl !== pl && !War.atWar(pl, p.ctrl)) return;
        if (!War.blockaded(p.id, p.ctrl)) return;
        var X = v.sx(p.x), Y = v.sy(p.y); c.strokeStyle = p.ctrl === pl ? '#b3261e' : '#2f6fb0'; c.lineWidth = 2; c.setLineDash([3, 3]); c.beginPath(); c.arc(X, Y, 9, 0, 6.2832); c.stroke(); c.setLineDash([]);
      });
    }
    // the selected fleet's route
    var sf = selFleet !== null ? War.fleetById(selFleet) : null;
    if (sf && myFleet(sf)) {
      var sp0 = fleetSpot(sf), pts = [[sp0.x, sp0.y]];
      if (sf.path.length) sf.path.forEach(function (z) { pts.push([War.seas[z].x, War.seas[z].y]); });
      else if (!sf.inPort && sf.mission !== 'hold' && sf.target !== sf.zone) { var r = War.seaRoute(sf.zone, sf.target) || []; r.forEach(function (z) { pts.push([War.seas[z].x, War.seas[z].y]); }); }
      if (pts.length > 1) { c.strokeStyle = '#f2ead6'; c.lineWidth = 2; c.setLineDash([6, 5]); c.beginPath(); c.moveTo(v.sx(pts[0][0]), v.sy(pts[0][1])); for (var i = 1; i < pts.length; i++) c.lineTo(v.sx(pts[i][0]), v.sy(pts[i][1])); c.stroke(); c.setLineDash([]); }
      if (sf.mission !== 'hold') { var tz = War.seas[sf.target]; c.strokeStyle = '#d0a94f'; c.lineWidth = 2; c.beginPath(); c.arc(v.sx(tz.x), v.sy(tz.y), 16, 0, 6.2832); c.stroke(); }
    }
    // fleet counters
    hits = [];
    var mv = MapView.view();
    layout(k).forEach(function (r) {
      var f = r.f, X = v.sx(r.wx) + r.ox, Y = v.sy(r.wy) + r.oy, col = Game.nations[f.tag].color, sel = f.id === selFleet;
      if (r.wx < v.x0 - 50 || r.wx > v.x1 + 50 || r.wy < v.y0 - 50 || r.wy > v.y1 + 50) return;
      hits.push({ id: f.id, x: r.wx * mv.k + mv.tx + r.ox, y: r.wy * mv.k + mv.ty + r.oy, w: r.w, h: r.h });
      if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 4; c.strokeRect(X - 1, Y - 1, r.w + 2, r.h + 2); }
      c.fillStyle = 'rgba(10,8,5,0.35)'; c.fillRect(X + 1.5, Y + 2, r.w, r.h + 3);
      c.fillStyle = col; c.strokeStyle = f.tag === pl ? '#d0a94f' : pl && War.atWar(pl, f.tag) ? '#b3261e' : '#14100a'; c.lineWidth = f.tag === pl ? 2 : 1.2;
      c.beginPath(); c.rect(X, Y, r.w, r.h); c.fill(); c.stroke();
      var ink = lum(col) < 0.5 ? '#fff' : '#111'; c.fillStyle = ink; c.strokeStyle = ink;
      hullPath(c, X + 2, Y + 2, r.h - 3, r.h - 4); c.fill();
      c.font = '700 ' + (r.h >= 15 ? 10 : 9) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      var cnt = War.fleetCount(f), heavyN = cnt.first + cnt.line, label = heavyN ? String(heavyN) + (cnt.frig + cnt.brig ? '+' : '') : String(f.ships.length);
      var known = !pl || War.allied(pl, f.tag) || !War.fog || (!f.inPort && War.seaSeen(pl, f.zone) === 2);
      c.fillText(known ? label : '?', X + r.h - 1 + (r.w - r.h + 1) / 2, Y + r.h / 2 + 0.5);
      if (known && !f.inPort) { var hp = War.fleetHp(f); c.fillStyle = '#14100a'; c.fillRect(X, Y + r.h, r.w, 3); c.fillStyle = '#7fc46a'; c.fillRect(X, Y + r.h, r.w * hp, 1.5); c.fillStyle = '#e3c15a'; c.fillRect(X, Y + r.h + 1.5, r.w * f.org, 1.5); }
      if (f.inPort && known) { c.fillStyle = 'rgba(20,14,8,0.85)'; c.fillRect(X + r.w - 5, Y - 3, 6, 6); c.fillStyle = '#f2ead6'; c.font = '700 7px system-ui'; c.fillText('⚓', X + r.w - 2, Y + 0.5); }
    });
    // sea battles
    War.navalBattles.forEach(function (bt) {
      var z = War.seas[bt.zone], X = v.sx(z.x), Y = v.sy(z.y) + 14, rr = k >= 1.1 ? 9 : 7;
      c.fillStyle = '#b3261e'; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(X, Y, rr, 0, 6.2832); c.fill(); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(X - rr * 0.5, Y - rr * 0.5); c.lineTo(X + rr * 0.5, Y + rr * 0.5); c.moveTo(X + rr * 0.5, Y - rr * 0.5); c.lineTo(X - rr * 0.5, Y + rr * 0.5); c.stroke();
    });
  }
  function fleetAt(sx, sy) {
    for (var i = hits.length - 1; i >= 0; i--) { var r = hits[i]; if (sx >= r.x - 2 && sx <= r.x + r.w + 2 && sy >= r.y - 2 && sy <= r.y + r.h + 4) return War.fleetById(r.id); }
    return null;
  }
  function selectFleet(f) {
    selFleet = f ? f.id : null;
    if (f) UI.showSea(f.inPort ? Game.provinces[f.base].sea : f.zone);
    MapView.refreshOverlay();
  }

  // ---------- sea panel ----------
  function seaPanel(zone) {
    var z = War.seas[zone], pl = Game.player, wrap = h('div');
    var head = h('div'); head.appendChild(h('div', 'p-kicker', 'Sea region')); head.appendChild(h('h2', 'p-title', z.name)); wrap.appendChild(head);
    var dl = h('dl', 'facts');
    function row(k, val) { dl.appendChild(h('dt', null, k)); var dd = h('dd'); if (typeof val === 'string') dd.textContent = val; else dd.appendChild(val); dl.appendChild(dd); }
    var nbs = h('span', 'sea-links'); z.adj.forEach(function (a, i) { if (i) nbs.appendChild(document.createTextNode(', ')); var l = btn('link', War.seas[a].name, function () { UI.showSea(a); MapView.focusPoint(War.seas[a].x, War.seas[a].y); }); nbs.appendChild(l); });
    row('Neighbouring seas', z.adj.length ? nbs : 'None: a landlocked sea');
    var ports = z.coast.filter(function (id) { return Econ.P[id].b.port > 0; });
    row('Harbours', ports.length ? ports.length + ' (' + ports.slice(0, 5).map(function (id) { return Game.provinces[id].name; }).join(', ') + (ports.length > 5 ? '…' : '') + ')' : 'None');
    if (pl) {
      var seen = War.seaSeen(pl, zone), sp = War.superiority(pl, zone), foe = War.enemyPowerAt(pl, zone);
      var ctl = h('span'); ctl.appendChild(bar(sp, sp >= 0.5 ? 'good' : 'bad')); ctl.appendChild(document.createTextNode(' ' + (seen < 2 ? 'Unknown: no ships or coast of yours here' : foe < 0.01 && sp === 0.5 ? 'No enemy warships seen' : 'You hold ' + pct(sp))));
      row('Naval superiority', ctl);
      var shut = ports.filter(function (id) { return War.blockaded(id, Game.provinces[id].ctrl) && (Game.provinces[id].ctrl === pl || War.atWar(pl, Game.provinces[id].ctrl)); });
      if (shut.length) row('Blockaded', shut.map(function (id) { return Game.provinces[id].name + (Game.provinces[id].ctrl === pl ? ' (yours)' : ''); }).join(', '));
    }
    wrap.appendChild(dl);

    var bt = War.navalBattleIn(zone);
    if (bt) {
      var bx = h('div', 'battle'); bx.appendChild(h('h3', 'p-sub', 'Battle under way, day ' + bt.day));
      [0, 1].forEach(function (k2) {
        var fl = War.battleFleets(bt, k2), c = { first: 0, line: 0, frig: 0, brig: 0 }, hp = 0, n = 0;
        fl.forEach(function (f) { f.ships.forEach(function (s) { c[s.t]++; hp += s.hp / War.shipStat(f.tag, s.t, 'hp'); n++; }); });
        var r = h('div', 'army'), sw = h('span', 'swatch'); sw.style.background = Game.nations[bt.tags[k2]].color; r.appendChild(sw);
        r.appendChild(h('strong', null, Game.nations[bt.tags[k2]].short)); r.appendChild(h('span', null, shipText(c) + ' · hulls ' + pct(n ? hp / n : 0) + ' · lost ' + (bt.sunk[k2].length)));
        bx.appendChild(r);
      });
      wrap.appendChild(bx);
    }

    // fleets here: at sea in the region, and in its harbours
    var here = War.fleets.filter(function (f) { return f.ships.length && ((!f.inPort && f.zone === zone) || (f.inPort && Game.provinces[f.base].sea === zone)) && visibleFleet(f); });
    var mine = here.filter(myFleet), others = here.filter(function (f) { return !myFleet(f); });
    var sf = selFleet !== null ? War.fleetById(selFleet) : null;
    if (sf && myFleet(sf)) wrap.appendChild(fleetCard(sf));
    if (mine.length) {
      wrap.appendChild(h('h3', 'p-sub', 'Your fleets here'));
      mine.forEach(function (f) { wrap.appendChild(fleetRow(f)); });
    }
    if (others.length) {
      wrap.appendChild(h('h3', 'p-sub', mine.length ? 'Other fleets' : 'Fleets here'));
      others.forEach(function (f) {
        var r = h('div', 'army' + (pl && War.atWar(pl, f.tag) ? ' enemy' : pl && War.allied(pl, f.tag) ? ' ally' : '')), sw = h('span', 'swatch'); sw.style.background = Game.nations[f.tag].color;
        r.appendChild(sw); r.appendChild(h('strong', null, Game.nations[f.tag].short));
        var known = !pl || !War.fog || War.allied(pl, f.tag) || (!f.inPort && War.seaSeen(pl, zone) === 2);
        r.appendChild(h('span', null, (known ? f.name + ': ' + shipText(War.fleetCount(f)) : 'Warships, numbers unknown') + (f.inPort ? ' · in ' + Game.provinces[f.base].name : ' · ' + M[f.mission].name.toLowerCase())));
        wrap.appendChild(r);
      });
    }
    if (!here.length) wrap.appendChild(h('p', 'note', pl && War.fog && War.seaSeen(pl, zone) < 2 ? 'Fog of war: send a ship here to see who sails these waters.' : 'No warships in these waters.'));
    if (pl && mine.length === 0 && !sf) wrap.appendChild(h('p', 'note', 'Click one of your fleet counters (ships on the water or anchored by a harbour) to give it orders. With a fleet selected, right-click a sea to send it there, or a harbour of yours to base it there.'));
    return wrap;
  }
  function shipText(c) {
    var parts = []; ORDER.forEach(function (t) { if (c[t]) parts.push(c[t] + ' ' + (c[t] === 1 ? S[t].name : S[t].plural).toLowerCase()); });
    return parts.join(', ') || 'no ships';
  }
  function where(f) {
    if (f.battle !== null) return 'In battle';
    if (f.inPort) { var hp = War.fleetHp(f); return 'In ' + Game.provinces[f.base].name + (hp < 0.99 ? ', repairing (' + pct(hp) + ')' : f.org < 0.99 ? ', resting' : ''); }
    if (f.home) return 'Returning to ' + Game.provinces[f.base].name;
    if (f.path.length) return 'Sailing to the ' + War.seas[f.path[f.path.length - 1]].name;
    return M[f.mission].name + ' in the ' + War.seas[f.zone].name;
  }
  function fleetRow(f) {
    var r = h('button', 'fleetrow' + (f.id === selFleet ? ' is-on' : '')); r.type = 'button';
    var c = War.fleetCount(f), t = h('span', 'divtxt'); t.appendChild(h('strong', null, f.name)); t.appendChild(h('span', null, shipText(c) + ' · ' + where(f)));
    r.appendChild(t);
    var bars = h('span', 'divbars'); bars.title = 'Hulls ' + pct(War.fleetHp(f)) + ', organisation ' + pct(f.org);
    var b1 = h('i', 'str'), b2 = h('i', 'org'); b1.style.width = Math.round(War.fleetHp(f) * 100) + '%'; b2.style.width = Math.round(f.org * 100) + '%';
    var w1 = h('span'), w2 = h('span'); w1.appendChild(b1); w2.appendChild(b2); bars.appendChild(w1); bars.appendChild(w2); r.appendChild(bars);
    r.addEventListener('click', function () { selectFleet(f.id === selFleet ? null : f); var s = fleetSpot(f); MapView.focusPoint(s.x, s.y); });
    return r;
  }
  function fleetCard(f) {
    var box = h('div', 'fleetcard'), pl = Game.player;
    var top = h('div', 'fc-head'); top.appendChild(h('strong', null, f.name)); top.appendChild(btn('ghost small', 'Deselect', function () { selectFleet(null); UI.refresh(); }));
    box.appendChild(top); box.appendChild(h('p', 'note', where(f)));
    var dl = h('dl', 'facts');
    function row(k, val) { dl.appendChild(h('dt', null, k)); var dd = h('dd'); if (typeof val === 'string') dd.textContent = val; else dd.appendChild(val); dl.appendChild(dd); }
    var c = War.fleetCount(f);
    row('Ships', shipText(c));
    var hp = h('span'); hp.appendChild(bar(War.fleetHp(f), 'good')); hp.appendChild(document.createTextNode(' ' + pct(War.fleetHp(f)))); row('Hulls', hp);
    var og = h('span'); og.appendChild(bar(f.org, 'org')); og.appendChild(document.createTextNode(' ' + pct(f.org))); row('Organisation', og);
    row('Fighting strength', (War.fleetPower(f)).toFixed(1) + ' (one fresh ship of the line ≈ 1)');
    // admiral
    var sel = document.createElement('select'); sel.className = 'adm-select';
    var none = document.createElement('option'); none.value = ''; none.textContent = 'No admiral'; sel.appendChild(none);
    War.admirals.filter(function (a) { return a.tag === f.tag; }).forEach(function (a) {
      var o = document.createElement('option'); o.value = a.id; o.textContent = a.name + ' ' + '★'.repeat(a.skill) + (a.trait ? ' · ' + a.trait : '') + (a.fleet !== null && a.fleet !== f.id ? ' (with ' + ((War.fleetById(a.fleet) || {}).name || 'a fleet') + ')' : '');
      if (f.adm === a.id) o.selected = true; sel.appendChild(o);
    });
    sel.addEventListener('change', function () { if (sel.value === '') { if (f.adm !== null) War.admirals[f.adm].fleet = null; f.adm = null; } else War.setAdmiral(f, +sel.value); Game.save(); UI.refresh(); MapView.refreshOverlay(); });
    row('Admiral', sel);
    var adm = War.admiral(f.adm); if (adm && adm.trait) row('Trait', War.ADM_TRAITS[adm.trait]);
    box.appendChild(dl);
    // missions
    box.appendChild(h('h4', 'p-sub', 'Mission'));
    var ms = h('div', 'missions');
    Object.keys(M).forEach(function (m) {
      var b = btn('chip' + (f.mission === m ? ' is-on' : ''), M[m].name, function () {
        var why = War.setMission(f, m, m === 'hold' ? null : f.target); if (why) toast(why, 'bad'); Game.save(); UI.refresh(); MapView.refreshOverlay();
      }, M[m].blurb); ms.appendChild(b);
    });
    box.appendChild(ms);
    box.appendChild(h('p', 'note', M[f.mission].blurb + (f.mission !== 'hold' ? ' Station: the ' + War.seas[f.target].name + '. Right-click any sea to change it.' : ' Right-click a sea to send it out on patrol there.')));
    // base and repairs
    var row2 = h('div', 'fc-row');
    var bs = document.createElement('select'), bases = Game.provinces.filter(function (p) { return War.baseOk(f.tag, p.id) && War.seaRoute(f.inPort ? Game.provinces[f.base].sea : f.zone, p.sea) !== null; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    bases.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = 'Base: ' + p.name + ((Econ.P[p.id].b.dockyard || 0) ? ' (dockyard ' + Econ.P[p.id].b.dockyard + ')' : ''); if (p.id === f.base) o.selected = true; bs.appendChild(o); });
    bs.addEventListener('change', function () { var why = War.setBase(f, +bs.value); if (why) toast(why, 'bad'); Game.save(); UI.refresh(); MapView.refreshOverlay(); });
    var rs = document.createElement('select');
    [[0.25, 'Repair below 25%'], [0.5, 'Repair below 50%'], [0.75, 'Repair below 75%']].forEach(function (x) { var o = document.createElement('option'); o.value = x[0]; o.textContent = x[1]; if (Math.abs(f.repairAt - x[0]) < 0.01) o.selected = true; rs.appendChild(o); });
    rs.addEventListener('change', function () { f.repairAt = +rs.value; Game.save(); });
    row2.appendChild(bs); row2.appendChild(rs); box.appendChild(row2);
    // organising
    var acts = h('div', 'acts');
    acts.appendChild(btn('ghost', 'Split in two', function () { var g = War.splitFleet(f); if (!g) toast('Too few ships to split', 'bad'); else { g.name = f.name + ' (detached)'; selFleet = g.id; } Game.save(); UI.refresh(); MapView.refreshOverlay(); }));
    if (c.frig + c.brig && c.first + c.line) acts.appendChild(btn('ghost', 'Detach cruisers', function () { var g = War.detach(f, 'screen'); if (g) { g.name = f.name + ' cruisers'; toast('Frigates and brigs formed into ' + g.name + ', escorting convoys'); } Game.save(); UI.refresh(); MapView.refreshOverlay(); }, 'Frigates and brigs leave to form their own squadron'));
    var mates = War.fleets.filter(function (g) { return g !== f && g.tag === f.tag && g.inPort === f.inPort && (f.inPort ? g.base === f.base : g.zone === f.zone && !g.path.length && !f.path.length) && g.battle === null; });
    mates.forEach(function (g) { acts.appendChild(btn('ghost', 'Merge ' + g.name, function () { var why = War.mergeFleets(f, g); if (why) toast(why, 'bad'); Game.save(); UI.refresh(); MapView.refreshOverlay(); })); });
    box.appendChild(acts);
    // the ships
    var det = document.createElement('details'), sum = document.createElement('summary'); sum.textContent = 'Ships (' + f.ships.length + ')'; det.appendChild(sum);
    var ul = h('ul', 'shiplist');
    f.ships.slice().sort(function (a, b) { return ORDER.indexOf(a.t) - ORDER.indexOf(b.t); }).forEach(function (s) {
      var li = h('li'); li.appendChild(h('span', null, (s.name || S[s.t].name) + (s.name ? ' · ' + S[s.t].name.toLowerCase() : '') + (s.prize ? ' (prize, ex-' + Game.nations[s.prize].short + ')' : '')));
      li.appendChild(bar(s.hp / War.shipStat(f.tag, s.t, 'hp'), 'good')); ul.appendChild(li);
    });
    det.appendChild(ul); box.appendChild(det);
    if (pl && f.tag !== pl) return h('div');
    return box;
  }

  // ---------- Navy tab ----------
  function navyTab(body, tag, mine) {
    var nv = War.NV[tag], n = Econ.N[tag]; if (!nv) { body.appendChild(h('p', 'note', 'No navy.')); return; }
    var c = War.shipsOf(tag), hero = h('div', 'hero');
    var a = h('div'); a.appendChild(h('div', 'p-kicker', 'Ships of the line')); a.appendChild(h('div', 'big', String(c.first + c.line)));
    var b = h('div'); b.appendChild(h('div', 'p-kicker', 'Frigates and brigs')); b.appendChild(h('div', 'big', String(c.frig + c.brig)));
    var d = h('div'); d.appendChild(h('div', 'p-kicker', 'Convoys')); d.appendChild(h('div', 'big', String(Math.floor(nv.convoys))));
    hero.appendChild(a); hero.appendChild(b); hero.appendChild(d); body.appendChild(hero);
    var dl = h('dl', 'facts');
    function row(k, val) { dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, val)); }
    row('Fleet', shipText(c));
    var used = War.convoysUsed(tag), need = War.convoyNeed(tag);
    row('Merchantmen', Math.floor(nv.convoys) + ' convoys; trade needs about ' + need + (used ? '; ' + used + ' carrying troops' : '') + (nv.convoys < need ? ' (short: foreign trade suffers)' : ''));
    row('Dockyards', War.dockyards(tag) + ' levels: ' + Math.round(War.dockPts(tag)) + ' points of work a month');
    row('Monthly cost', money(-(nv.cost || 0)) + ' (upkeep ' + money(-(nv.upCost || 0)) + ', building ' + money(-(nv.buildCost || 0)) + ')');
    var blk = War.blockadeShare(tag); if (n.ports) row('Harbours blockaded', pct(blk) + (blk > 0 ? ': foreign trade is choked' : ''));
    var st = nv.stats; row('War at sea', 'Enemy ships sunk ' + st.sunk + ', taken ' + st.prizes + ' · own lost ' + st.lost + ' · convoys taken ' + st.convSunk + ', lost ' + st.convLost);
    body.appendChild(dl);

    body.appendChild(h('h3', 'p-sub', 'Shipbuilding'));
    if (mine) {
      var pts = War.dockPts(tag), adds = h('div', 'shipadd');
      ORDER.concat(['convoy']).forEach(function (t) {
        var def = t === 'convoy' ? War.CONVOY : S[t], months = pts ? Math.max(1, Math.round(def.pts / pts * 10) / 10) : 0;
        var bb = btn('ghost', '+ ' + (t === 'convoy' ? 'Convoy' : def.name), function () { var why = War.queueShip(tag, t); if (why) toast(why, 'bad'); Game.save(); EconUI.refresh(true); },
          def.pts + ' points of work' + (pts ? ', about ' + months + ' months with all your dockyards' : '') + (t === 'convoy' ? '; adds 10 merchantmen' : '; ' + def.guns + ' guns, crew ' + def.crew + ', upkeep ƒ' + def.upkeep + ' a month'));
        adds.appendChild(bb);
      });
      body.appendChild(adds);
    }
    if (!War.dockyards(tag)) body.appendChild(h('p', 'note', 'No dockyards. Build one in a harbour province (Industry, on the province panel) to lay down ships.'));
    if (nv.queue.length) {
      var ul = h('ul', 'queue');
      nv.queue.forEach(function (q, i) {
        var def = q.t === 'convoy' ? War.CONVOY : S[q.t], li = h('li');
        li.appendChild(h('span', null, (q.t === 'convoy' ? 'Convoy' : def.name) + (i === 0 ? '' : ' (waiting)')));
        li.appendChild(bar(q.prog / def.pts, 'good'));
        if (mine) li.appendChild(btn('x', '×', function () { War.unqueueShip(tag, i); Game.save(); EconUI.refresh(true); }, 'Cancel'));
        ul.appendChild(li);
      });
      body.appendChild(ul);
      if (nv.fill !== undefined && nv.fill < 0.95) body.appendChild(h('p', 'note warn', 'The dockyards are short of timber, iron or sailcloth: work runs at ' + pct(nv.fill) + '.'));
    } else body.appendChild(h('p', 'note', 'Nothing on the slipways.'));

    var fl = War.fleets.filter(function (f) { return f.tag === tag && f.ships.length; });
    body.appendChild(h('h3', 'p-sub', 'Fleets (' + fl.length + ')'));
    if (!fl.length) body.appendChild(h('p', 'note', 'No warships.'));
    fl.forEach(function (f) { var r = fleetRow(f); r.addEventListener('click', function () { if (UI.isPhone()) $('economy').hidden = true; }); body.appendChild(r); });

    var adms = War.admirals.filter(function (x) { return x.tag === tag; });
    if (adms.length) {
      body.appendChild(h('h3', 'p-sub', 'Admirals'));
      var al = h('ul', 'gens');
      adms.forEach(function (x) { var li = h('li'); li.appendChild(h('strong', null, x.name + ' ' + '★'.repeat(x.skill))); li.appendChild(h('span', null, (x.trait ? War.ADM_TRAITS[x.trait] : 'No special trait') + ' · ' + (x.fleet !== null && War.fleetById(x.fleet) ? War.fleetById(x.fleet).name : 'ashore'))); al.appendChild(li); });
      body.appendChild(al);
    }
    var log = (War.seaLog || []).slice(-8).reverse();
    if (log.length) {
      body.appendChild(h('h3', 'p-sub', 'Sea battles'));
      var nl = h('ul', 'news'); log.forEach(function (e) { var li = h('li'); li.appendChild(h('span', null, e.text)); nl.appendChild(li); }); body.appendChild(nl);
    }
  }

  // ---------- wiring ----------
  function init() {
    decodeGrid();
    MapView.addPainter(paint);
    Game.seaName = function (wx, wy) { var z = zoneAt(wx, wy); return z === null ? null : War.seas[z].name; };
    var prevUnit = Game.unitClick;
    Game.unitClick = function (sx, sy, mod) {
      var f = fleetAt(sx, sy);
      if (f) { if (myFleet(f)) selectFleet(f); else { selFleet = null; UI.showSea(f.inPort ? Game.provinces[f.base].sea : f.zone); MapView.refreshOverlay(); } return true; }
      return prevUnit ? prevUnit(sx, sy, mod) : false;
    };
    Game.seaClick = function (wx, wy) { var z = zoneAt(wx, wy); if (z === null) return false; UI.showSea(z); MapView.refreshOverlay(); return true; };
    Game.on('seaContext', function (pt) {
      var f = selFleet !== null ? War.fleetById(selFleet) : null; if (!f || !myFleet(f)) return;
      var z = zoneAt(pt.x, pt.y); if (z === null) return;
      var why = War.setMission(f, f.mission === 'hold' ? 'patrol' : f.mission, z);
      if (why) toast(why, 'bad'); else toast(f.name + ': ' + M[f.mission].name.toLowerCase() + ' in the ' + War.seas[z].name);
      Game.save(); UI.refresh(); MapView.refreshOverlay();
    });
    Game.on('context', function (id) {
      var f = selFleet !== null ? War.fleetById(selFleet) : null; if (!f || !myFleet(f) || (window.WarUI && WarUI.picked().length)) return;
      var p = Game.provinces[id]; if (!p.coastal) return;
      var why = War.setBase(f, id); if (why) toast(why, 'bad'); else toast(f.name + ' will base at ' + p.name);
      Game.save(); UI.refresh(); MapView.refreshOverlay();
    });
    Game.on('select', function (id) { if (id !== null && selFleet !== null) { selFleet = null; MapView.refreshOverlay(); } });
    Game.on('day', function () {
      if (selFleet !== null && !War.fleetById(selFleet)) selFleet = null;
      var v = UI.view(); if (v && v.type === 'sea' && !Game.pick) { var a = document.activeElement; if (a && (a.tagName === 'SELECT') && $('panel').contains(a)) return; if (Game.date.day % 2 === 0) UI.refresh(); }
    });
    Game.on('reset', function () { selFleet = null; });
    Game.on('player', function () { selFleet = null; });
    document.addEventListener('keydown', function (e) {
      var t = e.target, tn = t && t.tagName; if (tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape' && selFleet !== null) { selFleet = null; MapView.refreshOverlay(); }
      if ((e.key === 'n' || e.key === 'N') && Game.player) EconUI.openTab('navy');
    });
  }
  window.NavyUI = { init: init, seaPanel: seaPanel, navyTab: navyTab, zoneAt: zoneAt, selectFleet: function (id) { selectFleet(id === null ? null : War.fleetById(id)); }, selected: function () { return selFleet; }, fleetAt: fleetAt };
})();
