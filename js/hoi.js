// More of Hearts of Iron: European tension, combat tactics, army and navy experience with reforms and drill,
// occupation laws and compliance, strategic redeployment, a timeline of the map, and intelligence estimates.
(function (root) {
  'use strict';
  var War = root.War;
  function rnd(o) { var t = o.seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var MAJOR = { FRA: 1, GBR: 1, AUS: 1, PRU: 1, RUS: 1, SPA: 1, OTT: 1, SWE: 1 };

  // ---------- European tension ----------
  // like world tension: wars, conquests and threats raise it; quiet years lower it. High tension makes
  // alliances easier, claims quicker, and lets small nations join wars they would otherwise sit out.
  War.addTension = function (v, why) {
    var h = this.hoi; if (!h) return; var before = h.tension;
    h.tension = clamp(h.tension + v, 0, 100);
    if (why && Math.abs(v) >= 1) { h.tlog.push([this.day, Math.round(v * 10) / 10, why]); if (h.tlog.length > 40) h.tlog.shift(); }
    if (Math.floor(before / 25) !== Math.floor(h.tension / 25)) this.event('tension', 'European tension is now ' + Math.round(h.tension) + '%: ' + ['calm', 'uneasy', 'tense', 'on the brink', 'at total war'][Math.floor(h.tension / 25)], {});
  };
  War.tension = function () { return this.hoi ? this.hoi.tension : 0; };
  // wars between two powers far from Europe barely trouble the chancelleries
  function farAway(W, t) { var c = W.nations[t] && W.nations[t].capital ? W.byName[W.nations[t].capital] : null; return !!(c && c.world); }
  var prevDeclare = War.declare;
  War.declare = function (a, b, quiet) {
    var was = this.atWar(a, b), r = prevDeclare.apply(this, arguments);
    if (this.hoi && !was && this.atWar(a, b)) this.addTension((MAJOR[a] && MAJOR[b] ? 6 : MAJOR[a] || MAJOR[b] ? 2.5 : 1) * (farAway(this, a) && farAway(this, b) ? 0.2 : 1), this.nations[a].short + ' goes to war with ' + this.nations[b].short);
    return r;
  };
  var prevDictate = War.dictatePeace;
  War.dictatePeace = function (t) {
    var before = this.provs.filter(function (p) { return p.owner === t.win; }).length, r = prevDictate.call(this, t);
    var gained = this.provs.filter(function (p) { return p.owner === t.win; }).length - before;
    if (this.hoi) this.addTension((gained > 0 ? Math.min(8, 1 + gained * 0.4) : -2) * (farAway(this, t.win) && farAway(this, t.lose) ? 0.2 : 1), gained > 0 ? this.nations[t.win].short + ' takes land from ' + this.nations[t.lose].short : 'Peace between ' + this.nations[t.win].short + ' and ' + this.nations[t.lose].short);
    return r;
  };
  if (War.sendUltimatum) { var prevUlt = War.sendUltimatum; War.sendUltimatum = function (t, target, id, kind) { var r = prevUlt.apply(this, arguments); if (this.hoi && !r.why) this.addTension(3, this.nations[t].short + '\'s ultimatum to ' + this.nations[target].short); return r; }; }
  if (War.annexPuppet) { var prevAnnex = War.annexPuppet; War.annexPuppet = function (m, s) { var r = prevAnnex.apply(this, arguments); if (this.hoi && !r) this.addTension(4, this.nations[m].short + ' annexes ' + this.nations[s].short); return r; }; }
  // tension makes friends readier to ally and claims quicker to justify
  if (War.allianceView) { var prevView = War.allianceView; War.allianceView = function (ai, other) { var r = prevView.call(this, ai, other); if (!this.hoi || r.score <= -99) return r; var b = Math.round(this.hoi.tension / 5); if (b) { r.score += b; r.why.push('European tension (+' + b + ')'); r.ok = r.score >= 30; } return r; }; }
  if (War.justifyClaim) { var prevJust = War.justifyClaim; War.justifyClaim = function (t, id) { var r = prevJust.apply(this, arguments); if (!r && this.hoi) { var j = this.pol.justify[this.pol.justify.length - 1]; if (j && j.tag === t) j.done = this.day + Math.round(45 * (1 - this.hoi.tension / 100 * 0.5)); } return r; }; }

  // ---------- combat tactics ----------
  // each day each side's commander picks a tactic; a good general picks better, and some tactics counter others
  var TACTICS = {
    assault: { name: 'Assault', side: 'a', atk: 0.1, text: 'A frontal attack in columns' },
    shock: { name: 'Cavalry charge', side: 'a', atk: 0.2, need: 'cav', text: 'The heavy cavalry goes in' },
    envelop: { name: 'Envelopment', side: 'a', atk: 0.18, skill: 3, text: 'A corps marches round the flank' },
    battery: { name: 'Grand battery', side: 'a', atk: 0.2, need: 'art', skill: 3, text: 'A hundred guns massed against one point' },
    probe: { name: 'Probing attack', side: 'a', atk: 0.04, cas: -0.15, text: 'Skirmishers feel out the line' },
    hold: { name: 'Hold the line', side: 'd', def: 0.1, text: 'Stand and fire' },
    square: { name: 'Form square', side: 'd', def: 0.05, counters: 'shock', text: 'Infantry forms squares against the horse' },
    reserve: { name: 'Hold back the reserve', side: 'd', def: 0.06, counters: 'envelop', text: 'A reserve waits for the flank attack' },
    slope: { name: 'Reverse slope', side: 'd', def: 0.12, counters: 'battery', terrain: 'hilly', text: 'Troops lie down behind the crest' },
    counter: { name: 'Counterattack', side: 'd', def: 0.04, atk: 0.15, counters: 'assault', text: 'The columns are met with a charge' },
    delay: { name: 'Fighting withdrawal', side: 'd', def: -0.05, cas: -0.25, text: 'Give ground slowly, keep the army whole' }
  };
  War.TACTICS = TACTICS;
  function pickTactic(W, bt, side, divs) {
    if (!divs.length) return null;
    var cm = W.cmdOf(divs[0]), skill = cm && cm.who ? (typeof cm.who === 'object' ? cm.who.skill : 2) : 2;
    if (!cm || !cm.who) { var g = W.gens.filter(function (x) { return x.tag === divs[0].tag; }).sort(function (x, y) { return y.skill - x.skill; })[0]; skill = g ? g.skill : 1; }
    var p = W.provs[bt.prov], hilly = p.terrain === 'h' || p.terrain === 'm', hasCav = false, hasArt = false;
    divs.forEach(function (d) { var s = W.stats(d); if (s.n && s.n.cav) hasCav = true; if (s.n && s.n.art) hasArt = true; });
    var opts = Object.keys(TACTICS).filter(function (k) {
      var t = TACTICS[k]; if (t.side !== side) return false;
      if (t.need === 'cav' && !hasCav) return false; if (t.need === 'art' && !hasArt) return false;
      if (t.skill && skill < t.skill) return false; if (t.terrain === 'hilly' && !hilly) return false; return true;
    });
    // a good general reads the enemy: with skill, he picks the tactic that counters theirs
    var other = side === 'a' ? bt.tacD : bt.tacA;
    if (side === 'd' && other && rnd(W) < 0.12 * skill) { var c = opts.filter(function (k) { return TACTICS[k].counters === other; })[0]; if (c) return c; }
    var best = opts.slice().sort(function (x, y) { var a = TACTICS[x], b = TACTICS[y]; return ((b.atk || 0) + (b.def || 0)) - ((a.atk || 0) + (a.def || 0)); });
    return rnd(W) < 0.25 + 0.12 * skill ? best[0] : opts[Math.floor(rnd(W) * opts.length)];
  }
  War.tacticMod = function (bt, side) {
    var A = TACTICS[bt.tacA], D = TACTICS[bt.tacD], countered = A && D && D.counters === bt.tacA, out = { atk: 0, def: 0, cas: 0 };
    if (side === 'a' && A) { if (!countered) { out.atk += A.atk || 0; out.cas += A.cas || 0; } else out.atk -= 0.1; }
    if (side === 'd' && D) { out.def += D.def || 0; out.atk += D.atk || 0; out.cas += D.cas || 0; if (countered) out.def += 0.1; }
    return out;
  };
  var prevDm = War.dm;
  War.dm = function (d, side, bt) {
    var m = prevDm ? prevDm.call(this, d, side, bt) : 1;
    if (bt && bt.tacA) { var t = this.tacticMod(bt, side); m *= side === 'a' ? 1 + t.atk : 1 + t.def + t.atk * 0.5; }
    return m;
  };
  var prevCas = War.dmCas;
  War.dmCas = function (d) {
    var m = prevCas ? prevCas.call(this, d) : 1; if (d.battle === null || d.battle === undefined) return m;
    var bt = this.battleById(d.battle); if (!bt || !bt.tacA) return m;
    var mine = bt.tag === d.tag || this.allied(d.tag, bt.tag) ? 'a' : 'd'; return m * Math.max(0.5, 1 + this.tacticMod(bt, mine).cas);
  };
  var prevFight = War.fight;
  War.fight = function (bt) {
    if (this.hoi) { var A = this.attackers(bt), D = this.defenders(bt); bt.tacA = pickTactic(this, bt, 'a', A); bt.tacD = pickTactic(this, bt, 'd', D); }
    var r = prevFight.call(this, bt);
    if (bt.last && bt.tacA) {
      var ta = TACTICS[bt.tacA], td = TACTICS[bt.tacD], cn = ta && td && td.counters === bt.tacA;
      bt.last.mods.push(['Attacker\'s tactic: ' + (ta ? ta.name : '—') + (cn ? ' (countered)' : ''), cn ? -10 : Math.round(((ta && ta.atk) || 0) * 100)]);
      if (td) bt.last.mods.push(['Defender\'s tactic: ' + td.name, Math.round(((td.def || 0) + (cn ? 0.1 : 0)) * 100)]);
      bt.tlog = bt.tlog || []; bt.tlog.push([bt.days, bt.tacA, bt.tacD]); if (bt.tlog.length > 12) bt.tlog.shift();
    }
    return r;
  };

  // ---------- army and navy experience ----------
  var REFORMS = {
    column: { kind: 'a', name: 'Attack in column', cost: 60, mods: { atk: 0.06 }, text: '+6% attack: fast, deep columns that break a line' },
    skirm: { kind: 'a', name: 'Skirmisher screens', cost: 60, mods: { def: 0.05, hills_def: 0.08 }, text: '+5% defence, +8% more in hills' },
    ordre: { kind: 'a', name: 'Ordre mixte', cost: 80, mods: { atk: 0.04, def: 0.04 }, req: 'column', text: '+4% attack and defence: line and column together' },
    corps: { kind: 'a', name: 'The corps system', cost: 90, mods: { planmax: 0.1, org: 0.05 }, text: '+10% maximum planning, +5% organisation' },
    staff: { kind: 'a', name: 'A general staff', cost: 120, mods: { plan: 0.15, spd: 0.04 }, req: 'corps', text: '+15% planning speed, +4% marching speed' },
    horseart: { kind: 'a', name: 'Massed horse artillery', cost: 80, mods: { brk: 0.08, entr: 0.05 }, text: '+8% breakthrough, +5% entrenchment' },
    gunnery: { kind: 'n', name: 'Gunnery drill', cost: 60, mods: { ngun: 0.1 }, text: 'Ships fire 10% harder' },
    signals: { kind: 'n', name: 'Popham\'s signal code', cost: 50, mods: { nspd: 0.05, nrepair: 0.1 }, text: '+5% fleet speed, +10% repair' },
    closeb: { kind: 'n', name: 'Close blockade', cost: 80, mods: { ngun: 0.04, nspot: 0.15 }, req: 'signals', text: 'Fleets watch the enemy ports more closely: +15% spotting, +4% guns' }
  };
  War.REFORMS = REFORMS;
  War.xpOf = function (t) { return (this.hoi && this.hoi.xp[t]) || { a: 0, n: 0 }; };
  War.addXp = function (t, kind, v) { if (!this.hoi || !this.nations[t]) return; var x = this.hoi.xp[t] = this.hoi.xp[t] || { a: 0, n: 0 }; x[kind] = Math.min(500, x[kind] + v); };
  War.reformBlock = function (t, id) {
    var r = REFORMS[id]; if (!r) return 'No such reform';
    var have = this.hoi.reforms[t] || {}; if (have[id]) return 'Already adopted';
    if (r.req && !have[r.req]) return 'Needs ' + REFORMS[r.req].name + ' first';
    if (this.xpOf(t)[r.kind] < r.cost) return 'Needs ' + r.cost + (r.kind === 'a' ? ' army' : ' navy') + ' experience';
    return null;
  };
  War.adoptReform = function (t, id) { var why = this.reformBlock(t, id); if (why) return why; this.hoi.xp[t][REFORMS[id].kind] -= REFORMS[id].cost; (this.hoi.reforms[t] = this.hoi.reforms[t] || {})[id] = this.day; this.techVer++; return null; };
  var prevExtra = War.extraMods;
  War.extraMods = function (tag) {
    var m = prevExtra ? prevExtra.call(this, tag) : {}, R = this.hoi && this.hoi.reforms[tag]; if (!R) return m;
    Object.keys(R).forEach(function (id) { var mods = REFORMS[id].mods; for (var k in mods) m[k] = (m[k] || 0) + mods[k]; });
    return m;
  };
  // drill: divisions at home train, at a cost in gold and order, and teach the army something
  War.setDrill = function (a, on) { a.drill = !!on; if (on) { a.wq = false; a.forced = false; } };

  // ---------- occupation laws and compliance ----------
  var LAWS = {
    military: { name: 'Military governor', share: 0.15, resist: 0.7, comp: 0.002, text: 'Soldiers keep order: resistance grows 30% slower; 15% of the land\'s wealth comes to you' },
    civil: { name: 'Civil administration', share: 0.3, resist: 1, comp: 0.004, text: 'Prefects and tax farmers: 30% of the wealth, compliance grows faster' },
    collab: { name: 'Collaboration government', share: 0.45, resist: 0.45, comp: 0.003, need: 0.5, text: 'Local notables govern for you: 45% of the wealth, resistance grows at half speed. Needs 50% compliance' },
    harsh: { name: 'Requisitions and reprisals', share: 0.5, resist: 1.6, comp: -0.005, text: 'Take everything: 50% of the wealth, but resistance grows 60% faster and compliance falls' }
  };
  War.OCCLAWS = LAWS;
  War.occLaw = function (occ, nation) { var L = this.hoi && this.hoi.occ[occ]; return (L && L[nation]) || 'military'; };
  War.complianceOf = function (occ, nation) { var n = 0, s = 0; for (var i = 0; i < this.provs.length; i++) { var f = foreignHeld(this, i); if (f && f.by === occ && f.of === nation) { n++; s += this.hoi.comp[i] || 0; } } return n ? s / n : 0; };
  War.setOccLaw = function (occ, nation, law) {
    var L = LAWS[law]; if (!L) return 'No such law';
    if (L.need && this.complianceOf(occ, nation) < L.need) return 'Needs ' + Math.round(L.need * 100) + '% compliance';
    (this.hoi.occ[occ] = this.hoi.occ[occ] || {})[nation] = law; return null;
  };
  function foreignHeld(W, i) { var p = W.provs[i], c = W.core[i]; if (p.ctrl !== p.owner) return { by: p.ctrl, of: p.owner }; if (c && c !== p.owner) return { by: p.owner, of: c }; return null; }
  var prevRes = War.resistanceDay;
  War.resistanceDay = function () {
    var before = this.resist.slice ? this.resist.slice() : null; prevRes.call(this);
    if (!before || !this.hoi) return;
    for (var i = 0; i < this.provs.length; i++) {
      var f = foreignHeld(this, i); if (!f) { this.hoi.comp[i] = 0; continue; }
      var law = LAWS[this.occLaw(f.by, f.of)], d = this.resist[i] - before[i];
      if (d > 0) this.resist[i] = before[i] + d * law.resist * (1 - 0.5 * (this.hoi.comp[i] || 0));
      // compliance grows where resistance is quiet, and falls where it is not
      var c = this.hoi.comp[i] || 0; c += (this.resist[i] < 0.3 ? law.comp : law.comp * 0.25 - 0.004 * this.resist[i]);
      this.hoi.comp[i] = clamp(c, 0, 1);
    }
  };
  function occupationIncome(W) {
    var take = {};
    W.provs.forEach(function (p, i) {
      var f = foreignHeld(W, i); if (!f || W.gone[f.by]) return;
      var law = LAWS[W.occLaw(f.by, f.of)], e = W.econ.P[i], v = e.pop * 0.0006 * law.share * (0.5 + 0.5 * (W.hoi.comp[i] || 0)) * (1 - 0.6 * (W.resist[i] || 0));
      take[f.by] = (take[f.by] || 0) + v;
      if (law === LAWS.harsh) e.pop *= 0.999;
    });
    Object.keys(take).forEach(function (t) { W.econ.N[t].treasury += take[t]; W.econ.N[t].occInc = Math.round(take[t]); });
  }
  function aiOccupation(W) {
    var held = {}; W.provs.forEach(function (p, i) { var f = foreignHeld(W, i); if (f) (held[f.by] = held[f.by] || {})[f.of] = 1; });
    Object.keys(held).forEach(function (t) {
      if (W.isHuman ? W.isHuman(t) : t === W.player) return;
      var seen = held[t];
      Object.keys(seen).forEach(function (n) { var c = W.complianceOf(t, n), want = c >= 0.55 ? 'collab' : W.atWarAny(t) ? 'military' : 'civil'; if (W.occLaw(t, n) !== want) W.setOccLaw(t, n, want); });
    });
  }

  // ---------- strategic redeployment ----------
  // march by post roads and requisitioned carts through friendly land: four times as fast, but in no state to fight
  War.redeploy = function (d, target) {
    var p = this.provs[target]; if (!p || !this.allied(d.tag, p.ctrl) && p.ctrl !== d.tag) return 'Only to land you or your allies hold';
    var r = this.orderMove(d, target, true); if (r) return r;
    var self = this; if (d.path.some(function (s) { var q = self.provs[s.to]; return s.sea || (q.ctrl !== d.tag && !self.allied(d.tag, q.ctrl)); })) { this.halt(d); return 'The road passes through hostile land'; }
    d.redeploy = true; return null;
  };
  var prevLeg = War.legDays;
  War.legDays = function (d, from, leg) { var n = prevLeg.call(this, d, from, leg); return d.redeploy ? n * 0.28 : n; };
  function redeployDay(W) {
    W.divs.forEach(function (d) {
      if (!d.redeploy) return;
      if (!d.path.length || d.battle !== null) { d.redeploy = false; return; }
      d.org = Math.min(d.org, 0.12);
      var q = W.provs[d.path[0].to]; if (q.ctrl !== d.tag && !W.allied(d.tag, q.ctrl)) { d.redeploy = false; W.halt(d); }
    });
  }

  // ---------- the timeline of the map ----------
  function timelineMonth(W) {
    var T = W.hoi.tl, idx = {}; W.tags.forEach(function (t, i) { idx[t] = i; });
    var now = W.provs.map(function (p) { return idx[p.owner]; });
    if (!T.base) { T.base = now; T.last = now.slice(); T.frames = []; T.day0 = W.day; return; }
    var ch = []; for (var i = 0; i < now.length; i++) if (now[i] !== T.last[i]) ch.push(i, now[i]);
    T.frames.push([W.day, ch]); T.last = now;
  }
  War.timelineAt = function (k) {
    var T = this.hoi.tl; if (!T.base) return null; var own = T.base.slice(), tags = this.tags;
    for (var f = 0; f < Math.min(k, T.frames.length); f++) { var ch = T.frames[f][1]; for (var i = 0; i < ch.length; i += 2) own[ch[i]] = ch[i + 1]; }
    return { day: k ? T.frames[Math.min(k, T.frames.length) - 1][0] : T.day0, owners: own.map(function (j) { return tags[j]; }) };
  };
  War.timelineLength = function () { var T = this.hoi.tl; return T.base ? T.frames.length : 0; };

  // ---------- intelligence estimates ----------
  // what you believe about another nation: exact for yourself and your allies, fuzzier the less you know
  War.estimate = function (viewer, t) {
    var exact = !viewer || viewer === t || this.allied(viewer, t), intel = exact ? 1 : Math.max(this.intel ? this.intel(viewer, t) : 0, this.atWar(viewer, t) ? 0.15 : 0.05);
    var self = this, divs = this.divs.filter(function (d) { return d.tag === t; }), men = 0;
    divs.forEach(function (d) { men += d.str * self.stats(d).men; });
    var ships = 0; (this.fleets || []).forEach(function (f) { if (f.tag === t) ships += f.ships.length; });
    var err = (1 - intel) * 0.5, seed = (t.charCodeAt(0) * 31 + t.charCodeAt(2) * 7 + Math.floor(this.day / 30)) % 97 / 97;
    function fuzz(v) { if (exact) return { v: v, lo: v, hi: v }; var mid = v * (1 + (seed - 0.5) * err); return { v: Math.round(mid), lo: Math.round(mid * (1 - err)), hi: Math.round(mid * (1 + err)) }; }
    var E = this.econ.N[t], gens = this.gens.filter(function (g) { return g.tag === t; }).sort(function (a, b) { return b.skill - a.skill; });
    return { intel: intel, exact: exact, divs: fuzz(divs.length), men: fuzz(Math.round(men)), ships: fuzz(ships), manpower: fuzz(Math.round(this.M[t].manpower || 0)), treasury: fuzz(Math.round(E.treasury || 0)),
      techs: fuzz(this.R && this.R[t] ? Object.keys(this.R[t].done).length : 0), best: intel >= 0.4 ? gens.slice(0, 3).map(function (g) { return g.name + ' (' + g.skill + ')'; }) : null,
      reforms: intel >= 0.6 ? Object.keys(this.hoi.reforms[t] || {}).map(function (k) { return REFORMS[k].name; }) : null };
  };

  // ---------- the day and the month ----------
  function hoiDay(W) {
    redeployDay(W);
    // drilling armies
    W.armies.forEach(function (a) {
      if (!a.drill) return; var n = 0;
      a.divs.forEach(function (id) { for (var i = 0; i < W.divs.length; i++) if (W.divs[i].id === id) { var d = W.divs[i]; if (d.battle === null && !d.path.length && W.provs[d.prov].owner === d.tag) { if ((d.xp || 0) < 0.45) d.xp = (d.xp || 0) + 0.0025; d.org = Math.max(0.35, d.org - 0.008); n++; } break; } });
      if (n) { W.addXp(a.tag, 'a', 0.012 * n); W.econ.N[a.tag].treasury -= 40 * n; }
    });
  }
  function hoiMonth(W) {
    W.addTension(-0.6);
    var big = 0; Object.keys(W.wars).forEach(function (k) { var w = W.wars[k]; if (MAJOR[w.a] && MAJOR[w.b]) big++; });
    W.addTension(Math.min(1.5, big * 0.3));
    occupationIncome(W); aiOccupation(W); timelineMonth(W);
    W.tags.forEach(function (t) {
      if (W.gone[t]) return; if (W.atWarAny(t) && MAJOR[t]) W.addXp(t, 'a', 0.5);
      if (W.isHuman ? W.isHuman(t) : t === W.player) return;
      // the computer adopts reforms as soon as it can
      Object.keys(REFORMS).forEach(function (id) { if (!W.reformBlock(t, id)) W.adoptReform(t, id); });
    });
  }
  // experience from battles, at sea and on land
  var prevEnd = War.endBattle;
  War.endBattle = function (bt, attackerWon) {
    var defTag = bt.defTag || this.provs[bt.prov].ctrl, n = (bt.peakA || 0) + (bt.peakD || 0);
    prevEnd.call(this, bt, attackerWon);
    if (!this.hoi || attackerWon === null || attackerWon === undefined) return;
    var win = attackerWon ? bt.tag : defTag, lose = attackerWon ? defTag : bt.tag;
    this.addXp(win, 'a', Math.min(8, 0.15 * n + bt.days * 0.08)); this.addXp(lose, 'a', Math.min(5, 0.08 * n + bt.days * 0.05));
  };
  var prevEndN = War.endNavalBattle;
  War.endNavalBattle = function (bt, F, winner) {
    var self = this, sizes = [0, 0]; [0, 1].forEach(function (k) { F[k].forEach(function (f) { sizes[k] += f.ships.length; }); });
    prevEndN.call(this, bt, F, winner);
    if (!this.hoi) return;
    [0, 1].forEach(function (k) { if (F[k][0]) self.addXp(F[k][0].tag, 'n', Math.min(10, (k === winner ? 0.2 : 0.1) * (sizes[0] + sizes[1]))); });
  };

  // ---------- hooks ----------
  War.initHoi = function () { this.hoi = { tension: 22, tlog: [], xp: {}, reforms: {}, occ: {}, comp: {}, tl: {} }; var self = this; ['FRA', 'GBR', 'AUS', 'RUS'].forEach(function (t) { self.addXp(t, 'a', 20); self.addXp(t, 'n', 10); }); };
  var baseInit = War.init;
  War.init = function (a, b, c, d) { baseInit.call(this, a, b, c, d); this.initHoi(); timelineMonth(this); };
  var baseStep = War.step;
  War.step = function () { baseStep.call(this); if (this.hoi && !this.conference) hoiDay(this); };
  var baseMonth = War.month;
  War.month = function () { baseMonth.call(this); if (this.hoi) hoiMonth(this); };
  var baseSer = War.serialize;
  War.serialize = function () {
    var s = baseSer.call(this); if (!this.hoi) return s;
    s.hoi = this.hoi;
    s.redep = this.divs.filter(function (d) { return d.redeploy; }).map(function (d) { return d.id; });
    s.drill = this.armies.filter(function (a) { return a.drill; }).map(function (a) { return a.id; });
    return s;
  };
  var baseRestore = War.restore;
  War.restore = function (s) {
    var ok = baseRestore.call(this, s); if (!ok) return ok;
    this.initHoi(); if (s.hoi) { var H = this.hoi; Object.keys(s.hoi).forEach(function (k) { H[k] = s.hoi[k]; }); }
    var R = {}; (s.redep || []).forEach(function (id) { R[id] = 1; }); this.divs.forEach(function (d) { if (R[d.id]) d.redeploy = true; });
    var D = {}; (s.drill || []).forEach(function (id) { D[id] = 1; }); this.armies.forEach(function (a) { if (D[a.id]) a.drill = true; });
    return ok;
  };
})(typeof window !== 'undefined' ? window : globalThis);
