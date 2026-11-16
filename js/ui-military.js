// The wider war on screen: plunder, rally point, Landwehr, mercenaries, the Guard and prisoners on the Army tab;
// sieges on the map; and the record of great battles, with a replay, on the Ledger tab.
(function () {
  'use strict';
  var h = UI.h, num = UI.num;
  function $(id) { return document.getElementById(id); }
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function short(t) { return Game.nations[t] ? Game.nations[t].short : t; }
  function toast(text, kind) {
    var box = $('toasts'), t = h('div', 'toast' + (kind ? ' ' + kind : ''), text); box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5200);
  }
  function after(why, ok) { if (why) toast(why, 'bad'); else if (ok) toast(ok); Game.save(); EconUI.refresh(true); MapView.refreshOverlay(); }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateOf(day) { var y = 1805 + (243 + day) / 365, yy = Math.floor(y); return MONTHS[Math.min(11, Math.floor((y - yy) * 12))] + ' ' + yy; }

  // ---------- the Army tab ----------
  function armySection(body, tag, mine) {
    if (!War.mil) return;
    body.appendChild(h('h3', 'p-sub', 'Irregulars, plunder and prisoners'));
    var dl = h('dl', 'facts');
    function row(k, v) { dl.appendChild(h('dt', null, k)); var dd = h('dd'); if (typeof v === 'string') dd.textContent = v; else dd.appendChild(v); dl.appendChild(dd); }
    var kinds = { guard: 0, militia: 0, merc: 0, partisan: 0 }; War.divs.forEach(function (d) { if (d.tag === tag) for (var k in kinds) if (d[k]) kinds[k]++; });
    row('Guard', kinds.guard ? kinds.guard + ' division' + (kinds.guard > 1 ? 's' : '') + ' (+30% in battle)' : 'None. An Elite division can be raised to the Guard from its card.');
    if (kinds.militia) row('Landwehr', kinds.militia + ' militia divisions');
    if (kinds.merc) row('Mercenaries', kinds.merc + ' regiments, ' + EconUI.money(kinds.merc * 1200) + ' a month');
    if (kinds.partisan) row('Partisans', kinds.partisan + ' bands behind enemy lines');
    var held = War.prisonersHeld(tag), lost = War.prisonersLost(tag);
    row('Prisoners', num(held) + ' held · ' + num(lost) + ' of ours in enemy hands (they come home at the peace)');
    var rally = War.mil.rally[tag]; row('Rally point', rally !== undefined ? Game.province(rally).name + ': new divisions march here, and troops here recover faster' : 'None');
    row('Plunder', War.mil.plunder[tag] ? 'Our troops live off the land: gold from every province taken, but resistance rises' : 'Forbidden: no loot, no extra resistance');
    if (War.mil.loot && tag === Game.player) row('Loot so far', EconUI.money(War.mil.loot));
    var sg = Object.keys(War.mil.sieges).map(function (k) { return [+k, War.mil.sieges[k]]; }).filter(function (x) { return x[1].by === tag || Game.province(x[0]).owner === tag; });
    if (sg.length) { var ul = h('div', 'chips'); sg.forEach(function (x) { ul.appendChild(btn('chip', Game.province(x[0]).name + ' ' + Math.round(x[1].prog / x[1].need * 100) + '%', function () { Game.select(x[0]); MapView.focusProvince(x[0]); })); }); row('Sieges', ul); }
    body.appendChild(dl);
    if (!mine) return;
    var acts = h('div', 'acts wrap');
    var lw = War.landwehrBlock(tag), b1 = btn('ghost', 'Raise the Landwehr · 50 power', function () { after(War.raiseLandwehr(tag)); }, lw || 'Militia divisions from every town: cheap and quick, but weak (−38% in battle). Once a year in wartime.'); b1.disabled = !!lw; acts.appendChild(b1);
    var hb = War.hireBlock(tag), b2 = btn('ghost', 'Hire mercenaries · ' + EconUI.money(War.mercCost(tag)), function () { after(War.hireMercs(tag), 'A mercenary regiment musters at your capital'); }, hb || 'A veteran foreign regiment at once, without your own recruits. ƒ1,200 a month; they desert if the treasury runs dry.'); b2.disabled = !!hb; acts.appendChild(b2);
    acts.appendChild(btn('ghost', War.mil.plunder[tag] ? 'Forbid plunder' : 'Allow plunder', function () { War.mil.plunder[tag] = !War.mil.plunder[tag]; after(null); }));
    acts.appendChild(btn('ghost', rally !== undefined ? 'Move rally point' : 'Set a rally point', function () {
      toast('Click one of your provinces for the rally point (right-click to cancel)');
      Game.pick = function (id) { Game.pick = null; if (id === null) return; after(War.setRally(tag, id), 'Rally point: ' + Game.province(id).name); MapView.redraw(); };
    }));
    if (rally !== undefined) acts.appendChild(btn('ghost', 'Clear rally point', function () { War.setRally(tag, null); after(null); MapView.redraw(); }));
    body.appendChild(acts);
  }

  // ---------- great battles and the replay ----------
  function battleList(body, tag) {
    var log = (War.mil && War.mil.log || []).slice().reverse().filter(function (b) { return !tag || b.a === tag || b.d === tag || (Game.nations[b.a] && Game.nations[b.a].major) || (Game.nations[b.d] && Game.nations[b.d].major); }).slice(0, 15);
    body.appendChild(h('h3', 'p-sub', 'Great battles'));
    if (!log.length) { body.appendChild(h('p', 'note', 'No great battles yet.')); return; }
    var tbl = h('table', 'ledger battles'), hr = h('tr'); ['Battle', 'When', 'Attacker', 'Defender', 'Losses', ''].forEach(function (x) { hr.appendChild(h('th', null, x)); }); tbl.appendChild(hr);
    log.forEach(function (b) {
      var tr = h('tr', b.win === tag ? 'is-me' : ''); tr.appendChild(h('td', null, b.name)); tr.appendChild(h('td', null, dateOf(b.day)));
      tr.appendChild(h('td', b.win === b.a ? 'won' : '', short(b.a) + ' (' + b.na + ')')); tr.appendChild(h('td', b.win === b.d ? 'won' : '', short(b.d) + ' (' + b.nd + ')'));
      tr.appendChild(h('td', null, num(b.casA) + ' / ' + num(b.casD))); var td = h('td'); td.appendChild(btn('link', 'Replay', function () { replay(b); })); tr.appendChild(td); tbl.appendChild(tr);
    });
    body.appendChild(tbl);
  }
  function replay(b) {
    var m = $('modal'); m.innerHTML = ''; m.hidden = false; m._refresh = null;
    var card = h('div', 'modal-card wide'), head = h('div', 'drawer-head'); head.appendChild(h('h2', null, 'The Battle of ' + b.name));
    head.appendChild(btn('x-btn', '×', function () { m.hidden = true; m.innerHTML = ''; }, 'Close')); card.appendChild(head);
    var body = h('div', 'modal-body'); card.appendChild(body); m.appendChild(card);
    var TER = { p: 'open plains', h: 'hills', f: 'forest', s: 'marshes', m: 'mountains', d: 'desert' };
    body.appendChild(h('p', 'story-chapter', dateOf(b.start) + ' – ' + dateOf(b.day) + ' · ' + (b.hist.length || 1) + ' days · ' + (TER[b.terrain] || 'open ground')));
    var who = h('div', 'replay-sides');
    [[b.a, b.ga, b.na, b.casA, 'Attacker'], [b.d, b.gd, b.nd, b.casD, 'Defender']].forEach(function (s) {
      var c = h('div', 'replay-side' + (b.win === s[0] ? ' won' : '')), sw = h('i'); sw.style.background = Game.nations[s[0]].color;
      var t = h('b'); t.appendChild(sw); t.appendChild(document.createTextNode(' ' + Game.nations[s[0]].name)); c.appendChild(t);
      c.appendChild(h('span', 'muted small', s[4] + (s[1] ? ', led by ' + s[1] : '') + ' · ' + s[2] + ' divisions'));
      c.appendChild(h('span', null, num(s[3]) + ' men lost' + (b.win === s[0] ? ' · victory' : '')));
      who.appendChild(c);
    });
    body.appendChild(who);
    var W = 640, H = 240, svgNS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'replay');
    var hist = b.hist.length ? b.hist : [[1, 1, 1, 1]], n = hist.length, maxS = 1; hist.forEach(function (x) { maxS = Math.max(maxS, x[0], x[1]); });
    function X(i) { return 40 + (W - 60) * (n > 1 ? i / (n - 1) : 0.5); }
    function line(idx, col, scale, dash) { var p = document.createElementNS(svgNS, 'polyline'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', col); p.setAttribute('stroke-width', dash ? 1.6 : 2.6); if (dash) p.setAttribute('stroke-dasharray', '5 4'); p.setAttribute('points', ''); svg.appendChild(p); p._pts = hist.map(function (x, i) { return X(i).toFixed(1) + ',' + (H - 30 - (H - 50) * x[idx] / scale).toFixed(1); }); return p; }
    [0, 0.5, 1].forEach(function (f) { var g = document.createElementNS(svgNS, 'line'); g.setAttribute('x1', 40); g.setAttribute('x2', W - 20); g.setAttribute('y1', H - 30 - (H - 50) * f); g.setAttribute('y2', H - 30 - (H - 50) * f); g.setAttribute('stroke', 'rgba(255,255,255,.08)'); svg.appendChild(g); });
    var ca = Game.nations[b.a].color, cd = Game.nations[b.d].color;
    var lines = [line(0, ca, maxS), line(1, cd, maxS), line(2, ca, 1, true), line(3, cd, 1, true)];
    var lab = document.createElementNS(svgNS, 'text'); lab.setAttribute('x', 40); lab.setAttribute('y', 16); lab.setAttribute('fill', '#9aa5ae'); lab.setAttribute('font-size', '10'); lab.textContent = 'Men in the field (solid) and organisation (dashed), day by day'; svg.appendChild(lab);
    var dayT = document.createElementNS(svgNS, 'text'); dayT.setAttribute('x', W - 20); dayT.setAttribute('y', H - 10); dayT.setAttribute('text-anchor', 'end'); dayT.setAttribute('fill', '#d0a94f'); dayT.setAttribute('font-size', '12'); svg.appendChild(dayT);
    body.appendChild(svg);
    var cap = h('p', 'note'); body.appendChild(cap);
    var i = 0, timer = setInterval(function () {
      if (m.hidden || !svg.isConnected) { clearInterval(timer); return; }
      i++; lines.forEach(function (p) { p.setAttribute('points', p._pts.slice(0, i).join(' ')); });
      var x = hist[i - 1]; dayT.textContent = 'Day ' + i;
      cap.textContent = 'Day ' + i + ': ' + short(b.a) + ' ' + num(x[0]) + ' men at ' + Math.round(x[2] * 100) + '% organisation · ' + short(b.d) + ' ' + num(x[1]) + ' men at ' + Math.round(x[3] * 100) + '%';
      if (i >= n) { clearInterval(timer); cap.textContent += ' · ' + (b.win === b.a ? short(b.a) + ' carries the field.' : short(b.d) + ' holds the field.') + (b.pow ? ' About ' + num(b.pow) + ' prisoners taken.' : ''); }
    }, Math.max(60, Math.min(400, 3000 / n)));
    body.appendChild(btn('ghost small', 'Show on the map', function () { m.hidden = true; m.innerHTML = ''; Game.select(b.prov); MapView.focusProvince(b.prov); }));
  }

  // ---------- sieges and rally points on the map ----------
  function paint(c, v) {
    if (!War.mil) return;
    Object.keys(War.mil.sieges).forEach(function (k) {
      var p = Game.provinces[k], s = War.mil.sieges[k]; if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) return;
      var X = v.sx(p.x), Y = v.sy(p.y), r = Math.max(10, 9 * v.k);
      c.lineWidth = 3; c.strokeStyle = 'rgba(20,16,10,.55)'; c.beginPath(); c.arc(X, Y, r, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = Game.nations[s.by].color; c.beginPath(); c.arc(X, Y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.prog / s.need)); c.stroke();
    });
    var pl = Game.player, r = pl !== null && pl !== undefined ? War.mil.rally[pl] : undefined;
    if (r !== undefined) { var p = Game.provinces[r], X = v.sx(p.x), Y = v.sy(p.y) - 16; c.fillStyle = '#d0a94f'; c.strokeStyle = '#14100a'; c.lineWidth = 1; c.beginPath(); c.moveTo(X - 1, Y + 10); c.lineTo(X - 1, Y - 8); c.lineTo(X + 9, Y - 4); c.lineTo(X - 1, Y); c.closePath(); c.fill(); c.stroke(); }
  }

  window.MilUI = { armySection: armySection, battleList: battleList, replay: replay, init: function () {
    MapView.addPainter(paint);
    var prev = DiploUI.ledgerTab; DiploUI.ledgerTab = function (body, tag, mine) { prev(body, tag, mine); battleList(body, tag); };
    Game.on('event', function (e) { if (/siege|fortress/.test(e.text)) MapView.refreshOverlay(); });
    Game.on('day', function () { if (War.mil && Object.keys(War.mil.sieges).length && War.day % 2 === 0) MapView.refreshOverlay(); });
  } };
})();
