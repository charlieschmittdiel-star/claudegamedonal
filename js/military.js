// The wider war: the Russian winter, national awakenings, plunder, the Imperial Guard and the grand battery,
// famous generals, sieges of fortresses, army stances, rally points, Landwehr, mercenaries, partisans,
// engineers' field works, winter quarters, forced marches, prisoners of war, battle honours and promotions,
// and a record of every great battle for the replay.
(function (root) {
  'use strict';
  var War = root.War, U = root.UNITS;
  function rnd(o) { var t = o.seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- famous generals ----------
  var T = U.TRAITS;
  T.grandbattery = { name: 'Grand battery', blurb: '+25% attack for artillery: a hundred guns massed against one point' };
  T.ironmarshal = { name: 'The Iron Marshal', blurb: '+12% defence, +10% organisation: his corps never breaks' };
  T.bravest = { name: 'Bravest of the brave', blurb: '+10% attack and +10% breakthrough; leads charges himself' };
  T.reverseslope = { name: 'Reverse slope', blurb: '+20% defence; troops hidden behind the crest lose 15% fewer men' };
  T.vorwarts = { name: 'Marshal Forwards', blurb: '+12% attack, +25% organisation recovery: never stays beaten' };
  T.oldfox = { name: 'Old fox of the north', blurb: '+15% defence on home soil, and the winter is his ally' };
  T.mountainfox = { name: 'Dear child of victory', blurb: '+10% defence, +15% in hills; holds on where others would give way' };
  var FAMOUS = {
    'Napoleon Bonaparte': ['grandbattery'], 'Louis-Nicolas Davout': ['ironmarshal'], 'Michel Ney': ['bravest'], 'Arthur Wellesley': ['reverseslope'],
    'Gebhard von Blücher': ['vorwarts'], 'Mikhail Kutuzov': ['oldfox'], 'André Masséna': ['mountainfox'], 'Archduke Charles': ['veteran']
  };
  Object.keys(U.GENERALS).forEach(function (t) { U.GENERALS[t].forEach(function (g) { (FAMOUS[g[0]] || []).forEach(function (x) { if (g[6].indexOf(x) < 0) g[6].push(x); }); }); });
  // ---------- state ----------
  var FORTRESSES = { Mantua: 3, Gibraltar: 4, Danzig: 3, Magdeburg: 3, Kolberg: 2, Ulm: 2, Ingolstadt: 2, Olmütz: 2, Metz: 3, Strasbourg: 3, Lille: 3, Antwerp: 2, Riga: 2,
    Smolensk: 1, Hamburg: 1, Badajoz: 2, Zaragoza: 1, Gerona: 2, 'Cádiz': 3, Lisbon: 2, Corfu: 2, Kovno: 1, Alessandria: 3, Verona: 2, Glogau: 2, 'Küstrin': 2, Stettin: 2,
    'Königsberg': 2, Glatz: 2, Mainz: 3, Luxembourg: 3, Gaeta: 2, Bender: 2, Belgrade: 3, Varna: 2, Silistra: 2, Copenhagen: 2, Venice: 2, Pamplona: 2, Brest: 2, Toulon: 3 };
  War.FORTRESSES = FORTRESSES;
  var START_ROADS = { Passau: 3, Linz: 3 };
  War.initMilitary = function () {
    var self = this;
    this.mil = { sieges: {}, plunder: { FRA: true, RUS: true }, rally: {}, pow: {}, log: [], awoke: {}, winterLoss: {}, honours: 0, hired: {} };
    this.provs.forEach(function (p) { var f = FORTRESSES[p.name]; if (f) { var b = self.econ.P[p.id].b; b.fort = Math.max(b.fort || 0, f); } });
    // the Danube road into Austria: the Passau and Linz crossing starts with a made road (marching -30% into each)
    this.provs.forEach(function (p) { var r = START_ROADS[p.name]; if (r) { var b = self.econ.P[p.id].b; b.roads = Math.max(b.roads || 0, r); } });
    // the Imperial Guard: France's best division near Paris
    var paris = this.byName.Paris, fr = this.divs.filter(function (d) { return d.tag === 'FRA' && d.type === 'inf'; });
    if (paris && fr.length) { fr.sort(function (a, b) { return Math.hypot(self.provs[a.prov].x - paris.x, self.provs[a.prov].y - paris.y) - Math.hypot(self.provs[b.prov].x - paris.x, self.provs[b.prov].y - paris.y); }); var g = fr[0]; g.guard = true; g.xp = 0.9; g.name = 'Imperial Guard'; }
  };

  // ---------- per-division multipliers (Guard, Landwehr, mercenaries, partisans, army stance) ----------
  War.dm = function (d, side, bt) {
    var m = 1;
    if (d.guard) m *= 1.3; else if (d.militia) m *= 0.62; else if (d.partisan) m *= side === 'd' ? 0.8 : 0.55; else if (d.merc) m *= 1.05;
    var a = this.armyOf ? this.armyOf(d.id) : null;
    if (a) { if (a.stance === 2) m *= side === 'a' ? 1.15 : 1.03; else if (a.stance === 0) m *= side === 'a' ? 0.85 : 1.15; if (a.forced) m *= 0.92; }
    if (side === 'd') { var cm = this.cmdOf(d); if (cm && cm.oldfox && this.provs[d.prov].owner === d.tag) m *= 1 + 0.15 * Math.min(1, cm.oldfox); }
    return m;
  };
  War.dmCas = function (d) {
    var m = 1, a = this.armyOf ? this.armyOf(d.id) : null;
    if (d.guard) m *= 0.8;
    if (a) { if (a.stance === 2) m *= 1.15; else if (a.stance === 0) m *= 0.85; }
    var cm = this.cmdOf(d); if (cm && cm.rslope && d.battle !== null) { var bt = this.battleById(d.battle); if (bt && bt.tag !== d.tag) m *= 1 - 0.15 * Math.min(1, cm.rslope); }
    return m;
  };
  War.divKind = function (d) { return d.guard ? 'Guard' : d.militia ? 'Landwehr' : d.merc ? 'Mercenaries' : d.partisan ? 'Partisans' : null; };

  // ---------- sieges ----------
  War.siegeNeed = function (id) { var f = this.fortAt(id); return f ? 25 + 20 * f : 0; };
  var prevSet = War.setCtrl;
  War.setCtrl = function (p, tag) {
    var to = this.allied(tag, p.owner) ? p.owner : tag, f = this.fortAt ? this.fortAt(p.id) : 0;
    // a fortress held by its rightful owner must be besieged before it falls
    if (this.mil && f > 0 && !this._siegeDone && to !== p.owner && p.ctrl === p.owner && this.hostile(tag, p)) {
      var s = this.mil.sieges[p.id];
      if (!s || s.by !== tag) { this.mil.sieges[p.id] = { by: tag, prog: 0, need: this.siegeNeed(p.id), day: this.day }; if (tag === this.player || p.owner === this.player) this.event(tag === this.player ? 'plan' : 'lost', this.nations[tag].short + ' lays siege to ' + p.name, { a: tag, b: p.owner, prov: p.id }); }
      return;
    }
    var before = p.ctrl;
    prevSet.call(this, p, tag);
    if (this.mil && p.ctrl !== before && p.ctrl !== p.owner && before === p.owner) this.onCapture(p, p.ctrl);
  };
  War.sieging = function (id) { return this.mil && this.mil.sieges[id] || null; };
  // is this division part of a siege its side is running where it stands? (armies and the computer leave such divisions be)
  War.besieging = function (d) { var s = this.sieging(d.prov); return !!(s && this.allied(d.tag, s.by)); };
  function siegeDay(W) {
    var S = W.mil.sieges;
    Object.keys(S).forEach(function (k) {
      var id = +k, s = S[k], p = W.provs[id];
      if (p.ctrl !== p.owner || !W.hostile(s.by, p)) { delete S[k]; return; }
      var here = (W.at[id] || []).filter(function (d) { return W.allied(d.tag, s.by) && d.battle === null && !d.path.length; });
      if (!here.length) { s.prog = Math.max(0, s.prog - 1); if (s.prog <= 0 && W.day - s.day > 10) delete S[k]; return; }   // leaving only slowly undoes the work
      var pw = 0, trains = 0; here.forEach(function (d) { if (W.stats(d).has.siege) trains++; });
      here.forEach(function (d) { var st = W.stats(d); pw += d.str * (d.type === 'art' || (st.n && st.n.art) ? 1.8 : 1) * (st.has.eng ? 1.5 : 1) * (st.has.siege ? 2 : 1); });
      var starving = W.blockaded && W.blockaded(id, p.owner) ? 1.4 : 1;
      s.prog += Math.min(2 + Math.min(2, 0.5 * trains), 0.4 + pw * 0.2) * starving;   // siege trains lift the daily cap (up to +2)
      if (s.prog >= s.need) {
        delete S[k]; W._siegeDone = true; W.setCtrl(p, here[0].tag); W._siegeDone = false;
        W.event(here[0].tag === W.player || p.owner === W.player ? (p.owner === W.player ? 'lost' : 'battle') : 'siegequiet', 'The fortress of ' + p.name + ' surrenders to ' + W.nations[here[0].tag].short + ' after a siege of ' + (W.day - s.day) + ' days', { a: here[0].tag, b: p.owner, prov: id });
        W.mil.pow[here[0].tag] = W.mil.pow[here[0].tag] || {}; W.mil.pow[here[0].tag][p.owner] = (W.mil.pow[here[0].tag][p.owner] || 0) + 1500 * W.fortAt(id);
      }
    });
  }

  // ---------- plunder ----------
  War.onCapture = function (p, by) {
    var self = this;
    if (this.mil.plunder[by] && !this.allied(by, p.owner)) {
      var P0 = this.econ.P[p.id], loot = Math.round(P0.pop * 0.012 + (P0.b.textile || 0) * 400);
      this.econ.N[by].treasury += loot; P0.pop = Math.round(P0.pop * 0.985);
      this.resist[p.id] = Math.min(1, (this.resist[p.id] || 0) + 0.12);
      if (by === this.player && loot > 500) this.mil.loot = (this.mil.loot || 0) + loot;
      if (this.pol) this.addGoodwill(p.owner, by, -2);
    }
  };

  // ---------- recruiting the irregulars ----------
  var MERC = { SWI: 'Swiss', HES: 'Hessian', BRU: 'Brunswick', HAN: 'Hanoverian', SAX: 'Saxon', ALG: 'Barbary', OTT: 'Albanian' };
  War.mercCost = function (t) { return 14000; };
  War.mercsOf = function (t) { return this.divs.filter(function (d) { return d.tag === t && d.merc; }); };
  War.hireBlock = function (t) {
    if (this.mercsOf(t).length >= 4) return 'At most four mercenary divisions';
    if ((this.econ.N[t].treasury || 0) < this.mercCost(t)) return 'Needs ƒ' + this.mercCost(t).toLocaleString('en');
    if (!this.capitalProv(t)) return 'No capital to muster them';
    return null;
  };
  War.capitalProv = function (t) { var n = this.nations[t], p = n && n.capital && this.byName[n.capital]; if (p && p.ctrl === t) return p; var own = this.provs.filter(function (q) { return q.owner === t && q.ctrl === t; }); return own[0] || null; };
  War.hireMercs = function (t) {
    var why = this.hireBlock(t); if (why) return why;
    var cap = this.capitalProv(t), keys = Object.keys(MERC), from = keys[Math.floor(rnd(this) * keys.length)];
    this.econ.N[t].treasury -= this.mercCost(t);
    var d = this.spawn(t, 'inf', cap.id, 1); d.merc = true; d.xp = 0.45; d.org = 0.9; d.name = MERC[from] + ' regiment';
    this.indexStacks(); return null;
  };
  War.landwehrBlock = function (t) {
    if (!this.atWarAny(t)) return 'Only in time of war';
    var last = this.mil.lw && this.mil.lw[t]; if (last !== undefined && this.day - last < 365) return 'Again in ' + Math.ceil((365 - (this.day - last)) / 30) + ' months';
    if (this.pol && this.pol.N[t].pp < 50) return 'Needs 50 political power';
    if (!this.capitalProv(t)) return 'No land left to raise them in';
    return null;
  };
  War.raiseLandwehr = function (t) {
    var why = this.landwehrBlock(t); if (why) return why;
    if (this.pol) this.pol.N[t].pp -= 50;
    (this.mil.lw = this.mil.lw || {})[t] = this.day;
    var self = this, pop = this.econ.N[t].pop || 0, n = clamp(Math.round(pop / 1.5e6), 2, 10);
    var homes = this.ownP(t).filter(function (p) { return p.ctrl === t; }).sort(function (a, b) { return self.econ.P[b.id].pop - self.econ.P[a.id].pop; });
    for (var i = 0; i < n; i++) { var d = this.spawn(t, 'inf', homes[i % homes.length].id, 0.8); d.militia = true; d.xp = 0; d.org = 0.6; d.name = 'Landwehr'; }
    this.M[t].manpower = Math.max(0, this.M[t].manpower - n * 3000);
    if (this.pol) this.shockWs(t, 0.05);
    this.indexStacks();
    this.event(t === this.player ? 'ready' : 'mil', this.nations[t].short + ' calls out ' + n + ' divisions of Landwehr', { a: t });
    return null;
  };
  War.guardBlock = function (t, d) {
    if (!d || d.tag !== t) return 'Pick one of your divisions';
    if (d.guard || d.militia || d.merc || d.partisan) return 'Not this division';
    if ((d.xp || 0) < 0.8) return 'Only an Elite division (80% experience)';
    var have = this.divs.filter(function (x) { return x.tag === t && x.guard; }).length, cap = Math.max(1, Math.floor(this.divs.filter(function (x) { return x.tag === t; }).length / 15));
    if (have >= cap) return 'At most ' + cap + ' Guard division' + (cap > 1 ? 's' : '') + ' for an army this size';
    if (this.pol && this.pol.N[t].pp < 50) return 'Needs 50 political power';
    return null;
  };
  War.makeGuard = function (t, d) { var why = this.guardBlock(t, d); if (why) return why; if (this.pol) this.pol.N[t].pp -= 50; d.guard = true; d.name = (t === 'FRA' ? 'Imperial' : 'Royal') + ' Guard'; return null; };

  // ---------- partisans, awakening, winter ----------
  function partisans(W) {
    var count = {};
    W.divs.forEach(function (d) { if (d.partisan) count[d.tag] = (count[d.tag] || 0) + 1; });
    W.provs.forEach(function (p, i) {
      var c = W.core[i]; if (!c || c === p.ctrl || W.gone[c] || !W.atWar(c, p.ctrl) || W.resist[i] < 0.7) return;
      if ((count[c] || 0) >= 6 || rnd(W) > 0.06) return;
      var d = W.spawn(c, 'inf', i, 0.45); d.partisan = true; d.xp = 0.2; d.org = 0.8; d.name = (c === 'SPA' ? 'Guerrilla band' : 'Partisans'); count[c] = (count[c] || 0) + 1;
      W.resist[i] = Math.max(0, W.resist[i] - 0.2);
      if (c === W.player || p.ctrl === W.player) W.event(c === W.player ? 'ready' : 'lost', (c === 'SPA' ? 'Guerrillas' : 'Partisans') + ' take up arms at ' + p.name, { a: c, b: p.ctrl, prov: i });
    });
    if (Object.keys(count).length) W.indexStacks();
  }
  function awakening(W) {
    W.tags.forEach(function (t) {
      if (W.gone[t] || !W.atWarAny(t) || !W.nations[t].major && ['POR', 'TYR'].indexOf(t) < 0) return;
      var own = 0, occ = 0; W.eachOwned(t, function (p) { if (p.owner === t) { own++; if (p.ctrl !== t) occ++; } });
      if (!own || occ / own < 0.3) return;
      var last = W.mil.awoke[t]; if (last !== undefined && W.day - last < 1800) return;
      W.mil.awoke[t] = W.day;
      W.M[t].manpower += Math.round((W.econ.N[t].pop || 0) * 0.015);
      if (W.pol) { W.shockWs(t, 0.25); W.shockStab(t, 0.05); }
      W.provs.forEach(function (p, i) { if (p.owner === t && p.ctrl !== t) W.resist[i] = Math.min(1, W.resist[i] + 0.2); });
      (W.mil.boost = W.mil.boost || {})[t] = W.day + 540;
      W.techVer++;
      W.event(t === W.player ? 'ready' : 'mil', 'National awakening in ' + W.nations[t].short + ': the whole people rises against the invader', { a: t });
    });
  }
  // the awakened fight harder; the winter is crueller to strangers deep in Russia
  var prevExtra = War.extraMods;
  War.extraMods = function (tag) { var m = prevExtra ? prevExtra.call(this, tag) : {}; if (this.mil && this.mil.boost && this.mil.boost[tag] > this.day) { m.def = (m.def || 0) + 0.1; m.org = (m.org || 0) + 0.1; } return m; };
  var prevAttr = War.weatherAttr;
  War.weatherAttr = function (d, p) {
    var a = prevAttr.call(this, d, p), army = this.armyOf ? this.armyOf(d.id) : null;
    if (army && army.wq && this.allied(d.tag, p.owner) && !d.path.length) return 0;
    if (a > 0 && this.winterAt(p) && !this.allied(d.tag, p.owner) && p.lon > 22 && p.lat > 49) {
      var cm = this.cmdOf(d), extra = 0.0015 * (1 - Math.min(0.9, cm.winter || 0)); a += extra;
      if (this.mil) this.mil.winterLoss[d.tag] = (this.mil.winterLoss[d.tag] || 0) + (a * this.stats(d).men);
    }
    return a;
  };
  function winterDay(W) {
    W.divs.forEach(function (d) {
      var p = W.provs[d.prov];
      if (W.winterAt(p) && !W.allied(d.tag, p.owner) && p.lon > 22 && p.lat > 49) d.org = Math.min(d.org, 0.55);
    });
    // a winter's toll is reported once a month to whoever pays it
    if (W.day % 30 === 0) Object.keys(W.mil.winterLoss).forEach(function (t) {
      var men = Math.round(W.mil.winterLoss[t]); if (men > 2000 && (t === W.player || W.nations[t].major)) W.event(t === W.player ? 'lost' : 'mil', 'The Russian winter costs ' + W.nations[t].short + ' ' + men.toLocaleString('en') + ' men this month', { a: t });
      W.mil.winterLoss[t] = 0;
    });
  }

  // ---------- army orders: stance, winter quarters, forced march, rally point ----------
  War.setStance = function (a, s) { a.stance = s; this._cm = null; };
  War.setWQ = function (a, on) { a.wq = !!on; if (on) { a.forced = false; var self = this; a.divs.forEach(function (id) { var d = null; for (var i = 0; i < self.divs.length; i++) if (self.divs[i].id === id) { d = self.divs[i]; break; } if (d && !d.battle) { d.path = []; d.prog = 0; } }); } };
  War.setForced = function (a, on) { a.forced = !!on; if (on) a.wq = false; };
  var prevLeg = War.legDays;
  War.legDays = function (d, from, leg) { var n = prevLeg.call(this, d, from, leg), a = this.armyOf ? this.armyOf(d.id) : null; return a && a.forced ? n * 0.7 : n; };
  War.setRally = function (t, id) { if (id === null) { delete this.mil.rally[t]; return null; } var p = this.provs[id]; if (!p || p.owner !== t || p.ctrl !== t) return 'Pick a province you hold'; this.mil.rally[t] = id; return null; };
  var prevSpawn = War.spawn;
  War.spawn = function (tag, tpl, prov, str) { var d = prevSpawn.call(this, tag, tpl, prov, str); d.born = this.day; return d; };
  function ordersDay(W) {
    var A = W.armies, i, byDiv = {};
    for (i = 0; i < A.length; i++) A[i].divs.forEach(function (id) { byDiv[id] = A[i]; });
    W.divs.forEach(function (d) {
      var a = byDiv[d.id];
      if (a && a.forced && d.path.length) { d.org = Math.max(0.05, d.org - 0.012); d.str = Math.max(0.05, d.str - 0.0006); }
      if (a && a.wq && !d.path.length && d.battle === null && W.allied(d.tag, W.provs[d.prov].owner)) { d.org = Math.min(1, d.org + 0.02); if (d.str < 1 && W.M[d.tag].manpower > 2000) { d.str = Math.min(1, d.str + 0.004); W.M[d.tag].manpower -= 30; } }
      // engineers dig field works
      if (!d.path.length && d.battle === null && W.stats(d).has.eng) d.entr = Math.min(0.6, (d.entr || 0) + 0.006);
      // fresh divisions and the beaten go to the rally point, where they recover faster
      var r = W.mil.rally[d.tag];
      if (r !== undefined) {
        if (r === d.prov && d.battle === null) d.org = Math.min(1, d.org + 0.015);
        else if (!a && !d.path.length && d.battle === null && d.born !== undefined && W.day - d.born <= 2 && !d.partisan) W.orderMove(d, r, true);
      }
    });
  }

  // ---------- battles: replay records, prisoners, honours ----------
  var prevFight = War.fight;
  War.fight = function (bt) {
    var r = prevFight.call(this, bt);
    if (!this.mil || !this.battleById(bt.id)) return r;
    var self = this, A = this.attackers(bt), D = this.defenders(bt), sa = 0, sd = 0, oa = 0, od = 0;
    A.forEach(function (d) { sa += d.str * self.stats(d).men; oa += d.org; }); D.forEach(function (d) { sd += d.str * self.stats(d).men; od += d.org; });
    bt.hist = bt.hist || []; if (bt.hist.length < 120) bt.hist.push([Math.round(sa), Math.round(sd), A.length ? +(oa / A.length).toFixed(3) : 0, D.length ? +(od / D.length).toFixed(3) : 0]);
    bt.peakA = Math.max(bt.peakA || 0, A.length); bt.peakD = Math.max(bt.peakD || 0, D.length);
    bt.defTag = bt.defTag || this.provs[bt.prov].ctrl;
    return r;
  };
  var prevEnd = War.endBattle;
  War.endBattle = function (bt, attackerWon) {
    var p = this.provs[bt.prov], defTag = bt.defTag || p.ctrl, D = this.defenders(bt), self = this;
    var gens = { a: null, d: null };
    var A0 = this.attackers(bt); if (A0[0]) { var c1 = this.cmdOf(A0[0]); if (c1 && c1.who) gens.a = typeof c1.who === 'object' ? c1.who.name : (this.genById(c1.who) || {}).name; }
    if (D[0]) { var c2 = this.cmdOf(D[0]); if (c2 && c2.who) gens.d = typeof c2.who === 'object' ? c2.who.name : (this.genById(c2.who) || {}).name; }
    function topGen(t) { var g = self.gens.filter(function (x) { return x.tag === t; }).sort(function (x, y) { return y.skill - x.skill; })[0]; return g ? g.name : null; }
    if (!gens.a) gens.a = topGen(bt.tag); if (!gens.d) gens.d = topGen(defTag);
    var winners = attackerWon ? A0 : D;
    prevEnd.call(this, bt, attackerWon);
    if (!this.mil || attackerWon === null || attackerWon === undefined) return;
    var win = attackerWon ? bt.tag : defTag, lose = attackerWon ? defTag : bt.tag, size = (bt.peakA || 0) + (bt.peakD || 0);
    var lostLoser = attackerWon ? bt.casD || 0 : bt.casA || 0;
    // prisoners: a share of the beaten side's losses were taken, not killed
    var pw = Math.round(lostLoser * (0.25 + (attackerWon ? 0.1 : 0)));
    if (pw > 0) { (this.mil.pow[win] = this.mil.pow[win] || {})[lose] = (this.mil.pow[win][lose] || 0) + pw; }
    // honours for the regiments that won a real battle
    if (size >= 6 && bt.days >= 2) winners.forEach(function (d) { if (!d.dead) { d.hon = d.hon || []; if (d.hon.indexOf(p.name) < 0) { d.hon.push(p.name); if (d.hon.length > 4) d.hon.shift(); } } });
    if (size >= 4) {
      this.mil.log.push({ id: bt.id, name: p.name, prov: bt.prov, day: this.day, start: this.day - bt.days, a: bt.tag, d: defTag, win: win, na: bt.peakA || 0, nd: bt.peakD || 0, casA: Math.round(bt.casA || 0), casD: Math.round(bt.casD || 0), pow: pw, hist: bt.hist || [], ga: gens.a, gd: gens.d, terrain: p.terrain });
      if (this.mil.log.length > 40) this.mil.log.shift();
    }
  };
  // prisoners go home at the peace
  function freePrisoners(W, a, b) {
    [[a, b], [b, a]].forEach(function (x) { var P = W.mil.pow[x[0]]; if (P && P[x[1]]) { W.M[x[1]].manpower += P[x[1]]; delete P[x[1]]; } });
  }
  var prevAfter = War.afterPeace;
  War.afterPeace = function () {
    var r = prevAfter.apply(this, arguments); if (!this.mil) return r;
    var self = this; Object.keys(this.mil.pow).forEach(function (w) { Object.keys(self.mil.pow[w]).forEach(function (l) { if (!self.atWar(w, l)) freePrisoners(self, w, l); }); });
    Object.keys(this.mil.sieges).forEach(function (k) { var s = self.mil.sieges[k], p = self.provs[k]; if (!self.hostile(s.by, p)) delete self.mil.sieges[k]; });
    return r;
  };
  War.prisonersHeld = function (t) { var P = this.mil.pow[t] || {}, n = 0; for (var k in P) n += P[k]; return n; };
  War.prisonersLost = function (t) { var n = 0, self = this; Object.keys(this.mil.pow).forEach(function (w) { n += (self.mil.pow[w][t] || 0); }); return n; };

  // promotions: a general who reaches skill 4 is made a marshal
  var prevXp = War.gainGenXp;
  War.gainGenXp = function (g, amt) {
    var s0 = g ? g.skill : 0; prevXp.call(this, g, amt);
    if (g && g.skill >= 4 && s0 < 4 && !g.fm) { g.fm = true; this.event(g.tag === this.player ? 'general' : 'mil', g.name + ' is made a marshal of ' + this.nations[g.tag].short, { a: g.tag }); }
  };

  // ---------- the computer ----------
  function aiMonth(W) {
    var pl = W.player, wm = Math.floor(((W.year() % 1) * 12)) + 1;
    W.tags.forEach(function (t) {
      if ((W.isHuman ? W.isHuman(t) : t === pl) || W.gone[t]) return;
      var own = 0, occ = 0; W.eachOwned(t, function (p) { if (p.owner === t) { own++; if (p.ctrl !== t) occ++; } });
      if (own && occ / own > 0.12 && !W.landwehrBlock(t)) W.raiseLandwehr(t);
      if (W.atWarAny(t) && W.nations[t].major && W.econ.N[t].treasury > 120000 && rnd(W) < 0.2 && !W.hireBlock(t)) W.hireMercs(t);
      // armies in a northern winter with no fighting to do go into winter quarters, and come out in spring
      W.armies.forEach(function (a) { if (a.tag !== t) return; if ((wm === 12 || wm <= 2) && !a.front && !a.targets.length) a.wq = true; else if (wm >= 3 && wm <= 11) a.wq = false; });
    });
    // mercenaries go home unpaid
    W.divs.forEach(function (d) { if (d.merc && W.econ.N[d.tag].treasury < 0) { d.dead = true; if (d.tag === pl) W.event('lost', d.name + ' deserts: the pay chests are empty', { a: d.tag }); } else if (d.merc) W.econ.N[d.tag].treasury -= 1200; });
    if (W.divs.some(function (d) { return d.dead; })) { W.divs.forEach(function (d) { if (d.dead) W.leaveBattle(d); }); W.divs = W.divs.filter(function (d) { return !d.dead; }); W.indexStacks(); }
    partisans(W); awakening(W);
  }

  // ---------- hooks ----------
  var baseInit = War.init;
  War.init = function (a, b, c, d) { baseInit.call(this, a, b, c, d); this.initMilitary(); };
  var baseStep = War.step;
  War.step = function () { baseStep.call(this); if (this.mil && !this.conference) { siegeDay(this); winterDay(this); ordersDay(this); } };
  var baseMonth = War.month;
  War.month = function () { baseMonth.call(this); if (this.mil) aiMonth(this); };
  var baseSer = War.serialize;
  War.serialize = function () {
    var s = baseSer.call(this); if (!this.mil) return s;
    s.mil = { sieges: this.mil.sieges, plunder: this.mil.plunder, rally: this.mil.rally, pow: this.mil.pow, log: this.mil.log, awoke: this.mil.awoke, boost: this.mil.boost, lw: this.mil.lw, loot: this.mil.loot };
    s.divx = this.divs.map(function (d) { return [d.id, d.guard ? 1 : 0, d.militia ? 1 : 0, d.merc ? 1 : 0, d.partisan ? 1 : 0, d.name || '', d.hon || [], d.born || 0]; }).filter(function (x) { return x[1] || x[2] || x[3] || x[4] || x[6].length || x[5]; });
    s.armx = this.armies.map(function (a) { return [a.id, a.stance === undefined ? 1 : a.stance, a.wq ? 1 : 0, a.forced ? 1 : 0]; });
    return s;
  };
  var baseRestore = War.restore;
  War.restore = function (s) {
    var ok = baseRestore.call(this, s); if (!ok) return ok;
    var self = this; this.initMilitary();
    this.divs.forEach(function (d) { delete d.guard; });
    if (s.mil) { var m = this.mil; Object.keys(s.mil).forEach(function (k) { if (s.mil[k] !== undefined) m[k] = s.mil[k]; }); m.winterLoss = {}; }
    var byId = {}; this.divs.forEach(function (d) { byId[d.id] = d; });
    (s.divx || []).forEach(function (x) { var d = byId[x[0]]; if (!d) return; d.guard = !!x[1]; d.militia = !!x[2]; d.merc = !!x[3]; d.partisan = !!x[4]; if (x[5]) d.name = x[5]; d.hon = x[6]; d.born = x[7]; });
    var ab = {}; this.armies.forEach(function (a) { ab[a.id] = a; });
    (s.armx || []).forEach(function (x) { var a = ab[x[0]]; if (a) { a.stance = x[1]; a.wq = !!x[2]; a.forced = !!x[3]; } });
    return ok;
  };
})(typeof window !== 'undefined' ? window : globalThis);
