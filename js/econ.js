// The economy simulation. No screen code in here: it only needs the province list and the nation list,
// so it can be run and tested on its own.
//
// One step = one month:
//   1. every province works its land and its factories, adding goods to its nation's market
//   2. households, factories and the state say what they want to buy; households buy essentials first
//      and only what last month's income (after tax) can pay for
//   3. each national market hands out what it has; surpluses are offered abroad, shortages are requested
//   4. the world market matches offers and requests; its prices drift with the balance
//   5. national prices rise on shortage, fall on glut, and are pulled toward world prices
//   6. incomes, taxes and the treasury are settled; people multiply or dwindle with how well they eat;
//      landowners put more or fewer hands to work depending on price; building work advances
(function (root) {
  'use strict';
  var D = root.ECON_DATA, GOODS = D.GOODS, B = D.BUILDINGS, FW = D.FACTORY_WORKERS;
  var G = GOODS.map(function (g) { return g.id; }), BASE = {}, RAW = [];
  GOODS.forEach(function (g) { BASE[g.id] = g.base; if (g.raw) RAW.push(g.id); });
  var FACTORIES = Object.keys(B).filter(function (k) { return B[k].kind === 'factory'; });
  var TIERS = ['life', 'daily', 'lux'];

  function zero() { var o = {}; for (var i = 0; i < G.length; i++) o[G[i]] = 0; return o; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hash01(i, salt) {
    var h = Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 7, 1597334677);
    h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  var override = {};
  Object.keys(D.RESOURCE).forEach(function (g) { D.RESOURCE[g].forEach(function (name) { override[name] = g; }); });

  // What a province's land yields, from its terrain, latitude and coast (with a fixed per-province roll for variety).
  function pickResource(p) {
    if (override[p.name]) return override[p.name];
    var h = hash01(p.id, 1), h2 = hash01(p.id, 2), al = Math.abs(p.lat), south = al < 46 && al > 28;   // vines want a temperate sun, north or south of the line
    if (p.coastal && p.area < 6000 && h2 < 0.3) return 'fish';
    switch (p.terrain) {
      case 'p': return south && h < 0.18 ? 'wine' : h < 0.30 ? 'meat' : h < 0.40 ? 'wool' : h < 0.46 ? 'horses' : 'grain';
      case 'h': return south && h < 0.30 ? 'wine' : h < 0.52 ? 'wool' : h < 0.68 ? 'meat' : h < 0.76 ? 'iron' : h < 0.82 ? 'coal' : h < 0.88 ? 'timber' : 'grain';
      case 'm': return h < 0.30 ? 'timber' : h < 0.55 ? 'wool' : h < 0.72 ? 'meat' : h < 0.88 ? 'iron' : 'coal';
      case 'f': return h < 0.62 ? 'timber' : h < 0.76 ? 'meat' : h < 0.90 ? 'grain' : 'iron';
      case 's': return h < 0.40 ? 'grain' : h < 0.68 ? 'meat' : h < 0.86 ? (p.coastal ? 'fish' : 'timber') : 'timber';
      default: return h < 0.42 ? 'wool' : h < 0.82 ? 'meat' : 'horses';
    }
  }

  var Econ = {
    GOODS: GOODS, G: G, BASE: BASE, BUILDINGS: B, FACTORIES: FACTORIES, player: null,
    mod: function () { return 0; },

    init: function (provinces, nations) {
      var self = this;
      this.provs = provinces; this.nations = nations; this.month = 0; this.queue = [];
      this.tags = Object.keys(nations);
      this.world = { price: {}, hist: {}, offer: zero(), request: zero() };
      G.forEach(function (g) { self.world.price[g] = BASE[g]; self.world.hist[g] = [BASE[g]]; });

      // --- people and land ---
      var weight = [], sum = {};
      provinces.forEach(function (p) {
        // the map is a Mercator, which swells the north: bring each province's area back to true square kilometres (once)
        if (!p.trueArea && p.lat !== undefined) { var f = Math.cos(p.lat * Math.PI / 180) / Math.cos(48.85 * Math.PI / 180); p.area = Math.max(1, Math.round(p.area * f * f)); p.trueArea = true; }
        var al = Math.abs(p.lat), north = al > 62 ? 0.15 : al > 59 ? 0.35 : al > 56 ? 0.7 : 1;
        var land = Math.max(p.area, 150) * D.LAND[p.terrain] * north;
        weight[p.id] = { land: land, w: land * (D.CITIES[p.name] || 1) };
        if (!p.pop0) sum[p.owner] = (sum[p.owner] || 0) + weight[p.id].w;
      });
      this.P = provinces.map(function (p) {
        var res = pickResource(p), total = (D.NATION[p.owner] || [0.1, 0.8])[0] * 1e6;
        var cap = weight[p.id].land; if (res === 'iron' || res === 'coal') cap = Math.max(cap, 12000);
        return { pop: p.pop0 ? p.pop0 : Math.max(2000, Math.round(total * weight[p.id].w / sum[p.owner])), res: res, cap: cap, b: {}, out: 0, grain: 0, workers: 0, fworkers: 0, staffing: 1 };
      });

      // --- nations ---
      this.N = {};
      this.tags.forEach(function (t) {
        var n = { tag: t, dev: (D.NATION[t] || [0.1, 0.8])[1], treasury: 0, tax: 0.10, tariff: 0.05, arms: 0.5, price: {}, stock: zero(), f: {}, e: {}, hist: {},
          income: 0, pop: 0, access: 0.5, sol: { life: 1, daily: 1, lux: 1 }, stockpile: { muskets: 0, artillery: 0, horses: 0, uniforms: 0 }, spentBuild: 0, last: null };
        G.forEach(function (g) { n.price[g] = BASE[g]; n.f[g] = 1; n.hist[g] = [BASE[g]]; });
        RAW.forEach(function (g) { n.e[g] = 0.8; });
        n.u = {}; FACTORIES.forEach(function (f) { n.u[f] = 1; }); n.pi = 1;
        self.N[t] = n;
      });
      provinces.forEach(function (p) { self.N[p.owner].pop += self.P[p.id].pop; });

      this.calibrate();

      var needCost = 0; TIERS.forEach(function (t) { for (var g in D.NEEDS[t]) needCost += D.NEEDS[t][g] * BASE[g]; });
      this.tags.forEach(function (t) {
        var n = self.N[t], k = n.pop / 1000;
        n.income = k * needCost * 1.02; n.wages = 0.45 * k; n.armyCost = 0; n.treasury = Math.round(k * needCost * 0.1 * 6);
        for (var tier in D.NEEDS) for (var g in D.NEEDS[tier]) n.stock[g] = D.NEEDS[tier][g] * k * 0.8;
      });
      this.refreshAccess();
    },

    // Place the 1805 world's workshops and set yields so that, at the start, the world makes about what it uses.
    calibrate: function () {
      var self = this, P = this.P, provs = this.provs, N = this.N, worldK = 0, dem = zero();
      this.tags.forEach(function (t) { worldK += N[t].pop / 1000; });
      TIERS.forEach(function (t) { for (var g in D.NEEDS[t]) dem[g] += D.NEEDS[t][g] * worldK; });
      for (var a in D.ARMS) dem[a] += D.ARMS[a] * worldK * 0.5;

      this.fScale = {};
      var order = [['workshop', 'luxuries'], ['armoury', 'muskets'], ['foundry', 'artillery'], ['ironworks', 'tools'], ['textile', 'cloth']];
      var score = {}, scoreSum = 0;
      this.tags.forEach(function (t) { score[t] = N[t].pop * Math.pow(N[t].dev, 2.5); scoreSum += score[t]; });
      var byNation = {};
      provs.forEach(function (p) { (byNation[p.owner] = byNation[p.owner] || []).push(p.id); });
      for (var t in byNation) byNation[t].sort(function (x, y) { return P[y].pop - P[x].pop; });

      order.forEach(function (pair) {
        var type = pair[0], good = pair[1], bd = B[type], want = Math.ceil(dem[good] / bd.output[good] / 1.05), made = 0;
        self.tags.forEach(function (tag) {
          var list = byNation[tag]; if (!list) return;
          var quota = want * score[tag] / scoreSum, n = Math.floor(quota) + (hash01(tag.charCodeAt(0) * 31 + tag.charCodeAt(1), type.length) < quota % 1 ? 1 : 0);
          // industries sit where their inputs are dug when they can, otherwise in the biggest towns
          var pref = list.slice().sort(function (x, y) {
            var bx = bd.input[P[x].res] ? 1 : 0, by = bd.input[P[y].res] ? 1 : 0;
            return by - bx || P[y].pop - P[x].pop;
          });
          var guard = 0;
          while (n > 0 && guard++ < 20) {
            var placed = false;
            for (var i = 0; i < pref.length && n > 0; i++) {
              var id = pref[i];
              if ((P[id].b[type] || 0) >= D.FACTORY_MAX || self.factoryLevels(id) >= self.maxFactory(id)) continue;
              P[id].b[type] = (P[id].b[type] || 0) + 1; n--; made += N[tag].dev; placed = true;
            }
            if (!placed) break;
          }
        });
        self.fScale[type] = made > 0 ? 1.03 * dem[good] / (made * bd.output[good]) : 1;
        // inputs for this industry become demand for the goods below it
        for (var g in bd.input) dem[g] += bd.input[g] * self.countLevels(type);
      });

      // a few ports and roads where trade already flowed
      provs.forEach(function (p) {
        var e = P[p.id];
        if (p.coastal && (D.CITIES[p.name] || 0) >= 1.5) e.b.port = e.pop > 400000 ? 2 : 1;
        if ((D.CITIES[p.name] || 0) >= 2) e.b.roads = 1;
        var cap = self.nations[p.owner].capital; if (p.coastal && cap === p.name && !e.b.port) e.b.port = 1;
        if (p.coastal && p.port && !e.b.port) e.b.port = 1;
      });

      // Land: every district grows grain; a share of its hands works the local speciality instead.
      // Shares and the grain yield are set so world output at ordinary employment (80%) slightly exceeds world demand.
      var hands = zero(), grainHands = 0;
      provs.forEach(function (p) {
        var e = P[p.id], labor = 0.4 * e.pop, fw = Math.min(self.factoryLevels(p.id) * FW, 0.6 * labor);
        e.land0 = Math.max(0, Math.min(e.cap, labor - fw)) * Math.sqrt(N[p.owner].dev) * 0.8;
        hands[e.res] += e.land0;
      });
      this.share = {}; this.rScale = {};
      RAW.forEach(function (g) {
        if (g === 'grain') return;
        var needHands = 1.04 * dem[g] / D.YIELD[g] * 1000;
        self.share[g] = Math.min(0.9, needHands / hands[g]);
        self.rScale[g] = needHands / (hands[g] * self.share[g]);
      });
      this.share.grain = 0;
      provs.forEach(function (p) { var e = P[p.id]; grainHands += e.land0 * (1 - self.share[e.res]) * D.FERTILITY[p.terrain]; });
      this.rScale.grain = 1.04 * dem.grain / (grainHands / 1000 * D.YIELD.grain);
      this.startDemand = dem;
    },

    countLevels: function (type) { var n = 0; for (var i = 0; i < this.P.length; i++) n += this.P[i].b[type] || 0; return n; },
    factoryLevels: function (id, withQueue) {
      var b = this.P[id].b, n = 0; for (var i = 0; i < FACTORIES.length; i++) n += b[FACTORIES[i]] || 0;
      if (withQueue) this.queue.forEach(function (q) { if (q.prov === id && B[q.type].kind === 'factory') n++; });
      return n;
    },
    maxFactory: function (id) { var pop = this.P[id].pop; return pop >= 15000 ? Math.max(1, Math.floor(0.2 * pop / FW)) : 0; },
    queued: function (id, type) { var n = 0; this.queue.forEach(function (q) { if (q.prov === id && q.type === type) n++; }); return n; },

    refreshAccess: function () {
      var self = this, info = {};
      this.tags.forEach(function (t) { info[t] = { coast: false, ports: 0, nb: {} }; });
      this.provs.forEach(function (p) {
        var me = p.ctrl || p.owner, i = info[me]; if (p.coastal) i.coast = true; i.ports += self.P[p.id].b.port || 0;
        for (var k = 0; k < p.adj.length; k++) { var q = self.provs[p.adj[k]], o = q.ctrl || q.owner; if (o !== me) i.nb[o] = 1; }
      });
      this.tags.forEach(function (t) {
        var i = info[t];
        self.N[t].access = clamp(0.45 + (i.coast ? 0.15 : 0) + 0.07 * Math.min(5, i.ports) + 0.03 * Math.min(5, Object.keys(i.nb).length), 0.3, 1);
        self.N[t].ports = i.ports;
      });
    },

    // ---------- building ----------
    buildCost: function (id, type) {
      var bd = B[type], n = this.N[this.provs[id].owner], money = bd.money * n.pi;
      for (var g in bd.goods) money += bd.goods[g] * n.price[g];
      return Math.round(money);
    },
    // returns null when allowed, otherwise the reason it is not
    buildBlock: function (id, type) {
      var bd = B[type], p = this.provs[id], e = this.P[id], have = (e.b[type] || 0) + this.queued(id, type);
      if (p.ctrl && p.ctrl !== p.owner) return 'Occupied';
      if (bd.coastal && !p.coastal) return 'Needs a coast';
      if (bd.kind === 'infra') return have >= bd.max ? 'Fully built' : null;
      if (have >= D.FACTORY_MAX) return 'Fully built';
      if (this.factoryLevels(id, true) >= this.maxFactory(id)) return e.pop < 15000 ? 'Too few people' : 'No spare workers';
      return null;
    },
    build: function (id, type) {
      var why = this.buildBlock(id, type); if (why) return why;
      var n = this.N[this.provs[id].owner], cost = this.buildCost(id, type);
      if (n.treasury < cost) return 'Not enough money';
      n.treasury -= cost; n.spentBuild += cost;
      this.queue.push({ prov: id, type: type, left: B[type].months });
      return null;
    },
    // monthly profit of one more level at current national prices
    factoryProfit: function (tag, type) {
      var bd = B[type], n = this.N[tag], v = 0, g;
      for (g in bd.output) v += bd.output[g] * n.price[g] * n.dev * this.fScale[type];
      for (g in bd.input) v -= bd.input[g] * n.price[g];
      return v;
    },

    // ---------- one month ----------
    step: function () {
      var self = this, N = this.N, P = this.P, provs = this.provs, tags = this.tags, W = this.world, i, g, t, n;

      for (i = 0; i < tags.length; i++) {
        n = N[tags[i]]; n.pop = 0; n.prod = zero(); n.dem = zero(); n.inUse = zero(); n.stateDem = zero(); n.imp = zero(); n.exp = zero(); n.cons = zero(); n.idle = 0;
      }
      if (this.queueDemand) this.queueDemand(N); else this.queue.forEach(function (q) { var m = N[provs[q.prov].owner], bd = B[q.type]; for (var gg in bd.goods) m.stateDem[gg] += bd.goods[gg] / bd.months; });
      if (this.onDemand) this.onDemand(N);

      // 1. production
      for (i = 0; i < provs.length; i++) {
        var p = provs[i], e = P[i], occ = p.ctrl && p.ctrl !== p.owner ? 0.5 : 1; n = N[p.ctrl || p.owner]; n.pop += e.pop; // occupied land works at half pace, for the occupier
        var labor = 0.4 * e.pop, fl = 0, k;
        for (k = 0; k < FACTORIES.length; k++) fl += e.b[FACTORIES[k]] || 0;
        fl += e.b.arsenal || 0; // military factories need hands too
        var need = fl * FW, fw = Math.min(need, 0.6 * labor), staffing = need > 0 ? fw / need : 1, roads = 1 + 0.05 * (e.b.roads || 0);
        e.fworkers = fw; e.staffing = staffing; e.fvalue = 0;
        for (k = 0; k < FACTORIES.length; k++) {
          var type = FACTORIES[k], L = e.b[type]; if (!L) continue;
          var bd = B[type], fed = 1, run = staffing * n.u[type];
          for (g in bd.input) { if (n.f[g] < fed) fed = n.f[g]; n.dem[g] += L * bd.input[g] * run; n.inUse[g] += L * bd.input[g] * run; }
          for (g in bd.output) { var q = L * bd.output[g] * run * fed * n.dev * roads * this.fScale[type] * occ * Math.max(0.3, 1 + this.mod(n.tag, 'factory') + this.mod(n.tag, g + '_out')); n.prod[g] += q; e.fvalue += q * n.price[g]; }
        }
        var land = Math.max(0, Math.min(e.cap * (1 + 0.15 * (e.b.estates || 0)), labor - fw)), sh = this.share[e.res], agri = Math.sqrt(n.dev) * roads;
        var w1 = land * sh * n.e[e.res], w2 = land * (1 - sh) * n.e.grain;
        e.workers = w1 + w2;
        var lm = Math.max(0.3, 1 + this.mod(n.tag, 'land'));
        e.out = w1 / 1000 * D.YIELD[e.res] * this.rScale[e.res] * agri * occ * lm * (1 + this.mod(n.tag, e.res + '_out'));
        e.grain = w2 / 1000 * D.YIELD.grain * this.rScale.grain * D.FERTILITY[p.terrain] * agri * occ * lm * (1 + this.mod(n.tag, 'grain_out'));
        if (e.res === 'grain') { e.out = e.grain; e.grain = 0; }
        n.prod[e.res] += e.out; n.prod.grain += e.grain;
        n.idle += Math.max(0, labor - fw - e.workers);
      }

      // 2-3. demand and the home market
      var offer = zero(), request = zero();
      for (i = 0; i < tags.length; i++) {
        n = N[tags[i]]; var popK = n.pop / 1000, budget = Math.max(0, n.income * (1 - n.tax) + (n.wages || 0)), afford = {};
        for (t = 0; t < TIERS.length; t++) {
          var tier = D.NEEDS[TIERS[t]], cost = 0;
          var el = t === 0 ? -0.1 : -0.35, want = {};
          for (g in tier) { want[g] = tier[g] * popK * Math.pow(n.price[g] / BASE[g], el); cost += want[g] * n.price[g]; }
          var a = cost > 0 ? Math.min(1, budget / cost) : 1; afford[TIERS[t]] = a; budget -= a * cost;
          for (g in tier) n.dem[g] += want[g] * a;
        }
        n.afford = afford; n.armsDem = {};
        for (g in D.ARMS) { n.armsDem[g] = D.ARMS[g] * popK * n.arms; n.dem[g] += n.armsDem[g]; }
        for (g in n.stateDem) n.dem[g] += n.stateDem[g];
        for (var j = 0; j < G.length; j++) {
          g = G[j]; var supply = n.stock[g] + n.prod[g], d = n.dem[g], f = d > 0 ? Math.min(1, supply / d) : 1;
          n.cons[g] = f * d; n.stock[g] = supply - n.cons[g];
          n.off = n.off || {}; n.req = n.req || {};
          n.off[g] = Math.max(0, n.stock[g] - 0.75 * d);
          n.req[g] = d - n.cons[g];
          offer[g] += n.off[g]; request[g] += n.req[g];
        }
      }

      // 4. the world market
      for (j = 0; j < G.length; j++) {
        g = G[j]; var O = offer[g], R = request[g], traded = Math.min(O, R);
        for (i = 0; i < tags.length; i++) {
          n = N[tags[i]];
          if (O > 0) { n.exp[g] = n.off[g] * traded / O; n.stock[g] -= n.exp[g]; }
          if (R > 0) { n.imp[g] = n.req[g] * traded / R; n.cons[g] += n.imp[g]; }
        }
        W.offer[g] = O; W.request[g] = R;
        var wStock = 0, wDem = 0, wProd = 0;
        for (i = 0; i < tags.length; i++) { wStock += N[tags[i]].stock[g]; wDem += N[tags[i]].dem[g]; wProd += N[tags[i]].prod[g]; }
        var wCover = wDem > 0 ? wStock / wDem : 1, unmet = wDem > 0 ? (R - traded) / wDem : 0;
        W.cover = W.cover || {}; W.cover[g] = wCover;
        var flow = wDem > 0 ? clamp((wDem - wProd) / wDem, -0.5, 0.5) : 0;
        W.price[g] = clamp(W.price[g] * (1 + 0.12 * flow + 0.02 * clamp(1 - wCover, -1, 1) + 0.1 * unmet), 0.25 * BASE[g], 5 * BASE[g]);
        W.hist[g].push(W.price[g]); if (W.hist[g].length > 48) W.hist[g].shift();
      }

      // 5-6. prices, money, people
      for (i = 0; i < tags.length; i++) {
        n = N[tags[i]]; popK = n.pop / 1000; var Y = 0, tariffRev = 0, armsCost = 0;
        for (j = 0; j < G.length; j++) {
          g = G[j]; d = n.dem[g]; f = d > 0 ? Math.min(1, n.cons[g] / d) : 1; n.f[g] = f;
          Y += n.prod[g] * n.price[g] - n.inUse[g] * f * n.price[g];
          tariffRev += n.tariff * W.price[g] * n.imp[g];
          var cover = d > 0 ? n.stock[g] / d : 3, pr = n.price[g];
          pr *= 1 + 0.15 * (1 - f);
          if (cover > 1.5) pr *= 1 - Math.min(0.06, 0.03 * (cover - 1.5));
          // foreign goods cost more behind tariffs and bad harbours; what is sold abroad earns a little less
          var landed = n.imp[g] > 0 ? 1 + n.tariff + 0.5 * (1 - n.access) : n.exp[g] > 0 ? 1 - 0.25 * (1 - n.access) : 1;
          pr += 0.12 * (W.price[g] * landed - pr);
          n.price[g] = clamp(pr, 0.2 * BASE[g], 6 * BASE[g]);
          n.hist[g].push(n.price[g]); if (n.hist[g].length > 48) n.hist[g].shift();
          n.stock[g] = Math.min(n.stock[g] * 0.97, 4 * d + 2);
        }
        for (g in D.ARMS) { var got = n.armsDem[g] * n.f[g]; n.stockpile[g] += got; armsCost += got * n.price[g]; }
        var prodCost = this.onSettle ? this.onSettle(n) || 0 : 0;
        var basket = 0, basket0 = 0, tr;
        for (t = 0; t < TIERS.length; t++) { tr = D.NEEDS[TIERS[t]]; for (g in tr) { basket += tr[g] * n.price[g]; basket0 += tr[g] * BASE[g]; } }
        n.pi = basket / basket0;
        Y += n.idle / 1000 * 11 * n.pi * n.dev;   // townsfolk without land or a mill still earn from trades and services
        Y = Math.max(Y, popK * 0.5);
        var taxRev = n.tax * Y, admin = 0.30 * popK * n.pi, army = (n.armyCost || 0) * n.pi, interest = n.treasury < 0 ? -n.treasury * 0.004 : 0;
        n.income = Y; n.wages = admin + army + interest + n.spentBuild + prodCost; // what the state pays out comes back as household income
        var balance = taxRev + tariffRev - admin - army - armsCost - prodCost - interest;
        n.treasury += balance;
        n.last = { taxRev: taxRev, tariffRev: tariffRev, admin: admin, army: army, armsCost: armsCost, prodCost: prodCost, interest: interest, build: n.spentBuild, balance: balance - n.spentBuild, income: Y };
        n.spentBuild = 0;

        // how well people live: what they could afford times what the market could supply
        for (t = 0; t < TIERS.length; t++) {
          tier = D.NEEDS[TIERS[t]]; var num = 0, den = 0;
          for (g in tier) { num += tier[g] * BASE[g] * n.f[g]; den += tier[g] * BASE[g]; }
          n.sol[TIERS[t]] = Math.max(0, n.afford[TIERS[t]] * (den ? num / den : 1));
        }
        n.growth = clamp(0.0007 * (n.sol.life - 0.7) / 0.3, -0.0015, 0.0008);
        // landowners and mill owners work harder for a good price and ease off for a poor one
        for (var r = 0; r < RAW.length; r++) { g = RAW[r]; n.e[g] += 0.15 * (clamp(0.8 * Math.pow(n.price[g] / BASE[g], 0.7), 0.4, 1) - n.e[g]); }
        for (r = 0; r < FACTORIES.length; r++) {
          var ft = FACTORIES[r], fb = B[ft], vOut = 0, vIn = 0, bOut = 0, bIn = 0;
          for (g in fb.output) { vOut += fb.output[g] * n.price[g]; bOut += fb.output[g] * BASE[g]; }
          for (g in fb.input) { vIn += fb.input[g] * n.price[g]; bIn += fb.input[g] * BASE[g]; }
          n.u[ft] += 0.15 * (clamp(0.25 + 0.75 * (vOut - vIn) / ((bOut - bIn) * n.pi), 0.3, 1.1) - n.u[ft]);
        }
      }
      for (i = 0; i < provs.length; i++) { e = P[i]; e.pop = Math.max(500, e.pop * (1 + (N[provs[i].ctrl || provs[i].owner].growth || 0))); }

      // building work
      var done = this.builtThisMonth || [];   // construction now goes day by day (construction.js)
      this.builtThisMonth = [];
      if (!this.constructionDay) this.queue = this.queue.filter(function (q) { q.left--; if (q.left <= 0) { P[q.prov].b[q.type] = (P[q.prov].b[q.type] || 0) + 1; done.push(q); return false; } return true; });
      if (done.length) this.refreshAccess();
      else if (this.month % 12 === 0) this.refreshAccess();

      for (i = 0; i < tags.length; i++) if (tags[i] !== this.player) this.ai(tags[i]);
      this.month++;
      return done;
    },

    // ---------- how the other nations run their economies ----------
    ai: function (tag) {
      var self = this, n = this.N[tag], last = n.last; if (!last || n.pop <= 0) return;
      var spend = last.admin + last.armsCost + (last.army || 0);
      // keep about half a year of spending in the bank: tax harder when it runs out, ease off when it piles up
      var rev = (last.taxRev || 0) + (last.tariffRev || 0), bal = last.balance || 0, exp = Math.max(1, rev - bal), R = 6 * exp, cap = n.atWar ? 0.32 : 0.25;
      if (n.treasury < -6 * exp) { n.tax = Math.min(cap, n.tax + 0.02); n.arms = Math.max(0.1, n.arms - 0.05); }
      else if (n.treasury < 0 || (n.treasury < R && bal < 0)) { n.tax = Math.min(cap, n.tax + 0.01); if (n.treasury < 0) n.arms = Math.max(0.1, n.arms - 0.03); }
      else if (n.treasury > 3 * R && bal > 0) { n.tax = Math.max(0.03, n.tax - 0.01); n.arms = Math.min(0.8, n.arms + 0.02); }
      else if (n.treasury > 1.5 * R && bal > 0.1 * rev) n.tax = Math.max(0.05, n.tax - 0.005);
      if (n.tax > cap) n.tax = Math.max(cap, n.tax - 0.01);                  // peace: war taxes come down
      if (!n.atWar && n.arms < 0.5 && n.treasury > R) n.arms = Math.min(0.5, n.arms + 0.02);

      var mine = 0; this.queue.forEach(function (q) { if (self.provs[q.prov].owner === tag) mine++; });
      var rich = n.treasury > 3 * R && !n.atWar;                               // money in the vaults goes into roads, mills and mines
      if (mine >= (this.queueCap ? this.queueCap(tag, rich) : rich ? 12 : 5)) return;
      var reserve = 3 * spend, best = null;
      var owned = []; this.provs.forEach(function (p) { if (p.owner === tag && (!p.ctrl || p.ctrl === tag)) owned.push(p.id); });
      owned.sort(function (a, b) { return self.P[b].pop - self.P[a].pop; });
      function consider(id, type, gain) {
        if (self.buildBlock(id, type)) return;
        var cost = self.buildCost(id, type); if (n.treasury < cost + reserve) return;
        var roi = gain / cost; if (roi > 1 / 150 && (!best || roi > best.roi)) best = { id: id, type: type, roi: roi };
      }
      FACTORIES.forEach(function (type) {
        var profit = self.factoryProfit(tag, type), bd = B[type], out = Object.keys(bd.output)[0];
        profit *= 1 + 2 * (1 - n.f[out]);                                   // what the nation is short of pays best
        if (n.atWar && (out === 'muskets' || out === 'artillery')) profit = Math.max(profit, 0) * 2 + 30; // arms come first in wartime
        if (profit <= 0) return;
        for (var g in bd.input) if (n.f[g] < 0.75) return;      // no point building what cannot be fed
        for (g in bd.output) if (n.stock[g] > 2.5 * n.dem[g] && self.world.price[g] < 0.7 * BASE[g]) return; // glutted
        for (var i = 0; i < owned.length && i < 12; i++) { consider(owned[i], type, profit); if (best && best.type === type) break; }
      });
      for (var i = 0; i < owned.length && i < 8; i++) {
        var id = owned[i], e = this.P[id], value = e.out * n.price[e.res] + (e.grain || 0) * n.price.grain;
        consider(id, 'estates', 0.15 * value * (0.4 * e.pop - e.fworkers > e.cap * 1.05 ? 1 : 0.2));
        consider(id, 'roads', 0.05 * (value + (e.fvalue || 0)));
        if (n.access < 0.95) consider(id, 'port', 0.004 * n.income);
        if (B.arsenal && (n.atWar || n.treasury > 30 * spend)) consider(id, 'arsenal', (n.atWar ? 0.012 : 0.006) * n.income);
      }
      if (best) this.build(best.id, best.type);
    },

    // ---------- saving ----------
    serialize: function () {
      var self = this, N = {};
      this.tags.forEach(function (t) {
        var n = self.N[t];
        N[t] = { treasury: Math.round(n.treasury), tax: n.tax, tariff: n.tariff, arms: n.arms, price: n.price, stock: n.stock, f: n.f, e: n.e, u: n.u, pi: n.pi, income: n.income, wages: n.wages, stockpile: n.stockpile, sol: n.sol, last: n.last };
      });
      return { month: this.month, pop: this.P.map(function (e) { return Math.round(e.pop); }), b: this.P.map(function (e) { return e.b; }), N: N, world: this.world.price, queue: this.queue };
    },
    restore: function (s) {
      var self = this; if (!s || !s.pop || s.pop.length !== this.P.length) return false;
      this.month = s.month || 0;
      this.P.forEach(function (e, i) { e.pop = s.pop[i]; e.b = s.b[i] || {}; });
      this.tags.forEach(function (t) {
        var n = self.N[t], o = s.N && s.N[t]; if (!o) return;
        ['treasury', 'tax', 'tariff', 'arms', 'income', 'wages', 'pi', 'last'].forEach(function (k) { if (o[k] !== undefined) n[k] = o[k]; });
        ['price', 'stock', 'f', 'e', 'u', 'stockpile', 'sol'].forEach(function (k) { if (o[k]) for (var g in o[k]) n[k][g] = o[k][g]; });
        G.forEach(function (g) { n.hist[g] = [n.price[g]]; });
      });
      if (s.world) G.forEach(function (g) { if (s.world[g]) { self.world.price[g] = s.world[g]; self.world.hist[g] = [s.world[g]]; } });
      this.queue = (s.queue || []).filter(function (q) { return B[q.type] && self.P[q.prov]; });
      this.provs.forEach(function (p) { self.N[p.owner].pop = 0; });
      this.tags.forEach(function (t) { self.N[t].pop = 0; });
      this.provs.forEach(function (p) { self.N[p.owner].pop += self.P[p.id].pop; });
      this.refreshAccess();
      return true;
    }
  };

  root.Econ = Econ;
})(typeof window !== 'undefined' ? window : globalThis);
