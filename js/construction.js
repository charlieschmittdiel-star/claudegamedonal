// Construction in the manner of HoI4. A nation's civilian industry (mills, ironworks, armouries, foundries, workshops)
// and its artisans make up its builders; consumer goods hold back a share of them (set by the economy law). Projects
// wait in one national queue, in the order the player sets; each takes up to 15 builders, and roads speed the work.
// Factories, arsenals, dockyards and universities need a building slot in their region; roads, ports, estates,
// forts and depots do not. Money and materials are paid as the work is done, not up front.
(function (root) {
  'use strict';
  var War = root.War, Econ = root.Econ, B = Econ.BUILDINGS;
  var PER_PROJECT = 15, CP_PER_DAY = 5;
  // work points for each kind of building (a fully staffed project does 75 a day)
  var CP = { textile: 6000, ironworks: 7000, armoury: 7000, foundry: 8000, workshop: 5500, estates: 3000, roads: 3500, port: 4500,
    arsenal: 7000, fort: 3200, depot: 2500, dockyard: 6000, university: 6500 };
  var SLOT_KINDS = { factory: 1, mil: 1, naval: 1, research: 1 };

  B.university = { name: 'University', kind: 'research', max: 3, money: 4200, goods: { timber: 40, tools: 10, luxuries: 10 }, months: 10, blurb: 'Research +4% per level across the nation (up to +40%)' };
  Econ.CP = CP; War.CONS = { PER_PROJECT: PER_PROJECT, CP_PER_DAY: CP_PER_DAY };

  // ---------- builders ----------
  Econ.civIndustry = function (tag) {
    var memo = this._civ || (this._civ = {}), m = memo[tag]; if (m && War.day - m.day < 6 && War.day >= m.day) return m.n;
    var n = 0, P = this.P, F = this.FACTORIES;
    for (var i = 0; i < this.provs.length; i++) { var p = this.provs[i]; if (p.owner !== tag || (p.ctrl && p.ctrl !== tag)) continue; for (var k = 0; k < F.length; k++) n += P[i].b[F[k]] || 0; }
    memo[tag] = { day: War.day, n: n }; return n;
  };
  Econ.builders = function (tag) {
    var n = this.N[tag]; if (!n) return { total: 0, civ: 0, artisans: 0, consumer: 0, share: 0 };
    // every twelve levels of civilian industry count as one civilian factory; artisans add one per four million people
    var civ = Math.round(this.civIndustry(tag) / 12), art = Math.max(1, Math.round((n.pop || 0) / 4000000)), share = Math.max(0.05, Math.min(0.5, 0.25 + War.mod(tag, 'cgoods')));
    var gross = civ + art, cons = Math.round(gross * share);
    return { total: Math.max(2, gross - cons), civ: civ, artisans: art, consumer: cons, share: share };
  };
  Econ.consSpeed = function (tag, prov) { return (1 + War.mod(tag, 'cons')) * (1 + 0.1 * (this.P[prov].b.roads || 0)); };

  // ---------- building slots, by region ----------
  Econ.regionOf = function (prov) { return this.provs[prov].state; };
  Econ.slotInfo = function (prov, tag) {
    tag = tag || this.provs[prov].owner;
    var st = this.provs[prov].state, room = 0, used = 0, self = this;
    var ids = War.states && War.states[st] ? War.states[st].provs : null, len = ids ? ids.length : this.provs.length;
    for (var ii = 0; ii < len; ii++) {
      var i = ids ? ids[ii] : ii, p = this.provs[i]; if (p.state !== st || p.owner !== tag) continue;
      room += this.maxFactory(i);
      for (var k in this.P[i].b) if (B[k] && SLOT_KINDS[B[k].kind]) used += this.P[i].b[k] || 0;
    }
    this.queue.forEach(function (q) { var p = self.provs[q.prov]; if (p.state === st && p.owner === tag && SLOT_KINDS[B[q.type].kind]) used++; });
    // as many slots as the region has hands for mills, a few more for arsenals, dockyards and universities
    var slots = Math.floor((room + 3) * (1 + War.mod(tag, 'slots')));
    return { used: used, slots: slots, free: slots - used, name: War.states && War.states[st] ? War.states[st].name : this.provs[prov].name };
  };
  var baseBlock = Econ.buildBlock;
  Econ.buildBlock = function (id, type) {
    var bd = B[type]; if (!bd) return 'Unknown building';
    if (type === 'university') {
      var p = this.provs[id], have = (this.P[id].b.university || 0) + this.queued(id, 'university');
      if (p.ctrl && p.ctrl !== p.owner) return 'Occupied';
      if (this.P[id].pop < 150000) return 'Needs a town of 150,000';
      if (have >= bd.max) return 'Fully built';
    } else { var why = baseBlock.call(this, id, type); if (why) return why; }
    if (SLOT_KINDS[bd.kind] && this.slotInfo(id).free <= 0) return 'No free building slot in the region';
    return null;
  };
  Econ.cpCost = function (type) { return CP[type] || Math.round((B[type].months || 8) * 650); };

  // ---------- the queue ----------
  // a project is { prov, type, cp, need, cost, paid, tag }; building costs money as the work goes on
  Econ.build = function (id, type) {
    var why = this.buildBlock(id, type); if (why) return why;
    var tag = this.provs[id].owner, n = this.N[tag], cost = this.buildCost(id, type);
    if (n.treasury < -2 * Math.max(1000, (n.last && n.last.taxRev) || 1000)) return 'The treasury is too deep in debt';
    this.queue.push({ prov: id, type: type, cp: 0, need: this.cpCost(type), cost: cost, paid: 0, tag: tag, left: 1 });
    return null;
  };
  Econ.queueOf = function (tag) { var self = this; return this.queue.filter(function (q) { return (q.tag || self.provs[q.prov].owner) === tag; }); };
  Econ.moveProject = function (q, dir) {
    var tag = q.tag, mine = this.queueOf(tag), i = mine.indexOf(q); if (i < 0) return;
    var j = dir === 'top' ? 0 : Math.max(0, Math.min(mine.length - 1, i + dir)); if (j === i) return;
    mine.splice(i, 1); mine.splice(j, 0, q);
    // keep other nations' projects where they were, and lay this nation's back in its new order
    var k = 0, self = this; this.queue = this.queue.map(function (x) { return (x.tag || self.provs[x.prov].owner) === tag ? mine[k++] : x; });
  };
  Econ.cancelProject = function (q) {
    var n = this.N[q.tag]; if (n) n.treasury += Math.round(q.paid * 0.5);    // half the wages already paid come back
    this.queue = this.queue.filter(function (x) { return x !== q; });
  };
  // who works on what: builders go down the queue, at most 15 to a project
  Econ.crews = function (tag) {
    var left = this.builders(tag).total, out = [];
    this.queueOf(tag).forEach(function (q) { var c = Math.min(PER_PROJECT, left); left -= c; out.push([q, c]); });
    return out;
  };
  Econ.projectEta = function (q) {
    var c = 0, self = this; this.crews(q.tag).forEach(function (x) { if (x[0] === q) c = x[1]; });
    var rate = c * CP_PER_DAY * this.consSpeed(q.tag, q.prov); return rate > 0 ? Math.ceil((q.need - q.cp) / rate) : Infinity;
  };
  // one day of building, for every nation
  Econ.constructionDay = function () {
    var self = this, done = [], byTag = {};
    this.queue.forEach(function (q) { if (!q.tag) q.tag = self.provs[q.prov].owner; (byTag[q.tag] = byTag[q.tag] || []).push(q); });
    Object.keys(byTag).forEach(function (tag) {
      var n = self.N[tag], b = self.builders(tag), left = b.total;
      var broke = n && n.treasury < -2 * Math.max(1000, (n.last && n.last.taxRev) || 1000);
      byTag[tag].forEach(function (q) {
        var p = self.provs[q.prov];
        if (p.owner !== tag) { q.dead = true; return; }                 // the land changed hands
        if (p.ctrl && p.ctrl !== p.owner) return;                       // no building under occupation
        var c = Math.min(PER_PROJECT, left); left -= c; if (c <= 0) return;
        var fill = 1, g = B[q.type].goods; for (var k in g) if (n.f && n.f[k] !== undefined) fill = Math.min(fill, Math.max(0.25, n.f[k]));
        var work = c * CP_PER_DAY * self.consSpeed(tag, q.prov) * fill * (broke ? 0.25 : 1);
        var w = Math.min(work, q.need - q.cp); q.cp += w;
        var pay = q.cost * w / q.need; n.treasury -= pay; n.spentBuild = (n.spentBuild || 0) + pay; q.paid += pay;
        if (q.cp >= q.need - 0.01) { self.P[q.prov].b[q.type] = (self.P[q.prov].b[q.type] || 0) + 1; q.dead = true; done.push(q); }
      });
    });
    if (this.queue.some(function (q) { return q.dead; })) this.queue = this.queue.filter(function (q) { return !q.dead; });
    if (done.length) {
      this._civ = {}; if (done.some(function (q) { return q.type === 'port' || q.type === 'battery' || q.type === 'roads'; })) this.refreshAccess();
      if (done.some(function (q) { return q.type === 'university'; })) War.techVer = (War.techVer || 0) + 1;
      this.builtThisMonth = (this.builtThisMonth || []).concat(done);
      if (this.onBuilt) this.onBuilt(done);
    }
    return done;
  };
  // materials: each month the state buys what the work in hand will use
  Econ.queueDemand = function (N) {
    var self = this;
    Object.keys(N).forEach(function (tag) {
      self.crews(tag).forEach(function (x) {
        var q = x[0], c = x[1]; if (!c) return; var m = N[tag], g = B[q.type].goods, frac = Math.min(1, c * CP_PER_DAY * 30 / q.need);
        for (var k in g) m.stateDem[k] = (m.stateDem[k] || 0) + g[k] * frac;
      });
    });
  };

  // universities: research +4% a level, up to +40%
  War.extraMods = function (tag) {
    var lv = 0, P = Econ.P; if (!P) return {};
    var ids = this.ownIds(tag); for (var k = 0; k < ids.length; k++) if (this.provs[ids[k]].owner === tag) lv += P[ids[k]].b.university || 0;
    return lv ? { rspeed: Math.min(0.4, 0.04 * lv) } : {};
  };

  // the computer queues no more than its builders can work on, and founds a university when rich
  Econ.queueCap = function (tag, rich) { return Math.max(2, Math.ceil(this.builders(tag).total / PER_PROJECT) + (rich ? 2 : 1)); };
  var baseAi = Econ.ai;
  Econ.ai = function (tag) {
    baseAi.call(this, tag);
    var n = this.N[tag], last = n.last; if (!last || n.atWar) return;
    var rev = (last.taxRev || 0) + (last.tariffRev || 0);
    if (n.treasury < 6 * rev || this.queueOf(tag).length >= this.queueCap(tag, true)) return;
    var best = null, bv = 0, self = this;
    War.eachOwned(tag, function (p) { if (p.owner !== tag || self.buildBlock(p.id, 'university')) return; var v = self.P[p.id].pop; if (v > bv) { bv = v; best = p.id; } });
    if (best !== null && (this.month + tag.charCodeAt(0)) % 3 === 0) this.build(best, 'university');
  };

  // old saves: projects that counted months now count work
  Econ.fixQueue = function () {
    var self = this;
    this.queue.forEach(function (q) {
      if (q.need) return; var need = self.cpCost(q.type), bd = B[q.type];
      q.need = need; q.cp = Math.max(0, need * (1 - (q.left || bd.months) / bd.months)); q.cost = q.cost || 0; q.paid = q.paid || 0; q.tag = self.provs[q.prov].owner;
    });
  };
  var baseRestore = Econ.restore;
  Econ.restore = function (s) { var ok = baseRestore.call(this, s); if (ok) this.fixQueue(); return ok; };
  var baseStep = War.step;
  War.step = function () { baseStep.call(this); if (!this.conference) Econ.constructionDay(); };
})(typeof window !== 'undefined' ? window : globalThis);
