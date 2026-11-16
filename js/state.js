// Game state. Everything the systems share lives here: provinces (owner, terrain, area, neighbours),
// nations, the chosen player nation, the calendar, and saving. The economy itself is in econ.js.
(function () {
  'use strict';
  var MAP = window.MAP, NATIONS = window.NATIONS, Econ = window.Econ, War = window.War;
  var SAVE_KEY = 'coalition1805.v3';
  var START = { year: 1805, month: 9, day: 1 };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAY_MS = [0, 650, 280, 110, 35]; // real milliseconds per game day at each speed

  var TERRAIN = {
    p: { name: 'Plains', css: '--t-plains' },
    h: { name: 'Hills', css: '--t-hills' },
    m: { name: 'Mountains', css: '--t-mountains' },
    f: { name: 'Forest', css: '--t-forest' },
    s: { name: 'Marsh', css: '--t-marsh' },
    d: { name: 'Desert', css: '--t-desert' }
  };

  var startOwners = MAP.provinces.map(function (p) { return p.owner; });
  var startCapitals = {}; Object.keys(NATIONS).forEach(function (t) { startCapitals[t] = NATIONS[t].capital; });
  var listeners = {}, timer = null;

  var Game = {
    date: { year: START.year, month: START.month, day: START.day },
    provinces: MAP.provinces,
    nations: NATIONS,
    terrain: TERRAIN,
    econ: Econ,
    war: War,
    pick: null, // when set, the next province clicked on the map goes to this function instead of being selected
    player: null,
    selected: null,
    speed: 2,
    paused: true,

    on: function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    emit: function (evt, a, b) { (listeners[evt] || []).forEach(function (fn) { fn(a, b); }); },

    province: function (id) { return this.provinces[id]; },
    provinceByName: function (name) { return byName[norm(name)] || null; },
    capitalOf: function (tag) { var n = NATIONS[tag]; return n && n.capital ? this.provinceByName(n.capital) : null; },
    isCapital: function (id) { var p = this.provinces[id], n = NATIONS[p.owner]; return n && n.capital === p.name ? p.owner : null; },
    provincesOf: function (tag) { return this.provinces.filter(function (p) { return p.owner === tag; }); },

    // Land neighbours, plus short sea crossings when includeStraits is true.
    neighbors: function (id, includeStraits) {
      var p = this.provinces[id];
      return includeStraits ? p.adj.concat(p.straits) : p.adj.slice();
    },

    nationStats: function (tag) {
      var n = 0, area = 0;
      for (var i = 0; i < this.provinces.length; i++) { var p = this.provinces[i]; if (p.owner === tag) { n++; area += p.area; } }
      return { provinces: n, area: area };
    },

    setOwner: function (id, tag) {
      var p = this.provinces[id];
      if (!p || !NATIONS[tag] || p.owner === tag) return false;
      var old = p.owner; p.owner = tag; p.ctrl = tag;
      this.emit('owner', id, old);
      return true;
    },

    select: function (id) {
      if (id === this.selected) return;
      this.selected = (id === null || id === undefined) ? null : id;
      this.emit('select', this.selected);
    },

    setPlayer: function (tag) {
      if (tag && !NATIONS[tag]) return;
      this.player = tag || null; Econ.player = this.player; War.player = this.player;
      this.save();
      this.emit('player', this.player);
    },

    // ---------- calendar ----------
    dateText: function () { return this.date.day + ' ' + MONTHS[this.date.month - 1] + ' ' + this.date.year; },
    daysIn: function (y, m) { return m === 2 ? ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28) : (m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31); },
    // Advance one day. On the first of each month the economy takes its monthly step.
    tickDay: function () {
      if (War.conference) { if (!this.paused) this.setPaused(true); this.emit('conference'); return; }
      if (War.story && War.story.pending.length && this.player) { if (!this.paused) this.setPaused(true); this.emit('storyevent'); return; }
      var d = this.date;
      d.day++;
      if (d.day > this.daysIn(d.year, d.month)) { d.day = 1; d.month++; if (d.month > 12) { d.month = 1; d.year++; } }
      War.step();
      if (War.dirty) this.emit('map');
      if (d.day === 1) {
        War.month();
        var done = Econ.step();
        this.emit('month', done);
        this.save();
      }
      this.emit('day');
    },
    setPaused: function (p) { this.paused = !!p; schedule(); this.emit('clock'); },
    setSpeed: function (s) { this.speed = Math.max(1, Math.min(4, s)); schedule(); this.emit('clock'); },

    // ---------- saving ----------
    saveText: function () {
      return JSON.stringify({ v: 3, player: this.player, date: this.date, speed: this.speed, owners: this.provinces.map(function (p) { return p.owner; }), econ: Econ.serialize(), war: War.serialize() });
    },
    save: function () {
      var text;
      try { text = this.saveText(); } catch (e) { this.emit('savefail', 'The game could not be saved: ' + e.message); return; }
      try {
        // keep the last good save as a backup before writing the new one
        var prev = localStorage.getItem(SAVE_KEY); if (prev && (this.date.day === 1)) localStorage.setItem(SAVE_KEY + '.bak', prev);
        localStorage.setItem(SAVE_KEY, text); this.saveFailed = false;
      } catch (e) {
        try { localStorage.removeItem(SAVE_KEY + '.bak'); localStorage.setItem(SAVE_KEY, text); this.saveFailed = false; return; } catch (e2) { /* still full */ }
        if (!this.saveFailed) this.emit('savefail', 'The browser will not store the save (storage full or blocked). Use Download save to keep your game.');
        this.saveFailed = true;
      }
    },
    load: function () {
      if (this.loadFrom(SAVE_KEY)) return true;
      if (this.loadFrom(SAVE_KEY + '.bak')) { this.loadedBackup = true; return true; }
      return false;
    },
    // read a save; anything damaged leaves a fresh 1805 rather than a half-loaded world
    loadFrom: function (key, rawText) {
      try {
        var raw = rawText || localStorage.getItem(key); if (!raw) return false;
        var s = JSON.parse(raw); if (!s || s.v !== 3 || !s.owners || s.owners.length !== this.provinces.length) return false;
        for (var i = 0; i < s.owners.length; i++) if (NATIONS[s.owners[i]]) this.provinces[i].owner = s.owners[i];
        if (!Econ.restore(s.econ) || !War.restore(s.war)) { fresh(); return false; }
        if (s.date && s.date.year) this.date = { year: s.date.year, month: s.date.month, day: s.date.day };
        if (s.player && NATIONS[s.player]) this.player = s.player;
        if (s.speed) this.speed = Math.max(1, Math.min(4, s.speed));
        Econ.player = this.player; War.player = this.player;
        return true;
      } catch (e) {
        fresh(); return false;
      }
    },
    importSave: function (text) {
      var s; try { s = JSON.parse(text); } catch (e) { return 'That file is not a Coalition save'; }
      if (!s || s.v !== 3 || !s.owners || s.owners.length !== this.provinces.length) return 'That file is not a save from this version of the game';
      try { localStorage.setItem(SAVE_KEY, text); } catch (e) { return 'The browser will not store it'; }
      return null;
    },
    newGame: function () {
      this.setPaused(true);
      fresh();
      this.date = { year: START.year, month: START.month, day: START.day };
      this.player = null; Econ.player = null; War.player = null; this.selected = null; this.pick = null;
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
      this.emit('reset');
    }
  };

  function fresh() {
    MAP.provinces.forEach(function (p, i) { p.owner = startOwners[i]; });
    Object.keys(NATIONS).forEach(function (t) { NATIONS[t].capital = startCapitals[t]; delete NATIONS[t].lostCapital; });
    Econ.init(MAP.provinces, NATIONS);
    War.init(MAP.provinces, NATIONS, Econ, MAP.kmPerPx);
  }
  War.onEvent = function (e) {
    e.date = Game.dateText();
    if (e.type === 'surrender' || e.type === 'peace' || e.type === 'gone' || e.type === 'story' || (e.data && e.data.map)) Game.emit('owner');   // land has changed hands: borders and names are redrawn
    Game.emit('event', e);
  };

  function schedule() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (Game.paused) return;
    timer = setTimeout(function run() { Game.tickDay(); if (!Game.paused) timer = setTimeout(run, DAY_MS[Game.speed]); }, DAY_MS[Game.speed]);
  }

  function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  Game.normalize = norm;

  var byName = {}, capitalTag = {};
  MAP.provinces.forEach(function (p) { byName[norm(p.name)] = p; });
  Object.keys(NATIONS).forEach(function (tag) {
    NATIONS[tag].tag = tag;
    var c = NATIONS[tag].capital ? byName[norm(NATIONS[tag].capital)] : null;
    if (c) capitalTag[c.id] = tag;
  });

  fresh();
  window.Game = Game;
})();
