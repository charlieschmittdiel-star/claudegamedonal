// Diplomacy on screen: factions, guarantees, volunteers and aid on the nation card; the peace conference; the
// Factions and Resistance map modes; the outliner (O); and the ledger of statistics (L).
(function () {
  'use strict';
  var h = UI.h, num = UI.num;
  function $(id) { return document.getElementById(id); }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function money(v) { return EconUI.money(v); }
  function short(t) { return Game.nations[t].short; }
  function toast(text, kind) {
    var box = $('toasts'), t = h('div', 'toast' + (kind ? ' ' + kind : ''), text); box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5200);
  }
  function after(why, ok) { if (why) toast(why, 'bad'); else if (ok) toast(ok); Game.save(); UI.refresh(); EconUI.refresh(true); MapView.refreshOverlay(); if ($('mode-select').value === 'factions') MapView.redraw(); }
  function chipNation(t) { var b = btn('chip', short(t), function () { UI.showNation(t, true); }); var i = h('i'); i.style.background = Game.nations[t].color; b.insertBefore(i, b.firstChild); return b; }

  // ---------- nation card ----------
  function nationSection(tag) {
    var wrap = h('div', 'econ'), pl = Game.player; if (War.gone[tag]) return wrap;
    var f = War.factionOf(tag), dl = h('dl', 'facts');
    function row(k, v) { dl.appendChild(h('dt', null, k)); var dd = h('dd'); if (typeof v === 'string') dd.textContent = v; else dd.appendChild(v); dl.appendChild(dd); }
    if (f) { var fs = h('span'); fs.appendChild(h('strong', null, f.name)); fs.appendChild(document.createTextNode(' · led by ' + short(f.leader) + ', ' + f.members.length + ' members')); row('Faction', fs); }
    else row('Faction', 'None');
    var gives = Object.keys(War.guar[tag] || {}).filter(function (t) { return !War.gone[t]; }), by = War.guarantorsOf(tag);
    if (gives.length) row('Guarantees', gives.map(short).join(', '));
    if (by.length) row('Guaranteed by', by.map(short).join(', '));
    var vols = War.divs.filter(function (d) { return d.vol && (d.vol === tag || d.tag === tag); });
    var out = vols.filter(function (d) { return d.vol === tag; }), inn = vols.filter(function (d) { return d.tag === tag; });
    if (out.length) row('Volunteers abroad', out.length + ' divisions (with ' + uniq(out.map(function (d) { return short(d.tag); })).join(', ') + ')');
    if (inn.length) row('Volunteers serving here', inn.length + ' divisions from ' + uniq(inn.map(function (d) { return short(d.vol); })).join(', '));
    if (pl && pl !== tag) { var gw = Math.round((War.goodwill[tag] && War.goodwill[tag][pl]) || 0); if (gw) row('Goodwill toward you', (gw > 0 ? '+' : '−') + Math.abs(gw)); }
    wrap.appendChild(dl);
    if (f && f.members.length > 1) { var ch = h('div', 'chips'); f.members.forEach(function (m) { ch.appendChild(chipNation(m)); }); wrap.appendChild(ch); }
    if (!pl) return wrap;

    if (pl === tag) {
      var acts0 = h('div', 'acts');
      if (f) acts0.appendChild(btn('ghost danger', 'Leave the ' + f.name, function () { after(War.leaveFaction(pl), 'You have left the ' + f.name); }));
      gives.forEach(function (t) { acts0.appendChild(btn('ghost', 'Revoke guarantee of ' + short(t), function () { War.revokeGuarantee(pl, t); after(null, 'Guarantee revoked'); })); });
      var mine = War.volunteersOf(pl); if (mine.length) acts0.appendChild(btn('ghost', 'Recall all volunteers (' + mine.length + ')', function () { after(War.recallVolunteers(pl), 'Your volunteers are coming home'); }));
      if (acts0.children.length) wrap.appendChild(acts0);
      return wrap;
    }
    if (War.atWar(pl, tag)) return wrap;

    wrap.appendChild(h('h3', 'p-sub', 'Diplomacy'));
    var acts = h('div', 'acts'), pf = War.factionOf(pl);
    if (!f || f !== pf) {
      // faction: invite them, or ask to join theirs
      var view = War.allianceView(tag, pl);
      var label = pf ? 'Invite into the ' + pf.name : 'Propose an alliance';
      var inv = btn(view.ok ? 'primary' : 'ghost', label, function () { after(War.inviteToFaction(pl, tag), short(tag) + ' joins ' + (War.factionOf(pl) ? 'the ' + War.factionOf(pl).name : 'you')); });
      acts.appendChild(inv);
      if (f && f.leader !== pl && !pf) acts.appendChild(btn('ghost', 'Ask to join the ' + f.name, function () { after(War.askToJoin(pl, f), 'You join the ' + f.name); }));
      wrap.appendChild(acts);
      var think = h('ul', 'reasons'); view.why.forEach(function (w) { think.appendChild(h('li', /\(\+/.test(w) ? 'good' : /\(−/.test(w) ? 'bad' : '', w)); });
      think.appendChild(h('li', 'sum', 'They would ' + (view.ok ? 'accept' : 'refuse') + ' (' + (view.score >= 0 ? '+' : '') + view.score + ', need +30)'));
      wrap.appendChild(think);
      acts = h('div', 'acts');
    }
    if (War.guar[pl] && War.guar[pl][tag]) acts.appendChild(btn('ghost', 'Revoke guarantee', function () { War.revokeGuarantee(pl, tag); after(null, 'Guarantee revoked'); }));
    else if (!War.allied(pl, tag)) acts.appendChild(btn('ghost', 'Guarantee independence', function () { after(War.guarantee(pl, tag)); }, 'If anyone declares war on them, you go to war with the aggressor'));
    if (acts.children.length) wrap.appendChild(acts);

    // volunteers and aid, for a nation at war
    if (War.enemies(tag).length) {
      var vw = War.canSendVolunteers(pl, tag), mineThere = War.divs.filter(function (d) { return d.vol === pl && d.tag === tag; }).length;
      var va = h('div', 'acts');
      va.appendChild(btn('ghost', 'Send volunteers (1 division)', function () { after(War.sendVolunteers(pl, tag, 1), 'Volunteers are on their way'); }, vw || 'Up to ' + War.volunteerCap(pl) + ' of your divisions may serve abroad; they gain experience for your army'));
      if (mineThere) va.appendChild(btn('ghost', 'Recall volunteers (' + mineThere + ')', function () { after(War.recallVolunteers(pl, tag), 'Recalled'); }));
      wrap.appendChild(va);
      if (vw && !mineThere) wrap.appendChild(h('p', 'note', 'Volunteers: ' + vw + '.'));
    }
    wrap.appendChild(h('h3', 'p-sub', 'Send aid'));
    var aid = h('div', 'acts'), sp = Econ.N[pl].stockpile;
    [['muskets', '500 muskets'], ['artillery', '10 cannon'], ['uniforms', '1,000 uniforms'], ['horses', '300 horses'], ['money', 'ƒ5,000']].forEach(function (x) {
      var have = x[0] === 'money' ? Econ.N[pl].treasury >= 5000 : (sp[x[0]] || 0) >= War.AID[x[0]].n;
      var b = btn('ghost', x[1], function () { after(War.sendAid(pl, tag, x[0], 1), 'Sent ' + x[1] + ' to ' + short(tag)); }, have ? 'From your ' + (x[0] === 'money' ? 'treasury' : 'arsenal') + '; earns their goodwill' : 'You do not have that much');
      b.disabled = !have; aid.appendChild(b);
    });
    wrap.appendChild(aid);
    var sub = h('div', 'slider'), lab = h('label', null, 'Monthly subsidy'), se = document.createElement('select'); se.id = 'subsidy-' + tag; lab.setAttribute('for', se.id);
    var cur = (War.subsidy[pl] && War.subsidy[pl][tag]) || 0;
    [0, 500, 1000, 2500, 5000].forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v ? 'ƒ' + num(v) + ' a month' : 'None'; if (v === cur) o.selected = true; se.appendChild(o); });
    se.addEventListener('change', function () { War.setSubsidy(pl, tag, +se.value); after(null, +se.value ? 'Subsidy set' : 'Subsidy stopped'); });
    sub.appendChild(lab); sub.appendChild(se); wrap.appendChild(sub);
    return wrap;
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  // ---------- map modes ----------
  function factionColor(id) {
    var p = Game.provinces[id], f = War.factionOf(p.owner);
    if (f) return Game.nations[f.leader].color;
    if (Game.player && War.guar[Game.player] && War.guar[Game.player][p.owner]) return '#9bb58a';
    return '#d9d0bb';
  }
  function resistColor(id) {
    var p = Game.provinces[id], k = War.foreignRule(p); if (!k) return '#d9d0bb';
    var r = War.resist[id]; return r >= 0.7 ? '#7e2b1d' : r >= 0.45 ? '#b8612a' : r >= 0.2 ? '#d79a3c' : '#e8d8a8';
  }
  function legend(mode, el, item) {
    if (mode === 'factions') {
      el.appendChild(h('span', 'legend-title', 'Factions'));
      War.factions.forEach(function (f) { item(Game.nations[f.leader].color, f.name); });
      if (Game.player) item('#9bb58a', 'You guarantee'); item('#d9d0bb', 'In no faction');
    } else if (mode === 'build') {
      var pl = window.BuildUI && BuildUI.placing();
      el.appendChild(h('span', 'legend-title', pl ? 'Where a ' + Econ.BUILDINGS[pl].name.toLowerCase() + ' can go' : 'Free building slots'));
      item('#3f8a4a', pl ? 'Yes, room to spare' : '6 or more'); item('#a7c46e', pl ? 'Yes, few slots left' : '1–2'); item('#c9bfa6', 'Not here'); item('#7d786c', 'Not yours');
    } else if (mode === 'resistance') {
      el.appendChild(h('span', 'legend-title', 'Resistance under foreign rule'));
      item('#e8d8a8', 'Low'); item('#d79a3c', '20%+'); item('#b8612a', '45%+: partisans'); item('#7e2b1d', '70%+: may rise'); item('#d9d0bb', 'Ruled by its own');
    }
  }

  // ---------- the peace conference ----------
  var confOpen = false;
  function openConference() {
    var c = War.conference; if (!c) return;
    Game.setPaused(true); confOpen = true;
    var m = $('modal'); m.innerHTML = ''; m.hidden = false;
    var card = h('div', 'modal-card wide conf'), head = h('div', 'drawer-head');
    head.appendChild(h('h2', null, 'Peace conference: ' + c.losers.map(short).join(' and ')));
    head.appendChild(btn('x-btn', '×', function () { m.hidden = true; m.innerHTML = ''; confOpen = false; }, 'Close for now (the world waits until the treaty is signed)'));
    card.appendChild(head);
    var body = h('div', 'modal-body'); card.appendChild(body); m.appendChild(card);
    var pl = Game.player, cur = War.confCurrent(), me = c.victors.filter(function (v) { return v.tag === pl; })[0];
    // the table
    var top = h('div', 'conf-top');
    var vt = h('table', 'conf-victors'), tr = h('tr'); ['Victor', 'Points', 'Taken'].forEach(function (x) { tr.appendChild(h('th', null, x)); }); vt.appendChild(tr);
    c.victors.forEach(function (v) {
      var r = h('tr', v === cur ? 'is-turn' : ''), td = h('td'), sw = h('span', 'swatch'); sw.style.background = Game.nations[v.tag].color; td.appendChild(sw); td.appendChild(document.createTextNode(' ' + short(v.tag) + (v.passed ? ' (done)' : v === cur ? ' ◂ to choose' : '')));
      r.appendChild(td); r.appendChild(h('td', null, v.pts + ' / ' + v.start)); r.appendChild(h('td', null, v.took.length + (v.gold ? ' + gold' : ''))); vt.appendChild(r);
    });
    top.appendChild(vt);
    var lg = h('ul', 'conf-log'); c.log.slice(-10).reverse().forEach(function (x) { lg.appendChild(h('li', null, x)); }); if (!c.log.length) lg.appendChild(h('li', null, 'The delegates take their seats.'));
    top.appendChild(lg); body.appendChild(top);
    body.appendChild(h('p', 'note', 'Each victor in turn spends points: on a region (cheaper where your troops stand and next to your land), on reparations in gold, or on making the loser a client state that joins your faction. Points come from the victory points you occupied, with a bonus for great powers.'));
    if (!me || cur !== me) { body.appendChild(h('p', 'note', 'Waiting for the other delegations…')); return; }
    var acts = h('div', 'acts');
    acts.appendChild(btn('primary', 'Done: sign the treaty', function () { act('pass'); }));
    if (me.pts > 0) acts.appendChild(btn('ghost', 'Reparations: all ' + me.pts + ' points in gold', function () { act('gold', me.pts); }));
    c.losers.forEach(function (lo) { if (c.puppet[lo]) return; var cost = Math.max(8, Math.round(me.start * 0.35)); var b = btn('ghost', 'Make ' + short(lo) + ' a client state (' + cost + ')', function () { act('puppet', lo); }); b.disabled = cost > me.pts; acts.appendChild(b); });
    body.appendChild(acts);
    var lots = War.confLots().map(function (L) { return { L: L, cost: War.lotCost(L, pl) }; }).sort(function (a, b) { return (a.cost > me.pts) - (b.cost > me.pts) || b.L.vp / b.cost - a.L.vp / a.cost; });
    var tbl = h('table', 'conf-lots'), hr = h('tr'); ['Region', 'Of', 'Provinces', 'VP', 'Held by', 'Cost', ''].forEach(function (x) { hr.appendChild(h('th', null, x)); }); tbl.appendChild(hr);
    lots.forEach(function (x) {
      var L = x.L, r = h('tr', x.cost > me.pts ? 'dim' : '');
      var nm = btn('link', L.name, function () { MapView.focusProvince(L.provs[0]); }); var td = h('td'); td.appendChild(nm); r.appendChild(td);
      r.appendChild(h('td', null, short(L.owner))); r.appendChild(h('td', null, L.provs.map(function (id) { return Game.provinces[id].name; }).join(', ')));
      r.appendChild(h('td', null, String(L.vp)));
      r.appendChild(h('td', null, Object.keys(L.holders).map(function (t) { return short(t) + (L.holders[t] > 1 ? ' ×' + L.holders[t] : ''); }).join(', ')));
      r.appendChild(h('td', null, String(x.cost)));
      var tb = btn('ghost small', 'Take', function () { act('take', L.key); }); tb.disabled = x.cost > me.pts; var td2 = h('td'); td2.appendChild(tb); r.appendChild(td2);
      tbl.appendChild(r);
    });
    var wrapT = h('div', 'conf-scroll'); wrapT.appendChild(tbl); body.appendChild(wrapT);
  }
  function act(a, arg) {
    var why = War.confAct(Game.player, a, arg); if (why) { toast(why, 'bad'); return; }
    if (War.conference) openConference();
    else { $('modal').hidden = true; $('modal').innerHTML = ''; confOpen = false; Game.emit('owner'); MapView.redraw(); UI.refresh(); EconUI.refresh(true); Game.save(); var lc = War.lastConference; toast('The treaty is signed' + (lc ? ': ' + lc.victors.map(function (v) { return short(v.tag) + ' ' + v.took + (v.took === 1 ? ' region' : ' regions') + (v.gold ? ' and ƒ' + num(v.gold) : ''); }).join(', ') : '')); }
  }

  // ---------- outliner ----------
  function outliner() {
    var body = $('outliner-body'); body.innerHTML = ''; var pl = Game.player;
    if (!pl) { body.appendChild(h('p', 'note', 'Choose a nation to see its affairs here.')); return; }
    function sec(title, items) {
      var d = document.createElement('details'); d.open = true; var s = document.createElement('summary'); s.textContent = title + ' (' + items.length + ')'; d.appendChild(s);
      var ul = h('ul', 'ol-list'); items.forEach(function (it) { var li = h('li'); var b = btn('ol-item' + (it.cls ? ' ' + it.cls : ''), '', it.go); b.appendChild(h('strong', null, it.a)); if (it.b) b.appendChild(h('span', null, it.b)); li.appendChild(b); ul.appendChild(li); });
      if (!items.length) ul.appendChild(h('li', 'note', 'None'));
      d.appendChild(ul); body.appendChild(d);
    }
    sec('Wars', War.enemies(pl).map(function (e) { var sc = War.warScore(pl, e); return { a: 'vs ' + short(e), b: 'war score ' + (sc >= 0 ? '+' : '') + Math.round(sc) + '%', cls: sc < -5 ? 'bad' : sc > 5 ? 'good' : '', go: function () { UI.showNation(e, true); } }; }));
    sec('Armies', War.armies.filter(function (a) { return a.tag === pl; }).map(function (a) {
      var d0 = a.divs.map(function (id) { return War.div(id); }).filter(Boolean)[0];
      return { a: a.name + ' · ' + a.divs.length, b: War.armyStatus ? War.armyStatus(a) : '', go: function () { if (d0) { Game.select(d0.prov); MapView.focusProvince(d0.prov); } } };
    }));
    var loose = War.divs.filter(function (d) { return d.tag === pl && !War.armyOf(d.id); }).length;
    if (loose) body.lastChild.querySelector('ul').appendChild(h('li', 'note', loose + ' divisions in no army'));
    sec('Fleets', War.fleets.filter(function (f) { return f.tag === pl && f.ships.length; }).map(function (f) {
      var c = War.fleetCount(f); return { a: f.name, b: (c.first + c.line) + ' line, ' + (c.frig + c.brig) + ' light · ' + (f.inPort ? 'in ' + Game.provinces[f.base].name : War.MISSIONS[f.mission].name.toLowerCase() + ', ' + War.seas[f.zone].name), go: function () { NavyUI.selectFleet(f.id); var s = f.inPort ? Game.provinces[f.base] : War.seas[f.zone]; MapView.focusPoint(s.x, s.y); } };
    }));
    var bts = War.battles.filter(function (bt) { var all = (War.at[bt.prov] || []); return all.some(function (d) { return d.tag === pl; }) || bt.tag === pl; }).map(function (bt) { return { a: 'Battle of ' + Game.provinces[bt.prov].name, b: 'day ' + (bt.days || 0), cls: 'bad', go: function () { Game.select(bt.prov); MapView.focusProvince(bt.prov); } }; });
    War.navalBattles.forEach(function (bt) { if (War.allied(pl, bt.tags[0]) || War.allied(pl, bt.tags[1])) bts.push({ a: 'Sea battle: ' + War.seas[bt.zone].name, b: 'day ' + bt.day, cls: 'bad', go: function () { UI.showSea(bt.zone); var z = War.seas[bt.zone]; MapView.focusPoint(z.x, z.y); } }); });
    sec('Battles', bts);
    // things that need attention
    var todo = [], R = War.R && War.R[pl];
    if (R) { var idle = R.slots.filter(function (s) { return !s; }).length; if (idle) todo.push({ a: idle + ' research ' + (idle === 1 ? 'slot' : 'slots') + ' idle', go: function () { EconUI.openTab('research'); } }); }
    var freeF = War.milFactories(pl) - War.assignedFactories(pl); if (freeF > 0) todo.push({ a: freeF + ' military ' + (freeF === 1 ? 'factory' : 'factories') + ' unassigned', go: function () { EconUI.openTab('production'); } });
    if (War.NV[pl] && War.dockyards(pl) && !War.NV[pl].queue.length) todo.push({ a: 'Dockyards idle', go: function () { EconUI.openTab('navy'); } });
    if (War.NV[pl] && Econ.N[pl].ports && War.NV[pl].convoys < War.convoyNeed(pl) * 0.7) todo.push({ a: 'Short of convoys', b: Math.floor(War.NV[pl].convoys) + ' of ' + War.convoyNeed(pl), go: function () { EconUI.openTab('navy'); } });
    var blk = War.blockadeShare(pl); if (blk > 0.2) todo.push({ a: 'Harbours blockaded', b: pct(blk), cls: 'bad', go: function () { EconUI.openTab('navy'); } });
    var hungry = War.divs.filter(function (d) { return d.tag === pl && d.sr < 0.8; }); if (hungry.length) todo.push({ a: hungry.length + ' divisions short of supply', cls: 'bad', go: function () { Game.select(hungry[0].prov); MapView.focusProvince(hungry[0].prov); } });
    Game.provinces.forEach(function (p) { if (p.ctrl === pl && War.resist[p.id] >= 0.45) todo.push({ a: 'Unrest in ' + p.name, b: 'resistance ' + pct(War.resist[p.id]) + (War.foreignRule(p) === 'occupied' ? ': post a garrison' : ''), cls: 'bad', go: function () { Game.select(p.id); MapView.focusProvince(p.id); } }); });
    var vol = War.volunteersOf(pl).length; if (vol) todo.push({ a: vol + ' volunteer divisions abroad', go: function () { UI.showNation(pl, false); } });
    sec('Needs attention', todo);
  }
  function toggleOutliner(on) { var o = $('outliner'); o.hidden = on === undefined ? !o.hidden : !on; if (!o.hidden) outliner(); }

  // ---------- ledger ----------
  function chart(rows, idx, opts) {
    // rows: [{tag, data: [[day, v...]]}]; idx: the column to draw
    var W = opts.w || 300, H = opts.h || 120, pad = 26, x0 = 1e9, x1 = -1e9, y1 = 0;
    rows.forEach(function (r) { r.data.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[idx]); }); });
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'lchart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', opts.title);
    function el(n, a) { var e = document.createElementNS(ns, n); for (var k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; }
    if (!(x1 > x0)) { var t0 = el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'lc-note' }); t0.textContent = 'History builds up month by month'; return svg; }
    y1 = y1 > 0 ? y1 * 1.08 : 1;
    var sx = function (x) { return pad + (x - x0) / (x1 - x0) * (W - pad - 6); }, sy = function (y) { return H - 16 - y / y1 * (H - 26); };
    el('line', { x1: pad, y1: H - 16, x2: W - 6, y2: H - 16, class: 'lc-axis' });
    [0.5, 1].forEach(function (f) { el('line', { x1: pad, y1: sy(y1 / 1.08 * f), x2: W - 6, y2: sy(y1 / 1.08 * f), class: 'lc-grid' }); var t = el('text', { x: pad - 4, y: sy(y1 / 1.08 * f) + 3, 'text-anchor': 'end', class: 'lc-lab' }); t.textContent = compact(y1 / 1.08 * f); });
    var ya = el('text', { x: pad, y: H - 4, class: 'lc-lab' }); ya.textContent = String(Math.floor(1805 + (243 + x0) / 365));
    var yb = el('text', { x: W - 6, y: H - 4, 'text-anchor': 'end', class: 'lc-lab' }); yb.textContent = String(Math.floor(1805 + (243 + x1) / 365));
    rows.forEach(function (r) {
      if (r.data.length < 2) return;
      el('polyline', { points: r.data.map(function (p) { return sx(p[0]).toFixed(1) + ',' + sy(p[idx]).toFixed(1); }).join(' '), fill: 'none', stroke: Game.nations[r.tag].color, 'stroke-width': r.tag === Game.player ? 2.6 : 1.6, 'stroke-linejoin': 'round' });
    });
    return svg;
  }
  function compact(v) { return v >= 10000 ? Math.round(v / 1000) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)); }
  function ledgerTab(body, tag) {
    var majors = Game.tags ? Game.tags : Object.keys(Game.nations);
    var list = Object.keys(Game.nations).filter(function (t) { return !War.gone[t] && (Game.nations[t].major || t === Game.player || t === tag); });
    body.appendChild(h('h3', 'p-sub', 'The powers'));
    var tbl = h('table', 'ledger'), hr = h('tr');
    ['', 'Provinces', 'People', 'Taxes/mo', 'Divisions', 'Men', 'Line ships', 'VP', 'Lost', 'Killed'].forEach(function (x) { hr.appendChild(h('th', null, x)); }); tbl.appendChild(hr);
    var prov = {}, vp = {}, divs = {}; Game.provinces.forEach(function (p) { prov[p.owner] = (prov[p.owner] || 0) + 1; vp[p.owner] = (vp[p.owner] || 0) + (p.vp || 0); });
    War.divs.forEach(function (d) { divs[d.tag] = (divs[d.tag] || 0) + 1; });
    list.sort(function (a, b) { return (vp[b] || 0) - (vp[a] || 0); }).forEach(function (t) {
      var n = Econ.N[t], M = War.M[t], sh = War.shipsOf(t), r = h('tr', t === tag ? 'is-me' : ''), td = h('td'), sw = h('span', 'swatch'); sw.style.background = Game.nations[t].color; td.appendChild(sw); td.appendChild(document.createTextNode(' ' + short(t))); r.appendChild(td);
      [prov[t] || 0, compact(n.pop || 0), compact((n.last && n.last.taxRev) || 0), divs[t] || 0, compact(M.men || 0), sh.first + sh.line, vp[t] || 0, compact(M.lost || 0), compact(M.killed || 0)].forEach(function (v) { r.appendChild(h('td', null, String(v))); });
      tbl.appendChild(r);
    });
    var sc = h('div', 'conf-scroll'); sc.appendChild(tbl); body.appendChild(sc);

    var H = War.hist || {}, rows = Object.keys(H).filter(function (t) { return !War.gone[t]; }).map(function (t) { return { tag: t, data: H[t] }; });
    body.appendChild(h('h3', 'p-sub', 'Over the years'));
    var grid = h('div', 'lcharts');
    [[6, 'Victory points'], [2, 'Divisions'], [1, 'Taxes a month'], [4, 'Ships of the line'], [7, 'Men lost (thousands)'], [5, 'Provinces']].forEach(function (c) {
      var box = h('figure', 'lc'); box.appendChild(h('figcaption', null, c[1])); box.appendChild(chart(rows, c[0], { title: c[1] })); grid.appendChild(box);
    });
    body.appendChild(grid);
    var key = h('div', 'chips'); rows.forEach(function (r) { var s = h('span', 'chip'), i = h('i'); i.style.background = Game.nations[r.tag].color; s.appendChild(i); s.appendChild(document.createTextNode(short(r.tag))); key.appendChild(s); }); body.appendChild(key);

    body.appendChild(h('h3', 'p-sub', 'The record of ' + short(tag)));
    var dl = h('dl', 'facts'), T = (War.tally && War.tally[tag]) || {}, NV = War.NV[tag] ? War.NV[tag].stats : null, M2 = War.M[tag];
    function row(k, v) { dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, v)); }
    row('On land', num(Math.round((M2.lost || 0) / 100) * 100) + ' men lost · ' + num(Math.round((M2.killed || 0) / 100) * 100) + ' enemies killed');
    if (NV) row('At sea', NV.sunk + ' enemy ships sunk, ' + NV.prizes + ' taken · ' + NV.lost + ' lost · ' + NV.convSunk + ' convoys taken, ' + NV.convLost + ' lost');
    row('Occupation', (T.partisan || 0) + ' partisan attacks suffered · ' + (T.uprisings || 0) + ' provinces lost to uprisings');
    row('Aid sent abroad', money(T.aidSent || 0));
    var f = War.factionOf(tag); row('Faction', f ? f.name + ' (' + f.members.map(short).join(', ') + ')' : 'None');
    body.appendChild(dl);
    var lc = War.lastConference;
    if (lc) { body.appendChild(h('h3', 'p-sub', 'Last peace conference')); var ul = h('ul', 'news'); lc.log.forEach(function (x) { ul.appendChild(h('li', null, x)); }); body.appendChild(ul); }
  }

  // ---------- wiring ----------
  function init() {
    MapView.addMode('factions', factionColor);
    MapView.addMode('resistance', resistColor);
    Game.on('conference', function () { if (!confOpen && War.conference) openConference(); });
    Game.on('event', function (e) { if (e.type === 'conference') setTimeout(function () { if (War.conference) openConference(); }, 0); if (!$('outliner').hidden && (e.type === 'war' || e.type === 'peace' || e.type === 'surrender')) outliner(); });
    $('outliner-btn').addEventListener('click', function () { toggleOutliner(); });
    $('outliner-close').addEventListener('click', function () { toggleOutliner(false); });
    Game.on('day', function () { if (!$('outliner').hidden && War.day % 3 === 0) outliner(); });
    Game.on('player', function () { if (!$('outliner').hidden) outliner(); });
    Game.on('month', function () { if ($('mode-select').value === 'factions' || $('mode-select').value === 'resistance') MapView.redraw(); });
    Game.on('reset', function () { confOpen = false; if (!$('outliner').hidden) outliner(); });
    document.addEventListener('keydown', function (e) {
      var t = e.target, tn = t && t.tagName; if (tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'o' || e.key === 'O') toggleOutliner();
      else if ((e.key === 'l' || e.key === 'L') && Game.player) EconUI.openTab('ledger');
    });
    if (War.conference) setTimeout(openConference, 300);
    Game.on('savefail', function (msg) { toast(msg, 'bad'); });
    if (Game.loadedBackup) setTimeout(function () { toast('The last save was damaged, so the game continues from the backup made a month earlier.', 'bad'); }, 600);
  }
  window.DiploUI = { init: init, nationSection: nationSection, legend: legend, ledgerTab: ledgerTab, openConference: openConference, outliner: function () { toggleOutliner(true); } };
})();
