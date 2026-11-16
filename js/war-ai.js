// The skilled computer players: generals who plan, and governments that make and end wars.
// war.js keeps the simple generals (used on the "Simple" setting); this file adds the skilled ones.
//
// A skilled general, every three days:
//   - calls off attacks that are failing, pulls cut-off divisions back toward supply
//   - withdraws stacks that are about to be overwhelmed, and keeps the capital guarded in proportion to the danger
//   - works to a plan: is the nation strong enough to attack, which enemy is the main target, and which
//     chain of provinces leads to that enemy's capital (the "axis")
//   - attacks where the odds are good, counting enemy forces next door that could strike back, and never
//     walks a lone division into a gap it cannot hold
//   - masses its reserves at the head of the axis, holds the rest of the line in proportion to what faces it
//   - ships divisions overseas when there is no way to the enemy by land
(function (root) {
  'use strict';
  var War = root.War, T = War.TYPES, T_DEF = War.T_DEF, T_WIDTH = War.T_WIDTH;
  var AGGR = { FRA: 0.022, RUS: 0.02, PRU: 0.012, AUS: 0.012, OTT: 0.012, SPA: 0.006, GBR: 0.004, SWE: 0.006 };
  // how readily each joins a coalition against an over-mighty power (1 = a European great power; unlisted minors 0.4)
  var COALITION = { OTT: 0.15, PER: 0, MOR: 0, ALG: 0, TUN: 0, TRI: 0, CAU: 0, IME: 0 }; // monthly appetite for a war of conquest

  function rnd(o) { var t = o.seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function nb(p) { return p.nb || (p.nb = p.adj.concat(p.straits)); }

  War.strength = function (tag) {
    var c = this._str; if (!c || c.day !== this.day || c.n !== this.divs.length) {   // every nation's army weighed once a day, in one pass
      c = this._str = { day: this.day, n: this.divs.length, m: {} };
      for (var i = 0; i < this.divs.length; i++) { var d = this.divs[i]; c.m[d.tag] = (c.m[d.tag] || 0) + this.power(d, 'atk'); }
    }
    return c.m[tag] || 0;
  };
  War.defAt = function (tag, id) { var s = 0, f = this.foesIn(tag, id); for (var i = 0; i < f.length; i++) s += this.power(f[i], 'def') * (1 + f[i].entr); return s * T_DEF[this.provs[id].terrain]; };
  War.holdAt = function (tag, id) { var s = 0, st = this.at[id] || []; for (var i = 0; i < st.length; i++) if (this.allied(tag, st[i].tag) && !st[i].retreat) s += this.power(st[i], 'def') * (1 + st[i].entr); return s * T_DEF[this.provs[id].terrain]; };

  // ---------- the plan ----------
  War.makePlan = function (tag, mine, foes) {
    var self = this, provs = this.provs, plan = { day: this.day, offensive: false, axis: {}, spear: -1, foe: null, fronts: [] };
    var contact = {}, isFront = {};
    var fr = this.friendlyIds ? this.friendlyIds(tag) : null, len = fr ? fr.length : provs.length;
    for (var ii = 0; ii < len; ii++) {
      var i = fr ? fr[ii] : ii, p = provs[i]; if (!this.friendly(tag, p)) continue;
      var n = nb(p);
      for (var j = 0; j < n.length; j++) { var q = provs[n[j]]; if (this.hostile(tag, q)) { contact[q.ctrl] = 1; if (!isFront[i]) { isFront[i] = 1; plan.fronts.push(i); } } }
    }
    var mineP = this.strength(tag), foeP = 0, helpP = 0, cf = Object.keys(contact);
    cf.forEach(function (f) { foeP += self.strength(f); });
    this.allies(tag).forEach(function (a) { if (!self.gone[a] && cf.some(function (f) { return self.atWar(a, f); })) helpP += self.strength(a); });
    plan.ratio = (mineP + 0.7 * helpP) / Math.max(foeP, 1);
    plan.offensive = cf.length > 0 && plan.ratio >= (tag === 'FRA' ? 0.85 : 1.0);
    if (!cf.length) return plan;

    // main target: the enemy whose capital is closest and whose army is weakest
    var best = null;
    cf.forEach(function (f) {
      var capName = self.nations[f].capital, cap = capName ? self.byName[capName] : null;
      if (!cap || cap.owner !== f || self.friendly(tag, cap)) return;
      var prev = {}, q = [cap.id], h = 0, end = -1; prev[cap.id] = -1;
      while (h < q.length && end < 0) {
        var id = q[h++], n2 = nb(provs[id]);
        for (var k = 0; k < n2.length; k++) {
          var x = n2[k]; if (prev[x] !== undefined) continue; var px = provs[x];
          if (self.friendly(tag, px)) { prev[x] = id; end = x; break; }
          if (self.hostile(tag, px)) { prev[x] = id; q.push(x); }
        }
      }
      if (end < 0) return;
      var path = [], at = end; while (at !== -1) { path.push(at); at = prev[at]; }
      var score = path.length * (0.6 + self.strength(f) / (mineP + 1));
      if (!best || score < best.score) best = { score: score, foe: f, path: path };
    });
    if (best) { plan.foe = best.foe; plan.spear = best.path[0]; best.path.forEach(function (id) { plan.axis[id] = 1; }); plan.next = best.path[1]; }
    return plan;
  };

  // ---------- orders ----------
  var EXPEDITION = { QNG: 0.4, JAP: 0.2, KOR: 0.2, USA: 0.5, TEC: 0.3, CRE: 0.3, SIO: 0.3, COM: 0.3, FRA: 1, RUS: 0.35, GBR: 0.6, OTT: 0.5, PER: 0.5, SWE: 0.5, SPA: 0.5, PRU: 0.7, AUS: 0.8 };
  // provinces from the nation's own soil, for limiting distant expeditions
  War.hopsHome = function (tag) {
    var c = this._hops || (this._hops = {}); if (c[tag] && this.day - c[tag].day < 8 && c[tag].v === this.start0ver) return c[tag].h;
    var h = new Int16Array(this.provs.length).fill(99), q = [], self = this;
    var own = this.ownIds ? this.ownIds(tag) : null;
    if (own) for (var o = 0; o < own.length; o++) { h[own[o]] = 0; q.push(own[o]); } else this.provs.forEach(function (p) { if (p.owner === tag) { h[p.id] = 0; q.push(p.id); } });
    for (var i = 0; i < q.length; i++) { var p = this.provs[q[i]], nb = p.nb || (p.nb = p.adj.concat(p.straits)); for (var j = 0; j < nb.length; j++) if (h[nb[j]] > h[q[i]] + 1) { h[nb[j]] = h[q[i]] + 1; q.push(nb[j]); } }
    c[tag] = { day: this.day, h: h, v: this.start0ver }; return h;
  };
  War.aiOrders2 = function (tag) {
    var self = this, provs = this.provs, foes = this.enemies(tag); if (!foes.length) return;
    var mine = this.divs.filter(function (d) { return d.tag === tag && (d.garrison === undefined || d.garrison === null); }); if (!mine.length) return;
    this.plans = this.plans || {};
    var plan = this.plans[tag]; if (!plan || this.day - plan.day >= 9) plan = this.plans[tag] = this.makePlan(tag, mine, foes);
    var capName = this.nations[tag].capital, cap = capName ? this.byName[capName] : null; if (cap && cap.ctrl !== tag) cap = null;
    var used = {}, bold = tag === 'FRA' ? -0.1 : 0;
    function idleNow() { return mine.filter(function (d) { return !d.path.length && !d.retreat && d.battle === null && !used[d.id]; }); }
    function go(d, to, peaceful) { if (self.orderMove(d, to, peaceful)) return false; used[d.id] = 1; return true; }

    // Expeditions: a power fighting far from its own borders sends a corps, not its whole army. Divisions more than
    // five provinces from home are capped at a share of the army; the rest stay home (Russia in 1805 sent a quarter).
    var share = EXPEDITION[tag] !== undefined ? EXPEDITION[tag] : 0.6; if (this.storyExpedition) share = Math.max(share, this.storyExpedition(tag)); var invaded = this.warCondition ? this.warCondition(tag).occ > 5 : false;
    if (share < 1 && !invaded) {
      var hops = this.hopsHome(tag), far = mine.filter(function (d) { return hops[d.prov] > 5; }), cap0 = Math.max(3, Math.round(mine.length * share));
      if (far.length > cap0) {
        far.sort(function (a, b) { return a.str * a.org - b.str * b.org; }).slice(0, far.length - cap0).forEach(function (d) {
          if (d.battle !== null || d.retreat) return;
          var home = self.nearest(d.prov, function (q) { return q.owner === tag && q.ctrl === tag; }); if (home !== null) go(d, home, true);
        });
      } else {
        // the home army does not set out while the expedition is at strength
        var room = cap0 - far.length, home = mine.filter(function (d) { return hops[d.prov] <= 5; });
        home.forEach(function (d) { if (hops[d.prov] <= 1 && room <= 0) used[d.id] = 1; });
        home.sort(function (a, b) { return hops[b.prov] - hops[a.prov]; }).forEach(function (d) { if (room > 0 && hops[d.prov] >= 2) room--; });
      }
    }

    // call off attacks that are plainly failing
    this.battles.forEach(function (bt) {
      if (!self.allied(bt.tag, tag) || bt.days < 4 || bt.r >= 0.55) return;
      self.attackers(bt).forEach(function (d) { if (d.tag === tag) { self.halt(d); used[d.id] = 1; } });
    });

    // divisions cut off from supply make for friendly ground
    idleNow().forEach(function (d) {
      if (!d.nosupply) return;
      var home = self.nearest(d.prov, function (q) { return self.allied(tag, q.owner) && self.friendly(tag, q); });
      if (home !== null) go(d, home, false);
    });

    // stacks about to be overwhelmed fall back, unless they are holding the capital
    var stacks = {}; idleNow().forEach(function (d) { (stacks[d.prov] = stacks[d.prov] || []).push(d); });
    Object.keys(stacks).forEach(function (key) {
      var id = +key, list = stacks[id]; if (cap && id === cap.id) return;
      var threat = self.threatTo(tag, id); if (!threat) return;
      var hold = self.holdAt(tag, id), org = 0; list.forEach(function (d) { org += d.org; }); org /= list.length;
      if (!(threat > 3.2 * hold || (threat > 2 * hold && org < 0.6))) return;
      var best = -1, bv = 1e9;
      nb(provs[id]).forEach(function (x) {
        var q = provs[x]; if (!self.friendly(tag, q) || self.foesIn(tag, x).length) return;
        var v = self.threatTo(tag, x) - 0.5 * self.holdAt(tag, x) - (q.owner === tag ? 2 : 0);
        if (v < bv) { bv = v; best = x; }
      });
      if (best >= 0 && self.threatTo(tag, best) < threat * 0.8) list.forEach(function (d) { go(d, best, true); });
    });

    // the capital's guard grows with the danger to it
    if (cap) {
      var danger = this.threatTo(tag, cap.id), need = danger > 0 ? Math.max(2, Math.ceil(danger * 0.7 / (9 * T_DEF[cap.terrain]))) : (mine.length >= 5 ? 1 : 0);
      need = Math.min(need, Math.ceil(mine.length * 0.5));
      var there = mine.filter(function (d) { return (d.path.length ? d.path[d.path.length - 1].to : d.prov) === cap.id; });
      there.slice(0, need).forEach(function (d) { used[d.id] = 1; });
      if (there.length < need) {
        var capDist = this.hopsFrom(tag, cap.id), pool = idleNow().filter(function (d) { return capDist[d.prov] > 0; }).sort(function (a, b) { return capDist[a.prov] - capDist[b.prov]; });
        pool.slice(0, need - there.length).forEach(function (d) { go(d, cap.id, true); });
      }
    }

    // ----- attacks -----
    var fresh = idleNow().filter(function (d) { return d.org >= 0.6 && !d.nosupply; }), near = {};
    fresh.forEach(function (d) { nb(provs[d.prov]).forEach(function (x) { if (self.hostile(tag, provs[x])) (near[x] = near[x] || []).push(d); }); });
    var targets = Object.keys(near).map(function (key) {
      var id = +key, e = provs[id], n = nb(e), friends = 0;
      for (var i = 0; i < n.length; i++) if (self.friendly(tag, provs[n[i]])) friends++;
      var capOf = self.nations[e.owner] && self.nations[e.owner].capital === e.name;
      var value = 1 + Math.min(3, self.econ.P[id].pop / 200000) + (capOf ? 6 : 0) + (plan.axis[id] ? 3 : 0) + (self.econ.P[id].b.port ? 1 : 0) + (friends / n.length >= 0.7 ? 2 : 0) + (self.allied(tag, e.owner) ? 3 : 0);
      return { id: id, value: value, def: self.defAt(tag, id) };
    }).sort(function (a, b) { return b.value / (1 + b.def / 30) - a.value / (1 + a.def / 30); });

    targets.forEach(function (tg) {
      var id = tg.id, e = provs[id], avail = near[id].filter(function (d) { return !used[d.id]; }); if (!avail.length) return;
      var around = self.threatTo(tag, id), onAxis = !!plan.axis[id];
      var sd = self.supplyDist && self.supplyDist[tag], reach = sd ? Math.min.apply(null, avail.map(function (d) { return sd[d.prov] < 0 ? 99 : sd[d.prov]; })) : 0;
      if (reach >= 9 && !onAxis && !self.allied(tag, e.owner)) return;       // no side-shows at the end of a long supply line
      if (reach >= 6 && self.winterAt(e) && e.lat > 54 && e.lon > 24 && tg.value < 7) return; // nor deeper into a Russian winter
      if (tg.def === 0) {
        // an open province: send enough to hold it against what is next door, cavalry first; never a lone division into the lion's mouth
        avail.sort(function (a, b) { return (b.type === 'cav') - (a.type === 'cav') || b.str - a.str; });
        var sent = 0, hold = 0, needHold = 0.6 * around, max = plan.offensive && onAxis ? 5 : 3;
        if (needHold > 0 && !plan.offensive && !self.allied(tag, e.owner)) return;
        for (var i = 0; i < avail.length && sent < max; i++) {
          if (sent >= 1 && hold >= needHold) break;
          var d = avail[i]; if (self.guardNeeded(tag, d, used)) continue;
          if (go(d, id, false)) { sent++; hold += self.power(d, 'def') * T_DEF[e.terrain]; }
        }
        return;
      }
      var existing = self.battleAt(id), att = 0, joined = 0;
      if (existing && !self.allied(existing.tag, tag)) return;
      avail.forEach(function (d) { att += self.power(d, 'atk'); });
      if (existing) self.attackers(existing).forEach(function (d) { joined += self.power(d, 'atk'); });
      var thr = (plan.offensive ? 1.25 : 1.5) + bold - (onAxis ? 0.1 : 0) - (tg.value >= 7 ? 0.1 : 0) - (self.allied(tag, e.owner) ? 0.2 : 0);
      var def = tg.def + 0.15 * around; // the neighbours may come to help
      if ((att + joined) / def < thr) return;
      var power = joined, n2 = 0;
      avail.sort(function (a, b) { return self.power(b, 'atk') - self.power(a, 'atk'); }).forEach(function (d) {
        if (power / tg.def > (onAxis ? 2.6 : 2.1) || n2 >= T_WIDTH[e.terrain] + 2) return;
        if (self.guardNeeded(tag, d, used, id)) return;
        if (go(d, id, false)) { n2++; power += self.power(d, 'atk'); }
      });
    });

    // ----- redeploy along the front -----
    var rest = idleNow().filter(function (d) { return d.org >= 0.35; }); if (!rest.length) return;
    var fronts = plan.fronts.filter(function (id) { return self.friendly(tag, provs[id]); }), want = {}, have = {}, sum = 0;
    fronts.forEach(function (id) {
      var p = provs[id], w = 0.6 + self.threatTo(tag, id) / 10 + (p.owner === tag ? 0.4 : 0);
      if (cap && nb(p).indexOf(cap.id) >= 0) w += 1;
      want[id] = w; sum += w;
    });
    if (plan.offensive && plan.spear >= 0 && want[plan.spear] !== undefined) {
      var extra = 0.45 * sum; want[plan.spear] += extra; sum += extra;
      nb(provs[plan.spear]).forEach(function (x) { if (want[x] !== undefined) { want[x] += 0.08 * sum; sum += 0.08 * sum; } });
    }
    mine.forEach(function (d) { var at = d.path.length ? d.path[d.path.length - 1].to : d.prov; have[at] = (have[at] || 0) + 1; });
    var spill = 0;
    fronts.forEach(function (id) { var w = want[id] / sum * mine.length, lim = self.supplyLimit(id) + 1; if (w > lim) { spill += w - lim; w = lim; } want[id] = w; });
    if (spill > 0 && fronts.length) fronts.forEach(function (id) { want[id] += spill / fronts.length; });
    var cache = {}, stranded = [];
    rest.forEach(function (d) {
      var dist = cache[d.prov] || (cache[d.prov] = self.hopsFromCached(tag, d.prov)), best = -1, bv = -1e9;
      var here = want[d.prov] !== undefined ? want[d.prov] - (have[d.prov] || 0) + 1 : -1e9, any = false;
      for (var i = 0; i < fronts.length; i++) { var f = fronts[i]; if (dist[f] < 0) continue; any = true; var v = (want[f] - (have[f] || 0)) - 0.12 * dist[f]; if (v > bv) { bv = v; best = f; } }
      if (!any) { stranded.push(d); return; }
      if (best < 0 || best === d.prov || bv <= here + 0.6) return;
      if (go(d, best, true)) { have[d.prov] = (have[d.prov] || 1) - 1; have[best] = (have[best] || 0) + 1; }
    });

    // ----- across the sea -----
    if (stranded.length) this.aiSea(tag, plan, mine, stranded, fronts, want, have);
  };

  // Should this division stay where it is to keep its province from being left open to the enemy next door?
  War.guardNeeded = function (tag, d, used, target) {
    var id = d.prov, st = this.at[id] || [], staying = 0, self = this;
    for (var i = 0; i < st.length; i++) if (st[i] !== d && this.allied(tag, st[i].tag) && !st[i].path.length && !used[st[i].id]) staying++;
    if (staying > 0) return false;
    var n = nb(this.provs[id]);
    for (i = 0; i < n.length; i++) if (n[i] !== target && self.foesIn(tag, n[i]).length) return this.provs[id].owner === tag || this.allied(tag, this.provs[id].owner);
    return false;
  };
  // steps from a province to every other, over friendly ground only (-1 = cannot be reached by land)
  War.hopsFrom = function (tag, from) {
    var provs = this.provs, dist = new Int16Array(provs.length).fill(-1), q = [from], h = 0; dist[from] = 0;
    while (h < q.length) { var id = q[h++], n = nb(provs[id]); for (var i = 0; i < n.length; i++) { var x = n[i]; if (dist[x] < 0 && this.friendly(tag, provs[x])) { dist[x] = dist[id] + 1; q.push(x); } } }
    return dist;
  };

  // the same, remembered for a few days: the lie of friendly land changes slowly, and marches are re-planned anyway
  War.hopsFromCached = function (tag, from) {
    var C = this._hf || (this._hf = {}), c = C[tag];
    if (!c || this.day - c.day >= 6 || this.day < c.day) c = C[tag] = { day: this.day, m: {} };
    return c.m[from] || (c.m[from] = this.hopsFrom(tag, from));
  };

  // Divisions with no land route to any front: bring them to a port, then ship them to the front, or
  // failing that land them on a weakly held enemy harbour.
  War.aiSea = function (tag, plan, mine, stranded, fronts, want, have) {
    var self = this, provs = this.provs, P = this.econ.P, km = this.km, range = this.AI_SEA_RANGE;
    var keep = Math.max(2, Math.ceil(mine.length * 0.3)), spare = stranded.length - keep; if (spare <= 0) return;
    stranded.sort(function (a, b) { return b.org * b.str - a.org * a.str; });
    var isPort = function (p) { return p.coastal && P[p.id].b.port > 0 && self.friendly(tag, p); };
    var landings = fronts.filter(function (id) { return provs[id].coastal; });
    var inPort = [], sent = 0;
    for (var i = 0; i < stranded.length && sent < spare; i++) {
      var d = stranded[i], p = provs[d.prov];
      if (!isPort(p)) { var port = this.nearestWithin(d.prov, 6, function (q) { return isPort(q) && q.ctrl === tag; }); if (port !== null && !this.orderMove(d, port, true)) sent++; continue; }
      var best = -1, bv = -1e9;
      for (var j = 0; j < landings.length; j++) {
        var L = landings[j], q = provs[L], dist = self.distKm(p, q); if (dist > range) continue;
        var room = this.supplyLimit(L) + 1 - (have[L] || 0); if (room <= 0) continue;
        var v = (want[L] || 0) - (have[L] || 0) - dist / 1500; if (v > bv) { bv = v; best = L; }
      }
      if (best >= 0) { if (!this.orderSea(d, best)) { have[best] = (have[best] || 0) + 1; sent++; } }
      else inPort.push(d);
    }
    // a descent on the enemy's coast, at most every three weeks
    if (inPort.length < 4 || this.day - (plan.lastLanding || -99) < 21) return;
    var byPort = {}; inPort.forEach(function (d) { (byPort[d.prov] = byPort[d.prov] || []).push(d); });
    Object.keys(byPort).forEach(function (key) {
      var force = byPort[key]; if (force.length < 4 || plan.lastLanding === self.day) return;
      var from = provs[+key], power = 0; force.forEach(function (d) { power += self.power(d, 'atk'); });
      var tgt = -1, tv = -1e9;
      provs.forEach(function (q) {
        if (!q.coastal || !self.hostile(tag, q) || !(P[q.id].b.port > 0)) return;
        var dist = self.distKm(from, q); if (dist > range) return;
        var def = self.defAt(tag, q.id), around = self.threatTo(tag, q.id);
        if (def > 0.3 * power * 0.5 || around > 0.8 * power) return; // landing halves the attack; do not land beside a field army
        var v = P[q.id].pop / 100000 - dist / 400 - around / 5 - def;
        if (v > tv) { tv = v; tgt = q.id; }
      });
      if (tgt < 0) return;
      force.slice(0, Math.min(8, self.supplyLimit(tgt) + 2)).forEach(function (d) { self.orderSea(d, tgt); });
      plan.lastLanding = self.day;
    });
  };

  // ---------- the player's armies: front lines, offensives, fallback lines, garrisons ----------
  // army = { name, divs, gen, group, front: {type:'border', foe} | {type:'line'|'garrison', provs}, targets: [province ids],
  //          fallback: [province ids] | null, autoFall, exec, stance }
  var ARMY_NAMES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
  War.STANCES = [{ name: 'Careful', thr: 1.6 }, { name: 'Balanced', thr: 1.25 }, { name: 'Aggressive', thr: 1.0 }];
  War.MAX_ARROWS = 3;
  War.newArmy = function (tag, ids) {
    var n = 0; this.armies.forEach(function (a) { if (a.tag === tag) n = Math.max(n, a.n || 0); });
    var army = { id: this.nextId++, n: n + 1, name: (ARMY_NAMES[n] || (n + 1) + 'th') + ' Army', tag: tag, divs: [], front: null, targets: [], fallback: null, autoFall: true, exec: false, stance: 1, gen: null, group: null };
    this.armies.push(army); this.assign(army, ids); return army;
  };
  War.fixArmy = function (a) { // armies from older saves
    if (!a.targets) a.targets = a.target !== undefined && a.target !== null ? [a.target] : [];
    delete a.target; if (a.autoFall === undefined) a.autoFall = true; if (a.gen === undefined) a.gen = null; if (a.group === undefined) a.group = null; if (a.fallback === undefined) a.fallback = null;
    return a;
  };
  War.armyOf = function (divId) {
    if (!this._ao || this._aoV !== this._armyVer) {
      var m = {}; this.armies.forEach(function (a) { a.divs.forEach(function (id) { m[id] = a; }); }); this._ao = m; this._aoV = this._armyVer;
    }
    return this._ao[divId] || null;
  };
  War.touchArmies = function () { this._armyVer = (this._armyVer || 0) + 1; this._cm = null; };
  War.assign = function (army, ids) {
    var self = this;
    ids.forEach(function (id) { var d = self.div(id); if (!d || d.tag !== army.tag) return; self.armies.forEach(function (o) { var i = o.divs.indexOf(id); if (i >= 0) o.divs.splice(i, 1); }); army.divs.push(id); });
    this.armies.filter(function (o) { return o !== army && !o.divs.length; }).forEach(function (o) { self.disband(o); });
    this.touchArmies();
  };
  War.unassign = function (ids) { var self = this; this.armies.forEach(function (o) { o.divs = o.divs.filter(function (id) { return ids.indexOf(id) < 0; }); }); this.armies.filter(function (o) { return !o.divs.length; }).forEach(function (o) { self.disband(o); }); this.touchArmies(); };
  War.disband = function (army) {
    var i = this.armies.indexOf(army); if (i < 0) return;
    if (army.gen) { var g = this.genById(army.gen); if (g) g.army = null; }
    this.armies.splice(i, 1);
    var self = this; this.groups.slice().forEach(function (g) { if (!self.armies.some(function (a) { return a.group === g.id; })) self.dissolveGroup(g); });
    this.touchArmies();
  };
  // The provinces an army's front runs through, right now.
  War.frontOf = function (army) {
    var self = this, provs = this.provs, f = army.front, out = []; if (!f) return out;
    if (f.type !== 'border') return f.provs.filter(function (id) { return self.friendly(army.tag, provs[id]); });
    for (var i = 0; i < provs.length; i++) {
      var p = provs[i]; if (!this.friendly(army.tag, p)) continue;
      var n = nb(p); for (var j = 0; j < n.length; j++) if (provs[n[j]].ctrl === f.foe) { out.push(i); break; }
    }
    return out;
  };
  War.armyPlan = function (army) { var self = this, s = 0, n = 0; army.divs.forEach(function (id) { var d = self.div(id); if (d) { s += d.plan || 0; n++; } }); return n ? s / n : 0; };
  War.armyStatus = function (army) {
    var f = army.front, N = this.nations, self = this; this.fixArmy(army);
    if (!f) return 'No orders';
    if (f.type === 'garrison') return 'Garrisoning ' + f.provs.length + (f.provs.length === 1 ? ' province' : ' provinces');
    var where = f.type === 'border' ? 'the ' + N[f.foe].short + ' border' : 'a line of ' + f.provs.length + (f.provs.length === 1 ? ' province' : ' provinces');
    var tg = army.targets.map(function (id) { return self.provs[id].name; }).join(', ');
    if (army.exec && tg) return 'Advancing on ' + tg;
    if (army.exec) return 'Attacking along ' + where;
    if (tg) return 'Holding ' + where + ', planning for ' + tg;
    return 'Holding ' + where;
  };
  War.fallBack = function (army, quiet) {
    if (!army.fallback || !army.fallback.length) return 'No fallback line drawn';
    army.front = { type: 'line', provs: army.fallback.slice() }; army.fallback = null; army.targets = []; army.exec = false;
    var self = this; army.divs.forEach(function (id) { var d = self.div(id); if (d && !d.retreat) { self.halt(d); d.manual = false; } });
    if (!quiet) this.event('plan', army.name + ' falls back to its fallback line', { a: army.tag });
    return null;
  };
  War.runArmy = function (army) {
    var self = this, provs = this.provs, tag = army.tag, used = {};
    this.fixArmy(army);
    var before = army.divs.length;
    army.divs = army.divs.filter(function (id) { return !!self.div(id); });
    if (army.divs.length !== before) this.touchArmies();
    var divs = army.divs.map(function (id) { return self.div(id); });
    if (!divs.length || !army.front) return;
    divs.forEach(function (d) { if (d.manual && !d.path.length && d.battle === null) d.manual = false; }); // a hand-given order is finished: back under army command
    army.targets = army.targets.filter(function (t) {
      if (!self.friendly(tag, provs[t])) return true;
      self.event('plan', army.name + ' has taken ' + provs[t].name, { a: tag, prov: t }); return false;
    });
    if (army.exec && !army.targets.length && army.front.type !== 'border') army.exec = false;

    // the line is breaking: fall back
    if (army.autoFall && army.fallback && army.fallback.length && army.front.type !== 'garrison') {
      var broken = divs.filter(function (d) { return d.retreat || d.org < 0.25; }).length;
      if (divs.length >= 2 && broken / divs.length >= 0.5) { this.fallBack(army); return; }
    }
    var fronts = this.frontOf(army); army.frontNow = fronts;
    if (!fronts.length) return;
    var idle = divs.filter(function (d) { return !d.manual && !d.path.length && !d.retreat && d.battle === null; });
    var isFront = {}; fronts.forEach(function (id) { isFront[id] = 1; });

    // the axes: shortest way from each target back to our line
    var axis = {}, spears = [];
    army.targets.forEach(function (tgt) {
      var prev = {}, q = [tgt], h = 0, end = -1; prev[tgt] = -1;
      while (h < q.length && end < 0) {
        var id = q[h++], n2 = nb(provs[id]);
        for (var k = 0; k < n2.length; k++) { var x = n2[k]; if (prev[x] !== undefined) continue; if (isFront[x]) { prev[x] = id; end = x; break; } if (self.hostile(tag, provs[x])) { prev[x] = id; q.push(x); } }
      }
      if (end >= 0) { spears.push(end); for (var at = end; at !== -1; at = prev[at]) axis[at] = 1; }
    });
    army.spears = spears; army.spear = spears.length ? spears[0] : -1;

    if (army.exec && army.front.type !== 'garrison' && self.enemies(tag).length) {
      var thr = War.STANCES[army.stance].thr, fresh = idle.filter(function (d) { return d.org >= 0.55 && !d.nosupply && isFront[d.prov]; }), near = {};
      fresh.forEach(function (d) { nb(provs[d.prov]).forEach(function (x) { var q2 = provs[x]; if (self.hostile(tag, q2) && (army.front.type !== 'border' || q2.ctrl === army.front.foe || axis[x])) (near[x] = near[x] || []).push(d); }); });
      var targets = Object.keys(near).map(function (key) {
        var id2 = +key, e = provs[id2];
        return { id: id2, def: self.defAt(tag, id2), value: 1 + Math.min(3, self.econ.P[id2].pop / 200000) + (axis[id2] ? 5 : 0) + (army.targets.indexOf(id2) >= 0 ? 4 : 0) + (self.allied(tag, e.owner) ? 2 : 0) };
      }).sort(function (a, b) { return b.value / (1 + b.def / 30) - a.value / (1 + a.def / 30); });
      targets.forEach(function (tg) {
        var e = provs[tg.id], avail = near[tg.id].filter(function (d) { return !used[d.id]; }); if (!avail.length) return;
        var onAxis = !!axis[tg.id];
        if (army.front.type === 'border' && !army.targets.length) onAxis = true; // a broad-front attack treats the whole border as its axis
        if (tg.def === 0) {
          var around = self.threatTo(tag, tg.id), hold = 0, sent = 0, max = onAxis ? 5 : 2;
          avail.sort(function (a, b) { return (b.type === 'cav') - (a.type === 'cav') || b.str - a.str; });
          for (var i = 0; i < avail.length && sent < max; i++) {
            if (sent >= 1 && hold >= 0.6 * around) break;
            if (self.guardNeeded(tag, avail[i], used)) continue;
            if (!self.orderMove(avail[i], tg.id)) { used[avail[i].id] = 1; sent++; hold += self.power(avail[i], 'def') * T_DEF[e.terrain]; }
          }
          return;
        }
        var existing = self.battleAt(tg.id), att = 0, joined = 0; if (existing && !self.allied(existing.tag, tag)) return;
        avail.forEach(function (d) { att += self.power(d, 'atk'); });
        if (existing) self.attackers(existing).forEach(function (d) { joined += self.power(d, 'atk'); });
        if ((att + joined) / (tg.def + 0.15 * self.threatTo(tag, tg.id)) < thr - (onAxis ? 0.1 : 0)) return;
        var power = joined, n3 = 0;
        avail.sort(function (a, b) { return self.power(b, 'atk') - self.power(a, 'atk'); }).forEach(function (d) {
          if (power / tg.def > 2.5 || n3 >= T_WIDTH[e.terrain] + 2) return;
          if (!onAxis && self.guardNeeded(tag, d, used, tg.id)) return;
          if (!self.orderMove(d, tg.id)) { used[d.id] = 1; n3++; power += self.power(d, 'atk'); }
        });
      });
    }

    // spread along the line in proportion to what faces each part of it; mass at the head of each offensive
    var rest = idle.filter(function (d) { return !used[d.id]; }); if (!rest.length) return;
    var want = {}, have = {}, sum = 0;
    fronts.forEach(function (id) { var w = 0.6 + (army.front.type === 'garrison' ? 0 : self.threatTo(tag, id) / 10); want[id] = w; sum += w; });
    if (army.exec && spears.length) spears.forEach(function (sp) { var extra = 0.5 * sum / spears.length; want[sp] += extra; sum += extra; });
    divs.forEach(function (d) { var at = d.path.length ? d.path[d.path.length - 1].to : d.prov; have[at] = (have[at] || 0) + 1; });
    var spill = 0;
    fronts.forEach(function (id) { var w = want[id] / sum * divs.length, lim = self.supplyLimit(id) + 1; if (w > lim) { spill += w - lim; w = lim; } want[id] = w; });
    if (spill > 0) fronts.forEach(function (id) { want[id] += spill / fronts.length; });
    var cache = {};
    rest.forEach(function (d) {
      var dist = cache[d.prov] || (cache[d.prov] = self.hopsFrom(tag, d.prov)), best = -1, bv = -1e9;
      var here = isFront[d.prov] ? want[d.prov] - (have[d.prov] || 0) + 1 : -1e9;
      for (var i = 0; i < fronts.length; i++) { var f = fronts[i]; if (dist[f] < 0) continue; var v = (want[f] - (have[f] || 0)) - 0.1 * dist[f]; if (v > bv) { bv = v; best = f; } }
      if (best < 0 || best === d.prov || bv <= here + 0.6) return;
      if (!self.orderMove(d, best, true)) { have[d.prov] = (have[d.prov] || 1) - 1; have[best] = (have[best] || 0) + 1; }
    });
  };

  // ---------- governments: war, coalitions, peace ----------
  War.growth = function (tag) { return this.ctrlIds(tag).length / Math.max(1, this.start0[tag] || 1); };
  War.borders = function (a, set) {
    for (var i = 0; i < this.provs.length; i++) { var p = this.provs[i]; if (p.ctrl !== a) continue; for (var j = 0; j < p.adj.length; j++) if (set[this.provs[p.adj[j]].ctrl]) return true; }
    return false;
  };
  War.diplomacy = function () {
    var self = this, tags = this.tags.filter(function (t) { return !self.gone[t] && self.econ.N[t].pop > 0; });
    var power = {}; tags.forEach(function (t) { power[t] = self.strength(t); });

    // the power everyone fears: the strongest army, weighted by how much it has grown
    var heg = null, hv = 0;
    tags.forEach(function (t) { var g = self.growth(t), v = power[t] * g * g; if (v > hv) { hv = v; heg = t; } });
    var hg = heg ? this.growth(heg) : 1, hegFoes = heg ? this.enemies(heg) : [];

    tags.forEach(function (t) {
      if ((self.isHuman ? self.isHuman(t) : t === self.player) || self.enemies(t).length) return;
      if (self.storyHolds && self.storyHolds(t) && (heg === 'FRA' || self.player !== heg)) return;
      if (self.noWarAppetite && self.noWarAppetite(t)) return;   // a weary or shaky government starts no wars   // historical mode: the story starts the great wars
      var count = self.M[t].count || 0;
      // join the coalition against the hegemon
      if (heg && t !== heg && !self.allied(t, heg) && hegFoes.length && hg >= 1.1 && count >= 4) {
        var bloc = {}; bloc[heg] = 1; self.allies(heg).forEach(function (a) { bloc[a] = 1; });
        var truce = self.truce[self.key(t, heg)] > self.day;
        if (!truce && self.borders(t, bloc)) {
          var others = 0; hegFoes.forEach(function (f) { others += power[f] || 0; });
          var chance = Math.min(0.25, 0.03 + 0.3 * (hg - 1.1)) * (COALITION[t] !== undefined ? COALITION[t] : self.nations[t].major ? 1 : 0.4);
          if (power[t] + others > 0.7 * power[heg] && rnd(self) < chance) {
            hegFoes.forEach(function (f) { if (!self.atWar(t, f) && f !== t) { self.ally[t][f] = true; self.ally[f][t] = true; } });
            self.event('coalition', self.nations[t].short + ' joins the coalition against ' + self.nations[heg].short, { a: t, b: heg });
            self.declare(t, heg, true); return;
          }
        }
      }
      // a war of conquest against a much weaker neighbour
      var appetite = AGGR[t] || 0.0015; if (count < 4 || rnd(self) > appetite || (self.lastPeace[t] !== undefined && self.day - self.lastPeace[t] < 360)) return;
      var seen = {}, best = null, bv = 0;
      self.provs.forEach(function (p) {
        if (p.owner !== t) return;
        p.adj.forEach(function (x) {
          var o = self.provs[x].owner; if (o === t || seen[o]) return; seen[o] = 1;
          if (self.allied(t, o) || self.gone[o] || self.truce[self.key(t, o)] > self.day) return;
          var theirs = power[o] || 0; self.allies(o).concat(self.guarantorsOf ? self.guarantorsOf(o) : []).forEach(function (a) { if (a !== t) theirs += 0.8 * (power[a] || 0); });
          var ratio = power[t] / Math.max(theirs, 1);
          var need = self.claimsOn && self.claimsOn(t, o) ? 1.6 : 2;
          if (ratio >= need && ratio > bv) { bv = ratio; best = o; }
        });
      });
      if (best) { if (self.tryUltimatum && self.tryUltimatum(t, best)) return; self.declare(t, best); }
    });

    // peace between computer nations, and offers to the player
    this.offers = this.offers.filter(function (o) { return self.day - o.day < 45 && self.atWar(o.from, self.player); });
    Object.keys(this.wars).forEach(function (k) {
      var w = self.wars[k]; if (!w) return;
      var months = (self.day - w.start) / 30, pl = self.player;
      if (w.a === pl || w.b === pl) {
        var ai = w.a === pl ? w.b : w.a, sc = self.warScore(pl, ai);
        if (self.offers.some(function (o) { return o.from === ai; })) return;
        var keep = sc >= 20 && months >= 8, white = Math.abs(sc) < 3 && months >= 24;
        if ((keep || white) && rnd(self) < 0.25) { var o = { from: ai, keep: keep, day: self.day }; self.offers.push(o); self.event('offer', self.nations[ai].short + ' offers peace' + (keep ? ', ceding what you hold' : ', borders as before'), { a: ai, b: pl, keep: keep }); }
        return;
      }
      var sa = self.warScore(w.a, w.b);
      // the losing side buys peace with the land it has lost, if it is not on the brink of total defeat anyway
      if (Math.abs(sa) >= 20 && Math.abs(sa) < 45 && months >= 10 && rnd(self) < 0.15) self.peace(w.a, w.b, true);
    });
  };

  // ---------- raising armies with an eye on the arsenal ----------
  War.aiRecruit2 = function (tag) {
    var self = this, n = this.econ.N[tag], m = this.M[tag], war = this.enemies(tag).length > 0, last = n.last; if (!last || !n.pop) return;
    n.atWar = war; n.arms = war ? (n.treasury > -3 * last.taxRev ? 1 : 0.6) : Math.max(0.4, Math.min(n.arms, 0.6));
    var queued = this.recruits.filter(function (r) { return r.tag === tag; }).length, base = this.start0div[tag] || 0;
    var revenue = last.taxRev + last.tariffRev, ceiling = (war ? 0.65 : 0.4) * revenue, below = (m.count || 0) + queued < base;
    if (m.upkeep > ceiling && !(below && m.upkeep < 0.8 * revenue)) return;
    if (queued >= (war ? 5 : below ? 2 : 1) || n.treasury < (war ? -6 * last.taxRev : 1500)) return;
    if ((m.count || 0) + queued >= Math.max(4, base * (war ? 2 : 1.25))) return; // armies do not grow without limit
    var own = this.ownP(tag).filter(function (p) { return p.ctrl === tag; }); if (!own.length) return;
    own.sort(function (a, b) { return self.econ.P[b.id].pop - self.econ.P[a.id].pop; });
    // keep roughly 7 infantry : 2 cavalry : 1 artillery, raising whatever the arsenal can equip
    var c = { inf: 0, cav: 0, art: 0 }, total = 0; this.divs.forEach(function (d) { if (d.tag === tag) { c[d.type]++; total++; } });
    var wantOrder = ['inf', 'cav', 'art'].sort(function (a, b) { var tA = { inf: 0.7, cav: 0.2, art: 0.1 }; return (c[a] / (total + 1) - tA[a]) - (c[b] / (total + 1) - tA[b]); });
    var made = 0, tries = war ? 3 : 1;
    for (var k = 0; k < wantOrder.length && made < tries; k++) {
      for (var j = 0; j < tries - made; j++) {
        var where = own[Math.floor(rnd(this) * Math.min(4, own.length))].id;
        if (this.recruit(tag, wantOrder[k], where)) break; made++;
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
