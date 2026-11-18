// The storyline: Napoleon, the Continental System and the great events of 1805–1815, as a chain of events with
// choices. In historical mode the computer takes history's choices (when it can) and the great powers leave the big
// wars to the story; in unhistorical mode it chooses freely. Either way an event only fires when the world makes it
// possible, so when history goes another way (France beaten in 1805, Russia crushed in 1812) the story follows.
//
// Every choice is made of EFFECTS (E.*) that know how to describe themselves, so the popup can show exactly what a
// pick will do, and REQUIREMENTS (R.*) that say whether the pick is possible right now (an invasion of Russia needs an
// army on Russia's border, not one stuck in Spain). Blocked choices are greyed out with the reason; the computer only
// picks choices it can carry out, and weighs wars by how strong it really is. Some choices put the decision off:
// the event comes back later (E.later). The national storylines are in story-branches.js.
(function (root) {
  'use strict';
  var War = root.War, Econ = root.Econ;
  function rnd(o) { var t = o.seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

  // ---------- helpers for the events ----------
  function S() { return War.story; }
  function flag(f) { return !!S() && S().flags[f] !== undefined; }
  function setFlag(f) { S().flags[f] = War.day; }
  function prov(name) { return War.byName[name]; }
  function ids(names) { return names.map(function (n) { return prov(n); }).filter(Boolean).map(function (p) { return p.id; }); }
  function alive(t) { return !!(War.nations[t] && !War.gone[t] && War.ownP(t).length > 0); }
  function yr() { return War.year(); }
  function at(y, m) { return yr() >= y + ((m || 1) - 1) / 12; }
  function nm(t) { var n = War.nations[t]; return n ? n.short : t; }
  function rename(tag, name, short) { var n = War.nations[tag]; if (!n) return; n.name = name; if (short) n.short = short; S().names[tag] = [name, n.short]; }
  // land changes hands at once (a treaty, not a conquest)
  function give(list, to, onlyFrom) {
    var moved = 0;
    list.forEach(function (id) { var p = War.provs[id]; if (!p || p.owner === to || (onlyFrom && onlyFrom.indexOf(p.owner) < 0)) return; p.owner = to; p.ctrl = to; moved++; });
    if (moved) { War.afterPeace(); if (War.syncFactions) War.syncFactions(); }
    return moved;
  }
  function war(a, b, why) {
    if (!alive(a) || !alive(b) || War.atWar(a, b)) return false;
    if (War.allied(a, b)) { if (War.factionOf(a)) War.leaveFaction(a, true); }
    var ok = War.declare(a, b, true);
    // the factions on each side go to war with them
    if (ok) [[a, b], [b, a]].forEach(function (x) { var f = War.factionOf(x[0]); if (f) f.members.forEach(function (m) { if (m !== x[0] && !War.atWar(m, x[1]) && !War.allied(m, x[1]) && alive(m)) War.wars[War.key(m, x[1])] = { a: m, b: x[1], start: War.day }; }); });
    if (ok && War.syncFactions) War.syncFactions();
    if (ok) War.event('war', why || War.nations[a].short + ' declares war on ' + War.nations[b].short, { a: a, b: b });
    return ok;
  }
  // a war between two nations only: nobody's allies are drawn in (America's quarrel was with Britain, not the Coalition)
  function duel(a, b, why) {
    if (!alive(a) || !alive(b) || War.atWar(a, b) || War.allied(a, b)) return false;
    var A = War.ally[a], B = War.ally[b]; War.ally[a] = {}; War.ally[b] = {};
    var ok; try { ok = War.declare(a, b, true); } finally { War.ally[a] = A; War.ally[b] = B; }
    if (ok) War.event('war', why || War.nations[a].short + ' declares war on ' + War.nations[b].short, { a: a, b: b });
    return ok;
  }
  function makePeace(a, b) {
    if (!War.atWar(a, b)) return;
    var self = War, side = [a].concat(War.allies(a)), other = [b].concat(War.allies(b).filter(function (x) { return War.econ.N[x].pop * 4 < War.econ.N[b].pop; }));
    other.forEach(function (x) { side.forEach(function (y) { var k = self.key(x, y); if (self.wars[k]) { delete self.wars[k]; self.truce[k] = self.day + 540; self.lastPeace[x] = self.lastPeace[y] = self.day; self.provs.forEach(function (p) { if ((p.owner === x && p.ctrl === y) || (p.owner === y && p.ctrl === x)) p.ctrl = p.owner; }); } }); });
    War.afterPeace(); if (War.syncFactions) War.syncFactions();
  }
  function joinSide(tag, leader) {
    if (!alive(tag) || !alive(leader)) return;
    var f = War.factionOf(leader);
    // against France: prefer a faction whose only wars are with France and its friends, so nobody is dragged into Persia
    if (leader !== 'FRA' && War.atWar(leader, 'FRA')) {
      var clean = function (fc) { return fc && fc.members.every(function (m) { return War.enemies(m).every(function (e) { return e === 'FRA' || War.allied(e, 'FRA'); }); }); };
      if (!clean(f)) { var alt = War.factions.filter(function (fc) { return fc.members.some(function (m) { return War.atWar(m, 'FRA'); }) && clean(fc); })[0]; if (alt) f = alt; }
    }
    if (War.factionOf(tag) && War.factionOf(tag) !== f) War.leaveFaction(tag, true);
    if (f) War.joinFaction(tag, f); else War.formFaction(leader, tag);
  }
  // a new nation rises on an empire's land overseas: it takes the provinces of its country that the empire still owns
  function liberateList(from, ccs, test) { return War.provs.filter(function (p) { return p.owner === from && p.world && ccs.indexOf(p.cc) >= 0 && (!test || test(p)); }).map(function (p) { return p.id; }); }
  function liberate(tag, from, ccs, n, test) {
    var W = War, N = W.nations[tag]; if (!N || !alive(from)) return 0;
    var list = liberateList(from, ccs, test);
    if (!list.length) return 0;
    delete W.gone[tag];
    list.forEach(function (id) { var p = W.provs[id]; p.owner = tag; p.ctrl = tag; W.core[id] = tag; W.resist[id] = 0; });
    var cap = N.capital && W.byName[N.capital];
    if (!cap || cap.owner !== tag) { var big = list.slice().sort(function (a, b) { return W.econ.P[b].pop - W.econ.P[a].pop; })[0]; N.capital = W.provs[big].name; }
    W.econ.N[tag].treasury = Math.max(W.econ.N[tag].treasury || 0, 15000);
    // the garrisons of the old empire in the country are overrun or go over
    W.divs = W.divs.filter(function (d) { return !(d.tag === from && list.indexOf(d.prov) >= 0); });
    W.afterPeace(); if (W.syncFactions) W.syncFactions();
    spawnAt(tag, N.capital, n || 3, 0.8); W.indexStacks(); if (W.refreshUpkeep) W.refreshUpkeep();
    W.event('story', N.name + ' declares its independence from ' + W.nations[from].short, { a: tag, b: from });
    return list.length;
  }
  function leaveSide(tag) { if (War.factionOf(tag)) War.leaveFaction(tag, true); }
  function divsIn(tag, owner) { return War.divs.filter(function (d) { return d.tag === tag && War.provs[d.prov].owner === owner; }).length; }
  function yielded(lose, win) { return flag('yield:' + lose + ':' + win); }
  function yieldedSince(lose, win, f) { var y = S().flags['yield:' + lose + ':' + win], d = S().flags[f]; return y !== undefined && d !== undefined && y >= d; }
  function spawnAt(tag, where, n, str) {
    var p = typeof where === 'number' ? War.provs[where] : prov(where);
    if (!p || p.ctrl !== tag) p = War.capitalProv ? War.capitalProv(tag) : null;
    if (!p || p.ctrl !== tag) p = War.provs.filter(function (q) { return q.ctrl === tag; })[0]; if (!p) return 0;
    var tp = War.tplOfCls(tag, 'inf'); for (var i = 0; i < n; i++) { var d = War.spawn(tag, tp.id, p.id, str || 0.9); d.xp = Math.max(d.xp || 0, 0.5); d.org = 0.8; }
    War.indexStacks(); if (War.refreshUpkeep) War.refreshUpkeep();
    return n;
  }
  function goodwill(to, from, v) { var g = War.goodwill[to]; if (g) g[from] = Math.max(-60, Math.min(60, (g[from] || 0) + v)); }

  // ---------- how strong a nation really is where it matters ----------
  // a nation's home provinces (for a European power, its European land), and the land within `depth` provinces of them
  function homeIds(t) {
    var cap = War.capitalProv ? War.capitalProv(t) : null, world = cap ? !!cap.world : false;
    var own = War.ownIds ? War.ownIds(t) : War.provs.filter(function (p) { return p.owner === t; }).map(function (p) { return p.id; });
    var home = own.filter(function (id) { return !!War.provs[id].world === world; });
    return home.length ? home : own;
  }
  function around(t, depth) {
    var dist = {}, q = [];
    homeIds(t).forEach(function (id) { dist[id] = 0; q.push(id); });
    for (var h = 0; h < q.length; h++) { var id = q[h]; if (dist[id] >= depth) continue; var p = War.provs[id], nb = p.adj.concat(p.straits || []); for (var i = 0; i < nb.length; i++) if (dist[nb[i]] === undefined) { dist[nb[i]] = dist[id] + 1; q.push(nb[i]); } }
    return dist;
  }
  // the attacking power of `tag`'s divisions on or near `target`'s home land: within 5 provinces of it, or if tag
  // cannot get that close (no land of its own or its friends nearer), within 3 of the nearest place it can gather
  function zone(tag, target) {
    var dist = around(target, 16), st = stagingIn(tag, dist), r = 5;
    if (st) r = Math.max(5, dist[st.id] + 3);
    return { dist: dist, r: r, st: st };
  }
  function powerNear(tag, target) {
    var z = zone(tag, target), v = 0;
    War.divs.forEach(function (d) { var k = z.dist[d.prov]; if (d.tag === tag && k !== undefined && k <= z.r) v += War.power(d, 'atk'); });
    return v;
  }
  // what `tag` would face: the target's whole army, and half of its friends' (they would come in)
  function powerAgainst(tag, target) {
    var v = War.fieldPower(target);
    War.allies(target).forEach(function (a) { if (a !== tag && !War.allied(a, tag)) v += 0.5 * War.fieldPower(a); });
    return Math.max(1, v);
  }
  // 0..: the army tag has near target, as a share of what it would face (1 = as strong as the enemy)
  War.readiness = function (tag, target) { return powerNear(tag, target) / powerAgainst(tag, target); };
  // the whole army, wherever it is, against the target's: for the computer's sense of the odds
  function odds(tag, target) {
    var mine = War.fieldPower(tag); War.allies(tag).forEach(function (a) { if (a !== target && !War.allied(a, target)) mine += 0.5 * War.fieldPower(a); });
    return mine / powerAgainst(tag, target);
  }
  // the province from which tag's army would march on target: the nearest land tag (or failing that, a friend) holds
  function stagingFor(tag, target) { return stagingIn(tag, around(target, 16)) || (War.capitalProv ? War.capitalProv(tag) : null); }
  function stagingIn(tag, near) {
    var best = null, bd = 99, bestF = null, bf = 99;
    Object.keys(near).forEach(function (k) {
      var p = War.provs[k], d = near[k]; if (d === 0) return;
      if (p.ctrl === tag && d < bd) { bd = d; best = p; }
      else if (War.allied(tag, p.ctrl) && d < bf) { bf = d; bestF = p; }
    });
    if (best && (!bestF || bd <= bf + 2)) return best;
    return bestF || best || null;
  }
  // divisions that are free to go: not fighting, no front-line orders, no enemy close by
  function idleDivs(tag) {
    var foes = War.enemies(tag);
    return War.divs.filter(function (d) {
      if (d.tag !== tag || d.battle !== null || d.retreat) return false;
      var a = War.armyOf ? War.armyOf(d.id) : null; if (a && a.front) return false;
      if (!foes.length) return true;
      var p = War.provs[d.prov]; if (War.atWar(tag, p.ctrl)) return false;
      return !p.adj.some(function (j) { return War.atWar(tag, War.provs[j].ctrl); });
    });
  }
  // march divisions to a province by post road; where no road runs through friendly land (a neutral in the way),
  // they make the long march round it anyway and arrive worn out (same continent only)
  function sendTo(list, target) {
    var n = 0, moved = false;
    list.forEach(function (d) {
      if (d.prov === target.id) return;
      var why = 'x'; try { why = War.redeploy(d, target.id); } catch (e) { why = 'x'; }
      if (!why) { n++; return; }
      if (d.battle !== null || !!War.provs[d.prov].world !== !!target.world) return;
      if (War.halt) War.halt(d); d.redeploy = false; d.path = []; d.prog = 0; d.prov = target.id; d.entr = 0;
      d.org = Math.min(d.org, 0.15); d.str = Math.max(0.1, d.str * 0.95); n++; moved = true;
    });
    if (moved) War.indexStacks();
    return n;
  }

  // ---------- Napoleon ----------
  var NAP = 'Napoleon Bonaparte';
  function napGen() { for (var i = 0; i < War.gens.length; i++) if (War.gens[i].name === NAP) return War.gens[i]; return null; }
  War.napoleon = function () { return S() ? S().nap : null; };
  // take him off the board (wounded, exiled) and keep him for later
  function sideline(state, days) {
    var g = napGen(), n = S().nap; if (!g && !n.gen) return;
    if (g) {
      War.gens = War.gens.filter(function (x) { return x !== g; });
      (War.armies || []).forEach(function (a) { if (a.gen === g.id) a.gen = null; });
      (War.groups || []).forEach(function (gr) { if (gr.fm === g.id) gr.fm = null; });
      n.gen = g; g.army = null; g.group = null;
    }
    n.state = state; n.until = days ? War.day + days : null; War._cm = null;
  }
  function bringBack() {
    var n = S().nap; if (!n.gen) return;
    if (!napGen()) { n.gen.tag = 'FRA'; War.gens.push(n.gen); }
    n.gen = null; n.state = 'emperor'; n.until = null; War._cm = null;
  }
  // he leads France's armies: faster marches as well as his Emperor trait
  var prevExtra = War.extraMods;
  War.extraMods = function (tag) {
    var m = prevExtra ? prevExtra.call(this, tag) : {};
    var st = this.story; if (!st) return m;
    if (tag === 'FRA' && st.nap.state === 'emperor') m.spd = (m.spd || 0) + 0.05;
    var day = this.day; ((st.boost && st.boost[tag]) || []).forEach(function (b) { if (b.until > day) for (var k in b.mods) m[k] = (m[k] || 0) + b.mods[k]; });
    return m;
  };
  function boost(tag, mods, days) { var l = S().boost[tag]; if (!Array.isArray(l)) l = S().boost[tag] = []; for (var i = l.length - 1; i >= 0; i--) if (l[i].until <= War.day) l.splice(i, 1); l.push({ mods: mods, until: War.day + days }); War.techVer++; }

  // ---------- the Continental System ----------
  War.inSystem = function (t) { var s = this.story; return !!(s && s.cs.on && s.cs.members[t]); };
  War.csJoin = function (t) { var s = this.story; if (!s.cs.on || !alive(t) || t === 'GBR' || this.atWar(t, 'FRA')) return; if (!s.cs.members[t]) { s.cs.members[t] = this.day; } };
  War.csLeave = function (t, quiet) {
    var s = this.story; if (!s.cs.members[t] || t === 'FRA') return; delete s.cs.members[t];
    goodwill('FRA', t, -30);
    if (!quiet) this.event('story', this.nations[t].short + ' leaves the Continental System and trades with Britain again', { a: t, b: 'FRA' });
  };
  War.csShare = function () {
    var s = this.story, P = this.econ.P, all = 0, shut = 0, self = this; if (!s || !s.cs.on) return 0;
    this.provs.forEach(function (p) { if (!(P[p.id].b.port > 0) || p.owner === 'GBR' || self.allied(p.owner, 'GBR')) return; all += P[p.id].b.port; if (s.cs.members[p.owner]) shut += P[p.id].b.port; });
    return all ? shut / all : 0;
  };
  var prevAccess = Econ.refreshAccess;
  Econ.refreshAccess = function () {
    prevAccess.call(this);
    var s = War.story; if (!s || !s.cs.on) return;
    var share = War.csShare(), self = this, smug = War.smuggling ? War.smuggling : function () { return 0; };
    if (this.N.GBR) this.N.GBR.access = Math.max(0.3, this.N.GBR.access * (1 - 0.45 * share * (1 - smug('GBR'))));
    Object.keys(s.cs.members).forEach(function (t) { var n = self.N[t]; if (n && t !== 'FRA') n.access = Math.max(0.3, n.access * (1 - 0.12 * (1 - smug(t)))); });
  };

  // ---------- EFFECTS: what a choice does, and how it says so ----------
  // txt: a string (or a function giving one, or null to stay quiet); run: makes it happen;
  // aiw (optional): how much this effect makes the computer like the choice (1 = no opinion)
  var MODS = { atk: 'attack', def: 'defence', spd: 'march speed', org: 'organisation', plan: 'battle planning', supply: 'less supply needed',
    attr: 'less attrition', ngun: 'naval gunnery', nspd: 'fleet speed', reinf: 'reinforcement', entr: 'entrenchment', fort: 'fortress strength',
    xpgain: 'army experience', mp: 'recruits each month', mpcap: 'recruit pool', factory: 'factory output', prodeff: 'production efficiency',
    cons: 'construction speed', regen: 'organisation recovery', brk: 'breakthrough' };
  function pct(v) { return (v >= 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + '%'; }
  function cash(v) { return (v >= 0 ? '+' : '−') + 'ƒ' + Math.round(Math.abs(v)).toLocaleString('en-US'); }
  function num(v) { return (v >= 0 ? '+' : '−') + Math.round(Math.abs(v)).toLocaleString('en-US'); }
  function dur(days) { return days >= 700 ? Math.round(days / 365) + ' years' : days >= 360 ? '1 year' : days >= 75 ? Math.round(days / 30) + ' months' : days + ' days'; }
  function list(names, max) { max = max || 4; if (names.length <= max) return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0] || ''; return names.slice(0, max).join(', ') + ' and ' + (names.length - max) + ' more'; }
  function T(x) { return typeof x === 'function' ? x() : x; }
  var E = {
    boost: function (tag, mods, days) { return { txt: function () { return nm(tag) + ': ' + Object.keys(mods).map(function (k) { return pct(mods[k]) + ' ' + (MODS[k] || k); }).join(', ') + ' for ' + dur(days); },
      run: function () { if (alive(tag)) boost(tag, mods, days); }, aiw: function () { var s = 0; for (var k in mods) s += mods[k]; return s > 0 ? 1.1 : 0.9; } }; },
    money: function (tag, v) { return { txt: function () { return nm(tag) + ': ' + cash(v) + ' in the treasury'; }, run: function () { if (War.econ.N[tag]) War.econ.N[tag].treasury += v; },
      aiw: function (who) { if (tag !== who) return 1; var t = War.econ.N[tag] ? War.econ.N[tag].treasury : 0; return v < 0 && t + v < 0 ? 0.1 : v > 0 ? 1.15 : 0.9; } }; },
    mp: function (tag, v) { return { txt: function () { return nm(tag) + ': ' + num(v) + ' recruits'; }, run: function () { if (War.M[tag]) War.M[tag].manpower = Math.max(0, War.M[tag].manpower + v); } }; },
    stab: function (tag, v) { return { txt: function () { return nm(tag) + ': ' + pct(v) + ' stability'; }, run: function () { if (War.shockStab) War.shockStab(tag, v); }, aiw: function (who) { return tag === who ? (v > 0 ? 1.1 : 0.85) : 1; } }; },
    ws: function (tag, v) { return { txt: function () { return nm(tag) + ': ' + pct(v) + ' war support'; }, run: function () { if (War.shockWs) War.shockWs(tag, v); } }; },
    pp: function (tag, v) { return { txt: function () { return nm(tag) + ': ' + num(v) + ' political power'; }, run: function () { if (War.pol && War.pol.N[tag]) War.pol.N[tag].pp = Math.max(0, War.pol.N[tag].pp + v); } }; },
    opinion: function (to, from, v) { return { txt: function () { return nm(to) + '’s opinion of ' + nm(from) + ' ' + num(v); }, run: function () { goodwill(to, from, v); } }; },
    war: function (a, b, why) { return { txt: function () { return nm(a) + ' declares war on ' + nm(b) + ' (their alliances join in)'; }, run: function () { war(a, b, why); },
      aiw: function (who) { if (who !== a) return 1; var o = odds(a, b); return Math.max(0.05, Math.min(2, o * o)); } }; },
    duel: function (a, b, why) { return { txt: function () { return nm(a) + ' declares war on ' + nm(b) + ' (just the two of them)'; }, run: function () { duel(a, b, why); },
      aiw: function (who) { if (who !== a) return 1; var o = War.fieldPower(a) / Math.max(1, War.fieldPower(b)); return Math.max(0.05, Math.min(2, o * o)); } }; },
    peace: function (a, b, txt) { return { txt: function () { return txt || 'Peace between ' + nm(a) + ' and ' + nm(b) + ' (occupied land goes back)'; }, run: function () { makePeace(a, b); } }; },
    join: function (tag, leader) { return { txt: function () { return nm(tag) + ' joins ' + nm(leader) + '’s side'; }, run: function () { joinSide(tag, leader); } }; },
    leave: function (tag) { return { txt: function () { return War.factionOf(tag) ? nm(tag) + ' leaves its alliance' : null; }, run: function () { leaveSide(tag); } }; },
    spawn: function (tag, where, n, str, what) { return { txt: function () { return nm(tag) + ': ' + n + ' new ' + (what || 'division') + (n > 1 ? 's' : '') + ' at ' + where; }, run: function () { spawnAt(tag, where, n, str); } }; },
    // land by treaty: names, or a function giving province ids; only from the listed owners, if given
    give: function (names, to, from, label) {
      function which() { var l = typeof names === 'function' ? names() : ids(names); return l.filter(function (id) { var p = War.provs[id]; return p && p.owner !== to && (!from || from.indexOf(p.owner) >= 0); }); }
      return { txt: function () { var l = which(); if (!l.length) return null; return nm(to) + ' gains ' + (label ? label + ' (' + l.length + ' province' + (l.length > 1 ? 's' : '') + ')' : list(l.map(function (id) { return War.provs[id].name; }))); },
        run: function () { give(which(), to); }, aiw: function (who) { return to === who ? 1.5 : 1; } };
    },
    rename: function (tag, name, short) { return { txt: function () { return nm(tag) + ' becomes the ' + name.replace(/^the /i, ''); }, run: function () { rename(tag, name, short); } }; },
    flag: function (f) { return { txt: null, run: function () { setFlag(f); } }; },
    unflag: function (f) { return { txt: null, run: function () { delete S().flags[f]; } }; },
    // the decision comes back in about `days`: the event is put off rather than decided
    later: function (id, days) { return { later: true, txt: 'This decision comes back in about ' + dur(days), run: function () { var s = S(); s.wait[id] = War.day + days; s.again[id] = (s.again[id] || 0) + 1; delete s.fired[id]; s.refire = s.refire || {}; s.refire[id] = true; }, aiw: function () { return 0.7; } }; },
    csJoin: function (t) { return { txt: function () { return S().cs.on ? nm(t) + ' joins the Continental System (no trade with Britain)' : null; }, run: function () { War.csJoin(t); } }; },
    csLeave: function (t) { return { txt: function () { return War.inSystem(t) ? nm(t) + ' leaves the Continental System' : null; }, run: function () { War.csLeave(t, true); } }; },
    say: function (txt, fn) { return { txt: txt, run: fn || function () { } }; },
    quiet: function (fn) { return { txt: null, run: fn }; },
    news: function (txt, a, b) { return { txt: null, run: function () { War.event('story', T(txt), { a: a, b: b }); } }; },
    // an army gathers on the enemy's border: `n` new contingents (or enough to face the enemy) and the idle divisions march there
    muster: function (tag, target, n, what) {
      function plan() {
        var st = zone(tag, target).st || stagingFor(tag, target), need = Math.max(0, 0.6 * powerAgainst(tag, target) - powerNear(tag, target));
        var per = 0, cnt = 0; War.divs.forEach(function (d) { if (d.tag === tag) { per += War.power(d, 'atk'); cnt++; } }); per = cnt ? per / cnt : 10;
        var k = n || Math.max(3, Math.min(14, Math.ceil(need * 0.5 / Math.max(1, per)))); k = Math.min(k, Math.floor((War.M[tag] ? War.M[tag].manpower : 0) / 6000));
        return { st: st, k: Math.max(0, k) };
      }
      return { txt: function () { var p = plan(); if (!p.st) return null; return nm(tag) + ': ' + (p.k ? p.k + ' new ' + (what || 'divisions') + ' gather at ' + p.st.name + ' (−' + (p.k * 6000).toLocaleString('en-US') + ' recruits), and ' : '') + 'every division not facing an enemy marches there'; },
        run: function () { var p = plan(); if (!p.st) return; if (p.k) { War.M[tag].manpower -= p.k * 6000; var tp = War.tplOfCls(tag, 'inf'); for (var i = 0; i < p.k; i++) { var d = War.spawn(tag, tp.id, p.st.id, 0.85); d.org = 0.7; } War.indexStacks(); if (War.refreshUpkeep) War.refreshUpkeep(); }
          sendTo(idleDivs(tag), p.st); } };
    },
    // bring the army home from a war zone: divisions in `zone`'s land march back to the staging area against `toward`
    recall: function (tag, zone, toward) { return { txt: function () { var n = War.divs.filter(function (d) { return d.tag === tag && War.provs[d.prov].owner === zone; }).length; return n ? nm(tag) + ': ' + n + ' divisions in ' + nm(zone) + ' march ' + (toward ? 'toward ' + nm(toward) : 'home') + ' by post road' : null; },
      run: function () { var st = toward ? stagingFor(tag, toward) : (War.capitalProv ? War.capitalProv(tag) : null); if (!st) return; sendTo(War.divs.filter(function (d) { return d.tag === tag && War.provs[d.prov].owner === zone && d.battle === null; }), st); } }; },
    // partisans: occupied land rises against the occupier
    resist: function (owner, occupier, v, txt) { return { txt: txt || function () { return 'Resistance flares in ' + nm(owner) + '’s land held by ' + nm(occupier); },
      run: function () { War.provs.forEach(function (p) { if (p.owner === owner && p.ctrl === occupier) War.resist[p.id] = Math.min(1, Math.max(War.resist[p.id] || 0, v)); }); } }; },
    // the enemy's divisions in someone's land are worn down (winter, hunger, burned villages)
    wear: function (land, enemyOf, orgTo, strLoss, txt) { return { txt: txt, run: function () { War.divs.forEach(function (d) { var p = War.provs[d.prov]; if (p.owner === land && War.atWar(d.tag, enemyOf)) { d.org = Math.min(d.org, orgTo); d.str = Math.max(0.1, d.str - strLoss); } }); } }; },
    when: function (test, eff) { return { txt: function () { return test() ? T(eff.txt) : null; }, run: function () { if (test()) eff.run(); }, aiw: eff.aiw }; }
  };
  // ---------- REQUIREMENTS: when a choice is possible ----------
  // ok(): true when met; txt(): what it needs (and where things stand); warn: only a warning, never blocks
  var R = {
    // the player must have the army in place; the computer's own generals march it there once war comes, so for it
    // the whole army against the enemy's is what counts
    ready: function (tag, target, need) { return { ok: function () { return tag === War.player ? War.readiness(tag, target) >= need : odds(tag, target) >= 0.8; },
      txt: function () { return 'An army near ' + nm(target) + ' ' + Math.round(need * 100) + '% as strong as what it would face (now ' + Math.round(War.readiness(tag, target) * 100) + '%)'; } }; },
    risk: function (tag, target) { return { warn: true, ok: function () { return odds(tag, target) >= 0.8; },
      txt: function () { var o = odds(tag, target); return o >= 0.8 ? 'Your side is ' + (o >= 1.2 ? 'stronger than' : 'about as strong as') + ' ' + nm(target) + '’s (' + Math.round(o * 100) + '%)' : 'Risky: your side has only ' + Math.round(o * 100) + '% of the strength ' + nm(target) + '’s side can field'; } }; },
    money: function (tag, v) { return { ok: function () { return War.econ.N[tag] && War.econ.N[tag].treasury >= v; }, txt: function () { return 'ƒ' + v.toLocaleString('en-US') + ' in the treasury (have ƒ' + Math.round(War.econ.N[tag] ? War.econ.N[tag].treasury : 0).toLocaleString('en-US') + ')'; } }; },
    mp: function (tag, v) { return { ok: function () { return War.M[tag] && War.M[tag].manpower >= v; }, txt: function () { return v.toLocaleString('en-US') + ' recruits (have ' + Math.round(War.M[tag] ? War.M[tag].manpower : 0).toLocaleString('en-US') + ')'; } }; },
    atWar: function (a, b) { return { ok: function () { return War.atWar(a, b); }, txt: function () { return nm(a) + ' at war with ' + nm(b); } }; },
    peace: function (a, b) { return { ok: function () { return !War.atWar(a, b); }, txt: function () { return nm(a) + ' at peace with ' + nm(b); } }; },
    alive: function (t) { return { ok: function () { return alive(t); }, txt: function () { return nm(t) + ' still exists'; } }; },
    holds: function (tag, name) { return { ok: function () { var p = prov(name); return !!p && p.ctrl === tag; }, txt: function () { return nm(tag) + ' holds ' + name; } }; },
    times: function (id, max) { return { ok: function () { return (S().again[id] || 0) < max; }, txt: function () { return 'Can be put off ' + max + ' times (' + (S().again[id] || 0) + ' so far)'; } }; },
    check: function (txt, fn, warn) { return { ok: fn, txt: txt, warn: !!warn }; }
  };

  // the state of each choice of an event: possible?, what it needs, what it does
  War.storyOptState = function (e) {
    return e.opts.map(function (o) {
      var need = (o.req || []).map(function (r) { var ok = false, t = ''; try { ok = !!r.ok(); } catch (x) { ok = false; } try { t = T(r.txt); } catch (x) { t = '?'; } return { txt: t, ok: ok, warn: !!r.warn }; });
      var fx = []; (o.eff || []).forEach(function (f) { var t = null; try { t = T(f.txt); } catch (x) { t = null; } if (t) fx.push(t); });
      if (o.note) fx.push(T(o.note));
      return { ok: need.every(function (r) { return r.ok || r.warn; }), need: need, fx: fx };
    });
  };
  function runOpt(o) {
    (o.eff || []).forEach(function (f) { try { f.run(); } catch (err) { if (root.console) console.warn('story effect failed', err); } });
    if (o.fx) o.fx();
  }

  // ---------- the events ----------
  // who: the nation that decides; from/until: the window; cond: what must be true; mtth: mean days to happen once possible
  // opts: { t: label, hist: what history did, ai: base weight for the computer, eff: [effects], req: [requirements] }
  var EV = [
    // The War of the Third Coalition
    { id: 'villeneuve', ch: 'The Third Coalition', title: 'Villeneuve ordered to sea', who: 'FRA', from: [1805, 9], until: [1806, 3], mtth: 25,
      cond: function () { return War.fleets.some(function (f) { return f.tag === 'FRA' && f.name === 'Combined Fleet' && f.inPort; }) && War.atWar('FRA', 'GBR'); },
      text: 'The Combined Fleet sits in Cádiz while the Emperor fumes. Admiral Villeneuve is told to put to sea and carry troops to Naples, Nelson or no Nelson.',
      expect: 'The Combined Fleet sails from Cádiz and meets Nelson (autumn 1805)',
      opts: [{ t: 'Sail for Naples', hist: true, ai: 2, eff: [E.say('The Combined Fleet leaves Cádiz to patrol off Gibraltar, ready for battle', function () { War.fleets.forEach(function (f) { if ((f.tag === 'FRA' || f.tag === 'SPA') && f.inPort && War.provs[f.base].name === 'Cádiz' && f.ships.length > 6) { f.org = 1; War.setMission(f, 'patrol', War.seaByKey.albo); } }); }), E.flag('villeneuve_sailed')] },
        { t: 'Stay in harbour', ai: 1, eff: [E.say('The fleet stays safe in Cádiz; Britain keeps the sea but France keeps its ships'), E.flag('villeneuve_stayed')] },
        { t: 'Break up into commerce raiders', ai: 1, eff: [E.money('GBR', -15000), E.boost('GBR', { factory: -0.05 }, 365), E.say('The fleet stays in port as a fleet, but frigates slip out to hunt merchantmen'), E.flag('villeneuve_stayed'), E.flag('raiders')] }] },
    { id: 'trafalgar', ch: 'The Third Coalition', title: 'England expects', who: 'GBR', from: [1805, 9], until: [1807, 1], mtth: 1,
      cond: function () { return (War.seaLog || []).some(function (r) { return r.winner === 'GBR' && (r.tags.indexOf('FRA') >= 0 || r.tags.indexOf('SPA') >= 0) && r.sunk[r.tags.indexOf('GBR') ? 0 : 1].length + r.taken[r.tags.indexOf('GBR') ? 0 : 1].length >= 6; }); },
      text: 'A great victory at sea. The enemy fleet is broken, and Britain rules the waves for a generation. The price was high: the admiral fell on his own quarterdeck.',
      expect: 'Britain wins a great sea battle against France and Spain',
      opts: [{ t: 'Mourn the hero and rule the waves', hist: true, ai: 1, eff: [E.flag('trafalgar'), E.say('Admiral Nelson dies in the hour of victory', function () { War.admirals.forEach(function (a) { if (a.name === 'Nelson') { if (a.fleet !== null) { var f = War.fleetById(a.fleet); if (f) f.adm = null; } a.fleet = null; a.dead = true; } }); War.admirals = War.admirals.filter(function (a) { return !a.dead; }); }), E.boost('GBR', { ngun: 0.1 }, 720), E.ws('GBR', 0.05)] }] },
    { id: 'trafalgar_fra', side: true, ch: 'The Third Coalition', title: 'Master of the Channel?', who: 'FRA', from: [1805, 9], until: [1808, 1], mtth: 1,
      cond: function () { return !flag('trafalgar') && (War.seaLog || []).some(function (r) { return r.winner === 'FRA' && r.tags.indexOf('GBR') >= 0 && r.sunk[r.tags.indexOf('GBR')].length + r.taken[r.tags.indexOf('GBR')].length >= 5; }); },
      text: 'Against all expectation the Royal Navy has been beaten. For a few weeks the Channel may be ours. The Army of England still waits at Boulogne.',
      expect: 'Only if France wins at sea: the invasion of England',
      opts: [{ t: 'Prepare the invasion of England', ai: 2, eff: [E.flag('invasion_england'), E.say('France: +60 transport convoys for the crossing', function () { War.NV.FRA.convoys += 60; }), E.boost('FRA', { ngun: 0.1 }, 365), E.stab('GBR', -0.08)] },
        { t: 'Turn east as planned', hist: true, ai: 1, eff: [E.boost('FRA', { spd: 0.1 }, 60)] }] },
    { id: 'ulm', ch: 'The Third Coalition', title: 'The march to the Danube', who: 'FRA', from: [1805, 9], until: [1806, 2], mtth: 12,
      cond: function () { return War.atWar('FRA', 'AUS'); },
      text: 'Seven corps of the Grande Armée wheel from the Channel coast to the Rhine in a few weeks. If they move fast enough, the Austrians at Ulm will be cut off before they know it.',
      expect: 'The Grande Armée marches fast against Austria (autumn 1805)',
      opts: [{ t: 'Forced marches!', hist: true, ai: 2, eff: [E.boost('FRA', { spd: 0.25, plan: 0.3 }, 60)] },
        { t: 'Advance with care', ai: 1, eff: [E.boost('FRA', { def: 0.15, attr: 0.2 }, 60)] },
        { t: 'Wait for the German allies to march with us', ai: 1, eff: [E.spawn('BAV', 'Munich', 2, 0.85), E.spawn('WUR', 'Stuttgart', 1, 0.85), E.boost('FRA', { def: 0.1 }, 60), E.opinion('BAV', 'FRA', 15)] }] },
    { id: 'austerlitz', ch: 'The Third Coalition', title: 'After the battle', who: 'AUS', from: [1805, 10], until: [1807, 6], mtth: 6,
      cond: function () { var b = S().bigWin; return War.atWar('AUS', 'FRA') && b && b.win === 'FRA' && (b.lose === 'AUS' || b.lose === 'RUS') && War.day - b.day < 60; },
      text: 'The allied army has been broken in a single day. The French are camped in our provinces and the Emperor Francis rides out to meet Napoleon by a windmill.',
      expect: 'A great French victory (an Austerlitz) brings Austria to terms',
      opts: [{ t: 'Seek an armistice', hist: true, ai: 2, eff: [E.say(function () { return 'Austria makes peace with France and pays an indemnity' + (S().mode === 'historical' ? '; Tyrol goes to Bavaria and Venice to the Kingdom of Italy (Treaty of Pressburg)' : '; France dictates the terms'); },
          function () { var t = War.peaceTerms('FRA', 'AUS'); if (S().mode === 'historical') { t.lots = []; t.gold = Math.max(t.gold, 40000); } War.dictatePeace(t); setFlag('yield:AUS:FRA'); if (S().mode === 'historical') pressburg(); })] },
        { t: 'The Archduke Charles is coming: fight on', ai: 1, eff: [E.boost('AUS', { def: 0.1 }, 90), E.ws('AUS', -0.05)] },
        { t: 'Fall back on Hungary and call the insurrectio', ai: 1, eff: [E.spawn('AUS', 'Buda', 3, 0.7, 'Hungarian levy'), E.mp('AUS', 40000), E.stab('AUS', -0.05)] }] },
    // The Confederation of the Rhine and the kingdoms
    { id: 'rhine', ch: 'The Grand Empire', title: 'The Confederation of the Rhine', who: 'FRA', from: [1806, 1], until: [1809, 12], mtth: 40,
      cond: function () { return yielded('AUS', 'FRA') && !War.atWar('FRA', 'AUS'); },
      text: 'The Holy Roman Empire is a thousand-year-old ghost. The German princes who stood by France could be gathered into a confederation under French protection, and given grander titles for their trouble.',
      expect: 'Once Austria yields to France: the Confederation of the Rhine (1806)',
      opts: [{ t: 'Found the Confederation', hist: true, ai: 2, eff: [E.say('Bavaria, Württemberg, Baden, Hesse, Nassau, Berg, Frankfurt and the Saxon duchies join France’s side, with royal titles', function () {
          ['BAV', 'WUR', 'BAD', 'HDA', 'NAS', 'BRG', 'FRK', 'THU'].forEach(function (t) { if (alive(t) && !War.atWar(t, 'FRA')) joinSide(t, 'FRA'); });
          rename('BAV', 'Kingdom of Bavaria'); rename('WUR', 'Kingdom of Württemberg'); rename('BAD', 'Grand Duchy of Baden'); rename('HDA', 'Grand Duchy of Hesse'); rename('BRG', 'Grand Duchy of Berg'); rename('FRK', 'Grand Duchy of Frankfurt');
          War.event('story', 'The Holy Roman Empire is dissolved; Francis is now Emperor of Austria alone', { a: 'AUS' }); }), E.flag('rhine'), E.opinion('PRU', 'FRA', -15), E.opinion('AUS', 'FRA', -10)] },
        { t: 'Annex the Rhineland outright', ai: 1, eff: [E.give(function () { return War.provs.filter(function (p) { return (p.owner === 'NAS' || p.owner === 'BRG' || p.owner === 'FRK') && !War.atWar(p.owner, 'FRA'); }).map(function (p) { return p.id; }); }, 'FRA', null, 'Nassau, Berg and Frankfurt'),
          E.opinion('BAV', 'FRA', -20), E.opinion('PRU', 'FRA', -25), E.flag('rhine_annexed')] },
        { t: 'Leave the German princes as they are', ai: 1, eff: [E.opinion('PRU', 'FRA', 10), E.opinion('AUS', 'FRA', 10)] }] },
    { id: 'holland', ch: 'The Grand Empire', title: 'A crown for Louis', who: 'FRA', from: [1806, 3], until: [1810, 1], mtth: 50,
      cond: function () { return alive('BAT') && War.allied('BAT', 'FRA'); },
      text: 'The Batavian Republic is a republic in name only. Your brother Louis could be its king, or the Dutch could simply become Frenchmen.',
      expect: 'The Batavian Republic becomes the Kingdom of Holland (1806)',
      opts: [{ t: 'Louis becomes King of Holland', hist: true, ai: 2, eff: [E.rename('BAT', 'Kingdom of Holland', 'Holland'), E.opinion('BAT', 'FRA', 20)] },
        { t: 'Annex Holland to France', ai: 1, eff: [E.give(function () { return War.provs.filter(function (p) { return p.owner === 'BAT' && !p.world; }).map(function (p) { return p.id; }); }, 'FRA', null, 'the Netherlands'), E.stab('FRA', -0.03)] }] },
    { id: 'prussia1806', ch: 'The Fourth Coalition', title: 'Prussia mobilises', who: 'PRU', from: [1806, 7], until: [1807, 12], mtth: 30,
      cond: function () { return !War.atWar('PRU', 'FRA') && (flag('rhine') || yielded('AUS', 'FRA')) && alive('PRU') && !War.allied('PRU', 'FRA'); },
      text: 'French troops march through Ansbach as if it were their own, and Napoleon has offered Hanover back to Britain behind our backs. The Queen and the war party demand that Prussia fight.',
      expect: 'Prussia goes to war with France (autumn 1806)',
      opts: [{ t: 'Send France an ultimatum and march', hist: true, ai: 2, req: [R.risk('PRU', 'FRA')], eff: [E.join('PRU', 'GBR'), E.war('PRU', 'FRA', 'Prussia declares war on France: the War of the Fourth Coalition'), E.flag('war1806'), E.ws('PRU', 0.1)] },
        { t: 'Stay neutral', ai: 1, eff: [E.opinion('FRA', 'PRU', 10), E.ws('PRU', -0.05), E.flag('pru_neutral')] },
        { t: 'Wait for the Russians, then march together', ai: 1, eff: [E.boost('PRU', { def: 0.1 }, 180), E.opinion('RUS', 'PRU', 20), E.flag('pru_waits'), E.later('prussia1806', 150)], req: [R.times('prussia1806', 1)] }] },
    { id: 'jena', ch: 'The Fourth Coalition', title: 'After Jena', who: 'PRU', from: [1806, 9], until: [1808, 6], mtth: 6,
      cond: function () { var b = S().bigWin; return War.atWar('PRU', 'FRA') && b && b.win === 'FRA' && b.lose === 'PRU' && War.day - b.day < 60 && War.warCondition('PRU').total >= 18; },
      text: 'The army of Frederick the Great has been routed in a single afternoon, and the fortresses are surrendering to French hussars. The court has fled east to Königsberg.',
      expect: 'A French victory in Prussia (a Jena) and the flight to Königsberg',
      opts: [{ t: 'Flee east and wait for the Russians', hist: true, ai: 2, eff: [E.boost('PRU', { def: 0.15 }, 120), E.flag('pru_fled')] },
        { t: 'Sue for peace now', ai: 1, eff: [E.say('France dictates the peace terms (land and gold)', function () { War.dictatePeace(War.peaceTerms('FRA', 'PRU')); setFlag('yield:PRU:FRA'); })] },
        { t: 'Raise new regiments in Silesia', ai: 1, eff: [E.spawn('PRU', 'Breslau', 3, 0.7), E.stab('PRU', -0.05), E.money('PRU', -8000)] }] },
    { id: 'berlin', ch: 'The Fourth Coalition', title: 'The Berlin Decree', who: 'FRA', from: [1806, 9], until: [1812, 1], mtth: 20,
      cond: function () { var b = prov('Berlin'); return War.atWar('FRA', 'GBR') && !S().cs.on && ((b && b.ctrl === 'FRA') || yielded('PRU', 'FRA') || flag('trafalgar')) && at(1806, 9); },
      text: 'Britain cannot be beaten at sea, so she must be beaten in her counting houses. Close every port in Europe to British goods and the nation of shopkeepers will beg for peace.',
      expect: 'France proclaims the Continental System (late 1806)',
      opts: [{ t: 'Proclaim the Continental System', hist: true, ai: 2, eff: [E.say('Every port France and its allies hold closes to British trade: Britain’s trade falls, and so does some of yours', function () { var s = S(); s.cs.on = true; War.csJoin('FRA'); War.allies('FRA').forEach(function (a) { War.csJoin(a); }); Object.keys(s.flags).forEach(function (f) { var m = /^yield:(\w+):FRA$/.exec(f); if (m && m[1] !== 'GBR') War.csJoin(m[1]); }); Econ.refreshAccess(); War.event('story', 'The Continental System: Europe\'s ports close to British trade', { a: 'FRA', b: 'GBR' }); })] },
        { t: 'Trade on as before', ai: 1, eff: [E.money('FRA', 15000), E.flag('no_blockade')] }] },
    { id: 'tilsit', ch: 'The Fourth Coalition', title: 'The raft at Tilsit', who: 'RUS', from: [1807, 1], until: [1809, 12], mtth: 20,
      cond: function () { return (yielded('RUS', 'FRA') && !War.atWar('RUS', 'FRA') && at(1807, 1)) || War.atWar('RUS', 'FRA') && (yielded('PRU', 'FRA') || War.warCondition('RUS').total >= 12 || (S().bigWin && S().bigWin.win === 'FRA' && S().bigWin.lose === 'RUS' && War.day - S().bigWin.day < 90)); },
      text: 'After Friedland the Tsar meets Napoleon on a raft in the Niemen. The Emperor is charming. Russia could make peace, join his blockade of Britain and divide Europe between them.',
      expect: 'Russia makes peace with France at Tilsit and joins the Continental System (1807)',
      opts: [{ t: 'Make peace and join the Continental System', hist: true, ai: 2, eff: [E.peace('FRA', 'RUS'), E.leave('RUS'), E.csJoin('RUS'),
          E.when(function () { return War.atWar('PRU', 'FRA') || yielded('PRU', 'FRA'); }, E.say('Prussia makes peace too, losing its Polish lands (to a Duchy of Warsaw) and the west (to a Kingdom of Westphalia)', function () { makePeace('FRA', 'PRU'); leaveSide('PRU'); setFlag('yield:PRU:FRA'); if (S().mode === 'historical' || alive('SAX')) tilsitMap(); War.csJoin('PRU'); })),
          E.opinion('FRA', 'RUS', 30), E.opinion('RUS', 'FRA', 20), E.flag('tilsit'), E.flag('yield:RUS:FRA'), E.news('The Treaties of Tilsit: Russia and France divide Europe', 'RUS', 'FRA')] },
        { t: 'Fight on', ai: 1, req: [R.check('Russia still at war with France', function () { return War.atWar('RUS', 'FRA'); })], eff: [E.boost('RUS', { def: 0.1 }, 120), E.ws('RUS', -0.05)] },
        { t: 'Make peace, but stay out of the blockade', ai: 1, eff: [E.peace('FRA', 'RUS'), E.leave('RUS'), E.opinion('FRA', 'RUS', -10), E.flag('yield:RUS:FRA'), E.flag('tilsit_cold')] }] },
    // Spain
    { id: 'bayonne', ch: 'The Peninsula', title: 'Trouble in Madrid', who: 'FRA', from: [1808, 1], until: [1811, 1], mtth: 40,
      cond: function () { return alive('SPA') && !War.atWar('FRA', 'SPA') && (War.allied('SPA', 'FRA') || S().mode === 'historical') && (flag('tilsit') || flag('tilsit_cold') || at(1808, 3)); },
      text: 'King Charles and his son Ferdinand are at each other\'s throats, and both have come to Bayonne begging for your help. Spain could be given a better king: your brother Joseph.',
      expect: 'Napoleon puts his brother Joseph on the Spanish throne (1808)',
      opts: [{ t: 'Joseph shall be King of Spain', hist: true, ai: 2, eff: [E.rename('SPA', 'Kingdom of Spain (Joseph I)'), E.flag('bayonne'), E.say('Spain will probably rise in revolt against the new king')] },
        { t: 'Back Ferdinand and make him a friend', ai: 1, eff: [E.opinion('SPA', 'FRA', 25), E.join('SPA', 'FRA'), E.flag('ferdinand_friend')] },
        { t: 'Leave the Bourbons in Madrid', ai: 1, eff: [E.opinion('SPA', 'FRA', 15)] }] },
    { id: 'dosdemayo', ch: 'The Peninsula', title: 'Dos de Mayo', who: 'SPA', from: [1808, 1], until: [1812, 1], mtth: 15,
      cond: function () { return flag('bayonne') && alive('SPA') && !War.atWar('SPA', 'FRA'); },
      text: 'Madrid has risen against the French. The juntas of the provinces refuse King Joseph, and the whole of Spain is taking up arms: priests, peasants, smugglers and all.',
      expect: 'Spain rises against Joseph and the French (May 1808)',
      opts: [{ t: 'Rise! Long live Ferdinand!', hist: true, ai: 2, req: [R.risk('SPA', 'FRA')], eff: [E.leave('SPA'), E.rename('SPA', 'Kingdom of Spain (Juntas)', 'Spain'), E.war('SPA', 'FRA', 'Dos de Mayo: Spain rises against France'),
          E.when(function () { return alive('GBR') && War.atWar('GBR', 'FRA'); }, E.join('SPA', 'GBR')), E.flag('peninsula'), E.resist('SPA', 'FRA', 0.6, 'Every Spanish province the French hold rises (resistance 60%)'), E.spawn('SPA', 'Seville', 4, 0.7), E.csLeave('SPA')] },
        { t: 'Accept King Joseph', ai: 1, eff: [E.opinion('SPA', 'FRA', -20), E.stab('SPA', -0.1), E.flag('joseph_accepted')] }] },
    // Austria again
    { id: 'aus1809', ch: 'The Fifth Coalition', title: 'Austria rearms', who: 'AUS', from: [1808, 10], until: [1810, 6], mtth: 30,
      cond: function () { return !War.atWar('AUS', 'FRA') && !War.allied('AUS', 'FRA') && (War.atWar('FRA', 'SPA') || at(1809, 3)) && alive('AUS') && War.M.AUS.count >= 15 && !(War.truce[War.key('AUS', 'FRA')] > War.day + 200); },
      text: 'With the best French troops tied down in Spain, the Archduke Charles has rebuilt the army and Count Stadion calls on all Germany to rise. This may be the moment.',
      expect: 'Austria tries again while France is busy in Spain (1809)',
      opts: [{ t: 'War for the liberation of Germany', hist: true, ai: 2, req: [R.risk('AUS', 'FRA')], eff: [E.join('AUS', 'GBR'), E.war('AUS', 'FRA', 'Austria declares war on France: the War of the Fifth Coalition'), E.ws('AUS', 0.1)] },
        { t: 'Not yet: another year of drill', ai: 1, req: [R.times('aus1809', 1)], eff: [E.boost('AUS', { org: 0.08, plan: 0.2 }, 540), E.later('aus1809', 300)] },
        { t: 'Make peace with Napoleon for good', ai: 1, eff: [E.opinion('FRA', 'AUS', 25), E.opinion('GBR', 'AUS', -20), E.flag('aus_peace_party')] }] },
    { id: 'schonbrunn', ch: 'The Fifth Coalition', title: 'After Wagram', who: 'AUS', from: [1809, 3], until: [1811, 6], mtth: 8,
      cond: function () { return War.atWar('AUS', 'FRA') && flag('yield:AUS:FRA') && War.warCondition('AUS').total >= 22; },
      text: 'Vienna has fallen a second time. The army is still in the field but cannot win. Peace will cost Salzburg, Galicia and the coast.',
      expect: 'A beaten Austria signs the Treaty of Schönbrunn (1809)',
      opts: [{ t: 'Sign the treaty', hist: true, ai: 2, eff: [E.peace('FRA', 'AUS'), E.leave('AUS'), E.give(['Trieste', 'Fiume', 'Pola', 'Villach', 'Klagenfurt'], 'FRA', ['AUS']), E.when(function () { return alive('BAV'); }, E.give(['Salzburg'], 'BAV')), E.csJoin('AUS'), E.flag('schonbrunn'), E.news('The Treaty of Schönbrunn: Austria cedes Illyria and joins the Continental System', 'AUS', 'FRA')] },
        { t: 'Fight on in Hungary', ai: 1, eff: [E.boost('AUS', { def: 0.1 }, 90), E.stab('AUS', -0.05)] }] },
    { id: 'marriage', ch: 'The Grand Empire', title: 'An imperial marriage', who: 'FRA', from: [1809, 10], until: [1812, 1], mtth: 40,
      cond: function () { return S().nap.state === 'emperor' && !War.atWar('FRA', 'AUS') && !War.atWar('FRA', 'RUS'); },
      text: 'The Empire needs an heir and Josephine cannot give one. The courts of Vienna and St Petersburg both have daughters. Whichever you choose will feel favoured, and the other insulted.',
      expect: 'Napoleon marries Marie-Louise of Austria (1810)',
      opts: [{ t: 'Marie-Louise of Austria', hist: true, ai: 2, eff: [E.opinion('AUS', 'FRA', 40), E.opinion('FRA', 'AUS', 40), E.opinion('RUS', 'FRA', -20), E.flag('marie_louise'), E.say('A royal marriage between France and Austria', function () { if (War.marry) War.marry('FRA', 'AUS', true); })] },
        { t: 'Anna Pavlovna of Russia', ai: 1, eff: [E.opinion('RUS', 'FRA', 40), E.opinion('FRA', 'RUS', 40), E.opinion('AUS', 'FRA', -15), E.flag('russian_bride'), E.say('A royal marriage between France and Russia (the Tsar will be slower to break with you)', function () { if (War.marry) War.marry('FRA', 'RUS', true); })] },
        { t: 'Stay with Josephine', ai: 1, eff: [E.stab('FRA', 0.03), E.flag('no_heir'), E.say('No heir: the Empire’s future stays uncertain')] }] },
    // 1812
    { id: 'ukase', ch: 'The Road to Moscow', title: 'The ukase of 1810', who: 'RUS', from: [1810, 6], until: [1812, 6], mtth: 40,
      cond: function () { return War.inSystem('RUS') && !flag('russian_bride'); },
      text: 'The blockade is ruining Russian merchants and landowners alike, and French troops in the Duchy of Warsaw are a pistol at our head. The Tsar can open the ports to neutral ships and tax French goods instead.',
      expect: 'Russia quits the Continental System (end of 1810)',
      opts: [{ t: 'Open the ports', hist: true, ai: 2, eff: [E.csLeave('RUS'), E.flag('ukase'), E.money('RUS', 20000), E.opinion('FRA', 'RUS', -30), E.say('France will probably come for Russia in a year or two')] },
        { t: 'Keep faith with France', ai: 1, eff: [E.opinion('FRA', 'RUS', 15), E.stab('RUS', -0.05)] }] },
    { id: 'russia1812', ch: 'The Road to Moscow', title: 'The Grande Armée gathers', who: 'FRA', from: [1812, 3], until: [1814, 1], mtth: 30,
      cond: function () { var c = War.warCondition('FRA'); return flag('ukase') && !War.atWar('FRA', 'RUS') && alive('RUS') && (War.player === 'FRA' || c.total < 15 || (S().mode === 'historical' && c.occ + c.cap < 10)); },   // history does not wait for France to feel rested
      text: function () { var r = War.readiness('FRA', 'RUS'), spain = War.atWar('FRA', 'SPA') ? divsIn('FRA', 'SPA') : 0;
        return 'The Tsar has broken his word. ' + (r >= 0.5 || War.player !== 'FRA' ? 'Six hundred thousand men from every nation of Europe are massing on the Niemen. One short campaign, a battle near the border, and he will come to heel.' : 'But the army is not where it needs to be: what France has near Russia\'s border is ' + Math.round(r * 100) + '% of what the Tsar can field' + (spain ? ', and ' + spain + ' divisions are tied down in Spain' : '') + '. An invasion now would be madness. The marshals ask for time to gather the army first.'); },
      expect: 'France invades Russia (June 1812)',
      opts: [{ t: 'Cross the Niemen', hist: true, ai: 2, req: [R.ready('FRA', 'RUS', 0.5)], eff: [E.war('FRA', 'RUS', 'France invades Russia'), E.flag('war1812'), E.boost('FRA', { spd: 0.1 }, 90), E.when(function () { return S().mode === 'historical'; }, E.boost('RUS', { def: 0.15 }, 540))] },
        { t: 'Gather the Grande Armée first', ai: 1, req: [R.times('russia1812', 3)], eff: [E.muster('FRA', 'RUS', 0, 'allied contingents (Poles, Germans, Italians)'), E.later('russia1812', 75)] },
        { t: 'Finish Spain first: give Ferdinand back his throne', ai: 1, req: [R.atWar('FRA', 'SPA'), R.times('russia1812', 3)], eff: [E.peace('FRA', 'SPA', 'Peace with Spain: Joseph leaves Madrid, Ferdinand returns, French-held Spain is handed back'),
          E.rename('SPA', 'Kingdom of Spain', 'Spain'), E.unflag('bayonne'), E.recall('FRA', 'SPA', 'RUS'), E.stab('FRA', -0.05), E.later('russia1812', 90)] },
        { t: 'Keep the peace with the Tsar', ai: 1, eff: [E.opinion('RUS', 'FRA', 20), E.opinion('FRA', 'RUS', 10), E.flag('no1812'), E.say('No invasion: Russia stays out of the Continental System, and Britain’s trade recovers a little')] }] },
    { id: 'moscow', side: true, ch: 'The Road to Moscow', title: 'Moscow burns', who: 'RUS', from: [1805, 9], until: [1820, 1], mtth: 3,
      cond: function () { var m = prov('Moscow'); return m && m.owner === 'RUS' && War.atWar('RUS', m.ctrl) && !flag('moscow'); },
      text: 'The enemy is in Moscow. The governor has emptied the city and his men wait with torches. Let the invader winter in ashes.',
      expect: 'If Moscow falls, the Russians burn it',
      opts: [{ t: 'Burn the city', hist: true, ai: 2, eff: [E.flag('moscow'), E.say('Moscow burns: 40% of its people are lost, resistance flares and every enemy division in the city is left exhausted', function () { var m = prov('Moscow'); War.resist[m.id] = 1; War.econ.P[m.id].pop = Math.round(War.econ.P[m.id].pop * 0.6); War.divs.forEach(function (d) { if (d.prov === m.id && d.tag !== 'RUS') { d.org = Math.min(d.org, 0.2); d.str = Math.max(0.1, d.str - 0.1); } }); }), E.boost('RUS', { def: 0.15 }, 180)] },
        { t: 'Defend it street by street', ai: 1, eff: [E.flag('moscow'), E.boost('RUS', { def: 0.1 }, 90), E.ws('RUS', 0.05)] },
        { t: 'Ask for terms', ai: 0.3, eff: [E.flag('moscow'), E.say(function () { var m = prov('Moscow'); return 'Russia makes peace with ' + (m ? nm(m.ctrl) : 'the invader') + ' (they dictate the terms)'; }, function () { var m = prov('Moscow'); if (m && War.atWar('RUS', m.ctrl)) War.dictatePeace(War.peaceTerms(m.ctrl, 'RUS')); }), E.stab('RUS', -0.15)] }] },
    { id: 'berezina', side: true, ch: 'The Road to Moscow', title: 'General Winter', who: 'FRA', from: [1812, 10], until: [1814, 1], mtth: 10,
      cond: function () { var w = War.year() % 1; return flag('war1812') && War.atWar('FRA', 'RUS') && War.day - S().flags.war1812 > 150 && (w > 0.8 || w < 0.2) && War.warCondition('RUS').total < 45 && divsIn('FRA', 'RUS') > 0; },
      text: 'The Russians would not make peace and would not stand. Now the snow has come. Horses die in their thousands, the roads are lined with the frozen and the Cossacks pick off stragglers. At the Berezina the last bridges are burning.',
      expect: 'If Russia holds out into the winter, the Grande Armée dies in the snow',
      opts: [{ t: 'Save what can be saved', hist: true, ai: 2, eff: [E.say(function () { return 'Every French and allied division in Russia falls to a third of its strength' + (S().mode === 'historical' && War.player !== 'FRA' ? '; France loses half its recruits' : ''); }, function () {
          var hist = S().mode === 'historical' && War.player !== 'FRA';
          War.divs.forEach(function (d) {
            if (d.tag !== 'FRA' && !War.allied(d.tag, 'FRA')) return;
            var p = War.provs[d.prov], inRussia = p.owner === 'RUS' || (p.ctrl === 'RUS');
            if (inRussia) { d.str = Math.max(0.05, d.str * 0.35); d.org = 0.05; }
            else if (hist && d.tag === 'FRA') { d.str = Math.max(0.1, d.str * 0.7); d.org = Math.min(d.org, 0.4); }
          });
          if (hist) { War.M.FRA.manpower = Math.round(War.M.FRA.manpower * 0.5); boost('FRA', { org: -0.1, atk: -0.1 }, 540); }
          War.event('story', 'The Grande Armée is destroyed in the Russian winter', { a: 'FRA', b: 'RUS' }); }), E.flag('berezina')] },
        { t: 'Winter in the captured towns', ai: 1, eff: [E.wear('RUS', 'RUS', 0.3, 0.25, 'Every French and allied division in Russia loses a quarter of its men, but keeps its ground'), E.boost('FRA', { attr: 0.2 }, 120), E.flag('berezina'), E.flag('wintered')] }] },
    { id: 'tauroggen', ch: 'The Sixth Coalition', title: 'The Convention of Tauroggen', who: 'PRU', from: [1812, 10], until: [1814, 6], mtth: 25,
      cond: function () { return flag('war1812') && War.atWar('FRA', 'RUS') && !War.atWar('PRU', 'FRA') && alive('PRU') && (War.warCondition('FRA').total >= 8 || divsIn('FRA', 'RUS') < 8); },
      text: 'General Yorck has signed his own truce with the Russians. The country is seething. Scharnhorst\'s reformed army and the new Landwehr are ready, and the King is being dragged towards war.',
      expect: 'Prussia rises against France after the retreat from Moscow (1813)',
      opts: [{ t: 'To my people! War on France', hist: true, ai: 2, req: [R.risk('PRU', 'FRA')], eff: [E.join('PRU', 'RUS'), E.war('PRU', 'FRA', 'Prussia rises against France: the War of the Sixth Coalition'), E.spawn('PRU', 'Breslau', 4, 0.8), E.csLeave('PRU'), E.flag('war1813'), E.ws('PRU', 0.15)] },
        { t: 'Stay loyal to France', ai: 1, eff: [E.opinion('FRA', 'PRU', 20), E.stab('PRU', -0.1), E.flag('pru_loyal')] },
        { t: 'Disown Yorck, but arm in secret', ai: 1, req: [R.times('tauroggen', 1)], eff: [E.mp('PRU', 50000), E.later('tauroggen', 120)] }] },
    { id: 'aus1813', ch: 'The Sixth Coalition', title: 'Metternich chooses', who: 'AUS', from: [1813, 3], until: [1814, 12], mtth: 30,
      cond: function () { return (flag('war1813') || flag('berezina')) && War.atWar('FRA', 'PRU') && !War.atWar('AUS', 'FRA') && alive('AUS'); },   // Prussia may already be in the field when the Grande Armée dies
      text: 'Napoleon refuses every compromise Metternich offers. Austria holds the balance: join the coalition, or let Prussia and Russia fight it out alone.',
      expect: 'Austria joins the Sixth Coalition (August 1813)',
      opts: [{ t: 'Join the coalition', hist: true, ai: 2, req: [R.risk('AUS', 'FRA')], eff: [E.join('AUS', 'RUS'), E.war('AUS', 'FRA', 'Austria joins the Sixth Coalition'), E.csLeave('AUS')] },
        { t: 'Armed mediation: name a price for peace', ai: 1, req: [R.times('aus1813', 1)], eff: [E.boost('AUS', { def: 0.1 }, 180), E.opinion('FRA', 'AUS', 10), E.later('aus1813', 90)] },
        { t: 'Stay out (the Emperor is our son-in-law)', ai: 1, eff: [E.opinion('FRA', 'AUS', 20), E.opinion('RUS', 'AUS', -20)] }] },
    { id: 'trachenberg', ch: 'The Sixth Coalition', title: 'The Trachenberg Plan', who: 'RUS', from: [1813, 3], until: [1815, 1], mtth: 15,
      cond: function () { return War.atWar('RUS', 'FRA') && (War.atWar('PRU', 'FRA') || War.atWar('AUS', 'FRA')) && S().nap.state === 'emperor'; },
      text: 'At Trachenberg the allied commanders agree a simple plan: never fight Napoleon himself, beat his marshals one by one, and close in from three sides. Bernadotte, once a French marshal, now Crown Prince of Sweden, offers to lead the northern army.',
      expect: 'The allies combine against France and Sweden joins them (1813)',
      opts: [{ t: 'Adopt the plan', hist: true, ai: 2, eff: [E.when(function () { return alive('SWE') && !War.atWar('SWE', 'FRA'); }, E.say('Sweden joins the war on France under Bernadotte', function () { joinSide('SWE', 'RUS'); war('SWE', 'FRA', 'Sweden joins the Sixth Coalition under Bernadotte'); })),
          E.say('Every great power at war with France: +15% attack, +10% defence for 18 months', function () { ['RUS', 'PRU', 'AUS', 'SWE', 'GBR'].forEach(function (t) { if (alive(t) && War.atWar(t, 'FRA')) boost(t, { atk: 0.15, def: 0.1 }, 540); }); }), E.flag('trachenberg')] },
        { t: 'Every army fights its own war', ai: 1, eff: [E.boost('RUS', { atk: 0.1 }, 365)] }] },
    { id: 'leipzig', ch: 'The Sixth Coalition', title: 'The Battle of the Nations', who: 'FRA', from: [1813, 6], until: [1815, 6], mtth: 20,
      cond: function () { return flag('trachenberg') && War.enemies('FRA').filter(function (t) { return War.nations[t].major; }).length >= 3 && S().nap.state === 'emperor'; },
      text: 'Half a million men are closing on Leipzig from every side. The Saxons are wavering, the conscripts of 1814 are boys, and the Empire has been at war for twenty years.',
      expect: 'Too many enemies at once: the Empire bleeds (1813)',
      opts: [{ t: 'Call up the boys of 1815', hist: true, ai: 2, eff: [E.flag('leipzig'), E.mp('FRA', 150000), E.boost('FRA', { org: -0.1 }, 365), E.stab('FRA', -0.05),
          E.when(function () { return S().mode === 'historical' && War.player !== 'FRA'; }, E.say('The German allies desert France', function () { ['SAX', 'BAV', 'WUR', 'BAD', 'HDA'].forEach(function (a) { if (alive(a) && War.allied(a, 'FRA') && a !== War.player) { leaveSide(a); makePeace(a, War.enemies('FRA')[0] || 'RUS'); } }); }))] },
        { t: 'Fall back to the Rhine', ai: 1, eff: [E.flag('leipzig'), E.boost('FRA', { def: 0.2 }, 365), E.say('France gives up Germany: the small German allies leave its side', function () { War.allies('FRA').forEach(function (a) { if (War.nations[a] && !War.nations[a].major && a !== 'ITA' && a !== 'BAT') leaveSide(a); }); })] },
        { t: 'Offer the allies the natural frontiers', ai: 1, eff: [E.flag('leipzig'), E.flag('frankfurt_offer'), E.ws('FRA', -0.1), E.say('France offers peace on the Rhine, Alps and Pyrenees; the allies may accept if they are tired', function () { War.enemies('FRA').forEach(function (e) { if (War.warCondition(e).total >= 20 && rnd(War) < 0.5) makePeace('FRA', e); }); })] }] },
    // The end of the Empire, or not
    { id: 'abdication', side: true, ch: 'The Fall of the Empire', title: 'The Marshals\' revolt', who: 'FRA', from: [1805, 9], until: [1830, 1], mtth: 10,
      cond: function () { var p = prov('Paris'); var c = War.warCondition('FRA').total; return S().nap.state === 'emperor' && !flag('hundred') && (War.atWar('FRA', p.ctrl) || c >= 55 || (S().mode === 'historical' && War.player !== 'FRA' && flag('leipzig') && at(1814, 1) && (c >= 25 || (c >= 18 && War.M.FRA.manpower < 8000)) && War.enemies('FRA').filter(function (t) { return War.nations[t].major; }).length >= 3)); },
      text: 'The allies are at the gates of Paris and the marshals will not march again. Ney tells the Emperor to his face that the army will obey its generals.',
      expect: 'When Paris falls or France is ruined: Napoleon abdicates and goes to Elba',
      opts: [{ t: 'Abdicate. Exile to Elba', hist: true, ai: 2, eff: [E.say('Napoleon goes to Elba; the Bourbons return as Kings of France; peace with everyone; the Continental System ends', function () {
          sideline('elba'); setFlag('elba'); S().nap.left = War.day; rename('FRA', 'Kingdom of France', 'France');
          War.enemies('FRA').forEach(function (e) { makePeace('FRA', e); }); leaveSide('FRA'); var s = S(); s.cs.on = false; s.cs.members = {};
          War.event('surrender', 'Napoleon abdicates; the Bourbons return to Paris', { a: 'FRA' }); })] },
        { t: 'Abdicate for your son, the King of Rome', ai: 1, req: [R.check('Married Marie-Louise (an heir)', function () { return flag('marie_louise'); })], eff: [E.say('Napoleon goes to Elba but his son reigns under a regency: France keeps the Empire, makes peace with everyone, loses its allies', function () {
          sideline('elba'); setFlag('elba'); setFlag('regency'); S().nap.left = War.day; rename('FRA', 'French Empire (Regency)', 'France');
          War.enemies('FRA').forEach(function (e) { makePeace('FRA', e); }); leaveSide('FRA'); var s = S(); s.cs.on = false; s.cs.members = {};
          War.event('surrender', 'Napoleon abdicates in favour of his son; Marie-Louise is regent', { a: 'FRA' }); }), E.opinion('AUS', 'FRA', 20)] },
        { t: 'Fight to the last', ai: 1, eff: [E.boost('FRA', { def: 0.2 }, 60), E.stab('FRA', -0.1)] }] },
    { id: 'hundreddays', side: true, ch: 'The Fall of the Empire', title: 'The flight of the eagle', who: 'FRA', from: [1805, 9], until: [1830, 1], mtth: 60,
      cond: function () { var n = S().nap; return n.state === 'elba' && War.day - (n.left || 0) > 240 && !War.atWarAny('FRA'); },
      text: 'Napoleon has landed at Golfe-Juan with a thousand men. The regiments sent to stop him are going over one by one. In twenty days he will be in Paris.',
      expect: 'From Elba, the Hundred Days',
      opts: [{ t: 'Vive l\'Empereur! The Hundred Days', hist: true, ai: 2, eff: [E.say('Napoleon is back in command of France', function () { bringBack(); rename('FRA', 'French Empire', 'France'); }), E.flag('hundred'), E.spawn('FRA', 'Paris', 8, 0.9),
          E.say('Britain, Prussia, Austria and Russia all declare war on France (the Seventh Coalition)', function () { ['GBR', 'PRU', 'AUS', 'RUS'].forEach(function (t) { if (alive(t)) war(t, 'FRA', War.nations[t].short + ' declares war on Napoleon: the Seventh Coalition'); }); ['PRU', 'AUS', 'RUS'].forEach(function (t) { if (alive(t)) joinSide(t, 'GBR'); }); })] },
        { t: 'Stay on Elba', ai: 1, eff: [E.flag('stay_elba'), E.say('Napoleon lives out his days on Elba; the story of the Empire is over')] }] },
    { id: 'sthelena', side: true, ch: 'The Fall of the Empire', title: 'Saint Helena', who: 'FRA', from: [1805, 9], until: [1830, 1], mtth: 8,
      cond: function () { var n = S().nap; if (!flag('hundred') || n.state !== 'emperor') return false; var b = S().bigWin, since = War.day - S().flags.hundred, hist = S().mode === 'historical' && War.player !== 'FRA';
        return War.atWar('FRA', prov('Paris').ctrl) || War.warCondition('FRA').total >= 40 || (hist && ((b && b.lose === 'FRA' && b.day > S().flags.hundred && since > 60) || since > 240)); },
      text: 'The last army is gone. This time the allies will take no chances: a rock in the South Atlantic, a thousand miles from anywhere.',
      expect: 'If the Hundred Days fail: Saint Helena',
      opts: [{ t: 'Surrender to the British', hist: true, ai: 1, eff: [E.say('Napoleon is exiled to Saint Helena; the Bourbons return; peace with everyone', function () { sideline('helena'); setFlag('helena'); rename('FRA', 'Kingdom of France', 'France'); War.enemies('FRA').forEach(function (e) { makePeace('FRA', e); }); })] }] },
    { id: 'vienna', ch: 'The Fall of the Empire', title: 'The Congress of Vienna', who: 'AUS', from: [1813, 1], until: [1830, 1], mtth: 20,
      cond: function () { return (flag('elba') || flag('helena')) && !War.atWar('FRA', 'AUS') && !flag('vienna') && !(S().nap.state === 'emperor' && flag('hundred') && !flag('helena')); },
      text: 'Kings, ministers and their wives have come to Vienna to dance and to redraw the map of Europe. The princes Napoleon dispossessed want their lands back; the victors want their reward.',
      expect: 'After Napoleon\'s fall: the Congress of Vienna redraws Europe',
      opts: [{ t: 'Restore the old order', hist: true, ai: 2, eff: [E.say('Every province France and its client kingdoms took goes back to its old ruler; the great powers keep the peace for five years', function () { congress(); })] },
        { t: 'Reward the victors, not the old princes', ai: 1, eff: [E.say('Land France took goes back only to the great powers that beat it; the rest stays where it is; peace for five years', function () { congress(true); })] }] },
    // When history goes the other way
    { id: 'pax', ch: 'Another History', title: 'Peace with the Empire?', who: 'GBR', from: [1807, 1], until: [1830, 1], mtth: 40,
      cond: function () { return War.atWar('GBR', 'FRA') && S().nap.state === 'emperor' && (yieldedSince('RUS', 'FRA', 'war1812') || War.factionOf('FRA') && War.factionOf('FRA').members.length >= 10) && War.allies('GBR').filter(function (a) { return War.atWar(a, 'FRA'); }).length === 0; },
      text: 'Britain stands alone. Every port from Lisbon to St Petersburg is shut, the Funds are falling and the City wants peace. The Whigs say a peace with Bonaparte would be no worse than this endless war.',
      expect: 'Only if France beats every ally: Britain makes peace with the Empire',
      opts: [{ t: 'Make peace with France', ai: 1, eff: [E.peace('GBR', 'FRA'), E.flag('pax'), E.news('The Peace of London: Britain accepts the Grand Empire', 'GBR', 'FRA')] },
        { t: 'Never! Fight on alone', hist: true, ai: 2, eff: [E.boost('GBR', { def: 0.1 }, 365), E.money('GBR', -20000)] }] },
    { id: 'fallen_early', ch: 'Another History', title: 'The Emperor\'s throne trembles', who: 'FRA', from: [1805, 9], until: [1812, 1], mtth: 30,
      cond: function () { return S().nap.state === 'emperor' && (flag('yield:FRA:AUS') || flag('yield:FRA:PRU') || flag('yield:FRA:RUS') || flag('yield:FRA:GBR')) && !flag('trembles'); },
      text: 'France has been forced to sign a humiliating peace. Fouché and Talleyrand are whispering with royalists, and the Senate wonders whether it backed the wrong man.',
      expect: 'Only if France loses a war early: plots against Napoleon',
      opts: [{ t: 'Purge the plotters', ai: 2, eff: [E.flag('trembles'), E.stab('FRA', 0.05), E.pp('FRA', -40), E.boost('FRA', { def: 0.05 }, 180)] },
        { t: 'Win them back with a new war', ai: 1, eff: [E.flag('trembles'), E.boost('FRA', { atk: 0.15 }, 365), E.ws('FRA', 0.1)] },
        { t: 'Grant a constitution', ai: 1, eff: [E.flag('trembles'), E.flag('fra_constitution'), E.stab('FRA', 0.1), E.ws('FRA', -0.05), E.opinion('GBR', 'FRA', 15)] }] },
    { id: 'grand_empire', ch: 'Another History', title: 'The Grand Empire', who: 'FRA', from: [1812, 6], until: [1830, 1], mtth: 30,
      cond: function () { return S().nap.state === 'emperor' && yieldedSince('RUS', 'FRA', 'war1812') && !flag('grand'); },
      text: 'The Tsar has signed a second peace and Europe from Cádiz to the Vistula answers to Paris. The question now is what to make of it: a family of kingdoms, or one Empire.',
      expect: 'Only if France beats Russia in 1812: the Grand Empire',
      opts: [{ t: 'A family of kingdoms', ai: 1, eff: [E.flag('grand'), E.say('Every ally of France: opinion of France +30', function () { War.allies('FRA').forEach(function (a) { goodwill(a, 'FRA', 30); }); })] },
        { t: 'One Empire', ai: 2, eff: [E.flag('grand'), E.boost('FRA', { atk: 0.1, def: 0.1 }, 3650), E.stab('FRA', -0.05)] }] },
    // ---------- the wider world ----------
    { id: 'braganza', ch: 'The Wider World', title: 'The court sails for Brazil', who: 'POR', from: [1807, 9], until: [1812, 1], mtth: 10,
      cond: function () { var l = prov('Lisbon'), r = prov('Rio de Janeiro'); return alive('POR') && l && r && r.owner === 'POR' && War.nations.POR.capital === 'Lisbon' && War.atWarAny('POR') && (l.ctrl !== 'POR' || l.adj.some(function (j) { return War.atWar('POR', War.provs[j].ctrl); })); },
      text: 'The enemy is at the gates of Lisbon. A British squadron waits in the Tagus, and the Prince Regent can still carry the court, the treasury and the archives across the ocean to Rio de Janeiro.',
      expect: 'If Lisbon is threatened, the Portuguese court sails for Brazil (1807)',
      opts: [{ t: 'Sail for Rio: the kingdom lives on in Brazil', hist: true, ai: 3, eff: [E.say('The capital moves to Rio de Janeiro', function () { War.nations.POR.capital = 'Rio de Janeiro'; War.nations.POR.lostCapital = true; War.afterPeace(); }), E.flag('braganza'), E.rename('POR', 'Kingdom of Portugal and Brazil', 'Portugal'), E.spawn('POR', 'Rio de Janeiro', 2, 0.8)] },
        { t: 'Stay and share the fate of Lisbon', ai: 1, eff: [E.opinion('POR', 'GBR', -10), E.boost('POR', { def: 0.15 }, 120)] }] },
    { id: 'madison', ch: 'The Wider World', title: 'Mr Madison\'s war', who: 'USA', from: [1812, 4], until: [1814, 6], mtth: 40,
      cond: function () { return alive('USA') && alive('GBR') && !War.atWar('USA', 'GBR') && !War.allied('USA', 'GBR') && (!flag('orders_repealed') || S().mode === 'historical') && (War.atWar('GBR', 'FRA') || S().mode === 'historical') && !!(War.com && War.com.press.GBR); },
      text: 'British frigates stop our ships and press our seamen within sight of our own coast, and British agents arm the tribes of the north-west. The War Hawks in Congress say Canada is ours for the marching.',
      expect: 'The United States declare war on Britain over impressment (June 1812)',
      opts: [{ t: 'Free trade and sailors\' rights! War with Britain', hist: true, ai: 2, req: [R.risk('USA', 'GBR')], eff: [E.flag('war1812us'), E.duel('USA', 'GBR', 'The United States declare war on Britain'),
          E.when(function () { return alive('TEC') && !flag('tec_treaty') && !War.atWar('TEC', 'GBR') && !War.atWar('TEC', 'USA'); }, E.say('Tecumseh’s confederacy takes up arms beside the British', function () { duel('TEC', 'USA', 'Tecumseh\'s confederacy takes up the hatchet beside the British'); })),
          E.spawn('USA', 'Washington', 2, 0.6, 'volunteer division'), E.ws('USA', 0.15)] },
        { t: 'Peace and neutral trade', ai: 1, eff: [E.opinion('USA', 'GBR', 10), E.money('USA', 6000), E.ws('USA', -0.05)] }] },
    { id: 'ghent', ch: 'The Wider World', title: 'The Peace of Ghent', who: 'USA', from: [1814, 6], until: [1817, 1], mtth: 60,
      cond: function () { return flag('war1812us') && War.atWar('USA', 'GBR') && Math.abs(War.warScore('USA', 'GBR')) < 25; },
      text: 'Washington has burned and so has York; neither side can win. The commissioners at Ghent propose to put everything back as it was.',
      expect: 'Britain and the United States make peace with nothing changed (December 1814)',
      opts: [{ t: 'Sign: borders as before the war', hist: true, ai: 3, eff: [E.peace('USA', 'GBR'), E.flag('ghent'), E.stab('USA', 0.05)] },
        { t: 'Fight on for Canada', ai: 1, eff: [E.ws('USA', -0.1), E.boost('USA', { atk: 0.1 }, 180)] }] },
    { id: 'mayo', ch: 'The Wider World', title: 'The May Revolution', who: 'SPA', from: [1810, 5], until: [1826, 1], mtth: 40,
      cond: function () { var b = prov('Buenos Aires'); return alive('SPA') && b && b.owner === 'SPA' && (flag('peninsula') || flag('bayonne') || at(1814, 1)); },
      text: 'With the King a prisoner and the French in Seville, the town council of Buenos Aires has deposed the viceroy and set up a junta of its own. The River Plate will not be governed from Spain again.',
      expect: 'Buenos Aires throws off Spanish rule (May 1810)',
      opts: [{ t: 'Send what troops we can against the rebels', hist: true, ai: 2, eff: [libText('ARG', ['AR', 'UY']), E.say('…and Spain goes to war with them', function () { if (liberate('ARG', 'SPA', ['AR', 'UY'], 3)) { setFlag('mayo'); war('ARG', 'SPA', 'The United Provinces of the River Plate rise against Spain'); } })] },
        { t: 'Recognise the junta and keep its trade', ai: 1, eff: [libText('ARG', ['AR', 'UY']), E.say('…peacefully, and they stay friendly', function () { if (liberate('ARG', 'SPA', ['AR', 'UY'], 3)) { setFlag('mayo'); goodwill('ARG', 'SPA', 30); } }), E.money('SPA', 10000)] }] },
    { id: 'paraguay', ch: 'The Wider World', title: 'Paraguay goes its own way', who: 'SPA', from: [1811, 5], until: [1826, 1], mtth: 40,
      cond: function () { var a = prov('Asunción'); return flag('mayo') && alive('SPA') && a && a.owner === 'SPA'; },
      text: 'Asunción has refused both the junta of Buenos Aires and the governor from Spain. Doctor Francia means to shut the country up like a walled garden.',
      expect: 'Paraguay declares independence (1811)',
      opts: [{ t: 'Let it go: there is no army to send', hist: true, ai: 2, eff: [libText('PAR', ['PY']), E.quiet(function () { liberate('PAR', 'SPA', ['PY'], 2); })] },
        { t: 'Hold Asunción for the Crown', ai: 0.5, eff: [libText('PAR', ['PY']), E.say('…and Spain fights to win it back', function () { if (liberate('PAR', 'SPA', ['PY'], 2)) war('PAR', 'SPA', 'Paraguay rises against Spain'); })] }] },
    { id: 'chacabuco', ch: 'The Wider World', title: 'The Army of the Andes', who: 'SPA', from: [1817, 1], until: [1828, 1], mtth: 40,
      cond: function () { var c = prov('Santiago de Chile'); return alive('ARG') && alive('SPA') && c && c.owner === 'SPA'; },
      text: 'San Martín has brought an army over the passes of the Andes, guns and all, and come down on the royalists at Chacabuco. Santiago has opened its gates to him and to O\'Higgins.',
      expect: 'San Martín crosses the Andes and frees Chile (1817)',
      opts: [{ t: 'Fight for Chile', hist: true, ai: 2, eff: [libText('CHL', ['CL']), E.say('…and Spain fights on against Chile and Argentina', function () { if (liberate('CHL', 'SPA', ['CL'], 3)) { war('CHL', 'SPA', 'Chile rises against Spain'); joinSide('CHL', 'ARG'); } })] },
        { t: 'Give Chile up', ai: 1, eff: [libText('CHL', ['CL']), E.quiet(function () { liberate('CHL', 'SPA', ['CL'], 3); })] }] },
    { id: 'boyaca', ch: 'The Wider World', title: 'Bolívar at Boyacá', who: 'SPA', from: [1819, 8], until: [1830, 1], mtth: 40,
      cond: function () { var b = prov('Santa Fe de Bogotá'); return alive('SPA') && b && b.owner === 'SPA' && (flag('mayo') || at(1822, 1)); },
      text: 'Bolívar has marched from the flooded plains over the freezing páramo and destroyed the royal army at the bridge of Boyacá. Bogotá is his, and he proclaims one great republic: Colombia.',
      expect: 'Bolívar frees New Granada and founds Gran Colombia (1819)',
      opts: [{ t: 'Fight for New Granada', hist: true, ai: 2, eff: [libText('GCO', ['CO', 'VE', 'EC', 'PA']), E.say('…and Spain fights on', function () { if (liberate('GCO', 'SPA', ['CO', 'VE', 'EC', 'PA'], 4)) war('GCO', 'SPA', 'Gran Colombia rises against Spain'); })] },
        { t: 'Treat with the Liberator', ai: 1, eff: [libText('GCO', ['CO', 'VE', 'EC', 'PA']), E.quiet(function () { liberate('GCO', 'SPA', ['CO', 'VE', 'EC', 'PA'], 4); })] }] },
    { id: 'iguala', ch: 'The Wider World', title: 'The Plan of Iguala', who: 'SPA', from: [1821, 2], until: [1832, 1], mtth: 40,
      cond: function () { var m = prov('Mexico'); return alive('SPA') && m && m.owner === 'SPA' && (flag('mayo') || at(1824, 1)); },
      text: 'The royalist colonel Iturbide has gone over to the insurgents he was sent to destroy. Their plan offers independence, the Church and equality, and almost every garrison in New Spain has declared for it.',
      expect: 'Mexico wins its independence (1821)',
      opts: [{ t: 'Hold Veracruz and fight on', hist: true, ai: 1, eff: [libText('MEX', ['MX', 'GT', 'SV', 'HN', 'NI', 'CR', 'US'], mexTest), E.say('…and Spain fights on', function () { if (liberate('MEX', 'SPA', ['MX', 'GT', 'SV', 'HN', 'NI', 'CR', 'US'], 5, mexTest)) war('MEX', 'SPA', 'Mexico rises against Spain'); })] },
        { t: 'Sign the treaty of Córdoba', ai: 2, eff: [libText('MEX', ['MX', 'GT', 'SV', 'HN', 'NI', 'CR', 'US'], mexTest), E.quiet(function () { liberate('MEX', 'SPA', ['MX', 'GT', 'SV', 'HN', 'NI', 'CR', 'US'], 5, mexTest); })] }] },
    { id: 'ayacucho', ch: 'The Wider World', title: 'The last viceroy', who: 'SPA', from: [1821, 7], until: [1834, 1], mtth: 60,
      cond: function () { var l = prov('Lima'); return alive('SPA') && l && l.owner === 'SPA' && (alive('CHL') || alive('GCO')); },
      text: 'San Martín has landed from the sea and Bolívar is coming down from the north. Lima has declared for independence, and the last royal army in America has taken to the mountains.',
      expect: 'Peru, the last Spanish stronghold on the mainland, declares independence (1821)',
      opts: [{ t: 'Defend the mountains to the end', hist: true, ai: 2, eff: [libText('PEU', ['PE', 'BO']), E.say('…and Spain fights on', function () { if (liberate('PEU', 'SPA', ['PE', 'BO'], 3)) war('PEU', 'SPA', 'Peru rises against Spain'); })] },
        { t: 'Sail home', ai: 1, eff: [libText('PEU', ['PE', 'BO']), E.quiet(function () { liberate('PEU', 'SPA', ['PE', 'BO'], 3); })] }] },
    { id: 'ipiranga', ch: 'The Wider World', title: 'Independence or death!', who: 'POR', from: [1822, 9], until: [1834, 1], mtth: 40,
      cond: function () { var r = prov('Rio de Janeiro'), l = prov('Lisbon'); return alive('POR') && r && r.owner === 'POR' && l && l.owner === 'POR' && l.ctrl === 'POR'; },
      text: 'The Cortes in Lisbon want Brazil a colony again. On the banks of the Ipiranga the Prince Regent Pedro has torn the Portuguese colours from his uniform: Brazil shall be an empire of its own.',
      expect: 'Brazil becomes an independent empire under Pedro I (1822)',
      opts: [{ t: 'Let our son keep his crown', hist: true, ai: 3, eff: [libText('BRZ', ['BR'], null, 'POR'), E.quiet(function () { if (liberate('BRZ', 'POR', ['BR'], 5)) { if (War.nations.POR.capital !== 'Lisbon') { War.nations.POR.capital = 'Lisbon'; rename('POR', 'Kingdom of Portugal', 'Portugal'); } goodwill('BRZ', 'POR', 20); War.afterPeace(); } })] },
        { t: 'Send the fleet to bring Brazil to heel', ai: 1, eff: [libText('BRZ', ['BR'], null, 'POR'), E.say('…and Portugal goes to war with it', function () { if (liberate('BRZ', 'POR', ['BR'], 5)) { if (War.nations.POR.capital !== 'Lisbon') { War.nations.POR.capital = 'Lisbon'; rename('POR', 'Kingdom of Portugal', 'Portugal'); } war('BRZ', 'POR', 'Brazil rises against Portugal'); } })] }] }
  ];
  function mexTest(p) { return p.cc !== 'US' || p.lon < -93; }
  function libText(tag, ccs, test, from) { return E.say(function () { var n = liberateList(from || 'SPA', ccs, test).length; return n ? (War.nations[tag] ? War.nations[tag].name : tag) + ' becomes independent with ' + n + ' province' + (n > 1 ? 's' : '') : null; }); }
  War.STORY = EV;

  // the treaties' map changes, as history drew them
  function pressburg() {
    if (alive('BAV')) give(ids(['Innsbruck', 'Bregenz', 'Bozen', 'Trent', 'Lienz']), 'BAV', ['AUS']);
    if (alive('ITA')) give(ids(['Venice', 'Treviso', 'Padua', 'Vicenza', 'Verona', 'Belluno', 'Udine']), 'ITA', ['AUS']);
    War.event('story', 'The Treaty of Pressburg: Tyrol to Bavaria, Venice to the Kingdom of Italy', { a: 'AUS', b: 'FRA' });
  }
  function tilsitMap() {
    var warsaw = ids(['Posen', 'Gnesen', 'Kalisch', 'Warsaw', 'Płock', 'Łomża', 'Suwałki', 'Łęczyca', 'Petrikau', 'Częstochowa', 'Bromberg', 'Thorn']);
    if (alive('SAX')) { give(warsaw, 'SAX', ['PRU']); rename('SAX', 'Kingdom of Saxony and Duchy of Warsaw', 'Saxony'); joinSide('SAX', 'FRA'); }
    give(ids(['Białystok']), 'RUS', ['PRU']);
    if (alive('HES')) { give(ids(['Magdeburg', 'Halberstadt', 'Hildesheim', 'Paderborn', 'Minden', 'Stendal', 'Halle']).concat(War.provs.filter(function (p) { return p.owner === 'BRU'; }).map(function (p) { return p.id; })), 'HES', ['PRU', 'BRU']); rename('HES', 'Kingdom of Westphalia', 'Westphalia'); joinSide('HES', 'FRA'); }
    if (alive('BRG')) give(ids(['Münster', 'Hamm', 'Wesel']), 'BRG', ['PRU']);
    War.event('story', 'Tilsit redraws Germany: the Duchy of Warsaw and the Kingdom of Westphalia are born from Prussian land', { a: 'PRU', b: 'FRA' });
  }
  // after Napoleon: each nation gets back the 1805 lands France and its creatures took, where it still exists
  // (victorsOnly: only the great powers that beat France get theirs back; the small princes do not)
  function congress(victorsOnly) {
    setFlag('vienna');
    var moved = 0, client = { BAV: 1, ITA: 1, HES: 1, BRG: 1, SAX: 1, WUR: 1, BAD: 1, BAT: 1 };
    War.provs.forEach(function (p) {
      var core = War.core[p.id]; if (!core || core === p.owner || !alive(core)) return;
      if (victorsOnly && !War.nations[core].major) return;
      if (p.owner === 'FRA' || (client[p.owner] && War.allied(p.owner, 'FRA')) || p.owner === 'HES' || p.owner === 'SAX') { if (!War.atWar(core, p.owner)) { p.owner = core; p.ctrl = core; moved++; } }
    });
    if (moved) War.afterPeace();
    War.factions.slice().forEach(function (f) { if (f.members.indexOf('FRA') >= 0) f.members.slice().forEach(function (m) { if (m !== 'FRA') War.leaveFaction(m, true); }); });
    ['GBR', 'AUS', 'PRU', 'RUS', 'FRA'].forEach(function (a) { ['GBR', 'AUS', 'PRU', 'RUS', 'FRA'].forEach(function (b) { if (a < b) War.truce[War.key(a, b)] = War.day + 1800; }); });
    rename('HES', 'Electorate of Hesse-Kassel', 'Hesse-Kassel'); rename('SAX', 'Kingdom of Saxony', 'Saxony'); if (alive('BAT')) rename('BAT', 'Kingdom of the Netherlands', 'Netherlands');
    War.event('surrender', 'The Congress of Vienna: ' + moved + ' provinces return to their old rulers, and the Concert of Europe keeps the great powers at peace', { a: 'AUS' });
  }

  // the toolkit, for the national storylines (story-branches.js) and mods
  War.storyKit = { E: E, R: R, flag: flag, setFlag: setFlag, prov: prov, ids: ids, alive: alive, at: at, nm: nm, S: S, war: war, duel: duel, makePeace: makePeace,
    joinSide: joinSide, leaveSide: leaveSide, give: give, spawnAt: spawnAt, rename: rename, goodwill: goodwill, boost: boost, divsIn: divsIn,
    yielded: yielded, yieldedSince: yieldedSince, odds: odds, rnd: function () { return rnd(War); } };

  // ---------- start dates: replay history's treaties up to 1809, 1812 or 1815 ----------
  War.SCENARIOS = { 1805: { year: 1805, month: 9, name: 'The Third Coalition', blurb: 'September 1805: the Grande Armée turns from the Channel to the Danube.' },
    1809: { year: 1809, month: 4, name: 'The Fifth Coalition', blurb: 'April 1809: Austria strikes while France is bogged down in Spain.' },
    1812: { year: 1812, month: 6, name: 'The Road to Moscow', blurb: 'June 1812: six hundred thousand men gather on the Niemen.' },
    1815: { year: 1815, month: 3, name: 'The Hundred Days', blurb: 'March 1815: Napoleon has escaped from Elba and Europe marches again.' } };
  War.scenario = function (year) {
    var sc = this.SCENARIOS[year]; if (!sc || year === 1805) return;
    var self = this, s = S(), day0 = this.day;
    function choice(e, i) { var o = e.opts[i || 0]; return { id: e.id, day: self.day, who: e.who, choice: o.t, hist: true, fx: [] }; }
    function fire(id, i) { var e = War.storyEventById(id); if (!e || s.fired[id] !== undefined) return; s.fired[id] = self.day; s.log.push(choice(e, i)); try { runOpt(e.opts[i || 0]); } catch (err) { if (root.console) console.warn('scenario', id, err); } }
    function mark(id) { var e = War.storyEventById(id); if (!e || s.fired[id] !== undefined) return; var i = 0; e.opts.forEach(function (x, k) { if (x.hist && !i) i = k; }); s.fired[id] = self.day; s.log.push(choice(e, i)); }
    var target = sc.year + (sc.month - 1) / 12;
    this.day = Math.round((target - 1805) * 365 - 243);
    // 1805–1808
    mark('villeneuve'); mark('ulm'); fire('trafalgar');
    makePeace('FRA', 'AUS'); leaveSide('AUS'); pressburg(); setFlag('yield:AUS:FRA'); mark('austerlitz');
    fire('rhine'); fire('holland');
    makePeace('FRA', 'RUS'); makePeace('FRA', 'PRU'); leaveSide('RUS'); leaveSide('PRU'); setFlag('war1806'); setFlag('yield:PRU:FRA'); setFlag('yield:RUS:FRA'); setFlag('tilsit');
    tilsitMap(); mark('prussia1806'); mark('jena'); mark('tilsit');
    fire('berlin'); War.csJoin('RUS'); War.csJoin('PRU'); War.csJoin('AUS');
    fire('bayonne'); fire('dosdemayo');
    if (alive('POR') && !War.atWar('FRA', 'POR')) { joinSide('POR', 'GBR'); war('FRA', 'POR', 'France invades Portugal'); }
    if (this.storyScenario) this.storyScenario(year, fire, mark);   // the national storylines replay their history too
    if (year === 1809) { fire('aus1809'); }
    else {
      // 1809–1812
      mark('aus1809'); fire('schonbrunn'); setFlag('yield:AUS:FRA'); fire('marriage'); fire('ukase');
      fire('mayo'); fire('paraguay');                                              // the River Plate has already gone its own way
      if (year === 1812) fire('russia1812');
      else {
        // 1812–1815: the retreat, the Sixth Coalition, Elba and Vienna
        mark('russia1812'); mark('berezina'); mark('tauroggen'); mark('aus1813'); mark('trachenberg'); mark('leipzig'); setFlag('war1812'); setFlag('war1813'); setFlag('leipzig');
        War.provs.forEach(function (p, i) { if (p.owner === 'SAX' && War.core[i] === 'PRU') { p.owner = 'PRU'; p.ctrl = 'PRU'; } });
        fire('abdication'); this.story.nap.left = this.day - 300; fire('vienna');
        if (alive('SPA')) makePeace('SPA', 'FRA');
        mark('madison'); mark('ghent');                                          // America's war with Britain has been fought and settled
        fire('hundreddays');
      }
    }
    // every nation knows what history taught it by then
    if (this.R) this.tags.forEach(function (t) {
      var R = self.R[t]; if (!R) return; var major = self.nations[t].major, until = target - (major ? 0.6 : 2.5);
      (self.TECH || []).slice().sort(function (a, b) { return a.year - b.year; }).forEach(function (tc) { if (tc.year <= until && (!tc.req || R.done[tc.req]) && (!tc.path || tc.path === R.path)) R.done[tc.id] = true; });
    });
    this.techVer++; this.ctrlVersion++; this.afterPeace(); if (this.syncFactions) this.syncFactions(); if (this.refreshSupply) this.refreshSupply();
    s.log.forEach(function (r) { if (r.day > self.day) r.day = self.day; });
    return { day: this.day, from: day0 };
  };

  // ---------- running the story ----------
  function fresh(mode) { return { mode: mode || 'historical', fired: {}, missed: {}, flags: {}, log: [], pending: [], names: {}, boost: {}, bigWin: null, wait: {}, again: {},
    nap: { state: 'emperor', gen: null, until: null, left: null }, cs: { on: false, members: {} } }; }
  War.initStory = function (mode) {
    this.story = fresh(mode);
    if (this.story.mode === 'historical') this.story.flags.hist = 0;
  };
  War.storyMode = function (m) { var s = this.story; s.mode = m; if (m === 'historical') s.flags.hist = this.day; else delete s.flags.hist; };
  War.storyEventById = function (id) { for (var i = 0; i < EV.length; i++) if (EV[i].id === id) return EV[i]; return null; };
  War.storyText = function (e) { try { return T(e.text); } catch (x) { return ''; } };
  // a put-off event stays open for a while past its usual window
  function closed(e) { var s = S(), w = s.wait && s.wait[e.id]; return !!e.until && at(e.until[0], e.until[1]) && !(w && War.day < w + 240); }
  function inWindow(e) { return at(e.from[0], e.from[1]) && !closed(e); }
  War.storyCheck = function () {
    var s = this.story, self = this; if (!s || s.mode === 'off') return;
    EV.forEach(function (e) {
      if (s.fired[e.id] !== undefined || s.missed[e.id]) return;
      if (closed(e)) { s.missed[e.id] = self.day; return; }
      if (!inWindow(e)) return;
      if (s.wait[e.id] && s.wait[e.id] > self.day) return;
      if (s.pending.some(function (p) { return p.id === e.id; })) return;
      var who = e.who; if (!alive(who)) { s.missed[e.id] = self.day; return; }
      var ok = false; try { ok = e.cond(); } catch (err) { ok = false; }
      // an event that was put off comes back as soon as it can
      var chance = s.refire && s.refire[e.id] ? 1 : Math.min(1, 7 / (e.mtth || 14));
      if (!ok || rnd(self) > chance) return;
      if (s.refire) delete s.refire[e.id];
      if (who === self.player) { s.pending.push({ id: e.id, day: self.day }); self.event('storyevent', e.title, { a: who, id: e.id }); }
      else self.storyChoose(e, self.aiStoryChoice(e));
    });
    // Napoleon's wounds heal
    if (s.nap.state === 'wounded' && s.nap.until <= this.day) { bringBack(); if (this.player === 'FRA') this.event('story', 'The Emperor has recovered from his wound and is back with the army', { a: 'FRA' }); }
  };
  // the computer picks only choices it can carry out; in historical mode it follows history when it can; otherwise it
  // weighs each choice by its base weight and by what the effects mean for it (a war it cannot win is unattractive)
  War.aiStoryChoice = function (e) {
    var s = this.story, self = this, st = this.storyOptState(e), okIdx = [];
    st.forEach(function (x, i) { if (x.ok) okIdx.push(i); });
    if (!okIdx.length) return e.opts.length - 1;
    if (s.mode === 'historical') {
      // (the main storyline almost always; the national stories now and then go another way)
      for (var i = 0; i < e.opts.length; i++) if (e.opts[i].hist && st[i].ok) { if (rnd(this) < (e.branch ? 0.93 : 0.99) || okIdx.length === 1) return i; break; }
      // history's choice is not possible yet: get ready for it (a choice that puts the decision off), if there is one
      if (e.opts.some(function (o, k) { return o.hist && !st[k].ok; })) { var prep = okIdx.filter(function (k) { return (e.opts[k].eff || []).some(function (f) { return f.later; }); }); if (prep.length) return prep[0]; }
    }
    var w = e.opts.map(function (o, k) {
      if (!st[k].ok) return 0;
      var v = typeof o.ai === 'function' ? o.ai() : (o.ai === undefined ? 1 : o.ai);
      (o.eff || []).forEach(function (f) { if (f.aiw) { try { v *= f.aiw(e.who); } catch (x) { /* no opinion */ } } });
      st[k].need.forEach(function (r) { if (r.warn && !r.ok) v *= 0.4; });
      return Math.max(0, v);
    });
    var tot = w.reduce(function (a, b) { return a + b; }, 0); if (tot <= 0) return okIdx[0];
    var r = rnd(this) * tot; for (var j = 0; j < w.length; j++) { r -= w[j]; if (r <= 0 && w[j] > 0) return j; }
    return okIdx[0];
  };
  War.storyChoose = function (e, i) {
    var s = this.story, st = this.storyOptState(e);
    if (!st[i] || !st[i].ok) { i = st.findIndex(function (x) { return x.ok; }); if (i < 0) i = e.opts.length - 1; }
    var o = e.opts[i] || e.opts[0];
    s.fired[e.id] = this.day; s.pending = s.pending.filter(function (p) { return p.id !== e.id; });
    s.log.push({ id: e.id, day: this.day, who: e.who, choice: o.t, hist: !!o.hist, fx: st[i] ? st[i].fx : [] });
    if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
    runOpt(o);
    if (e.who !== this.player) this.event('story', e.title + ': ' + this.nations[e.who].short + ' chooses "' + o.t + '"', { a: e.who, id: e.id });
    this.techVer++; this.ctrlVersion++; if (this.refreshSupply) this.refreshSupply();
  };
  War.storyChapter = function () { var s = this.story, last = s && s.log.length ? this.storyEventById(s.log[s.log.length - 1].id) : null; return last ? last.ch : EV[0].ch; };
  // what history expects next: open events in their window, or coming soon (for one nation's eyes, if given)
  War.storyNext = function (n, tag) {
    var s = this.story, out = [];
    EV.forEach(function (e) {
      if (s.fired[e.id] !== undefined || s.missed[e.id] || e.ch === 'Another History' || e.hidden) return;
      if (e.branch && tag && e.who !== tag) return;
      var cok = function () { try { return e.cond(); } catch (x) { return false; } };
      if ((e.side || e.branch) && !(inWindow(e) && cok())) return;
      var open = inWindow(e), wait = s.wait[e.id] && s.wait[e.id] > War.day, ok = open && !wait && cok();
      out.push({ e: e, open: open, ready: ok, wait: wait ? s.wait[e.id] : null, when: e.from[0] + (e.from[1] - 1) / 12 });
    });
    return out.sort(function (a, b) { return (b.ready - a.ready) || a.when - b.when; }).slice(0, n || 6);
  };

  // great victories and Napoleon's wounds
  var prevEnd = War.endBattle;
  War.endBattle = function (bt, attackerWon) {
    var p = this.provs[bt.prov], n = (bt.atk || []).length + ((this.at && this.at[bt.prov]) || []).length, defTag = p.ctrl;
    var fra = bt.tag === 'FRA' || defTag === 'FRA';
    prevEnd.call(this, bt, attackerWon);
    var s = this.story; if (!s || attackerWon === null || attackerWon === undefined) return;
    var win = attackerWon ? bt.tag : defTag, lose = attackerWon ? defTag : bt.tag;
    if (n >= 8) s.bigWin = { win: win, lose: lose, day: this.day, prov: bt.prov };
    if (fra && n >= 8 && s.nap.state === 'emperor') {
      var r = rnd(this);
      if (r < 0.005) { sideline('wounded', 40 + Math.floor(rnd(this) * 50)); this.event(this.player === 'FRA' ? 'lost' : 'story', 'Napoleon is wounded at ' + p.name + ' and leaves the army to recover', { a: 'FRA', prov: bt.prov }); }
      else if (r < 0.006 && s.mode !== 'historical') { sideline('dead'); this.event('story', 'Napoleon is killed at ' + p.name + '! Europe holds its breath', { a: 'FRA', prov: bt.prov }); }
    }
  };
  // record who yields to whom, for the story's conditions
  var prevDictate = War.dictatePeace;
  War.dictatePeace = function (t) {
    var r = prevDictate.call(this, t);
    if (this.story) { this.story.flags['yield:' + t.lose + ':' + t.win] = this.day; if (this.story.cs.on && t.win === 'FRA') this.csJoin(t.lose); }
    return r;
  };
  var prevClose = War.closeConference;
  War.closeConference = function () {
    var c = this.conference; prevClose.call(this);
    var self = this; if (this.story && c) c.losers.forEach(function (l) { c.victors.forEach(function (v) { self.story.flags['yield:' + l + ':' + v.tag] = self.day; }); if (self.story.cs.on && c.victors.some(function (v) { return v.tag === 'FRA'; })) self.csJoin(l); });
  };
  // in historical mode the great powers leave the big wars to the story while France is the power to fear
  War.storyHolds = function (t) {
    // ...and after the Congress of Vienna the Concert of Europe keeps them from wars of conquest
    var s = this.story; return !!(s && s.mode === 'historical' && t !== this.player && { FRA: 1, GBR: 1, AUS: 1, PRU: 1, RUS: 1, SPA: 1, SWE: 1 }[t] && (s.nap.state === 'emperor' || s.flags.vienna !== undefined));
  };

  // in historical mode the Sixth Coalition does not drift into a white peace: it fights until someone is beaten
  var basePeace = War.peace;
  War.peace = function (a, b, keep) {
    var s = this.story;
    if (s && s.mode === 'historical' && a !== this.player && b !== this.player && flag('war1813') && s.nap.state === 'emperor' && !flag('hundred')) {
      var other = a === 'FRA' ? b : b === 'FRA' ? a : null;
      if (other && { RUS: 1, PRU: 1, AUS: 1, GBR: 1, SWE: 1 }[other] && this.warCondition(other).total < 40) return false;
    }
    return basePeace.call(this, a, b, keep);
  };

  // the Trachenberg plan: the allies march on France with everything, not a token corps
  War.storyExpedition = function (t) {
    var s = this.story; if (!s || !flag('trachenberg') || s.nap.state !== 'emperor' || !this.atWar(t, 'FRA')) return 0;
    return { RUS: 0.75, PRU: 1, AUS: 1, SWE: 0.8, GBR: 0.8 }[t] || 0;
  };

  // ---------- hooks ----------
  var baseInit = War.init;
  var ORIG = null;
  War.init = function (provinces, nations, econ, km) {
    if (!ORIG) { ORIG = {}; Object.keys(nations).forEach(function (t) { ORIG[t] = [nations[t].name, nations[t].short]; }); }
    else Object.keys(ORIG).forEach(function (t) { if (nations[t]) { nations[t].name = ORIG[t][0]; nations[t].short = ORIG[t][1]; } });
    baseInit.call(this, provinces, nations, econ, km); this.initStory(this.storyStartMode || 'historical'); };
  var baseStep = War.step;
  War.step = function () { baseStep.call(this); if (!this.conference && this.day % 7 === 3) this.storyCheck(); };
  var baseMonth = War.month;
  War.month = function () {
    baseMonth.call(this);
    var s = this.story, self = this; if (!s || !s.cs.on) return;
    // the blockade breeds resentment, and the resentful drift away
    Object.keys(s.cs.members).forEach(function (t) {
      if (t === 'FRA') return; if (!alive(t) || self.atWar(t, 'FRA')) { delete s.cs.members[t]; return; }
      goodwill(t, 'FRA', -1.5);
      if (t !== self.player && t !== 'RUS' && (self.goodwill[t].FRA || 0) < -25 && !self.allied(t, 'FRA') && rnd(self) < 0.08) self.csLeave(t);
    });
  };
  var baseSer = War.serialize;
  War.serialize = function () {
    var s = baseSer.call(this), st = this.story;
    if (st) s.story = { mode: st.mode, fired: st.fired, missed: st.missed, flags: st.flags, log: st.log, pending: st.pending, names: st.names, boost: st.boost, bigWin: st.bigWin, wait: st.wait, again: st.again, refire: st.refire,
      nap: { state: st.nap.state, until: st.nap.until, left: st.nap.left, gen: st.nap.gen }, cs: st.cs };
    return s;
  };
  var baseRestore = War.restore;
  War.restore = function (s) {
    var ok = baseRestore.call(this, s); if (!ok) return ok;
    if (s.story) {
      this.story = s.story; var self = this, d = fresh(s.story.mode);
      Object.keys(d).forEach(function (k) { if (self.story[k] === undefined) self.story[k] = d[k]; });   // saves from before the new storylines
      Object.keys(this.story.names || {}).forEach(function (t) { var nm2 = self.story.names[t]; if (self.nations[t]) { self.nations[t].name = nm2[0]; self.nations[t].short = nm2[1]; } });
      if (this.story.nap.gen) this.gens = this.gens.filter(function (g) { return g.name !== NAP; });
    } else this.initStory('free');
    return ok;
  };
})(typeof window !== 'undefined' ? window : globalThis);
