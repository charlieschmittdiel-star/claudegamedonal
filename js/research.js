// Research, land doctrines and laws. Everything here works through War.mod(tag, key): a fraction added to some
// stat (0.1 = +10%). Divisions, battles, the economy and production read those numbers.
(function (root) {
  'use strict';
  var War = root.War;
  function rnd(o) { var t = o.seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

  var CATS = { inf: 'Infantry', cav: 'Cavalry', art: 'Artillery', eng: 'Engineering', ind: 'Industry', nav: 'Navy', doc: 'Land doctrine' };
  // [id, category, name, year, days, effects, requires, unlock note]
  var TECH = [
    ['grenadiers', 'inf', 'Grenadier companies', 1805, 90, {}, null, 'Unlocks Grenadier battalions'],
    ['musket1', 'inf', 'Improved Charleville musket', 1805, 100, { inf_atk: 0.08 }, null],
    ['drill', 'inf', 'Regulation drill', 1806, 120, { inf_def: 0.08, org: 0.05 }, null],
    ['skirmish', 'inf', 'Skirmisher screens', 1807, 130, { light_atk: 0.15, light_def: 0.1 }, 'musket1'],
    ['rifles', 'inf', 'Baker rifle', 1808, 150, { light_atk: 0.15 }, 'skirmish'],
    ['depots', 'inf', 'Depot battalions', 1809, 140, { trainxp: 0.15, reinf: 0.1 }, 'drill'],
    ['musket2', 'inf', 'Musket of the year IX', 1811, 160, { inf_atk: 0.1, inf_def: 0.05 }, 'musket1'],
    ['landwehr', 'inf', 'Landwehr training', 1812, 140, { mil_atk: 0.25, mil_def: 0.2 }, 'depots'],
    ['percussion', 'inf', 'Percussion cap', 1820, 200, { inf_atk: 0.15 }, 'musket2'],
    ['heavycav', 'cav', 'Heavy cavalry', 1805, 90, {}, null, 'Unlocks Cuirassiers'],
    ['remounts', 'cav', 'Remount depots', 1806, 110, { cav_spd: 0.08, cav_def: 0.1 }, null],
    ['lancers', 'cav', 'Lancers', 1809, 140, { cav_brk: 0.15, cav_atk: 0.05 }, 'remounts'],
    ['studs', 'cav', 'State horse studs', 1812, 150, { cav_atk: 0.1, cav_def: 0.1 }, 'lancers'],
    ['horseart', 'art', 'Horse artillery', 1805, 90, {}, null, 'Unlocks Horse artillery'],
    ['gribeauval', 'art', 'Gribeauval system', 1805, 110, { art_atk: 0.1 }, null],
    ['shrapnel', 'art', 'Shrapnel shell', 1808, 150, { art_atk: 0.15 }, 'gribeauval'],
    ['anXI', 'art', 'System of the year XI', 1810, 150, { art_atk: 0.08, art_spd: 0.1 }, 'gribeauval'],
    ['rockets', 'art', 'Congreve rockets', 1813, 160, { art_brk: 0.3, art_atk: 0.05 }, 'shrapnel'],
    ['forts1', 'eng', 'Vauban fortification', 1805, 100, { fortmax: 1 }, null, 'Forts up to level 2'],
    ['pontoons', 'eng', 'Pontoon trains', 1807, 130, { river: 0.4 }, null],
    ['magazines', 'eng', 'Supply magazines', 1806, 120, { attr: 0.15, supply: 0.1 }, null],
    ['ambulance', 'eng', 'Flying ambulances', 1807, 130, { cas: 0.1 }, null],
    ['entrench', 'eng', 'Field fortification', 1809, 140, { entr: 0.1 }, 'pontoons'],
    ['forts2', 'eng', 'Polygonal fortress', 1815, 180, { fortmax: 2, fort: 0.2 }, 'forts1', 'Forts up to level 4'],
    ['macadam', 'eng', 'Macadam roads', 1815, 180, { spd: 0.1, attr: 0.1 }, 'magazines'],
    ['labour', 'ind', 'Division of labour', 1806, 120, { prodeff: 0.1 }, null],
    ['rotation', 'ind', 'Crop rotation', 1806, 120, { grain_out: 0.1 }, null],
    ['parts', 'ind', 'Interchangeable parts', 1810, 160, { prodout: 0.15 }, 'labour'],
    ['loom', 'ind', 'Power loom', 1812, 160, { cloth_out: 0.25, factory: 0.05 }, 'labour'],
    ['steam', 'ind', 'Steam engine', 1815, 200, { factory: 0.15, prodout: 0.1 }, 'parts'],
    ['puddling', 'ind', 'Puddling furnace', 1818, 180, { iron_out: 0.25 }, 'steam'],
    ['masonry', 'ind', 'Improved masonry', 1805, 90, { cons: 0.1 }, null, 'Construction +10%'],
    ['academies', 'ind', 'Military academies', 1806, 130, { rslot: 1 }, null, 'A fifth research slot (+1)'],
    ['factorysys', 'ind', 'Factory system', 1807, 140, { slots: 0.2 }, 'labour', 'Building slots +20%'],
    ['canals', 'ind', 'Canal building', 1808, 150, { cons: 0.1, supply: 0.05 }, 'masonry', 'Construction +10%'],
    ['statistics', 'ind', 'State statistics', 1809, 140, { cgoods: -0.05, rspeed: 0.05 }, 'academies', 'Consumer goods −5%, research +5%'],
    ['polytechnic', 'ind', 'Polytechnic schools', 1811, 170, { rslot: 1, rspeed: 0.05 }, 'statistics', 'Another research slot (+1)'],
    ['gaslight', 'ind', 'Gas lighting', 1813, 170, { slots: 0.2, factory: 0.05 }, 'factorysys', 'Building slots +20%'],
    ['tramways', 'ind', 'Iron tramways', 1816, 190, { cons: 0.15, spd: 0.05 }, 'canals', 'Construction +15%'],
    ['copper', 'nav', 'Copper sheathing', 1805, 100, { nspd: 0.1, nrepair: 0.25 }, null],
    ['gunlock', 'nav', 'Flintlock gunlocks', 1805, 110, { ngun: 0.1 }, null],
    ['signals', 'nav', "Popham's signal code", 1806, 130, { nadm: 0.1, nspot: 0.15 }, null],
    ['carronade', 'nav', 'Carronades', 1806, 130, { nscreen: 0.2 }, 'gunlock'],
    ['blockmills', 'nav', 'Block mills', 1808, 150, { nprod: 0.2 }, 'copper'],
    ['heavyfrig', 'nav', 'Heavy frigates', 1810, 160, { nfrig: 0.2 }, 'carronade'],
    ['bracing', 'nav', 'Diagonal bracing', 1812, 170, { nhp: 0.15, nprod: 0.1 }, 'blockmills'],
    ['shellguns', 'nav', 'Shell guns', 1822, 220, { ngun: 0.2 }, 'carronade'],
    // doctrines: choose one path; each step needs the one before
    ['corps1', 'doc', 'Corps system', 1805, 120, { planmax: 0.05, cav_spd: 0.05 }, null, 'Napoleonic path', 'corps'],
    ['corps2', 'doc', 'Combined arms', 1807, 150, { atk: 0.08 }, 'corps1', null, 'corps'],
    ['corps3', 'doc', 'Strategic envelopment', 1810, 170, { brk: 0.15, spd: 0.05 }, 'corps2', null, 'corps'],
    ['corps4', 'doc', 'The grand battery', 1813, 190, { art_atk: 0.2 }, 'corps3', null, 'corps'],
    ['line1', 'doc', 'Firepower discipline', 1805, 120, { def: 0.08 }, null, 'Linear path', 'line'],
    ['line2', 'doc', 'Reverse slope', 1807, 150, { hills_def: 0.2, entr: 0.05 }, 'line1', null, 'line'],
    ['line3', 'doc', 'Square and volley', 1810, 170, { org: 0.1, cav_def: 0.1 }, 'line2', null, 'line'],
    ['line4', 'doc', 'The thin line', 1813, 190, { def: 0.1, inf_atk: 0.08 }, 'line3', null, 'line'],
    ['mass1', 'doc', 'Column of attack', 1805, 120, { inf_atk: 0.08, inf_brk: 0.1 }, null, 'Mass levy path', 'mass'],
    ['mass2', 'doc', 'Nation in arms', 1807, 150, { mp: 0.3, mpcap: 0.3 }, 'mass1', null, 'mass'],
    ['mass3', 'doc', 'Endurance', 1810, 170, { regen: 0.2, attr: 0.1 }, 'mass2', null, 'mass'],
    ['mass4', 'doc', 'Endless reserves', 1813, 190, { reinf: 0.3, mil_atk: 0.3 }, 'mass3', null, 'mass']
  ].map(function (a) { return { id: a[0], cat: a[1], name: a[2], year: a[3], days: a[4], eff: a[5], req: a[6], note: a[7] || null, path: a[8] || null }; });
  var TECH_BY = {}; TECH.forEach(function (t) { TECH_BY[t.id] = t; });

  // what each nation already knows in 1805
  var START = {
    FRA: ['grenadiers', 'heavycav', 'horseart', 'gribeauval', 'forts1', 'musket1', 'corps1'], GBR: ['grenadiers', 'heavycav', 'horseart', 'forts1', 'line1'],
    AUS: ['grenadiers', 'heavycav', 'horseart', 'forts1', 'line1'], PRU: ['grenadiers', 'heavycav', 'horseart', 'drill', 'line1'], RUS: ['grenadiers', 'heavycav', 'horseart', 'mass1'],
    SPA: ['grenadiers', 'heavycav', 'forts1'], OTT: ['heavycav'], SWE: ['grenadiers', 'heavycav'], ITA: ['grenadiers', 'heavycav'], BAV: ['grenadiers'], SAX: ['grenadiers', 'heavycav'],
    POR: ['grenadiers', 'forts1'], DEN: ['grenadiers', 'forts1']
  };
  // the navies' head start
  [['GBR', ['copper', 'gunlock', 'signals']], ['FRA', ['copper']], ['SPA', ['copper']], ['DEN', ['copper']], ['SWE', ['copper']], ['BAT', ['copper']]].forEach(function (x) { START[x[0]] = (START[x[0]] || []).concat(x[1]); });
  var DOCTRINE = { FRA: 'corps', ITA: 'corps', BAV: 'corps', BAT: 'corps', GBR: 'line', AUS: 'line', PRU: 'line', SWE: 'line', POR: 'line', RUS: 'mass', OTT: 'mass', PER: 'mass', SPA: 'mass' };

  var LAWS = {
    conscription: { name: 'Conscription', opts: [
      { id: 'volunteer', name: 'Volunteer army', blurb: 'Recruits capped at 1.5% of the people; trade and farms +5%', eff: { mpcap: -0.5, mp: -0.4, factory: 0.05, land: 0.05 } },
      { id: 'limited', name: 'Limited conscription', blurb: 'Recruits capped at 3% of the people', eff: {} },
      { id: 'extensive', name: 'Extensive conscription', blurb: 'Recruits capped at 4.8%; farms and mills −5%', eff: { mpcap: 0.6, mp: 0.6, factory: -0.05, land: -0.05 } },
      { id: 'levee', name: 'Levée en masse', blurb: 'Recruits capped at 7.5%; farms and mills −15%; only at war', eff: { mpcap: 1.5, mp: 1.5, factory: -0.15, land: -0.15, trainxp: -0.05 }, war: true }] },
    economy: { name: 'Economy', opts: [
      { id: 'civilian', name: 'Civilian economy', blurb: 'Military factories −30%; mills +5%; consumer goods take 30% of builders', eff: { prodout: -0.3, factory: 0.05, cgoods: 0.05 } },
      { id: 'partial', name: 'Partial mobilisation', blurb: 'Consumer goods take 25% of builders', eff: {} },
      { id: 'war', name: 'War economy', blurb: 'Military factories +25%, efficiency grows faster; mills −10%; consumer goods only 15% of builders; only at war', eff: { prodout: 0.25, prodgrow: 0.5, factory: -0.1, cgoods: -0.1 }, war: true }] }
  };
  var LAW_COOLDOWN = 90;

  War.TECH = TECH; War.TECH_BY = TECH_BY; War.TECH_CATS = CATS; War.LAWS = LAWS;

  War.initResearch = function () {
    var self = this; this.R = {}; this.laws = {};
    this.tags.forEach(function (t) {
      var done = {}; (START[t] || []).forEach(function (id) { done[id] = 1; });
      self.R[t] = { done: done, slots: [], path: DOCTRINE[t] && done[DOCTRINE[t] + '1'] ? DOCTRINE[t] : null, nslots: self.nations[t].major ? 4 : 3 };
      for (var i = 0; i < self.R[t].nslots; i++) self.R[t].slots.push(null);
      self.laws[t] = { conscription: 'limited', economy: 'partial', changed: -999 };
    });
    this.techVer = (this.techVer || 0) + 1; this._mods = {};
  };

  // ---------- the sum of everything that modifies a nation ----------
  War.mod = function (tag, key) {
    var c = this._mods && this._mods[tag];
    var tv = this._tv && this._tv[tag] || 0;
    if (!c || c.v !== this.techVer || c.tv !== tv || this.day - c.day >= 10 || this.day < c.day) {
      var old = c; c = { v: this.techVer, tv: tv, day: this.day, m: {} }; var m = c.m, R = this.R && this.R[tag];
      if (R) for (var id in R.done) { var t = TECH_BY[id]; if (t) for (var k in t.eff) m[k] = (m[k] || 0) + t.eff[k]; }
      var L = this.laws && this.laws[tag];
      if (L) ['conscription', 'economy'].forEach(function (g) { var o = LAWS[g].opts.filter(function (x) { return x.id === L[g]; })[0]; if (o) for (var k2 in o.eff) m[k2] = (m[k2] || 0) + o.eff[k2]; });
      if (this.extraMods) { var xm = this.extraMods(tag); for (var k3 in xm) m[k3] = (m[k3] || 0) + xm[k3]; }
      // the sums get a new version number only when they have really changed, so what hangs on them (division stats) can be kept
      var same = !!old, k4; if (same) { for (k4 in m) if (old.m[k4] !== m[k4]) { same = false; break; } if (same) for (k4 in old.m) if (m[k4] === undefined) { same = false; break; } }
      c.ver = same ? old.ver : (this._modSeq = (this._modSeq || 0) + 1);
      this._mods = this._mods || {}; this._mods[tag] = c;
    }
    return c.m[key] || 0;
  };
  War.modVer = function (tag) {
    var c = this._mods && this._mods[tag]; if (c && c.chk === this.day && c.v === this.techVer) return c.ver;
    this.mod(tag, 'atk'); c = this._mods[tag]; c.chk = this.day; return c.ver;
  };
  War.canUse = function (tag, tech) { return !tech || !!(this.R && this.R[tag] && this.R[tag].done[tech]); };
  War.fortMax = function (tag) { return 1 + this.mod(tag, 'fortmax'); };

  // ---------- research ----------
  War.year = function () { return 1805 + (243 + this.day) / 365; };
  War.techDays = function (tag, t) {
    var ahead = Math.max(0, t.year - this.year());
    return Math.round(t.days * (1 + 1.2 * ahead));
  };
  War.techState = function (tag, id) {
    var R = this.R[tag], t = TECH_BY[id];
    if (R.done[id]) return 'done';
    if (R.slots.some(function (s) { return s && s.id === id; })) return 'active';
    if (t.req && !R.done[t.req]) return 'locked';
    if (t.path && R.path && t.path !== R.path) return 'other path';
    return 'open';
  };
  War.startResearch = function (tag, id) {
    var R = this.R[tag], t = TECH_BY[id]; if (!t) return 'No such research';
    var st = this.techState(tag, id); if (st !== 'open') return st === 'locked' ? 'Research ' + TECH_BY[t.req].name + ' first' : st === 'other path' ? 'Your army follows another doctrine' : 'Already ' + st;
    var i = R.slots.indexOf(null); if (i < 0) return 'All research slots are busy';
    if (t.path && !R.path) R.path = t.path;
    // a research bonus that fits is spent on it, as in HoI4
    var bonus = 0, bi = -1; (R.bonus || []).forEach(function (b, j) { if (b.cats.indexOf(t.cat) >= 0 && b.pct > bonus) { bonus = b.pct; bi = j; } });
    if (bi >= 0) R.bonus.splice(bi, 1);
    R.slots[i] = { id: id, prog: 0, need: this.techDays(tag, t), bonus: bonus };
    R.queue = (R.queue || []).filter(function (q) { return q !== id; });
    return null;
  };
  War.researchSlots = function (tag) { var R = this.R[tag]; return R.nslots + Math.round(this.mod(tag, 'rslot')); };
  War.researchSpeed = function (tag, s) { return (1 + this.mod(tag, 'rspeed')) * (1 + (s && s.bonus || 0)); };
  War.queueResearch = function (tag, id) {
    var R = this.R[tag]; R.queue = R.queue || [];
    if (R.queue.indexOf(id) >= 0) { R.queue = R.queue.filter(function (q) { return q !== id; }); return null; }
    var st = this.techState(tag, id); if (st === 'done' || st === 'active' || st === 'other path') return 'Cannot queue that';
    if (R.queue.length >= 6) return 'The queue is full';
    R.queue.push(id); this.fillSlots(tag); return null;
  };
  // empty slots take the next queued research that is open
  War.fillSlots = function (tag) {
    var R = this.R[tag], self = this; if (!R.queue || !R.queue.length) return;
    while (R.slots.indexOf(null) >= 0) {
      var next = null; for (var i = 0; i < R.queue.length; i++) if (self.techState(tag, R.queue[i]) === 'open') { next = R.queue[i]; break; }
      if (!next) break; if (this.startResearch(tag, next)) break;
    }
  };
  // the lessons of a great victory speed related research (one use)
  War.addBonus = function (tag, cats, pct, name) {
    var R = this.R && this.R[tag]; if (!R) return; R.bonus = R.bonus || [];
    if (R.bonus.length >= 3) R.bonus.shift();
    R.bonus.push({ cats: cats, pct: pct, name: name, day: this.day });
    if (tag === this.player) this.event('research', 'Research bonus: ' + name + ' (+' + Math.round(pct * 100) + '% to the next ' + cats.map(function (c) { return CATS[c]; }).join(' or ') + ' research)', { a: tag });
  };
  War.cancelResearch = function (tag, i) {
    var R = this.R[tag]; R.slots[i] = null;
    if (R.path && !Object.keys(R.done).some(function (id) { return TECH_BY[id] && TECH_BY[id].path === R.path; }) && !R.slots.some(function (s) { return s && TECH_BY[s.id].path; })) R.path = null;
  };
  War.researchDay = function () {
    var self = this;
    this.tags.forEach(function (tag) {
      var R = self.R[tag]; if (!R || self.gone[tag]) return;
      var want = self.researchSlots(tag); while (R.slots.length < want) R.slots.push(null);
      R.slots.forEach(function (s, i) {
        if (!s) return; s.prog += self.researchSpeed(tag, s);
        if (s.prog >= s.need) {
          R.done[s.id] = 1; R.slots[i] = null; (self._tv = self._tv || {})[tag] = (self._tv[tag] || 0) + 1;   // only this nation's sums change
          if (tag === self.player) self.event('research', 'Research complete: ' + TECH_BY[s.id].name, { a: tag });
        }
      });
      self.fillSlots(tag);
    });
  };
  // great battles teach lessons: the winner of a big fight gets a one-off bonus to doctrine and infantry research
  var baseEndBattle = War.endBattle;
  War.endBattle = function (bt, attackerWon) {
    var p = this.provs[bt.prov], n = (bt.atk || []).length + ((this.at && this.at[bt.prov]) || []).length, defTag = p.ctrl;
    baseEndBattle.call(this, bt, attackerWon);
    if (attackerWon === null || bt.days < 3 || n < 6 || !this.R) return;
    var win = attackerWon ? bt.tag : defTag, R = this.R[win]; if (!R || (R.lastLesson && this.day - R.lastLesson < 150)) return;
    R.lastLesson = this.day;
    this.addBonus(win, ['doc', 'inf'], 0.5, 'Lessons of ' + p.name);
  };
  // the other nations choose research by a simple order of preference
  var PREF = { doc: 5, inf: 4, art: 3, ind: 3, eng: 2, cav: 2, nav: 2 };
  War.aiResearch = function (tag) {
    var R = this.R[tag], self = this; if (!R) return;
    while (R.slots.indexOf(null) >= 0) {
      var best = null, bv = -1e9;
      TECH.forEach(function (t) {
        if (self.techState(tag, t.id) !== 'open') return;
        if (t.path && !R.path && DOCTRINE[tag] && t.path !== DOCTRINE[tag]) return;
        var v = (t.cat === 'nav' ? (self.navalWeight ? self.navalWeight(tag) : 0) : PREF[t.cat]) * 10 - Math.max(0, t.year - self.year()) * 40 - t.days / 20 + rnd(self) * 6;
        if (v > bv) { bv = v; best = t; }
      });
      if (!best || this.startResearch(tag, best.id)) break;
    }
  };

  // ---------- laws ----------
  War.setLaw = function (tag, group, id) {
    var L = this.laws[tag], o = LAWS[group].opts.filter(function (x) { return x.id === id; })[0]; if (!o) return 'No such law';
    if (L[group] === id) return null;
    if (this.day - L.changed < LAW_COOLDOWN) return 'Laws can change once every ' + LAW_COOLDOWN + ' days (' + (LAW_COOLDOWN - (this.day - L.changed)) + ' to go)';
    if (o.war && !this.enemies(tag).length) return 'Only while at war';
    L[group] = id; L.changed = this.day; this.techVer++;
    return null;
  };
  War.aiLaws = function (tag) {
    var war = this.enemies(tag).length > 0, L = this.laws[tag];
    if (this.day - L.changed < LAW_COOLDOWN) return;
    var want = war ? { conscription: DOCTRINE[tag] === 'mass' && this.capLost && this.capLost[tag] !== undefined ? 'levee' : 'extensive', economy: 'war' } : { conscription: 'limited', economy: 'partial' };
    if (L.conscription !== want.conscription) { this.setLaw(tag, 'conscription', want.conscription); return; }
    if (L.economy !== want.economy) this.setLaw(tag, 'economy', want.economy);
  };
  // when peace comes, wartime laws lapse
  War.lawsAtPeace = function (tag) {
    var L = this.laws[tag], ch = false;
    ['conscription', 'economy'].forEach(function (g) { var o = LAWS[g].opts.filter(function (x) { return x.id === L[g]; })[0]; if (o && o.war) { L[g] = g === 'conscription' ? 'extensive' : 'partial'; ch = true; } });
    if (ch) this.techVer++;
  };
})(typeof window !== 'undefined' ? window : globalThis);
