// Military production, in the manner of HoI4: military factories (the "Arsenal" building) are assigned to
// production lines for muskets, cannon or uniforms. A line's efficiency starts low and grows month by month;
// changing what a line makes resets it. Lines draw iron, timber, coal and cloth from the nation's market, so a
// shortage of iron means a shortage of cannon. Also here: forts, equipment worn out in the field, and the
// hooks that connect all this to the economy.
(function (root) {
  'use strict';
  var War = root.War, Econ = root.Econ;

  // per military factory per month at full efficiency
  var PROD = {
    muskets: { name: 'Muskets', per: 14, input: { iron: 0.08, timber: 0.1 } },
    artillery: { name: 'Cannon', per: 1.4, input: { iron: 1.2, coal: 0.8 } },
    uniforms: { name: 'Uniforms', per: 30, input: { cloth: 0.12 } }
  };
  var EFF_START = 0.1, EFF_CAP = 0.6;
  // military factories in 1805, and fortresses
  var MIL = { USA: 7, FRA: 34, GBR: 26, AUS: 20, RUS: 22, PRU: 12, SPA: 9, OTT: 9, SWE: 4, DEN: 3, ITA: 4, NAP: 3, POR: 2, BAT: 3, SAX: 2, BAV: 2 };
  var FORTS = { 'Gibraltar': 4, 'Malta': 4, 'Mainz': 3, 'Strasbourg': 3, 'Metz': 3, 'Lille': 3, 'Antwerp': 2, 'Mantua': 3, 'Verona': 2, 'Alessandria': 3, 'Magdeburg': 3,
    'Danzig': 3, 'Kolberg': 2, 'Glogau': 2, 'Küstrin': 2, 'Glatz': 2, 'Olmütz': 2, 'Peterwardein': 2, 'Belgrade': 2, 'Izmail': 3, 'Bender': 2, 'Khotin': 2, 'Sevastopol': 2,
    'St. Petersburg': 2, 'Cádiz': 3, 'Badajoz': 2, 'Elvas': 2, 'Gerona': 2, 'Copenhagen': 2, 'Stralsund': 2, 'Helsingfors': 3, 'Gaeta': 2, 'Venice': 2, 'Toulon': 2,
    'Brest': 2, 'Cherbourg': 1, 'Portsmouth': 2, 'Plymouth': 1, 'Kronstadt': 2, 'Ulm': 1, 'Ingolstadt': 1, 'Prague': 1, 'Vienna': 1, 'Constantinople': 2, 'Vidin': 2, 'Silistra': 2, 'Rustchuk': 1, 'Kars': 2, 'Erivan': 1 };
  War.PROD = PROD;

  // ---------- economy buildings ----------
  Econ.BUILDINGS.arsenal = { name: 'Arsenal', kind: 'mil', max: 6, money: 3000, goods: { timber: 40, tools: 20 }, months: 10, blurb: 'One military factory per level: makes muskets, cannon or uniforms' };
  Econ.BUILDINGS.fort = { name: 'Fort', kind: 'fort', max: 4, money: 2500, goods: { timber: 30, tools: 15 }, months: 12, blurb: 'Each level: −15% attack for anyone storming the province' };
  Econ.mod = function (tag, key) {
    if (!War.R) return 0;
    var v = War.mod(tag, key); if (key === 'factory' || key === 'land') v += 0; return v;
  };
  var baseBlock = Econ.buildBlock;
  Econ.buildBlock = function (id, type) {
    var bd = this.BUILDINGS[type], p = this.provs[id], e = this.P[id];
    if (bd && (bd.kind === 'mil' || bd.kind === 'fort')) {
      if (p.ctrl && p.ctrl !== p.owner) return 'Occupied';
      var have = (e.b[type] || 0) + this.queued(id, type);
      if (bd.kind === 'fort') return have >= War.fortMax(p.owner) ? (War.fortMax(p.owner) < 4 ? 'Research forts to build higher' : 'Fully built') : null;
      if (e.pop < 15000) return 'Too few people';
      if (have >= bd.max) return 'Fully built';
      if (this.factoryLevels(id, true) >= this.maxFactory(id)) return 'No spare workers';
      return null;
    }
    return baseBlock.call(this, id, type);
  };
  var baseLevels = Econ.factoryLevels;
  Econ.factoryLevels = function (id, withQueue) {
    var n = baseLevels.call(this, id, withQueue) + (this.P[id].b.arsenal || 0);
    if (withQueue) n += this.queued(id, 'arsenal');
    return n;
  };

  // ---------- lines ----------
  War.initProduction = function () {
    var self = this, P = this.econ.P; this.lines = {};
    this.tags.forEach(function (t) {
      self.lines[t] = [];
      var n = self.econ.N[t]; if (n.stockpile.uniforms === undefined) n.stockpile.uniforms = 0;
      // arsenals go to the biggest towns
      var capP = self.nations[t].capital ? self.byName[self.nations[t].capital] : null, far = !!(capP && capP.world);   // beyond Europe arms are made by hand: far fewer arsenals for the same people
      var want = MIL[t] || (n.pop > 600000 ? Math.max(1, Math.round(n.pop / (far ? 2000000 : 600000))) : 0), own = self.provs.filter(function (p) { return p.owner === t; }).sort(function (a, b) { return (far ? 0 : (a.world ? 1 : 0) - (b.world ? 1 : 0)) || P[b.id].pop - P[a.id].pop; });
      for (var guard = 0; want > 0 && guard < 5; guard++) own.forEach(function (p) { if (want > 0 && P[p.id].pop >= 15000 && (P[p.id].b.arsenal || 0) < 6) { P[p.id].b.arsenal = (P[p.id].b.arsenal || 0) + 1; want--; } });
      var f = self.milFactories(t);
      if (f) { var m = Math.round(f * 0.5), a = Math.round(f * 0.25); self.lines[t].push({ eq: 'muskets', f: m, eff: 0.4 }, { eq: 'artillery', f: a, eff: 0.4 }, { eq: 'uniforms', f: f - m - a, eff: 0.4 }); }
      // enough uniforms for the men already under arms
      var need = 0; self.divs.forEach(function (d) { if (d.tag === t) need += self.stats(d).eq.uniforms || 0; });
      n.stockpile.uniforms += need * 0.3;
    });
    this.provs.forEach(function (p) { if (FORTS[p.name]) P[p.id].b.fort = FORTS[p.name]; });
  };
  War.milFactories = function (tag) { var n = 0, P = this.econ.P; for (var i = 0; i < this.provs.length; i++) { var p = this.provs[i]; if (p.owner === tag && p.ctrl === tag) n += P[i].b.arsenal || 0; } return n; };
  War.assignedFactories = function (tag) { var n = 0; (this.lines[tag] || []).forEach(function (l) { n += l.f; }); return n; };
  War.setLine = function (tag, i, f) {
    var L = this.lines[tag][i]; if (!L) return;
    var free = this.milFactories(tag) - this.assignedFactories(tag) + L.f;
    L.f = Math.max(0, Math.min(free, f));
  };
  War.addLine = function (tag, eq) { if (!PROD[eq]) return; this.lines[tag].push({ eq: eq, f: 0, eff: EFF_START }); };
  War.changeLine = function (tag, i, eq) { var L = this.lines[tag][i]; if (!L || !PROD[eq] || L.eq === eq) return; L.eq = eq; L.eff = EFF_START; };
  War.removeLine = function (tag, i) { this.lines[tag].splice(i, 1); };
  // what a line will make this month at full supply of its inputs
  War.lineOutput = function (tag, L) { return L.f * L.eff * PROD[L.eq].per * Math.max(0, 1 + this.mod(tag, 'prodout')); };
  // the uniforms local tailors sew for every nation from bought cloth, factories or not
  War.tailors = function (tag) { var n = this.econ.N[tag]; return 2 + (n.pop || 0) / 600000; };

  // economy hook: the lines' inputs become state demand on each national market
  Econ.onDemand = function (N) {
    if (!War.lines) return;
    War.tags.forEach(function (tag) {
      var n = N[tag]; if (!n || War.gone[tag]) return;
      // over-assignment after losing provinces: trim lines to the factories still held
      var have = War.milFactories(tag), used = War.assignedFactories(tag);
      if (used > have) War.lines[tag].slice().reverse().forEach(function (L) { var cut = Math.min(L.f, used - have); L.f -= cut; used -= cut; });
      n.plan = [];
      War.lines[tag].forEach(function (L) {
        var out = War.lineOutput(tag, L); n.plan.push(out);
        for (var g in PROD[L.eq].input) n.stateDem[g] += out * PROD[L.eq].input[g];
      });
      n.stateDem.cloth += War.tailors(tag) * PROD.uniforms.input.cloth;
    });
  };
  // economy hook: after the market clears, lines turn what they got into arms; returns what that cost
  Econ.onSettle = function (n) {
    if (!War.lines || !n.plan) return 0;
    var tag = n.tag, cost = 0, grow = 1 + War.mod(tag, 'prodgrow'), cap = EFF_CAP + War.mod(tag, 'prodeff');
    n.made = {};
    War.lines[tag].forEach(function (L, i) {
      var out = n.plan[i] || 0, fill = 1;
      for (var g in PROD[L.eq].input) fill = Math.min(fill, n.f[g]);
      var made = out * fill; n.stockpile[L.eq] = (n.stockpile[L.eq] || 0) + made; n.made[L.eq] = (n.made[L.eq] || 0) + made; L.fill = fill;
      for (g in PROD[L.eq].input) cost += made * PROD[L.eq].input[g] * n.price[g];
      if (L.f > 0) L.eff = Math.min(cap, L.eff + Math.max(0.01, 0.08 * (cap - L.eff)) * grow);
    });
    var tail = War.tailors(tag) * n.f.cloth; n.stockpile.uniforms = (n.stockpile.uniforms || 0) + tail; n.made.uniforms = (n.made.uniforms || 0) + tail;
    cost += tail * PROD.uniforms.input.cloth * n.price.cloth;
    return cost;
  };

  // computer nations put their factories where the shortages are
  War.aiProduction = function (tag) {
    var self = this, n = this.econ.N[tag], f = this.milFactories(tag); if (!f) { this.lines[tag] = []; return; }
    var need = { muskets: 0, artillery: 0, uniforms: 0 };
    this.divs.forEach(function (d) { if (d.tag !== tag) return; var eq = self.stats(d).eq; for (var g in need) need[g] += (eq[g] || 0); });
    var t = this.tplOfCls(tag, 'inf'), per = t ? this.tplStats(t).eq : {};
    var war = this.enemies(tag).length > 0, w = {}, sum = 0;
    for (var g in need) {
      var target = need[g] * (war ? 0.35 : 0.15) + (per[g] || 0) * (war ? 6 : 2), have = n.stockpile[g] || 0;
      var gap = Math.max(0.05, (target - have) / Math.max(1, target)), value = gap * (need[g] + (per[g] || 0)) / PROD[g].per;
      w[g] = value; sum += value;
    }
    var lines = this.lines[tag] = this.lines[tag] || [];
    ['muskets', 'artillery', 'uniforms'].forEach(function (g) { if (!lines.some(function (L) { return L.eq === g; })) lines.push({ eq: g, f: 0, eff: EFF_START }); });
    var left = f;
    lines.forEach(function (L, i) { var share = i === lines.length - 1 ? left : Math.min(left, Math.round(f * w[L.eq] / sum)); L.f = Math.max(0, share); left -= L.f; });
  };

  // ---------- forts ----------
  War.fortAt = function (prov) { return this.econ.P[prov].b.fort || 0; };

  // ---------- divisions wear out their arms in the field ----------
  War.wearAndTear = function () {
    var self = this;
    this.divs.forEach(function (d) {
      var s = self.stats(d), n = self.econ.N[d.tag], short = 0;
      for (var g in s.eq) {
        var want = s.eq[g] * d.str * 0.01, have = n.stockpile[g] || 0;
        if (have >= want) n.stockpile[g] = have - want; else { n.stockpile[g] = 0; short = Math.max(short, 1 - have / want); }
      }
      if (short > 0) d.str = Math.max(0.1, d.str - 0.01 * short);
    });
  };

  // ---------- hooks into the war engine ----------
  var baseInit = War.init;
  War.init = function (provinces, nations, econ, km) {
    baseInit.call(this, provinces, nations, econ, km);
    this.initResearch(); this.techVer++;
    this.initProduction(); this.refreshUpkeep();
  };
  var baseStep = War.step;
  War.step = function () { baseStep.call(this); this.researchDay(); };
  var baseMonth = War.month;
  War.month = function () {
    var self = this;
    baseMonth.call(this);
    this.wearAndTear();
    this.tags.forEach(function (t) {
      if (self.gone[t]) return;
      if (!self.enemies(t).length) self.lawsAtPeace(t);
      if (t === self.player) return;
      self.aiResearch(t); self.aiLaws(t); self.aiProduction(t);
    });
  };
  var baseSer = War.serialize;
  War.serialize = function () { var s = baseSer.call(this); s.rd = { R: this.R, laws: this.laws, lines: this.lines, techVer: this.techVer }; return s; };
  var baseRestore = War.restore;
  War.restore = function (s) {
    var ok = baseRestore.call(this, s); if (!ok) return ok;
    if (s.rd) { this.R = s.rd.R; this.laws = s.rd.laws; this.lines = s.rd.lines; this.techVer = (s.rd.techVer || 1) + 1; this._mods = {}; }
    else { this.initResearch(); this.initProduction(); }
    var self2 = this; this.tags.forEach(function (t) { if (self2.econ.N[t].stockpile.uniforms === undefined) self2.econ.N[t].stockpile.uniforms = 0; });
    this._sc = {}; this.refreshUpkeep();
    return ok;
  };
})(typeof window !== 'undefined' ? window : globalThis);
