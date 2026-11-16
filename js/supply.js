// Supply, weather, victory points, regions and fog of war, in the manner of HoI4.
//
// Supply: wagons flow out of supply sources (the capital, Depots, and harbours with a Port) along friendly
// provinces, losing strength with every step. Roads make steps cheaper and navigable rivers carry barges.
// Every province also feeds a little from its own farms. Divisions eat supply; where they eat more than
// arrives, they lose men, recover slowly and fight worse. Divisions with no link at all are cut off.
(function (root) {
  'use strict';
  var War = root.War, Econ = root.Econ;
  var LOSS = 1.9;            // supply lost per step of distance
  var SRC = { capital: 20, capitalMinor: 12, depot: 14, ally: 8 };

  Econ.BUILDINGS.depot = { name: 'Supply depot', kind: 'depot', max: 1, money: 4000, goods: { timber: 60, tools: 15 }, months: 8, blurb: 'A supply source: feeds armies for several provinces around' };
  var baseBlock = Econ.buildBlock;
  Econ.buildBlock = function (id, type) {
    if (type === 'depot') {
      var p = this.provs[id], e = this.P[id];
      if (p.ctrl && p.ctrl !== p.owner) return 'Occupied';
      return (e.b.depot || 0) + this.queued(id, 'depot') >= 1 ? 'Already built' : null;
    }
    return baseBlock.call(this, id, type);
  };

  function hash(a, b, c) { var h = Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 1597334677) ^ Math.imul(c + 13, 2246822519); h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
  function nb(p) { return p.nb || (p.nb = p.adj.concat(p.straits)); }
  // a small max-heap of [value, id]
  function Heap() { this.k = []; this.v = []; }
  Heap.prototype.push = function (k, v) { var K = this.k, V = this.v, i = K.length; K.push(k); V.push(v); while (i > 0) { var p = (i - 1) >> 1; if (K[p] >= k) break; K[i] = K[p]; V[i] = V[p]; i = p; } K[i] = k; V[i] = v; };
  Heap.prototype.pop = function () { var K = this.k, V = this.v, rk = K[0], rv = V[0], k = K.pop(), v = V.pop(), n = K.length; if (n) { var i = 0; for (;;) { var c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] > K[c]) c++; if (K[c] <= k) break; K[i] = K[c]; V[i] = V[c]; i = c; } K[i] = k; V[i] = v; } return [rk, rv]; };

  // ---------- supply ----------
  // provinces by who holds them, so a small nation's sums do not walk the whole world
  War.indexCtrl = function () {
    var by = {}, own = {}, provs = this.provs;
    for (var i = 0; i < provs.length; i++) { var c = provs[i].ctrl, o = provs[i].owner; (by[c] || (by[c] = [])).push(i); (own[o] || (own[o] = [])).push(i); }
    this._byCtrl = by; this._byOwn = own; this._byCtrlDay = this.day; this._byCtrlV = this.ctrlVersion;
  };
  var NONE = [];
  War.ownIds = function (tag) { if (!this._byOwn || this._byCtrlV !== this.ctrlVersion) this.indexCtrl(); return this._byOwn[tag] || NONE; };
  War.ctrlIds = function (tag) { if (!this._byCtrl || this._byCtrlV !== this.ctrlVersion) this.indexCtrl(); return this._byCtrl[tag] || NONE; };
  // walk one nation's provinces without scanning the whole world (callers still test p.owner / p.ctrl themselves)
  War.eachOwned = function (tag, fn) { var ids = this.ownIds(tag), provs = this.provs; for (var i = 0; i < ids.length; i++) fn(provs[ids[i]], ids[i]); };
  War.eachHeld = function (tag, fn) { var ids = this.ctrlIds(tag), provs = this.provs; for (var i = 0; i < ids.length; i++) fn(provs[ids[i]], ids[i]); };
  War.ownP = function (tag) { var ids = this.ownIds(tag), provs = this.provs, out = []; for (var i = 0; i < ids.length; i++) if (provs[ids[i]].owner === tag) out.push(provs[ids[i]]); return out; };
  War.friendlyIds = function (tag) {
    if (!this._byCtrl || this._byCtrlV !== this.ctrlVersion) this.indexCtrl();
    var by = this._byCtrl, out = (by[tag] || []).slice(), A = this.ally[tag];
    if (A) for (var k in A) if (A[k] && k !== tag && by[k]) for (var i = 0; i < by[k].length; i++) out.push(by[k][i]);
    return out;
  };
  War.supplySources = function (tag, ids) {
    var self = this, out = [], P = this.econ.P, provs = this.provs;
    (ids || this.friendlyIds(tag)).forEach(function (id) {
      var p = provs[id];
      if (!self.friendly(tag, p) || !self.allied(tag, p.owner)) return;
      var n = self.nations[p.owner], s = 0;
      if (n.capital === p.name) s = p.owner === tag ? (n.major ? SRC.capital : SRC.capitalMinor) : SRC.ally;
      if (P[p.id].b.depot) s = Math.max(s, SRC.depot);
      if (P[p.id].b.fort) s = Math.max(s, 5 + P[p.id].b.fort);                // fortress magazines
      if (P[p.id].pop >= 250000) s = Math.max(s, Math.min(10, 4 + P[p.id].pop / 150000)); // big towns feed armies nearby
      if (p.coastal && P[p.id].b.port && (!self.blockaded || !self.blockaded(p.id, tag))) s = Math.max(s, 4 + 3 * P[p.id].b.port);
      if (s) out.push([s, p.id]);
    });
    return out;
  };
  War.supplyFor = function (tag) {
    var self = this, provs = this.provs, P = this.econ.P, n = provs.length;
    var reach = new Float32Array(n).fill(-1), dist = new Int16Array(n).fill(-1), heap = new Heap();
    var ids = this.friendlyIds(tag);
    this.supplySources(tag, ids).forEach(function (s) { if (s[0] > reach[s[1]]) { reach[s[1]] = s[0]; dist[s[1]] = 0; heap.push(s[0], s[1]); } });
    while (heap.k.length) {
      var top = heap.pop(), v = top[0], id = top[1]; if (v < reach[id]) continue;
      var p = provs[id], list = nb(p);
      for (var i = 0; i < list.length; i++) {
        var j = list[i], q = provs[j]; if (!self.friendly(tag, q)) continue;
        var c = War.T_MOVE[q.terrain] * (1 - 0.12 * (P[j].b.roads || 0));
        if (p.riv && p.riv.indexOf(j) >= 0) c *= 0.6;           // barges on the river
        if (p.straits.indexOf(j) >= 0) c += 1.5;
        var nv = v - LOSS * c;
        if (nv > reach[j]) { reach[j] = nv; dist[j] = dist[id] + 1; heap.push(nv, j); }
      }
    }
    var cap = new Float32Array(n);
    for (var ki = 0; ki < ids.length; ki++) {
      var k = ids[ki], pk = provs[k], local = 1 + P[k].pop / 250000 + 0.5 * (P[k].b.roads || 0);
      if (!self.friendly(tag, pk)) { cap[k] = 0; continue; }
      cap[k] = (local * (self.allied(tag, pk.owner) ? 1 : 0.5) + Math.max(0, reach[k])) * (self.resist && self.resist[k] && !self.allied(tag, self.core[k]) ? 1 - 0.6 * self.resist[k] : 1);
    }
    return { cap: cap, reach: reach, dist: dist };
  };
  War.divSupply = function (d) { var s = this.stats(d), cm = this.cmdOf(d); return s.sup * 10 * Math.max(0.4, 1 - cm.supply - this.mod(d.tag, 'supply')) / 10; };
  War.refreshSupply = function () {
    var self = this, tags = {}, demand = {};
    this.divs.forEach(function (d) { tags[d.tag] = 1; demand[d.prov] = (demand[d.prov] || 0) + self.divSupply(d); });
    this.supply = {}; this.supplyDist = {}; this.indexCtrl();
    this._chg = this._chg || [];
    if (this.ctrlVersion !== this._ctrlSeen) { this._supC = {}; this._ctrlSeen = this.ctrlVersion; }
    var sig = this.allySig();
    Object.keys(tags).forEach(function (t) { var s = self.cachedSupply(t, sig); self.supply[t] = s; self.supplyDist[t] = s.dist; });
    if (this.player && !this.supply[this.player]) this.supply[this.player] = this.cachedSupply(this.player, sig);
    this._chgSeen = this._chg.length;
    this.demand = demand;
    this.divs.forEach(function (d) {
      var s = self.supply[d.tag], p = self.provs[d.prov], sea = d.path.length && d.path[0].sea;
      var linked = s.reach[d.prov] >= 0 || self.allied(d.tag, p.owner);
      d.nosupply = !linked && !sea;
      d.sr = sea ? 1 : Math.min(1, s.cap[d.prov] / Math.max(0.01, demand[d.prov] || 0.01));
      d.far = 0;
    });
  };
  // Supply only changes where control, alliances, blockades or depots change, so each nation's network is kept
  // and recomputed when something it touches has moved (or every fortnight, for resistance and new buildings).
  War.allySig = function () {
    var s = '', A = this.ally; for (var i = 0; i < this.tags.length; i++) { var t = this.tags[i], o = A[t]; if (!o) continue; for (var k in o) if (o[k]) s += t + k; }
    return s;
  };
  War.cachedSupply = function (tag, sig) {
    var C = this._supC || (this._supC = {}), c = C[tag], self = this;
    if (c && c.sig === sig && this.day - c.at < 15) {
      var stale = false;
      for (var i = c.chg; i < this._chg.length && !stale; i++) {
        var id = this._chg[i], p = this.provs[id];
        if (c.res.reach[id] >= 0 || this.friendly(tag, p)) stale = true;
        else for (var j = 0; j < p.adj.length; j++) if (c.res.reach[p.adj[j]] >= 0) { stale = true; break; }
      }
      if (!stale && this.blockaded && (this.day + tag.charCodeAt(0) + tag.charCodeAt(2)) % 4 === 0) for (var k = 0; k < c.ports.length; k++) if (this.blockaded(c.ports[k][0], tag) !== c.ports[k][1]) { stale = true; break; }
      if (!stale) return c.res;
    }
    var res = this.supplyFor(tag), ports = [], P = this.econ.P;
    this.friendlyIds(tag).forEach(function (id) { var p = self.provs[id]; if (p.coastal && P[id].b.port && res.reach[id] >= 0) ports.push([id, !!(self.blockaded && self.blockaded(id, tag))]); });
    C[tag] = { res: res, sig: sig, at: this.day, chg: this._chg.length, ports: ports };
    return res;
  };
  War.supplyChanged = function (id) { (this._chg || (this._chg = [])).push(id); if (this._chg.length > 4000) { this._chg = []; this._supC = {}; } };
  var baseSetCtrl = War.setCtrl;
  War.setCtrl = function (p, tag) { var v = this.ctrlVersion, r = baseSetCtrl.apply(this, arguments); if (this.ctrlVersion !== v) { this.supplyChanged(p.id); if (this._ctrlSeen === v) this._ctrlSeen = this.ctrlVersion; } return r; };
  // how many divisions a province can feed, for the computer generals and the map
  War.supplyLimit = function (prov) {
    var p = this.provs[prov], s = this.supply && this.supply[p.ctrl];
    if (!s) s = (this.supply = this.supply || {})[p.ctrl] = this.supplyFor(p.ctrl);
    return Math.max(1, Math.floor(s.cap[prov] / 1.05));
  };

  // ---------- weather ----------
  var WX = {
    snow: { name: 'Snow', atk: 0.85, move: 1.35, attr: 0.0015 },
    mud: { name: 'Mud', atk: 0.8, move: 1.6, attr: 0.0005 },
    rain: { name: 'Rain', atk: 0.9, move: 1.2, attr: 0 },
    heat: { name: 'Heat', atk: 0.95, move: 1.1, attr: 0.0008 }
  };
  War.WX = WX;
  War.doy = function () { return (243 + this.day) % 365; };
  War.weatherAt = function (p) {
    var doy = this.doy(), m = Math.min(12, Math.floor(doy / 30.42) + 1), lat = p.lat, lon = p.lon;
    if (lat < 0) { lat = -lat; m = (m + 5) % 12 + 1; }                      // the seasons turn over south of the line
    var south = p.lat < 0, winter = m === 12 || m <= 2;
    // winters are harder the further east across Europe and Asia; the Americas sit in between
    var snowLine = south ? 46 : lon < -30 ? 40 : 51 - (Math.max(-10, Math.min(60, lon)) - 5) * 0.28;
    if ((winter && lat > snowLine) || (!south && (m === 11 || m === 3) && lat > 55 && lon > 20) || (winter && lat > 30 && p.terrain === 'm')) return WX.snow;
    if (!south && (((m === 3 || m === 4) && lat > 48) || ((m === 10 || m === 11) && lat > 46 && lon > 12))) return WX.mud;
    if (!south && m >= 6 && m <= 9 && lat > 6 && lat < 28 && lon > 68 && lon < 125 && p.terrain !== 'd' && p.terrain !== 'm') return hash(Math.floor(lon / 4), Math.floor(lat / 3), Math.floor(this.day / 7)) < 0.6 ? WX.mud : WX.rain;   // the monsoon
    if ((m >= 6 && m <= 8 && lat < 42) || (p.terrain === 'd' && lat < 33 && m >= 4 && m <= 10)) return WX.heat;
    var week = Math.floor(this.day / 7), cx = Math.floor(lon / 4), cy = Math.floor(p.lat / 3);
    if ((lat > 38 || lat < 12) && hash(cx, cy, week) < (lat < 12 ? 0.25 : m >= 9 || m <= 4 ? 0.22 : 0.1)) return WX.rain;
    return null;
  };
  War.winterAt = function (p) { return this.weatherAt(p) === WX.snow; };
  War.moveMod = function (p) { var w = this.weatherAt(p); return w ? w.move : 1; };
  // daily strength lost to the weather by a division standing here (before supply trains and generals help)
  War.weatherAttr = function (d, p) {
    var w = this.weatherAt(p); if (!w || !w.attr) return 0;
    var home = this.allied(d.tag, p.owner), deep = p.lat > 54 && p.lon > 24;
    if (w === WX.snow) return home ? 0.0003 : (deep ? 0.004 : w.attr);
    if (w === WX.heat) return p.terrain === 'd' && !home ? 0.002 : 0;
    return home ? 0 : w.attr;
  };

  // ---------- victory points and regions ----------
  War.initVP = function () {
    var self = this, P = this.econ.P;
    this.provs.forEach(function (p) {
      var n = self.nations[p.owner], cap = n && n.capital === p.name;
      p.vp = 1 + Math.floor(P[p.id].pop / 200000) + (cap ? (n.major ? 15 : 6) : 0) + (P[p.id].b.fort ? 1 : 0);
    });
    // regions: up to four neighbouring provinces of the same 1805 owner, grown around the biggest towns
    var order = this.provs.slice().sort(function (a, b) { return P[b.id].pop - P[a.id].pop; }), states = [];
    this.provs.forEach(function (p) { p.state = -1; });
    order.forEach(function (seed) {
      if (seed.state >= 0) return;
      var st = { id: states.length, name: seed.name, provs: [seed.id] }; seed.state = st.id; states.push(st);
      var front = [seed.id];
      while (st.provs.length < 4 && front.length) {
        var best = -1, bd = 1e9;
        front.forEach(function (id) { self.provs[id].adj.forEach(function (j) { var q = self.provs[j]; if (q.state >= 0 || q.owner !== seed.owner) return; var d = self.distKm(q, seed); if (d < bd) { bd = d; best = j; } }); });
        if (best < 0) break; self.provs[best].state = st.id; st.provs.push(best); front.push(best);
      }
    });
    this.states = states;
  };
  War.vpOf = function (tag) { var t = 0, ids = this.ownIds(tag); for (var i = 0; i < ids.length; i++) if (this.provs[ids[i]].owner === tag) t += this.provs[ids[i]].vp; return t; };
  War.surrenderProgress = function (tag) {
    var total = 0, lost = 0, self = this;
    this.eachOwned(tag, function (p) { if (p.owner !== tag) return; total += p.vp; if (self.atWar(tag, p.ctrl)) lost += p.vp; });
    return total ? lost / total : 0;
  };
  // A nation capitulates when it has lost 65% of its victory points, or 45% with its capital held for three months.
  War.checkSurrender = function () {
    var self = this; this.capLost = this.capLost || {};
    this.tags.forEach(function (t) {
      if (self.gone[t] || !self.enemies(t).length) { delete self.capLost[t]; return; }
      var capName = self.nations[t].capital, capLost = self.provs.some(function (p) { return p.owner === t && p.name === capName && self.atWar(t, p.ctrl); });
      if (capLost) { if (self.capLost[t] === undefined) self.capLost[t] = self.day; } else delete self.capLost[t];
      var total = self.econ.N[t].pop, foes = self.enemies(t), patron = false;
      self.allies(t).forEach(function (a) { if (!self.gone[a] && self.econ.N[a].pop > 4 * total && foes.some(function (f) { return self.atWar(a, f); })) patron = true; });
      if (patron) return;
      var prog = self.surrenderProgress(t);
      if (prog >= 0.65 || (capLost && self.day - self.capLost[t] >= 90 && prog >= 0.45)) self.surrender(t);
    });
  };

  // ---------- fog of war ----------
  // 2 = seen clearly, 1 = only rumours (border sight), 0 = nothing known
  War.fog = true;
  War.visibility = function (tag) {
    if (this._vis && this._vis.day === this.day && this._vis.tag === tag && this._vis.v === this.ctrlVersion) return this._vis.map;
    var self = this, provs = this.provs, n = provs.length, vis = new Uint8Array(n);
    for (var i = 0; i < n; i++) if (this.allied(tag, provs[i].ctrl)) { vis[i] = 2; nb(provs[i]).forEach(function (j) { if (!vis[j]) vis[j] = 1; }); }
    this.divs.forEach(function (d) {
      if (!self.allied(tag, d.tag)) return;
      vis[d.prov] = 2; var s = self.stats(d), far = s.has.scouts || s.cls === 'cav';
      nb(provs[d.prov]).forEach(function (j) { vis[j] = 2; if (far) nb(provs[j]).forEach(function (k) { if (!vis[k]) vis[k] = 1; }); });
    });
    this.battles.forEach(function (bt) { vis[bt.prov] = 2; });
    this._vis = { day: this.day, tag: tag, v: this.ctrlVersion, map: vis };
    return vis;
  };
  War.seen = function (prov) { if (!this.fog || !this.player) return 2; return this.visibility(this.player)[prov]; };

  // ---------- hooks ----------
  var baseInit = War.init;
  var stepBase = War.step;
  War.step = function () { this.indexCtrl(); return stepBase.apply(this, arguments); };
  War.init = function (provinces, nations, econ, km) { this._supC = {}; this._chg = []; this._byCtrl = null; this._byOwn = null; baseInit.call(this, provinces, nations, econ, km); this.initVP(); this.refreshSupply(); };
  var baseRestore = War.restore;
  War.restore = function (s) {
    var ok = baseRestore.call(this, s); if (!ok) return ok;
    if (s.fog !== undefined) this.fog = s.fog;
    this._supC = {}; this._chg = []; this.initVP(); this.refreshSupply(); return ok;
  };
  var baseSer = War.serialize;
  War.serialize = function () { var s = baseSer.call(this); s.fog = this.fog; return s; };
  // computer nations at war put a depot behind their busiest front if supply there is thin
  var baseMonth = War.month;
  War.month = function () {
    baseMonth.call(this);
    var self = this, P = this.econ.P;
    if (this.day % 90 !== 0) return;
    this.tags.forEach(function (t) {
      if (t === self.player || self.gone[t] || !self.enemies(t).length) return;
      var s = self.supply && self.supply[t]; if (!s) return;
      var worst = null, wv = 1e9;
      self.divs.forEach(function (d) { if (d.tag === t && d.sr < 0.7 && self.provs[d.prov].owner === t && !P[d.prov].b.depot) { if (s.cap[d.prov] < wv) { wv = s.cap[d.prov]; worst = d.prov; } } });
      if (worst !== null && !self.econ.buildBlock(worst, 'depot')) self.econ.build(worst, 'depot');
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
