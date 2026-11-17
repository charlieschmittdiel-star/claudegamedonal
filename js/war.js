// The war engine: divisions, recruiting, marching, battles, occupation, supply, wars and peace, and the
// generals of the other nations. No screen code here, so it can be run and tested on its own.
//
// One step = one day:
//   1. divisions being raised get closer to ready
//   2. divisions with orders march; marching into a held province starts a battle there
//   3. battles are fought: each side wears down the other's organisation and strength
//   4. resting divisions recover, dig in and take replacements; cut-off or overcrowded ones waste away
//   5. the other nations' generals issue orders (every few days)
//   6. nations whose capital and heartland are lost give in
(function (root) {
  'use strict';

  var TYPES = {
    inf: { name: 'Infantry division', short: 'Inf', men: 8000, atk: 6, def: 9, speed: 20, eq: { muskets: 60, artillery: 4, horses: 5 }, money: 600, days: 60, upkeep: 90 },
    cav: { name: 'Cavalry division', short: 'Cav', men: 3000, atk: 7, def: 4, speed: 34, eq: { horses: 60, muskets: 15 }, money: 700, days: 75, upkeep: 110 },
    art: { name: 'Artillery reserve', short: 'Art', men: 2500, atk: 11, def: 4, speed: 15, eq: { artillery: 30, horses: 20, muskets: 5 }, money: 800, days: 90, upkeep: 130 }
  };
  var ORDER = ['inf', 'cav', 'art'];
  var T_DEF = { p: 1, h: 1.25, f: 1.2, s: 1.3, m: 1.5, d: 1.05 };   // defender's advantage by terrain
  var T_MOVE = { p: 1, h: 1.3, f: 1.3, s: 1.5, m: 1.8, d: 1.4 };    // marching time by terrain
  var T_WIDTH = { p: 8, h: 6, f: 6, s: 5, m: 4, d: 7 };             // divisions a side can bring to bear at once

  // Field armies in 1805 as [infantry, cavalry, artillery] divisions. Anyone not listed gets a force sized to its people.
  var ARMIES = {
    FRA: [34, 9, 5], AUS: [26, 8, 4], RUS: [30, 9, 5], PRU: [18, 6, 3], GBR: [9, 2, 2], SPA: [10, 3, 1], OTT: [16, 8, 2],
    ITA: [3, 1, 0], BAT: [2, 0, 1], BAV: [3, 1, 0], WUR: [1, 0, 0], BAD: [1, 0, 0], SWE: [4, 1, 1], DEN: [4, 1, 0], NAP: [3, 1, 0],
    POR: [3, 1, 0], SAX: [2, 1, 0], PER: [7, 4, 0], MOR: [3, 2, 0], ALG: [3, 1, 0], SWI: [2, 0, 0],
    // the wider world
    USA: [4, 1, 0], HAI: [3, 0, 0], QNG: [30, 12, 2], JAP: [12, 2, 0], KOR: [6, 1, 0], MAR: [9, 7, 1], SIK: [4, 3, 1], HYD: [4, 2, 0], MYS: [3, 1, 0], OUD: [3, 1, 0], RAJ: [3, 3, 0], NEP: [3, 0, 0],
    AFG: [4, 5, 0], BUR: [5, 1, 0], SIA: [4, 1, 0], VIE: [5, 1, 0], SOK: [3, 3, 0], ETH: [3, 1, 0], ASH: [3, 0, 0], BUK: [2, 2, 0], KOK: [1, 2, 0], KHI: [1, 2, 0], KAZ: [0, 4, 0], NAJ: [2, 3, 0],
    OMA: [2, 0, 0], YEM: [2, 0, 0], COM: [0, 2, 0], SIO: [0, 2, 0], TEC: [2, 0, 0], CRE: [2, 0, 0], MAP: [1, 1, 0], MER: [2, 0, 0], NGU: [2, 0, 0], MAO: [1, 0, 0], HAW: [1, 0, 0]
  };
  // troops kept overseas in 1805: [nation, province, infantry divisions]
  var GARRISONS = [['GBR', 'Calcutta', 3], ['GBR', 'Madras', 2], ['GBR', 'Bombay', 1], ['GBR', 'Delhi', 2], ['GBR', 'Quebec', 1], ['GBR', 'Halifax', 1], ['GBR', 'Kingston', 1], ['GBR', 'Colombo', 1],
    ['SPA', 'Mexico', 2], ['SPA', 'Havana', 1], ['SPA', 'Lima', 1], ['SPA', 'Buenos Aires', 1], ['SPA', 'Santa Fe de Bogotá', 1], ['SPA', 'Caracas', 1], ['SPA', 'Manila', 1], ['SPA', 'Santiago de Chile', 1],
    ['POR', 'Rio de Janeiro', 1], ['POR', 'Bahia', 1], ['FRA', 'Santo Domingo', 1], ['FRA', 'Guadeloupe', 1], ['FRA', 'Île de France', 1], ['BAT', 'Batavia', 2], ['BAT', 'Cape Town', 1],
    ['RUS', 'Irkutsk', 1], ['RUS', 'Ekaterinburg', 1], ['OTT', 'Basra', 1]];
  // Alliances at the start: Napoleon's bloc and the Third Coalition.
  var BLOCS = [['FRA', 'ITA', 'BAT', 'BAV', 'WUR', 'BAD', 'SPA'], ['GBR', 'AUS', 'RUS', 'SWE']];
  // Drill, officers and organisation: Napoleon's corps and Britain's regulars fought above their numbers.
  var QUALITY = { USA: 0.95, QNG: 0.7, JAP: 0.8, KOR: 0.7, MAR: 0.8, SIK: 0.9, HYD: 0.75, MYS: 0.8, OUD: 0.7, RAJ: 0.8, NEP: 0.9, AFG: 0.85, BUR: 0.75, SIA: 0.75, VIE: 0.75, SOK: 0.75, ETH: 0.75, ASH: 0.75,
    BUK: 0.75, KOK: 0.75, KHI: 0.75, KAZ: 0.75, NAJ: 0.8, OMA: 0.75, YEM: 0.7, COM: 0.85, SIO: 0.85, TEC: 0.8, CRE: 0.75, MAP: 0.85, HAI: 0.85, MER: 0.7, NGU: 0.8, MAO: 0.85, HAW: 0.7,
    FRA: 1.25, GBR: 1.1, AUS: 0.95, PRU: 0.95, OTT: 0.9, PER: 0.85, MOR: 0.85, ALG: 0.85, TUN: 0.85, TRI: 0.85, CAU: 0.9, SPA: 0.9, NAP: 0.85 };
  var START_WARS = [['FRA', 'GBR', 'blocs'], ['RUS', 'PER', true]]; // 'blocs': every member of both alliances is in it

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(seedObj) { // small deterministic generator so a saved game replays the same way
    var t = seedObj.seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  var War = {
    TYPES: TYPES, ORDER: ORDER, QUALITY: QUALITY, T_DEF: T_DEF, T_MOVE: T_MOVE, T_WIDTH: T_WIDTH, SEA_RANGE: 9000, AI_SEA_RANGE: 2200, player: null, onEvent: null,
    skill: 2,          // 1 = simple generals, 2 = skilled generals and active diplomacy
    aiLevel: {},       // per-nation override, used for testing one against the other
    noDiplomacy: false,

    init: function (provinces, nations, econ, kmPerPx) {
      var self = this;
      this.provs = provinces; this.nations = nations; this.econ = econ; this.km = kmPerPx || 2.33;
      this.tags = Object.keys(nations); this.day = 0; this.seed = 1805; this.nextId = 1;
      this.divs = []; this.battles = []; this.recruits = []; this.log = []; this.wars = {}; this.ally = {}; this.M = {}; this.gone = {}; this.truce = {}; this.offers = []; this.lastPeace = {}; this.plans = {}; this.capLost = {}; this.start0 = {}; this.start0div = {}; this.armies = []; this.ctrlVersion = 0;
      this.byName = {}; provinces.forEach(function (p) { p.ctrl = p.owner; self.byName[p.name] = p; });
      this.tags.forEach(function (t) { self.ally[t] = {}; self.M[t] = { manpower: Math.round((econ.N[t].pop || 0) * 0.008), upkeep: 0 }; });
      if (this.initUnits) this.initUnits();
      BLOCS.forEach(function (b) { b.forEach(function (x) { b.forEach(function (y) { if (x !== y) self.ally[x][y] = true; }); }); });
      START_WARS.forEach(function (w) { self.declare(w[0], w[1], w[2]); });
      this.tags.forEach(function (t) {
        var a = ARMIES[t], pop = econ.N[t].pop || 0;
        if (!a) a = pop >= 150000 ? [Math.max(1, Math.round(pop / 700000)), pop > 1500000 ? 1 : 0, 0] : [0, 0, 0];
        self.placeArmy(t, a);
        var sp = econ.N[t].stockpile;
        ORDER.forEach(function (ty, i) { var eq = self.tplOfCls ? self.tplStats(self.tplOfCls(t, ty)).eq : TYPES[ty].eq; for (var g in eq) sp[g] += eq[g] * a[i] * 0.12; });
      });
      GARRISONS.forEach(function (g) { var gp = self.byName[g[1]]; if (!gp || gp.owner !== g[0]) return; for (var k = 0; k < g[2]; k++) self.spawn(g[0], 'inf', gp.id, 0.9); });
      provinces.forEach(function (p) { self.start0[p.owner] = (self.start0[p.owner] || 0) + 1; });
      this.tags.forEach(function (t) { if (!self.start0[t]) self.gone[t] = true; });   // nations still to be born (Mexico, Brazil...) wait off the map
      this.divs.forEach(function (d) { self.start0div[d.tag] = (self.start0div[d.tag] || 0) + 1; });
      if (this.initGenerals) this.initGenerals();
      this.indexStacks(); this.refreshSupply(); this.refreshUpkeep();
    },

    // ---------- relations ----------
    key: function (a, b) { return a < b ? a + '|' + b : b + '|' + a; },
    // kilometres between two places with lat/lon (provinces, sea zones): the map is a Mercator, so pixels will not do
    distKm: function (a, b) { var dl = Math.abs(a.lon - b.lon); if (dl > 180) dl = 360 - dl; var x = dl * Math.cos((a.lat + b.lat) * 0.008726646), y = a.lat - b.lat; return 111.195 * Math.sqrt(x * x + y * y); },
    atWar: function (a, b) { var m = this._wi[a]; return m !== undefined && m[b] === 1; },
    allied: function (a, b) { return a === b || !!(this.ally[a] && this.ally[a][b]); },
    friendly: function (tag, p) { return this.allied(tag, p.ctrl); },
    hostile: function (tag, p) { return this.atWar(tag, p.ctrl); },
    atWarAny: function (tag) { return (this._wn[tag] || 0) > 0; },
    enemies: function (tag) {
      var c = this._we[tag]; if (c) return c.slice();
      var out = [], m = this._wi[tag]; if (m) for (var i = 0; i < this.tags.length; i++) if (m[this.tags[i]] === 1) out.push(this.tags[i]);
      this._we[tag] = out; return out.slice();
    },
    allies: function (tag) { return Object.keys(this.ally[tag] || {}); },
    // a declares war on b; each side's allies join in
    declare: function (a, b, quiet) {
      if (a === b || this.allied(a, b) || this.gone[a] || this.gone[b]) return false;
      if (!quiet && this.truce[this.key(a, b)] > this.day) return false;
      var self = this, A = quiet === 'blocs' ? [a].concat(this.allies(a)) : [a], Bs = [b].concat(this.allies(b)), any = false;
      A.forEach(function (x) { Bs.forEach(function (y) {
        if (x === y || self.allied(x, y) || self.gone[x] || self.gone[y]) return;
        var k = self.key(x, y); if (!self.wars[k]) { self.wars[k] = { a: x, b: y, start: self.day }; any = true; }
      }); });
      if (any && !quiet) this.event('war', this.nations[a].short + ' declares war on ' + this.nations[b].short, { a: a, b: b });
      return any;
    },
    // share of b's people living under a's occupation, minus the reverse (in percent)
    warScore: function (a, b) {
      var pa = 0, pb = 0, oa = 0, ob = 0, P = this.econ.P;
      for (var i = 0; i < this.provs.length; i++) {
        var p = this.provs[i];
        if (p.owner === b) { pb += P[i].pop; if (p.ctrl === a) ob += P[i].pop; }
        else if (p.owner === a) { pa += P[i].pop; if (p.ctrl === b) oa += P[i].pop; }
      }
      return 100 * ((pb ? ob / pb : 0) - (pa ? oa / pa : 0));
    },
    // Would b accept peace from a? keep = each side keeps what it occupies.
    wouldAccept: function (a, b, keep) {
      var w = this.wars[this.key(a, b)]; if (!w) return false;
      var score = this.warScore(a, b), months = (this.day - w.start) / 30;
      var pos = this.warPosition ? this.warPosition(a, b) : score;
      if (keep) return score >= 8 || pos >= 20 || (score >= 0 && this.gainFor(b, a) >= this.gainFor(a, b) && months >= 6);
      return (score >= -2 && pos >= -10 && months >= 4) || (pos >= 15 && months >= 2);
    },
    gainFor: function (x, y) { var n = 0; for (var i = 0; i < this.provs.length; i++) if (this.provs[i].owner === y && this.provs[i].ctrl === x) n++; return n; },
    peace: function (a, b, keep) {
      var k = this.key(a, b); if (!this.wars[k]) return false;
      delete this.wars[k]; this.truce[k] = this.day + 720; this.lastPeace[a] = this.lastPeace[b] = this.day;
      for (var i = 0; i < this.provs.length; i++) {
        var p = this.provs[i];
        if ((p.owner === a && p.ctrl === b) || (p.owner === b && p.ctrl === a)) { if (keep) p.owner = p.ctrl; else p.ctrl = p.owner; }
      }
      this.afterPeace();
      this.event('peace', this.nations[a].short + ' and ' + this.nations[b].short + ' make peace', { a: a, b: b });
      return true;
    },
    afterPeace: function () {
      var self = this;
      this.indexStacks();
      this.battles.slice().forEach(function (bt) { if (!self.defenders(bt).length || !self.attackers(bt).length) self.endBattle(bt, null); });
      this.ctrlVersion++; this.fixCapitals(); this.expel(); this.indexStacks(); this.refreshSupply();
    },
    fixCapitals: function () {
      var self = this, P = this.econ.P;
      this.tags.forEach(function (t) {
        var n = self.nations[t], cap = n.capital ? self.byName[n.capital] : null, own = self.ownP ? self.ownP(t) : self.provs.filter(function (p) { return p.owner === t; });
        if (!own.length) { if (!self.gone[t]) { self.gone[t] = true; self.provs.forEach(function (p) { if (p.ctrl === t) p.ctrl = p.owner; }); self.divs = self.divs.filter(function (d) { return d.tag !== t; }); self.recruits = self.recruits.filter(function (r) { return r.tag !== t; }); for (var k in self.wars) if (self.wars[k].a === t || self.wars[k].b === t) delete self.wars[k]; self.event('gone', n.name + ' is no more', { a: t }); } return; }
        if (cap && cap.owner === t) return;
        if (n.capital === null && !n.lostCapital) return; // capital was never on the map
        own.sort(function (x, y) { return P[y.id].pop - P[x.id].pop; }); n.capital = own[0].name; n.lostCapital = true;
      });
    },
    // divisions standing where they no longer have any right to be are sent home
    expel: function () {
      var self = this;
      this.divs.forEach(function (d) {
        var p = self.provs[d.prov]; if (self.friendly(d.tag, p) || self.hostile(d.tag, p)) { self.trimPath(d); return; }
        var home = self.nearest(d.prov, function (q) { return q.ctrl === d.tag; }) || self.nearest(d.prov, function (q) { return self.friendly(d.tag, q); });
        if (home !== null) { d.prov = home; d.path = []; d.prog = 0; d.battle = null; d.retreat = false; } else d.dead = true;
      });
      this.divs = this.divs.filter(function (d) { return !d.dead; });
    },
    trimPath: function (d) {
      for (var i = 0; i < d.path.length; i++) { var q = this.provs[d.path[i].to]; if (!this.friendly(d.tag, q) && !this.hostile(d.tag, q)) { d.path.length = i; if (i === 0) { d.prog = 0; d.battle = null; } break; } }
    },
    nearestWithin: function (from, max, test) {
      var dist = {}, q = [from], h = 0; dist[from] = 0;
      while (h < q.length) {
        var id = q[h++], p = this.provs[id]; if (id !== from && test(p)) return id;
        if (dist[id] >= max) continue;
        var nb = p.adj.concat(p.straits); for (var i = 0; i < nb.length; i++) if (dist[nb[i]] === undefined) { dist[nb[i]] = dist[id] + 1; q.push(nb[i]); }
      }
      return null;
    },
    nearest: function (from, test) {
      var seen = {}, q = [from], h = 0; seen[from] = 1;
      while (h < q.length) {
        var id = q[h++], p = this.provs[id]; if (id !== from && test(p)) return id;
        var nb = p.adj.concat(p.straits); for (var i = 0; i < nb.length; i++) if (!seen[nb[i]]) { seen[nb[i]] = 1; q.push(nb[i]); }
      }
      // islands: fall back to any matching province
      for (var j = 0; j < this.provs.length; j++) if (test(this.provs[j])) return j;
      return null;
    },

    event: function (type, text, data) {
      var e = { day: this.day, type: type, text: text, data: data || {} };
      this.log.push(e); if (this.log.length > 60) this.log.shift();
      if (this.onEvent) this.onEvent(e);
    },

    // ---------- armies ----------
    placeArmy: function (tag, counts) {
      var self = this, P = this.econ.P, own = this.provs.filter(function (p) { return p.owner === tag; }); if (!own.length) return;
      var cap = this.nations[tag].capital ? this.byName[this.nations[tag].capital] : null, foes = this.enemies(tag), w = {}, total = 0;
      // a European power keeps its field army at home; its lands overseas have garrisons of their own
      if (cap && !cap.world) { var home = own.filter(function (p) { return !p.world; }); if (home.length) own = home; }
      // distance (in provinces) from the nearest enemy, flooding out from enemy land
      var dist = {}, q = [], h = 0;
      if (foes.length) this.provs.forEach(function (p) { if (self.atWar(tag, p.owner)) { dist[p.id] = 0; q.push(p.id); } });
      while (h < q.length) { var id = q[h++], nb = this.provs[id].adj.concat(this.provs[id].straits); for (var i = 0; i < nb.length; i++) if (dist[nb[i]] === undefined) { dist[nb[i]] = dist[id] + 1; q.push(nb[i]); } }
      own.forEach(function (p) {
        var v;
        if (foes.length && dist[p.id] !== undefined && dist[p.id] <= 5) v = 6 / (dist[p.id] * dist[p.id]);
        else { var border = false; for (var i = 0; i < p.adj.length; i++) if (self.provs[p.adj[i]].owner !== tag) border = true; v = border ? 1 : 0.15; }
        v *= 0.5 + Math.min(1.5, P[p.id].pop / 300000);
        if (cap && p.id === cap.id) v += 3;
        w[p.id] = v; total += v;
      });
      var n = counts[0] + counts[1] + counts[2], list = [];
      ORDER.forEach(function (ty, i) { for (var k = 0; k < counts[i]; k++) list.push(ty); });
      // deal divisions out in proportion to the weights, largest claim first, mixed arms in each stack
      var have = {};
      var mixed = [], idx = [0, 0, 0];
      for (var m = 0; m < n; m++) { var best = -1, bv = -1; for (var t = 0; t < 3; t++) { var left = counts[t] - idx[t], v2 = left / (counts[t] || 1); if (left > 0 && v2 > bv) { bv = v2; best = t; } } idx[best]++; mixed.push(ORDER[best]); }
      mixed.forEach(function (ty) {
        var bestP = null, bestV = -1;
        own.forEach(function (p) { var claim = w[p.id] / total * n - (have[p.id] || 0); if (claim > bestV) { bestV = claim; bestP = p; } });
        have[bestP.id] = (have[bestP.id] || 0) + 1;
        self.spawn(tag, ty, bestP.id, 1);
      });
    },
    spawn: function (tag, type, prov, str) {
      var d = { id: this.nextId++, tag: tag, type: type, prov: prov, str: str, org: 1, path: [], prog: 0, battle: null, entr: 0, retreat: false };
      this.divs.push(d); return d;
    },
    indexStacks: function () {
      var at = {}; for (var i = 0; i < this.divs.length; i++) { var d = this.divs[i]; (at[d.prov] = at[d.prov] || []).push(d); }
      this.at = at;
    },
    divsOf: function (tag) { return this.divs.filter(function (d) { return d.tag === tag; }); },
    div: function (id) { for (var i = 0; i < this.divs.length; i++) if (this.divs[i].id === id) return this.divs[i]; return null; },
    refreshUpkeep: function () {
      var self = this; this.tags.forEach(function (t) { self.M[t].upkeep = 0; self.M[t].men = 0; self.M[t].count = 0; });
      this.divs.forEach(function (d) { var m = self.M[d.tag]; m.upkeep += TYPES[d.type].upkeep * (0.5 + 0.5 * d.str); m.men += TYPES[d.type].men * d.str; m.count++; });
      this.tags.forEach(function (t) { self.econ.N[t].armyCost = self.M[t].upkeep; });
    },

    // ---------- recruiting ----------
    recruitBlock: function (tag, type, prov) {
      var T = TYPES[type], n = this.econ.N[tag], m = this.M[tag], p = this.provs[prov];
      if (p.owner !== tag || p.ctrl !== tag) return 'Not yours to recruit in';
      if (m.manpower < T.men) return 'Too few recruits';
      for (var g in T.eq) if (n.stockpile[g] < T.eq[g]) return 'Arsenal lacks ' + g;
      if (n.treasury < T.money * (n.pi || 1) && tag === this.player) return 'Not enough money';
      return null;
    },
    recruit: function (tag, type, prov) {
      var why = this.recruitBlock(tag, type, prov); if (why) return why;
      var T = TYPES[type], n = this.econ.N[tag], cost = T.money * (n.pi || 1);
      this.M[tag].manpower -= T.men; for (var g in T.eq) n.stockpile[g] -= T.eq[g];
      n.treasury -= cost; n.spentBuild += cost;
      this.recruits.push({ tag: tag, type: type, prov: prov, left: T.days, total: T.days });
      return null;
    },

    // ---------- marching ----------
    legDays: function (d, from, leg) {
      var a = this.provs[from], b = this.provs[leg.to], km = this.distKm(a, b);
      if (leg.sea) return Math.ceil(6 + km / 110);
      var roads = (this.econ.P[leg.to].b.roads || 0), days = km / TYPES[d.type].speed * T_MOVE[b.terrain] * (1 - 0.1 * roads);
      if (a.straits.indexOf(leg.to) >= 0) days += 3;
      return Math.max(1, Math.ceil(days));
    },
    canEnter: function (tag, p) { return this.friendly(tag, p) || this.hostile(tag, p); },
    // cheapest route in days; peaceful = stay on friendly ground
    findPath: function (d, target, peaceful) {
      if (d.prov === target) return [];
      var self = this, n = this.provs.length, cost = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n), open = [d.prov];
      cost[d.prov] = 0;
      while (open.length) {
        var bi = 0; for (var i = 1; i < open.length; i++) if (cost[open[i]] < cost[open[bi]]) bi = i;
        var cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
        if (done[cur]) continue; done[cur] = 1; if (cur === target) break;
        var p = this.provs[cur], nb = p.adj.concat(p.straits);
        for (var j = 0; j < nb.length; j++) {
          var id = nb[j], q = this.provs[id]; if (done[id]) continue;
          if (peaceful ? !self.friendly(d.tag, q) : !self.canEnter(d.tag, q)) continue;
          var c = cost[cur] + self.legDays(d, cur, { to: id }) + (self.hostile(d.tag, q) ? 4 : 0);
          if (c < cost[id]) { cost[id] = c; prev[id] = cur; open.push(id); }
        }
      }
      if (prev[target] < 0) return null;
      var path = []; for (var at = target; at !== d.prov; at = prev[at]) path.unshift({ to: at });
      return path;
    },
    // Player and AI orders. Returns null when accepted, otherwise why not.
    orderMove: function (d, target, peaceful) {
      if (d.retreat) return 'Retreating';
      if (d.prov === target) { this.halt(d); return null; }
      var path = this.findPath(d, target, peaceful); if (!path) return 'No route by land';
      this.leaveBattle(d); d.path = path; d.prog = 0; d.entr = 0;
      return null;
    },
    orderSea: function (d, target) {
      var from = this.provs[d.prov], to = this.provs[target];
      if (d.retreat) return 'Retreating';
      if (!from.coastal || !(this.econ.P[d.prov].b.port > 0) || !this.friendly(d.tag, from)) return 'Needs a friendly port to embark';
      if (!to.coastal) return 'Destination has no coast';
      if (!this.canEnter(d.tag, to)) return 'Not at war with its holder';
      if (this.distKm(from, to) > this.SEA_RANGE) return 'Too far to ship';
      this.leaveBattle(d); d.path = [{ to: target, sea: true }]; d.prog = 0; d.entr = 0;
      return null;
    },
    halt: function (d) { if (d.retreat) return; this.leaveBattle(d); d.path = []; d.prog = 0; },
    leaveBattle: function (d) {
      if (d.battle === null) return;
      var bt = this.battleById(d.battle); d.battle = null;
      if (bt) { var i = bt.atk.indexOf(d.id); if (i >= 0) bt.atk.splice(i, 1); }
    },
    setCtrl: function (p, tag) {
      // an ally marching into a friend's occupied province hands it back
      var to = this.allied(tag, p.owner) ? p.owner : tag;
      if (p.ctrl === to) return; p.ctrl = to; this.dirty = true; this.ctrlVersion++; if (this.changed) this.changed.push(p.id);
      var capOf = null; for (var i = 0; i < this.tags.length; i++) if (this.nations[this.tags[i]].capital === p.name && p.owner === this.tags[i]) capOf = this.tags[i];
      if (capOf && to !== p.owner) this.event('capital', this.nations[to].short + ' takes ' + p.name + ', capital of ' + this.nations[capOf].short, { prov: p.id, a: to, b: capOf });
    },
    foesIn: function (tag, prov) {
      var s = this.at[prov], out = []; if (!s) return out;
      for (var i = 0; i < s.length; i++) if (this.atWar(tag, s[i].tag) && !s[i].retreat) out.push(s[i]);
      return out;
    },

    // ---------- battles ----------
    battleById: function (id) { for (var i = 0; i < this.battles.length; i++) if (this.battles[i].id === id) return this.battles[i]; return null; },
    battleAt: function (prov) { for (var i = 0; i < this.battles.length; i++) if (this.battles[i].prov === prov) return this.battles[i]; return null; },
    attackers: function (bt) { var self = this, out = []; bt.atk.forEach(function (id) { var d = self.div(id); if (d && d.battle === bt.id && d.path.length && d.path[0].to === bt.prov) out.push(d); }); return out; },
    defenders: function (bt) { return this.foesIn(bt.tag, bt.prov); },
    joinBattle: function (d, prov) {
      var bt = this.battleAt(prov);
      if (bt && !this.allied(bt.tag, d.tag)) return; // someone else's fight: wait
      if (!bt) { bt = { id: this.nextId++, prov: prov, tag: d.tag, atk: [], days: 0, r: 1 }; this.battles.push(bt); }
      if (bt.atk.indexOf(d.id) < 0) bt.atk.push(d.id); d.battle = bt.id;
      // defenders drop whatever else they were doing
      var self = this; this.defenders(bt).forEach(function (x) { if (x.battle !== null) self.leaveBattle(x); if (x.path.length) { x.path = []; x.prog = 0; } });
    },
    power: function (d, stat) { return TYPES[d.type][stat] * d.str * (0.4 + 0.6 * d.org) * (d.nosupply ? 0.6 : 1) * (QUALITY[d.tag] || 1); },
    fight: function (bt) {
      var self = this, p = this.provs[bt.prov], A = this.attackers(bt).filter(function (d) { return d.org > 0.03; }), Df = this.defenders(bt);
      if (!A.length) return this.endBattle(bt, false);
      if (!Df.length) return this.endBattle(bt, true);
      bt.days++;
      var width = T_WIDTH[p.terrain], byOrg = function (x, y) { return y.org - x.org; };
      var a = A.slice().sort(byOrg).slice(0, width), dd = Df.slice().sort(byOrg).slice(0, width), pa = 0, pd = 0, origins = {}, sea = false, strait = false;
      a.forEach(function (d) {
        var v = self.power(d, 'atk'); if (d.type === 'cav' && p.terrain === 'p') v *= 1.25;
        origins[d.prov] = 1; if (d.path[0].sea) sea = true; else if (self.provs[d.prov].straits.indexOf(bt.prov) >= 0) strait = true;
        pa += v;
      });
      dd.forEach(function (d) { pd += self.power(d, 'def') * (1 + d.entr); });
      pa *= Math.min(1.3, 1 + 0.1 * (Object.keys(origins).length - 1)) * (sea ? 0.5 : strait ? 0.65 : 1) * (0.85 + 0.3 * rnd(this));
      pd *= T_DEF[p.terrain];
      var r = clamp(pa / Math.max(pd, 0.01), 0.2, 5); bt.r = r; bt.na = A.length; bt.nd = Df.length;
      var hitD = 0.045 * Math.pow(r, 0.8) * Math.min(1.6, Math.max(1, a.length / dd.length)), hitA = 0.045 * Math.pow(1 / r, 0.8) * Math.min(1.6, Math.max(1, dd.length / a.length));
      dd.forEach(function (d) { d.org = Math.max(0, d.org - hitD); d.str = Math.max(0, d.str - hitD * 0.15); });
      a.forEach(function (d) { d.org = Math.max(0, d.org - hitA); d.str = Math.max(0, d.str - hitA * 0.15); });
      Df.forEach(function (d) { if (d.org <= 0.03 || d.str <= 0.05) self.rout(d); });
      A.forEach(function (d) { if (d.org <= 0.03 || d.str <= 0.05) { if (d.str <= 0.05) d.dead = true; self.leaveBattle(d); d.path = []; d.prog = 0; } });
      if (!this.defenders(bt).length) return this.endBattle(bt, true);
      if (!this.attackers(bt).length) return this.endBattle(bt, false);
    },
    rout: function (d) {
      if (d.str <= 0.05) { d.dead = true; return; }
      var self = this, p = this.provs[d.prov], best = null, bv = -1e9;
      p.adj.concat(p.straits).forEach(function (id) {
        var q = self.provs[id]; if (!self.friendly(d.tag, q) || self.foesIn(d.tag, id).length || self.battleAt(id)) return;
        var v = (q.ctrl === d.tag ? 2 : 0) + (q.owner === d.tag ? 1 : 0) - self.threatTo(d.tag, id) * 0.05 + rnd(self) * 0.5;
        if (v > bv) { bv = v; best = id; }
      });
      if (best === null && d.nosupply) { d.dead = true; this.event('lost', 'An encircled ' + this.nations[d.tag].short + ' division is destroyed at ' + p.name, { prov: p.id, a: d.tag }); return; }
      if (best === null) {
        var out = this.nearestWithin(d.prov, 3, function (q) { return self.friendly(d.tag, q) && !self.foesIn(d.tag, q.id).length; });
        if (out !== null) { d.prov = out; d.path = []; d.prog = 0; d.entr = 0; d.battle = null; d.str *= 0.6; d.org = 0.05; return; } // cut its way out, at a cost
      }
      if (best === null) { d.dead = true; this.event('lost', 'A ' + this.nations[d.tag].short + ' division surrenders at ' + p.name, { prov: p.id, a: d.tag }); return; }
      d.retreat = true; d.path = [{ to: best }]; d.prog = 0; d.entr = 0; d.battle = null;
    },
    endBattle: function (bt, attackerWon) {
      var self = this, p = this.provs[bt.prov];
      bt.atk.forEach(function (id) { var d = self.div(id); if (d && d.battle === bt.id) { d.battle = null; if (attackerWon === false) { d.path = []; d.prog = 0; } } });
      var i = this.battles.indexOf(bt); if (i >= 0) this.battles.splice(i, 1);
      if (attackerWon !== null && bt.days >= 2) this.event('battle', this.nations[attackerWon ? bt.tag : p.ctrl].short + ' wins at ' + p.name, { prov: p.id, a: bt.tag, b: p.ctrl, won: attackerWon });
    },
    threatTo: function (tag, prov) {
      var c = this._thr, ck; if (c) { ck = tag + prov; if (c[ck] !== undefined) return c[ck]; }
      var p = this.provs[prov], nb = p.nb || (p.nb = p.adj.concat(p.straits)), t = 0;
      for (var i = 0; i < nb.length; i++) { var f = this.foesIn(tag, nb[i]); for (var j = 0; j < f.length; j++) t += this.power(f[j], 'atk'); }
      if (c) c[ck] = t;
      return t;
    },

    // ---------- supply ----------
    supplyLimit: function (prov) {
      var p = this.provs[prov], e = this.econ.P[prov];
      return Math.max(2, 3 + Math.floor(e.pop / 200000) + 2 * (e.b.roads || 0) + (e.b.port ? 2 : 0) - (p.terrain === 'm' || p.terrain === 'd' ? 1 : 0));
    },
    // A division is supplied when friendly-held ground links it to home soil (or to a friendly port).
    refreshSupply: function () {
      var self = this, tags = {}, sets = {};
      this.divs.forEach(function (d) { tags[d.tag] = 1; });
      Object.keys(tags).forEach(function (t) {
        // distance in provinces from home soil (or a friendly port), over friendly-held ground; -1 = cut off
        var dist = new Int16Array(self.provs.length).fill(-1), q = [], h = 0;
        self.provs.forEach(function (p) {
          if (!self.friendly(t, p)) return;
          if (self.allied(t, p.owner)) { dist[p.id] = 0; q.push(p.id); }
        });
        self.provs.forEach(function (p) { if (dist[p.id] < 0 && self.friendly(t, p) && p.coastal && self.econ.P[p.id].b.port) { dist[p.id] = 2; q.push(p.id); } });
        while (h < q.length) { var p = self.provs[q[h++]], nb = p.adj.concat(p.straits); for (var i = 0; i < nb.length; i++) { var id = nb[i]; if (dist[id] < 0 && self.friendly(t, self.provs[id])) { dist[id] = dist[p.id] + 1; q.push(id); } } }
        sets[t] = dist;
      });
      this.supplyDist = sets;
      this.divs.forEach(function (d) {
        var v = sets[d.tag][d.prov], sea = d.path.length && d.path[0].sea;
        d.nosupply = v < 0 && !sea; d.far = v > 6 ? v - 6 : 0; // beyond six provinces from home the wagons cannot keep up
      });
    },
    // Is it winter where this province lies? (day 0 is 1 September 1805)
    winterAt: function (p) { var doy = (243 + this.day) % 365; return (doy > 320 || doy < 75) && p.lat > 50; },

    // ---------- one day ----------
    step: function () {
      var self = this, i, d; this.day++; this.dirty = false; this.changed = [];   // provinces that change hands today, so the map repaints only if one is in view
      this.indexStacks();

      // 1. recruits
      this.recruits = this.recruits.filter(function (r) {
        if (--r.left > 0) return true;
        var p = self.provs[r.prov], at = p.ctrl === r.tag ? r.prov : self.nearest(r.prov, function (q) { return q.ctrl === r.tag; });
        var tp = self.tplById(r.tpl) || self.tplOfCls(r.tag, r.type || 'inf');
        if (at !== null && !self.gone[r.tag] && tp) { var nd = self.spawn(r.tag, tp.id, at, 1); nd.org = 0.5; nd.xp = 0.1 + self.mod(r.tag, 'trainxp'); if (r.tag === self.player) self.event('ready', tp.name + ' ready at ' + self.provs[at].name, { prov: at, a: r.tag }); }
        return false;
      });

      // 2. marching
      for (i = 0; i < this.divs.length; i++) {
        d = this.divs[i]; if (!d.path.length) continue;
        var leg = d.path[0], dest = this.provs[leg.to];
        if (!d.retreat && !this.canEnter(d.tag, dest)) { d.path = []; d.prog = 0; this.leaveBattle(d); continue; }
        var need = this.legDays(d, d.prov, leg), foes = d.retreat ? [] : this.foesIn(d.tag, leg.to);
        if (foes.length && (!leg.sea || d.prog >= need - 1)) { if (d.battle === null) this.joinBattle(d, leg.to); continue; }
        if (d.battle !== null) this.leaveBattle(d);
        d.prog += d.retreat ? 1.5 : 1;
        if (d.prog >= need) {
          d.prov = leg.to; d.path.shift(); d.prog = 0; d.entr = 0;
          if (!d.path.length) d.retreat = false;
          if (this.hostile(d.tag, dest)) this.setCtrl(dest, d.tag);
          else if (dest.ctrl !== dest.owner && this.allied(d.tag, dest.owner) && !this.allied(d.tag, dest.ctrl)) this.setCtrl(dest, d.tag);
        }
      }
      this.indexStacks();

      // 3. battles
      this.battles.slice().forEach(function (bt) { self.fight(bt); });
      if (this.divs.some(function (x) { return x.dead; })) { this.divs.forEach(function (x) { if (x.dead) self.leaveBattle(x); }); this.divs = this.divs.filter(function (x) { return !x.dead; }); }
      this.indexStacks();

      // 4. rest, replacements, attrition
      if (this.dirty) this._supDirty = true;
      if (this.day % 3 === 0 || (this._supDirty && this.day % 2 === 0)) { this._supDirty = false; this.refreshSupply(); }
      var defending = {}; this.battles.forEach(function (bt) { self.defenders(bt).forEach(function (x) { defending[x.id] = 1; }); });
      for (i = 0; i < this.divs.length; i++) {
        d = this.divs[i]; var T = this.stats(d), cm = this.cmdOf(d), n = this.econ.N[d.tag], m = this.M[d.tag], fighting = d.battle !== null || defending[d.id];
        var hunger = (T.has.train ? 0.75 : 1) * Math.max(0.3, 1 - cm.hunger) * (this.attrMod ? this.attrMod(d) : 1);
        if (d.nosupply) { d.org = Math.max(0.1, d.org - 0.05); d.str -= 0.006 * hunger; }
        else if (!fighting) {
          d.org = Math.min(1, d.org + (d.path.length ? 0.015 : 0.04) * T.regen * (1 + cm.regen + cm.org) * (0.3 + 0.7 * (d.sr === undefined ? 1 : d.sr)));
          if (!d.path.length) d.entr = Math.min(T.entrMax, d.entr + 0.02 * (1 + cm.entr));
          if (d.str < 1) {
            var add = Math.min(0.015 * (d.sr === undefined ? 1 : d.sr), 1 - d.str), can = Math.min(1, m.manpower / (add * T.men));
            for (var g in T.eq) can = Math.min(can, n.stockpile[g] / (add * T.eq[g] * 0.6 + 1e-9));
            add *= Math.max(0, can);
            if (add > 0) {
              d.xp = ((d.xp || 0) * d.str + 0.1 * add * (T.has.surg ? 0.5 : 1) + (d.xp || 0) * add * (T.has.surg ? 0.5 : 0)) / (d.str + add);
              d.str += add; m.manpower -= add * T.men; for (g in T.eq) n.stockpile[g] = Math.max(0, n.stockpile[g] - add * T.eq[g] * 0.6);
            }
          }
          // planning: a division waiting on a front line studies the ground ahead
          var planning = !d.path.length && (d.tag !== this.player || (this.armyOf && this.armyOf(d.id) && this.armyOf(d.id).front));
          if (planning) {
            var nbs = this.provs[d.prov].adj, onFront = false; for (var k = 0; k < nbs.length; k++) if (this.hostile(d.tag, this.provs[nbs[k]])) { onFront = true; break; }
            if (onFront) d.plan = Math.min(0.3 + cm.planMax + this.mod(d.tag, 'planmax'), (d.plan || 0) + 0.02 * (1 + cm.plan + this.mod(d.tag, 'plan')));
            else d.plan = Math.max(0, (d.plan || 0) - 0.01);
          } else if (d.path.length) d.plan = Math.max(0, (d.plan || 0) - 0.005);
        }
        var here = this.provs[d.prov];
        if (d.sr !== undefined && d.sr < 1 && !d.nosupply) d.str -= 0.004 * (1 - d.sr) * hunger;      // more mouths than wagons
        var wa = this.weatherAttr ? this.weatherAttr(d, here) : 0;
        if (wa) d.str -= wa * hunger * (this.weatherAt(here) === this.WX.snow ? Math.max(0.25, 1 - cm.winter) : 1);
        if (d.str <= 0.05) d.dead = true;
      }
      if (this.divs.some(function (x) { return x.dead; })) { this.divs.forEach(function (x) { if (x.dead) self.leaveBattle(x); }); this.divs = this.divs.filter(function (x) { return !x.dead; }); this.indexStacks(); }

      // 5. generals
      this._thr = {};   // threats are fixed while the generals think
      for (i = 0; i < this.tags.length; i++) { var t = this.tags[i]; if (t !== this.player && !this.gone[t] && (this.day + i) % (this.atWarAny(t) ? 3 : 9) === 0) { if ((this.aiLevel[t] || this.skill) >= 2 && this.aiOrders2) this.aiOrders2(t); else this.aiOrders(t); } }
      this._thr = null;

      // the player's armies carry out their standing orders
      if (this.player && this.runArmy && this.day % 2 === 0) for (i = 0; i < this.armies.length; i++) if (this.armies[i].tag === this.player) this.runArmy(this.armies[i]);

      // 6. surrender
      if (this.day % 5 === 0) this.checkSurrender();
      if (this.day % 30 === 0) this.refreshUpkeep();
    },

    // once a month, before the economy's step
    month: function () {
      var self = this;
      this.tags.forEach(function (t) {
        var n = self.econ.N[t], m = self.M[t]; if (!n.pop) return;
        m.manpower = Math.min(n.pop * 0.03 * (1 + self.mod(t, 'mpcap')), m.manpower + n.pop * 0.00035 * (1 + self.mod(t, 'mp')));
        m.xp = Math.min(999, (m.xp || 0) + 0.5 + (self.mod(t, 'xpgain') || 0));
        if (t !== self.player && self.aiTemplates) self.aiTemplates(t);
        n.atWar = self.enemies(t).length > 0;
        if (t !== self.player && !self.gone[t]) { if ((self.aiLevel[t] || self.skill) >= 2 && self.aiRecruit2) self.aiRecruit2(t); else self.aiRecruit(t); }
      });
      this.refreshUpkeep();
      if (this.skill >= 2 && !this.noDiplomacy && this.diplomacy) this.diplomacy();
      // wars that have gone nowhere for years peter out
      for (var k in this.wars) {
        var w = this.wars[k];
        if (this.day - w.start > 1500 && w.a !== this.player && w.b !== this.player && Math.abs(this.warScore(w.a, w.b)) < 3) this.peace(w.a, w.b, false);
      }
    },

    // A nation gives in when its capital has been in enemy hands for three months and half its people are occupied,
    // or when nearly everything is lost. Small allies of a bigger power hold out for as long as their patron fights on.
    checkSurrender: function () {
      var self = this, P = this.econ.P; this.capLost = this.capLost || {};
      this.tags.forEach(function (t) {
        if (self.gone[t] || !self.enemies(t).length) { delete self.capLost[t]; return; }
        var total = 0, lost = 0, capLost = false, capName = self.nations[t].capital;
        self.eachOwned(t, function (p) { if (p.owner !== t) return; total += P[p.id].pop; if (self.atWar(t, p.ctrl)) { lost += P[p.id].pop; if (p.name === capName) capLost = true; } });
        if (!total) return;
        if (capLost) { if (self.capLost[t] === undefined) self.capLost[t] = self.day; } else delete self.capLost[t];
        var patron = false, foes = self.enemies(t);
        self.allies(t).forEach(function (a) { if (!self.gone[a] && self.econ.N[a].pop > 4 * total && foes.some(function (f) { return self.atWar(a, f); })) patron = true; });
        if (patron) return;
        var share = lost / total;
        if ((capLost && self.day - self.capLost[t] >= 90 && share >= 0.5) || share >= 0.8) self.surrender(t);
      });
    },
    // The beaten nation loses what its enemies hold and gets peace with everyone; small allies who were
    // sheltering behind it make peace on the same terms.
    surrender: function (t) {
      var self = this, taken = {}, foes = this.enemies(t), total = this.econ.N[t].pop;
      var followers = this.allies(t).filter(function (a) { return !self.gone[a] && self.econ.N[a].pop * 4 < total && foes.some(function (f) { return self.atWar(a, f); }); });
      [t].concat(followers).forEach(function (x) {
        // Each victor keeps at most a fifth of the loser's provinces (three at least): the occupied ones nearest its own land.
        var owned = self.provs.filter(function (p) { return p.owner === x; }), cap = Math.max(3, Math.round(owned.length * 0.2)), byWho = {};
        owned.forEach(function (p) { if (p.ctrl !== x && self.atWar(x, p.ctrl) && foes.indexOf(p.ctrl) >= 0) (byWho[p.ctrl] = byWho[p.ctrl] || []).push(p); });
        Object.keys(byWho).forEach(function (o) {
          var dist = {}, q = [], h = 0;
          self.provs.forEach(function (p) { if (p.owner === o) { dist[p.id] = 0; q.push(p.id); } });
          while (h < q.length) { var id = q[h++], nb = self.provs[id].adj.concat(self.provs[id].straits); for (var i = 0; i < nb.length; i++) if (dist[nb[i]] === undefined) { dist[nb[i]] = dist[id] + 1; q.push(nb[i]); } }
          byWho[o].sort(function (p1, p2) { return (dist[p1.id] === undefined ? 99 : dist[p1.id]) - (dist[p2.id] === undefined ? 99 : dist[p2.id]); })
            .slice(0, cap).forEach(function (p) { p.owner = o; if (x === t) taken[o] = (taken[o] || 0) + 1; });
        });
        self.provs.forEach(function (p) {
          if (p.owner === x && p.ctrl !== x) p.ctrl = x;                                   // the rest is handed back
          else if (p.ctrl === x && p.owner !== x && foes.indexOf(p.owner) >= 0) p.ctrl = p.owner;
        });
        for (var k in self.wars) { var w = self.wars[k]; if ((w.a === x && (x === t || foes.indexOf(w.b) >= 0)) || (w.b === x && (x === t || foes.indexOf(w.a) >= 0))) { delete self.wars[k]; self.truce[k] = self.day + 720; self.lastPeace[w.a] = self.lastPeace[w.b] = self.day; } }
      });
      delete this.capLost[t];
      var who = Object.keys(taken).sort(function (a, b) { return taken[b] - taken[a]; }).map(function (x) { return self.nations[x].short; });
      this.event('surrender', this.nations[t].short + ' surrenders' + (who.length ? ' to ' + who.join(' and ') : ''), { a: t });
      this.afterPeace();
    },

    // ---------- the other nations' generals ----------
    aiOrders: function (tag) {
      var self = this, foes = this.enemies(tag); if (!foes.length) return;
      var mine = this.divs.filter(function (d) { return d.tag === tag; }); if (!mine.length) return;
      var idle = mine.filter(function (d) { return !d.path.length && !d.retreat && d.battle === null; });
      var capName = this.nations[tag].capital, cap = capName ? this.byName[capName] : null, used = {};
      // one division stays in the capital when there are enough to spare
      if (cap && cap.ctrl === tag && mine.length >= 5) { var g = idle.filter(function (d) { return d.prov === cap.id; })[0]; if (g) used[g.id] = 1; else if (idle.length) { self.orderMove(idle[0], cap.id, true); used[idle[0].id] = 1; } }

      // attacks: look at every enemy-held province next to where my rested divisions stand
      var fresh = idle.filter(function (d) { return d.org >= 0.6 && !used[d.id] && !d.nosupply; }), near = {};
      fresh.forEach(function (d) { var p = self.provs[d.prov]; p.adj.concat(p.straits).forEach(function (id) { if (self.hostile(tag, self.provs[id])) (near[id] = near[id] || []).push(d); }); });
      var targets = Object.keys(near).map(Number).sort(function (a, b) { return self.econ.P[b].pop - self.econ.P[a].pop; });
      var bold = tag === 'FRA' ? 1.15 : 1.35;
      targets.forEach(function (id) {
        var e = self.provs[id], avail = near[id].filter(function (d) { return !used[d.id]; }); if (!avail.length) return;
        var def = 0; self.foesIn(tag, id).forEach(function (x) { def += self.power(x, 'def') * (1 + x.entr); }); def *= T_DEF[e.terrain];
        if (def === 0) { avail.slice(0, 1).forEach(function (d) { if (!self.orderMove(d, id)) used[d.id] = 1; }); return; }
        var existing = self.battleAt(id), att = 0; avail.forEach(function (d) { att += self.power(d, 'atk'); });
        if (existing && self.allied(existing.tag, tag)) self.attackers(existing).forEach(function (d) { att += self.power(d, 'atk'); });
        if (att / def < bold) return;
        // commit what is needed for good odds, keeping a guard behind in each province
        var sent = 0, power = 0, from = {};
        avail.sort(function (x, y) { return self.power(y, 'atk') - self.power(x, 'atk'); }).forEach(function (d) {
          if (power / def > 2.2 || sent >= T_WIDTH[e.terrain] + 2) return;
          var left = (self.at[d.prov] || []).filter(function (x) { return x.tag === tag && !used[x.id]; }).length - (from[d.prov] || 0);
          if (left <= 1 && self.threatTo(tag, d.prov) > 0 && avail.length > 2) return;
          if (!self.orderMove(d, id)) { used[d.id] = 1; sent++; power += self.power(d, 'atk'); from[d.prov] = (from[d.prov] || 0) + 1; }
        });
      });

      // redeploy: spread the rest along the front in proportion to what faces each part of it
      var rest = idle.filter(function (d) { return !used[d.id]; }); if (!rest.length) return;
      var fronts = [], want = {}, have = {}, sum = 0;
      this.provs.forEach(function (p) {
        if (!self.friendly(tag, p)) return;
        var touch = false, nb = p.adj.concat(p.straits); for (var i = 0; i < nb.length; i++) if (self.hostile(tag, self.provs[nb[i]])) { touch = true; break; }
        if (!touch) return;
        var w = 1 + self.threatTo(tag, p.id) / 12 + (p.owner === tag ? 0.5 : 0) + (cap && p.id === cap.id ? 2 : 0);
        fronts.push(p.id); want[p.id] = w; sum += w;
      });
      if (!fronts.length) return;
      mine.forEach(function (d) { var at = d.path.length ? d.path[d.path.length - 1].to : d.prov; have[at] = (have[at] || 0) + 1; });
      fronts.forEach(function (id) { want[id] = want[id] / sum * mine.length; });
      var distCache = {};
      function hops(from) {
        if (distCache[from]) return distCache[from];
        var dist = new Int16Array(self.provs.length).fill(-1), q = [from], h = 0; dist[from] = 0;
        while (h < q.length) { var p = self.provs[q[h++]], nb = p.adj.concat(p.straits); for (var i = 0; i < nb.length; i++) { var id = nb[i]; if (dist[id] < 0 && self.friendly(tag, self.provs[id])) { dist[id] = dist[p.id] + 1; q.push(id); } } }
        return (distCache[from] = dist);
      }
      rest.forEach(function (d) {
        var dist = hops(d.prov), best = -1, bv = -1e9, here = want[d.prov] !== undefined ? want[d.prov] - (have[d.prov] || 0) + 1 : -1e9;
        for (var i = 0; i < fronts.length; i++) { var f = fronts[i]; if (dist[f] < 0) continue; var v = (want[f] - (have[f] || 0)) - 0.12 * dist[f]; if (v > bv) { bv = v; best = f; } }
        if (best < 0 || best === d.prov || bv <= here + 0.6) return;
        if (!self.orderMove(d, best, true)) { have[d.prov] = (have[d.prov] || 1) - 1; have[best] = (have[best] || 0) + 1; }
      });
    },
    aiRecruit: function (tag) {
      var self = this, n = this.econ.N[tag], m = this.M[tag], war = this.enemies(tag).length > 0, last = n.last; if (!last || !n.pop) return;
      n.arms = war ? (n.treasury > 0 ? 1 : 0.6) : Math.min(n.arms, 0.6); // arsenals work flat out in wartime
      var queued = this.recruits.filter(function (r) { return r.tag === tag; }).length;
      var ceiling = (war ? 0.6 : 0.4) * (last.taxRev + last.tariffRev);
      if (m.upkeep > ceiling || queued >= (war ? 4 : 1) || n.treasury < (war ? -6 * last.taxRev : 2000)) return;
      var own = this.ownP(tag).filter(function (p) { return p.ctrl === tag; }); if (!own.length) return;
      own.sort(function (a, b) { return self.econ.P[b.id].pop - self.econ.P[a.id].pop; });
      var roll = rnd(this), type = roll < 0.68 ? 'inf' : roll < 0.88 ? 'cav' : 'art';
      for (var k = 0; k < (war ? 2 : 1); k++) if (this.recruit(tag, type, own[Math.floor(rnd(this) * Math.min(4, own.length))].id)) { if (type !== 'inf') this.recruit(tag, 'inf', own[0].id); break; }
    },

    // ---------- saving ----------
    serialize: function () {
      return { armies: this.armies, skill: this.skill, truce: this.truce, lastPeace: this.lastPeace, start0: this.start0, start0div: this.start0div, day: this.day, seed: this.seed, nextId: this.nextId, wars: this.wars, ally: this.ally, gone: this.gone, M: this.M, capLost: this.capLost || {}, recruits: this.recruits, battles: this.battles, log: this.log.slice(-30),
        ctrl: this.provs.map(function (p) { return p.ctrl; }), capitals: this.tags.map(function (t) { return this.nations[t].capital; }, this),
        units: this.saveUnits ? this.saveUnits() : null,
        divs: this.divs.map(function (d) { return [d.id, d.tag, d.type, d.prov, Math.round(d.str * 1000) / 1000, Math.round(d.org * 1000) / 1000, d.path, d.prog, d.battle, Math.round(d.entr * 100) / 100, d.retreat ? 1 : 0, d.manual ? 1 : 0]; }) };
    },
    restore: function (s) {
      var self = this; if (!s || !s.divs || !s.ctrl || s.ctrl.length !== this.provs.length) return false;
      this.day = s.day; this.seed = s.seed; this.nextId = s.nextId; this.wars = s.wars || {}; this.ally = s.ally || this.ally; this.gone = s.gone || {}; this.recruits = s.recruits || []; this.battles = s.battles || []; this.log = s.log || []; this.capLost = s.capLost || {}; this.truce = s.truce || {}; this.lastPeace = s.lastPeace || {}; this.offers = []; this.plans = {};
      this.armies = (s.armies || []).map(function (a) { return self.fixArmy ? self.fixArmy(a) : a; }); this.ctrlVersion = (this.ctrlVersion || 0) + 1; this._armyVer = (this._armyVer || 0) + 1;
      if (s.skill) this.skill = s.skill; if (s.start0) this.start0 = s.start0; if (s.start0div) this.start0div = s.start0div;
      this.tags.forEach(function (t, i) { if (s.M && s.M[t]) self.M[t] = s.M[t]; if (s.capitals && s.capitals[i] !== undefined) self.nations[t].capital = s.capitals[i]; });
      this.provs.forEach(function (p, i) { p.ctrl = self.nations[s.ctrl[i]] ? s.ctrl[i] : p.owner; });
      this.divs = s.divs.map(function (a) { return { id: a[0], tag: a[1], type: a[2], prov: a[3], str: a[4], org: a[5], path: a[6] || [], prog: a[7] || 0, battle: a[8] === undefined ? null : a[8], entr: a[9] || 0, retreat: !!a[10], manual: !!a[11] }; })
        .filter(function (d) { return self.nations[d.tag] && self.provs[d.prov]; });
      this.tags.forEach(function (t) { var m = self.M[t]; if (m.xp === undefined) m.xp = 10; if (m.lost === undefined) m.lost = 0; if (m.killed === undefined) m.killed = 0; });
      if (this.loadUnits) this.loadUnits(s.units);
      this.indexStacks(); this.refreshSupply(); this.refreshUpkeep();
      return true;
    }
  };

    // wars are kept in a plain object keyed "A|B" (saved as is); an index beside it answers atWar() without building keys
  (function () {
    var store = null;
    function add(W, k) { var i = k.indexOf('|'), a = k.slice(0, i), b = k.slice(i + 1); (W._wi[a] = W._wi[a] || {})[b] = 1; (W._wi[b] = W._wi[b] || {})[a] = 1; W._wn[a] = (W._wn[a] || 0) + 1; W._wn[b] = (W._wn[b] || 0) + 1; W._we = {}; }
    function del(W, k) { var i = k.indexOf('|'), a = k.slice(0, i), b = k.slice(i + 1); if (W._wi[a]) delete W._wi[a][b]; if (W._wi[b]) delete W._wi[b][a]; W._wn[a]--; W._wn[b]--; W._we = {}; }
    War._wi = {}; War._wn = {}; War._we = {};
    Object.defineProperty(War, 'wars', {
      get: function () { return store; },
      set: function (o) {
        var W = this, raw = {}; W._wi = {}; W._wn = {}; W._we = {};
        for (var k in o) { raw[k] = o[k]; add(W, k); }
        store = new Proxy(raw, {
          set: function (t, k, v) { if (!(k in t)) add(W, k); t[k] = v; return true; },
          deleteProperty: function (t, k) { if (k in t) { del(W, k); delete t[k]; } return true; }
        });
      }, enumerable: true, configurable: true
    });
  })();
root.War = War;
})(typeof window !== 'undefined' ? window : globalThis);
