// Mods: a JSON file that renames and recolours nations, adds generals, changes who owns a province at the start,
// gives nations money, men or stability, and adds story events with simple conditions and effects. Loaded from
// the Settings window, kept in this browser, and applied every time the game starts.
(function (root) {
  'use strict';
  var KEY = 'coalition1805.mod', War = root.War, mod = null;
  try { mod = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { mod = null; }
  var EXAMPLE = {
    name: 'Example: The Kingdom of Poland', version: 1, author: 'You',
    about: 'Renames the Duchy lands, adds a Polish general, and an event in which Napoleon may restore Poland.',
    nations: { SAX: { name: 'Kingdom of Saxony', short: 'Saxony', color: '#4f9a6a' } },
    generals: { SAX: [['Józef Poniatowski', 4, 4, 3, 3, 3, ['cavalry', 'bravest'], 0]] },
    start: { SAX: { treasury: 40000, manpower: 30000, stability: 0.7 } },
    provinces: {},
    events: [{
      id: 'mod_poland', title: 'The Kingdom of Poland', who: 'FRA', from: [1807, 6], until: [1815, 1], mtth: 60,
      text: 'Polish patriots beg the Emperor to restore their kingdom. It would delight the Poles and enrage the Tsar.',
      if: { owns: [['SAX', 'Warsaw']], notAtWar: [['FRA', 'SAX']] },
      options: [
        { text: 'Restore the Kingdom of Poland', historical: false, effects: { rename: { SAX: ['Kingdom of Poland', 'Poland'] }, stability: { SAX: 0.1 }, goodwill: [['RUS', 'FRA', -30]], flag: 'poland' } },
        { text: 'Not while the Tsar is our friend', historical: true, effects: { goodwill: [['RUS', 'FRA', 10]] } }]
    }]
  };
  function prov(name) { for (var i = 0; i < root.MAP.provinces.length; i++) if (root.MAP.provinces[i].name === name) return root.MAP.provinces[i]; return null; }
  function check(M) {
    var errs = [];
    if (!M || typeof M !== 'object') return ['Not a JSON object'];
    if (!M.name) errs.push('A mod needs a "name"');
    Object.keys(M.nations || {}).forEach(function (t) { if (!root.NATIONS[t]) errs.push('Unknown nation ' + t); });
    Object.keys(M.provinces || {}).forEach(function (n) { if (!prov(n)) errs.push('Unknown province ' + n); else if (M.provinces[n].owner && !root.NATIONS[M.provinces[n].owner]) errs.push('Unknown owner for ' + n); });
    (M.events || []).forEach(function (e, i) { if (!e.id || !e.title || !e.who || !e.options || !e.options.length) errs.push('Event ' + (i + 1) + ' needs id, title, who and options'); else if (!root.NATIONS[e.who]) errs.push('Event ' + e.id + ': unknown nation ' + e.who); });
    return errs;
  }
  // the first phase, before the game starts: nations, generals, start owners
  function early(M) {
    Object.keys(M.nations || {}).forEach(function (t) { var n = root.NATIONS[t], x = M.nations[t]; if (x.name) n.name = x.name; if (x.short) n.short = x.short; if (x.color) n.color = x.color; });
    Object.keys(M.generals || {}).forEach(function (t) { var G = root.UNITS.GENERALS; G[t] = (G[t] || []).concat(M.generals[t].filter(function (g) { return Array.isArray(g) && g.length >= 7; }).map(function (g) { return g.slice(0, 8).concat(g.length < 8 ? [0] : []); })); });
    Object.keys(M.provinces || {}).forEach(function (n) { var p = prov(n), x = M.provinces[n]; if (p && x.owner) p.owner = x.owner; });
  }
  // conditions and effects for mod events, in plain data
  function cond(c) {
    c = c || {}; var W = War, ok = true;
    (c.atWar || []).forEach(function (x) { ok = ok && W.atWar(x[0], x[1]); });
    (c.notAtWar || []).forEach(function (x) { ok = ok && !W.atWar(x[0], x[1]); });
    (c.owns || []).forEach(function (x) { var p = W.byName[x[1]]; ok = ok && !!p && p.owner === x[0]; });
    (c.controls || []).forEach(function (x) { var p = W.byName[x[1]]; ok = ok && !!p && p.ctrl === x[0]; });
    if (c.flag) ok = ok && !!(W.story && W.story.flags[c.flag] !== undefined);
    if (c.notFlag) ok = ok && !(W.story && W.story.flags[c.notFlag] !== undefined);
    if (c.fired) ok = ok && !!(W.story && W.story.fired[c.fired] !== undefined);
    if (c.napoleon) ok = ok && !!(W.story && W.story.nap.state === c.napoleon);
    if (c.alive) c.alive.forEach(function (t) { ok = ok && !W.gone[t]; });
    return ok;
  }
  function effects(fx) {
    fx = fx || {}; var W = War;
    Object.keys(fx.money || {}).forEach(function (t) { W.econ.N[t].treasury += fx.money[t]; });
    Object.keys(fx.manpower || {}).forEach(function (t) { W.M[t].manpower += fx.manpower[t]; });
    Object.keys(fx.stability || {}).forEach(function (t) { if (W.shockStab) W.shockStab(t, fx.stability[t]); });
    Object.keys(fx.warSupport || {}).forEach(function (t) { if (W.shockWs) W.shockWs(t, fx.warSupport[t]); });
    Object.keys(fx.politicalPower || {}).forEach(function (t) { if (W.pol) W.pol.N[t].pp += fx.politicalPower[t]; });
    (fx.goodwill || []).forEach(function (x) { W.addGoodwill(x[0], x[1], x[2]); });
    (fx.war || []).forEach(function (x) { if (!W.atWar(x[0], x[1])) { W.declare(x[0], x[1], true); W.event('war', W.nations[x[0]].short + ' declares war on ' + W.nations[x[1]].short, { a: x[0], b: x[1] }); } });
    (fx.peace || []).forEach(function (x) { W.peace(x[0], x[1], false); });
    var moved = 0; Object.keys(fx.give || {}).forEach(function (n) { var p = W.byName[n]; if (p) { p.owner = fx.give[n]; p.ctrl = fx.give[n]; moved++; } }); if (moved) W.afterPeace();
    Object.keys(fx.rename || {}).forEach(function (t) { var r = fx.rename[t]; W.nations[t].name = r[0]; if (r[1]) W.nations[t].short = r[1]; if (W.story) W.story.names[t] = [r[0], W.nations[t].short]; });
    if (fx.flag && W.story) W.story.flags[fx.flag] = W.day;
    if (fx.message) W.event('story', fx.message, {});
  }
  function late(M) {
    (M.events || []).forEach(function (e) {
      if (War.storyEventById(e.id)) return;
      War.STORY.push({ id: e.id, ch: e.chapter || (M.name + ''), title: e.title, who: e.who, from: e.from || [1805, 9], until: e.until || null, mtth: e.mtth || 30,
        cond: function () { return cond(e.if); }, text: e.text || '', expect: e.expect || 'From the mod: ' + e.title,
        opts: e.options.map(function (o) { return { t: o.text, hist: !!o.historical, ai: o.aiWeight || 1, fx: function () { effects(o.effects); } }; }) });
    });
    var start = M.start || {};
    if (Object.keys(start).length) {
      var prevInit = War.init;
      War.init = function (a, b, c, d) {
        prevInit.call(this, a, b, c, d); var self = this;
        Object.keys(start).forEach(function (t) { var s = start[t]; if (!self.econ.N[t]) return; if (s.treasury !== undefined) self.econ.N[t].treasury = s.treasury; if (s.manpower !== undefined) self.M[t].manpower = s.manpower; if (s.stability !== undefined && self.pol) self.pol.N[t].stab = s.stability; });
      };
    }
  }
  var active = null;
  if (mod && !check(mod).length) { try { early(mod); late(mod); active = mod; } catch (e) { if (root.console) console.warn('mod failed', e); active = null; } }

  root.Mods = {
    active: function () { return active; }, example: EXAMPLE, check: check,
    install: function (text) {
      var M; try { M = JSON.parse(text); } catch (e) { return 'That file is not JSON: ' + e.message; }
      var errs = check(M); if (errs.length) return errs.slice(0, 4).join('; ');
      try { localStorage.setItem(KEY, JSON.stringify(M)); } catch (e) { return 'The browser will not store it'; }
      return null;
    },
    remove: function () { try { localStorage.removeItem(KEY); } catch (e) { /* fine */ } },
    settingsSection: function (body) {
      var h = root.UI.h; body.appendChild(h('h3', 'p-sub', 'Mods'));
      body.appendChild(h('p', 'note', active ? 'Active mod: ' + active.name + (active.author ? ' by ' + active.author : '') + '. ' + (active.about || '') : 'No mod loaded. A mod is a JSON file: rename and recolour nations, add generals, change who owns a province, set starting money, men and stability, and add story events with conditions (atWar, notAtWar, owns, controls, flag, notFlag, fired, napoleon, alive) and effects (money, manpower, stability, warSupport, politicalPower, goodwill, war, peace, give, rename, flag, message). Download the example to see the format.'));
      var row = h('div', 'acts wrap');
      function b(text, fn) { var x = h('button', 'ghost small', text); x.type = 'button'; x.addEventListener('click', fn); row.appendChild(x); }
      b('Load a mod file', function () {
        var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { var why = root.Mods.install(String(r.result)); var t = document.getElementById('toasts'), el = h('div', 'toast' + (why ? ' bad' : ''), why || 'Mod installed: it applies from the next new game. Reloading…'); t.appendChild(el); if (!why) setTimeout(function () { root.Game.newGame(); location.reload(); }, 1200); }; r.readAsText(f); });
        inp.click();
      });
      b('Download the example mod', function () { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(EXAMPLE, null, 2)], { type: 'application/json' })); a.download = 'coalition-example-mod.json'; document.body.appendChild(a); a.click(); a.remove(); });
      if (active) b('Remove the mod', function () { root.Mods.remove(); root.Game.newGame(); location.reload(); });
      body.appendChild(row);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
