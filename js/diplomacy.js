// Diplomacy and the aftermath of war, in the manner of HoI4: named factions with leaders, guarantees of
// independence, volunteers, arms and gold sent abroad, resistance in occupied lands held down by garrisons, a peace
// conference where the victors spend points on regions, and monthly statistics for the ledger.
(function (root) {
  'use strict';
  var War = root.War, Econ = root.Econ;
  function rnd(o) { var t = o.seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  var ORDINAL = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'];

  // ---------- factions ----------
  // A faction is a named alliance with a leader. Every member is allied to every other; the ally table in war.js
  // stays the truth for who fights beside whom, and factions are kept in step with it.
  War.initFactions = function () {
    this.factions = []; this.coalitionN = 3; this.guar = {}; this.goodwill = {}; this.subsidy = {};
    var self = this;
    this.tags.forEach(function (t) { self.guar[t] = {}; self.goodwill[t] = {}; self.subsidy[t] = {}; });
    this.syncFactions();
    // the names of 1805
    this.factions.forEach(function (f) {
      if (f.members.indexOf('FRA') >= 0) { f.name = 'Napoleonic Alliance'; f.leader = 'FRA'; }
      else if (f.members.indexOf('GBR') >= 0) { f.name = 'Third Coalition'; f.leader = 'GBR'; }
    });
    [['GBR', 'POR'], ['RUS', 'SEP'], ['RUS', 'MON'], ['PRU', 'SAX'], ['PRU', 'MEC'], ['AUS', 'SZB']].forEach(function (g) { if (self.nations[g[0]] && self.nations[g[1]]) self.guar[g[0]][g[1]] = true; });
  };
  War.factionOf = function (tag) { for (var i = 0; i < this.factions.length; i++) if (this.factions[i].members.indexOf(tag) >= 0) return this.factions[i]; return null; };
  War.factionById = function (id) { for (var i = 0; i < this.factions.length; i++) if (this.factions[i].id === id) return this.factions[i]; return null; };
  War.syncFactions = function () {
    var self = this, seen = {}, comps = [];
    this.tags.forEach(function (t) {
      if (seen[t] || self.gone[t]) return;
      var comp = [], q = [t]; seen[t] = 1;
      while (q.length) { var x = q.shift(); comp.push(x); Object.keys(self.ally[x] || {}).forEach(function (y) { if (self.ally[x][y] && !seen[y] && !self.gone[y]) { seen[y] = 1; q.push(y); } }); }
      if (comp.length > 1) comps.push(comp);
    });
    var old = this.factions || [], next = [];
    comps.forEach(function (comp) {
      // the old faction that shares most members keeps its name
      var best = null, bn = 0;
      old.forEach(function (f) { var n = f.members.filter(function (m) { return comp.indexOf(m) >= 0; }).length; if (n > bn && next.indexOf(f) < 0) { bn = n; best = f; } });
      var f = best || { id: self.nextId++, name: null, leader: null, members: [], since: self.day };
      f.members = comp.slice();
      if (!f.leader || comp.indexOf(f.leader) < 0) f.leader = comp.slice().sort(function (a, b) { return (self.econ.N[b].pop || 0) - (self.econ.N[a].pop || 0); })[0];
      if (!f.name) f.name = self.factionName(f);
      // everyone in a faction is allied to everyone else
      comp.forEach(function (x) { comp.forEach(function (y) { if (x !== y) { self.ally[x][y] = true; } }); });
      next.push(f);
    });
    this.factions = next;
  };
  War.factionName = function (f) {
    var self = this, vsFrance = f.members.some(function (m) { return self.atWar(m, 'FRA'); }) && f.members.indexOf('FRA') < 0;
    if (vsFrance && f.members.some(function (m) { return ['GBR', 'AUS', 'RUS', 'PRU'].indexOf(m) >= 0; })) { var n = ++this.coalitionN; return (ORDINAL[n - 1] || n + 'th') + ' Coalition'; }
    var L = this.nations[f.leader].short;
    return { FRA: 'Napoleonic Alliance', GBR: 'British Alliance', RUS: 'Holy Alliance', AUS: 'Habsburg Alliance', PRU: 'Northern League', OTT: 'Sublime Alliance' }[f.leader] || L + ' League';
  };
  // why tag cannot be in the same faction as the members of f (null when it can)
  War.factionBlock = function (tag, members) {
    var self = this;
    if (members.indexOf(tag) >= 0) return 'Already a member';
    if (members.some(function (m) { return self.atWar(tag, m); })) return 'At war with a member';
    var foes = this.enemies(tag);
    if (members.some(function (m) { return foes.some(function (e) { return self.allied(m, e); }); })) return 'Allied to its enemies';
    return null;
  };
  War.joinFaction = function (tag, f) {
    var self = this, why = this.factionBlock(tag, f.members); if (why) return why;
    var cur = this.factionOf(tag); if (cur) this.leaveFaction(tag, true);
    f.members.forEach(function (m) { self.ally[tag][m] = true; self.ally[m][tag] = true; });
    f.members.push(tag);
    // a new member takes up the faction's wars
    var foes = {}; f.members.forEach(function (m) { if (m !== tag) self.enemies(m).forEach(function (e) { foes[e] = 1; }); });
    Object.keys(foes).forEach(function (e) { if (!self.allied(tag, e) && !self.atWar(tag, e)) { var k = self.key(tag, e); self.wars[k] = { a: tag, b: e, start: self.day }; } });
    this.event('faction', this.nations[tag].short + ' joins the ' + f.name, { a: tag, b: f.leader });
    this.syncFactions(); this.ctrlVersion++; if (this.refreshSupply) this.refreshSupply();
    return null;
  };
  War.leaveFaction = function (tag, quiet) {
    var f = this.factionOf(tag), self = this; if (!f) return 'Not in a faction';
    f.members.forEach(function (m) { if (m !== tag) { delete self.ally[tag][m]; delete self.ally[m][tag]; } });
    f.members = f.members.filter(function (m) { return m !== tag; });
    if (!quiet) this.event('faction', this.nations[tag].short + ' leaves the ' + f.name, { a: tag });
    if (f.leader === tag && f.members.length) f.leader = f.members.slice().sort(function (a, b) { return (self.econ.N[b].pop || 0) - (self.econ.N[a].pop || 0); })[0];
    this.syncFactions(); this.ctrlVersion++;
    return null;
  };
  // a new faction around a leader and its first member
  War.formFaction = function (leader, other, name) {
    var why = this.factionBlock(other, [leader]); if (why) return why;
    if (this.factionOf(leader)) return this.joinFaction(other, this.factionOf(leader));
    var f = { id: this.nextId++, name: name || null, leader: leader, members: [leader], since: this.day };
    if (!f.name) f.name = this.factionName(f);
    this.factions.push(f);
    return this.joinFaction(other, f);
  };
  // would the computer that rules `ai` be willing to stand in one faction with `other`? returns {ok, score, why[]}
  War.allianceView = function (ai, other) {
    var self = this, why = [], score = 0, fo = this.factionOf(other), members = fo ? fo.members : [other];
    var block = this.factionBlock(ai, members); if (block) return { ok: false, score: -99, why: [block] };
    var mine = this.factionOf(ai); if (mine && mine !== fo) { if (mine.leader === ai && mine.members.length > 1) return { ok: false, score: -99, why: ['Leads the ' + mine.name] }; score -= 20; why.push('Already in the ' + mine.name + ' (−20)'); }
    var power = function (t) { return self.strength(t); };
    var common = this.enemies(ai).filter(function (e) { return members.some(function (m) { return self.atWar(m, e); }); });
    if (common.length) { score += 45; why.push('Common enemy: ' + common.map(function (e) { return self.nations[e].short; }).join(', ') + ' (+45)'); }
    var gw = Math.round(Math.max(-40, Math.min(40, (this.goodwill[ai] && this.goodwill[ai][other]) || 0))); if (gw > 0) { score += gw; why.push('Gifts and aid received (+' + gw + ')'); } else if (gw < 0) { score += gw; why.push('Grievances (−' + (-gw) + ')'); }
    var theirP = 0; members.forEach(function (m) { theirP += power(m); }); var mineP = power(ai);
    if (theirP > mineP * 2) { score += 15; why.push('A strong friend (+15)'); }
    if (this.guar[other] && this.guar[other][ai]) { score += 15; why.push('They guarantee us (+15)'); }
    // being dragged into a war against a stronger neighbour
    var danger = [];
    members.forEach(function (m) { self.enemies(m).forEach(function (e) { if (!self.atWar(ai, e) && danger.indexOf(e) < 0) danger.push(e); }); });
    danger.forEach(function (e) {
      var near = self.provs.some(function (p) { return p.ctrl === ai && p.adj.some(function (j) { return self.provs[j].ctrl === e; }); });
      if (near && power(e) > mineP * 1.5) { score -= 50; why.push('Would mean war with ' + self.nations[e].short + ' next door (−50)'); }
      else if (!common.length) { score -= 15; why.push('Would mean war with ' + self.nations[e].short + ' (−15)'); }
    });
    if (!danger.length && !common.length) { score += 5; why.push('No war to join (+5)'); }
    return { ok: score >= 30, score: score, why: why };
  };
  War.inviteToFaction = function (from, to) {
    var v = this.allianceView(to, from);
    if (!v.ok && to !== this.player) return v.why.length ? v.why[v.why.length - 1] : 'They decline';
    var f = this.factionOf(from); return f ? this.joinFaction(to, f) : this.formFaction(from, to);
  };
  War.askToJoin = function (tag, f) {
    var v = this.allianceView(f.leader, tag);
    if (!v.ok && f.leader !== this.player) return 'The ' + f.name + ' will not have you: ' + (v.why[v.why.length - 1] || 'no reason given').toLowerCase();
    return this.joinFaction(tag, f);
  };

  // ---------- guarantees ----------
  War.guarantorsOf = function (t) { var out = [], self = this; this.tags.forEach(function (g) { if (self.guar[g] && self.guar[g][t] && !self.gone[g]) out.push(g); }); return out; };
  War.guarantee = function (g, t) {
    if (g === t) return 'Cannot guarantee yourself';
    if (this.atWar(g, t)) return 'At war with them';
    if (this.gone[t]) return 'They are gone';
    this.guar[g][t] = true;
    this.event('guarantee', this.nations[g].short + ' guarantees the independence of ' + this.nations[t].short, { a: g, b: t });
    return null;
  };
  War.revokeGuarantee = function (g, t) { delete this.guar[g][t]; };
  var baseDeclare = War.declare;
  War.declare = function (a, b, quiet) {
    var ok = baseDeclare.call(this, a, b, quiet);
    if (!ok || quiet || !this.guar) return ok;
    var self = this;
    this.guarantorsOf(b).forEach(function (g) {
      if (g === a || self.allied(g, a) || self.atWar(g, a) || self.gone[g]) return;
      if (baseDeclare.call(self, g, a, true)) self.event('war', self.nations[g].short + ' honours its guarantee of ' + self.nations[b].short + ' and goes to war with ' + self.nations[a].short, { a: g, b: a });
    });
    // guarantees end when the guarantor and the guaranteed come to blows
    this.tags.forEach(function (g) { if (self.guar[g]) Object.keys(self.guar[g]).forEach(function (t) { if (self.atWar(g, t)) delete self.guar[g][t]; }); });
    return ok;
  };

  // ---------- volunteers ----------
  War.volunteersOf = function (from) { return this.divs.filter(function (d) { return d.vol === from; }); };
  War.volunteerCap = function (from) { var n = 0, self = this; this.divs.forEach(function (d) { if (d.tag === from) n++; }); return Math.max(1, Math.floor(n * 0.15)); };
  War.canSendVolunteers = function (from, to) {
    var self = this;
    if (from === to) return 'Not to yourself';
    if (!this.enemies(to).length) return this.nations[to].short + ' is not at war';
    if (this.atWar(from, to)) return 'At war with them';
    if (this.enemies(to).some(function (e) { return self.atWar(from, e); })) return 'You are already fighting their enemies: send your armies instead';
    if (this.enemies(to).some(function (e) { return self.allied(from, e); })) return 'Allied to their enemies';
    if (this.volunteersOf(from).length >= this.volunteerCap(from)) return 'At most ' + this.volunteerCap(from) + ' divisions may serve abroad';
    var cap = this.provs.some(function (p) { return p.ctrl === to; }); if (!cap) return 'Nowhere to land';
    return null;
  };
  War.sendVolunteers = function (from, to, n) {
    var why = this.canSendVolunteers(from, to); if (why) return why;
    var self = this, room = this.volunteerCap(from) - this.volunteersOf(from).length;
    var pool = this.divs.filter(function (d) { return d.tag === from && d.battle === null && !d.retreat && !d.vol && d.str > 0.6; }).sort(function (a, b) { return (a.type === 'inf' ? 0 : 1) - (b.type === 'inf' ? 0 : 1) || b.str - a.str; });
    var send = pool.slice(0, Math.min(n || 1, room)); if (!send.length) return 'No division fit to send';
    var capName = this.nations[to].capital, cap = capName && this.byName[capName] && this.byName[capName].ctrl === to ? this.byName[capName] : this.provs.filter(function (p) { return p.ctrl === to; })[0];
    send.forEach(function (d) {
      self.leaveBattle(d); if (self.unassign) self.unassign([d.id]);
      d.vol = from; d.tag = to; d.prov = cap.id; d.path = []; d.prog = 0; d.org = Math.min(d.org, 0.4); d.manual = false; d.garrison = null;
    });
    this.indexStacks(); if (this.touchArmies) this.touchArmies(); this.refreshUpkeep();
    this.event('volunteers', send.length + ' ' + (send.length === 1 ? 'division' : 'divisions') + ' of ' + this.nations[from].short + ' volunteers arrive to fight for ' + this.nations[to].short, { a: from, b: to });
    return null;
  };
  War.recallVolunteers = function (from, to) {
    var self = this, list = this.divs.filter(function (d) { return d.vol === from && (!to || d.tag === to); }); if (!list.length) return 'None serving';
    list.forEach(function (d) { self.bringHome(d); });
    this.indexStacks(); if (this.touchArmies) this.touchArmies(); this.refreshUpkeep();
    return null;
  };
  War.bringHome = function (d) {
    var home = d.vol; this.leaveBattle(d); if (this.unassign) this.unassign([d.id]);
    d.vol = null; d.tag = home; d.path = []; d.prog = 0; d.retreat = false; d.garrison = null;
    var capName = this.nations[home].capital, cap = capName && this.byName[capName];
    var at = cap && cap.ctrl === home ? cap.id : this.nearest(d.prov, function (p) { return p.ctrl === home; });
    if (at === null || at === undefined) { d.dead = true; return; }
    d.prov = at;
  };

  // ---------- aid ----------
  var AID = { muskets: { n: 500, name: 'muskets', price: 12 }, artillery: { n: 10, name: 'cannon', price: 400 }, uniforms: { n: 1000, name: 'uniforms', price: 3 }, horses: { n: 300, name: 'horses', price: 30 }, money: { n: 5000, name: 'gold', price: 1 } };
  War.AID = AID;
  War.sendAid = function (from, to, kind, times) {
    var a = AID[kind], A = this.econ.N[from], B = this.econ.N[to]; if (!a || !A || !B) return 'No such aid';
    if (this.atWar(from, to)) return 'At war with them';
    var amt = a.n * (times || 1);
    if (kind === 'money') { if (A.treasury < amt) return 'Not enough money'; A.treasury -= amt; B.treasury += amt; }
    else { if ((A.stockpile[kind] || 0) < amt) return 'Not enough ' + a.name + ' in your arsenal'; A.stockpile[kind] -= amt; B.stockpile[kind] = (B.stockpile[kind] || 0) + amt; }
    var value = amt * ((A.price && A.price[kind]) || a.price);
    this.addGoodwill(to, from, Math.min(25, value / Math.max(500, (B.last && B.last.taxRev) || 1000) * 20));
    this.stat(from, 'aidSent', value);
    if (to === this.player || from === this.player) this.event('aid', this.nations[from].short + ' sends ' + Math.round(amt) + ' ' + a.name + (kind === 'money' ? ' (ƒ)' : '') + ' to ' + this.nations[to].short, { a: from, b: to });
    return null;
  };
  War.setSubsidy = function (from, to, amt) { if (amt > 0) this.subsidy[from][to] = amt; else delete this.subsidy[from][to]; };
  War.addGoodwill = function (to, from, v) { var g = this.goodwill[to]; if (!g) return; g[from] = Math.max(-60, Math.min(60, (g[from] || 0) + v)); };
  War.stat = function (tag, key, v) { var s = this.tally = this.tally || {}; var t = s[tag] = s[tag] || {}; t[key] = (t[key] || 0) + v; };

  // ---------- resistance ----------
  var CULT = { SPA: 1.8, POR: 1.5, RUS: 1.4, MON: 1.7, CAU: 1.8, IME: 1.5, SWI: 1.4, VAL: 1.4, OTT: 1.2, PER: 1.2, ALG: 1.4, MOR: 1.5, NAP: 1.3, SAR: 1.2 };
  var TYROL = { 'Innsbruck': 1, 'Brixen': 1, 'Bozen': 1, 'Trent': 1, 'Lienz': 1 };
  var TERR = { m: 1.5, h: 1.2, f: 1.2, s: 1.2, p: 1, d: 1 };
  War.initResistance = function () {
    var self = this; this.core = this.provs.map(function (p) { return p.owner; }); this.resist = this.provs.map(function () { return 0; });
  };
  // is this province ruled (held or owned) by strangers?
  War.foreignRule = function (p) { var core = this.core[p.id]; return !this.allied(p.ctrl, core) ? (p.ctrl !== p.owner ? 'occupied' : 'annexed') : null; };
  War.resistanceDay = function () {
    var self = this, R = this.resist;
    for (var i = 0; i < this.provs.length; i++) {
      var p = this.provs[i], kind = this.foreignRule(p);
      if (!kind) { if (R[i] > 0) R[i] = Math.max(0, R[i] - 0.02); continue; }
      var core = this.core[i], cult = TYROL[p.name] ? 1.8 : CULT[core] || 1, grow = (kind === 'occupied' ? 0.005 : (this.gone[core] ? 0.0003 : 0.0006)) * cult * (TERR[p.terrain] || 1);
      // garrisons: the ruler's (and its friends') troops here and next door
      var supp = 0, st = this.at[i] || [];
      for (var k = 0; k < st.length; k++) if (this.allied(st[k].tag, p.ctrl)) supp += 0.009 * st[k].str * (st[k].type === 'cav' ? 1.5 : 1);
      if (supp < 0.012) for (var a = 0; a < p.adj.length; a++) { var s2 = this.at[p.adj[a]]; if (s2) for (var m = 0; m < s2.length; m++) if (this.allied(s2[m].tag, p.ctrl)) { supp += 0.0015; break; } }
      var cap = kind === 'annexed' ? 0.6 : 1;
      R[i] = Math.max(0, Math.min(cap, R[i] + grow - supp));
      if (R[i] < 0.4) continue;
      // partisans strike at the garrison
      var ruler = st.filter(function (d) { return self.allied(d.tag, p.ctrl) && d.battle === null; });
      if (ruler.length && rnd(this) < (R[i] - 0.4) * 0.25) { var d = ruler[Math.floor(rnd(this) * ruler.length)]; d.str = Math.max(0.05, d.str - 0.015); d.org = Math.max(0, d.org - 0.12); this.stat(p.ctrl, 'partisan', 1); }
      // with nobody to hold it down, an occupied province rises
      if (kind === 'occupied' && R[i] >= 0.95 && !ruler.length && !this.gone[p.owner] && this.atWar(p.owner, p.ctrl) && rnd(this) < 0.05) {
        var was = p.ctrl; this.setCtrl(p, p.owner); R[i] = 0.35;
        var tp = this.tplOfCls ? this.tplOfCls(p.owner, 'inf') : null;
        if (tp) { var md = this.spawn(p.owner, tp.id, i, 0.45); md.org = 0.6; md.xp = 0.05; }
        this.stat(was, 'uprisings', 1);
        if (was === this.player || p.owner === this.player || this.allied(this.player, was)) this.event(was === this.player ? 'lost' : 'battle', p.name + ' rises against ' + this.nations[was].short + ' and returns to ' + this.nations[p.owner].short, { a: was, b: p.owner, prov: i });
        this.indexStacks();
      }
    }
  };
  // the computer posts garrisons in restless occupied provinces
  War.aiGarrisons = function (tag) {
    var self = this, mine = this.divs.filter(function (d) { return d.tag === tag; }); if (mine.length < 6) return;
    var posted = mine.filter(function (d) { return d.garrison !== undefined && d.garrison !== null; });
    // release garrisons no longer needed
    posted.forEach(function (d) { var p = self.provs[d.garrison]; if (!self.foreignRule(p) || p.ctrl !== tag || self.resist[d.garrison] < 0.1 || d.battle !== null) d.garrison = null; });
    posted = mine.filter(function (d) { return d.garrison !== undefined && d.garrison !== null; });
    var room = Math.floor(mine.length * 0.2) - posted.length; if (room <= 0) return;
    var want = this.provs.filter(function (p) { return p.ctrl === tag && self.resist[p.id] > 0.45 && !(self.at[p.id] || []).some(function (d) { return self.allied(d.tag, tag); }) && !posted.some(function (d) { return d.garrison === p.id; }); })
      .sort(function (a, b) { return self.resist[b.id] * (b.vp || 1) - self.resist[a.id] * (a.vp || 1); });
    want.slice(0, Math.min(room, 3)).forEach(function (p) {
      var best = null, bd = 99;
      mine.forEach(function (d) {
        if (d.garrison !== undefined && d.garrison !== null || d.battle !== null || d.retreat || d.path.length || d.vol) return;
        if (self.foesIn(tag, d.prov).length) return;
        var hop = self.distKm(self.provs[d.prov], p); if (hop < bd && hop < 600) { bd = hop; best = d; }
      });
      if (best && !self.orderMove(best, p.id, true)) best.garrison = p.id;
    });
  };

  // ---------- the peace conference ----------
  // When the player is among the victors, the beaten nation's fate is settled turn by turn: each victor spends
  // points on regions (the 1805 regions, as far as the loser still owns them), on gold, or on a client state.
  var baseSurrender = War.surrender;
  War.surrender = function (t) {
    var pl = this.player;
    if (this.conference && this.conference.losers.indexOf(t) >= 0) return;   // already at the table
    if (!pl || this.gone[pl] || !this.atWar(pl, t) || this.conference) return baseSurrender.call(this, t);
    this.openConference(t);
  };
  War.openConference = function (t) {
    var self = this, foes = this.enemies(t), total = this.econ.N[t].pop;
    var losers = [t].concat(this.allies(t).filter(function (a) { return !self.gone[a] && self.econ.N[a].pop * 4 < total && foes.some(function (f) { return self.atWar(a, f); }); }));
    var victors = foes.filter(function (v) { return !self.gone[v]; }).map(function (v) {
      var occ = 0; self.provs.forEach(function (p) { if (losers.indexOf(p.owner) >= 0 && p.ctrl === v) occ += p.vp || 1; });
      return { tag: v, pts: Math.round(4 + occ + (self.nations[v].major ? 6 : 0)), start: 0, passed: false, took: [], gold: 0 };
    }).sort(function (a, b) { return b.pts - a.pts; });
    victors.forEach(function (v) { v.start = v.pts; });
    this.conference = { losers: losers, victors: victors, turn: 0, taken: {}, puppet: {}, log: [], day: this.day, round: 1 };
    this.event('conference', 'The peace conference opens: ' + losers.map(function (x) { return self.nations[x].short; }).join(' and ') + ' must accept the victors\' terms', { a: t, b: this.player });
    this.confAdvance();
  };
  // the pieces on the table: each region's provinces still owned by one of the losers
  War.confLots = function () {
    var c = this.conference, self = this; if (!c) return [];
    var lots = {};
    this.provs.forEach(function (p) {
      if (c.losers.indexOf(p.owner) < 0 || c.puppet[p.owner]) return;
      var key = p.state + ':' + p.owner, L = lots[key] = lots[key] || { key: key, state: p.state, owner: p.owner, provs: [], vp: 0, name: self.states && self.states[p.state] ? self.states[p.state].name : p.name, holders: {} };
      L.provs.push(p.id); L.vp += p.vp || 1; L.holders[p.ctrl] = (L.holders[p.ctrl] || 0) + 1;
    });
    return Object.keys(lots).map(function (k) { return lots[k]; }).filter(function (L) { return !c.taken[L.key]; });
  };
  War.lotCost = function (L, tag) {
    var self = this, held = L.holders[tag] || 0, other = 0;
    Object.keys(L.holders).forEach(function (h) { if (h !== tag && h !== L.owner) other += L.holders[h]; });
    var near = L.provs.some(function (id) { var p = self.provs[id]; return p.adj.concat(p.straits).some(function (j) { return self.provs[j].owner === tag; }); });
    var coast = !near && L.provs.some(function (id) { return self.provs[id].coastal; });
    var cost = L.vp * (held >= L.provs.length ? 1 : held ? 1.25 : 1.5) * (other > held ? 1.5 : 1) * (near ? 1 : coast ? 1.4 : 2.2);
    return Math.max(1, Math.round(cost));
  };
  War.confCurrent = function () { var c = this.conference; return c ? c.victors[c.turn] : null; };
  War.confAct = function (tag, action, arg) {
    var c = this.conference, self = this; if (!c) return 'No conference';
    var v = this.confCurrent(); if (!v || v.tag !== tag) return 'Not your turn';
    if (action === 'take') {
      var L = this.confLots().filter(function (x) { return x.key === arg; })[0]; if (!L) return 'Already taken';
      var cost = this.lotCost(L, tag); if (cost > v.pts) return 'Costs ' + cost + ' points; you have ' + v.pts;
      v.pts -= cost; c.taken[L.key] = tag; v.took.push(L.key);
      c.log.push(this.nations[tag].short + ' takes ' + L.name + ' (' + L.provs.length + (L.provs.length === 1 ? ' province' : ' provinces') + ')');
    } else if (action === 'gold') {
      var n = Math.min(v.pts, arg || v.pts); if (n <= 0) return 'No points left';
      v.pts -= n; v.gold += n; c.log.push(this.nations[tag].short + ' demands reparations (' + n + ' points)');
    } else if (action === 'puppet') {
      var lo = arg, cost2 = Math.max(8, Math.round(v.start * 0.35));
      if (c.losers.indexOf(lo) < 0 || c.puppet[lo]) return 'Not possible';
      if (cost2 > v.pts) return 'Costs ' + cost2 + ' points';
      v.pts -= cost2; c.puppet[lo] = tag; c.log.push(this.nations[tag].short + ' makes ' + this.nations[lo].short + ' a client state');
    } else if (action === 'pass') { v.passed = true; c.log.push(this.nations[tag].short + ' is satisfied'); }
    else return 'Unknown action';
    this.confNext();
    return null;
  };
  War.confNext = function () {
    var c = this.conference, n = c.victors.length;
    var live = c.victors.filter(function (v) { return !v.passed && v.pts > 0; });
    if (!live.length || !this.confLots().length && live.every(function (v) { return v.pts <= 0; })) { this.closeConference(); return; }
    for (var i = 1; i <= n; i++) { var j = (c.turn + i) % n; if (j <= c.turn) c.round++; var v = c.victors[j]; if (!v.passed && v.pts > 0) { c.turn = j; break; } }
    this.confAdvance();
  };
  // the computer's victors choose in turn until it is the player's move
  War.confAdvance = function () {
    var c = this.conference, self = this; if (!c) return;
    for (var guard = 0; guard < 400 && this.conference; guard++) {
      var v = this.confCurrent(); if (!v) { this.closeConference(); return; }
      if (v.passed || v.pts <= 0) { v.passed = true; if (c.victors.every(function (x) { return x.passed || x.pts <= 0; })) { this.closeConference(); return; } c.turn = (c.turn + 1) % c.victors.length; continue; }
      if (v.tag === this.player) return;
      var lots = this.confLots(), best = null, bv = 0;
      lots.forEach(function (L) {
        var cost = self.lotCost(L, v.tag); if (cost > v.pts) return;
        var near = cost < L.vp * 2, val = (L.vp / cost) * (near ? 1.5 : 0.4) + (L.holders[v.tag] ? 0.6 : 0);
        if (!near && !self.nations[v.tag].major) return;
        if (val > bv) { bv = val; best = L; }
      });
      if (best && bv > 0.55) this.confAct(v.tag, 'take', best.key);
      else if (v.pts >= 2) this.confAct(v.tag, 'gold', v.pts);
      else this.confAct(v.tag, 'pass');
    }
  };
  War.closeConference = function () {
    var c = this.conference, self = this; if (!c) return;
    this.conference = null;
    // land changes hands
    var lots = {}; this.provs.forEach(function (p) { var key = p.state + ':' + p.owner; if (c.taken[key]) (lots[key] = lots[key] || []).push(p); });
    Object.keys(lots).forEach(function (key) { lots[key].forEach(function (p) { p.owner = c.taken[key]; p.ctrl = c.taken[key]; }); });
    var foes = c.victors.map(function (v) { return v.tag; });
    c.losers.forEach(function (x) {
      self.provs.forEach(function (p) {
        if (p.owner === x && p.ctrl !== x) p.ctrl = x;
        else if (p.ctrl === x && p.owner !== x && foes.indexOf(p.owner) >= 0) p.ctrl = p.owner;
      });
      for (var k in self.wars) { var w = self.wars[k]; if ((w.a === x && foes.indexOf(w.b) >= 0) || (w.b === x && foes.indexOf(w.a) >= 0) || w.a === x || w.b === x) { delete self.wars[k]; self.truce[k] = self.day + 720; self.lastPeace[w.a] = self.lastPeace[w.b] = self.day; } }
    });
    // reparations: each point is worth a fortnight of the loser's taxes
    c.victors.forEach(function (v) {
      if (!v.gold) return; var payer = c.losers[0], n = self.econ.N[payer], amt = Math.round(v.gold * Math.max(300, ((n.last && n.last.taxRev) || 1000) * 0.5));
      n.treasury -= amt; self.econ.N[v.tag].treasury += amt; v.goldAmt = amt;
    });
    // client states join their master's faction
    Object.keys(c.puppet).forEach(function (lo) {
      var m = c.puppet[lo]; if (self.gone[lo]) return;
      var f = self.factionOf(lo); if (f) self.leaveFaction(lo, true);
      var mf = self.factionOf(m); if (mf) self.joinFaction(lo, mf); else self.formFaction(m, lo);
    });
    delete this.capLost[c.losers[0]];
    this.lastConference = { losers: c.losers, victors: c.victors.map(function (v) { return { tag: v.tag, took: v.took.length, gold: v.goldAmt || 0 }; }), log: c.log, day: this.day };
    var who = c.victors.filter(function (v) { return v.took.length; }).map(function (v) { return self.nations[v.tag].short; });
    this.event('surrender', this.nations[c.losers[0]].short + ' signs the peace' + (who.length ? ': land goes to ' + who.join(', ') : ''), { a: c.losers[0], b: this.player });
    this.afterPeace(); if (this.syncFactions) this.syncFactions();
  };

  // ---------- statistics ----------
  War.snapshot = function () {
    var self = this, P = this.econ.P; this.hist = this.hist || {};
    var keep = this.tags.filter(function (t) { return (self.nations[t].major || t === self.player) && !self.gone[t]; });
    var count = {}, men = {}, prov = {}, vp = {};
    this.divs.forEach(function (d) { count[d.tag] = (count[d.tag] || 0) + 1; men[d.tag] = (men[d.tag] || 0) + d.str; });
    this.provs.forEach(function (p) { prov[p.owner] = (prov[p.owner] || 0) + 1; vp[p.owner] = (vp[p.owner] || 0) + (p.vp || 0); });
    keep.forEach(function (t) {
      var h = self.hist[t] = self.hist[t] || [], n = self.econ.N[t], sh = self.shipsOf ? self.shipsOf(t) : { first: 0, line: 0 };
      h.push([self.day, Math.round((n.last && n.last.taxRev) || 0), count[t] || 0, Math.round((self.M[t].men || 0) / 1000), sh.first + sh.line, prov[t] || 0, vp[t] || 0, Math.round((self.M[t].lost || 0) / 1000)]);
      if (h.length > 300) h.shift();
    });
  };
  War.HIST = ['day', 'Taxes a month', 'Divisions', 'Men under arms (thousands)', 'Ships of the line', 'Provinces', 'Victory points', 'Men lost (thousands)'];

  // ---------- the computer's foreign office ----------
  War.aiForeign = function () {
    var self = this, tags = this.tags.filter(function (t) { return !self.gone[t] && !(self.isHuman ? self.isHuman(t) : t === self.player) && self.econ.N[t].pop > 0; });
    var power = {}; this.tags.forEach(function (t) { power[t] = self.strength(t); });
    var heg = null, hv = 0; tags.concat(this.player ? [this.player] : []).forEach(function (t) { var g = self.growth(t), v = power[t] * g * g; if (v > hv) { hv = v; heg = t; } });
    tags.forEach(function (g) {
      var n = self.econ.N[g];
      // great powers guarantee small neighbours of a dangerous power
      if (self.nations[g].major && rnd(self) < 0.04) {
        var cands = self.tags.filter(function (t) {
          if (self.gone[t] || self.nations[t].major || t === g || self.guar[g][t] || self.atWar(g, t) || self.factionOf(t)) return false;
          var threat = self.provs.some(function (p) { return p.ctrl === t && p.adj.some(function (j) { var o = self.provs[j].ctrl; return o !== t && o !== g && !self.allied(o, g) && power[o] > 3 * (power[t] || 1) && (o === heg || self.atWar(o, g)); }); });
          return threat && power[g] > 0.5 * power[heg || g];
        });
        if (cands.length) self.guarantee(g, cands[Math.floor(rnd(self) * cands.length)]);
      }
      // volunteers for the side fighting the hegemon
      if (self.nations[g].major && !self.enemies(g).length && heg && g !== heg && !self.allied(g, heg) && rnd(self) < 0.05) {
        var host = self.enemies(heg).filter(function (t) { return !self.canSendVolunteers(g, t); })[0];
        if (host) self.sendVolunteers(g, host, 2);
      }
      // subsidies: a rich power at war pays its poorer allies to keep fighting
      if (self.enemies(g).length && n.last && n.treasury > 4 * n.last.taxRev) {
        self.allies(g).forEach(function (a) {
          var na = self.econ.N[a]; if (self.gone[a] || !self.enemies(a).length || !na.last || na.treasury > na.last.taxRev) return;
          var amt = Math.round(n.last.taxRev * 0.08); if (amt < 200) return;
          n.treasury -= amt; na.treasury += amt; self.stat(g, 'aidSent', amt); self.addGoodwill(a, g, 3);
          if (a === self.player) self.event('aid', self.nations[g].short + ' pays you a subsidy of ƒ' + amt, { a: g, b: a });
        });
      }
    });
    // volunteers come home when their war is over or their country changes sides
    this.divs.forEach(function (d) {
      if (!d.vol) return; var home = d.vol;
      if (self.gone[home]) { d.vol = null; return; }
      if (self.gone[d.tag] || !self.enemies(d.tag).length || self.atWar(home, d.tag) || self.enemies(d.tag).some(function (e) { return self.allied(home, e) || self.atWar(home, e); })) self.bringHome(d);
      else { var m = self.M[home]; if (m) m.xp = Math.min(999, (m.xp || 0) + 0.25); }
    });
    this.divs = this.divs.filter(function (d) { return !d.dead; });
    // the player's monthly subsidies
    if (this.player && this.subsidy[this.player]) Object.keys(this.subsidy[this.player]).forEach(function (to) {
      var amt = self.subsidy[self.player][to], A = self.econ.N[self.player], B = self.econ.N[to];
      if (self.gone[to] || self.atWar(self.player, to) || A.treasury < amt) { if (self.gone[to] || self.atWar(self.player, to)) delete self.subsidy[self.player][to]; return; }
      A.treasury -= amt; B.treasury += amt; self.addGoodwill(to, self.player, Math.min(8, amt / Math.max(500, (B.last && B.last.taxRev) || 1000) * 15)); self.stat(self.player, 'aidSent', amt);
    });
    // goodwill fades
    this.tags.forEach(function (t) { var g = self.goodwill[t]; for (var k in g) { g[k] *= 0.97; if (Math.abs(g[k]) < 0.5) delete g[k]; } });
    this.indexStacks();
  };

  // ---------- how a war is going, and what the winner can demand ----------
  War.fieldPower = function (t) {
    var c = this._fp; if (!c || c.day !== this.day) { c = this._fp = { day: this.day, v: {} }; var self = this; this.divs.forEach(function (d) { c.v[d.tag] = (c.v[d.tag] || 0) + self.power(d, 'atk'); }); }
    return c.v[t] || 0;
  };
  // How badly the war goes for one nation, 0 (untouched) to 100 (ruined): its people under enemy occupation, its
  // capital taken or threatened, and the blood spent since it went to war.
  War.warCondition = function (x) {
    var self = this, pop = 0, occ = 0, P = this.econ.P;
    var own = this.ownIds ? this.ownIds(x) : null, len = own ? own.length : this.provs.length;
    for (var ii = 0; ii < len; ii++) { var i = own ? own[ii] : ii, p = this.provs[i]; if (p.owner !== x) continue; pop += P[i].pop; if (p.ctrl !== x && this.atWar(x, p.ctrl)) occ += P[i].pop; }
    var o = pop ? Math.min(60, 100 * occ / pop) : 0, capP = this.byName[this.nations[x].capital], cap = 0;
    if (capP) { if (capP.ctrl !== x && this.atWar(x, capP.ctrl)) cap = 25; else if (capP.adj.some(function (j) { return self.atWar(x, self.provs[j].ctrl); })) cap = 8; }
    var ws = this.warStart && this.warStart[x], weary = 0;
    if (ws) weary = Math.min(20, 1500 * Math.max(0, (this.M[x].lost || 0) - ws.lost) / Math.max(1, this.econ.N[x].pop));
    return { occ: o, cap: cap, weary: weary, total: o + cap + weary, months: ws ? (this.day - ws.day) / 30 : 0 };
  };
  War.trackWars = function () {
    var self = this; this.warStart = this.warStart || {};
    this.tags.forEach(function (t) { var w = self.atWarAny(t); if (w && !self.warStart[t]) self.warStart[t] = { day: self.day, lost: self.M[t].lost || 0 }; else if (!w) delete self.warStart[t]; });
  };
  // from a's side of the war with b: positive when a is winning (b suffers more, and a's side is the stronger)
  War.warPosition = function (a, b) {
    var self = this, pa = this.fieldPower(a), pb = this.fieldPower(b);
    this.allies(a).forEach(function (x) { if (self.atWar(x, b)) pa += 0.5 * self.fieldPower(x); });
    this.allies(b).forEach(function (x) { if (self.atWar(x, a)) pb += 0.5 * self.fieldPower(x); });
    var mil = pa + pb > 0 ? 25 * (pa - pb) / (pa + pb) : 0;
    return this.warCondition(b).total - this.warCondition(a).total + mil;
  };
  // the enemy that has beaten x: holds its land, or has its armies on x's soil or at its border in strength
  War.victorOver = function (x) {
    var self = this, best = null, bv = 0, cx = this.warCondition(x).total, px = Math.max(1, this.fieldPower(x)), inside = {}, border = {};
    this.divs.forEach(function (d) { if (self.provs[d.prov].owner === x && d.tag !== x) inside[d.tag] = (inside[d.tag] || 0) + 1; });
    this.provs.forEach(function (p) { if (p.owner === x) p.adj.forEach(function (j) { border[self.provs[j].ctrl] = 1; }); });
    this.enemies(x).forEach(function (y) {
      if (self.gone[y]) return;
      var vp = 0; self.provs.forEach(function (p) { if (p.owner === x && p.ctrl === y) vp += p.vp || 1; });
      var here = inside[y] || 0, py = self.fieldPower(y);
      if (!vp && here < 2 && !(border[y] && py >= 0.6 * px)) return;
      if (self.warCondition(y).total > cx - 10) return;
      var v = vp * 2 + here + (border[y] ? 2 * py / px : 0); if (v > bv) { bv = v; best = y; }
    });
    return best;
  };
  // the land the winner would take: whole regions next to its own, cheapest first, never the loser's capital
  War.peaceTerms = function (win, lose) {
    var self = this, cond = this.warCondition(lose).total, pos = this.warPosition(win, lose), occVP = 0, lots = {};
    this.provs.forEach(function (p) { if (p.owner === lose && p.ctrl === win) occVP += p.vp || 1; });
    var pts = Math.round(Math.max(2, Math.min(40, (cond - 25) / 1.5 + occVP)));
    var capName = this.nations[lose].capital, cap = this.byName[capName];
    this.provs.forEach(function (p) {
      if (p.owner !== lose) return;
      var key = p.state + ':' + lose, L = lots[key] = lots[key] || { key: key, state: p.state, owner: lose, provs: [], vp: 0, name: self.states && self.states[p.state] ? self.states[p.state].name : p.name, holders: {}, capital: false };
      L.provs.push(p.id); L.vp += p.vp || 1; L.holders[p.ctrl] = (L.holders[p.ctrl] || 0) + 1; if (cap && p.id === cap.id) L.capital = true;
    });
    var all = Object.keys(lots).map(function (k) { return lots[k]; }), owned = 0; this.provs.forEach(function (p) { if (p.owner === lose) owned++; });
    var take = [], left = pts, taken = 0;
    all.filter(function (L) { return !L.capital; }).map(function (L) { return { L: L, c: self.lotCost(L, win) }; })
      .filter(function (x) { return x.c < x.L.vp * 2; })                        // only land next to the winner's own
      .sort(function (x, y) { return y.L.vp / y.c - x.L.vp / x.c; })
      .forEach(function (x) { if (x.c <= left && taken + x.L.provs.length <= owned * 0.4) { take.push(x.L); left -= x.c; taken += x.L.provs.length; } });
    var n = this.econ.N[lose], gold = Math.round(left * Math.max(300, ((n.last && n.last.taxRev) || 1000) * 0.5));
    return { win: win, lose: lose, lots: take.map(function (L) { return { key: L.key, provs: L.provs, name: L.name }; }), gold: gold, pts: pts, pos: Math.round(pos) };
  };
  War.termsText = function (t) {
    var parts = t.lots.map(function (L) { return L.name; });
    if (t.gold > 0) parts.push('ƒ' + Math.round(t.gold).toLocaleString('en') + ' in reparations');
    return parts.length ? parts.join(', ') : 'nothing but peace';
  };
  // a separate peace: the loser cedes the land and pays, and leaves the war with the winner and all its friends
  War.dictatePeace = function (t) {
    var self = this, win = t.win, lose = t.lose;
    t.lots.forEach(function (L) { L.provs.forEach(function (id) { var p = self.provs[id]; if (p.owner === lose) { p.owner = win; p.ctrl = win; } }); });
    var side = [win].concat(this.allies(win)), followers = this.allies(lose).filter(function (x) { return !self.gone[x] && self.econ.N[x].pop * 4 < self.econ.N[lose].pop; });
    [lose].concat(followers).forEach(function (x) {
      side.forEach(function (y) {
        var k = self.key(x, y), w = self.wars[k]; if (!w) return;
        delete self.wars[k]; self.truce[k] = self.day + 720; self.lastPeace[x] = self.lastPeace[y] = self.day;
        self.provs.forEach(function (p) { if ((p.owner === x && p.ctrl === y) || (p.owner === y && p.ctrl === x)) p.ctrl = p.owner; });
      });
    });
    if (t.gold > 0) { this.econ.N[lose].treasury -= t.gold; this.econ.N[win].treasury += t.gold; }
    // a beaten member leaves the coalition that dragged it in
    var f = this.factionOf(lose); if (f && f.members.some(function (m) { return self.enemies(m).some(function (e) { return side.indexOf(e) >= 0; }); })) this.leaveFaction(lose, true);
    var capName = this.nations[lose].capital || this.nations[lose].short;
    var text = 'Peace of ' + capName + ': ' + this.nations[lose].short + ' yields to ' + this.nations[win].short + (t.lots.length || t.gold ? ' (' + this.termsText(t) + ')' : '');
    this.lastTreaty = { text: text, day: this.day, terms: t };
    this.afterPeace(); this.syncFactions();
    this.event('surrender', text, { a: lose, b: win });
    return true;
  };
  // the computer's foreign office makes peace when a war is plainly lost
  War.aiPeace = function () {
    var self = this, pl = this.player; this.trackWars();
    this.tags.forEach(function (x) {
      if (self.gone[x] || !self.atWarAny(x)) return;
      var c = self.warCondition(x); if (c.total < 30 || c.months < 3) return;
      var y = self.victorOver(x); if (!y) return;
      if (self.isHuman && ((x !== pl && self.isHuman(x)) || (y !== pl && self.isHuman(y)))) return;   // other hot-seat players answer on their own turn
      if (x === pl) {
        if (self.offers.some(function (o) { return o.from === y; }) || rnd(self) > 0.35) return;
        var t = self.peaceTerms(y, x); if (!t.lots.length && t.gold <= 0) return;
        self.offers.push({ from: y, demand: true, terms: t, day: self.day });
        self.event('offer', self.nations[y].short + ' demands ' + self.termsText(t) + ' as the price of peace', { a: y, b: pl });
      } else if (y === pl) {
        if (self.offers.some(function (o) { return o.from === x; }) || rnd(self) > 0.35) return;
        var t2 = self.peaceTerms(y, x);
        self.offers.push({ from: x, cede: true, terms: t2, day: self.day });
        self.event('offer', self.nations[x].short + ' sues for peace and offers ' + self.termsText(t2), { a: x, b: pl });
      } else if (rnd(self) < 0.2 + (c.total - 30) / 80) {
        // a separate peace that would drop the player's ally out of the war is a little less likely
        if (pl && (self.allied(pl, x) || self.allied(pl, y)) && rnd(self) < 0.4) return;
        self.dictatePeace(self.peaceTerms(y, x));
      }
    });
  };

  // ---------- peacetime armies ----------
  // After a war the computer sends home the regiments it raised, keeping a bit more than its peacetime strength.
  War.demobilize = function (tag) {
    var self = this, base = this.start0div[tag] || 0, mine = this.divs.filter(function (d) { return d.tag === tag; });
    if (this.atWarAny(tag) || this.day - (this.lastPeace[tag] || -999) < 120 || mine.length <= Math.max(4, base * 1.3)) return 0;
    var n = this.econ.N[tag], broke = n.last && n.treasury < -3 * ((n.last.taxRev || 0) + (n.last.tariffRev || 0));
    var cut = Math.min(broke ? 3 : 2, mine.length - Math.ceil(base * 1.3));
    var pool = mine.filter(function (d) { return d.battle === null && !d.vol && (d.garrison === undefined || d.garrison === null); }).sort(function (a, b) { return a.str - b.str || (a.xp || 0) - (b.xp || 0); });
    var gone = pool.slice(0, cut);
    gone.forEach(function (d) { var s = self.stats(d); self.M[tag].manpower += d.str * s.men * 0.8; if (self.unassign) self.unassign([d.id]); d.dead = true; });
    if (gone.length) { this.divs = this.divs.filter(function (d) { return !d.dead; }); this.indexStacks(); this.refreshUpkeep(); }
    return gone.length;
  };

  // ---------- armies change with the years ----------
  // The Grande Armée of 1805 is the best in Europe; its edge wears away as the old armies reform (Austria under the
  // Archduke Charles by 1809, Prussia under Scharnhorst by 1813) and as France's veterans fall.
  var DRIFT = { FRA: [1.25, 1.08, 2600], AUS: [0.95, 1.05, 1400], PRU: [0.95, 1.08, 2700], RUS: [1.0, 1.06, 2400], SPA: [0.9, 0.95, 2000] };
  War.qualityDrift = function () {
    var Q = this.QUALITY, changed = false, day = this.day;
    for (var t in DRIFT) { var d = DRIFT[t], f = Math.min(1, day / d[2]), v = Math.round((d[0] + (d[1] - d[0]) * f) * 100) / 100; if (Q[t] !== v) { Q[t] = v; changed = true; } }
    if (changed) this.techVer = (this.techVer || 0) + 1;
  };

  // ---------- hooks ----------
  var baseInit = War.init;
  War.init = function (provinces, nations, econ, km) {
    baseInit.call(this, provinces, nations, econ, km);
    this.initResistance(); this.initFactions(); this.conference = null; this.hist = {}; this.tally = {}; this.lastConference = null;
    this.qualityDrift(); this.snapshot();
  };
  var baseStep = War.step;
  War.step = function () {
    if (this.conference) return;          // the world waits while the treaty is drawn up
    baseStep.call(this);
    this.resistanceDay();
    if (this.day % 5 === 2) { var self = this; this.tags.forEach(function (t) { if (t !== self.player && !self.gone[t] && self.enemies(t).length) self.aiGarrisons(t); }); }
  };
  var baseMonth = War.month;
  War.month = function () {
    if (this.conference) return;
    baseMonth.call(this);
    this.syncFactions(); this.aiForeign(); this.aiPeace(); this.syncFactions(); this.snapshot(); this.qualityDrift();
    var me = this; this.tags.forEach(function (t) { if (t !== me.player && !me.gone[t]) me.demobilize(t); });
    var self = this; this.battles.slice().forEach(function (bt) { if (!self.attackers(bt).length || !self.defenders(bt).length) self.endBattle(bt, null); });
  };
  var baseSer = War.serialize;
  War.serialize = function () {
    var s = baseSer.call(this);
    s.dip = { factions: this.factions, coalitionN: this.coalitionN, guar: this.guar, goodwill: this.goodwill, subsidy: this.subsidy, core: this.core, resist: this.resist.map(function (r) { return Math.round(r * 1000) / 1000; }), conference: this.conference, hist: this.hist, tally: this.tally, lastConference: this.lastConference };
    s.divExtra = {}; this.divs.forEach(function (d) { if (d.vol || (d.garrison !== undefined && d.garrison !== null)) s.divExtra[d.id] = [d.vol || null, d.garrison === undefined ? null : d.garrison]; });
    return s;
  };
  var baseRestore = War.restore;
  War.restore = function (s) {
    var ok = baseRestore.call(this, s); if (!ok) return ok;
    var self = this;
    if (s.dip) {
      var D = s.dip; this.factions = D.factions || []; this.coalitionN = D.coalitionN || 3; this.guar = D.guar || {}; this.goodwill = D.goodwill || {}; this.subsidy = D.subsidy || {};
      this.core = D.core || this.provs.map(function (p) { return p.owner; }); this.resist = D.resist || this.provs.map(function () { return 0; });
      this.conference = D.conference || null; this.hist = D.hist || {}; this.tally = D.tally || {}; this.lastConference = D.lastConference || null;
      this.tags.forEach(function (t) { self.guar[t] = self.guar[t] || {}; self.goodwill[t] = self.goodwill[t] || {}; self.subsidy[t] = self.subsidy[t] || {}; });
      if (s.divExtra) this.divs.forEach(function (d) { var x = s.divExtra[d.id]; if (x) { d.vol = x[0]; d.garrison = x[1]; } });
    } else { this.initResistance(); this.initFactions(); this.conference = null; this.hist = {}; this.tally = {}; }
    this.qualityDrift();
    return ok;
  };
})(typeof window !== 'undefined' ? window : globalThis);
