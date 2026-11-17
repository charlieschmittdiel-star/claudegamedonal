// HoI4-style screens for divisions: the division designer, division details, the battle view, and the
// general picker. Opens as dialogs over the map.
(function () {
  'use strict';
  var Game = window.Game, War = window.War, Econ = window.Econ, UI = window.UI, U = window.UNITS;
  var BAT = U.BATTALIONS, SUP = U.SUP_SLOTS ? U.SUPPORT : U.SUPPORT;
  var h = UI.h, num = UI.num;
  var $ = function (id) { return document.getElementById(id); };
  var draft = null, editingId = null, picker = null;

  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function modal(title, body, wide) {
    var m = $('modal'); m.innerHTML = ''; m.hidden = false;
    var card = h('div', 'modal-card' + (wide ? ' wide' : '')), head = h('div', 'drawer-head');
    head.appendChild(h('h2', null, title)); head.appendChild(btn('x-btn', '×', close, 'Close'));
    card.appendChild(head); var b = h('div', 'modal-body'); b.appendChild(body); card.appendChild(b); m.appendChild(card);
    return b;
  }
  function close() { $('modal').hidden = true; $('modal').innerHTML = ''; draft = null; picker = null; }
  function isOpen() { return !$('modal').hidden; }

  // ---------- stats block (used by the designer and by division details) ----------
  function statGrid(s, extra) {
    var g = h('dl', 'stats');
    function row(k, v, tip) { var dt = h('dt', null, k); if (tip) dt.title = tip; g.appendChild(dt); g.appendChild(h('dd', null, v)); }
    row('Attack', f1(s.atk), 'Attacks made each day. Each one that gets past the enemy\'s defence or breakthrough is far more likely to do damage.');
    row('Defence', f1(s.def), 'Attacks it can parry when defending');
    row('Breakthrough', f1(s.brk), 'Attacks it can parry when attacking');
    row('Organisation', f1(s.org), 'How much punishment it takes before it breaks and retreats');
    row('Strength (HP)', f1(s.hp), 'How much damage it soaks before men are lost');
    row('Combat width', String(s.w), 'Room it takes in the battle line. A province holds 60 on plains, less in rough country, more when attacked from several sides.');
    row('Speed', s.spd + ' km a day');
    row('Supply use', f1(s.sup * 10) + ' wagons');
    row('Men', num(s.men));
    row('Arms', Object.keys(s.eq).map(function (g) { return Math.round(s.eq[g] * 10) / 10 + ' ' + g; }).join(', ') || '—');
    row('Cost to raise', 'ƒ' + num(Math.round(s.money)) + ' · ' + s.days + ' days');
    row('Upkeep', 'ƒ' + num(Math.round(s.upkeep)) + ' a month');
    if (extra) extra.forEach(function (e) { row(e[0], e[1], e[2]); });
    return g;
  }
  function terrainRow(s) {
    var wrap = h('div', 'terrain-row'), names = { p: 'Plains', h: 'Hills', f: 'Forest', s: 'Marsh', m: 'Mountains', d: 'Desert' };
    Object.keys(names).forEach(function (t) {
      var tr = s.terr[t], a = (tr.inf + tr.cav + tr.art) * War.T_ATK[t], rel = s.atk ? a / s.atk : 1, c = h('span', 'tchip ' + (rel >= 0.98 ? 'ok' : rel >= 0.8 ? 'meh' : 'bad'));
      c.textContent = names[t] + ' ' + Math.round(rel * 100) + '%'; c.title = 'Attack in ' + names[t].toLowerCase() + ', terrain included';
      wrap.appendChild(c);
    });
    return wrap;
  }

  // ---------- the division designer ----------
  function openDesigner(tplId) {
    var tag = Game.player; if (!tag) return;
    var list = War.tpls[tag];
    if (tplId === undefined) tplId = list[0] ? list[0].id : null;
    var t = tplId !== null ? War.tplById(tplId) : null;
    editingId = t ? t.id : null;
    draft = t ? { name: t.name, cols: t.cols.map(function (c) { return c.slice(); }), sup: t.sup.slice() } : { name: 'New division', cols: [[], [], [], [], []], sup: [] };
    renderDesigner();
  }
  function renderDesigner() {
    var tag = Game.player, wrap = h('div', 'designer'), side = h('div', 'ds-side'), main = h('div', 'ds-main'), right = h('div', 'ds-right');
    // template list
    side.appendChild(h('h3', 'p-sub', 'Templates'));
    War.tpls[tag].forEach(function (t) {
      var b = btn('ds-tpl' + (t.id === editingId ? ' is-on' : ''), '', function () { openDesigner(t.id); });
      b.appendChild(h('strong', null, t.name)); b.appendChild(h('span', null, War.tplUsers(t.id) + ' in service · width ' + War.tplStats(t).w));
      side.appendChild(b);
    });
    side.appendChild(btn('ghost', '+ New template', function () { openDesigner(null); }));
    side.appendChild(h('p', 'note', 'Army experience: ' + Math.floor(War.M[tag].xp || 0) + '. Changing a template that divisions already use costs experience: 5 per battalion, 10 per support company. New templates are free.'));

    // name
    var nm = document.createElement('input'); nm.type = 'text'; nm.id = 'ds-name'; nm.value = draft.name; nm.maxLength = 40; nm.className = 'ds-name';
    nm.addEventListener('input', function () { draft.name = nm.value; });
    var lab = h('label', 'sr', 'Template name'); lab.setAttribute('for', 'ds-name');
    main.appendChild(lab); main.appendChild(nm);
    // battalion grid: 5 columns x 5 rows
    var grid = h('div', 'ds-grid');
    draft.cols.forEach(function (col, ci) {
      var c = h('div', 'ds-col'), cls = col.length ? BAT[col[0]].cls : null;
      c.appendChild(h('div', 'ds-colhead', cls ? ({ inf: 'Infantry', cav: 'Cavalry', art: 'Artillery' })[cls] : 'Empty'));
      for (var r = 0; r < U.ROWS; r++) {
        (function (r) {
          var id = col[r], cell;
          if (id) {
            cell = btn('ds-slot full ' + BAT[id].cls, BAT[id].name, function () { col.splice(r, 1); renderDesigner(); }, 'Click to remove');
          } else if (r === col.length) {
            cell = btn('ds-slot add', '+', function (e) { showPick(e.currentTarget, 'bat', ci); }, 'Add a battalion');
          } else cell = h('div', 'ds-slot empty');
          c.appendChild(cell);
        })(r);
      }
      grid.appendChild(c);
    });
    main.appendChild(h('h3', 'p-sub', 'Battalions (each column takes one kind)'));
    main.appendChild(grid);
    // support companies
    main.appendChild(h('h3', 'p-sub', 'Support companies'));
    var sup = h('div', 'ds-sup');
    for (var i = 0; i < U.SUP_SLOTS; i++) {
      (function (i) {
        var id = draft.sup[i];
        if (id) sup.appendChild(btn('ds-slot full sup', U.SUPPORT[id].name, function () { draft.sup.splice(i, 1); renderDesigner(); }, U.SUPPORT[id].blurb + ' (click to remove)'));
        else if (i === draft.sup.length) sup.appendChild(btn('ds-slot add', '+', function (e) { showPick(e.currentTarget, 'sup'); }, 'Add a support company'));
        else sup.appendChild(h('div', 'ds-slot empty'));
      })(i);
    }
    main.appendChild(sup);
    main.appendChild(h('div', 'ds-pick-host'));

    // stats and save
    var why = War.validTemplate(tag, draft), probe = { id: -2, tag: tag, cols: draft.cols, sup: draft.sup };
    War._sc[-2] = null;
    if (!why) {
      var s = War.tplStats(probe);
      right.appendChild(h('h3', 'p-sub', 'Division stats'));
      right.appendChild(statGrid(s));
      right.appendChild(h('h3', 'p-sub', 'Attack by terrain'));
      right.appendChild(terrainRow(s));
    } else right.appendChild(h('p', 'note', why));
    var t = editingId !== null ? War.tplById(editingId) : null, cost = t && War.tplUsers(t.id) ? War.editCost(t, draft) : 0;
    var acts = h('div', 'acts');
    var save = btn('primary', t ? (cost ? 'Save changes (' + cost + ' XP)' : 'Save changes') : 'Create template', function () {
      var r = War.saveTemplate(tag, editingId, draft);
      if (r) { msg.textContent = r; return; }
      if (editingId === null) editingId = War.tpls[tag][War.tpls[tag].length - 1].id;
      Game.save(); renderDesigner(); UI.refresh(); if (window.WarUI) window.WarUI.renderBar();
    });
    save.disabled = !!why || (t && cost > (War.M[tag].xp || 0));
    acts.appendChild(save);
    if (t) acts.appendChild(btn('ghost', 'Save as new template', function () { var r = War.saveTemplate(tag, null, { name: draft.name + ' (copy)', cols: draft.cols, sup: draft.sup }); if (r) { msg.textContent = r; return; } editingId = War.tpls[tag][War.tpls[tag].length - 1].id; draft.name += ' (copy)'; Game.save(); renderDesigner(); }));
    if (t) acts.appendChild(btn('ghost danger', 'Delete', function () { var r = War.deleteTemplate(tag, t.id); if (r) { msg.textContent = r; return; } Game.save(); openDesigner(); }));
    right.appendChild(acts);
    var msg = h('p', 'note bad-note', t && cost > (War.M[tag].xp || 0) ? 'Not enough army experience for these changes.' : '');
    right.appendChild(msg);
    if (t && War.tplUsers(t.id)) right.appendChild(h('p', 'note', War.tplUsers(t.id) + ' divisions use this template. If the new design needs more men or arms, they start below full strength and fill up from the arsenal.'));

    wrap.appendChild(side); wrap.appendChild(main); wrap.appendChild(right);
    modal('Division designer', wrap, true);
  }
  function showPick(anchor, kind, col) {
    var tag = Game.player, host = document.querySelector('.ds-pick-host'); host.innerHTML = '';
    var box = h('div', 'ds-pick');
    box.appendChild(h('h3', 'p-sub', kind === 'sup' ? 'Choose a support company' : 'Choose a battalion'));
    var colCls = kind === 'bat' && draft.cols[col].length ? BAT[draft.cols[col][0]].cls : null;
    var src = kind === 'sup' ? U.SUPPORT : BAT;
    Object.keys(src).forEach(function (k) {
      var x = src[k], ok = War.canUse(tag, x.tech), wrongCls = colCls && x.cls !== colCls, taken = kind === 'sup' && draft.sup.indexOf(k) >= 0;
      var b = btn('ds-opt' + (x.cls ? ' ' + x.cls : ' sup'), '', function () {
        if (kind === 'sup') draft.sup.push(k); else draft.cols[col].push(k);
        renderDesigner();
      });
      b.disabled = !ok || wrongCls || taken;
      b.appendChild(h('strong', null, x.name));
      var line = kind === 'sup' ? x.blurb : 'Atk ' + x.atk + ' · Def ' + x.def + ' · Brk ' + x.brk + ' · Org ' + x.org + ' · HP ' + x.hp + ' · Width ' + x.w + ' · ' + x.spd + ' km/day' + (x.blurb ? ' — ' + x.blurb : '');
      b.appendChild(h('span', null, !ok ? 'Needs research' : wrongCls ? 'Not in this column' : taken ? 'Already added' : line));
      box.appendChild(b);
    });
    box.appendChild(btn('ghost', 'Cancel', function () { host.innerHTML = ''; }));
    host.appendChild(box);
    box.scrollIntoView({ block: 'nearest' });
  }

  // ---------- one division in detail ----------
  function openDivision(id) {
    var d = War.div(id); if (!d) return;
    var t = War.tplById(d.tpl), s = War.stats(d), cm = War.cmdOf(d), lvl = War.xpLevel(d.xp || 0), a = War.armyOf(d.id), body = h('div', 'divdetail');
    body.appendChild(h('p', 'note', (t ? t.name : 'Division') + ' · ' + Game.nations[d.tag].short + ' · at ' + Game.province(d.prov).name + (a ? ' · ' + a.name : '')));
    var bars = h('div', 'dd-bars');
    [['Strength', d.str, 'str'], ['Organisation', d.org, 'org'], ['Experience: ' + lvl.name, d.xp || 0, 'xp'], ['Planning', (d.plan || 0) / 0.3, 'plan'], ['Dug in', (d.entr || 0) / Math.max(0.01, s.entrMax), 'entr']].forEach(function (b) {
      var w = h('div', 'bar'), top = h('div', 'bar-top'); top.appendChild(h('span', null, b[0])); top.appendChild(h('span', 'n', b[2] === 'plan' ? '+' + Math.round((d.plan || 0) * 100) + '%' : b[2] === 'entr' ? '+' + Math.round((d.entr || 0) * 100) + '%' : pct(b[1])));
      var tr = h('div', 'bar-track'), f = h('div', 'bar-fill ' + b[2]); f.style.width = Math.round(Math.min(1, b[1]) * 100) + '%'; tr.appendChild(f); w.appendChild(top); w.appendChild(tr); bars.appendChild(w);
    });
    body.appendChild(bars);
    if (d.tag === Game.player && War.guardBlock && !d.guard) { var gb = War.guardBlock(d.tag, d), gbtn = document.createElement('button'); gbtn.type = 'button'; gbtn.className = 'ghost small'; gbtn.textContent = 'Raise to the Guard · 50 power'; gbtn.disabled = !!gb; if (gb) gbtn.title = gb; gbtn.addEventListener('click', function () { var r = War.makeGuard(d.tag, d); if (!r) { Game.save(); MapView.refreshOverlay(); body.insertBefore(h('p', 'note', 'This division joins the Guard.'), bars); gbtn.remove(); } }); body.appendChild(gbtn); }
    var extra = [['Experience bonus', (lvl.mod >= 0 ? '+' : '') + Math.round(lvl.mod * 100) + '% to attack, defence and breakthrough'],
      ['Commander', cm.who ? cm.who.name + ' (skill ' + cm.who.skill + ')' : d.tag === Game.player ? 'None: put this division in an army and give it a general' : 'National command']];
    if (cm.atk || cm.def) extra.push(['From the commander', '+' + Math.round(cm.atk * 100) + '% attack, +' + Math.round(cm.def * 100) + '% defence']);
    var kind = War.divKind ? War.divKind(d) : null;
    if (kind) extra.push([kind, { Guard: '+30% in battle, 20% fewer losses', Landwehr: 'Militia: −38% in battle', Mercenaries: 'Hired: +5% in battle, ƒ1,200 a month, desert if unpaid', Partisans: 'Irregulars: weak in the open, hard to root out' }[kind]]);
    if (d.hon && d.hon.length) extra.push(['Battle honours', d.hon.join(', ')]);
    if (d.nosupply) extra.push(['Supply', 'Cut off: −40% to everything, losing men']);
    else if (d.far) extra.push(['Supply', 'Far from home: recovers slowly, loses men']);
    body.appendChild(h('h3', 'p-sub', 'Template stats'));
    body.appendChild(statGrid(s, extra));
    var parts = []; t.cols.forEach(function (c) { c.forEach(function (b) { parts.push(BAT[b].name); }); });
    var cnt = {}; parts.forEach(function (p) { cnt[p] = (cnt[p] || 0) + 1; });
    body.appendChild(h('p', 'note', Object.keys(cnt).map(function (k) { return cnt[k] + ' × ' + k; }).join(', ') + (t.sup.length ? '; support: ' + t.sup.map(function (k) { return U.SUPPORT[k].name; }).join(', ') : '')));
    if (d.tag === Game.player) body.appendChild(btn('ghost', 'Edit this template', function () { openDesigner(t.id); }));
    modal('Division', body);
  }

  // ---------- the battle view ----------
  function openBattle(prov) {
    var bt = War.battleAt(prov); if (!bt) return;
    var p = Game.province(prov), body = h('div', 'battleview'), L = bt.last || { A: 0, D: 0, Ad: 0, B: 0, hD: 0, hA: 0, mods: [] };
    var att = War.attackers(bt), def = War.defenders(bt), defTag = def.some(function (d) { return d.tag === p.ctrl; }) || !def[0] ? p.ctrl : def[0].tag;
    var share = bt.r / (1 + bt.r);
    var top = h('div', 'bv-top');
    function sideHead(tag, label, cas) { var x = h('div', 'bv-side'), sw = h('span', 'swatch'); sw.style.background = Game.nations[tag].color; var t = h('div', 'bv-name'); t.appendChild(sw); t.appendChild(h('strong', null, Game.nations[tag].short)); t.appendChild(h('span', 'note', label)); x.appendChild(t); x.appendChild(h('span', 'note', num(Math.round(cas || 0)) + ' men lost')); return x; }
    top.appendChild(sideHead(bt.tag, 'attacking', bt.casA)); top.appendChild(h('div', 'bv-vs', 'Day ' + bt.days)); top.appendChild(sideHead(defTag, 'defending', bt.casD));
    body.appendChild(top);
    var tr = h('div', 'bar-track big'), f = h('div', 'bar-fill att'); f.style.width = Math.round(share * 100) + '%'; tr.appendChild(f); body.appendChild(tr);
    body.appendChild(h('p', 'note', share > 0.55 ? 'The attack is gaining ground.' : share < 0.45 ? 'The defence is holding.' : 'Evenly matched.'));

    var cols = h('div', 'bv-cols');
    function sideCol(list, front, attacking) {
      var c = h('div', 'bv-col'), fr = {}; (front || []).forEach(function (id) { fr[id] = 1; });
      var used = 0; list.forEach(function (d) { if (fr[d.id]) used += War.stats(d).w; });
      c.appendChild(h('div', 'p-sub', 'In the line: width ' + used + ' of ' + ((attacking ? bt.frontage : bt.frontageD || bt.frontage) || 0)));
      var tot = attacking ? [['Attacks a day', L.A], ['Breakthrough', L.B], ['Damaging hits taken', L.hA]] : [['Attacks a day', L.Ad], ['Defence', L.D], ['Damaging hits taken', L.hD]];
      var dl = h('dl', 'facts'); tot.forEach(function (x) { dl.appendChild(h('dt', null, x[0])); dl.appendChild(h('dd', null, f1(x[1]))); }); c.appendChild(dl);
      list.slice().sort(function (a, b) { return (fr[b.id] ? 1 : 0) - (fr[a.id] ? 1 : 0); }).forEach(function (d) {
        var t = War.tplById(d.tpl), row = h('div', 'bv-div' + (fr[d.id] ? '' : ' reserve'));
        row.appendChild(h('span', null, (t ? t.name : 'Division') + (fr[d.id] ? '' : ' (reserve)')));
        var bars = h('span', 'divbars'), b1 = h('i', 'str'), b2 = h('i', 'org'), w1 = h('span'), w2 = h('span');
        b1.style.width = Math.round(d.str * 100) + '%'; b2.style.width = Math.round(d.org * 100) + '%'; w1.appendChild(b1); w2.appendChild(b2); bars.appendChild(w1); bars.appendChild(w2);
        row.appendChild(bars); c.appendChild(row);
      });
      return c;
    }
    cols.appendChild(sideCol(att, bt.fa, true)); cols.appendChild(sideCol(def, bt.fd, false));
    body.appendChild(cols);
    body.appendChild(h('h3', 'p-sub', 'What matters here'));
    var ml = h('ul', 'mods');
    var tn = { p: 'Plains', h: 'Hills', f: 'Forest', s: 'Marsh', m: 'Mountains', d: 'Desert' }[p.terrain];
    var li0 = h('li'); li0.appendChild(h('span', null, 'Terrain: ' + tn + ', combat width ' + (War.FRONT[p.terrain]) + (bt.frontage && bt.frontage !== War.FRONT[p.terrain] ? ' (' + bt.frontage + ' in this battle)' : ''))); ml.appendChild(li0);
    (L.mods || []).forEach(function (m) { var li = h('li'); li.appendChild(h('span', null, m[0])); li.appendChild(h('span', 'n ' + (typeof m[1] === 'number' && m[1] < 0 ? 'imp' : 'exp'), typeof m[1] === 'number' ? (m[1] > 0 ? '+' : '') + m[1] + '% attack' : m[1])); ml.appendChild(li); });
    var dug = 0; def.forEach(function (d) { dug += d.entr || 0; }); if (def.length) { var li2 = h('li'); li2.appendChild(h('span', null, 'Defenders dug in')); li2.appendChild(h('span', 'n imp', '+' + Math.round(dug / def.length * 100) + '% defence')); ml.appendChild(li2); }
    var pl = 0; att.forEach(function (d) { pl += d.plan || 0; }); if (att.length && pl) { var li3 = h('li'); li3.appendChild(h('span', null, 'Attackers\' planning')); li3.appendChild(h('span', 'n exp', '+' + Math.round(pl / att.length * 100) + '% attack')); ml.appendChild(li3); }
    body.appendChild(ml);
    body.appendChild(h('p', 'note', 'Each attack that the target cannot parry (with defence, or breakthrough when attacking) does damage two times in five; parried attacks only one time in ten. Damage costs organisation and men. Divisions out of organisation retreat; encircled ones are destroyed.'));
    modal('Battle of ' + p.name, body, true);
    var refresh = function () { if (isOpen() && document.querySelector('.battleview')) { if (War.battleAt(prov)) openBattle(prov); else close(); } };
    $('modal')._refresh = refresh;
  }

  // ---------- picking a general or field marshal ----------
  function openGeneralPicker(army, group) {
    var tag = Game.player, body = h('div', 'genpick');
    var list = War.gensOf(tag).filter(function (g) { return group ? g.fm : true; }).sort(function (a, b) { return b.skill - a.skill; });
    body.appendChild(h('p', 'note', group ? 'An army group is led by a field marshal. Half his skills and traits apply to every army in the group.' : 'A general\'s attack and defence skills give +5% each per point to his army\'s divisions; planning speeds up preparation for offensives; logistics cuts supply losses.'));
    list.forEach(function (g) {
      var busy = g.army ? 'Leads ' + (War.armies.filter(function (a) { return a.id === g.army; })[0] || { name: 'an army' }).name : g.group ? 'Leads ' + (War.groupById(g.group) || { name: 'an army group' }).name : 'Free';
      var row = btn('gen-row', '', function () {
        if (group) War.assignMarshal(group, g.id); else War.assignGeneral(army, g.id);
        Game.save(); close(); if (window.WarUI) window.WarUI.renderBar();
      });
      var top = h('div', 'gen-top'); top.appendChild(h('strong', null, (g.fm ? 'Marshal ' : '') + g.name)); top.appendChild(h('span', 'stars', '★'.repeat(g.skill) + '☆'.repeat(Math.max(0, 5 - g.skill))));
      row.appendChild(top);
      row.appendChild(h('span', 'gen-stats', 'Attack ' + g.atk + ' · Defence ' + g.def + ' · Planning ' + g.plan + ' · Logistics ' + g.log + ' · ' + busy));
      if (g.traits.length) row.appendChild(h('span', 'gen-traits', g.traits.map(function (t) { return U.TRAITS[t] ? U.TRAITS[t].name : t; }).join(' · ')));
      body.appendChild(row);
    });
    if (!list.length) body.appendChild(h('p', 'note', group ? 'You have no field marshals. Promote a general on the Army tab (50 army experience).' : 'You have no generals.'));
    var cur = group ? group.fm : army.gen;
    if (cur) body.appendChild(btn('ghost', 'Relieve of command', function () { if (group) War.assignMarshal(group, null); else War.assignGeneral(army, null); Game.save(); close(); if (window.WarUI) window.WarUI.renderBar(); }));
    modal(group ? 'Field marshal for ' + group.name : 'General for ' + army.name, body);
  }

  function init() {
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { e.stopImmediatePropagation(); close(); }
      var tn = e.target && e.target.tagName; if (tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === 'u' && Game.player && !isOpen()) { e.preventDefault(); openDesigner(); }
    }, true);
    Game.on('day', function () { var m = $('modal'); if (!m.hidden && m._refresh && Game.date.day % 1 === 0) m._refresh(); });
    Game.on('reset', close);
  }

  window.Designer = { init: init, open: openDesigner, openDivision: openDivision, openBattle: openBattle, openGeneralPicker: openGeneralPicker, close: close, isOpen: isOpen };
})();
