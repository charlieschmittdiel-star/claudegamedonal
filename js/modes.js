// Ways to play: difficulty, hot-seat players taking turns, observer mode, sandbox tools, the score, victory and
// the end of the game, and the record of what each nation did (for the diary and achievements).
(function (root) {
  'use strict';
  var War = root.War, Econ = root.Econ;

  War.DIFFICULTY = [
    { name: 'Recruit', blurb: 'You fight and build better (+15% attack and defence, +10% factories, +15% construction); the computer is a little weaker.', you: { atk: 0.15, def: 0.15, prodeff: 0.1, cons: 0.15 }, ai: { atk: -0.05, def: -0.05 } },
    { name: 'Regular', blurb: 'An even fight.', you: {}, ai: {} },
    { name: 'Veteran', blurb: 'The computer\'s armies and factories are 10% better.', you: {}, ai: { atk: 0.1, def: 0.1, prodeff: 0.1 } },
    { name: 'Marshal', blurb: 'The computer\'s armies are 20% better and it builds 20% faster; your troops tire sooner.', you: { org: -0.05 }, ai: { atk: 0.2, def: 0.2, prodeff: 0.2, cons: 0.2 } }
  ];
  War.initModes = function () { this.modes = { diff: this.modes ? this.modes.diff : 1, humans: [], turn: 0, turnDays: 30, sandbox: false, over: null, observer: false, stats: {} }; };
  War.isHuman = function (t) { return t === this.player || !!(this.modes && this.modes.humans.indexOf(t) >= 0); };

  var prevExtra = War.extraMods;
  War.extraMods = function (tag) {
    var m = prevExtra ? prevExtra.call(this, tag) : {}; if (!this.modes) return m;
    var d = this.DIFFICULTY[this.modes.diff] || this.DIFFICULTY[1], add = this.isHuman(tag) ? d.you : d.ai;
    for (var k in add) m[k] = (m[k] || 0) + add[k];
    return m;
  };
  War.setDifficulty = function (i) { this.modes.diff = Math.max(0, Math.min(3, i)); this.techVer++; };

  // the computer leaves the other human players' nations alone
  ['aiOrders', 'aiOrders2', 'aiTemplates', 'aiRecruit', 'aiRecruit2', 'aiNavy', 'aiGarrisons', 'aiResearch', 'aiLaws', 'aiProduction'].forEach(function (name) {
    var f = War[name]; if (typeof f !== 'function') return;
    War[name] = function (t) { if (this.modes && t !== this.player && this.modes.humans.indexOf(t) >= 0) return; return f.apply(this, arguments); };
  });
  var prevEconAi = Econ.ai;
  Econ.ai = function (t) { if (War.modes && t !== War.player && War.modes.humans.indexOf(t) >= 0) return; return prevEconAi.apply(this, arguments); };

  // hot-seat: each human plays for a turn of game time, then hands over
  War.setHumans = function (list, days) { this.modes.humans = list.slice(); this.modes.turn = 0; this.modes.turnDays = days || 30; this.modes.turnStart = this.day; };
  War.hotseat = function () { return this.modes && this.modes.humans.length > 1; };
  War.nextHuman = function () { var H = this.modes.humans.filter(function (t) { return !War.gone[t]; }); if (!H.length) return null; this.modes.turn = (this.modes.turn + 1) % H.length; this.modes.turnStart = this.day; return H[this.modes.turn]; };

  // ---------- the score and the end ----------
  War.score = function (t) {
    if (this.gone[t]) return 0;
    var self = this, vp = 0, pop = 0, techs = 0;
    this.eachOwned(t, function (p) { if (p.owner === t) { vp += p.vp || 1; pop += self.econ.P[p.id].pop; } });
    if (this.R && this.R[t]) techs = Object.keys(this.R[t].done).length;
    var col = 0; if (this.coloniesOf) this.coloniesOf(t).forEach(function (c) { col += c.value; });
    var st = this.pol ? this.pol.N[t].stab : 0.5, puppets = this.puppetsOf ? this.puppetsOf(t).length : 0;
    return Math.round(vp * 4 + pop / 200000 + techs * 2 + Math.max(0, this.econ.N[t].treasury) / 40000 + this.strength(t) / 25 + col / 400 + st * 20 + puppets * 10);
  };
  War.ranking = function () { var self = this; return this.tags.filter(function (t) { return !self.gone[t]; }).map(function (t) { return { tag: t, score: self.score(t) }; }).sort(function (a, b) { return b.score - a.score; }); };
  War.checkEnd = function () {
    if (!this.modes || this.modes.over) return;
    var pl = this.player, total = 0, mine = 0, self = this, why = null;
    if (pl) { this.provs.forEach(function (p) { if (p.world) return; total += p.vp || 1; if (p.owner === pl || (self.pol && self.pol.overlord[p.owner] === pl)) mine += p.vp || 1; }); }
    if (this.year() >= 1830) why = { kind: 'time', text: 'The year 1830: the age of Napoleon has passed into history.' };
    else if (pl && this.gone[pl]) why = { kind: 'defeat', text: this.nations[pl].name + ' has been wiped from the map.' };
    else if (pl && total && mine / total >= 0.5) why = { kind: 'conquest', text: this.nations[pl].name + ' holds half of Europe. No coalition can stand against it.' };
    if (why) { why.day = this.day; why.rank = this.ranking(); this.modes.over = why; this.event('gameover', why.text, { a: pl }); }
  };

  // ---------- the record ----------
  function stat(t, k, v) { if (!War.modes) return; var s = War.modes.stats[t] = War.modes.stats[t] || {}; s[k] = (s[k] || 0) + (v || 1); }
  War.mstat = stat;
  var prevEnd = War.endBattle;
  War.endBattle = function (bt, attackerWon) {
    var defTag = bt.defTag || this.provs[bt.prov].ctrl, n = (bt.peakA || 0) + (bt.peakD || 0);
    prevEnd.call(this, bt, attackerWon);
    if (attackerWon === null || attackerWon === undefined) return;
    var win = attackerWon ? bt.tag : defTag, lose = attackerWon ? defTag : bt.tag;
    stat(win, 'won'); stat(lose, 'lost'); if (n >= 15) stat(win, 'bigwon');
  };

  // ---------- sandbox ----------
  War.sandbox = {
    money: function (t, v) { War.econ.N[t].treasury += v; War.modes.sandbox = true; },
    power: function (t, v) { if (War.pol) War.pol.N[t].pp += v; War.modes.sandbox = true; },
    war: function (a, b) { War.modes.sandbox = true; return War.declare(a, b, true); },
    peace: function (a, b) { War.modes.sandbox = true; return War.peace(a, b, false); },
    owner: function (id, t) { var p = War.provs[id]; p.owner = t; p.ctrl = t; War.afterPeace(); War.modes.sandbox = true; },
    spawn: function (t, id, n) { for (var i = 0; i < (n || 3); i++) War.spawn(t, 'inf', id, 1); War.indexStacks(); War.modes.sandbox = true; },
    stability: function (t, v) { if (War.pol) War.pol.N[t].stab = v; War.modes.sandbox = true; }
  };

  // ---------- hooks ----------
  var baseInit = War.init;
  War.init = function (a, b, c, d) { baseInit.call(this, a, b, c, d); this.initModes(); };
  var baseMonth = War.month;
  War.month = function () { baseMonth.call(this); this.checkEnd(); };
  var baseSer = War.serialize;
  War.serialize = function () { var s = baseSer.call(this); if (this.modes) s.modes = this.modes; return s; };
  var baseRestore = War.restore;
  War.restore = function (s) { var ok = baseRestore.call(this, s); if (!ok) return ok; this.initModes(); if (s.modes) { var m = this.modes; Object.keys(s.modes).forEach(function (k) { m[k] = s.modes[k]; }); } return ok; };
})(typeof window !== 'undefined' ? window : globalThis);
