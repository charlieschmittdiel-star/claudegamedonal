// Trade, money and the sea: colonies and overseas trade, bankers and loans, paper money and inflation, smuggling,
// harvests and famine, the coming of steam, trade agreements and tariff wars, migration; and at sea, shore
// batteries, privateers, storms, press gangs, raids on enemy coasts and the fame of named ships.
(function (root) {
  'use strict';
  var War = root.War, Econ = root.Econ;
  function rnd(o) { var t = o.seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- new buildings and techs ----------
  Econ.BUILDINGS.battery = { name: 'Shore battery', kind: 'infra', coastal: true, max: 3, money: 1800, goods: { timber: 20, tools: 10, iron: 10 }, months: 6, blurb: 'Guns on the coast: fires on enemy ships offshore, stops blockades of this port and makes landings costly' };
  if (Econ.CP) Econ.CP.battery = 3000;
  var NEW_TECH = [
    ['powerloom', 'ind', 'Power loom', 1812, 180, { cloth_out: 0.2, factory: 0.05 }, 'factorysys', 'Cloth +20%, mills +5%'],
    ['steamboat', 'nav', 'Steam paddle tugs', 1816, 220, { nspd: 0.1, nrepair: 0.2 }, 'copper', 'Ships +10% speed, repair +20%'],
    ['railways', 'ind', 'Railways', 1824, 260, { supply: 0.2, cons: 0.1, spd: 0.05 }, 'tramways', 'Supply +20%, construction +10%'],
    ['banking', 'ind', 'Joint-stock banking', 1810, 150, { loanrate: -0.002 }, 'statistics', 'Loans 0.2% a month cheaper']
  ];
  NEW_TECH.forEach(function (a) { if (War.TECH_BY[a[0]]) return; var t = { id: a[0], cat: a[1], name: a[2], year: a[3], days: a[4], eff: a[5], req: a[6], note: a[7] || null, path: null }; War.TECH.push(t); War.TECH_BY[t.id] = t; });

  // ---------- colonies ----------
  // Each colony is real land on the map now: it belongs to whoever owns its chief town, pays its trade to them while
  // they hold the town, and changes hands with the land around it. [name, chief town, trade a month, reach in km]
  var COLONIES = [
    ['Jamaica', 'Kingston', 1700, 250], ['Bengal', 'Calcutta', 2600, 700], ['Madras', 'Madras', 900, 450], ['Bombay', 'Bombay', 700, 300], ['Canada', 'Quebec', 1000, 900], ['Ceylon', 'Colombo', 600, 300],
    ['Trinidad', 'Port of Spain', 400, 120], ['Gibraltar trade', 'Gibraltar', 400, 30], ['New South Wales', 'Sydney', 100, 900],
    ['New Spain', 'Mexico', 2400, 900], ['Cuba', 'Havana', 1300, 700], ['Peru', 'Lima', 1200, 900], ['New Granada', 'Santa Fe de Bogotá', 800, 700], ['Venezuela', 'Caracas', 500, 500],
    ['Río de la Plata', 'Buenos Aires', 700, 900], ['Chile', 'Santiago de Chile', 350, 700], ['Philippines', 'Manila', 500, 800],
    ['Brazil', 'Rio de Janeiro', 1700, 900], ['Bahia', 'Bahia', 800, 700], ['Angola', 'Luanda', 350, 600], ['Goa', 'Goa', 300, 120], ['Macau', 'Macau', 250, 40],
    ['Java', 'Batavia', 1600, 800], ['Cape Colony', 'Cape Town', 500, 800], ['Suriname', 'Paramaribo', 450, 300], ['Curaçao', 'Curaçao', 250, 80],
    ['Guadeloupe', 'Guadeloupe', 700, 80], ['Martinique', 'Martinique', 650, 80], ['Île de France', 'Île de France', 500, 350], ['Senegal', 'Saint-Louis', 250, 300], ['Guiana', 'Cayenne', 100, 300],
    ['Danish West Indies', 'Saint Thomas', 450, 80], ['Tranquebar', 'Tranquebar', 150, 50]
  ];
  War.COLONIES = COLONIES;
  // who holds each colony follows the map
  War.syncColonies = function () {
    var c = this.com.col, provs = this.provs;
    for (var k in c) { var p = provs[c[k].prov]; if (p) { c[k].owner = p.owner; c[k].held = p.ctrl === p.owner; } }
  };
  War.coloniesOf = function (t) { this.syncColonies(); var c = this.com.col; return Object.keys(c).filter(function (k) { return c[k].owner === t; }).map(function (k) { return c[k]; }); };
  // the land that goes with a colony: its owner's provinces overseas within reach of the chief town
  War.colonyLand = function (k) {
    var c = this.com.col[k], hub = this.provs[c.prov], self = this, out = [];
    this.ownIds(hub.owner).forEach(function (id) { var p = self.provs[id]; if (p.owner === hub.owner && (id === c.prov || (p.world && self.distKm(hub, p) <= c.reach))) out.push(id); });
    return out;
  };
  // income from the colonies and the ships that carry it: enemy navies and blockades cut it. A town in enemy hands
  // pays nothing; trade that never knew a European counting-house (a town taken by an inland power) pays less.
  War.colonyIncome = function (t) {
    var list = this.coloniesOf(t); if (!list.length) return 0;
    var cap = this.capOf ? this.capOf(t) : (this.nations[t].capital ? this.byName[this.nations[t].capital] : null), sea = t === 'USA' || (cap && !cap.world);
    var v = 0; list.forEach(function (c) { if (c.held) v += c.value * (sea || c.home === t ? 1 : 0.4); });
    var cut = this.blockadeShare ? this.blockadeShare(t) : 0, priv = this.com.privCut[t] || 0;
    return Math.round(v * (1 - 0.7 * cut) * (1 - priv));
  };

  // ---------- state ----------
  War.initCommerce = function () {
    var self = this, col = {};
    COLONIES.forEach(function (c) { var p = self.byName[c[1]]; if (p) col[c[0]] = { name: c[0], value: c[2], prov: p.id, reach: c[3], owner: p.owner, home: p.owner, held: true }; });
    this.com = { col: col, loans: {}, credit: {}, infl: {}, printed: {}, trade: [], tariff: [], blind: {}, harvest: {}, emig: {}, flight: {}, storms: {}, priv: { ALG: true, TUN: true, TRI: true, MOR: true, FRA: true }, press: { GBR: true }, privCut: {}, raids: {}, fame: [] };
  };

  // ---------- bankers and loans ----------
  var BANKERS = [['Rothschild', 'London and Frankfurt'], ['Hope & Co.', 'Amsterdam'], ['Barings', 'London'], ['Ouvrard', 'Paris']];
  War.BANKERS = BANKERS;
  War.loansOf = function (t) { return this.com.loans[t] || []; };
  War.loanRate = function (t) {
    var n = this.pol && this.pol.N[t], debt = 0; this.loansOf(t).forEach(function (l) { debt += l.left; });
    var tax = Math.max(1, ((this.econ.N[t].last && this.econ.N[t].last.taxRev) || 1000));
    return clamp(0.006 + (n ? (0.6 - n.stab) * 0.01 : 0) + debt / tax * 0.0006 + (this.atWarAny(t) ? 0.002 : 0) + this.mod(t, 'loanrate') + (this.com.infl[t] || 0) * 0.01, 0.004, 0.025);
  };
  War.loanSize = function (t) { return Math.round(Math.max(5000, ((this.econ.N[t].last && this.econ.N[t].last.taxRev) || 2000) * 6) / 1000) * 1000; };
  War.loanBlock = function (t) {
    if (this.com.credit[t] > this.day) return 'No banker will lend: you defaulted (credit back in ' + Math.ceil((this.com.credit[t] - this.day) / 30) + ' months)';
    if (this.loansOf(t).length >= 3) return 'At most three loans at a time';
    return null;
  };
  War.takeLoan = function (t, bank) {
    var why = this.loanBlock(t); if (why) return why;
    var amt = this.loanSize(t), r = this.loanRate(t), b = BANKERS[bank === undefined ? Math.floor(rnd(this) * BANKERS.length) : bank];
    (this.com.loans[t] = this.com.loans[t] || []).push({ bank: b[0], amt: amt, left: amt, rate: r, months: 60, day: this.day });
    this.econ.N[t].treasury += amt; return null;
  };
  War.repayLoan = function (t, i) {
    var l = this.loansOf(t)[i]; if (!l) return 'No such loan';
    if (this.econ.N[t].treasury < l.left) return 'Not enough in the treasury';
    this.econ.N[t].treasury -= l.left; this.com.loans[t].splice(i, 1); return null;
  };
  function loansMonth(W) {
    Object.keys(W.com.loans).forEach(function (t) {
      var L = W.com.loans[t], E = W.econ.N[t]; if (!L.length || W.gone[t]) return;
      var pay = 0; L.forEach(function (l) { var p = l.amt / l.months, i = l.left * l.rate; pay += p + i; l.left = Math.max(0, l.left - p); });
      E.treasury -= pay; E.loanPay = pay;
      W.com.loans[t] = L.filter(function (l) { return l.left > 1; });
      // a treasury deep in the red with loans outstanding: default
      if (E.treasury < -pay * 4 && W.com.loans[t].length) {
        W.com.loans[t] = []; W.com.credit[t] = W.day + 1800;
        if (W.shockStab) W.shockStab(t, -0.15);
        W.event(t === W.player ? 'lost' : 'econ', W.nations[t].short + ' defaults on its loans: the bankers will not lend again for years', { a: t });
      }
    });
  }

  // ---------- paper money ----------
  War.printBlock = function (t) { var l = this.com.printed[t]; if (l !== undefined && this.day - l < 180) return 'Again in ' + Math.ceil((180 - (this.day - l)) / 30) + ' months'; return null; };
  War.printMoney = function (t) {
    var why = this.printBlock(t); if (why) return why;
    var E = this.econ.N[t], amt = Math.round(Math.max(3000, ((E.last && E.last.taxRev) || 2000) * 3));
    E.treasury += amt; this.com.infl[t] = Math.min(1, (this.com.infl[t] || 0) + 0.08); this.com.printed[t] = this.day;
    return null;
  };

  // ---------- trade agreements and tariff wars ----------
  War.tradeWith = function (a, b) { return this.com.trade.some(function (x) { return (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a); }); };
  War.tariffOn = function (a, b) { return this.com.tariff.some(function (x) { return x[0] === a && x[1] === b; }); };
  War.tradeBlock = function (a, b) {
    if (a === b || this.gone[b]) return 'Not possible';
    if (this.tradeWith(a, b)) return 'Already trading freely';
    if (this.atWar(a, b)) return 'At war';
    if (this.tariffOn(a, b) || this.tariffOn(b, a)) return 'End the tariff war first';
    if (this.com.trade.filter(function (x) { return x[0] === a || x[1] === a; }).length >= 4) return 'At most four agreements';
    if (this.inSystem && ((this.inSystem(a) && b === 'GBR') || (this.inSystem(b) && a === 'GBR'))) return 'The Continental System forbids it';
    var op = this.opinion ? this.opinion(b, a) : 0; if (op < 0 && !this.allied(a, b)) return 'They think too little of you (' + op + ')';
    return null;
  };
  War.signTrade = function (a, b) { var why = this.tradeBlock(a, b); if (why) return why; this.com.trade.push([a, b, this.day]); this.addGoodwill(a, b, 8); this.addGoodwill(b, a, 8); Econ.refreshAccess(); return null; };
  War.endTrade = function (a, b) { this.com.trade = this.com.trade.filter(function (x) { return !((x[0] === a && x[1] === b) || (x[0] === b && x[1] === a)); }); Econ.refreshAccess(); return null; };
  War.startTariff = function (a, b, quiet) {
    if (a === b || this.tariffOn(a, b)) return 'Already';
    this.endTrade(a, b); this.com.tariff.push([a, b, this.day]); this.addGoodwill(b, a, -20); Econ.refreshAccess();
    if (!quiet) this.event(b === this.player ? 'request' : 'econ', this.nations[a].short + ' raises tariffs against ' + this.nations[b].short, { a: a, b: b });
    // they answer in kind, more often than not
    if (b !== this.player && !this.tariffOn(b, a) && rnd(this) < 0.6) this.startTariff(b, a);
    return null;
  };
  War.endTariff = function (a, b) { this.com.tariff = this.com.tariff.filter(function (x) { return !(x[0] === a && x[1] === b); }); this.addGoodwill(b, a, 5); Econ.refreshAccess(); return null; };

  // ---------- smuggling ----------
  War.smuggling = function (t) {
    var W = War;
    if (!W.com) return 0;
    var v = 0.12, self = W;
    if (W.com.blind[t]) v += 0.18;
    if (t === 'GBR') { v = 0.15; Object.keys(W.com.blind).forEach(function (x) { if (self.com.blind[x]) v += 0.03; }); }
    if (t !== 'GBR' && W.superiority) { var zones = {}; W.eachOwned(t, function (p) { if (p.owner === t && p.coastal && p.sea >= 0) zones[p.sea] = 1; }); var gb = 0, n = 0; Object.keys(zones).forEach(function (z) { n++; if (self.superiority('GBR', +z) > 0.6) gb++; }); if (n) v += 0.15 * gb / n; }
    return clamp(v, 0, 0.6);
  };

  // ---------- trade access ----------
  var prevAccess = Econ.refreshAccess;
  Econ.refreshAccess = function () {
    prevAccess.call(this);
    var W = War; if (!W.com) return; var self = this;
    W.com.trade.forEach(function (x) { [x[0], x[1]].forEach(function (t) { if (self.N[t]) self.N[t].access = Math.min(1.3, self.N[t].access + 0.05); }); });
    W.com.tariff.forEach(function (x) { if (self.N[x[1]]) self.N[x[1]].access = Math.max(0.3, self.N[x[1]].access - 0.05); if (self.N[x[0]]) self.N[x[0]].access = Math.max(0.3, self.N[x[0]].access - 0.015); });
    Object.keys(W.com.privCut).forEach(function (t) { if (self.N[t]) self.N[t].access = Math.max(0.3, self.N[t].access * (1 - W.com.privCut[t] * 0.3)); });
  };

  // ---------- harvests ----------
  // each autumn decides the next year's harvest; 1816, the year without a summer, is bad everywhere
  function harvests(W) {
    var y = Math.floor(W.year()), hist = W.story && W.story.mode === 'historical', europe = (rnd(W) - 0.5) * 0.12;
    if (y === 1816 && hist) europe = -0.22; if (y === 1811 && hist) europe = 0.1;
    W.tags.forEach(function (t) {
      if (W.gone[t]) return;
      var h = clamp(1 + europe + (rnd(W) - 0.5) * 0.24, 0.65, 1.2), occ = 0, own = 0;
      W.eachOwned(t, function (p) { if (p.owner === t) { own++; if (p.ctrl !== t) occ++; } });
      if (own && occ / own > 0.2) h -= 0.08;                                    // armies trample the fields
      W.com.harvest[t] = Math.round(h * 100) / 100;
      if (h < 0.82) {
        if (W.shockStab) W.shockStab(t, -0.05);
        if (t === W.player || W.nations[t].major) W.event(t === W.player ? 'lost' : 'econ', (h < 0.75 ? 'Famine' : 'A bad harvest') + ' in ' + W.nations[t].short + ': grain ' + Math.round((1 - h) * 100) + '% short', { a: t });
      } else if (h > 1.12 && t === W.player) W.event('ready', 'A bumper harvest: grain +' + Math.round((h - 1) * 100) + '%', { a: t });
    });
    W.techVer++;
  }

  // ---------- modifiers from all this ----------
  var prevExtra = War.extraMods;
  War.extraMods = function (tag) {
    var m = prevExtra ? prevExtra.call(this, tag) : {}; if (!this.com) return m;
    var h = this.com.harvest[tag]; if (h) { m.grain_out = (m.grain_out || 0) + (h - 1); m.land = (m.land || 0) + (h - 1) * 0.35; }
    if (this.com.press[tag]) { m.nprod = (m.nprod || 0) + 0.25; m.nrepair = (m.nrepair || 0) + 0.25; }
    return m;
  };
  if (War.stabTarget) {
    var prevStab = War.stabTarget;
    War.stabTarget = function (t) {
      var v = prevStab.call(this, t); if (!this.com) return v;
      var n = this.pol.N[t], add = 0, inf = this.com.infl[t] || 0;
      if (inf > 0.02) { n.why['Inflation'] = -Math.round(inf * 0.35 * 1000) / 1000; add += n.why['Inflation']; }
      if (this.com.press[t]) { n.why['Press gangs'] = -0.03; add -= 0.03; }
      var h = this.com.harvest[t]; if (h && h < 0.9) { n.why['Bad harvest'] = -Math.round((0.9 - h) * 0.5 * 1000) / 1000; add += n.why['Bad harvest']; }
      return clamp(v + add, 0.02, 0.98);
    };
  }

  // ---------- the month's accounts ----------
  function commerceMonth(W) {
    var C = W.com;
    W.tags.forEach(function (t) {
      if (W.gone[t]) return; var E = W.econ.N[t];
      // colonies
      var ci = W.colonyIncome(t); if (ci) { E.treasury += ci; } E.colInc = ci;
      // inflation eats the real value of taxes, then slowly wears off
      var inf = C.infl[t] || 0; if (inf > 0) { var lossI = ((E.last && E.last.taxRev) || 0) * inf * 0.5; E.treasury -= lossI; E.inflLoss = lossI; C.infl[t] = Math.max(0, inf - 0.006); if (C.infl[t] <= 0) delete C.infl[t]; } else E.inflLoss = 0;
      // trade agreements and tariffs
      var gain = 0; C.trade.forEach(function (x) { var o = x[0] === t ? x[1] : x[1] === t ? x[0] : null; if (o && W.econ.N[o].last) gain += W.econ.N[o].last.taxRev * 0.01; });
      C.tariff.forEach(function (x) { if (x[0] === t && W.econ.N[x[1]].last) gain += W.econ.N[x[1]].last.taxRev * 0.006; });
      E.treasury += gain; E.tradeInc = gain;
      // migration: flight from war-torn land to the capital, emigration from poverty to the Americas
      var cap = W.capitalProv ? W.capitalProv(t) : null;
      W.provs.forEach(function (p, i) {
        if (p.owner !== t) return; var e = W.econ.P[i];
        if ((p.ctrl !== t || W.resist[i] > 0.4) && cap && cap.id !== i) { var mv = e.pop * 0.004; e.pop -= mv; W.econ.P[cap.id].pop += mv * 0.7; C.flight[t] = (C.flight[t] || 0) + mv; }
      });
      if (E.sol && E.sol.life < 0.78) { var out = 0; W.eachOwned(t, function (p, i) { if (p.owner === t && p.coastal) { var mv = W.econ.P[i].pop * 0.0008; W.econ.P[i].pop -= mv; out += mv; } }); C.emig[t] = (C.emig[t] || 0) + out; }
    });
    // privateers and corsairs: a monthly toll on enemy merchantmen, and fear in the shipping lanes
    C.privCut = {};
    W.tags.forEach(function (t) {
      if (!C.priv[t] || W.gone[t]) return;
      var ports = 0; W.eachHeld(t, function (p) { if (p.ctrl === t && W.econ.P[p.id].b.port > 0) ports += W.econ.P[p.id].b.port; });
      if (!ports) return;
      W.enemies(t).forEach(function (e) {
        if (!W.NV[e] || !W.NV[e].convoys) return;
        var esc = 0; W.fleets.forEach(function (f) { if (f.tag === e && (f.mission === 'escort' || f.mission === 'patrol') && !f.inPort) esc += f.ships.length; });
        var took = Math.floor(Math.min(W.NV[e].convoys * 0.05, ports * 0.25) / (1 + esc / 25) + rnd(W));
        if (took > 0) { W.NV[e].convoys = Math.max(0, W.NV[e].convoys - took); W.econ.N[t].treasury += took * 250; if (W.NV[e].stats) W.NV[e].stats.convLost += took; C.privCut[e] = Math.min(0.25, (C.privCut[e] || 0) + 0.03 + took * 0.004); }
        if (e === W.player && took > 0) W.event('lost', W.nations[t].short + '\'s privateers took ' + took + ' of your merchantmen', { a: t, b: e });
      });
    });
    // Britain picks off the colonies of enemies it blockades
    // (the small ones: an island, a trading post, a cape. Whole viceroyalties have to be conquered on the ground.)
    W.syncColonies();
    if (!W.gone.GBR) Object.keys(C.col).forEach(function (k) {
      var c = C.col[k]; if (c.owner === 'GBR' || !W.atWar('GBR', c.owner) || !W.provs[c.prov].coastal) return;
      if (W.isHuman ? W.isHuman(c.owner) || W.isHuman('GBR') : c.owner === W.player || W.player === 'GBR') return;   // players fight for their own
      var share = W.blockadeShare ? W.blockadeShare(c.owner) : 0, heavy = 0, land = W.colonyLand(k), guard = 0;
      W.fleets.forEach(function (f) { if (f.tag === 'GBR') heavy += f.ships.length; });
      land.forEach(function (id) { (W.at[id] || []).forEach(function (d) { if (d.tag === c.owner) guard++; }); });
      if (land.length <= 12 && share > 0.3 && heavy > 40 && rnd(W) < 0.015 / (1 + guard)) takeColony(W, k, 'GBR', 'British troops land and seize ');
    });
    // a smuggler's paradise annoys the Emperor
    Object.keys(C.blind).forEach(function (t) { if (C.blind[t] && W.inSystem && W.inSystem(t)) W.addGoodwill('FRA', t, -1.5); });
    loansMonth(W);
    var mo = Math.floor((W.year() % 1) * 12) + 1; if (mo === 9 && W.day % 365 >= 0) { if (C.harvestYear !== Math.floor(W.year())) { C.harvestYear = Math.floor(W.year()); harvests(W); } }
    aiCommerce(W);
  }
  function takeColony(W, k, to, how) {
    W.syncColonies();
    var c = W.com.col[k], from = c.owner; if (from === to) return;
    var land = W.colonyLand(k), hub = W.provs[c.prov];
    if (how && land.length > 12) land = [c.prov];                                             // a landing takes the town alone
    else if (land.length > 14) land = land.sort(function (a, b) { return W.distKm(hub, W.provs[a]) - W.distKm(hub, W.provs[b]); }).slice(0, 14);   // a treaty takes the town and the country round it
    land.forEach(function (id) { var p = W.provs[id]; p.owner = to; p.ctrl = to; if (W.resist) W.resist[id] = Math.min(W.resist[id] || 0, 0.2); });
    c.owner = to; W.afterPeace(); if (W.syncFactions) W.syncFactions();
    W.event(from === W.player || to === W.player ? (to === W.player ? 'battle' : 'lost') : 'econ', (how || '') + c.name + (how ? ' from ' + W.nations[from].short : ' passes from ' + W.nations[from].short + ' to ' + W.nations[to].short), { a: to, b: from, map: true });
  }
  War.takeColony = function (k, to, how) { takeColony(this, k, to, how); };
  // a naval power that wins a war takes a colony at the peace: one whose chief town its troops hold when the guns
  // fall silent, or any on the coast once its fleets have shut the loser's ports. (Chosen before the treaty hands
  // occupied land back.)
  function colonyPick(W, win, lose) {
    var mine = 0; W.fleets.forEach(function (f) { if (f.tag === win) mine += f.ships.length; });
    var cap = W.nations[win].capital ? W.byName[W.nations[win].capital] : null; if (!cap || cap.world || mine < 15) return null;      // a sea power from across the ocean
    var seas = W.blockadeShare ? W.blockadeShare(lose) > 0.25 : false;
    var list = W.coloniesOf(lose).filter(function (c) { var p = W.provs[c.prov]; return p.world && p.coastal && (p.ctrl === win || seas); }).sort(function (a, b) { return b.value - a.value; });
    return list.length ? list[0].name : null;
  }
  function colonyGive(W, k, win, lose) { if (!k) return; W.syncColonies(); if (W.com.col[k].owner === lose && !W.gone[win]) takeColony(W, k, win, null); }
  var prevDictate = War.dictatePeace;
  War.dictatePeace = function (t) { var k = this.com ? colonyPick(this, t.win, t.lose) : null, r = prevDictate.call(this, t); if (this.com) colonyGive(this, k, t.win, t.lose); return r; };
  var prevClose = War.closeConference;
  War.closeConference = function () {
    var c = this.conference, self = this, picks = [];
    if (this.com && c) c.losers.forEach(function (l) { var v = c.victors.slice().sort(function (a, b) { return (b.took ? b.took.length : 0) - (a.took ? a.took.length : 0); })[0]; if (v) picks.push([colonyPick(self, v.tag, l), v.tag, l]); });
    prevClose.call(this);
    picks.forEach(function (x) { colonyGive(self, x[0], x[1], x[2]); });
  };

  // ---------- the sea: storms, shore batteries, raids, fame ----------
  War.STORM_ZONES = null;
  function stormDay(W) {
    var C = W.com, mo = Math.floor((W.year() % 1) * 12) + 1, winter = mo >= 10 || mo <= 3;
    W.seas.forEach(function (z) {
      if (C.storms[z.id] > 0) { C.storms[z.id]--; if (!C.storms[z.id]) delete C.storms[z.id]; return; }
      var north = z.y < 700, ocean = /Atlantic|Biscay|North Sea|Channel|Approaches|Norwegian|Skagerrak|Irish/i.test(z.name);
      var p = (winter ? 0.012 : 0.003) * (ocean ? 1.6 : 1) * (north ? 1.3 : 0.8);
      if (rnd(W) < p) C.storms[z.id] = 3 + Math.floor(rnd(W) * 5);
    });
    W.fleets.forEach(function (f) {
      if (f.inPort || !C.storms[f.zone]) return;
      var lost = [];
      f.ships = f.ships.filter(function (s) {
        var mx = W.shipStat(f.tag, s.t, 'hp'); s.hp = Math.max(1, s.hp - mx * (0.012 + rnd(W) * 0.02));
        if (s.hp < mx * 0.25 && rnd(W) < 0.02) { lost.push(s.name || 'a ' + (s.t === 'frig' ? 'frigate' : s.t === 'brig' ? 'brig' : 'ship of the line')); W.NV[f.tag].stats.lost++; return false; }
        return true;
      });
      f.org = Math.max(0.1, f.org - 0.02);
      if (lost.length && (f.tag === W.player || lost.length >= 2)) W.event(f.tag === W.player ? 'lost' : 'econ', 'A storm in the ' + W.seas[f.zone].name + ' sinks ' + lost.join(', ') + ' of ' + f.name, { a: f.tag, zone: f.zone });
    });
    if (W.fleets.some(function (f) { return !f.ships.length; })) W.fleets = W.fleets.filter(function (f) { if (f.ships.length) return true; if (f.adm !== null && W.admirals[f.adm]) W.admirals[f.adm].fleet = null; return false; });
    // shore batteries fire on enemy ships offshore
    W.provs.forEach(function (p) {
      var b = W.econ.P[p.id].b.battery; if (!b || p.sea < 0) return;
      W.fleets.forEach(function (f) { if (f.zone !== p.sea || f.inPort || !W.atWar(f.tag, p.ctrl)) return; f.ships.forEach(function (s) { if (rnd(W) < 0.05 * b) s.hp = Math.max(1, s.hp - W.shipStat(f.tag, s.t, 'hp') * 0.04); }); });
    });
  }
  // storms slow fleets; batteries stop blockades
  var prevBlock = War.blockaded;
  War.blockaded = function (prov, tag) { if (this.econ && this.econ.P[prov] && (this.econ.P[prov].b.battery || 0) >= 2) return false; return prevBlock.call(this, prov, tag); };
  var prevDm = War.dm;
  War.dm = function (d, side, bt) {
    var m = prevDm ? prevDm.call(this, d, side, bt) : 1;
    if (side === 'a' && bt && d.path.length && d.path[0].sea) { var b = this.econ.P[bt.prov].b.battery || 0; if (b) m *= 1 - 0.12 * b; }
    return m;
  };
  // raids on enemy coasts: frigates on the "Raid the coast" mission land parties to burn and loot
  function raidMonth(W) {
    W.fleets.forEach(function (f) {
      if (f.inPort || f.mission !== 'coast' || f.path.length || f.battle !== null) return;
      var frig = f.ships.filter(function (s) { return s.t === 'frig' || s.t === 'brig'; }).length; if (!frig) return;
      var targets = W.provs.filter(function (p) { return p.coastal && p.sea === f.zone && W.atWar(f.tag, p.ctrl) && W.atWar(f.tag, p.owner); });
      if (!targets.length) return;
      var p = targets[Math.floor(rnd(W) * targets.length)], bat = W.econ.P[p.id].b.battery || 0, garr = (W.at[p.id] || []).length;
      if (rnd(W) < 0.25 + 0.15 * bat + 0.1 * garr) { f.ships.forEach(function (s) { s.hp = Math.max(1, s.hp - W.shipStat(f.tag, s.t, 'hp') * 0.08); }); if (f.tag === W.player) W.event('lost', 'The raiding party at ' + p.name + ' is driven off', { a: f.tag, prov: p.id }); return; }
      var loot = Math.round(W.econ.P[p.id].pop * 0.004 * Math.min(3, 1 + frig / 4)); W.econ.N[f.tag].treasury += loot; W.econ.N[p.owner].treasury -= loot * 0.5;
      if (W.econ.P[p.id].b.port > 0 && rnd(W) < 0.12) W.econ.P[p.id].b.port--;
      W.resist[p.id] = Math.min(1, W.resist[p.id] + 0.05);
      if (W.pol) W.shockWs(p.owner, -0.01);
      if (f.tag === W.player || p.owner === W.player) W.event(f.tag === W.player ? 'battle' : 'lost', W.nations[f.tag].short + ' raids ' + p.name + ' from the sea: ƒ' + loot.toLocaleString('en') + ' taken', { a: f.tag, b: p.owner, prov: p.id });
    });
  }
  // named ships earn fame in battle; famous ships fight a little better
  var prevEndN = War.endNavalBattle;
  War.endNavalBattle = function (bt, F, winner) {
    var self = this, z = this.seas[bt.zone].name;
    [0, 1].forEach(function (k) { F[k].forEach(function (f) { f.ships.forEach(function (s) { if (!s.name || s.struck) return; s.fame = (s.fame || 0) + (k === winner ? 2 : 1); (s.bat = s.bat || []).push(z); if (s.bat.length > 4) s.bat.shift(); s.xp = Math.min(1, (s.xp || 0) + (k === winner ? 0.1 : 0.04)); }); }); });
    prevEndN.call(this, bt, F, winner);
    var fam = []; this.fleets.forEach(function (f) { f.ships.forEach(function (s) { if (s.fame >= 3) fam.push({ name: s.name, tag: f.tag, fame: s.fame, bat: (s.bat || []).slice(), fleet: f.name }); }); });
    this.com.fame = fam.sort(function (a, b) { return b.fame - a.fame; }).slice(0, 12);
  };

  // ---------- the computer ----------
  function aiCommerce(W) {
    var pl = W.player;
    W.tags.forEach(function (t) {
      if ((W.isHuman ? W.isHuman(t) : t === pl) || W.gone[t]) return; var E = W.econ.N[t];
      if (E.treasury < 0 && W.atWarAny(t) && !W.loanBlock(t) && W.nations[t].major) W.takeLoan(t);
      else if (E.treasury < -30000 && !W.printBlock(t) && rnd(W) < 0.3) W.printMoney(t);
      W.loansOf(t).forEach(function (l, i) { if (E.treasury > l.left * 3 && !W.atWarAny(t)) W.repayLoan(t, i); });
      if (W.inSystem && W.inSystem(t) && t !== 'FRA') W.com.blind[t] = W.goodwill[t] && (W.goodwill[t].FRA || 0) < -10;
      if (W.nations[t].major && rnd(W) < 0.03) {
        var cands = W.tags.filter(function (x) { return x !== t && x !== pl && !W.gone[x] && !W.tradeBlock(t, x) && W.opinion(x, t) > 10; });
        if (cands.length) W.signTrade(t, cands[Math.floor(rnd(W) * cands.length)]);
      }
      if (W.nations[t].major && rnd(W) < 0.004) { var foe = W.tags.filter(function (x) { return x !== t && !W.gone[x] && W.nations[x].major && W.opinion(t, x) < -30 && !W.atWar(t, x) && !W.tariffOn(t, x); })[0]; if (foe) W.startTariff(t, foe); }
    });
    // war breaks agreements
    W.com.trade = W.com.trade.filter(function (x) { return !W.atWar(x[0], x[1]) && !W.gone[x[0]] && !W.gone[x[1]]; });
    W.com.tariff = W.com.tariff.filter(function (x) { return !W.gone[x[0]] && !W.gone[x[1]] && !(x[0] !== pl && W.allied(x[0], x[1])); });
    // the player is offered trade now and then
    if (pl && !W.gone[pl] && W.pol && rnd(W) < 0.05) {
      var t2 = W.tags.filter(function (x) { return x !== pl && !W.gone[x] && !W.tradeBlock(x, pl) && W.opinion(x, pl) > 15; })[0];
      if (t2 && !W.pol.requests.some(function (r) { return r.type === 'trade'; })) { W.pol.requests.push({ id: W.nextId++, type: 'trade', from: t2, to: pl, day: W.day }); W.event('request', W.nations[t2].short + ' proposes a trade agreement', { a: t2, b: pl }); }
    }
  }
  if (War.answerRequest) {
    var prevAnswer = War.answerRequest;
    War.answerRequest = function (r, yes) {
      if (r.type !== 'trade') return prevAnswer.call(this, r, yes);
      this.pol.requests = this.pol.requests.filter(function (x) { return x !== r; });
      return yes ? this.signTrade(r.from, r.to) : null;
    };
  }

  // ---------- hooks ----------
  var baseInit = War.init;
  War.init = function (a, b, c, d) { baseInit.call(this, a, b, c, d); this.initCommerce(); };
  var baseStep = War.step;
  War.step = function () { baseStep.call(this); if (this.com && !this.conference) stormDay(this); };
  var baseMonth = War.month;
  War.month = function () { baseMonth.call(this); if (this.com) { commerceMonth(this); raidMonth(this); } };
  var baseSer = War.serialize;
  War.serialize = function () {
    var s = baseSer.call(this); if (!this.com) return s;
    s.com = this.com;
    s.shipx = []; this.fleets.forEach(function (f) { f.ships.forEach(function (sh, i) { if (sh.fame || sh.bat) s.shipx.push([f.id, i, sh.fame || 0, sh.bat || []]); }); });
    return s;
  };
  var baseRestore = War.restore;
  War.restore = function (s) {
    var ok = baseRestore.call(this, s); if (!ok) return ok;
    var self = this; this.initCommerce();
    if (s.com) { var C0 = this.com, fresh = C0.col; Object.keys(s.com).forEach(function (k) { C0[k] = s.com[k]; }); var any = Object.keys(C0.col)[0]; if (!any || C0.col[any].prov === undefined) C0.col = fresh; }
    (s.shipx || []).forEach(function (x) { var f = self.fleetById(x[0]); if (f && f.ships[x[1]]) { f.ships[x[1]].fame = x[2]; f.ships[x[1]].bat = x[3]; } });
    return ok;
  };
})(typeof window !== 'undefined' ? window : globalThis);
