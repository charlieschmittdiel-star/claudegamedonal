// Politics: political power, stability and war support, ministers and advisers, coups and revolutions, spies,
// opinion, claims and cores, demilitarised zones, ultimatums, alliance requests, royal marriages and client
// kingdoms (puppets). Loaded after the storyline, so story events can use all of this.
(function (root) {
  'use strict';
  var War = root.War, Econ = root.Econ;
  function rnd(o) { var t = o.seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var MAJOR = { FRA: 1, GBR: 1, AUS: 1, PRU: 1, RUS: 1, SPA: 1, OTT: 1, SWE: 1 };

  // ---------- ministers and advisers ----------
  var ROLES = {
    diplomat: { name: 'Foreign minister', text: 'Others are 15 more willing to ally with you or bow to your ultimatums; +0.15 political power a day', mods: {} },
    police: { name: 'Minister of police', text: '+8% stability, enemy spies 30% less likely to succeed, resistance grows a third slower', mods: {} },
    finance: { name: 'Minister of finance', text: '+5% production efficiency, +3% stability', mods: { prodeff: 0.05 } },
    war: { name: 'Minister of war', text: '+15% manpower recovery, +15% reinforcement', mods: { mp: 0.15, reinf: 0.15 } },
    staff: { name: 'Chief of staff', text: '+10% planning speed and +10% maximum planning', mods: { plan: 0.1, planmax: 0.1 } },
    reform: { name: 'Reformer', text: '+7% research speed, +10% construction speed', mods: { rspeed: 0.07, cons: 0.1 } },
    spy: { name: 'Spymaster', text: 'One more spy operation at a time, operations 25% more likely to succeed', mods: {} }
  };
  var NAMED = {
    FRA: { diplomat: 'Charles-Maurice de Talleyrand', police: 'Joseph Fouché', finance: 'Martin Gaudin', war: 'Lazare Carnot', staff: 'Louis-Alexandre Berthier', reform: 'Jean-Antoine Chaptal', spy: 'Charles Schulmeister' },
    GBR: { diplomat: 'Viscount Castlereagh', police: 'Lord Hawkesbury', finance: 'William Pitt', war: 'Lord Melville', staff: 'The Duke of York', reform: 'William Wilberforce', spy: 'William Wickham' },
    AUS: { diplomat: 'Klemens von Metternich', police: 'Count Pergen', finance: 'Count O\'Donnell', war: 'Archduke Charles', staff: 'Joseph Radetzky', reform: 'Count Stadion', spy: 'Baron Hager' },
    PRU: { diplomat: 'Karl von Hardenberg', police: 'Johann von Sack', finance: 'Karl von Struensee', war: 'Gerhard von Scharnhorst', staff: 'August von Gneisenau', reform: 'Baron vom Stein', spy: 'Justus Gruner' },
    RUS: { diplomat: 'Adam Czartoryski', police: 'Alexander Balashov', finance: 'Georg Kankrin', war: 'Alexei Arakcheyev', staff: 'Karl Wilhelm von Toll', reform: 'Mikhail Speransky', spy: 'Alexander Chernyshyov' },
    SPA: { diplomat: 'Manuel Godoy', police: 'José Caballero', finance: 'Miguel Cayetano Soler', war: 'Francisco Castaños', staff: 'Joaquín Blake', reform: 'Gaspar de Jovellanos', spy: 'Juan Escóiquiz' },
    OTT: { diplomat: 'Halet Efendi', police: 'Alemdar Mustafa Pasha', finance: 'Ebubekir Ratib', war: 'Hüseyin Pasha', staff: 'Mehmed Ali', reform: 'Selim\'s Nizam-ı Cedid council', spy: 'The Grand Vizier\'s agents' },
    SWE: { diplomat: 'Lars von Engeström', police: 'Gustaf af Wetterstedt', finance: 'Eric Ruuth', war: 'Johan Christopher Toll', staff: 'Georg Adlersparre', reform: 'Hans Järta', spy: 'Carl Löwenhielm' }
  };
  War.ROLES = ROLES;
  War.advName = function (tag, role) { return (NAMED[tag] && NAMED[tag][role]) || 'A capable ' + ROLES[role].name.toLowerCase(); };
  var COST = { adviser: 150, claim: 40, core: 80, ultimatum: 50, marriage: 50, remil: 50, annex: 150, release: 25 };
  War.POLCOST = COST;

  // ---------- state ----------
  War.initPolitics = function () {
    var self = this;
    this.pol = { N: {}, claims: {}, justify: [], integrate: [], dmz: {}, marriages: [], overlord: {}, puppetSince: {}, requests: [], ops: [], ae: {} };
    this.tags.forEach(function (t) { self.pol.N[t] = { pp: MAJOR[t] ? 60 : 20, stab: 0.6, ws: 0.4, adv: [], intel: {}, low: 0, why: {}, wsWhy: {} }; });
    // the coalition powers start the war of 1805 eager; France starts proud and stable
    if (this.pol.N.FRA) { this.pol.N.FRA.stab = 0.72; this.pol.N.FRA.ws = 0.65; }
    ['AUS', 'RUS', 'GBR'].forEach(function (t) { if (self.pol.N[t]) self.pol.N[t].ws = 0.55; });
  };
  function P(t) { return War.pol.N[t]; }
  War.polOf = function (t) { return this.pol && this.pol.N[t]; };
  War.hasAdv = function (t, role) { var n = this.pol && this.pol.N[t]; return !!(n && n.adv.indexOf(role) >= 0); };
  War.spend = function (t, pp) { var n = P(t); if (!n || n.pp < pp) return false; n.pp -= pp; return true; };

  War.hireAdviser = function (t, role) {
    var n = P(t); if (!ROLES[role]) return 'No such office';
    if (n.adv.indexOf(role) >= 0) return 'Already appointed';
    if (n.adv.length >= 3) return 'All three seats are taken: dismiss someone first';
    if (!this.spend(t, COST.adviser)) return 'Needs ' + COST.adviser + ' political power';
    n.adv.push(role); this.techVer++; return null;
  };
  War.dismissAdviser = function (t, role) { var n = P(t); n.adv = n.adv.filter(function (r) { return r !== role; }); this.techVer++; return null; };

  // ---------- political power, stability, war support ----------
  War.ppGain = function (t) { var n = P(t); return 1 + 0.6 * n.stab + (this.hasAdv(t, 'diplomat') ? 0.15 : 0) + (MAJOR[t] ? 0.25 : 0) - (this.pol.overlord[t] ? 0.4 : 0); };
  function homeOccupied(t) { var own = 0, occ = 0; War.eachOwned(t, function (p) { if (p.owner === t) { own++; if (p.ctrl !== t) occ++; } }); return own ? occ / own : 0; }
  function unrest(t) { var own = 0, r = 0; War.eachOwned(t, function (p, i) { if (p.owner === t) { own++; r += War.resist[i] || 0; } }); return own ? r / own : 0; }
  War.stabTarget = function (t) {
    var n = P(t), E = this.econ.N[t], why = {}, v = 0.55;
    var life = E && E.sol ? E.sol.life : 1; why['Living standards'] = clamp(0.5 * (life - 0.85), -0.25, 0.1);
    why['Taxes'] = -Math.max(0, ((E && E.tax) || 0) - 0.18) * 0.8;
    var w = this.atWarAny(t) && this.warCondition ? this.warCondition(t) : null;
    if (w) why['War weariness'] = -w.weary / 20 * 0.18;
    why['Enemy on our soil'] = -homeOccupied(t) * 0.35;
    why['Unrest in the provinces'] = -unrest(t) * 0.4;
    if (this.hasAdv(t, 'police')) why['Minister of police'] = 0.08;
    if (this.hasAdv(t, 'finance')) why['Minister of finance'] = 0.03;
    if (!this.atWarAny(t)) why['At peace'] = 0.05;
    if (this.pol.overlord[t]) why['Ruled from abroad'] = -0.05;
    var ae = this.pol.ae[t] || 0; if (ae > 0 && E) { /* expansion makes enemies, not unrest */ }
    var sh = n.shock || 0; if (Math.abs(sh) > 0.005) why['Recent events'] = sh;
    for (var k in why) { why[k] = Math.round(why[k] * 1000) / 1000; v += why[k]; }
    n.why = why; return clamp(v, 0.02, 0.98);
  };
  War.wsTarget = function (t) {
    var n = P(t), why = {}, v;
    if (!this.atWarAny(t)) { v = 0.35; why['At peace'] = 0; if (this.pol.overlord[t]) why['Follows its master'] = 0.05; }
    else {
      v = 0.5; var w = this.warCondition(t), self = this;
      why['War weariness'] = -w.weary / 20 * 0.35;
      var invaded = homeOccupied(t); if (invaded > 0) why['Defending the homeland'] = Math.min(0.2, 0.08 + invaded);
      var aggressor = this.enemies(t).some(function (e) { var k = self.wars[self.key(t, e)]; return k && k.a === t; });
      if (aggressor && !invaded) why['A war of choice'] = -0.05;
      if (n.wins) why['Victories'] = Math.min(0.15, n.wins * 0.03);
      if (n.losses) why['Defeats'] = -Math.min(0.2, n.losses * 0.03);
    }
    if (n.wsShock) why['Propaganda and events'] = n.wsShock;
    for (var k in why) { why[k] = Math.round(why[k] * 1000) / 1000; v += why[k]; }
    n.wsWhy = why; return clamp(v, 0.02, 0.98);
  };
  War.shockStab = function (t, v) { var n = P(t); if (!n) return; n.stab = clamp(n.stab + v, 0.02, 0.98); n.shock = clamp((n.shock || 0) + v * 0.5, -0.3, 0.3); };
  War.shockWs = function (t, v) { var n = P(t); if (!n) return; n.ws = clamp(n.ws + v, 0.02, 0.98); n.wsShock = clamp((n.wsShock || 0) + v * 0.5, -0.3, 0.3); };

  // what stability and war support do
  var prevExtra = War.extraMods;
  War.extraMods = function (tag) {
    var m = prevExtra ? prevExtra.call(this, tag) : {}, n = this.pol && this.pol.N[tag]; if (!n) return m;
    function add(k, v) { m[k] = (m[k] || 0) + v; }
    add('cons', (n.stab - 0.5) * 0.3); add('prodeff', (n.stab - 0.5) * 0.12); add('rspeed', (n.stab - 0.5) * 0.1);
    add('org', (n.ws - 0.5) * 0.16); add('mp', (n.ws - 0.5) * 0.5);
    n.adv.forEach(function (r) { var mods = ROLES[r].mods; for (var k in mods) add(k, mods[k]); });
    return m;
  };
  // police make resistance grow slower: pull a third of the day's growth back
  var prevRes = War.resistanceDay;
  War.resistanceDay = function () {
    var before = this.resist.slice ? this.resist.slice() : null; prevRes.call(this);
    if (!before || !this.pol) return;
    for (var i = 0; i < this.provs.length; i++) { var d = this.resist[i] - before[i]; if (d > 0 && this.hasAdv(this.provs[i].owner, 'police')) this.resist[i] -= d / 3; }
  };

  // ---------- opinion ----------
  War.opinion = function (a, b) {          // what a thinks of b, -100..100
    if (a === b) return 100;
    var v = 0, g = this.goodwill[a]; if (g && g[b]) v += g[b];
    if (this.atWar(a, b)) v -= 60; else if (this.allied(a, b)) v += 30;
    if (this.truce[this.key(a, b)] > this.day) v -= 10;
    if (this.married(a, b)) v += 20;
    if (this.pol.overlord[a] === b) v += 10;
    var self = this, cl = 0; Object.keys(this.pol.claims).forEach(function (id) { if (self.provs[id].owner === a && self.pol.claims[id][b]) cl++; }); if (cl) v -= Math.min(30, 8 + cl * 3);
    var lost = 0; this.provs.forEach(function (p, i) { if (self.core[i] === a && p.owner === b) lost++; }); if (lost) v -= Math.min(40, 10 + lost * 2);
    var ae = this.pol.ae[b] || 0; if (ae) v -= Math.min(40, ae * (this.borders && this.borders(a, (function () { var o = {}; o[b] = 1; return o; })()) ? 1 : 0.4));
    return Math.round(clamp(v, -100, 100));
  };

  // ---------- marriages ----------
  War.married = function (a, b) { return this.pol.marriages.some(function (m) { return (m[0] === a && m[1] === b) || (m[0] === b && m[1] === a); }); };
  War.marriagesOf = function (t) { return this.pol.marriages.filter(function (m) { return m[0] === t || m[1] === t; }); };
  War.marriageBlock = function (a, b) {
    if (a === b || this.gone[b]) return 'Not possible';
    if (this.married(a, b)) return 'Already joined by marriage';
    if (this.atWar(a, b)) return 'At war';
    if (this.marriagesOf(a).length >= 2) return 'Your family has no more princesses to spare';
    if (this.marriagesOf(b).length >= 2) return 'Their family is already well married';
    if (this.opinion(b, a) < -10) return 'They think too little of you';
    return null;
  };
  War.marry = function (a, b, free) {
    var why = this.marriageBlock(a, b); if (why && !free) return why;
    if (this.married(a, b)) return null;
    if (!free && !this.spend(a, COST.marriage)) return 'Needs ' + COST.marriage + ' political power';
    this.pol.marriages.push([a, b, this.day]);
    this.addGoodwill(a, b, 20); this.addGoodwill(b, a, 20);
    this.event('marriage', 'A royal wedding joins the houses of ' + this.nations[a].short + ' and ' + this.nations[b].short, { a: a, b: b });
    return null;
  };
  var prevView = War.allianceView;
  War.allianceView = function (ai, other) {
    var r = prevView.call(this, ai, other); if (!this.pol || r.score <= -99) return r;
    if (this.married(ai, other)) { r.score += 15; r.why.push('Joined by marriage (+15)'); }
    if (this.hasAdv(other, 'diplomat')) { r.score += 15; r.why.push('Your foreign minister (+15)'); }
    if (this.pol.overlord[ai] && this.pol.overlord[ai] !== other) { r.score -= 50; r.why.push('A client state of ' + this.nations[this.pol.overlord[ai]].short + ' (−50)'); }
    var op = this.opinion(ai, other); if (op < -20) { r.score -= 15; r.why.push('Bad relations (−15)'); }
    r.ok = r.score >= 30; return r;
  };

  // ---------- claims and cores ----------
  War.claimed = function (id, t) { var c = this.pol.claims[id]; return !!(c && c[t]); };
  War.claimsOn = function (t, o) { var self = this; return this.provs.some(function (p) { return p.owner === o && self.claimed(p.id, t); }); };
  function stateProvs(p) { return War.provs.filter(function (q) { return q.state === p.state && q.owner === p.owner; }).map(function (q) { return q.id; }); }
  War.stateProvs = function (id) { return stateProvs(this.provs[id]); };
  War.claimBlock = function (t, id) {
    var p = this.provs[id], self = this; if (!p) return 'No such province';
    if (p.owner === t) return 'Already yours';
    if (this.claimed(id, t)) return 'Already claimed';
    if (this.pol.justify.some(function (j) { return j.tag === t && self.provs[j.prov].state === p.state && self.provs[j.prov].owner === p.owner; })) return 'Already being justified';
    if (this.allied(t, p.owner)) return 'Not against an ally';
    var near = stateProvs(p).some(function (i) { return self.provs[i].adj.concat(self.provs[i].straits).some(function (j) { return self.provs[j].owner === t; }); });
    if (!near && this.core[id] !== t) return 'Only land that borders yours, or that was once yours';
    return null;
  };
  War.justifyClaim = function (t, id) {
    var why = this.claimBlock(t, id); if (why) return why;
    if (this.core[id] === t) { this.addClaims(t, stateProvs(this.provs[id])); return null; } // old land: claimed at once
    if (!this.spend(t, COST.claim)) return 'Needs ' + COST.claim + ' political power';
    this.pol.justify.push({ tag: t, prov: id, done: this.day + 45, owner: this.provs[id].owner });
    this.addGoodwill(this.provs[id].owner, t, -10);
    return null;
  };
  War.addClaims = function (t, ids) { var C = this.pol.claims; ids.forEach(function (i) { (C[i] = C[i] || {})[t] = War.day; }); };
  War.integrateBlock = function (t, id) {
    var p = this.provs[id], self = this;
    if (p.owner !== t) return 'Not yours';
    if (this.core[id] === t) return 'Already a core';
    if (this.resist[id] > 0.15) return 'Too much unrest: garrison it first';
    if (this.pol.integrate.some(function (j) { return j.tag === t && self.provs[j.prov].state === p.state; })) return 'Already being integrated';
    return null;
  };
  War.integrateCore = function (t, id) {
    var why = this.integrateBlock(t, id); if (why) return why;
    if (!this.spend(t, COST.core)) return 'Needs ' + COST.core + ' political power';
    this.pol.integrate.push({ tag: t, prov: id, done: this.day + 240 });
    return null;
  };
  // claimed land is cheaper at the peace table
  var prevLot = War.lotCost;
  War.lotCost = function (L, tag) {
    var c = prevLot.call(this, L, tag), self = this;
    if (this.pol && L.provs.every(function (id) { return self.claimed(id, tag) || self.core[id] === tag; })) c = Math.max(1, Math.round(c * 0.6));
    return c;
  };
  // aggressive expansion: land taken without a claim worries the neighbours
  function owners() { return War.provs.map(function (p) { return p.owner; }); }
  function expansion(before) {
    var self = War, gained = {};
    self.provs.forEach(function (p, i) {
      if (before[i] === p.owner) return;
      if (self.claimed(i, p.owner) || self.core[i] === p.owner) { if (self.pol.claims[i]) delete self.pol.claims[i][p.owner]; return; }
      gained[p.owner] = (gained[p.owner] || 0) + (p.vp || 1);
    });
    Object.keys(gained).forEach(function (t) {
      var ae = gained[t] * 1.5; self.pol.ae[t] = Math.min(80, (self.pol.ae[t] || 0) + ae);
      if (ae >= 6) self.event('story', self.nations[t].short + '\'s land grab alarms its neighbours', { a: t });
    });
    // claims on land that has changed hands to the claimant are fulfilled; claims on the old owner lapse
    Object.keys(self.pol.claims).forEach(function (i) { var c = self.pol.claims[i]; delete c[self.provs[i].owner]; if (!Object.keys(c).length) delete self.pol.claims[i]; });
  }
  var prevDictate = War.dictatePeace;
  War.dictatePeace = function (t) { var b = owners(), r = prevDictate.call(this, t); if (this.pol) expansion(b); return r; };
  var prevClose = War.closeConference;
  War.closeConference = function () {
    var c = this.conference, b = owners(); prevClose.call(this); if (!this.pol || !c) return;
    expansion(b); var self = this;
    Object.keys(c.puppet || {}).forEach(function (lo) { if (!self.gone[lo]) { self.pol.overlord[lo] = c.puppet[lo]; self.pol.puppetSince[lo] = self.day; } });
  };
  var prevPeace = War.peace;
  War.peace = function (a, b, keep) { var bf = owners(), r = prevPeace.call(this, a, b, keep); if (r && keep && this.pol) expansion(bf); return r; };

  // ---------- demilitarised zones ----------
  War.inDmz = function (id) { var p = this.provs[id], z = this.pol && this.pol.dmz[p.state]; return z && z.owner === p.owner ? z : null; };
  War.makeDmz = function (owner, forTag, state) {
    this.pol.dmz[state] = { owner: owner, for: forTag, day: this.day }; var self = this;
    // the owner's troops march out, and the forts there are pulled down
    this.divs.forEach(function (d) {
      var p = self.provs[d.prov]; if (d.tag !== owner || p.state !== state || p.owner !== owner || d.battle !== null) return;
      var out = self.nearest ? self.nearest(d.prov, function (q) { return q.owner === owner && q.state !== state; }) : null; if (out !== null) self.orderMove(d, out, true);
    });
    this.provs.forEach(function (p) { if (p.state === state && p.owner === owner) { var b = self.econ.P[p.id].b; if (b.fort) b.fort = 0; } });
  };
  War.remilitarise = function (t, state) {
    var z = this.pol.dmz[state]; if (!z || z.owner !== t) return 'Not a demilitarised zone of yours';
    if (!this.spend(t, COST.remil)) return 'Needs ' + COST.remil + ' political power';
    delete this.pol.dmz[state];
    if (!this.gone[z.for]) { this.addGoodwill(z.for, t, -30); this.addClaims(z.for, this.provs.filter(function (p) { return p.state === state && p.owner === t; }).map(function (p) { return p.id; })); }
    this.event('story', this.nations[t].short + ' marches troops back into the demilitarised zone', { a: t, b: z.for });
    return null;
  };
  var prevOrder = War.orderMove;
  War.orderMove = function (d, target, peaceful) {
    if (this.pol) { var z = this.inDmz(target); if (z && d.tag === z.owner && !this.atWar(z.owner, z.for)) return 'A demilitarised zone: your troops may not enter'; }
    return prevOrder.call(this, d, target, peaceful);
  };

  // ---------- client kingdoms (puppets) ----------
  War.puppetsOf = function (m) { var o = this.pol.overlord, self = this; return Object.keys(o).filter(function (t) { return o[t] === m && !self.gone[t]; }); };
  War.makePuppet = function (sub, master, quiet) {
    if (sub === master || this.gone[sub]) return 'Not possible';
    this.pol.overlord[sub] = master; this.pol.puppetSince[sub] = this.day;
    if (this.atWar(sub, master)) { var k = this.key(sub, master); delete this.wars[k]; this.truce[k] = this.day + 720; }
    var f = this.factionOf(sub), mf = this.factionOf(master);
    if (f && f !== mf) this.leaveFaction(sub, true);
    if (!this.factionOf(sub)) { if (mf) this.joinFaction(sub, mf); else this.formFaction(master, sub); }
    if (this.csJoin && this.inSystem && this.inSystem(master)) this.csJoin(sub);
    if (!quiet) this.event('story', this.nations[sub].short + ' becomes a client kingdom of ' + this.nations[master].short, { a: sub, b: master });
    return null;
  };
  War.freePuppet = function (sub, why) {
    var m = this.pol.overlord[sub]; if (!m) return;
    delete this.pol.overlord[sub]; delete this.pol.puppetSince[sub];
    if (this.factionOf(sub) && this.factionOf(sub) === this.factionOf(m)) this.leaveFaction(sub, true);
    this.event('story', this.nations[sub].short + (why || ' throws off the rule of ') + this.nations[m].short, { a: sub, b: m });
  };
  War.annexBlock = function (m, sub) {
    if (this.pol.overlord[sub] !== m) return 'Not your client';
    var yrs = (this.day - (this.pol.puppetSince[sub] || this.day)) / 365; if (yrs < 5) return 'Only after five years as your client (' + Math.ceil(5 - yrs) + ' to go)';
    if (this.atWarAny(m)) return 'Not during a war';
    return null;
  };
  War.annexPuppet = function (m, sub) {
    var why = this.annexBlock(m, sub); if (why) return why;
    if (!this.spend(m, COST.annex)) return 'Needs ' + COST.annex + ' political power';
    var self = this; delete this.pol.overlord[sub];
    this.provs.forEach(function (p) { if (p.owner === sub) { p.owner = m; p.ctrl = m; } });
    this.divs.forEach(function (d) { if (d.tag === sub) d.tag = m; });
    this.afterPeace(); if (this.syncFactions) this.syncFactions();
    this.pol.ae[m] = Math.min(80, (this.pol.ae[m] || 0) + 10);
    this.event('surrender', this.nations[sub].short + ' is annexed by ' + this.nations[m].short, { a: sub, b: m });
    return null;
  };
  // a nation that has been conquered can be brought back as a client kingdom from its old lands
  War.releasable = function (t) {
    var self = this, out = {};
    this.provs.forEach(function (p, i) { var c = self.core[i]; if (p.owner === t && c && c !== t && self.nations[c] && (self.gone[c] || !self.provs.some(function (q) { return q.owner === c; }))) (out[c] = out[c] || []).push(i); });
    return out;
  };
  War.releasePuppet = function (t, c) {
    var list = this.releasable(t)[c]; if (!list || !list.length) return 'Nothing to release';
    if (this.atWar(t, c)) return 'Not possible';
    if (!this.spend(t, COST.release)) return 'Needs ' + COST.release + ' political power';
    var self = this; delete this.gone[c];
    list.forEach(function (i) { var p = self.provs[i]; p.owner = c; p.ctrl = c; self.resist[i] = 0; });
    var n = this.nations[c], cap = n.capital && this.byName[n.capital];
    if (!cap || cap.owner !== c) { var big = list.slice().sort(function (a, b) { return self.econ.P[b].pop - self.econ.P[a].pop; })[0]; n.capital = this.provs[big].name; }
    this.econ.N[c].treasury = Math.max(this.econ.N[c].treasury || 0, 20000);
    var tp = this.tplOfCls ? this.tplOfCls(c, 'inf') : null; if (tp) for (var k = 0; k < Math.min(4, Math.ceil(list.length / 3)); k++) { var d = this.spawn(c, tp.id, list[k % list.length], 0.7); d.org = 0.7; }
    this.afterPeace(); this.indexStacks(); this.makePuppet(c, t, true);
    this.event('story', this.nations[t].short + ' restores ' + n.short + ' as a client kingdom', { a: t, b: c });
    return null;
  };

  // ---------- ultimatums ----------
  // kind 'land': hand over a state; kind 'dmz': demilitarise a state that borders the demander
  War.ultimatumBlock = function (t, target, id, kind) {
    var p = this.provs[id]; if (!p || p.owner !== target) return 'Pick one of their provinces';
    if (this.atWar(t, target)) return 'Already at war';
    if (this.allied(t, target)) return 'Not to an ally';
    if (this.truce[this.key(t, target)] > this.day) return 'Under a truce';
    var cap = this.nations[target].capital && this.byName[this.nations[target].capital]; if (kind === 'land' && cap && cap.state === p.state) return 'Not their capital';
    var self = this, near = stateProvs(p).some(function (i) { return self.provs[i].adj.concat(self.provs[i].straits).some(function (j) { return self.provs[j].owner === t; }); });
    if (!near) return 'Only land on your border';
    if (kind === 'dmz' && this.pol.dmz[p.state]) return 'Already demilitarised';
    return null;
  };
  // how a nation weighs a demand: the demander's might against its own and its friends'
  War.ultimatumOdds = function (t, target, kind) {
    var self = this, mine = this.strength(t), theirs = this.strength(target);
    this.allies(t).forEach(function (a) { mine += 0.5 * self.strength(a); });
    this.allies(target).concat(this.guarantorsOf ? this.guarantorsOf(target) : []).forEach(function (a) { if (a !== t) theirs += 0.7 * self.strength(a); });
    var ratio = mine / Math.max(1, theirs), need = kind === 'dmz' ? 1.6 : 2.4;
    if (this.claimsOn(t, target)) need -= 0.4;
    if (this.hasAdv(t, 'diplomat')) need -= 0.2;
    if (this.pol.overlord[target] === t) need = 0.5;
    var ws = P(target).ws; need += (ws - 0.4) * 1.5;
    return { ratio: ratio, need: need, yes: ratio >= need };
  };
  function cede(t, target, id, kind) {
    var p = War.provs[id], ids = stateProvs(p), b = owners();
    if (kind === 'dmz') { War.makeDmz(target, t, p.state); }
    else { ids.forEach(function (i) { var q = War.provs[i]; q.owner = t; q.ctrl = t; }); War.afterPeace(); if (War.syncFactions) War.syncFactions(); expansion(b); }
    War.shockStab(target, -0.05); War.addGoodwill(target, t, -25);
  }
  War.sendUltimatum = function (t, target, id, kind) {
    kind = kind || 'land';
    var why = this.ultimatumBlock(t, target, id, kind); if (why) return { why: why };
    if (!this.spend(t, COST.ultimatum)) return { why: 'Needs ' + COST.ultimatum + ' political power' };
    var st = this.states && this.states[this.provs[id].state], name = st ? st.name : this.provs[id].name;
    if (target === this.player) {
      this.pol.requests.push({ id: this.nextId++, type: 'ultimatum', from: t, to: target, prov: id, kind: kind, day: this.day, name: name });
      this.event('request', this.nations[t].short + (kind === 'dmz' ? ' demands that you demilitarise ' : ' demands that you hand over ') + name, { a: t, b: target });
      return { pending: true };
    }
    var o = this.ultimatumOdds(t, target, kind);
    if (o.yes) { cede(t, target, id, kind); this.event('story', this.nations[target].short + (kind === 'dmz' ? ' bows to ' + this.nations[t].short + ' and demilitarises ' : ' hands ' + name + ' to ') + (kind === 'dmz' ? name : this.nations[t].short), { a: target, b: t }); return { accepted: true }; }
    this.addGoodwill(target, t, -15); this.shockWs(target, 0.1);
    // a refused ultimatum is a ready cause for war
    this.addClaims(t, stateProvs(this.provs[id]));
    this.event('story', this.nations[target].short + ' rejects ' + this.nations[t].short + '\'s ultimatum', { a: target, b: t });
    return { refused: true };
  };
  War.answerRequest = function (r, yes) {
    this.pol.requests = this.pol.requests.filter(function (x) { return x !== r; });
    var pl = r.to, self = this;
    if (r.type === 'ultimatum') {
      if (yes) { if (this.provs[r.prov].owner === pl) cede(r.from, pl, r.prov, r.kind); return null; }
      this.addClaims(r.from, stateProvs(this.provs[r.prov])); this.shockWs(pl, 0.1);
      if (!this.atWar(r.from, pl)) this.declare(r.from, pl);
      return null;
    }
    if (r.type === 'alliance') {
      if (!yes) { this.addGoodwill(r.from, pl, -5); return null; }
      var mf = this.factionOf(pl), tf = this.factionOf(r.from);
      if (mf) return this.joinFaction(r.from, mf);
      if (tf) return this.joinFaction(pl, tf);
      return this.formFaction(pl, r.from);
    }
    if (r.type === 'marriage') { if (yes) return this.marry(r.from, pl, true); this.addGoodwill(r.from, pl, -5); return null; }
    return null;
  };

  // ---------- spies ----------
  var OPS = {
    network: { name: 'Build a spy network', days: 30, pp: 10, gold: 1500, intel: 0, text: 'Agents in their capital: +25% intelligence. At 50% you see their provinces, at 75% their armies.' },
    propaganda: { name: 'Spread propaganda', days: 30, pp: 20, gold: 2500, intel: 0.25, text: 'Pamphlets and rumours: −10% war support, −4% stability' },
    sabotage: { name: 'Sabotage', days: 40, pp: 25, gold: 3000, intel: 0.4, text: 'Fires in the workshops: their first construction project loses half its progress' },
    steal: { name: 'Steal plans', days: 50, pp: 30, gold: 3000, intel: 0.4, text: 'Copies of their drill books and drawings: a research bonus where they are ahead' },
    incite: { name: 'Incite rebellion', days: 40, pp: 30, gold: 4000, intel: 0.3, text: 'Money and muskets for the discontented: +25% resistance in their foreign-ruled provinces' },
    coup: { name: 'Stage a coup', days: 60, pp: 100, gold: 12000, intel: 0.7, text: 'Topple their government. Needs 70% intelligence and their stability under 45%' }
  };
  War.OPS = OPS;
  War.opSlots = function (t) { return 1 + (this.hasAdv(t, 'spy') ? 1 : 0) + (MAJOR[t] ? 0 : -0); };
  War.opsOf = function (t) { return this.pol.ops.filter(function (o) { return o.tag === t; }); };
  War.intel = function (t, target) { var n = P(t); return (n && n.intel[target]) || 0; };
  War.opBlock = function (t, target, kind) {
    var op = OPS[kind]; if (!op || t === target || this.gone[target]) return 'Not possible';
    if (this.opsOf(t).length >= this.opSlots(t)) return 'All your agents are busy';
    if (this.intel(t, target) < op.intel) return 'Needs ' + Math.round(op.intel * 100) + '% intelligence first';
    if (kind === 'network' && this.intel(t, target) >= 1) return 'The network is complete';
    if (kind === 'coup' && P(target).stab >= 0.45) return 'Their government is too stable (needs under 45%)';
    if (P(t).pp < op.pp) return 'Needs ' + op.pp + ' political power';
    if ((this.econ.N[t].treasury || 0) < op.gold) return 'Needs ƒ' + op.gold.toLocaleString('en');
    return null;
  };
  War.startOp = function (t, target, kind) {
    var why = this.opBlock(t, target, kind); if (why) return why;
    var op = OPS[kind]; P(t).pp -= op.pp; this.econ.N[t].treasury -= op.gold;
    this.pol.ops.push({ tag: t, target: target, kind: kind, done: this.day + op.days, start: this.day });
    return null;
  };
  War.cancelOp = function (o) { this.pol.ops = this.pol.ops.filter(function (x) { return x !== o; }); };
  function opChance(o) { return clamp(0.55 + (War.hasAdv(o.tag, 'spy') ? 0.25 : 0) - (War.hasAdv(o.target, 'police') ? 0.3 : 0) + 0.15 * War.intel(o.tag, o.target), 0.1, 0.95); }
  War.opChance = function (t, target) { return opChance({ tag: t, target: target }); };
  function finishOp(o) {
    var W = War, t = o.tag, x = o.target, n = P(t), tn = P(x), ok = rnd(W) < opChance(o), nm = W.nations;
    if (!tn || W.gone[x]) return;
    if (!ok) {
      n.intel[x] = Math.max(0, (n.intel[x] || 0) - 0.2); W.addGoodwill(x, t, -15);
      W.event(t === W.player || x === W.player ? 'spy' : 'spyquiet', nm[x].short + ' catches ' + nm[t].short + '\'s agents (' + OPS[o.kind].name.toLowerCase() + ')', { a: t, b: x });
      return;
    }
    var txt = '';
    if (o.kind === 'network') { n.intel[x] = Math.min(1, (n.intel[x] || 0) + 0.25); txt = 'The network in ' + nm[x].short + ' grows: ' + Math.round(n.intel[x] * 100) + '% intelligence'; }
    else if (o.kind === 'propaganda') { W.shockWs(x, -0.1); W.shockStab(x, -0.04); txt = 'Propaganda saps ' + nm[x].short + '\'s will to fight'; }
    else if (o.kind === 'sabotage') { var q = Econ.queueOf ? Econ.queueOf(x) : []; if (q.length) { q[0].cp = (q[0].cp || 0) * 0.5; } txt = 'Saboteurs set fires in ' + nm[x].short + '\'s workshops'; }
    else if (o.kind === 'steal') {
      var cats = ['inf', 'art', 'cav', 'doc', 'ind', 'eng'], best = null, bd = 0;
      if (W.R && W.R[x] && W.R[t]) cats.forEach(function (c) { var a = 0, b = 0; (W.TECH || []).forEach(function (tc) { if (tc.cat !== c) return; if (W.R[x].done[tc.id]) a++; if (W.R[t].done[tc.id]) b++; }); if (a - b > bd) { bd = a - b; best = c; } });
      if (W.addBonus) W.addBonus(t, [best || 'ind'], 0.5, 'Stolen plans from ' + nm[x].short);
      txt = 'Agents steal plans from ' + nm[x].short;
    }
    else if (o.kind === 'incite') { W.provs.forEach(function (p, i) { if (p.owner === x && W.core[i] !== x) W.resist[i] = Math.min(1, W.resist[i] + 0.25); }); txt = 'Rebellion stirs in ' + nm[x].short + '\'s foreign lands'; }
    else if (o.kind === 'coup') { txt = 'A coup in ' + nm[x].short + '!'; W.revolution(x, 'coup', t); }
    W.event(t === W.player || x === W.player ? 'spy' : 'spyquiet', txt, { a: t, b: x });
  }
  // spies give eyes: a 50% network shows their land, 75% their armies
  var prevVis = War.visibility;
  War.visibility = function (tag) {
    var vis = prevVis.call(this, tag), n = this.pol && this.pol.N[tag]; if (!n) return vis;
    var tg = Object.keys(n.intel).filter(function (x) { return n.intel[x] >= 0.5; }); if (!tg.length) return vis;
    for (var i = 0; i < this.provs.length; i++) { var o = this.provs[i].owner; for (var k = 0; k < tg.length; k++) if (o === tg[k]) { var lvl = n.intel[o] >= 0.75 ? 2 : 1; if (vis[i] < lvl) vis[i] = lvl; } }
    return vis;
  };

  // ---------- coups and revolutions ----------
  War.revolution = function (t, how, by) {
    var n = P(t), self = this; if (!n) return;
    n.adv = []; n.pp = 0; n.stab = 0.45; n.ws = 0.12; n.shock = 0.1; n.wsShock = -0.2; n.low = 0;
    var E = this.econ.N[t]; if (E) E.treasury = Math.round((E.treasury || 0) * 0.8);
    // the oppressed rise: provinces of nations still in the field go back to them
    this.provs.forEach(function (p, i) { var c = self.core[i]; if (p.owner === t && p.ctrl === t && c && c !== t && !self.gone[c] && self.atWar(t, c) && self.resist[i] > 0.5) p.ctrl = c; });
    if (t !== this.player) {
      if (!this.pol.overlord[t] && this.factionOf(t)) this.leaveFaction(t, true);
      this.enemies(t).forEach(function (e) { if (e !== self.player) self.peace(t, e, false); });
    }
    if (this.pol.overlord[t] && how !== 'coup') this.freePuppet(t, ' rises and throws off the rule of ');
    this.ctrlVersion++; this.techVer++;
    this.event(t === this.player ? 'lost' : 'revolution', how === 'coup' ? 'Coup d\'état in ' + this.nations[t].short + (by ? ', paid for by ' + this.nations[by].short : '') + ': a new government takes power' : 'Revolution in ' + this.nations[t].short + '! The government falls', { a: t, b: by });
  };

  // ---------- decisions: political power spent at home ----------
  var DECISIONS = {
    rally: { name: 'Rally the nation', pp: 60, days: 365, text: '+12% war support. Speeches, sermons and parades.', fx: function (t) { War.shockWs(t, 0.12); } },
    reform: { name: 'Reform the administration', pp: 70, days: 365, text: '+8% stability. Honest clerks, fewer sinecures.', fx: function (t) { War.shockStab(t, 0.08); } },
    levy: { name: 'Emergency levy', pp: 50, days: 365, text: 'Men for the army now (+1.5% of the population as manpower) at the price of 6% stability.', fx: function (t) { War.M[t].manpower += Math.round(War.econ.N[t].pop * 0.015); War.shockStab(t, -0.06); } },
    loan: { name: 'Patriotic loan', pp: 40, days: 365, text: 'Merchants lend to the state: two months of taxes now, −3% stability.', fx: function (t) { var E = War.econ.N[t]; E.treasury += Math.round(((E.last && E.last.taxRev) || 2000) * 2); War.shockStab(t, -0.03); } }
  };
  War.DECISIONS = DECISIONS;
  War.decisionBlock = function (t, id) {
    var d = DECISIONS[id], n = P(t); if (!d) return 'Not possible';
    var last = (n.dec || {})[id]; if (last !== undefined && this.day - last < d.days) return 'Again in ' + Math.ceil((d.days - (this.day - last)) / 30) + ' months';
    if (n.pp < d.pp) return 'Needs ' + d.pp + ' political power';
    return null;
  };
  War.takeDecision = function (t, id) {
    var why = this.decisionBlock(t, id); if (why) return why;
    var n = P(t); n.pp -= DECISIONS[id].pp; (n.dec = n.dec || {})[id] = this.day; DECISIONS[id].fx(t); return null;
  };

  // ---------- the day and the month ----------
  War.politicsDay = function () {
    var self = this, pol = this.pol;
    this.tags.forEach(function (t) { if (!self.gone[t]) { var n = pol.N[t]; n.pp = Math.min(500, n.pp + self.ppGain(t) * 0.3); } });   // about half a point a day
    if (pol.justify.length) pol.justify = pol.justify.filter(function (j) {
      var p = self.provs[j.prov]; if (p.owner !== j.owner || self.gone[j.tag]) return false;
      if (self.day < j.done) return true; self.addClaims(j.tag, stateProvs(p));
      if (j.tag === self.player || p.owner === self.player) self.event(j.tag === self.player ? 'claim' : 'request', self.nations[j.tag].short + ' now claims ' + ((self.states && self.states[p.state] && self.states[p.state].name) || p.name), { a: j.tag, b: p.owner });
      return false;
    });
    if (pol.integrate.length) pol.integrate = pol.integrate.filter(function (j) {
      var p = self.provs[j.prov]; if (p.owner !== j.tag) return false;
      if (self.day < j.done) return true; stateProvs(p).forEach(function (i) { self.core[i] = j.tag; self.resist[i] = 0; });
      if (j.tag === self.player) self.event('claim', ((self.states && self.states[p.state] && self.states[p.state].name) || p.name) + ' is now a core of yours', { a: j.tag });
      return false;
    });
    if (pol.ops.length) { var due = pol.ops.filter(function (o) { return o.done <= self.day; }); if (due.length) { pol.ops = pol.ops.filter(function (o) { return o.done > self.day; }); due.forEach(finishOp); } }
  };
  War.politicsMonth = function () {
    var self = this, pol = this.pol;
    this.tags.forEach(function (t) {
      if (self.gone[t]) return; var n = pol.N[t];
      n.stab = clamp(n.stab + (self.stabTarget(t) - n.stab) * 0.15, 0.02, 0.98);
      n.ws = clamp(n.ws + (self.wsTarget(t) - n.ws) * 0.2, 0.02, 0.98);
      n.shock = (n.shock || 0) * 0.85; n.wsShock = (n.wsShock || 0) * 0.85; n.wins = (n.wins || 0) * 0.8; n.losses = (n.losses || 0) * 0.8;
      for (var x in n.intel) { n.intel[x] = Math.max(0, n.intel[x] - 0.015); if (n.intel[x] <= 0 || self.gone[x]) delete n.intel[x]; }
      // a government at the end of its rope falls
      if (n.stab < 0.2) { n.low++; if (n.low >= 3 && rnd(self) < 0.12 * (0.2 - n.stab) / 0.2 + 0.03) self.revolution(t, 'revolution'); } else n.low = 0;
    });
    Object.keys(pol.ae).forEach(function (t) { pol.ae[t] *= 0.96; if (pol.ae[t] < 0.5) delete pol.ae[t]; });
    // demilitarised zones lapse in war; marriages end with a dynasty
    Object.keys(pol.dmz).forEach(function (s) { var z = pol.dmz[s]; if (self.gone[z.owner] || self.gone[z.for] || self.atWar(z.owner, z.for) || !self.provs.some(function (p) { return p.state === +s && p.owner === z.owner; })) delete pol.dmz[s]; });
    pol.marriages = pol.marriages.filter(function (m) { return !self.gone[m[0]] && !self.gone[m[1]]; });
    pol.requests = pol.requests.filter(function (r) { return self.day - r.day < 60 && !self.gone[r.from]; });
    // clients pay tribute and, when their master is weak, may break away
    Object.keys(pol.overlord).forEach(function (s) {
      var m = pol.overlord[s]; if (self.gone[s] || self.gone[m]) { delete pol.overlord[s]; return; }
      var E = self.econ.N[s], tr = Math.max(0, ((E.last && E.last.taxRev) || 0) * 0.1); if (tr && E.treasury > tr) { E.treasury -= tr; self.econ.N[m].treasury += tr; }
      if (self.factionOf(s) !== self.factionOf(m) && self.factionOf(m)) self.joinFaction(s, self.factionOf(m));
      var weak = self.atWarAny(m) && self.warCondition(m).total > 40, strong = self.strength(s) > 0.6 * self.strength(m);
      if (s !== self.player && (weak || strong) && rnd(self) < 0.04) self.freePuppet(s);
    });
    // succession: a minor married into a great house may pass to it
    pol.marriages.forEach(function (m) {
      [[m[0], m[1]], [m[1], m[0]]].forEach(function (x) {
        var minor = x[0], big = x[1], own = self.provs.filter(function (p) { return p.owner === minor; }).length;
        if (!MAJOR[minor] && MAJOR[big] && own <= 6 && !pol.overlord[minor] && minor !== self.player && !self.atWar(minor, big) && self.day - m[2] > 1800 && rnd(self) < 0.006) {
          self.makePuppet(minor, big, true); self.event('story', 'The crown of ' + self.nations[minor].short + ' passes by marriage to the house of ' + self.nations[big].short + ': it becomes a client kingdom', { a: minor, b: big });
        }
      });
    });
    this.aiPolitics();
  };

  // battles move war support
  var prevEnd = War.endBattle;
  War.endBattle = function (bt, attackerWon) {
    var p = this.provs[bt.prov], defTag = p.ctrl, n = (bt.atk || []).length + ((this.at && this.at[bt.prov]) || []).length;
    prevEnd.call(this, bt, attackerWon);
    if (!this.pol || attackerWon === null || attackerWon === undefined || n < 4) return;
    var win = attackerWon ? bt.tag : defTag, lose = attackerWon ? defTag : bt.tag, w = n >= 10 ? 1 : 0.5;
    if (this.pol.N[win]) this.pol.N[win].wins = (this.pol.N[win].wins || 0) + w;
    if (this.pol.N[lose]) this.pol.N[lose].losses = (this.pol.N[lose].losses || 0) + w;
  };
  // war support and a weary government make the AI readier to make peace
  War.noWarAppetite = function (t) { var n = this.pol && this.pol.N[t]; return !!(n && (n.ws < 0.22 || n.stab < 0.25)); };
  var prevWC = War.warCondition;
  War.warCondition = function (x) {
    var c = prevWC.call(this, x), n = this.pol && this.pol.N[x];
    if (n && x !== this.player && n.ws < 0.3) { var extra = (0.3 - n.ws) * 40; c = Object.assign({}, c); c.ws = Math.round(extra); c.total += extra; }
    return c;
  };

  // ---------- the computer's politics ----------
  var PRIO = { FRA: ['staff', 'diplomat', 'police'], GBR: ['diplomat', 'finance', 'spy'], AUS: ['war', 'reform', 'diplomat'], PRU: ['reform', 'war', 'staff'], RUS: ['war', 'diplomat', 'reform'] };
  War.aiPolitics = function () {
    var self = this, pol = this.pol, pl = this.player;
    this.tags.forEach(function (t) {
      if (self.isHuman(t) || self.gone[t]) return; var n = pol.N[t];
      // advisers
      if (n.adv.length < 3 && n.pp >= COST.adviser + 10) {
        var want = (PRIO[t] || (self.atWarAny(t) ? ['war', 'finance', 'police'] : ['finance', 'reform', 'police'])).concat(['finance', 'police', 'reform', 'war', 'diplomat']);
        for (var i = 0; i < want.length; i++) if (n.adv.indexOf(want[i]) < 0) { self.hireAdviser(t, want[i]); break; }
      }
      if (n.stab < 0.4 || (n.pp > 300 && n.stab < 0.75)) self.takeDecision(t, 'reform');
      if (n.pp > 300 && self.atWarAny(t)) self.takeDecision(t, 'rally');
      if (MAJOR[t] && n.pp > 200 && rnd(self) < 0.015 && self.marriagesOf(t).length < 2) {
        var mates = self.tags.filter(function (x) { return x !== t && x !== pl && !self.gone[x] && !self.marriageBlock(t, x) && self.opinion(x, t) > 10 && self.opinion(t, x) > 10; });
        if (mates.length) self.marry(t, mates[Math.floor(rnd(self) * mates.length)]);
      }
      if (self.atWarAny(t) && n.ws < 0.35) self.takeDecision(t, 'rally');
      if (self.atWarAny(t) && self.M[t].manpower < 5000 && n.stab > 0.45) self.takeDecision(t, 'levy');
      if (self.econ.N[t].treasury < 0 && n.stab > 0.4) self.takeDecision(t, 'loan');
      if (n.stab < 0.35 && n.adv.indexOf('police') < 0 && n.adv.length >= 3 && n.pp >= COST.adviser) { self.dismissAdviser(t, n.adv[n.adv.length - 1]); self.hireAdviser(t, 'police'); }
      if (!MAJOR[t] || self.storyHolds && self.storyHolds(t)) return;
      // claims on a weak neighbour
      if (n.pp > 90 && rnd(self) < 0.1 && !self.atWarAny(t)) {
        var opts = []; self.provs.forEach(function (p) { if (p.owner !== t) return; p.adj.forEach(function (j) { var q = self.provs[j]; if (q.owner !== t && !self.allied(t, q.owner) && !self.gone[q.owner] && self.strength(q.owner) * 2 < self.strength(t) && !self.claimBlock(t, j)) opts.push(j); }); });
        if (opts.length) self.justifyClaim(t, opts[Math.floor(rnd(self) * opts.length)]);
      }
      // spies against a rival or enemy
      if (self.opsOf(t).length < self.opSlots(t) && n.pp > 40 && rnd(self) < 0.25) {
        var foes = self.enemies(t); if (!foes.length) foes = Object.keys(pol.N).filter(function (x) { return MAJOR[x] && x !== t && !self.allied(t, x) && !self.gone[x] && self.opinion(t, x) < 0; });
        if (foes.length) { var x = foes[Math.floor(rnd(self) * foes.length)], il = self.intel(t, x), kind = il < 0.5 ? 'network' : self.atWar(t, x) ? (rnd(self) < 0.5 ? 'propaganda' : 'incite') : (rnd(self) < 0.5 ? 'steal' : 'propaganda'); self.startOp(t, x, kind); }
      }
    });
    // remilitarisation, annexing old clients
    Object.keys(pol.dmz).forEach(function (s) { var z = pol.dmz[s]; if (z.owner !== pl && P(z.owner).ws > 0.5 && self.strength(z.owner) > self.strength(z.for) && rnd(self) < 0.03) self.remilitarise(z.owner, +s); });
    Object.keys(pol.overlord).forEach(function (s) { var m = pol.overlord[s]; if (m !== pl && !self.annexBlock(m, s) && P(m).pp > COST.annex + 30 && rnd(self) < 0.05 && !(self.storyHolds && self.storyHolds(m))) self.annexPuppet(m, s); });
    // the player is courted: alliance offers, marriage proposals, and sometimes threatened
    if (pl && !this.gone[pl]) {
      if (!pol.requests.some(function (r) { return r.type === 'alliance'; }) && rnd(self) < 0.12) {
        var best = null, bs = 0;
        this.tags.forEach(function (t) {
          if (t === pl || self.gone[t] || self.allied(t, pl) || self.atWar(t, pl) || pol.overlord[t]) return;
          var v = self.allianceView(t, pl); if (!v.ok) return;
          var shared = self.enemies(pl).some(function (e) { return self.atWar(t, e); }) || self.enemies(t).some(function (e) { return self.borders && self.borders(pl, (function () { var o = {}; o[e] = 1; return o; })()); });
          var sc = v.score + (shared ? 25 : 0) + (MAJOR[t] ? 10 : 0); if (sc > bs && sc >= 55) { bs = sc; best = t; }
        });
        if (best) { pol.requests.push({ id: this.nextId++, type: 'alliance', from: best, to: pl, day: this.day }); this.event('request', this.nations[best].short + ' asks for an alliance', { a: best, b: pl }); }
      }
      if (rnd(self) < 0.04 && this.marriagesOf(pl).length < 2) {
        var c = this.tags.filter(function (t) { return t !== pl && !self.gone[t] && !self.marriageBlock(t, pl) && self.opinion(t, pl) > 15; });
        if (c.length) { var who = c[Math.floor(rnd(self) * c.length)]; pol.requests.push({ id: this.nextId++, type: 'marriage', from: who, to: pl, day: this.day }); this.event('request', this.nations[who].short + ' proposes a royal marriage', { a: who, b: pl }); }
      }
    }
  };
  // before a war of conquest, the computer tries an ultimatum
  War.tryUltimatum = function (t, target) {
    if (!this.pol || P(t).pp < COST.ultimatum) return false;
    var self = this, ids = []; this.provs.forEach(function (p) { if (p.owner === target && !self.ultimatumBlock(t, target, p.id, 'land')) ids.push(p.id); });
    if (!ids.length) return false;
    ids.sort(function (a, b) { return ((self.claimed(b, t) ? 1 : 0) - (self.claimed(a, t) ? 1 : 0)) || ((self.provs[b].vp || 1) - (self.provs[a].vp || 1)); });
    var r = this.sendUltimatum(t, target, ids[0], 'land');
    return !!(r.accepted || r.pending);
  };

  // ---------- hooks ----------
  var baseInit = War.init;
  War.init = function (a, b, c, d) { baseInit.call(this, a, b, c, d); this.initPolitics(); };
  var baseStep = War.step;
  War.step = function () { baseStep.call(this); if (this.pol && !this.conference) this.politicsDay(); };
  var baseMonth = War.month;
  War.month = function () { baseMonth.call(this); if (this.pol) this.politicsMonth(); };
  var baseSer = War.serialize;
  War.serialize = function () { var s = baseSer.call(this); if (this.pol) s.pol = this.pol; return s; };
  var baseRestore = War.restore;
  War.restore = function (s) {
    var ok = baseRestore.call(this, s); if (!ok) return ok;
    var self = this; this.initPolitics();
    if (s.pol) { var P0 = this.pol; this.pol = s.pol; ['claims', 'dmz', 'overlord', 'puppetSince', 'ae'].forEach(function (k) { self.pol[k] = self.pol[k] || {}; }); ['justify', 'integrate', 'marriages', 'requests', 'ops'].forEach(function (k) { self.pol[k] = self.pol[k] || []; }); this.tags.forEach(function (t) { if (!self.pol.N[t]) self.pol.N[t] = P0.N[t]; }); }
    return ok;
  };
})(typeof window !== 'undefined' ? window : globalThis);
