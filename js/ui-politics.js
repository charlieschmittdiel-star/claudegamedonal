// Politics on screen: the Politics tab (political power, stability, war support, advisers, decisions, spies,
// claims, cores, client kingdoms, marriages, demilitarised zones), politics on every nation's card (opinion,
// claims, ultimatums, marriages, spy operations), requests from other courts, and the Opinion and Claims map modes.
(function () {
  'use strict';
  var h = UI.h;
  function $(id) { return document.getElementById(id); }
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function short(t) { return Game.nations[t] ? Game.nations[t].short : t; }
  function money(v) { return EconUI.money(v); }
  function toast(text, kind) {
    var box = $('toasts'), t = h('div', 'toast' + (kind ? ' ' + kind : ''), text); box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5200);
  }
  function after(why, ok) { if (why) toast(why, 'bad'); else if (ok) toast(ok); Game.save(); UI.refresh(); EconUI.refresh(true); MapView.refreshOverlay(); updatePP(); var m = MapView.mode(); if (m === 'opinion' || m === 'claims' || m === 'factions') MapView.redraw(); }
  function stName(id) { var p = Game.provinces[id], s = War.states && War.states[p.state]; return s ? s.name : p.name; }
  function bar(label, v, why, cls) {
    var w = h('div', 'pol-bar'), top = h('div', 'bar-top'); top.appendChild(h('span', null, label)); top.appendChild(h('b', null, pct(v))); w.appendChild(top);
    var tr = h('div', 'bar-track big'), f = h('div', 'bar-fill ' + (cls || '') + (v < 0.3 ? ' low' : '')); f.style.width = pct(v); tr.appendChild(f); w.appendChild(tr);
    if (why) { var ul = h('ul', 'pol-why'); Object.keys(why).forEach(function (k) { var x = why[k]; if (!x && k !== 'At peace') return; ul.appendChild(h('li', x > 0 ? 'up' : x < 0 ? 'down' : '', k + (x ? ' ' + (x > 0 ? '+' : '−') + Math.abs(Math.round(x * 100)) + '%' : ''))); }); w.appendChild(ul); }
    return w;
  }
  function selectOf(opts, cls) { var s = h('select', cls || 'pol-sel'); opts.forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); }); return s; }
  function borderStates(me, them) {
    var seen = {}, out = [];
    Game.provinces.forEach(function (p) {
      if (p.owner !== them || seen[p.state]) return;
      if (!p.adj.concat(p.straits).some(function (j) { return Game.provinces[j].owner === me; }) && War.core[p.id] !== me) return;
      seen[p.state] = 1; out.push(p.id);
    });
    return out;
  }

  // ---------- the Politics tab ----------
  function politicsTab(body, tag, mine) {
    var n = War.polOf(tag); if (!n) return;
    var top = h('div', 'pol-top');
    var pp = h('div', 'pol-pp'); pp.appendChild(h('span', 'muted small', 'Political power')); pp.appendChild(h('div', 'big', Math.floor(n.pp) + '')); pp.appendChild(h('span', 'muted small', '+' + (War.ppGain(tag) * 0.3).toFixed(2) + ' a day')); top.appendChild(pp);
    var bars = h('div', 'pol-bars'); War.stabTarget(tag); War.wsTarget(tag);
    bars.appendChild(bar('Stability', n.stab, n.why)); bars.appendChild(bar('War support', n.ws, n.wsWhy, 'ws'));
    top.appendChild(bars); body.appendChild(top);
    body.appendChild(h('p', 'muted small', 'Stability speeds construction, research and factories, and below 20% the government may fall. War support raises organisation and manpower; a nation with little of it will not start wars and gives up sooner.'));

    // advisers
    body.appendChild(h('h3', 'p-sub', 'Ministers and advisers (' + n.adv.length + ' of 3)'));
    var grid = h('div', 'adv-grid');
    n.adv.forEach(function (r) {
      var c = h('div', 'adv on'); c.appendChild(h('b', null, War.advName(tag, r))); c.appendChild(h('span', 'muted small', War.ROLES[r].name)); c.appendChild(h('span', 'small', War.ROLES[r].text));
      if (mine) c.appendChild(btn('ghost small', 'Dismiss', function () { after(War.dismissAdviser(tag, r)); }));
      grid.appendChild(c);
    });
    if (mine) Object.keys(War.ROLES).forEach(function (r) {
      if (n.adv.indexOf(r) >= 0) return;
      var c = h('div', 'adv'); c.appendChild(h('b', null, War.advName(tag, r))); c.appendChild(h('span', 'muted small', War.ROLES[r].name)); c.appendChild(h('span', 'small', War.ROLES[r].text));
      var b = btn('ghost small', 'Appoint · ' + War.POLCOST.adviser, function () { after(War.hireAdviser(tag, r), War.advName(tag, r) + ' appointed'); });
      b.disabled = n.adv.length >= 3 || n.pp < War.POLCOST.adviser; c.appendChild(b); grid.appendChild(c);
    });
    body.appendChild(grid);

    if (mine) {
      body.appendChild(h('h3', 'p-sub', 'Decisions'));
      var dg = h('div', 'adv-grid');
      Object.keys(War.DECISIONS).forEach(function (id) {
        var d = War.DECISIONS[id], why = War.decisionBlock(tag, id), c = h('div', 'adv');
        c.appendChild(h('b', null, d.name)); c.appendChild(h('span', 'small', d.text));
        var b = btn('ghost small', why && /Again/.test(why) ? why : 'Take · ' + d.pp, function () { after(War.takeDecision(tag, id), d.name); }); b.disabled = !!why; c.appendChild(b); dg.appendChild(c);
      });
      body.appendChild(dg);
    }

    // spies
    body.appendChild(h('h3', 'p-sub', 'Spies (' + War.opsOf(tag).length + ' of ' + War.opSlots(tag) + ' operations)'));
    var ops = War.opsOf(tag);
    if (ops.length) { var ol = h('ul', 'pol-list'); ops.forEach(function (o) { var li = h('li'); li.appendChild(h('span', null, War.OPS[o.kind].name + ' against ' + short(o.target) + ' · ' + Math.max(0, o.done - War.day) + ' days')); if (mine) li.appendChild(btn('ghost small', 'Recall', function () { War.cancelOp(o); after(null); })); ol.appendChild(li); }); body.appendChild(ol); }
    var nets = Object.keys(n.intel).filter(function (x) { return n.intel[x] > 0.01; });
    body.appendChild(h('p', 'small', nets.length ? 'Networks: ' + nets.map(function (x) { return short(x) + ' ' + pct(n.intel[x]); }).join(', ') : 'No spy networks abroad. Start one from a nation\'s card.'));
    var watched = Object.keys(War.pol.N).filter(function (x) { return x !== tag && War.pol.N[x].intel[tag] > 0.2 && War.hasAdv(tag, 'police'); });
    if (watched.length) body.appendChild(h('p', 'small muted', 'Your police have found foreign agents from ' + watched.map(short).join(', ') + '.'));

    // claims and cores
    var claims = {}; Object.keys(War.pol.claims).forEach(function (id) { if (War.pol.claims[id][tag]) { var o = Game.provinces[id].owner; claims[o] = (claims[o] || 0) + 1; } });
    var jus = War.pol.justify.filter(function (j) { return j.tag === tag; }), integ = War.pol.integrate.filter(function (j) { return j.tag === tag; });
    body.appendChild(h('h3', 'p-sub', 'Claims and cores'));
    var cl = h('ul', 'pol-list');
    jus.forEach(function (j) { cl.appendChild(h('li', null, 'Justifying a claim on ' + stName(j.prov) + ' (' + short(j.owner) + ') · ' + Math.max(0, j.done - War.day) + ' days')); });
    integ.forEach(function (j) { cl.appendChild(h('li', null, 'Integrating ' + stName(j.prov) + ' as a core · ' + Math.max(0, j.done - War.day) + ' days')); });
    Object.keys(claims).forEach(function (o) { cl.appendChild(h('li', null, 'Claims on ' + claims[o] + ' provinces of ' + short(o))); });
    var ae = War.pol.ae[tag]; if (ae > 1) cl.appendChild(h('li', 'down', 'Neighbours alarmed by your expansion: −' + Math.round(ae) + ' opinion (fades)'));
    if (!cl.children.length) cl.appendChild(h('li', 'muted', 'No claims. Justify one from a neighbour\'s card. Land taken without a claim alarms the neighbours; claimed land is cheaper at the peace table.'));
    body.appendChild(cl);
    if (mine) {
      var seen = {}, opts = [];
      Game.provinces.forEach(function (p) { if (p.owner === tag && War.core[p.id] !== tag && !seen[p.state] && !War.integrateBlock(tag, p.id)) { seen[p.state] = 1; opts.push([p.id, stName(p.id)]); } });
      if (opts.length) { var row = h('div', 'acts'), sel = selectOf(opts); row.appendChild(sel); row.appendChild(btn('ghost small', 'Make it a core · ' + War.POLCOST.core, function () { after(War.integrateCore(tag, +sel.value), 'Integration begun: 8 months'); })); body.appendChild(row); }
    }

    // client kingdoms, marriages, DMZs
    body.appendChild(h('h3', 'p-sub', 'Crowns and treaties'));
    var cr = h('ul', 'pol-list');
    var ov = War.pol.overlord[tag]; if (ov) cr.appendChild(h('li', 'down', 'A client kingdom of ' + short(ov) + ': pays a tenth of its taxes and follows its wars'));
    War.puppetsOf(tag).forEach(function (s) { var li = h('li', null, short(s) + ' is your client kingdom '); if (mine) { var why = War.annexBlock(tag, s), b = btn('ghost small', 'Annex · ' + War.POLCOST.annex, function () { after(War.annexPuppet(tag, s)); }); b.disabled = !!why; if (why) b.title = why; li.appendChild(b); } cr.appendChild(li); });
    War.marriagesOf(tag).forEach(function (m) { cr.appendChild(h('li', null, 'Married into the house of ' + short(m[0] === tag ? m[1] : m[0]))); });
    Object.keys(War.pol.dmz).forEach(function (s) {
      var z = War.pol.dmz[s], nm = War.states && War.states[s] ? War.states[s].name : 'a region';
      if (z.owner === tag) { var li = h('li', 'down', nm + ' is demilitarised for ' + short(z.for) + ' '); if (mine) li.appendChild(btn('ghost small', 'Remilitarise · ' + War.POLCOST.remil, function () { after(War.remilitarise(tag, +s)); }, short(z.for) + ' will be furious and gain a claim')); cr.appendChild(li); }
      else if (z.for === tag) cr.appendChild(h('li', 'up', short(z.owner) + ' keeps ' + nm + ' empty of troops for you'));
    });
    var rel = War.releasable(tag);
    Object.keys(rel).forEach(function (c) { var li = h('li', null, 'You hold the old lands of ' + short(c) + ' (' + rel[c].length + ' provinces) '); if (mine) li.appendChild(btn('ghost small', 'Restore as a client · ' + War.POLCOST.release, function () { after(War.releasePuppet(tag, c)); })); cr.appendChild(li); });
    if (!cr.children.length) cr.appendChild(h('li', 'muted', 'No client kingdoms, royal marriages or demilitarised zones.'));
    body.appendChild(cr);
  }

  // ---------- on a nation's card ----------
  function nationSection(tag) {
    var wrap = h('div', 'econ pol-card'), pl = Game.player; if (!War.pol || War.gone[tag]) return wrap;
    var n = War.polOf(tag), dl = h('dl', 'facts');
    function row(k, v) { dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, v)); }
    var known = !pl || pl === tag || War.allied(pl, tag) || War.intel(pl, tag) >= 0.25;
    row('Stability', known ? pct(n.stab) : 'Unknown (needs a spy network)');
    row('War support', known ? pct(n.ws) : 'Unknown');
    if (n.adv.length && known) row('Advisers', n.adv.map(function (r) { return War.advName(tag, r); }).join(', '));
    if (pl && pl !== tag) { var op = War.opinion(tag, pl); row('Opinion of you', (op > 0 ? '+' : '') + op); }
    if (War.pol.overlord[tag]) row('Client kingdom of', short(War.pol.overlord[tag]));
    var mar = War.marriagesOf(tag); if (mar.length) row('Married into', mar.map(function (m) { return short(m[0] === tag ? m[1] : m[0]); }).join(', '));
    if (pl && pl !== tag && War.intel(pl, tag) > 0) row('Your spy network', pct(War.intel(pl, tag)));
    if (pl && pl !== tag && War.claimsOn(pl, tag)) row('Your claims', 'on ' + Game.provinces.filter(function (p) { return p.owner === tag && War.claimed(p.id, pl); }).length + ' of their provinces');
    if (pl && pl !== tag && War.claimsOn(tag, pl)) row('Their claims', 'on ' + Game.provinces.filter(function (p) { return p.owner === pl && War.claimed(p.id, tag); }).length + ' of your provinces');
    wrap.appendChild(dl);
    if (!pl || pl === tag || War.gone[pl]) return wrap;

    var P = War.polOf(pl), box = h('div', 'pol-acts');
    // marriage
    var mw = War.marriageBlock(pl, tag), mb = btn('ghost small', 'Propose a royal marriage · ' + War.POLCOST.marriage, function () {
      var ok = War.opinion(tag, pl) >= 0 || War.allianceView(tag, pl).score >= 10;
      if (!ok) { P.pp -= Math.min(P.pp, 10); after(short(tag) + ' politely declines'); return; }
      after(War.marry(pl, tag), 'A royal wedding with ' + short(tag));
    }); mb.disabled = !!mw; if (mw) mb.title = mw; box.appendChild(mb);
    if (War.pol.overlord[tag] === pl) { var aw = War.annexBlock(pl, tag), ab = btn('ghost small', 'Annex · ' + War.POLCOST.annex, function () { after(War.annexPuppet(pl, tag)); }); ab.disabled = !!aw; if (aw) ab.title = aw; box.appendChild(ab); }
    wrap.appendChild(box);

    // claims and ultimatums: on their border regions
    var states = borderStates(pl, tag);
    if (states.length && !War.allied(pl, tag)) {
      var r1 = h('div', 'acts'), sel = selectOf(states.map(function (id) { return [id, stName(id) + (War.claimed(id, pl) ? ' (claimed)' : '')]; }));
      r1.appendChild(h('span', 'small muted', 'Region:')); r1.appendChild(sel);
      r1.appendChild(btn('ghost small', 'Justify a claim · ' + War.POLCOST.claim, function () { after(War.justifyClaim(pl, +sel.value), 'Justifying a claim: 45 days'); }, 'A claim makes the land cheaper to take at the peace table and spares you the neighbours\' alarm'));
      if (!War.atWar(pl, tag)) {
        var odds = War.ultimatumOdds(pl, tag, 'land'), oddsD = War.ultimatumOdds(pl, tag, 'dmz');
        r1.appendChild(btn('ghost small', 'Ultimatum: hand it over · ' + War.POLCOST.ultimatum, function () { ult('land'); }, odds.yes ? 'They would probably give in' : 'They would probably refuse: you need about ' + odds.need.toFixed(1) + '× their strength, you have ' + odds.ratio.toFixed(1) + '×'));
        r1.appendChild(btn('ghost small', 'Ultimatum: demilitarise it · ' + War.POLCOST.ultimatum, function () { ult('dmz'); }, oddsD.yes ? 'They would probably give in' : 'They would probably refuse'));
      }
      wrap.appendChild(r1);
      var ult = function (kind) {
        var r = War.sendUltimatum(pl, tag, +sel.value, kind);
        if (r.why) return after(r.why);
        if (r.accepted) return after(null, short(tag) + ' gives in to your ultimatum');
        after(null); toast(short(tag) + ' refuses. You now hold a claim on the region and may declare war.', 'bad');
      };
    }
    // spies
    var r2 = h('div', 'acts'), osel = selectOf(Object.keys(War.OPS).map(function (k) { return [k, War.OPS[k].name]; })), info = h('span', 'small muted');
    function upd() { var k = osel.value, why = War.opBlock(pl, tag, k), op = War.OPS[k]; info.textContent = op.text + ' · ' + op.pp + ' power, ' + money(op.gold) + ', ' + op.days + ' days · ' + Math.round(War.opChance(pl, tag) * 100) + '% chance' + (why ? ' · ' + why : ''); go.disabled = !!why; }
    var go = btn('ghost small', 'Send agents', function () { after(War.startOp(pl, tag, osel.value), 'Agents on their way to ' + short(tag)); });
    osel.addEventListener('change', upd);
    r2.appendChild(h('span', 'small muted', 'Spies:')); r2.appendChild(osel); r2.appendChild(go); wrap.appendChild(r2); wrap.appendChild(info); upd();
    return wrap;
  }

  // ---------- requests from other courts ----------
  function showRequests() {
    var box = $('requests'); if (!box) return; box.innerHTML = '';
    if (!Game.player || !War.pol) return;
    War.pol.requests.filter(function (r) { return r.to === Game.player; }).forEach(function (r) {
      var card = h('div', 'offer req'), from = short(r.from), title, text, yes, no;
      if (r.type === 'alliance') { title = from + ' proposes an alliance'; text = 'They would stand with you in one faction, sharing your wars and theirs.'; yes = 'Ally'; no = 'Decline'; }
      else if (r.type === 'trade') { title = from + ' proposes a trade agreement'; text = 'Lower duties both ways: +5% market access for each, and a share of each other\'s trade.'; yes = 'Sign'; no = 'Decline'; }
      else if (r.type === 'marriage') { title = from + ' proposes a royal marriage'; text = 'A wedding binds the two houses: better relations, and they will be readier to ally.'; yes = 'Agree'; no = 'Decline'; }
      else { title = from + ' sends an ultimatum'; text = r.kind === 'dmz' ? 'Withdraw every soldier from ' + r.name + ' and pull down its forts, or face war.' : 'Hand over ' + r.name + ', or face war.'; yes = 'Give in'; no = 'Refuse (war)'; }
      card.appendChild(h('strong', null, title)); card.appendChild(h('span', null, text));
      var row = h('div', 'acts'), a = h('button', 'primary', yes), b = h('button', 'ghost', no); a.type = b.type = 'button';
      a.addEventListener('click', function () { after(War.answerRequest(r, true)); showRequests(); Game.emit('owner'); MapView.redraw(); });
      b.addEventListener('click', function () { after(War.answerRequest(r, false)); showRequests(); });
      row.appendChild(a); row.appendChild(b); card.appendChild(row); box.appendChild(card);
    });
  }

  // ---------- map modes ----------
  function opinionColor(i) {
    var p = Game.provinces[i], me = Game.player || (Game.selected !== null ? Game.provinces[Game.selected].owner : 'FRA');
    if (p.owner === me) return '#d0a94f';
    var o = War.opinion(p.owner, me), t = (o + 100) / 200;
    var r = Math.round(170 + (60 - 170) * t), g = Math.round(70 + (150 - 70) * t), b = Math.round(60 + (90 - 60) * t);
    if (Math.abs(o) < 8) return '#cfc6b0';
    return window.Visuals ? Visuals.recolor('rgb(' + r + ',' + g + ',' + b + ')') : 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function claimColor(i) {
    var p = Game.provinces[i], me = Game.player, z = War.inDmz(i);
    if (z) return '#9fb7c9';
    if (me && War.claimed(i, me)) return '#d0a94f';
    if (me && p.owner === me && War.core[i] !== me) return '#c98a5a';
    if (me && p.owner !== me && War.core[i] === me) return '#e3c15a';
    if (me && p.owner === me) return '#8fb07a';
    var c = War.pol.claims[i]; if (c && Object.keys(c).length) return '#b9a46e';
    return War.core[i] !== p.owner ? '#bfa58f' : '#d9d0bb';
  }
  function legend(mode, el, item) {
    if (mode === 'opinion') {
      el.appendChild(h('span', 'legend-title', 'What they think of ' + (Game.player ? 'you' : short(Game.selected !== null ? Game.provinces[Game.selected].owner : 'FRA'))));
      item('rgb(60,150,90)', 'Friendly'); item('#cfc6b0', 'Indifferent'); item('rgb(170,70,60)', 'Hostile'); item('#d0a94f', 'You');
    } else if (mode === 'claims') {
      el.appendChild(h('span', 'legend-title', 'Claims, cores and demilitarised zones'));
      item('#8fb07a', 'Your cores'); item('#c98a5a', 'Yours, not a core'); item('#e3c15a', 'Your lost cores'); item('#d0a94f', 'Your claims'); item('#b9a46e', 'Claimed by others'); item('#9fb7c9', 'Demilitarised');
    } else return false;
    return true;
  }

  function updatePP() {
    var el = $('player-pp'); if (!el) return;
    var n = Game.player && War.polOf(Game.player); el.textContent = n ? '⚑' + Math.floor(n.pp) : ''; el.title = n ? 'Political power: ' + Math.floor(n.pp) + ' · stability ' + pct(n.stab) + ' · war support ' + pct(n.ws) : '';
  }

  window.PolUI = { politicsTab: politicsTab, nationSection: nationSection, showRequests: showRequests, init: function () {
    var off = $('offers'), req = h('div'); req.id = 'requests'; off.parentNode.insertBefore(req, off.nextSibling);
    var chip = $('player-money'), pp = h('span'); pp.id = 'player-pp'; chip.parentNode.insertBefore(pp, chip.nextSibling);
    var ms = $('mode-select'); [['opinion', 'Opinion'], ['claims', 'Claims and cores']].forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; ms.appendChild(op); });
    MapView.addMode('opinion', opinionColor); MapView.addMode('claims', claimColor);
    var prevLegend = DiploUI.legend; DiploUI.legend = function (mode, el, item) { if (!legend(mode, el, item)) prevLegend(mode, el, item); };
    Game.on('event', function (e) {
      if (e.type === 'request') showRequests();
      if (e.type === 'revolution' || e.type === 'marriage') { var m = MapView.mode(); if (m === 'opinion' || m === 'factions') MapView.redraw(); }
    });
    Game.on('day', function () { if (War.day % 5 === 0) updatePP(); });
    Game.on('month', function () { updatePP(); showRequests(); var m = MapView.mode(); if (m === 'opinion' || m === 'claims') MapView.redraw(); });
    Game.on('player', function () { updatePP(); showRequests(); });
    Game.on('reset', function () { updatePP(); showRequests(); });
    updatePP(); showRequests();
  } };
})();
