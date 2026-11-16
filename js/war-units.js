// HoI4-style divisions and combat, layered over war.js:
//   templates and their stats, division experience, army experience, generals and field marshals, army groups,
//   planning, and battles fought over a combat width with reserves, attacks against defence or breakthrough,
//   and damage to organisation and strength.
(function (root) {
  'use strict';
  var War = root.War, U = root.UNITS, BAT = U.BATTALIONS, SUP = U.SUPPORT;
  var CLS = ['inf', 'cav', 'art'], TERR = ['p', 'h', 'f', 's', 'm', 'd'];
  var FRONT = { p: 60, h: 50, f: 44, s: 38, m: 34, d: 64 };          // combat width of a province
  var T_ATK = { p: 1, h: 0.8, f: 0.85, s: 0.7, m: 0.6, d: 1 };       // the attacker's attack, by terrain
  var ORG_HIT = 0.2, HP_HIT = 0.22;                                 // organisation and strength lost per damaging hit
  War.FRONT = FRONT; War.T_ATK = T_ATK;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(o) { var t = o.seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function hits(A, D) { return 0.1 * Math.min(A, D) + 0.4 * Math.max(0, A - D); }
  function copyDef(t) { return { name: t.name, cols: t.cols.map(function (c) { return c.slice(); }), sup: t.sup.slice() }; }
  War.hits = hits;

  // Research and doctrine hooks: stage 2 fills these in. mod(tag, key) is a fraction to add, e.g. 0.1 = +10%.
  War.mod = War.mod || function () { return 0; };
  War.canUse = War.canUse || function () { return true; };

  // ---------- templates ----------
  War.initUnits = function () {
    var self = this;
    this.tpls = {}; this.tplVer = 0; this._sc = {}; this.gens = []; this.groups = [];
    this.tags.forEach(function (t) {
      self.tpls[t] = [];
      var own = U.START_TEMPLATES[t] || {};
      CLS.forEach(function (c) { self.addTemplate(t, copyDef(own[c] || U.STD[c]), true); });
      self.M[t].xp = self.nations[t].major ? 20 : 5;
      self.M[t].lost = 0; self.M[t].killed = 0;
    });
  };
  War.addTemplate = function (tag, def, quiet) {
    var t = { id: this.nextId++, tag: tag, name: def.name || 'New division', cols: def.cols, sup: def.sup };
    this.tpls[tag].push(t); this.tplVer++; return t;
  };
  War.tplById = function (id) {
    var c = this._tb && this._tb[id];
    if (c && this.tpls[c.tag] && this.tpls[c.tag].indexOf(c) >= 0) return c;
    for (var t in this.tpls) { var l = this.tpls[t]; for (var i = 0; i < l.length; i++) if (l[i].id === id) { (this._tb = this._tb || {})[id] = l[i]; return l[i]; } }
    return null;
  };
  War.tplOfCls = function (tag, cls) {
    var l = this.tpls[tag] || []; for (var i = 0; i < l.length; i++) if (this.tplStats(l[i]).cls === cls) return l[i];
    return l[0] || null;
  };
  War.tplUsers = function (id) { var n = 0; for (var i = 0; i < this.divs.length; i++) if (this.divs[i].tpl === id) n++; for (i = 0; i < this.recruits.length; i++) if (this.recruits[i].tpl === id) n++; return n; };
  // Army experience to change a template: 5 per battalion added, removed or swapped, 10 per support company.
  War.editCost = function (oldDef, newDef) {
    function count(def) { var c = {}; def.cols.forEach(function (col) { col.forEach(function (b) { c[b] = (c[b] || 0) + 1; }); }); return c; }
    var a = count(oldDef), b = count(newDef), keys = {}, diff = 0, k;
    for (k in a) keys[k] = 1; for (k in b) keys[k] = 1;
    for (k in keys) diff += Math.abs((a[k] || 0) - (b[k] || 0));
    var sa = {}, sb = {}, sd = 0; oldDef.sup.forEach(function (s) { sa[s] = 1; }); newDef.sup.forEach(function (s) { sb[s] = 1; });
    for (k in sa) if (!sb[k]) sd++; for (k in sb) if (!sa[k]) sd++;
    return Math.ceil(diff / 2) * 5 + sd * 10;
  };
  War.validTemplate = function (tag, def) {
    var n = 0, self = this, bad = null;
    if (!def.cols || def.cols.length !== U.COLS) return 'Malformed template';
    def.cols.forEach(function (col) {
      if (col.length > U.ROWS) bad = 'A column holds at most ' + U.ROWS + ' battalions';
      var c = null; col.forEach(function (b) { if (!BAT[b]) bad = 'Unknown battalion'; else { if (c && BAT[b].cls !== c) bad = 'Each column takes one kind of battalion'; c = BAT[b].cls; if (!self.canUse(tag, BAT[b].tech)) bad = BAT[b].name + ' needs research first'; } n++; });
    });
    if (def.sup.length > U.SUP_SLOTS) bad = 'At most ' + U.SUP_SLOTS + ' support companies';
    def.sup.forEach(function (s, i) { if (!SUP[s]) bad = 'Unknown support company'; else if (def.sup.indexOf(s) !== i) bad = 'Each support company only once'; else if (!self.canUse(tag, SUP[s].tech)) bad = SUP[s].name + ' needs research first'; });
    if (!n) return 'A division needs at least one battalion';
    return bad;
  };
  // Save changes to a template (or a new one when id is null). Returns null or the reason it was refused.
  War.saveTemplate = function (tag, id, def) {
    var why = this.validTemplate(tag, def); if (why) return why;
    def.name = String(def.name || '').trim().slice(0, 40) || 'New division';
    var m = this.M[tag], self = this;
    if (id === null) { this.addTemplate(tag, copyDef(def)); return null; }
    var t = this.tplById(id); if (!t || t.tag !== tag) return 'No such template';
    var cost = this.tplUsers(id) ? this.editCost(t, def) : 0;
    if (cost > (m.xp || 0)) return 'Needs ' + cost + ' army experience (you have ' + Math.floor(m.xp || 0) + ')';
    var before = this.tplStats(t);
    m.xp -= cost; t.name = def.name; t.cols = def.cols.map(function (c) { return c.slice(); }); t.sup = def.sup.slice(); this.tplVer++;
    var after = this.tplStats(t);
    // divisions in the field must find the extra men and arms: they start below full strength
    this.divs.forEach(function (d) { if (d.tpl === id) { d.type = after.cls; if (after.hp > before.hp) d.str = Math.min(d.str, d.str * before.hp / after.hp); d.org *= 0.8; } });
    self.refreshUpkeep();
    return null;
  };
  War.deleteTemplate = function (tag, id) {
    if (this.tplUsers(id)) return 'Divisions still use it';
    var l = this.tpls[tag]; if (l.length <= 1) return 'Keep at least one template';
    for (var i = 0; i < l.length; i++) if (l[i].id === id) { l.splice(i, 1); this.tplVer++; return null; }
    return 'No such template';
  };

  // The stats of a template for its nation, with research and doctrine. Cached until anything changes.
  War.tplStats = function (t) {
    var c = this._sc[t.id], mv = this.modVer(t.tag);
    if (c && c.kc === t.cols && c.ks === t.sup && c.mv === mv) return c;   // rebuilt only when this template or the nation's modifiers change
    var tag = t.tag, self = this, s = { kc: t.cols, ks: t.sup, mv: mv, atk: 0, def: 0, brk: 0, org: 0, hp: 0, w: 0, spd: 99, sup: 0, men: 0, eq: {}, money: 0, upkeep: 0, nbat: 0,
      atkBy: { inf: 0, cav: 0, art: 0 }, n: { inf: 0, cav: 0, art: 0 }, terr: {}, has: {} };
    var orgSum = 0;
    TERR.forEach(function (tr) { s.terr[tr] = { inf: 0, cav: 0, art: 0 }; });
    t.cols.forEach(function (col) { col.forEach(function (b) {
      var B = BAT[b]; if (!B) return; var c = B.cls;
      var am = 1 + self.mod(tag, 'atk') + self.mod(tag, c + '_atk') + self.mod(tag, b + '_atk');
      var a = B.atk * am;
      s.atk += a; s.atkBy[c] += a; s.n[c]++;
      s.def += B.def * (1 + self.mod(tag, 'def') + self.mod(tag, c + '_def') + self.mod(tag, b + '_def'));
      s.brk += B.brk * (1 + self.mod(tag, 'brk') + self.mod(tag, c + '_brk'));
      orgSum += B.org; s.hp += B.hp; s.w += B.w; s.spd = Math.min(s.spd, B.spd * (1 + self.mod(tag, c + '_spd')));
      s.sup += B.sup; s.men += B.men; s.money += B.money; s.upkeep += B.upkeep; s.nbat++;
      for (var g in B.eq) s.eq[g] = (s.eq[g] || 0) + B.eq[g];
      TERR.forEach(function (tr) { s.terr[tr][c] += a * ((B.terr && B.terr[tr]) || 1); });
    }); });
    t.sup.forEach(function (k) {
      var S = SUP[k]; if (!S) return; s.has[k] = true;
      s.men += S.men; s.money += S.money; s.upkeep += S.upkeep; for (var g in S.eq) s.eq[g] = (s.eq[g] || 0) + S.eq[g];
      if (S.atk) { s.atk += S.atk; s.atkBy.art += S.atk; TERR.forEach(function (tr) { s.terr[tr].art += S.atk; }); }
      if (S.def) s.def += S.def; if (S.brk) s.brk += S.brk;
    });
    if (s.spd === 99) s.spd = 20;
    s.spd = Math.round(s.spd * (1 + this.mod(tag, 'spd')));
    s.eq.uniforms = Math.round(s.men / 250 * 10) / 10;
    s.org = s.nbat ? orgSum / s.nbat * (1 + this.mod(tag, 'org')) : 1;
    s.org = Math.max(s.org, 8);
    if (s.has.train) s.sup *= 0.8;
    s.cls = s.n.cav > s.n.inf && s.n.cav >= s.n.art ? 'cav' : s.n.art > s.n.inf && s.n.art > s.n.cav ? 'art' : 'inf';
    s.days = Math.min(120, 30 + 3 * s.nbat + 2 * t.sup.length);
    s.regen = (s.has.staff ? 1.2 : 1) * (1 + this.mod(tag, 'regen'));
    s.entrMax = 0.3 + (s.has.eng ? 0.15 : 0) + this.mod(tag, 'entr');
    s.reinf = 0.5 + (s.has.staff ? 0.25 : 0) + this.mod(tag, 'reinf');
    var q = War.QUALITY[tag] || 1; s.q = q;
    this._sc[t.id] = s; return s;
  };
  War.stats = function (d) { var t = this.tplById(d.tpl); return t ? this.tplStats(t) : this.tplStats(this.tpls[d.tag][0]); };

  // ---------- division experience ----------
  War.xpLevel = function (xp) { var L = U.XP_LEVELS, out = L[0]; for (var i = 0; i < L.length; i++) if (xp >= L[i].at) out = L[i]; return out; };

  // ---------- generals ----------
  War.initGenerals = function () {
    var self = this, used = {};
    this.tags.forEach(function (t, ti) {
      (U.GENERALS[t] || []).forEach(function (g) { self.gens.push({ id: self.nextId++, tag: t, name: g[0], skill: g[1], atk: g[2], def: g[3], plan: g[4], log: g[5], traits: g[6].slice(), fm: !!g[7], xp: 0, army: null, group: null }); used[g[0]] = 1; });
      var have = self.gens.filter(function (g) { return g.tag === t; }).length, divs = self.divs.filter(function (d) { return d.tag === t; }).length;
      var want = Math.max(divs ? 1 : 0, Math.ceil(divs / 9)), pool = U.NAMES[U.CULTURE[t] || 'de'];
      for (var k = 0; have < want && k < 40; k++) {
        var name = 'Gen. ' + pool[Math.floor(rnd(self) * pool.length)]; if (used[name]) continue; used[name] = 1;
        var sk = rnd(self) < 0.25 ? 2 : 1, r = function () { return Math.max(1, Math.min(4, sk + Math.floor(rnd(self) * 3) - 1)); };
        self.gens.push({ id: self.nextId++, tag: t, name: name, skill: sk, atk: r(), def: r(), plan: r(), log: r(), traits: rnd(self) < 0.25 ? [['veteran', 'brawler', 'defensive', 'offensive', 'hills', 'winter'][Math.floor(rnd(self) * 6)]] : [], fm: false, xp: 0, army: null, group: null });
        have++;
      }
    });
  };
  War.genById = function (id) { for (var i = 0; i < this.gens.length; i++) if (this.gens[i].id === id) return this.gens[i]; return null; };
  War.gensOf = function (tag) { return this.gens.filter(function (g) { return g.tag === tag; }); };
  function traitMods(m, traits, w) {
    traits.forEach(function (tr) {
      if (tr === 'emperor') { m.atk += 0.15 * w; m.org += 0.1 * w; }
      else if (tr === 'offensive') m.atk += 0.1 * w;
      else if (tr === 'defensive') { m.def += 0.1 * w; m.entr += 0.25 * w; }
      else if (tr === 'cavalry') m.cav += 0.15 * w;
      else if (tr === 'gunner') m.art += 0.15 * w;
      else if (tr === 'hills') m.hills += 0.15 * w;
      else if (tr === 'winter') m.winter += 0.5 * w;
      else if (tr === 'logistics') { m.supply += 0.15 * w; m.hunger += 0.25 * w; }
      else if (tr === 'staff') { m.plan += 0.2 * w; m.regen += 0.15 * w; }
      else if (tr === 'light') m.light += 0.15 * w;
      else if (tr === 'veteran') { m.atk += 0.05 * w; m.def += 0.05 * w; }
      else if (tr === 'brawler') m.brk += 0.08 * w;
      else if (tr === 'grandbattery') m.art += 0.25 * w;
      else if (tr === 'ironmarshal') { m.def += 0.12 * w; m.org += 0.1 * w; }
      else if (tr === 'bravest') { m.atk += 0.1 * w; m.brk += 0.1 * w; }
      else if (tr === 'reverseslope') { m.def += 0.2 * w; m.rslope = (m.rslope || 0) + w; }
      else if (tr === 'vorwarts') { m.atk += 0.12 * w; m.regen += 0.25 * w; }
      else if (tr === 'oldfox') { m.oldfox = (m.oldfox || 0) + w; m.winter += 0.5 * w; }
      else if (tr === 'mountainfox') { m.def += 0.1 * w; m.hills += 0.15 * w; }
    });
  }
  function genMods(g, w, m) {
    m.atk += 0.05 * g.atk * w; m.brk += 0.05 * g.atk * w; m.def += 0.05 * g.def * w;
    m.plan += 0.1 * g.plan * w; m.planMax += 0.01 * g.plan * w; m.supply += 0.05 * g.log * w; m.hunger += 0.05 * g.log * w;
    traitMods(m, g.traits, w);
  }
  function blank() { return { atk: 0, def: 0, brk: 0, org: 0, plan: 0, planMax: 0, cav: 0, art: 0, hills: 0, winter: 0, supply: 0, hunger: 0, regen: 0, light: 0, entr: 0, who: null }; }
  // The commander's effect on a division. Player divisions get their army's general (and half their field
  // marshal's); computer nations' divisions get the average of the generals they would have in the field.
  War.cmdOf = function (d) {
    var key = d.tag !== this.player ? d.tag : d.tag + ':' + (this.armyOf ? (this.armyOf(d.id) || { id: 0 }).id : 0);   // only the player's generals differ army by army
    this._cm = this._cm && this._cm.day === this.day ? this._cm : { day: this.day };
    if (this._cm[key]) return this._cm[key];
    var m = blank(), self = this;
    if (d.tag === this.player) {
      var a = this.armyOf ? this.armyOf(d.id) : null;
      if (a) {
        var g = a.gen ? this.genById(a.gen) : null; if (g) { genMods(g, 1, m); m.who = g; }
        var grp = a.group ? this.groupById(a.group) : null, fm = grp && grp.fm ? this.genById(grp.fm) : null;
        if (fm) genMods(fm, 0.5, m);
      }
    } else {
      var mine = this.gens.filter(function (x) { return x.tag === d.tag; }).sort(function (x, y) { return y.skill - x.skill; });
      var n = Math.max(1, Math.round((this.M[d.tag].count || 1) / 20)), top = mine.slice(0, n);
      top.forEach(function (x) { genMods(x, 1 / top.length, m); });
    }
    return (this._cm[key] = m);
  };
  War.gainGenXp = function (g, amt) {
    if (!g) return; g.xp += amt;
    var need = 60 * (g.skill + 1);
    if (g.xp >= need && g.skill < 5) {
      g.xp -= need; g.skill++; var k = ['atk', 'def', 'plan', 'log'][Math.floor(rnd(this) * 4)]; g[k] = Math.min(6, g[k] + 1);
      var pool = ['veteran', 'brawler', 'offensive', 'defensive', 'hills', 'winter', 'logistics', 'staff'].filter(function (x) { return g.traits.indexOf(x) < 0; });
      if (pool.length && rnd(this) < 0.35) g.traits.push(pool[Math.floor(rnd(this) * pool.length)]);
      if (g.tag === this.player) this.event('general', g.name + ' rises to skill ' + g.skill, { a: g.tag });
    }
  };
  // ---------- army groups ----------
  War.groupById = function (id) { for (var i = 0; i < this.groups.length; i++) if (this.groups[i].id === id) return this.groups[i]; return null; };
  War.newGroup = function (tag, armyIds) {
    var n = this.groups.filter(function (g) { return g.tag === tag; }).length + 1, self = this;
    var g = { id: this.nextId++, tag: tag, name: ['1st', '2nd', '3rd', '4th', '5th'][n - 1] ? ['1st', '2nd', '3rd', '4th', '5th'][n - 1] + ' Army Group' : n + 'th Army Group', fm: null };
    this.groups.push(g);
    armyIds.forEach(function (id) { var a = self.armies.filter(function (x) { return x.id === id; })[0]; if (a) a.group = g.id; });
    return g;
  };
  War.dissolveGroup = function (g) {
    this.armies.forEach(function (a) { if (a.group === g.id) a.group = null; });
    if (g.fm) { var fm = this.genById(g.fm); if (fm) fm.group = null; }
    this.groups = this.groups.filter(function (x) { return x !== g; });
  };
  War.assignGeneral = function (army, genId) {
    var self = this;
    if (army.gen) { var old = this.genById(army.gen); if (old) old.army = null; }
    army.gen = null;
    if (genId) { var g = this.genById(genId); if (!g || g.tag !== army.tag) return 'No such general';
      if (g.army) { var other = this.armies.filter(function (a) { return a.id === g.army; })[0]; if (other) other.gen = null; }
      if (g.group) { var og = this.groupById(g.group); if (og) og.fm = null; g.group = null; }
      g.army = army.id; army.gen = g.id; }
    this._cm = null; return null;
  };
  War.assignMarshal = function (group, genId) {
    if (group.fm) { var old = this.genById(group.fm); if (old) old.group = null; }
    group.fm = null;
    if (genId) { var g = this.genById(genId); if (!g || g.tag !== group.tag) return 'No such general'; if (!g.fm) return 'Only a field marshal can lead an army group';
      if (g.army) { var a = this.armies.filter(function (x) { return x.id === g.army; })[0]; if (a) a.gen = null; g.army = null; }
      if (g.group) { var og = this.groupById(g.group); if (og) og.fm = null; }
      g.group = group.id; group.fm = g.id; }
    this._cm = null; return null;
  };
  War.promote = function (g) { var cost = 50; if (g.fm) return 'Already a field marshal'; if ((this.M[g.tag].xp || 0) < cost) return 'Needs ' + cost + ' army experience'; this.M[g.tag].xp -= cost; g.fm = true; return null; };

  // ---------- divisions: spawning, power ----------
  var baseSpawn = War.spawn;
  War.spawn = function (tag, tplOrCls, prov, str) {
    var t = typeof tplOrCls === 'number' ? this.tplById(tplOrCls) : this.tplOfCls(tag, tplOrCls);
    var d = baseSpawn.call(this, tag, 'inf', prov, str); d.sr = 1; d.nosupply = false;
    d.tpl = t.id; d.type = this.tplStats(t).cls; d.xp = (War.QUALITY[tag] || 1) >= 1 && this.nations[tag].major ? 0.3 : 0.15; d.plan = 0;
    return d;
  };
  // A single number for "how hard does this division hit" and "how well does it hold", scaled so a
  // standard 1805 infantry division is 6 and 9. The computer generals use these to judge odds.
  War.REF = null;
  War.power = function (d, stat) {
    if (!this.REF) { var r = this.tplStats({ id: -1, tag: '_', cols: U.STD.inf.cols, sup: [] }); this.REF = { A: r.atk, D: r.def, B: r.brk, O: r.org }; }
    var s = this.stats(d), R = this.REF, cm = this.cmdOf(d), xpm = 1 + this.xpLevel(d.xp || 0).mod;
    var base = d.str * (0.4 + 0.6 * d.org) * (d.nosupply ? 0.6 : 1) * s.q * xpm * (this.dm ? this.dm(d, stat === 'atk' ? 'a' : 'd') : 1);
    if (stat === 'atk') return 6 * base * (1 + cm.atk) * (1 + (d.plan || 0)) * (0.5 * s.atk / R.A + 0.25 * s.brk / R.B + 0.25 * s.org / R.O);
    return 9 * base * (1 + cm.def) * (0.5 * s.def / R.D + 0.25 * s.atk / R.A + 0.25 * s.org / R.O);
  };

  // ---------- recruiting by template ----------
  War.recruitBlock = function (tag, tplOrCls, prov) {
    var t = typeof tplOrCls === 'number' ? this.tplById(tplOrCls) : this.tplOfCls(tag, tplOrCls); if (!t) return 'No such template';
    var T = this.tplStats(t), n = this.econ.N[tag], m = this.M[tag], p = this.provs[prov];
    if (p.owner !== tag || p.ctrl !== tag) return 'Not yours to recruit in';
    if (m.manpower < T.men) return 'Too few recruits';
    for (var g in T.eq) if (n.stockpile[g] < T.eq[g]) return 'Arsenal lacks ' + g;
    if (n.treasury < T.money * (n.pi || 1) && tag === this.player) return 'Not enough money';
    return null;
  };
  War.recruit = function (tag, tplOrCls, prov) {
    var why = this.recruitBlock(tag, tplOrCls, prov); if (why) return why;
    var t = typeof tplOrCls === 'number' ? this.tplById(tplOrCls) : this.tplOfCls(tag, tplOrCls), T = this.tplStats(t), n = this.econ.N[tag], cost = T.money * (n.pi || 1);
    this.M[tag].manpower -= T.men; for (var g in T.eq) n.stockpile[g] -= T.eq[g];
    n.treasury -= cost; n.spentBuild += cost;
    this.recruits.push({ tag: tag, tpl: t.id, prov: prov, left: T.days });
    return null;
  };
  War.legDays = function (d, from, leg) {
    var a = this.provs[from], b = this.provs[leg.to], km = this.distKm(a, b);
    if (leg.sea) return Math.ceil(6 + km / 110);
    var roads = (this.econ.P[leg.to].b.roads || 0), days = km / this.stats(d).spd * War.T_MOVE[b.terrain] * (1 - 0.1 * roads) * (this.moveMod ? this.moveMod(b) : 1);
    if (a.straits.indexOf(leg.to) >= 0) days += 3;
    return Math.max(1, Math.ceil(days));
  };
  War.refreshUpkeep = function () {
    var self = this; this.tags.forEach(function (t) { var m = self.M[t]; m.upkeep = 0; m.men = 0; m.count = 0; });
    this.divs.forEach(function (d) { var m = self.M[d.tag], s = self.stats(d); m.upkeep += s.upkeep * (0.5 + 0.5 * d.str); m.men += s.men * d.str; m.count++; });
    this.tags.forEach(function (t) { self.econ.N[t].armyCost = self.M[t].upkeep; });
  };

  // ---------- rivers ----------
  War.attrMod = function (d) { return Math.max(0.3, 1 - this.mod(d.tag, 'attr')); };
  War.river = function (a, b) { var p = this.provs[a]; return !!(p.riv && p.riv.indexOf(b) >= 0); };

  // ---------- battles ----------
  // Each day: each side puts divisions into the line up to the province's combat width (more if attacked from
  // several sides), the rest wait in reserve. Every attack a division makes is parried by the target's defence
  // (or, if the target is attacking, its breakthrough). Parried attacks do damage one time in ten; the rest one
  // time in two and a half. Damage takes organisation and strength. A division with no organisation left breaks.
  War.fight = function (bt) {
    var self = this, p = this.provs[bt.prov];
    var A = this.attackers(bt), Df = this.defenders(bt);
    A = A.filter(function (d) { return d.org > 0.02; });
    if (!A.length) return this.endBattle(bt, false);
    if (!Df.length) return this.endBattle(bt, true);
    bt.days++;
    var origins = {}, sea = false, strait = false, river = false;
    A.forEach(function (d) { origins[d.prov] = 1; if (d.path[0].sea) sea = true; else if (self.provs[d.prov].straits.indexOf(bt.prov) >= 0) strait = true; else if (self.river(d.prov, bt.prov)) river = true; });
    var dirs = Object.keys(origins).length, frontage = FRONT[p.terrain] + Math.min(60, 30 * (dirs - 1));
    bt.frontage = frontage; bt.dirs = dirs;
    function line(list, prev, first) {
      var ids = {}, used = 0, out = [], byId = {}; list.forEach(function (d) { byId[d.id] = d; });
      (prev || []).forEach(function (id) { var d = byId[id]; if (d && d.org > 0.06 && !ids[id]) { ids[id] = 1; out.push(d); used += self.stats(d).w; } });
      list.slice().sort(function (x, y) { return (y.plan || 0) - (x.plan || 0) || y.org - x.org; }).forEach(function (d) {
        if (ids[d.id] || (d.org <= 0.06 && out.length)) return; var s = self.stats(d);
        if (!out.length || (used + s.w <= frontage && (first || rnd(self) < s.reinf))) { ids[d.id] = 1; out.push(d); used += s.w; }
      });
      return { list: out, used: used };
    }
    var la = line(A, bt.fa, bt.days === 1), ld = line(Df, bt.fd, bt.days === 1);
    bt.fa = la.list.map(function (d) { return d.id; }); bt.fd = ld.list.map(function (d) { return d.id; });
    bt.wa = la.used; bt.wd = ld.used; bt.na = A.length; bt.nd = Df.length;

    var t = p.terrain, hilly = t === 'h' || t === 'm', winter = this.winterAt(p), wx = this.weatherAt ? this.weatherAt(p) : null;
    var fort = this.fortAt ? this.fortAt(bt.prov) : 0;
    var penalty = (sea ? 0.5 : strait ? 0.65 : 1), mods = [];
    if (sea) mods.push(['Landing from the sea', -50]); else if (strait) mods.push(['Across a strait', -35]);
    if (T_ATK[t] < 1) mods.push(['Terrain: ' + ({ h: 'hills', f: 'forest', s: 'marsh', m: 'mountains' })[t], Math.round((T_ATK[t] - 1) * 100)]);
    if (dirs > 1) mods.push(['Attacked from ' + dirs + ' sides', '+' + (frontage - FRONT[t]) + ' width']);
    if (fort) mods.push(['Fort level ' + fort, -15 * fort]);
    if (wx && wx.atk < 1) mods.push([wx.name, Math.round((wx.atk - 1) * 100)]);
    // attacker's side
    var sumA = 0, sumB = 0, wA = 0;
    la.list.forEach(function (d) {
      var s = self.stats(d), cm = self.cmdOf(d), xp = 1 + self.xpLevel(d.xp || 0).mod, tr = s.terr[t];
      var cls = tr.inf * (1 + (t === 'f' || t === 's' ? cm.light * (s.n.inf ? 1 : 0) : 0)) + tr.cav * (1 + cm.cav) + tr.art * (1 + cm.art);
      var riv = river ? 1 - (s.has.eng ? 0.15 : 0.3) * Math.max(0, 1 - self.mod(d.tag, 'river')) : 1, fortM = fort ? Math.max(0.3, 1 - 0.15 * fort * (1 + self.mod(p.ctrl, 'fort')) * (s.has.eng ? 0.75 : 1)) : 1;
      var a = cls * T_ATK[t] * penalty * riv * fortM * (1 + cm.atk + (hilly ? cm.hills : 0)) * (1 + (d.plan || 0)) * xp * s.q * (s.has.scouts ? 1.08 : 1) * (d.nosupply ? 0.6 : 1) * (wx ? wx.atk : 1);
      var sfa = 0.7 + 0.3 * (d.sr === undefined ? 1 : d.sr);
      var dma = self.dm ? self.dm(d, 'a', bt) : 1;
      d._a = a * d.str * sfa * dma; d._b = sfa * s.brk * (1 + cm.brk + cm.atk) * (1 + 0.5 * (d.plan || 0)) * xp * s.q * d.str * (d.nosupply ? 0.6 : 1) * dma;
      sumA += d._a; sumB += d._b; wA += s.w;
    });
    if (river) mods.push(['Crossing a river', -30]);
    // defender's side
    var sumD = 0, sumAd = 0, wD = 0;
    ld.list.forEach(function (d) {
      var s = self.stats(d), cm = self.cmdOf(d), xp = 1 + self.xpLevel(d.xp || 0).mod, tr = s.terr[t];
      var cls = tr.inf + tr.cav * (1 + cm.cav) + tr.art * (1 + cm.art);
      var sf = 0.7 + 0.3 * (d.sr === undefined ? 1 : d.sr);
      var dmd = self.dm ? self.dm(d, 'd', bt) : 1;
      d._d = s.def * (1 + cm.def + (hilly ? cm.hills + self.mod(d.tag, 'hills_def') : 0)) * (1 + d.entr) * xp * s.q * d.str * (d.nosupply ? 0.6 : 1) * sf * dmd;
      d._a = cls * (1 + cm.atk) * xp * s.q * d.str * (d.nosupply ? 0.6 : 1) * (wx ? wx.atk : 1) * sf * dmd;
      sumD += d._d; sumAd += d._a; wD += s.w;
    });
    var luckA = 0.85 + 0.3 * rnd(this), luckD = 0.85 + 0.3 * rnd(this);
    var hD = hits(sumA, sumD) * luckA, hA = hits(sumAd, sumB) * luckD;
    bt.last = { A: sumA, D: sumD, Ad: sumAd, B: sumB, hD: hD, hA: hA, mods: mods };
    var lossA = 0, lossD = 0, orgA = 0, orgD = 0;
    function deal(list, H, wsum, side) {
      list.forEach(function (d) {
        var s = self.stats(d), share = self.stats(d).w / Math.max(wsum, 1), h = H * share;
        var dOrg = h * ORG_HIT / s.org, dStr = h * HP_HIT * (s.has.surg ? 0.75 : 1) * Math.max(0.5, 1 - self.mod(d.tag, 'cas')) / s.hp * (self.dmCas ? self.dmCas(d) : 1);
        d.org = Math.max(0, d.org - dOrg); d.str = Math.max(0, d.str - dStr);
        var men = dStr * s.men; self.M[d.tag].lost += men;
        if (side === 'a') { lossA += men; orgA += dOrg; } else { lossD += men; orgD += dOrg; }
        d.xp = Math.min(1, (d.xp || 0) + 0.004);
        self.M[d.tag].xp = Math.min(999, (self.M[d.tag].xp || 0) + 0.08);
        var cm = self.cmdOf(d); if (cm.who) self.gainGenXp(cm.who, 1 / Math.max(1, list.length));
        if (side === 'a') d.plan = Math.max(0, (d.plan || 0) - 0.015);
      });
    }
    deal(la.list, hA, wA, 'a'); deal(ld.list, hD, wD, 'd');
    bt.casA = (bt.casA || 0) + lossA; bt.casD = (bt.casD || 0) + lossD;
    if (la.list.length) this.M[bt.tag].killed += lossD;
    var odds = (orgD / Math.max(1, ld.list.length) + 1e-6) / (orgA / Math.max(1, la.list.length) + 1e-6);
    bt.odds = odds; bt.r = clamp(Math.pow(odds, 1 / 1.6), 0.2, 5);
    // a broken army is pursued: horsemen cut down stragglers and take prisoners, so defeat costs far more than the fighting
    var cavA = 0; la.list.forEach(function (d) { if (d.type === 'cav') cavA++; });
    var pursue = 0.035 + 0.09 * Math.min(1, cavA / Math.max(1, la.list.length) * 3);
    Df.forEach(function (d) {
      if (!(d.org <= 0.06 || d.str <= 0.05)) return;
      if (d.str > 0.05 && la.list.length) {
        var s = self.stats(d), cut = Math.min(d.str - 0.02, pursue * (d.nosupply ? 1.6 : 1)), men = cut * s.men;
        d.str -= cut; self.M[d.tag].lost += men; self.M[bt.tag].killed += men; bt.casD = (bt.casD || 0) + men;
      }
      self.rout(d);
    });
    A.forEach(function (d) { if (d.org <= 0.06 || d.str <= 0.05) { if (d.str <= 0.05) d.dead = true; self.leaveBattle(d); d.path = []; d.prog = 0; } });
    if (!this.defenders(bt).length) return this.endBattle(bt, true);
    if (!this.attackers(bt).length) return this.endBattle(bt, false);
  };

  // Computer nations spend army experience improving their main infantry template, as a player would.
  War.aiTemplates = function (tag) {
    var m = this.M[tag]; if ((m.xp || 0) < 15) return;
    var t = this.tplOfCls(tag, 'inf'); if (!t) return;
    var want = ['eng', 'staff', 'surg', 'scouts', 'train'].filter(function (s) { return t.sup.indexOf(s) < 0; })[0];
    if (!want || t.sup.length >= U.SUP_SLOTS || !this.canUse(tag, SUP[want].tech)) return;
    var def = { name: t.name, cols: t.cols, sup: t.sup.concat([want]) };
    if (this.editCost(t, def) <= m.xp) this.saveTemplate(tag, t.id, def);
  };

  // ---------- saving ----------
  War.saveUnits = function () {
    return { tpls: this.tpls, gens: this.gens, groups: this.groups, ext: this.divs.map(function (d) { return [d.id, d.tpl, Math.round((d.xp || 0) * 1000) / 1000, Math.round((d.plan || 0) * 1000) / 1000]; }) };
  };
  War.loadUnits = function (u) {
    var self = this;
    if (!u || !u.tpls) { // a save from before templates: give every division its nation's standard template
      this.tags.forEach(function (t) { if (!self.tpls[t]) self.tpls[t] = []; });
      this.divs.forEach(function (d) { var t = self.tplOfCls(d.tag, d.type); d.tpl = t.id; d.xp = 0.25; d.plan = 0; });
      return;
    }
    this.tpls = u.tpls; this.gens = u.gens || []; this.groups = u.groups || []; this.tplVer++; this._sc = {};
    var ext = {}; (u.ext || []).forEach(function (e) { ext[e[0]] = e; });
    this.divs.forEach(function (d) { var e = ext[d.id]; if (e) { d.tpl = e[1]; d.xp = e[2]; d.plan = e[3]; } if (!self.tplById(d.tpl)) d.tpl = self.tplOfCls(d.tag, d.type).id; d.type = self.stats(d).cls; });
  };
})(typeof window !== 'undefined' ? window : globalThis);
