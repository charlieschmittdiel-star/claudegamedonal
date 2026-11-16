// Still more Hearts of Iron: planned naval invasions that need preparation and naval supremacy, and command
// power, spent on teaching generals new traits and on army abilities.
(function (root) {
  'use strict';
  var War = root.War;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- naval invasions ----------
  // a landing on an enemy shore is planned for weeks, and only sails when your fleets hold the sea
  War.INVASION_DAYS = 20;
  War.invasionPrep = function (n) { return this.INVASION_DAYS + Math.min(20, 2 * Math.max(0, n - 1)); };
  var prevSea = War.orderSea;
  War.orderSea = function (d, target, now) {
    var to = this.provs[target];
    var human = this.isHuman ? this.isHuman(d.tag) : d.tag === this.player;
    if (now || !human || !to || !this.hostile(d.tag, to)) { if (d.inv && !now) d.inv = null; return prevSea.call(this, d, target); }
    // check the order would be valid before planning it
    var from = this.provs[d.prov];
    if (d.retreat) return 'Retreating';
    if (!from.coastal || !(this.econ.P[d.prov].b.port > 0) || !this.friendly(d.tag, from)) return 'Needs a friendly port to embark';
    if (!to.coastal) return 'Destination has no coast';
    if (!this.canEnter(d.tag, to)) return 'Not at war with its holder';
    if (this.distKm(from, to) > this.SEA_RANGE) return 'Too far to ship';
    this.halt(d);
    var n = this.divs.filter(function (x) { return x.inv && x.inv.to === target && x.tag === d.tag; }).length + 1;
    d.inv = { to: target, from: d.prov, ready: this.day + this.invasionPrep(n), start: this.day };
    return null;
  };
  War.invasionStatus = function (d) {
    if (!d.inv) return null; var z = this.provs[d.inv.to].sea, sup = z >= 0 && this.superiority ? this.superiority(d.tag, z) : 1;
    var left = d.inv.ready - this.day;
    return { left: Math.max(0, left), sup: sup, ok: sup >= 0.5, text: left > 0 ? 'Planning the landing: ' + left + ' days' : sup >= 0.5 ? 'Ready to sail' : 'Waiting for naval supremacy (' + Math.round(sup * 100) + '% of 50%)' };
  };
  War.launchInvasion = function (d, force) {
    if (!d.inv) return 'No invasion planned';
    if (this.day < d.inv.ready) return 'Still planning (' + (d.inv.ready - this.day) + ' days)';
    var st = this.invasionStatus(d); if (!st.ok && !force) return 'No naval supremacy';
    var to = d.inv.to; d.inv = null; d.plan = Math.max(d.plan || 0, 0.25);
    return this.orderSea(d, to, true);
  };
  function invasionDay(W) {
    W.divs.forEach(function (d) {
      if (!d.inv) return;
      if (d.path.length || d.battle !== null || d.prov !== d.inv.from || W.gone[W.provs[d.inv.to].ctrl] || !W.hostile(d.tag, W.provs[d.inv.to])) { d.inv = null; return; }
      if (W.day >= d.inv.ready) {
        var r = W.launchInvasion(d, false);
        if (r === null && d.tag === W.player) W.event('plan', 'The landing at ' + W.provs[d.path.length ? d.path[0].to : d.prov].name + ' begins', { a: d.tag, prov: d.path.length ? d.path[0].to : d.prov });
      }
    });
  }

  // ---------- command power ----------
  var ABILITIES = {
    speech: { name: 'Rousing speech', cost: 25, days: 14, text: '+10% attack and faster recovery of organisation for 14 days' },
    night: { name: 'Night march', cost: 15, days: 10, text: '+25% marching speed for 10 days' },
    dig: { name: 'Dig in', cost: 15, days: 20, text: 'Entrenchment builds three times as fast, up to +30% more, for 20 days' },
    guns: { name: 'Concentrate the guns', cost: 20, days: 14, text: '+15% attack and defence for armies with artillery, 14 days' },
    hold: { name: 'Not one step back', cost: 20, days: 14, text: '+15% defence, but 10% more losses, for 14 days' }
  };
  War.ABILITIES = ABILITIES;
  var TEACH = ['offensive', 'defensive', 'cavalry', 'gunner', 'hills', 'winter', 'logistics', 'staff', 'light', 'brawler'];
  War.TEACHABLE = TEACH;
  War.cpOf = function (t) { return (this.hoi2 && this.hoi2.cp[t]) || 0; };
  War.cpGain = function (t) { var gens = this.gens.filter(function (g) { return g.tag === t; }).length; return 0.25 + Math.min(0.35, gens * 0.03) + (this.hasAdv && this.hasAdv(t, 'staff') ? 0.1 : 0); };
  War.useAbility = function (a, id) {
    var ab = ABILITIES[id]; if (!ab) return 'No such ability';
    if (a.ab && a.ab.until > this.day) return 'This army is already using ' + ABILITIES[a.ab.id].name;
    if (!a.gen && !a.fm) { var self = this; if (!this.gens.some(function (g) { return g.army === a.id; })) return 'Only an army with a general'; }
    if (this.cpOf(a.tag) < ab.cost) return 'Needs ' + ab.cost + ' command power';
    this.hoi2.cp[a.tag] -= ab.cost; a.ab = { id: id, until: this.day + ab.days }; this._cm = null;
    return null;
  };
  War.abilityOf = function (a) { return a && a.ab && a.ab.until > this.day ? a.ab.id : null; };
  War.teachBlock = function (g, tr) {
    if (!g || TEACH.indexOf(tr) < 0) return 'Not possible';
    if (g.traits.indexOf(tr) >= 0) return 'Already has it';
    var extra = (g.taught || 0); if (g.traits.length >= 3 + extra && extra >= 2) return 'No room for more traits';
    var cost = 40 + 20 * extra; if (this.cpOf(g.tag) < cost) return 'Needs ' + cost + ' command power';
    return null;
  };
  War.teachCost = function (g) { return 40 + 20 * ((g && g.taught) || 0); };
  War.teachTrait = function (g, tr) { var why = this.teachBlock(g, tr); if (why) return why; this.hoi2.cp[g.tag] -= this.teachCost(g); g.traits.push(tr); g.taught = (g.taught || 0) + 1; this._cm = null; return null; };
  // what the abilities do
  var prevDm = War.dm;
  War.dm = function (d, side, bt) {
    var m = prevDm ? prevDm.call(this, d, side, bt) : 1, a = this.armyOf ? this.armyOf(d.id) : null, ab = this.abilityOf(a);
    if (!ab) return m;
    if (ab === 'speech' && side === 'a') m *= 1.1;
    else if (ab === 'guns') { var s = this.stats(d); if (s.n && s.n.art) m *= 1.15; }
    else if (ab === 'hold' && side === 'd') m *= 1.15;
    return m;
  };
  var prevCas = War.dmCas;
  War.dmCas = function (d) { var m = prevCas ? prevCas.call(this, d) : 1, a = this.armyOf ? this.armyOf(d.id) : null; return this.abilityOf(a) === 'hold' ? m * 1.1 : m; };
  var prevLeg = War.legDays;
  War.legDays = function (d, from, leg) { var n = prevLeg.call(this, d, from, leg), a = this.armyOf ? this.armyOf(d.id) : null; return this.abilityOf(a) === 'night' ? n * 0.8 : n; };
  function abilityDay(W) {
    W.armies.forEach(function (a) {
      var ab = W.abilityOf(a); if (!ab) { if (a.ab) a.ab = null; return; }
      a.divs.forEach(function (id) {
        for (var i = 0; i < W.divs.length; i++) if (W.divs[i].id === id) { var d = W.divs[i];
          if (ab === 'speech' && d.battle === null) d.org = Math.min(1, d.org + 0.015);
          if (ab === 'dig' && !d.path.length && d.battle === null) d.entr = Math.min(0.9, (d.entr || 0) + 0.02);
          break; }
      });
    });
  }
  // the computer spends its command power too
  function aiCommand(W) {
    W.tags.forEach(function (t) {
      if (W.gone[t] || (W.isHuman ? W.isHuman(t) : t === W.player)) return;
      var cp = W.cpOf(t); if (cp < 40) return;
      var g = W.gens.filter(function (x) { return x.tag === t && (x.taught || 0) < 2; }).sort(function (a, b) { return b.skill - a.skill; })[0];
      if (g && cp >= 60) { var opts = TEACH.filter(function (tr) { return !W.teachBlock(g, tr); }); if (opts.length) W.teachTrait(g, opts[(W.day + g.id) % opts.length]); }
      W.armies.forEach(function (a) { if (a.tag !== t || W.abilityOf(a)) return; var fighting = a.divs.some(function (id) { for (var i = 0; i < W.divs.length; i++) if (W.divs[i].id === id) return W.divs[i].battle !== null; return false; }); if (fighting && W.cpOf(t) >= 25) W.useAbility(a, 'speech'); });
    });
  }

  // ---------- hooks ----------
  War.initHoi2 = function () { this.hoi2 = { cp: {} }; var self = this; this.tags.forEach(function (t) { self.hoi2.cp[t] = 20; }); };
  var baseInit = War.init;
  War.init = function (a, b, c, d) { baseInit.call(this, a, b, c, d); this.initHoi2(); };
  var baseStep = War.step;
  War.step = function () {
    baseStep.call(this); if (!this.hoi2 || this.conference) return;
    var self = this; this.tags.forEach(function (t) { if (!self.gone[t]) self.hoi2.cp[t] = clamp((self.hoi2.cp[t] || 0) + self.cpGain(t), 0, 100); });
    invasionDay(this); abilityDay(this);
  };
  var baseMonth = War.month;
  War.month = function () { baseMonth.call(this); if (this.hoi2) aiCommand(this); };
  var baseSer = War.serialize;
  War.serialize = function () {
    var s = baseSer.call(this); if (!this.hoi2) return s;
    s.hoi2 = this.hoi2;
    s.invx = this.divs.filter(function (d) { return d.inv; }).map(function (d) { return [d.id, d.inv]; });
    s.abx = this.armies.filter(function (a) { return a.ab; }).map(function (a) { return [a.id, a.ab]; });
    s.taught = this.gens.filter(function (g) { return g.taught; }).map(function (g) { return [g.id, g.taught]; });
    return s;
  };
  var baseRestore = War.restore;
  War.restore = function (s) {
    var ok = baseRestore.call(this, s); if (!ok) return ok;
    this.initHoi2(); if (s.hoi2) this.hoi2 = s.hoi2;
    var D = {}; this.divs.forEach(function (d) { D[d.id] = d; }); (s.invx || []).forEach(function (x) { if (D[x[0]]) D[x[0]].inv = x[1]; });
    var A = {}; this.armies.forEach(function (a) { A[a.id] = a; }); (s.abx || []).forEach(function (x) { if (A[x[0]]) A[x[0]].ab = x[1]; });
    var G = {}; this.gens.forEach(function (g) { G[g.id] = g; }); (s.taught || []).forEach(function (x) { if (G[x[0]]) G[x[0]].taught = x[1]; });
    return ok;
  };
})(typeof window !== 'undefined' ? window : globalThis);
