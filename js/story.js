// The storyline: Napoleon, the Continental System and the great events of 1805–1815, as a chain of events with
// choices. In historical mode the computer takes history's choices and the great powers leave the big wars to the
// story; in unhistorical mode it chooses freely. Either way an event only fires when the world makes it possible,
// so when history goes another way (France beaten in 1805, Russia crushed in 1812) the story follows the new road.
(function (root) {
  'use strict';
  var War = root.War, Econ = root.Econ;
  function rnd(o) { var t = o.seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

  // ---------- helpers for the events ----------
  function S() { return War.story; }
  function flag(f) { return !!S().flags[f]; }
  function setFlag(f) { S().flags[f] = War.day; }
  function prov(name) { return War.byName[name]; }
  function ids(names) { return names.map(function (n) { return prov(n); }).filter(Boolean).map(function (p) { return p.id; }); }
  function alive(t) { return War.nations[t] && !War.gone[t] && War.ownP(t).length > 0; }
  function yr() { return War.year(); }
  function at(y, m) { return yr() >= y + ((m || 1) - 1) / 12; }
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
  function liberate(tag, from, ccs, n, test) {
    var W = War, N = W.nations[tag]; if (!N || !alive(from)) return 0;
    var list = W.provs.filter(function (p) { return p.owner === from && p.world && ccs.indexOf(p.cc) >= 0 && (!test || test(p)); }).map(function (p) { return p.id; });
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
    var p = prov(where); if (!p || p.ctrl !== tag) p = War.provs.filter(function (q) { return q.ctrl === tag; })[0]; if (!p) return;
    var tp = War.tplOfCls(tag, 'inf'); for (var i = 0; i < n; i++) { var d = War.spawn(tag, tp.id, p.id, str || 0.9); d.xp = Math.max(d.xp || 0, 0.5); d.org = 0.8; }
    War.indexStacks();
  }
  function goodwill(to, from, v) { var g = War.goodwill[to]; if (g) g[from] = Math.max(-60, Math.min(60, (g[from] || 0) + v)); }

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

  // ---------- the events ----------
  // who: the nation that decides; from/until: the window; cond: what must be true; mtth: mean days to happen once possible
  var EV = [
    // The War of the Third Coalition
    { id: 'villeneuve', ch: 'The Third Coalition', title: 'Villeneuve ordered to sea', who: 'FRA', from: [1805, 9], until: [1806, 3], mtth: 25,
      cond: function () { return War.fleets.some(function (f) { return f.tag === 'FRA' && f.name === 'Combined Fleet' && f.inPort; }) && War.atWar('FRA', 'GBR'); },
      text: 'The Combined Fleet sits in Cádiz while the Emperor fumes. Admiral Villeneuve is told to put to sea and carry troops to Naples, Nelson or no Nelson.',
      expect: 'The Combined Fleet sails from Cádiz and meets Nelson (autumn 1805)',
      opts: [{ t: 'Sail for Naples', hist: true, ai: 2, fx: function () { War.fleets.forEach(function (f) { if ((f.tag === 'FRA' || f.tag === 'SPA') && f.inPort && War.provs[f.base].name === 'Cádiz' && f.ships.length > 6) { f.org = 1; War.setMission(f, 'patrol', War.seaByKey.albo); } }); setFlag('villeneuve_sailed'); } },
        { t: 'Stay in harbour', ai: 1, fx: function () { setFlag('villeneuve_stayed'); } }] },
    { id: 'trafalgar', ch: 'The Third Coalition', title: 'England expects', who: 'GBR', from: [1805, 9], until: [1807, 1], mtth: 1,
      cond: function () { return (War.seaLog || []).some(function (r) { return r.winner === 'GBR' && (r.tags.indexOf('FRA') >= 0 || r.tags.indexOf('SPA') >= 0) && r.sunk[r.tags.indexOf('GBR') ? 0 : 1].length + r.taken[r.tags.indexOf('GBR') ? 0 : 1].length >= 6; }); },
      text: 'A great victory at sea. The enemy fleet is broken, and Britain rules the waves for a generation. The price was high: the admiral fell on his own quarterdeck.',
      expect: 'Britain wins a great sea battle against France and Spain',
      opts: [{ t: 'Mourn the hero and rule the waves', hist: true, ai: 1, fx: function () { setFlag('trafalgar'); War.admirals.forEach(function (a) { if (a.name === 'Nelson') { if (a.fleet !== null) { var f = War.fleetById(a.fleet); if (f) f.adm = null; } a.fleet = null; a.dead = true; } }); War.admirals = War.admirals.filter(function (a) { return !a.dead; }); boost('GBR', { ngun: 0.1 }, 720); } }] },
    { id: 'trafalgar_fra', side: true, ch: 'The Third Coalition', title: 'Master of the Channel?', who: 'FRA', from: [1805, 9], until: [1808, 1], mtth: 1,
      cond: function () { return !flag('trafalgar') && (War.seaLog || []).some(function (r) { return r.winner === 'FRA' && r.tags.indexOf('GBR') >= 0 && r.sunk[r.tags.indexOf('GBR')].length + r.taken[r.tags.indexOf('GBR')].length >= 5; }); },
      text: 'Against all expectation the Royal Navy has been beaten. For a few weeks the Channel may be ours. The Army of England still waits at Boulogne.',
      expect: 'Only if France wins at sea: the invasion of England',
      opts: [{ t: 'Prepare the invasion of England', ai: 2, fx: function () { setFlag('invasion_england'); War.NV.FRA.convoys += 60; boost('FRA', { ngun: 0.1 }, 365); } },
        { t: 'Turn east as planned', hist: true, ai: 1, fx: function () { } }] },
    { id: 'ulm', ch: 'The Third Coalition', title: 'The march to the Danube', who: 'FRA', from: [1805, 9], until: [1806, 2], mtth: 12,
      cond: function () { return War.atWar('FRA', 'AUS'); },
      text: 'Seven corps of the Grande Armée wheel from the Channel coast to the Rhine in a few weeks. If they move fast enough, the Austrians at Ulm will be cut off before they know it.',
      expect: 'The Grande Armée marches fast against Austria (autumn 1805)',
      opts: [{ t: 'Forced marches! (+25% speed for 60 days)', hist: true, ai: 2, fx: function () { boost('FRA', { spd: 0.25, plan: 0.3 }, 60); } },
        { t: 'Advance with care (+15% defence for 60 days)', ai: 1, fx: function () { boost('FRA', { def: 0.15 }, 60); } }] },
    { id: 'austerlitz', ch: 'The Third Coalition', title: 'After the battle', who: 'AUS', from: [1805, 10], until: [1807, 6], mtth: 6,
      cond: function () { var b = S().bigWin; return War.atWar('AUS', 'FRA') && b && b.win === 'FRA' && (b.lose === 'AUS' || b.lose === 'RUS') && War.day - b.day < 60; },
      text: 'The allied army has been broken in a single day. The French are camped in our provinces and the Emperor Francis rides out to meet Napoleon by a windmill.',
      expect: 'A great French victory (an Austerlitz) brings Austria to terms',
      opts: [{ t: 'Seek an armistice', hist: true, ai: 2, fx: function () { var t = War.peaceTerms('FRA', 'AUS'); if (S().mode === 'historical') { t.lots = []; t.gold = Math.max(t.gold, 40000); } War.dictatePeace(t); setFlag('yield:AUS:FRA'); if (S().mode === 'historical') pressburg(); } },
        { t: 'The Archduke Charles is coming: fight on', ai: 1, fx: function () { boost('AUS', { def: 0.1 }, 90); } }] },
    // The Confederation of the Rhine and the kingdoms
    { id: 'rhine', ch: 'The Grand Empire', title: 'The Confederation of the Rhine', who: 'FRA', from: [1806, 1], until: [1809, 12], mtth: 40,
      cond: function () { return yielded('AUS', 'FRA') && !War.atWar('FRA', 'AUS'); },
      text: 'The Holy Roman Empire is a thousand-year-old ghost. The German princes who stood by France could be gathered into a confederation under French protection, and given grander titles for their trouble.',
      expect: 'Once Austria yields to France: the Confederation of the Rhine (1806)',
      opts: [{ t: 'Found the Confederation', hist: true, ai: 2, fx: function () {
          ['BAV', 'WUR', 'BAD', 'HDA', 'NAS', 'BRG', 'FRK', 'THU'].forEach(function (t) { if (alive(t) && !War.atWar(t, 'FRA')) joinSide(t, 'FRA'); });
          rename('BAV', 'Kingdom of Bavaria'); rename('WUR', 'Kingdom of Württemberg'); rename('BAD', 'Grand Duchy of Baden'); rename('HDA', 'Grand Duchy of Hesse'); rename('BRG', 'Grand Duchy of Berg'); rename('FRK', 'Grand Duchy of Frankfurt');
          setFlag('rhine'); War.event('story', 'The Holy Roman Empire is dissolved; Francis is now Emperor of Austria alone', { a: 'AUS' }); } },
        { t: 'Leave the German princes as they are', ai: 1, fx: function () { } }] },
    { id: 'holland', ch: 'The Grand Empire', title: 'A crown for Louis', who: 'FRA', from: [1806, 3], until: [1810, 1], mtth: 50,
      cond: function () { return alive('BAT') && War.allied('BAT', 'FRA'); },
      text: 'The Batavian Republic is a republic in name only. Your brother Louis could be its king, or the Dutch could simply become Frenchmen.',
      expect: 'The Batavian Republic becomes the Kingdom of Holland (1806)',
      opts: [{ t: 'Louis becomes King of Holland', hist: true, ai: 2, fx: function () { rename('BAT', 'Kingdom of Holland', 'Holland'); goodwill('BAT', 'FRA', 20); } },
        { t: 'Annex Holland to France', ai: 1, fx: function () { give(War.provs.filter(function (p) { return p.owner === 'BAT'; }).map(function (p) { return p.id; }), 'FRA'); } }] },
    { id: 'prussia1806', ch: 'The Fourth Coalition', title: 'Prussia mobilises', who: 'PRU', from: [1806, 7], until: [1807, 12], mtth: 30,
      cond: function () { return !War.atWar('PRU', 'FRA') && (flag('rhine') || yielded('AUS', 'FRA')) && alive('PRU'); },
      text: 'French troops march through Ansbach as if it were their own, and Napoleon has offered Hanover back to Britain behind our backs. The Queen and the war party demand that Prussia fight.',
      expect: 'Prussia goes to war with France (autumn 1806)',
      opts: [{ t: 'Send France an ultimatum and march', hist: true, ai: 2, fx: function () { joinSide('PRU', War.factionOf('GBR') ? 'GBR' : 'RUS'); war('PRU', 'FRA', 'Prussia declares war on France: the War of the Fourth Coalition'); setFlag('war1806'); } },
        { t: 'Stay neutral', ai: 1, fx: function () { goodwill('FRA', 'PRU', 10); } }] },
    { id: 'jena', ch: 'The Fourth Coalition', title: 'After Jena', who: 'PRU', from: [1806, 9], until: [1808, 6], mtth: 6,
      cond: function () { var b = S().bigWin; return War.atWar('PRU', 'FRA') && b && b.win === 'FRA' && b.lose === 'PRU' && War.day - b.day < 60 && War.warCondition('PRU').total >= 18; },
      text: 'The army of Frederick the Great has been routed in a single afternoon, and the fortresses are surrendering to French hussars. The court has fled east to Königsberg.',
      expect: 'A French victory in Prussia (a Jena) and the flight to Königsberg',
      opts: [{ t: 'Flee east and wait for the Russians', hist: true, ai: 2, fx: function () { boost('PRU', { def: 0.15 }, 120); } },
        { t: 'Sue for peace now', ai: 1, fx: function () { War.dictatePeace(War.peaceTerms('FRA', 'PRU')); setFlag('yield:PRU:FRA'); } }] },
    { id: 'berlin', ch: 'The Fourth Coalition', title: 'The Berlin Decree', who: 'FRA', from: [1806, 9], until: [1812, 1], mtth: 20,
      cond: function () { var b = prov('Berlin'); return War.atWar('FRA', 'GBR') && !S().cs.on && ((b && b.ctrl === 'FRA') || yielded('PRU', 'FRA') || flag('trafalgar')) && at(1806, 9); },
      text: 'Britain cannot be beaten at sea, so she must be beaten in her counting houses. Close every port in Europe to British goods and the nation of shopkeepers will beg for peace.',
      expect: 'France proclaims the Continental System (late 1806)',
      opts: [{ t: 'Proclaim the Continental System', hist: true, ai: 2, fx: function () { var s = S(); s.cs.on = true; War.csJoin('FRA'); War.allies('FRA').forEach(function (a) { War.csJoin(a); }); Object.keys(s.flags).forEach(function (f) { var m = /^yield:(\w+):FRA$/.exec(f); if (m && m[1] !== 'GBR') War.csJoin(m[1]); }); Econ.refreshAccess(); War.event('story', 'The Continental System: Europe\'s ports close to British trade', { a: 'FRA', b: 'GBR' }); } },
        { t: 'Trade on as before', ai: 1, fx: function () { } }] },
    { id: 'tilsit', ch: 'The Fourth Coalition', title: 'The raft at Tilsit', who: 'RUS', from: [1807, 1], until: [1809, 12], mtth: 20,
      cond: function () { return (yielded('RUS', 'FRA') && !War.atWar('RUS', 'FRA') && at(1807, 1)) || War.atWar('RUS', 'FRA') && (yielded('PRU', 'FRA') || War.warCondition('RUS').total >= 12 || (S().bigWin && S().bigWin.win === 'FRA' && S().bigWin.lose === 'RUS' && War.day - S().bigWin.day < 90)); },
      text: 'After Friedland the Tsar meets Napoleon on a raft in the Niemen. The Emperor is charming. Russia could make peace, join his blockade of Britain and divide Europe between them.',
      expect: 'Russia makes peace with France at Tilsit and joins the Continental System (1807)',
      opts: [{ t: 'Make peace and join the Continental System', hist: true, ai: 2, fx: function () {
          makePeace('FRA', 'RUS'); leaveSide('RUS'); War.csJoin('RUS'); setFlag('tilsit'); setFlag('yield:RUS:FRA');
          if (War.atWar('PRU', 'FRA') || yielded('PRU', 'FRA')) { makePeace('FRA', 'PRU'); leaveSide('PRU'); setFlag('yield:PRU:FRA'); if (S().mode === 'historical' || alive('SAX')) tilsitMap(); War.csJoin('PRU'); }
          goodwill('FRA', 'RUS', 30); goodwill('RUS', 'FRA', 20); War.event('surrender', 'The Treaties of Tilsit: Russia and France divide Europe', { a: 'RUS', b: 'FRA' }); } },
        { t: 'Fight on', ai: 1, fx: function () { boost('RUS', { def: 0.1 }, 120); } }] },
    // Spain
    { id: 'bayonne', ch: 'The Peninsula', title: 'Trouble in Madrid', who: 'FRA', from: [1808, 1], until: [1811, 1], mtth: 40,
      cond: function () { return alive('SPA') && !War.atWar('FRA', 'SPA') && (War.allied('SPA', 'FRA') || S().mode === 'historical') && (flag('tilsit') || at(1808, 3)); },
      text: 'King Charles and his son Ferdinand are at each other\'s throats, and both have come to Bayonne begging for your help. Spain could be given a better king: your brother Joseph.',
      expect: 'Napoleon puts his brother Joseph on the Spanish throne (1808)',
      opts: [{ t: 'Joseph shall be King of Spain', hist: true, ai: 2, fx: function () { rename('SPA', 'Kingdom of Spain (Joseph I)'); setFlag('bayonne'); } },
        { t: 'Leave the Bourbons in Madrid', ai: 1, fx: function () { goodwill('SPA', 'FRA', 15); } }] },
    { id: 'dosdemayo', ch: 'The Peninsula', title: 'Dos de Mayo', who: 'SPA', from: [1808, 1], until: [1812, 1], mtth: 15,
      cond: function () { return flag('bayonne') && alive('SPA') && !War.atWar('SPA', 'FRA'); },
      text: 'Madrid has risen against the French. The juntas of the provinces refuse King Joseph, and the whole of Spain is taking up arms: priests, peasants, smugglers and all.',
      expect: 'Spain rises against Joseph and the French (May 1808)',
      opts: [{ t: 'Rise! Long live Ferdinand!', hist: true, ai: 2, fx: function () {
          leaveSide('SPA'); rename('SPA', 'Kingdom of Spain (Juntas)', 'Spain'); war('SPA', 'FRA', 'Dos de Mayo: Spain rises against France');
          if (alive('GBR') && War.atWar('GBR', 'FRA')) joinSide('SPA', 'GBR'); setFlag('peninsula');
          War.provs.forEach(function (p) { if (p.owner === 'SPA' && p.ctrl === 'FRA') War.resist[p.id] = Math.max(War.resist[p.id], 0.6); });
          spawnAt('SPA', 'Seville', 4, 0.7); if (War.csLeave) War.csLeave('SPA', true); } },
        { t: 'Accept King Joseph', ai: 1, fx: function () { goodwill('SPA', 'FRA', -20); } }] },
    // Austria again
    { id: 'aus1809', ch: 'The Fifth Coalition', title: 'Austria rearms', who: 'AUS', from: [1808, 10], until: [1810, 6], mtth: 30,
      cond: function () { return !War.atWar('AUS', 'FRA') && (War.atWar('FRA', 'SPA') || at(1809, 3)) && alive('AUS') && War.M.AUS.count >= 15 && !(War.truce[War.key('AUS', 'FRA')] > War.day + 200); },
      text: 'With the best French troops tied down in Spain, the Archduke Charles has rebuilt the army and Count Stadion calls on all Germany to rise. This may be the moment.',
      expect: 'Austria tries again while France is busy in Spain (1809)',
      opts: [{ t: 'War for the liberation of Germany', hist: true, ai: 2, fx: function () { joinSide('AUS', 'GBR'); war('AUS', 'FRA', 'Austria declares war on France: the War of the Fifth Coalition'); } },
        { t: 'Not yet', ai: 1, fx: function () { } }] },
    { id: 'schonbrunn', ch: 'The Fifth Coalition', title: 'After Wagram', who: 'AUS', from: [1809, 3], until: [1811, 6], mtth: 8,
      cond: function () { return War.atWar('AUS', 'FRA') && flag('yield:AUS:FRA') && War.warCondition('AUS').total >= 22; },
      text: 'Vienna has fallen a second time. The army is still in the field but cannot win. Peace will cost Salzburg, Galicia and the coast.',
      expect: 'A beaten Austria signs the Treaty of Schönbrunn (1809)',
      opts: [{ t: 'Sign the treaty', hist: true, ai: 2, fx: function () { makePeace('FRA', 'AUS'); leaveSide('AUS'); give(ids(['Trieste', 'Fiume', 'Pola', 'Villach', 'Klagenfurt']), 'FRA', ['AUS']); if (alive('BAV')) give(ids(['Salzburg']), 'BAV'); War.csJoin('AUS'); setFlag('schonbrunn'); War.event('surrender', 'The Treaty of Schönbrunn: Austria cedes Illyria and joins the Continental System', { a: 'AUS', b: 'FRA' }); } },
        { t: 'Fight on in Hungary', ai: 1, fx: function () { boost('AUS', { def: 0.1 }, 90); } }] },
    { id: 'marriage', ch: 'The Grand Empire', title: 'An imperial marriage', who: 'FRA', from: [1809, 10], until: [1812, 1], mtth: 40,
      cond: function () { return S().nap.state === 'emperor' && !War.atWar('FRA', 'AUS') && !War.atWar('FRA', 'RUS'); },
      text: 'The Empire needs an heir and Josephine cannot give one. The courts of Vienna and St Petersburg both have daughters. Whichever you choose will feel favoured, and the other insulted.',
      expect: 'Napoleon marries Marie-Louise of Austria (1810)',
      opts: [{ t: 'Marie-Louise of Austria', hist: true, ai: 2, fx: function () { goodwill('AUS', 'FRA', 40); goodwill('FRA', 'AUS', 40); goodwill('RUS', 'FRA', -20); setFlag('marie_louise'); if (War.marry) War.marry('FRA', 'AUS', true); } },
        { t: 'Anna Pavlovna of Russia', ai: 1, fx: function () { goodwill('RUS', 'FRA', 40); goodwill('FRA', 'RUS', 40); goodwill('AUS', 'FRA', -15); setFlag('russian_bride'); if (War.marry) War.marry('FRA', 'RUS', true); } }] },
    // 1812
    { id: 'ukase', ch: 'The Road to Moscow', title: 'The ukase of 1810', who: 'RUS', from: [1810, 6], until: [1812, 6], mtth: 40,
      cond: function () { return War.inSystem('RUS') && !flag('russian_bride'); },
      text: 'The blockade is ruining Russian merchants and landowners alike, and French troops in the Duchy of Warsaw are a pistol at our head. The Tsar can open the ports to neutral ships and tax French goods instead.',
      expect: 'Russia quits the Continental System (end of 1810)',
      opts: [{ t: 'Open the ports', hist: true, ai: 2, fx: function () { War.csLeave('RUS'); setFlag('ukase'); } },
        { t: 'Keep faith with France', ai: 1, fx: function () { goodwill('FRA', 'RUS', 15); } }] },
    { id: 'russia1812', ch: 'The Road to Moscow', title: 'The Grande Armée gathers', who: 'FRA', from: [1812, 3], until: [1814, 1], mtth: 30,
      cond: function () { var c = War.warCondition('FRA'); return flag('ukase') && !War.atWar('FRA', 'RUS') && alive('RUS') && (c.total < 15 || (S().mode === 'historical' && c.occ + c.cap < 10)); },   // history does not wait for France to feel rested
      text: 'Six hundred thousand men from every nation of Europe are massing on the Niemen. The Tsar has broken his word. One short campaign, a battle near the border, and he will come to heel.',
      expect: 'France invades Russia (June 1812)',
      opts: [{ t: 'Cross the Niemen', hist: true, ai: 2, fx: function () { war('FRA', 'RUS', 'France invades Russia'); setFlag('war1812'); boost('FRA', { spd: 0.1 }, 90); if (S().mode === 'historical') boost('RUS', { def: 0.15 }, 540); } },
        { t: 'Keep the peace', ai: 1, fx: function () { goodwill('RUS', 'FRA', 10); } }] },
    { id: 'moscow', side: true, ch: 'The Road to Moscow', title: 'Moscow burns', who: 'RUS', from: [1805, 9], until: [1820, 1], mtth: 3,
      cond: function () { var m = prov('Moscow'); return m && m.owner === 'RUS' && War.atWar('RUS', m.ctrl) && !flag('moscow'); },
      text: 'The enemy is in Moscow. The governor has emptied the city and his men wait with torches. Let the invader winter in ashes.',
      expect: 'If Moscow falls, the Russians burn it',
      opts: [{ t: 'Burn the city', hist: true, ai: 2, fx: function () { var m = prov('Moscow'); setFlag('moscow'); War.resist[m.id] = 1; War.econ.P[m.id].pop = Math.round(War.econ.P[m.id].pop * 0.6); War.divs.forEach(function (d) { if (d.prov === m.id && d.tag !== 'RUS') { d.org = Math.min(d.org, 0.2); d.str = Math.max(0.1, d.str - 0.1); } }); boost('RUS', { def: 0.15 }, 180); } },
        { t: 'Defend it street by street', ai: 1, fx: function () { setFlag('moscow'); } }] },
    { id: 'berezina', side: true, ch: 'The Road to Moscow', title: 'General Winter', who: 'FRA', from: [1812, 10], until: [1814, 1], mtth: 10,
      cond: function () { var w = War.year() % 1; return flag('war1812') && War.atWar('FRA', 'RUS') && War.day - S().flags.war1812 > 150 && (w > 0.8 || w < 0.2) && War.warCondition('RUS').total < 45; },
      text: 'The Russians would not make peace and would not stand. Now the snow has come. Horses die in their thousands, the roads are lined with the frozen and the Cossacks pick off stragglers. At the Berezina the last bridges are burning.',
      expect: 'If Russia holds out into the winter, the Grande Armée dies in the snow',
      opts: [{ t: 'Save what can be saved', hist: true, ai: 2, fx: function () {
          var hist = S().mode === 'historical' && War.player !== 'FRA', lost = 0;
          War.divs.forEach(function (d) {
            if (d.tag !== 'FRA' && !War.allied(d.tag, 'FRA')) return;
            var p = War.provs[d.prov], inRussia = p.owner === 'RUS' || (p.ctrl === 'RUS');
            if (inRussia) { d.str = Math.max(0.05, d.str * 0.35); d.org = 0.05; lost++; }
            else if (hist && d.tag === 'FRA') { d.str = Math.max(0.1, d.str * 0.7); d.org = Math.min(d.org, 0.4); }
          });
          if (hist) { War.M.FRA.manpower = Math.round(War.M.FRA.manpower * 0.5); boost('FRA', { org: -0.1, atk: -0.1 }, 540); }
          setFlag('berezina'); War.event('story', 'The Grande Armée is destroyed in the Russian winter', { a: 'FRA', b: 'RUS' }); } }] },
    { id: 'tauroggen', ch: 'The Sixth Coalition', title: 'The Convention of Tauroggen', who: 'PRU', from: [1812, 10], until: [1814, 6], mtth: 25,
      cond: function () { return flag('war1812') && War.atWar('FRA', 'RUS') && !War.atWar('PRU', 'FRA') && alive('PRU') && (War.warCondition('FRA').total >= 8 || divsIn('FRA', 'RUS') < 8); },
      text: 'General Yorck has signed his own truce with the Russians. The country is seething. Scharnhorst\'s reformed army and the new Landwehr are ready, and the King is being dragged towards war.',
      expect: 'Prussia rises against France after the retreat from Moscow (1813)',
      opts: [{ t: 'To my people! War on France', hist: true, ai: 2, fx: function () { joinSide('PRU', 'RUS'); war('PRU', 'FRA', 'Prussia rises against France: the War of the Sixth Coalition'); spawnAt('PRU', 'Breslau', 4, 0.8); War.csLeave('PRU', true); setFlag('war1813'); } },
        { t: 'Stay loyal to France', ai: 1, fx: function () { } }] },
    { id: 'aus1813', ch: 'The Sixth Coalition', title: 'Metternich chooses', who: 'AUS', from: [1813, 3], until: [1814, 12], mtth: 30,
      cond: function () { return (flag('war1813') || flag('berezina')) && War.atWar('FRA', 'PRU') && !War.atWar('AUS', 'FRA') && alive('AUS'); },   // Prussia may already be in the field when the Grande Armée dies
      text: 'Napoleon refuses every compromise Metternich offers. Austria holds the balance: join the coalition, or let Prussia and Russia fight it out alone.',
      expect: 'Austria joins the Sixth Coalition (August 1813)',
      opts: [{ t: 'Join the coalition', hist: true, ai: 2, fx: function () { joinSide('AUS', 'RUS'); war('AUS', 'FRA', 'Austria joins the Sixth Coalition'); War.csLeave('AUS', true); } },
        { t: 'Stay out (the Emperor is our son-in-law)', ai: 1, fx: function () { } }] },
    { id: 'trachenberg', ch: 'The Sixth Coalition', title: 'The Trachenberg Plan', who: 'RUS', from: [1813, 3], until: [1815, 1], mtth: 15,
      cond: function () { return War.atWar('RUS', 'FRA') && (War.atWar('PRU', 'FRA') || War.atWar('AUS', 'FRA')) && S().nap.state === 'emperor'; },
      text: 'At Trachenberg the allied commanders agree a simple plan: never fight Napoleon himself, beat his marshals one by one, and close in from three sides. Bernadotte, once a French marshal, now Crown Prince of Sweden, offers to lead the northern army.',
      expect: 'The allies combine against France and Sweden joins them (1813)',
      opts: [{ t: 'Adopt the plan (allies +15% attack, +10% defence for 18 months)', hist: true, ai: 2, fx: function () {
          if (alive('SWE') && !War.atWar('SWE', 'FRA')) { joinSide('SWE', 'RUS'); war('SWE', 'FRA', 'Sweden joins the Sixth Coalition under Bernadotte'); }
          ['RUS', 'PRU', 'AUS', 'SWE', 'GBR'].forEach(function (t) { if (alive(t) && War.atWar(t, 'FRA')) boost(t, { atk: 0.15, def: 0.1 }, 540); });
          setFlag('trachenberg'); } },
        { t: 'Every army fights its own war', ai: 1, fx: function () { } }] },
    { id: 'leipzig', ch: 'The Sixth Coalition', title: 'The Battle of the Nations', who: 'FRA', from: [1813, 6], until: [1815, 6], mtth: 20,
      cond: function () { return flag('trachenberg') && War.enemies('FRA').filter(function (t) { return War.nations[t].major; }).length >= 3 && S().nap.state === 'emperor'; },
      text: 'Half a million men are closing on Leipzig from every side. The Saxons are wavering, the conscripts of 1814 are boys, and the Empire has been at war for twenty years.',
      expect: 'Too many enemies at once: the Empire bleeds (1813)',
      opts: [{ t: 'Call up the boys of 1815 (more men, but the country tires)', hist: true, ai: 2, fx: function () { setFlag('leipzig'); War.M.FRA.manpower += 150000; boost('FRA', { org: -0.1 }, 365); if (S().mode === 'historical' && War.player !== 'FRA') { ['SAX', 'BAV', 'WUR', 'BAD', 'HDA'].forEach(function (a) { if (alive(a) && War.allied(a, 'FRA') && a !== War.player) { leaveSide(a); makePeace(a, War.enemies('FRA')[0] || 'RUS'); } }); } } },
        { t: 'Fall back to the Rhine (+20% defence, give up Germany)', ai: 1, fx: function () { setFlag('leipzig'); boost('FRA', { def: 0.2 }, 365); War.allies('FRA').forEach(function (a) { if (War.nations[a] && !War.nations[a].major && a !== 'ITA' && a !== 'BAT') leaveSide(a); }); } }] },
    // The end of the Empire, or not
    { id: 'abdication', side: true, ch: 'The Fall of the Empire', title: 'The Marshals\' revolt', who: 'FRA', from: [1805, 9], until: [1830, 1], mtth: 10,
      cond: function () { var p = prov('Paris'); var c = War.warCondition('FRA').total; return S().nap.state === 'emperor' && !flag('hundred') && (War.atWar('FRA', p.ctrl) || c >= 55 || (S().mode === 'historical' && War.player !== 'FRA' && flag('leipzig') && at(1814, 1) && (c >= 25 || (c >= 18 && War.M.FRA.manpower < 8000)) && War.enemies('FRA').filter(function (t) { return War.nations[t].major; }).length >= 3)); },
      text: 'The allies are at the gates of Paris and the marshals will not march again. Ney tells the Emperor to his face that the army will obey its generals.',
      expect: 'When Paris falls or France is ruined: Napoleon abdicates and goes to Elba',
      opts: [{ t: 'Abdicate. Exile to Elba', hist: true, ai: 2, fx: function () {
          sideline('elba'); setFlag('elba'); S().nap.left = War.day; rename('FRA', 'Kingdom of France', 'France');
          War.enemies('FRA').forEach(function (e) { makePeace('FRA', e); }); leaveSide('FRA'); var s = S(); s.cs.on = false; s.cs.members = {};
          War.event('surrender', 'Napoleon abdicates; the Bourbons return to Paris', { a: 'FRA' }); } },
        { t: 'Fight to the last', ai: 1, fx: function () { boost('FRA', { def: 0.2 }, 60); } }] },
    { id: 'hundreddays', side: true, ch: 'The Fall of the Empire', title: 'The flight of the eagle', who: 'FRA', from: [1805, 9], until: [1830, 1], mtth: 60,
      cond: function () { var n = S().nap; return n.state === 'elba' && War.day - (n.left || 0) > 240 && !War.atWarAny('FRA'); },
      text: 'Napoleon has landed at Golfe-Juan with a thousand men. The regiments sent to stop him are going over one by one. In twenty days he will be in Paris.',
      expect: 'From Elba, the Hundred Days',
      opts: [{ t: 'Vive l\'Empereur! The Hundred Days', hist: true, ai: 2, fx: function () {
          bringBack(); rename('FRA', 'French Empire', 'France'); setFlag('hundred'); spawnAt('FRA', 'Paris', 8, 0.9);
          ['GBR', 'PRU', 'AUS', 'RUS'].forEach(function (t) { if (alive(t)) war(t, 'FRA', War.nations[t].short + ' declares war on Napoleon: the Seventh Coalition'); });
          ['PRU', 'AUS', 'RUS'].forEach(function (t) { if (alive(t)) joinSide(t, 'GBR'); }); } },
        { t: 'Stay on Elba', ai: 1, fx: function () { setFlag('stay_elba'); } }] },
    { id: 'sthelena', side: true, ch: 'The Fall of the Empire', title: 'Saint Helena', who: 'FRA', from: [1805, 9], until: [1830, 1], mtth: 8,
      cond: function () { var n = S().nap; if (!flag('hundred') || n.state !== 'emperor') return false; var b = S().bigWin, since = War.day - S().flags.hundred, hist = S().mode === 'historical' && War.player !== 'FRA';
        return War.atWar('FRA', prov('Paris').ctrl) || War.warCondition('FRA').total >= 40 || (hist && ((b && b.lose === 'FRA' && b.day > S().flags.hundred && since > 60) || since > 240)); },
      text: 'The last army is gone. This time the allies will take no chances: a rock in the South Atlantic, a thousand miles from anywhere.',
      expect: 'If the Hundred Days fail: Saint Helena',
      opts: [{ t: 'Surrender to the British', hist: true, ai: 2, fx: function () { sideline('helena'); setFlag('helena'); rename('FRA', 'Kingdom of France', 'France'); War.enemies('FRA').forEach(function (e) { makePeace('FRA', e); }); } }] },
    { id: 'vienna', ch: 'The Fall of the Empire', title: 'The Congress of Vienna', who: 'AUS', from: [1813, 1], until: [1830, 1], mtth: 20,
      cond: function () { return (flag('elba') || flag('helena')) && !War.atWar('FRA', 'AUS') && !flag('vienna') && !(S().nap.state === 'emperor' && flag('hundred') && !flag('helena')); },
      text: 'Kings, ministers and their wives have come to Vienna to dance and to redraw the map of Europe. The princes Napoleon dispossessed want their lands back; the victors want their reward.',
      expect: 'After Napoleon\'s fall: the Congress of Vienna redraws Europe',
      opts: [{ t: 'Restore the old order', hist: true, ai: 2, fx: function () { congress(); } }] },
    // When history goes the other way
    { id: 'pax', ch: 'Another History', title: 'Peace with the Empire?', who: 'GBR', from: [1807, 1], until: [1830, 1], mtth: 40,
      cond: function () { return War.atWar('GBR', 'FRA') && S().nap.state === 'emperor' && (yieldedSince('RUS', 'FRA', 'war1812') || War.factionOf('FRA') && War.factionOf('FRA').members.length >= 10) && War.allies('GBR').filter(function (a) { return War.atWar(a, 'FRA'); }).length === 0; },
      text: 'Britain stands alone. Every port from Lisbon to St Petersburg is shut, the Funds are falling and the City wants peace. The Whigs say a peace with Bonaparte would be no worse than this endless war.',
      expect: 'Only if France beats every ally: Britain makes peace with the Empire',
      opts: [{ t: 'Make peace with France', ai: 1, fx: function () { makePeace('GBR', 'FRA'); setFlag('pax'); War.event('surrender', 'The Peace of London: Britain accepts the Grand Empire', { a: 'GBR', b: 'FRA' }); } },
        { t: 'Never! Fight on alone', hist: true, ai: 2, fx: function () { boost('GBR', { def: 0.1 }, 365); } }] },
    { id: 'fallen_early', ch: 'Another History', title: 'The Emperor\'s throne trembles', who: 'FRA', from: [1805, 9], until: [1812, 1], mtth: 30,
      cond: function () { return S().nap.state === 'emperor' && (flag('yield:FRA:AUS') || flag('yield:FRA:PRU') || flag('yield:FRA:RUS') || flag('yield:FRA:GBR')) && !flag('trembles'); },
      text: 'France has been forced to sign a humiliating peace. Fouché and Talleyrand are whispering with royalists, and the Senate wonders whether it backed the wrong man.',
      expect: 'Only if France loses a war early: plots against Napoleon',
      opts: [{ t: 'Purge the plotters', ai: 2, fx: function () { setFlag('trembles'); boost('FRA', { def: 0.05 }, 180); } },
        { t: 'Win them back with a new war (+15% attack for a year)', ai: 1, fx: function () { setFlag('trembles'); boost('FRA', { atk: 0.15 }, 365); } }] },
    { id: 'grand_empire', ch: 'Another History', title: 'The Grand Empire', who: 'FRA', from: [1812, 6], until: [1830, 1], mtth: 30,
      cond: function () { return S().nap.state === 'emperor' && yieldedSince('RUS', 'FRA', 'war1812') && !flag('grand'); },
      text: 'The Tsar has signed a second peace and Europe from Cádiz to the Vistula answers to Paris. The question now is what to make of it: a family of kingdoms, or one Empire.',
      expect: 'Only if France beats Russia in 1812: the Grand Empire',
      opts: [{ t: 'A family of kingdoms (allies stronger, +goodwill)', ai: 1, fx: function () { setFlag('grand'); War.allies('FRA').forEach(function (a) { goodwill(a, 'FRA', 30); }); } },
        { t: 'One Empire (+10% attack and defence for France)', ai: 2, fx: function () { setFlag('grand'); boost('FRA', { atk: 0.1, def: 0.1 }, 3650); } }] },
    // ---------- the wider world ----------
    { id: 'braganza', ch: 'The Wider World', title: 'The court sails for Brazil', who: 'POR', from: [1807, 9], until: [1812, 1], mtth: 10,
      cond: function () { var l = prov('Lisbon'), r = prov('Rio de Janeiro'); return alive('POR') && l && r && r.owner === 'POR' && War.nations.POR.capital === 'Lisbon' && War.atWarAny('POR') && (l.ctrl !== 'POR' || l.adj.some(function (j) { return War.atWar('POR', War.provs[j].ctrl); })); },
      text: 'The enemy is at the gates of Lisbon. A British squadron waits in the Tagus, and the Prince Regent can still carry the court, the treasury and the archives across the ocean to Rio de Janeiro.',
      expect: 'If Lisbon is threatened, the Portuguese court sails for Brazil (1807)',
      opts: [{ t: 'Sail for Rio: the kingdom lives on in Brazil', hist: true, ai: 3, fx: function () { War.nations.POR.capital = 'Rio de Janeiro'; War.nations.POR.lostCapital = true; setFlag('braganza'); rename('POR', 'Kingdom of Portugal and Brazil', 'Portugal'); spawnAt('POR', 'Rio de Janeiro', 2, 0.8); War.afterPeace(); } },
        { t: 'Stay and share the fate of Lisbon', ai: 1, fx: function () { goodwill('POR', 'GBR', -10); } }] },
    { id: 'madison', ch: 'The Wider World', title: 'Mr Madison\'s war', who: 'USA', from: [1812, 4], until: [1814, 6], mtth: 40,
      cond: function () { return alive('USA') && alive('GBR') && !War.atWar('USA', 'GBR') && !War.allied('USA', 'GBR') && (War.atWar('GBR', 'FRA') || S().mode === 'historical') && !!(War.com && War.com.press.GBR); },
      text: 'British frigates stop our ships and press our seamen within sight of our own coast, and British agents arm the tribes of the north-west. The War Hawks in Congress say Canada is ours for the marching.',
      expect: 'The United States declare war on Britain over impressment (June 1812)',
      opts: [{ t: 'Free trade and sailors\' rights! War with Britain', hist: true, ai: 2, fx: function () {
          setFlag('war1812us'); duel('USA', 'GBR', 'The United States declare war on Britain');
          if (alive('TEC') && !War.atWar('TEC', 'GBR') && !War.atWar('TEC', 'USA')) duel('TEC', 'USA', 'Tecumseh\'s confederacy takes up the hatchet beside the British');
          spawnAt('USA', 'Washington', 2, 0.6); } },
        { t: 'Peace and neutral trade', ai: 1, fx: function () { goodwill('USA', 'GBR', 10); } }] },
    { id: 'ghent', ch: 'The Wider World', title: 'The Peace of Ghent', who: 'USA', from: [1814, 6], until: [1817, 1], mtth: 60,
      cond: function () { return flag('war1812us') && War.atWar('USA', 'GBR') && Math.abs(War.warScore('USA', 'GBR')) < 25; },
      text: 'Washington has burned and so has York; neither side can win. The commissioners at Ghent propose to put everything back as it was.',
      expect: 'Britain and the United States make peace with nothing changed (December 1814)',
      opts: [{ t: 'Sign: borders as before the war', hist: true, ai: 3, fx: function () { makePeace('USA', 'GBR'); setFlag('ghent'); } },
        { t: 'Fight on', ai: 1, fx: function () { } }] },
    { id: 'mayo', ch: 'The Wider World', title: 'The May Revolution', who: 'SPA', from: [1810, 5], until: [1826, 1], mtth: 40,
      cond: function () { var b = prov('Buenos Aires'); return alive('SPA') && b && b.owner === 'SPA' && (flag('peninsula') || flag('bayonne') || at(1814, 1)); },
      text: 'With the King a prisoner and the French in Seville, the town council of Buenos Aires has deposed the viceroy and set up a junta of its own. The River Plate will not be governed from Spain again.',
      expect: 'Buenos Aires throws off Spanish rule (May 1810)',
      opts: [{ t: 'Send what troops we can against the rebels', hist: true, ai: 2, fx: function () { if (liberate('ARG', 'SPA', ['AR', 'UY'], 3)) { setFlag('mayo'); war('ARG', 'SPA', 'The United Provinces of the River Plate rise against Spain'); } } },
        { t: 'Recognise the junta and keep its trade', ai: 1, fx: function () { if (liberate('ARG', 'SPA', ['AR', 'UY'], 3)) { setFlag('mayo'); goodwill('ARG', 'SPA', 30); } } }] },
    { id: 'paraguay', ch: 'The Wider World', title: 'Paraguay goes its own way', who: 'SPA', from: [1811, 5], until: [1826, 1], mtth: 40,
      cond: function () { var a = prov('Asunción'); return flag('mayo') && alive('SPA') && a && a.owner === 'SPA'; },
      text: 'Asunción has refused both the junta of Buenos Aires and the governor from Spain. Doctor Francia means to shut the country up like a walled garden.',
      expect: 'Paraguay declares independence (1811)',
      opts: [{ t: 'Let it go: there is no army to send', hist: true, ai: 2, fx: function () { liberate('PAR', 'SPA', ['PY'], 2); } },
        { t: 'Hold Asunción for the Crown', ai: 0, fx: function () { if (liberate('PAR', 'SPA', ['PY'], 2)) war('PAR', 'SPA', 'Paraguay rises against Spain'); } }] },
    { id: 'chacabuco', ch: 'The Wider World', title: 'The Army of the Andes', who: 'SPA', from: [1817, 1], until: [1828, 1], mtth: 40,
      cond: function () { var c = prov('Santiago de Chile'); return alive('ARG') && alive('SPA') && c && c.owner === 'SPA'; },
      text: 'San Martín has brought an army over the passes of the Andes, guns and all, and come down on the royalists at Chacabuco. Santiago has opened its gates to him and to O\'Higgins.',
      expect: 'San Martín crosses the Andes and frees Chile (1817)',
      opts: [{ t: 'Fight for Chile', hist: true, ai: 2, fx: function () { if (liberate('CHL', 'SPA', ['CL'], 3)) { war('CHL', 'SPA', 'Chile rises against Spain'); joinSide('CHL', 'ARG'); } } },
        { t: 'Give Chile up', ai: 1, fx: function () { liberate('CHL', 'SPA', ['CL'], 3); } }] },
    { id: 'boyaca', ch: 'The Wider World', title: 'Bolívar at Boyacá', who: 'SPA', from: [1819, 8], until: [1830, 1], mtth: 40,
      cond: function () { var b = prov('Santa Fe de Bogotá'); return alive('SPA') && b && b.owner === 'SPA' && (flag('mayo') || at(1822, 1)); },
      text: 'Bolívar has marched from the flooded plains over the freezing páramo and destroyed the royal army at the bridge of Boyacá. Bogotá is his, and he proclaims one great republic: Colombia.',
      expect: 'Bolívar frees New Granada and founds Gran Colombia (1819)',
      opts: [{ t: 'Fight for New Granada', hist: true, ai: 2, fx: function () { if (liberate('GCO', 'SPA', ['CO', 'VE', 'EC', 'PA'], 4)) war('GCO', 'SPA', 'Gran Colombia rises against Spain'); } },
        { t: 'Treat with the Liberator', ai: 1, fx: function () { liberate('GCO', 'SPA', ['CO', 'VE', 'EC', 'PA'], 4); } }] },
    { id: 'iguala', ch: 'The Wider World', title: 'The Plan of Iguala', who: 'SPA', from: [1821, 2], until: [1832, 1], mtth: 40,
      cond: function () { var m = prov('Mexico'); return alive('SPA') && m && m.owner === 'SPA' && (flag('mayo') || at(1824, 1)); },
      text: 'The royalist colonel Iturbide has gone over to the insurgents he was sent to destroy. Their plan offers independence, the Church and equality, and almost every garrison in New Spain has declared for it.',
      expect: 'Mexico wins its independence (1821)',
      opts: [{ t: 'Hold Veracruz and fight on', hist: true, ai: 1, fx: function () { if (liberate('MEX', 'SPA', ['MX', 'GT', 'SV', 'HN', 'NI', 'CR', 'US'], 5, function (p) { return p.cc !== 'US' || p.lon < -93; })) war('MEX', 'SPA', 'Mexico rises against Spain'); } },
        { t: 'Sign the treaty of Córdoba', ai: 2, fx: function () { liberate('MEX', 'SPA', ['MX', 'GT', 'SV', 'HN', 'NI', 'CR', 'US'], 5, function (p) { return p.cc !== 'US' || p.lon < -93; }); } }] },
    { id: 'ayacucho', ch: 'The Wider World', title: 'The last viceroy', who: 'SPA', from: [1821, 7], until: [1834, 1], mtth: 60,
      cond: function () { var l = prov('Lima'); return alive('SPA') && l && l.owner === 'SPA' && (alive('CHL') || alive('GCO')); },
      text: 'San Martín has landed from the sea and Bolívar is coming down from the north. Lima has declared for independence, and the last royal army in America has taken to the mountains.',
      expect: 'Peru, the last Spanish stronghold on the mainland, declares independence (1821)',
      opts: [{ t: 'Defend the mountains to the end', hist: true, ai: 2, fx: function () { if (liberate('PEU', 'SPA', ['PE', 'BO'], 3)) war('PEU', 'SPA', 'Peru rises against Spain'); } },
        { t: 'Sail home', ai: 1, fx: function () { liberate('PEU', 'SPA', ['PE', 'BO'], 3); } }] },
    { id: 'ipiranga', ch: 'The Wider World', title: 'Independence or death!', who: 'POR', from: [1822, 9], until: [1834, 1], mtth: 40,
      cond: function () { var r = prov('Rio de Janeiro'), l = prov('Lisbon'); return alive('POR') && r && r.owner === 'POR' && l && l.owner === 'POR' && l.ctrl === 'POR'; },
      text: 'The Cortes in Lisbon want Brazil a colony again. On the banks of the Ipiranga the Prince Regent Pedro has torn the Portuguese colours from his uniform: Brazil shall be an empire of its own.',
      expect: 'Brazil becomes an independent empire under Pedro I (1822)',
      opts: [{ t: 'Let our son keep his crown', hist: true, ai: 3, fx: function () { if (liberate('BRZ', 'POR', ['BR'], 5)) { if (War.nations.POR.capital !== 'Lisbon') { War.nations.POR.capital = 'Lisbon'; rename('POR', 'Kingdom of Portugal', 'Portugal'); } goodwill('BRZ', 'POR', 20); War.afterPeace(); } } },
        { t: 'Send the fleet to bring Brazil to heel', ai: 1, fx: function () { if (liberate('BRZ', 'POR', ['BR'], 5)) { if (War.nations.POR.capital !== 'Lisbon') { War.nations.POR.capital = 'Lisbon'; rename('POR', 'Kingdom of Portugal', 'Portugal'); } war('BRZ', 'POR', 'Brazil rises against Portugal'); } } }] }
  ];
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
  function congress() {
    setFlag('vienna');
    var moved = 0, client = { BAV: 1, ITA: 1, HES: 1, BRG: 1, SAX: 1, WUR: 1, BAD: 1, BAT: 1 };
    War.provs.forEach(function (p) {
      var core = War.core[p.id]; if (!core || core === p.owner || !alive(core)) return;
      if (p.owner === 'FRA' || (client[p.owner] && War.allied(p.owner, 'FRA')) || p.owner === 'HES' || p.owner === 'SAX') { if (!War.atWar(core, p.owner)) { p.owner = core; p.ctrl = core; moved++; } }
    });
    if (moved) War.afterPeace();
    War.factions.slice().forEach(function (f) { if (f.members.indexOf('FRA') >= 0) f.members.slice().forEach(function (m) { if (m !== 'FRA') War.leaveFaction(m, true); }); });
    ['GBR', 'AUS', 'PRU', 'RUS', 'FRA'].forEach(function (a) { ['GBR', 'AUS', 'PRU', 'RUS', 'FRA'].forEach(function (b) { if (a < b) War.truce[War.key(a, b)] = War.day + 1800; }); });
    rename('HES', 'Electorate of Hesse-Kassel', 'Hesse-Kassel'); rename('SAX', 'Kingdom of Saxony', 'Saxony'); if (alive('BAT')) rename('BAT', 'Kingdom of the Netherlands', 'Netherlands');
    War.event('surrender', 'The Congress of Vienna: ' + moved + ' provinces return to their old rulers, and the Concert of Europe keeps the great powers at peace', { a: 'AUS' });
  }

  // ---------- start dates: replay history's treaties up to 1809, 1812 or 1815 ----------
  War.SCENARIOS = { 1805: { year: 1805, month: 9, name: 'The Third Coalition', blurb: 'September 1805: the Grande Armée turns from the Channel to the Danube.' },
    1809: { year: 1809, month: 4, name: 'The Fifth Coalition', blurb: 'April 1809: Austria strikes while France is bogged down in Spain.' },
    1812: { year: 1812, month: 6, name: 'The Road to Moscow', blurb: 'June 1812: six hundred thousand men gather on the Niemen.' },
    1815: { year: 1815, month: 3, name: 'The Hundred Days', blurb: 'March 1815: Napoleon has escaped from Elba and Europe marches again.' } };
  War.scenario = function (year) {
    var sc = this.SCENARIOS[year]; if (!sc || year === 1805) return;
    var self = this, s = S(), day0 = this.day;
    function fire(id, i) { var e = War.storyEventById(id); if (!e || s.fired[id] !== undefined) return; s.fired[id] = self.day; s.log.push({ id: id, day: self.day, who: e.who, choice: e.opts[i || 0].t, hist: true }); try { e.opts[i || 0].fx(); } catch (err) { if (root.console) console.warn('scenario', id, err); } }
    function mark(id) { var e = War.storyEventById(id); if (!e || s.fired[id] !== undefined) return; var o = e.opts.filter(function (x) { return x.hist; })[0] || e.opts[0]; s.fired[id] = self.day; s.log.push({ id: id, day: self.day, who: e.who, choice: o.t, hist: true }); }
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
  War.initStory = function (mode) {
    this.story = { mode: mode || 'historical', fired: {}, missed: {}, flags: {}, log: [], pending: [], names: {}, boost: {}, bigWin: null,
      nap: { state: 'emperor', gen: null, until: null, left: null }, cs: { on: false, members: {} } };
    if (this.story.mode === 'historical') this.story.flags.hist = 0;
  };
  War.storyMode = function (m) { var s = this.story; s.mode = m; if (m === 'historical') s.flags.hist = this.day; else delete s.flags.hist; };
  War.storyEventById = function (id) { for (var i = 0; i < EV.length; i++) if (EV[i].id === id) return EV[i]; return null; };
  function inWindow(e) { return at(e.from[0], e.from[1]) && (!e.until || !at(e.until[0], e.until[1])); }
  War.storyCheck = function () {
    var s = this.story, self = this; if (!s || s.mode === 'off') return;
    EV.forEach(function (e) {
      if (s.fired[e.id] !== undefined || s.missed[e.id]) return;
      if (e.until && at(e.until[0], e.until[1])) { s.missed[e.id] = self.day; return; }
      if (!inWindow(e)) return;
      if (s.pending.some(function (p) { return p.id === e.id; })) return;
      var who = e.who; if (!alive(who)) { s.missed[e.id] = self.day; return; }
      var ok = false; try { ok = e.cond(); } catch (err) { ok = false; }
      if (!ok || rnd(self) > Math.min(1, 7 / (e.mtth || 14))) return;
      if (who === self.player) { s.pending.push({ id: e.id, day: self.day }); self.event('storyevent', e.title, { a: who, id: e.id }); }
      else self.storyChoose(e, self.aiStoryChoice(e));
    });
    // Napoleon's wounds heal
    if (s.nap.state === 'wounded' && s.nap.until <= this.day) { bringBack(); if (this.player === 'FRA') this.event('story', 'The Emperor has recovered from his wound and is back with the army', { a: 'FRA' }); }
  };
  War.aiStoryChoice = function (e) {
    var s = this.story;
    if (s.mode === 'historical') { for (var i = 0; i < e.opts.length; i++) if (e.opts[i].hist) return rnd(this) < 0.95 ? i : (i + 1) % e.opts.length; }
    var tot = 0; e.opts.forEach(function (o) { tot += o.ai || 1; }); var r = rnd(this) * tot;
    for (var j = 0; j < e.opts.length; j++) { r -= e.opts[j].ai || 1; if (r <= 0) return j; }
    return 0;
  };
  War.storyChoose = function (e, i) {
    var s = this.story, o = e.opts[i] || e.opts[0];
    s.fired[e.id] = this.day; s.pending = s.pending.filter(function (p) { return p.id !== e.id; });
    s.log.push({ id: e.id, day: this.day, who: e.who, choice: o.t, hist: !!o.hist });
    try { o.fx(); } catch (err) { if (root.console) console.warn('story event failed', e.id, err); }
    if (e.who !== this.player) this.event('story', e.title + ': ' + this.nations[e.who].short + ' chooses "' + o.t + '"', { a: e.who, id: e.id });
    this.techVer++; this.ctrlVersion++; if (this.refreshSupply) this.refreshSupply();
  };
  War.storyChapter = function () { var s = this.story, last = s && s.log.length ? this.storyEventById(s.log[s.log.length - 1].id) : null; return last ? last.ch : EV[0].ch; };
  // what history expects next: open events in their window, or coming soon
  War.storyNext = function (n) {
    var s = this.story, self = this, out = [];
    EV.forEach(function (e) {
      if (s.fired[e.id] !== undefined || s.missed[e.id] || e.ch === 'Another History') return;
      if (e.side && !(inWindow(e) && (function () { try { return e.cond(); } catch (x) { return false; } })())) return;
      var open = inWindow(e), ok = false; try { ok = open && e.cond(); } catch (err) { ok = false; }
      out.push({ e: e, open: open, ready: ok, when: e.from[0] + (e.from[1] - 1) / 12 });
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
    if (st) s.story = { mode: st.mode, fired: st.fired, missed: st.missed, flags: st.flags, log: st.log, pending: st.pending, names: st.names, boost: st.boost, bigWin: st.bigWin, nap: { state: st.nap.state, until: st.nap.until, left: st.nap.left, gen: st.nap.gen }, cs: st.cs };
    return s;
  };
  var baseRestore = War.restore;
  War.restore = function (s) {
    var ok = baseRestore.call(this, s); if (!ok) return ok;
    if (s.story) {
      this.story = s.story; var self = this;
      Object.keys(this.story.names || {}).forEach(function (t) { var nm = self.story.names[t]; if (self.nations[t]) { self.nations[t].name = nm[0]; self.nations[t].short = nm[1]; } });
      if (this.story.nap.gen) this.gens = this.gens.filter(function (g) { return g.name !== NAP; });
    } else this.initStory('free');
    return ok;
  };
})(typeof window !== 'undefined' ? window : globalThis);
