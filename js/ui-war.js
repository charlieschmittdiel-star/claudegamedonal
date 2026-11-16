// Screens for the armies: counters, battles, front lines and offensive arrows on the map; selecting and
// ordering divisions; the army bar; recruiting; the Army tab; war and peace on nation cards; news.
(function () {
  'use strict';
  var Game = window.Game, War = window.War, Econ = window.Econ, MapView = window.MapView, UI = window.UI, EconUI = window.EconUI;
  var h = UI.h, num = UI.num, money = EconUI.money;
  var $ = function (id) { return document.getElementById(id); };
  var multi = {}, sel = {}, keepSel = false, activeArmy = null, askWar = null, lastRefresh = 0, lastBar = 0, painting = null;
  var ARMY_COLORS = ['#e2574c', '#4c9be2', '#58b368', '#e2b84c', '#b06ad6', '#e28a4c', '#4cc9c0', '#d86aa8'];

  function pct(v) { return Math.round(v * 100) + '%'; }
  function lum(hex) { var n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
  function armyColor(a) { return ARMY_COLORS[((a.n || 1) - 1) % ARMY_COLORS.length]; }
  function armyById(id) { for (var i = 0; i < War.armies.length; i++) if (War.armies[i].id === id) return War.armies[i]; return null; }
  function myArmies() { return War.armies.filter(function (a) { return a.tag === Game.player; }); }
  function myDivsAt(id) { return (War.at[id] || []).filter(function (d) { return d.tag === Game.player; }); }
  // the divisions currently selected (own, still alive)
  function picked() { var out = []; if (!Game.player) return out; for (var i = 0; i < War.divs.length; i++) { var d = War.divs[i]; if (sel[d.id] && d.tag === Game.player) out.push(d); } return out; }
  function setSel(list, add) { if (!add) sel = {}; list.forEach(function (d) { sel[d.id] = true; }); afterSel(); }
  function afterSel() {
    var p = picked(), one = null, mixed = false;
    p.forEach(function (d) { var a = War.armyOf(d.id); if (one === null) one = a; else if (one !== a) mixed = true; });
    if (p.length && !mixed && one) activeArmy = one.id; else if (p.length) activeArmy = null;
    renderBar(); MapView.refreshOverlay();
  }
  function statusOf(d) {
    if (d.retreat) return 'Retreating to ' + Game.province(d.path[0].to).name;
    if (d.battle !== null) return 'Attacking ' + Game.province(d.path[0].to).name;
    if (d.path.length) {
      var leg = d.path[0], left = Math.max(1, Math.ceil(War.legDays(d, d.prov, leg) - d.prog)), end = Game.province(d.path[d.path.length - 1].to).name;
      return (leg.sea ? 'Sailing to ' : 'Marching to ') + end + ' (next stop ' + left + (left === 1 ? ' day)' : ' days)');
    }
    return d.nosupply ? 'Cut off from supply' : d.far ? 'Holding, far from supply' : 'Holding';
  }

  // ---------- toasts and hints ----------
  function toast(text, kind) {
    var box = $('toasts'), t = h('div', 'toast' + (kind ? ' ' + kind : ''), text); box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5200);
  }
  function setHint(text) { var el = $('hint'); el.hidden = !text; el.textContent = text || ''; }
  function cancelTool() { Game.pick = null; Game.paint = null; Game.paintEnd = null; painting = null; setHint(null); }

  // ---------- peace offers from other nations ----------
  function showOffers() {
    var box = $('offers'); box.innerHTML = '';
    if (!Game.player) return;
    War.offers.forEach(function (o) {
      if (!War.atWar(Game.player, o.from)) return;
      var card = h('div', 'offer'), n = Game.nations[o.from];
      card.appendChild(h('strong', null, n.short + (o.demand ? ' demands terms' : ' sues for peace')));
      card.appendChild(h('span', null, o.demand ? 'You would give up: ' + War.termsText(o.terms) + '.' : o.terms ? 'They offer: ' + War.termsText(o.terms) + '.' : o.keep ? 'They will cede the provinces you hold.' : 'Borders would return to what they were.'));
      var row = h('div', 'acts'), yes = h('button', 'primary', o.demand ? 'Give in' : 'Accept'), no = h('button', 'ghost', o.demand ? 'Fight on' : 'Refuse'); yes.type = no.type = 'button';
      yes.addEventListener('click', function () {
        War.offers = War.offers.filter(function (x) { return x !== o; });
        if (o.terms) War.dictatePeace(o.terms); else War.peace(Game.player, o.from, o.keep);
        Game.save(); showOffers(); UI.refresh(); Game.emit('owner'); MapView.redraw();
      });
      no.addEventListener('click', function () { War.offers = War.offers.filter(function (x) { return x !== o; }); o.day = -999; showOffers(); });
      row.appendChild(yes); row.appendChild(no); card.appendChild(row); box.appendChild(card);
    });
  }

  // ---------- orders to divisions ----------
  function order(target, sea) {
    var list = picked(), ok = 0, why = null; if (!list.length || target === null) return;
    list.forEach(function (d) { var r = sea ? War.orderSea(d, target) : War.orderMove(d, target); if (r) why = r; else { ok++; d.manual = true; } });
    if (!ok && why) toast(why, 'bad');
    else if (why) toast(ok + ' on the way; the rest: ' + why.toLowerCase(), 'bad');
    else if (sea && ok && list[0].inv) { var st = War.invasionStatus(list[0]); toast('Naval invasion planned: ' + st.left + ' days to prepare, and it sails only when your fleets hold the sea off ' + Game.province(target).name); }
    if (sea && ok && War.seaDanger) { var dg = War.seaDanger(Game.player, list[0].prov, target); if (dg !== null && dg < 0.5) toast('Warning: enemy warships hold part of the route. Convoys may be sunk or turned back; send a fleet to escort or patrol first.', 'bad'); }
    War.indexStacks(); UI.refresh(); renderBar(); MapView.refreshOverlay();
  }
  function startPick(sea) {
    cancelTool();
    setHint((sea ? 'Click a coastal province to sail to' : 'Click where to march') + ' (Esc cancels)');
    Game.pick = function (id) { setHint(null); if (id !== null) order(id, sea); };
  }
  function haltSel() { picked().forEach(function (d) { War.halt(d); d.manual = true; }); UI.refresh(); renderBar(); MapView.refreshOverlay(); }

  // ---------- armies ----------
  function newArmy() {
    var p = picked(); if (!p.length) { toast('Select some divisions first: drag a box around them, or click a counter', 'bad'); return; }
    var a = War.newArmy(Game.player, p.map(function (d) { return d.id; })); activeArmy = a.id; Game.save(); renderBar(); MapView.refreshOverlay();
  }
  // paint a list of your own provinces (front line, fallback line or garrison), or click a neighbour for a whole border
  function paintTool(a, kind) {
    var label = { front: 'Front line for ' + a.name + ': click a neighbouring nation\'s land to hold that whole border, or drag across your provinces to draw a line',
      fallback: 'Fallback line for ' + a.name + ': drag across your provinces behind the front', garrison: 'Garrison for ' + a.name + ': drag across (or click) the provinces to hold' }[kind];
    cancelTool(); setHint(label + ' (Esc cancels)');
    function setLine(list) {
      if (kind === 'fallback') a.fallback = list.slice();
      else { a.front = { type: kind === 'garrison' ? 'garrison' : 'line', provs: list.slice() }; a.targets = []; a.exec = false; }
      a._key = null; a._fkey = null;
    }
    Game.pick = function (id) {
      cancelTool(); if (id === null) return;
      var p = Game.province(id);
      if (kind === 'front' && !War.friendly(a.tag, p)) {
        a.front = { type: 'border', foe: p.ctrl }; a.targets = []; a.exec = false; a._key = null;
        if (!War.frontOf(a).length) { toast('You have no border with ' + Game.nations[p.ctrl].short + ' yet', 'bad'); a.front = null; }
      } else if (War.friendly(a.tag, p)) setLine([id]);
      else { toast('Pick your own provinces', 'bad'); return; }
      Game.save(); renderBar(); MapView.refreshOverlay();
    };
    painting = [];
    Game.paint = function (id) {
      if (id === null || !War.friendly(a.tag, Game.province(id)) || painting.indexOf(id) >= 0) return;
      painting.push(id); setLine(painting); MapView.refreshOverlay();
    };
    Game.paintEnd = function () { var n = painting ? painting.length : 0; cancelTool(); if (n) { Game.save(); renderBar(); } };
  }
  function needArmy() { var a = armyById(activeArmy); if (!a) toast('Click an army in the bar below first (or form one with G)', 'bad'); return a; }
  function frontTool() { var a = needArmy(); if (a) paintTool(a, 'front'); }
  function fallbackTool() { var a = needArmy(); if (a) paintTool(a, 'fallback'); }
  function garrisonTool() { var a = needArmy(); if (a) paintTool(a, 'garrison'); }
  function offensiveTool() {
    var a = needArmy(); if (!a) return;
    War.fixArmy(a);
    if (!a.front || a.front.type === 'garrison') { toast('Give ' + a.name + ' a front line first (Z)', 'bad'); return; }
    if (a.targets.length >= War.MAX_ARROWS) { toast(a.name + ' already has ' + War.MAX_ARROWS + ' offensive arrows. Clear them first.', 'bad'); return; }
    cancelTool();
    setHint('Offensive arrow ' + (a.targets.length + 1) + ' for ' + a.name + ': click the enemy province to take (Esc cancels)');
    Game.pick = function (id) {
      setHint(null); if (id === null) return;
      if (War.friendly(a.tag, Game.province(id))) { toast('Pick a province the enemy holds', 'bad'); return; }
      if (a.targets.indexOf(id) < 0) a.targets.push(id); Game.save(); renderBar(); MapView.refreshOverlay();
    };
  }
  function toggleExec() {
    var a = armyById(activeArmy); if (!a || !a.front) { toast('The army needs a front line first (Z)', 'bad'); return; }
    War.fixArmy(a);
    if (a.front.type === 'garrison') { toast('A garrison holds its provinces; it does not attack', 'bad'); return; }
    if (!a.exec && !War.enemies(a.tag).length) { toast('You are at peace: there is no one to attack', 'bad'); return; }
    var bad = a.targets.filter(function (t) { return !War.hostile(a.tag, Game.province(t)); })[0];
    if (!a.exec && bad !== undefined) { toast('You are not at war with whoever holds ' + Game.province(bad).name, 'bad'); return; }
    if (!a.exec && a.front.type !== 'border' && !a.targets.length) { toast('A drawn line needs an offensive arrow (X) before it can attack', 'bad'); return; }
    a.exec = !a.exec; Game.save(); renderBar(); MapView.refreshOverlay();
  }

  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function renderBar() {
    var bar = $('armybar'), pl = Game.player; bar.innerHTML = ''; lastBar = Date.now();
    bar.hidden = !pl; if (!pl) return;
    var armies = myArmies(), inArmy = {}, total = 0, p = picked();
    armies.forEach(function (a) { a.divs.forEach(function (id) { inArmy[id] = 1; }); });
    var reserve = War.divs.filter(function (d) { return d.tag === pl && !inArmy[d.id]; });

    var row = h('div', 'ab-armies');
    function card(a) {
      War.fixArmy(a);
      var c = btn('ab-card' + (a.id === activeArmy ? ' is-on' : '') + (multi[a.id] ? ' is-multi' : ''), '', function (e) {
        if (e.shiftKey) { if (multi[a.id]) delete multi[a.id]; else multi[a.id] = true; renderBar(); return; }
        multi = {}; activeArmy = a.id; keepSel = true; Game.select(null); keepSel = false;
        sel = {}; a.divs.forEach(function (id) { sel[id] = true; }); renderBar(); MapView.refreshOverlay();
      }, 'Click to select this army; Shift-click to pick several for an army group');
      var chip = h('i'); chip.style.background = armyColor(a); c.appendChild(chip);
      var g = a.gen ? War.genById(a.gen) : null, plan = War.armyPlan(a);
      var txt = h('span', 'ab-txt'); txt.appendChild(h('strong', null, a.name + ' · ' + a.divs.length + (g ? ' · ' + g.name.split(' ').slice(-1)[0] + ' ' + '★'.repeat(g.skill) : '')));
      txt.appendChild(h('span', null, War.armyStatus(a) + (plan > 0.01 ? ' · planning +' + Math.round(plan * 100) + '%' : '')));
      c.appendChild(txt); return c;
    }
    var groups = War.groups.filter(function (g) { return g.tag === pl; });
    groups.forEach(function (g) {
      var members = armies.filter(function (a) { return a.group === g.id; }); if (!members.length) return;
      var box = h('div', 'ab-group'), fm = g.fm ? War.genById(g.fm) : null, head = h('div', 'ab-ghead');
      head.appendChild(h('strong', null, g.name));
      head.appendChild(btn('link', fm ? 'Marshal ' + fm.name : 'No field marshal', function () { window.Designer.openGeneralPicker(null, g); }, 'Choose the field marshal'));
      head.appendChild(btn('link', 'Select all', function () { multi = {}; activeArmy = null; keepSel = true; Game.select(null); keepSel = false; sel = {}; members.forEach(function (a) { a.divs.forEach(function (id) { sel[id] = true; }); }); renderBar(); MapView.refreshOverlay(); }));
      head.appendChild(btn('link', 'Dissolve', function () { War.dissolveGroup(g); War.touchArmies(); Game.save(); renderBar(); }));
      box.appendChild(head); var inner = h('div', 'ab-ginner'); members.forEach(function (a) { inner.appendChild(card(a)); }); box.appendChild(inner); row.appendChild(box);
      total += members.length;
    });
    armies.forEach(function (a) { if (!a.group || !War.groupById(a.group)) row.appendChild(card(a)); });
    bar.appendChild(row);

    var act = h('div', 'ab-acts'), a = armyById(activeArmy), multiIds = Object.keys(multi).map(Number).filter(function (id) { return armyById(id); });
    if (multiIds.length >= 2) {
      act.appendChild(h('span', 'ab-info', multiIds.length + ' armies picked'));
      act.appendChild(btn('ghost', 'Form army group', function () { War.newGroup(pl, multiIds); multi = {}; War.touchArmies(); Game.save(); renderBar(); }));
      act.appendChild(btn('ghost', 'Cancel', function () { multi = {}; renderBar(); }));
    } else if (p.length) {
      var c = { inf: 0, cav: 0, art: 0 }, s = 0; p.forEach(function (d) { c[d.type]++; s += d.str; });
      act.appendChild(h('span', 'ab-info', p.length + ' selected (' + [c.inf && c.inf + ' inf', c.cav && c.cav + ' cav', c.art && c.art + ' art'].filter(Boolean).join(', ') + ') at ' + pct(s / p.length)));
      act.appendChild(btn('ghost', 'New army (G)', newArmy));
      if (a && p.some(function (d) { return a.divs.indexOf(d.id) < 0; })) act.appendChild(btn('ghost', 'Add to ' + a.name, function () { War.assign(a, p.map(function (d) { return d.id; })); Game.save(); renderBar(); MapView.refreshOverlay(); }));
      if (p.some(function (d) { return inArmy[d.id]; })) act.appendChild(btn('ghost', 'Remove from army', function () { War.unassign(p.map(function (d) { return d.id; })); Game.save(); renderBar(); MapView.refreshOverlay(); }));
      act.appendChild(btn('ghost', 'Halt (H)', haltSel));
    } else act.appendChild(h('span', 'ab-info', armies.length ? 'Click an army, or drag a box on the map to select divisions.' : 'Drag a box around your divisions (or click a counter), then press G to form an army.'));
    bar.appendChild(act);

    if (a) {
      War.fixArmy(a);
      var ord = h('div', 'ab-acts'), g = a.gen ? War.genById(a.gen) : null;
      var lab = h('span', 'ab-info'), ch = h('i'); ch.style.background = armyColor(a); lab.appendChild(ch); lab.appendChild(document.createTextNode(a.name));
      ord.appendChild(lab);
      ord.appendChild(btn('ghost gen-chip', g ? g.name + ' ' + '★'.repeat(g.skill) : 'No general', function () { window.Designer.openGeneralPicker(a); }, 'Choose this army\'s general'));
      ord.appendChild(btn('ghost', 'Front (Z)', frontTool, 'Hold a border or a drawn line'));
      ord.appendChild(btn('ghost', 'Arrow (X)' + (a.targets.length ? ' ' + a.targets.length + '/' + War.MAX_ARROWS : ''), offensiveTool, 'Add an offensive arrow toward an enemy province'));
      if (a.targets.length) ord.appendChild(btn('ghost', 'Clear arrows', function () { a.targets = []; a.exec = false; Game.save(); renderBar(); MapView.refreshOverlay(); }));
      ord.appendChild(btn(a.exec ? 'primary' : 'ghost', a.exec ? 'Stop (E)' : 'Execute (E)', toggleExec));
      ord.appendChild(btn('ghost', War.STANCES[a.stance].name, function () { a.stance = (a.stance + 1) % War.STANCES.length; Game.save(); renderBar(); }, 'Careful: attacks only with good odds, −15% attack, +15% defence, 15% fewer losses. Aggressive: attacks at even odds, +15% attack, 15% more losses. Click to change.'));
      if (War.ABILITIES) {
        var abSel = document.createElement('select'), cur = War.abilityOf(a); abSel.className = 'ab-sel'; abSel.title = 'Command power: ' + Math.floor(War.cpOf(a.tag)) + '. Spend it on an ability for this army.';
        var o0 = document.createElement('option'); o0.value = ''; o0.textContent = cur ? War.ABILITIES[cur].name + ' (' + (a.ab.until - War.day) + 'd)' : 'Ability · ⚑' + Math.floor(War.cpOf(a.tag)); abSel.appendChild(o0);
        if (!cur) Object.keys(War.ABILITIES).forEach(function (k) { var ab = War.ABILITIES[k], o = document.createElement('option'); o.value = k; o.textContent = ab.name + ' · ' + ab.cost; o.title = ab.text; o.disabled = War.cpOf(a.tag) < ab.cost; abSel.appendChild(o); });
        abSel.addEventListener('change', function () { if (!abSel.value) return; var r = War.useAbility(a, abSel.value); if (r) toast(r, 'bad'); else toast(War.ABILITIES[abSel.value].name + ': ' + War.ABILITIES[abSel.value].text); Game.save(); renderBar(); });
        ord.appendChild(abSel);
      }
      ord.appendChild(btn(a.forced ? 'primary' : 'ghost', a.forced ? 'Forced march ✓' : 'Forced march', function () { War.setForced(a, !a.forced); Game.save(); renderBar(); }, '30% faster marching, but the men tire (organisation and some strength lost on the road) and fight 8% worse'));
      if (War.setDrill) ord.appendChild(btn(a.drill ? 'primary' : 'ghost', a.drill ? 'Drill ✓' : 'Drill', function () { War.setDrill(a, !a.drill); Game.save(); renderBar(); }, 'Exercises at home: green divisions gain experience (up to Trained) and the army learns (army experience), at a cost in gold and organisation'));
      ord.appendChild(btn(a.wq ? 'primary' : 'ghost', a.wq ? 'Winter quarters ✓' : 'Winter quarters', function () { War.setWQ(a, !a.wq); Game.save(); renderBar(); MapView.refreshOverlay(); }, 'Halt in friendly land: no losses to the weather, faster recovery of organisation and strength'));
      ord.appendChild(btn('ghost', a.fallback ? 'Fallback line ✓ (V)' : 'Fallback line (V)', fallbackTool, 'Draw a line to fall back to'));
      if (a.fallback) {
        ord.appendChild(btn('ghost', 'Fall back now', function () { War.fallBack(a); Game.save(); renderBar(); MapView.refreshOverlay(); }));
        ord.appendChild(btn('ghost', a.autoFall ? 'Auto fallback: on' : 'Auto fallback: off', function () { a.autoFall = !a.autoFall; Game.save(); renderBar(); }, 'Fall back by itself when half the army is broken or retreating'));
      }
      ord.appendChild(btn('ghost', 'Garrison (B)', garrisonTool, 'Hold chosen provinces, such as ports and cities, without attacking'));
      if (a.front) ord.appendChild(btn('ghost', 'Clear orders', function () { a.front = null; a.targets = []; a.exec = false; a._key = null; Game.save(); renderBar(); MapView.refreshOverlay(); }));
      ord.appendChild(btn('ghost danger', 'Disband', function () { War.disband(a); activeArmy = null; Game.save(); renderBar(); MapView.refreshOverlay(); }, 'The divisions stay; only the army is dissolved'));
      bar.appendChild(ord);
    }
  }

  // ---------- province panel ----------
  function provinceSection(id) {
    var p = Game.province(id), wrap = h('div', 'econ'), stack = War.at[id] || [], pl = Game.player;

    var fl = War.fortAt ? War.fortAt(id) : 0, sg = War.sieging ? War.sieging(id) : null;
    if (sg) { var sb = h('div', 'battle siege'); sb.appendChild(h('strong', null, 'Siege of ' + p.name)); sb.appendChild(h('span', null, Game.nations[sg.by].short + ' besieges the fortress (level ' + fl + '): ' + Math.round(sg.prog / sg.need * 100) + '% · artillery, engineers and a blockade speed it up')); var st = h('div', 'bar-track'), sf = h('div', 'bar-fill'); sf.style.width = Math.round(sg.prog / sg.need * 100) + '%'; st.appendChild(sf); sb.appendChild(st); wrap.appendChild(sb); }
    else if (fl >= 2 && War.FORTRESSES && War.FORTRESSES[p.name]) wrap.appendChild(h('p', 'note', 'Fortress (level ' + fl + '): an enemy must besiege it for weeks before it falls.'));
    var bt = War.battleAt(id);
    if (bt) {
      var box = h('div', 'battle'), na = War.attackers(bt).length, nd = War.defenders(bt).length, share = bt.r / (1 + bt.r);
      box.appendChild(h('strong', null, 'Battle of ' + p.name));
      box.appendChild(h('span', null, Game.nations[bt.tag].short + ' attacks with ' + na + ' · ' + nd + ' defend · day ' + bt.days));
      var tr = h('div', 'bar-track'), f = h('div', 'bar-fill att'); f.style.width = Math.round(share * 100) + '%'; tr.appendChild(f); box.appendChild(tr);
      box.appendChild(h('span', 'note', share > 0.55 ? 'The attack is gaining ground.' : share < 0.45 ? 'The defence is holding.' : 'Evenly matched.'));
      if (bt.tacA && War.TACTICS) { var TA = War.TACTICS[bt.tacA], TD = War.TACTICS[bt.tacD]; box.appendChild(h('span', 'note tactic', 'Today: ' + (TA ? TA.name : '—') + ' against ' + (TD ? TD.name : '—') + (TA && TD && TD.counters === bt.tacA ? ' (countered!)' : ''))); }
      box.appendChild(btn('ghost', 'Battle details', function () { window.Designer.openBattle(id); }));
      wrap.appendChild(box);
    }

    var mine = pl ? myDivsAt(id) : [];
    if (mine.length) {
      wrap.appendChild(h('h3', 'p-sub', 'Your army here'));
      var list = h('div', 'divs');
      mine.forEach(function (d) {
        var row = h('label', 'divrow'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!sel[d.id]; cb.id = 'div-' + d.id;
        cb.addEventListener('change', function () { if (cb.checked) sel[d.id] = true; else delete sel[d.id]; afterSel(); });
        var ar = War.armyOf(d.id), tp = War.tplById(d.tpl), txt = h('span', 'divtxt'); txt.appendChild(h('strong', null, (tp ? tp.name : 'Division') + (ar ? ' · ' + ar.name : ''))); txt.appendChild(h('span', null, War.xpLevel(d.xp || 0).name + ' · ' + statusOf(d)));
        var info = btn('info-btn', 'i', function (e) { e.preventDefault(); e.stopPropagation(); window.Designer.openDivision(d.id); }, 'Division details'); txt.appendChild(info);
        var bars = h('span', 'divbars'); bars.title = 'Strength ' + pct(d.str) + ', organisation ' + pct(d.org);
        var b1 = h('i', 'str'), b2 = h('i', 'org'); b1.style.width = Math.round(d.str * 100) + '%'; b2.style.width = Math.round(d.org * 100) + '%';
        var w1 = h('span'), w2 = h('span'); w1.appendChild(b1); w2.appendChild(b2); bars.appendChild(w1); bars.appendChild(w2);
        row.appendChild(cb); row.appendChild(txt); row.appendChild(bars); list.appendChild(row);
      });
      wrap.appendChild(list);
      var act = h('div', 'acts');
      act.appendChild(btn('primary', 'March…', function () { if (picked().length) startPick(false); else toast('Tick at least one division first', 'bad'); }));
      if (p.coastal && Econ.P[id].b.port) act.appendChild(btn('ghost', 'Ship…', function () { if (picked().length) startPick(true); else toast('Tick at least one division first', 'bad'); }));
      if (War.redeploy) act.appendChild(btn('ghost', 'Redeploy…', function () {
        var ds = picked(); if (!ds.length) { toast('Tick at least one division first', 'bad'); return; }
        cancelTool(); setHint('Click where to redeploy: by post roads through friendly land, four times as fast but unready to fight (Esc cancels)');
        Game.pick = function (to) { setHint(null); if (to === null) return; var why = null, n = 0; ds.forEach(function (d) { var r = War.redeploy(d, to); if (r) why = r; else n++; }); if (why && !n) toast(why, 'bad'); else toast(n + ' division' + (n > 1 ? 's' : '') + ' redeploying to ' + Game.province(to).name); Game.save(); UI.refresh(); MapView.refreshOverlay(); };
      }, 'Strategic redeployment: four times as fast through friendly land, but with no organisation'));
      act.appendChild(btn('ghost', 'Halt', haltSel)); wrap.appendChild(act);
      var need = War.demand[id] || 0, have = War.supply[pl] ? War.supply[pl].cap[id] : 0, short = mine.filter(function (d) { return d.sr < 0.999; }).length, cut = mine.some(function (d) { return d.nosupply; });
      wrap.appendChild(h('p', 'note' + (short ? ' warn' : ''), 'Right-click a province to march the ticked divisions there. Supply here: ' + have.toFixed(1) + ' wagons a day for ' + need.toFixed(1) + ' needed' + (cut ? '. Cut off from every depot: these men are encircled.' : short ? '. Short of food and powder, so they fight worse, mend slower and lose men.' : '.')));
    }

    var others = {}, sight = War.seen(id);
    if (pl && sight < 2) {
      var hid = stack.some(function (d) { return !War.allied(pl, d.tag); });
      if (hid || sight === 0) wrap.appendChild(h('p', 'note fog-note', sight === 0 ? 'Fog of war: you cannot see this province. Send troops or cavalry nearby to learn what is here.' : 'Fog of war: scouts report soldiers here, but not how many. Move closer to see them clearly.'));
    }
    stack.forEach(function (d) { if (d.tag !== pl && (sight === 2 || !pl || War.allied(pl, d.tag))) { var o = others[d.tag] = others[d.tag] || { n: 0, inf: 0, cav: 0, art: 0, str: 0 }; o.n++; o[d.type]++; o.str += d.str; } });
    var tags = Object.keys(others);
    if (tags.length) {
      wrap.appendChild(h('h3', 'p-sub', mine.length ? 'Other armies here' : 'Armies here'));
      tags.forEach(function (t) {
        var o = others[t], rel = pl && War.atWar(pl, t) ? ' enemy' : pl && War.allied(pl, t) ? ' ally' : '';
        var row = h('div', 'army' + rel), sw = h('span', 'swatch'); sw.style.background = Game.nations[t].color;
        row.appendChild(sw); row.appendChild(h('strong', null, Game.nations[t].short));
        row.appendChild(h('span', null, o.n + (o.n === 1 ? ' division' : ' divisions') + ' (' + [o.inf && o.inf + ' inf', o.cav && o.cav + ' cav', o.art && o.art + ' art'].filter(Boolean).join(', ') + ') at ' + pct(o.str / o.n)));
        wrap.appendChild(row);
      });
    }

    if (pl && p.owner === pl && p.ctrl === pl) {
      wrap.appendChild(h('h3', 'p-sub', 'Raise a division here'));
      var rl = h('div', 'blds');
      War.tpls[pl].forEach(function (tp) {
        var t = War.tplStats(tp), why = War.recruitBlock(pl, tp.id, id), r = h('div', 'bld'), name = h('div', 'bld-name');
        name.appendChild(h('strong', null, tp.name));
        name.appendChild(h('span', null, num(t.men) + ' men · width ' + t.w + ' · atk ' + Math.round(t.atk) + ' def ' + Math.round(t.def) + ' · ' + t.days + ' days'));
        var b = h('button', 'bld-btn', why || 'Raise for ' + money(t.money * (Econ.N[pl].pi || 1))); b.type = 'button'; b.disabled = !!why;
        b.addEventListener('click', function () { if (!War.recruit(pl, tp.id, id)) { Game.save(); UI.refresh(); EconUI.updateChip(); EconUI.refresh(true); } });
        r.appendChild(name); r.appendChild(h('div', 'bld-lvl', '')); r.appendChild(b); rl.appendChild(r);
      });
      wrap.appendChild(rl);
      wrap.appendChild(btn('ghost', 'Open division designer (U)', function () { window.Designer.open(); }));
      var q = War.recruits.filter(function (r) { return r.tag === pl && r.prov === id; });
      if (q.length) wrap.appendChild(h('div', 'bld-q', 'Being raised: ' + q.map(function (r) { var tp = War.tplById(r.tpl); return (tp ? tp.name : 'Division') + ' (' + r.left + ' days)'; }).join(', ')));
    }
    return wrap;
  }

  // ---------- nation card ----------
  function nationSection(tag) {
    var wrap = h('div', 'econ'), pl = Game.player, foes = War.enemies(tag), friends = War.allies(tag).filter(function (a) { return !War.gone[a]; });
    function names(list) { return list.map(function (t) { return Game.nations[t].short; }).sort().join(', '); }
    if (War.gone[tag]) { wrap.appendChild(h('p', 'note', 'This nation has been wiped from the map.')); return wrap; }
    var dl = h('dl', 'facts');
    function row(k, v) { dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, v)); }
    row('Army', (War.M[tag].count || 0) + ' divisions, ' + num(Math.round((War.M[tag].men || 0) / 1000) * 1000) + ' men');
    row('At war with', foes.length ? names(foes) : 'No one');
    if (friends.length) row('Allied to', names(friends));
    row('Victory points', String(War.vpOf(tag)));
    if (foes.length) row('Toward surrender', pct(War.surrenderProgress(tag)) + ' of 65%' + (War.capLost && War.capLost[tag] !== undefined ? ' · capital lost ' + (War.day - War.capLost[tag]) + ' days' : ''));
    wrap.appendChild(dl);
    if (!pl || pl === tag) return wrap;

    var act = h('div', 'acts');
    if (War.atWar(pl, tag)) {
      var score = War.warScore(pl, tag);
      wrap.appendChild(h('p', 'note', 'You are at war. ' + (score > 1 ? 'You hold land home to ' + Math.round(score) + '% of their people (net).' : score < -1 ? 'They hold land home to ' + Math.round(-score) + '% of your people (net).' : 'Neither side holds much of the other.')));
      act.appendChild(btn('ghost', 'Offer peace, borders as before', function () { offer(tag, false); }));
      act.appendChild(btn('ghost', 'Offer peace, each keeps what it holds', function () { offer(tag, true); }));
      var pos = War.warPosition(pl, tag), cE = War.warCondition(tag), terms = cE.total >= 30 && War.victorOver(tag) === pl ? War.peaceTerms(pl, tag) : null;
      wrap.appendChild(h('p', 'note', 'The war as a whole: ' + (pos >= 30 ? 'you are winning clearly' : pos >= 10 ? 'you have the upper hand' : pos > -10 ? 'evenly balanced' : pos > -30 ? 'they have the upper hand' : 'you are losing badly') + ' (' + (pos >= 0 ? '+' : '') + Math.round(pos) + '; land, armies and capitals). ' + 'Their state: ' + Math.round(cE.total) + ' of 100 (occupied ' + Math.round(cE.occ) + ', capital ' + Math.round(cE.cap) + ', losses ' + Math.round(cE.weary) + '). ' + (terms ? 'They would yield ' + War.termsText(terms) + '.' : 'At 30 or more, and with you as the one who beat them, they will pay for peace.')));
      if (terms && (terms.lots.length || terms.gold > 0)) act.appendChild(btn('primary', 'Demand ' + War.termsText(terms), function () { War.dictatePeace(terms); Game.save(); UI.refresh(); Game.emit('owner'); MapView.redraw(); }));
    } else if (War.allied(pl, tag)) wrap.appendChild(h('p', 'note', 'Your ally. Your armies may cross their land, and they join you if you are attacked.'));
    else if (War.truce[War.key(pl, tag)] > War.day) wrap.appendChild(h('p', 'note', 'A truce holds for another ' + Math.ceil((War.truce[War.key(pl, tag)] - War.day) / 30) + ' months; neither side may declare war before then.'));
    else if (askWar !== tag) act.appendChild(btn('ghost danger', 'Declare war', function () { askWar = tag; UI.refresh(); }));
    else {
      var al = War.allies(tag).filter(function (a) { return !War.gone[a] && !War.allied(pl, a); });
      wrap.appendChild(h('p', 'note', 'War with ' + Game.nations[tag].short + (al.length ? ' will also bring in ' + names(al) + '.' : '.') + ' Your own allies stay out unless you are attacked.'));
      act.appendChild(btn('ghost danger', 'Go to war', function () { askWar = null; War.declare(pl, tag); Game.save(); UI.refresh(); MapView.refreshOverlay(); }));
      act.appendChild(btn('ghost', 'Not now', function () { askWar = null; UI.refresh(); }));
    }
    if (act.children.length) wrap.appendChild(act);
    return wrap;
  }
  function offer(tag, keep) {
    if (War.wouldAccept(Game.player, tag, keep)) { War.peace(Game.player, tag, keep); Game.save(); }
    else toast(Game.nations[tag].short + ' refuses' + (keep ? '. They will not sign away land while they think they can win it back.' : '. They mean to fight on.'), 'bad');
    UI.refresh();
  }

  // ---------- Army tab ----------
  function armyTab(body, tag, mine) {
    var m = War.M[tag], n = Econ.N[tag], c = { inf: 0, cav: 0, art: 0 }, str = 0;
    War.divs.forEach(function (d) { if (d.tag === tag) { c[d.type]++; str += d.str; } });
    var total = c.inf + c.cav + c.art, hero = h('div', 'hero');
    var a = h('div'); a.appendChild(h('div', 'p-kicker', 'Divisions')); a.appendChild(h('div', 'big', String(total)));
    var b = h('div'); b.appendChild(h('div', 'p-kicker', 'Recruits available')); b.appendChild(h('div', 'big', num(Math.round(m.manpower / 100) * 100)));
    hero.appendChild(a); hero.appendChild(b); body.appendChild(hero);
    var dl = h('dl', 'facts');
    function row(k, v) { dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, v)); }
    row('Infantry', c.inf + ' divisions'); row('Cavalry', c.cav + ' divisions'); row('Artillery', c.art + ' reserves');
    row('Men under arms', num(Math.round((m.men || 0) / 1000) * 1000) + (total ? ' (at ' + pct(str / total) + ' strength)' : ''));
    row('Pay and upkeep', money(m.upkeep) + ' a month');
    var hungry = War.divs.filter(function (d) { return d.tag === tag && d.sr < 0.999; }).length, cut = War.divs.filter(function (d) { return d.tag === tag && d.nosupply; }).length;
    row('Supply', hungry ? hungry + ' divisions short' + (cut ? ', ' + cut + ' cut off' : '') : 'All divisions fed');
    if (War.enemies(tag).length) row('Toward surrender', pct(War.surrenderProgress(tag)) + ' of victory points lost (65% means defeat)');
    row('Arsenal', num(Math.floor(n.stockpile.muskets)) + ' muskets · ' + num(Math.floor(n.stockpile.artillery)) + ' guns · ' + num(Math.floor(n.stockpile.horses)) + ' horses');
    body.appendChild(dl);
    body.appendChild(h('p', 'note', mine ? 'To raise a division, click one of your provinces. It needs recruits, arms from the arsenal, and money. Raise "Arms purchases" on the Budget tab to fill the arsenal faster.' : 'Choose this nation to command its armies.'));

    var rq = War.recruits.filter(function (r) { return r.tag === tag; });
    if (rq.length) {
      body.appendChild(h('h3', 'p-sub', 'Being raised'));
      var ul = h('ul', 'queue');
      rq.sort(function (x, y) { return x.left - y.left; }).forEach(function (r) {
        var li = h('li'), bn = btn('chip', Game.province(r.prov).name, function () { Game.select(r.prov); MapView.focusProvince(r.prov); });
        var tp = War.tplById(r.tpl); li.appendChild(bn); li.appendChild(h('span', null, tp ? tp.name : 'Division')); li.appendChild(h('span', 'n', r.left + ' d')); ul.appendChild(li);
      });
      body.appendChild(ul);
    }

    body.appendChild(h('h3', 'p-sub', 'Wars'));
    var foes = War.enemies(tag);
    if (!foes.length) body.appendChild(h('p', 'note', 'At peace.'));
    else {
      var wl = h('ul', 'queue');
      foes.forEach(function (f) {
        var li = h('li'), bn = h('button', 'chip'), dot = h('i'); dot.style.background = Game.nations[f].color; bn.type = 'button';
        bn.appendChild(dot); bn.appendChild(document.createTextNode(Game.nations[f].short));
        bn.addEventListener('click', function () { UI.showNation(f, true); });
        var sc = War.warScore(tag, f);
        li.appendChild(bn); li.appendChild(h('span', null, (War.M[f].count || 0) + ' divisions')); li.appendChild(h('span', 'n ' + (sc > 1 ? 'exp' : sc < -1 ? 'imp' : ''), (sc > 0 ? '+' : '') + Math.round(sc) + '%'));
        wl.appendChild(li);
      });
      body.appendChild(wl);
      body.appendChild(h('p', 'note', 'The figure is the share of their people living under occupation, less the share of these. A nation gives in when its capital has been held for three months and half its people are occupied. To offer peace, open the enemy\'s card.'));
    }

    body.appendChild(h('h3', 'p-sub', 'Division templates'));
    var tl = h('ul', 'queue');
    (War.tpls[tag] || []).forEach(function (tp) {
      var s = War.tplStats(tp), li = h('li');
      li.appendChild(mine ? btn('chip', tp.name, function () { window.Designer.open(tp.id); }) : h('span', null, tp.name));
      li.appendChild(h('span', null, 'width ' + s.w + ' · atk ' + Math.round(s.atk) + ' · def ' + Math.round(s.def)));
      li.appendChild(h('span', 'n', War.tplUsers(tp.id) + ' in service')); tl.appendChild(li);
    });
    body.appendChild(tl);
    if (mine) body.appendChild(btn('ghost', 'Open division designer (U)', function () { window.Designer.open(); }));
    body.appendChild(h('p', 'note', 'Army experience: ' + Math.floor(m.xp || 0) + '. It comes from fighting (and a little from drill) and pays for template changes and promotions.'));

    body.appendChild(h('h3', 'p-sub', 'Generals'));
    var gl = h('ul', 'gens');
    War.gensOf(tag).sort(function (x, y) { return (y.fm - x.fm) || y.skill - x.skill; }).forEach(function (g) {
      var li = h('li'), top = h('div', 'gen-top');
      top.appendChild(h('strong', null, (g.fm ? 'Marshal ' : '') + g.name)); top.appendChild(h('span', 'stars', '★'.repeat(g.skill) + '☆'.repeat(Math.max(0, 5 - g.skill))));
      li.appendChild(top);
      var where = g.army ? (War.armies.filter(function (a) { return a.id === g.army; })[0] || { name: '' }).name : g.group ? (War.groupById(g.group) || { name: '' }).name : 'Unassigned';
      li.appendChild(h('span', 'gen-stats', 'Atk ' + g.atk + ' · Def ' + g.def + ' · Plan ' + g.plan + ' · Log ' + g.log + ' · ' + where));
      if (g.traits.length) li.appendChild(h('span', 'gen-traits', g.traits.map(function (t) { return window.UNITS.TRAITS[t] ? window.UNITS.TRAITS[t].name : t; }).join(' · ')));
      if (mine && !g.fm) li.appendChild(btn('link', 'Promote to field marshal (50 XP)', function () { var r = War.promote(g); if (r) toast(r, 'bad'); else Game.save(); EconUI.refresh(true); }));
      gl.appendChild(li);
    });
    body.appendChild(gl);

    body.appendChild(h('h3', 'p-sub', 'Computer opponents'));
    var sk = h('div', 'slider'), lab = h('label', null, 'How the other nations play'), se = document.createElement('select'); se.id = 'ai-skill'; lab.setAttribute('for', 'ai-skill');
    [[2, 'Skilled: they plan campaigns, form coalitions and make peace'], [1, 'Simple: they hold their fronts and attack when stronger']].forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; if (War.skill === o[0]) op.selected = true; se.appendChild(op); });
    se.addEventListener('change', function () { War.skill = +se.value; Game.save(); });
    sk.appendChild(lab); sk.appendChild(se); body.appendChild(sk);
    var fg = h('label', 'check'), fc = document.createElement('input'); fc.type = 'checkbox'; fc.id = 'fog-toggle'; fc.checked = War.fog;
    fc.addEventListener('change', function () { War.fog = fc.checked; Game.save(); MapView.redraw(); UI.refresh(); });
    fg.appendChild(fc); fg.appendChild(document.createTextNode(' Fog of war: hide enemy armies you cannot see')); body.appendChild(fg);

    body.appendChild(h('h3', 'p-sub', 'News'));
    var log = War.log.slice(-14).reverse();
    if (!log.length) body.appendChild(h('p', 'note', 'Nothing to report yet.'));
    else { var nl = h('ul', 'news'); log.forEach(function (e) { var li = h('li'); li.appendChild(h('span', 'when', e.date || '')); li.appendChild(h('span', null, e.text)); nl.appendChild(li); }); body.appendChild(nl); }
    if (window.MilUI) window.MilUI.armySection(body, tag, mine);
  }

  // ---------- army counters: where they sit, so drawing and clicking agree ----------
  // what the player can see: in fog, foreign stacks vanish where nothing is known and show as '?' on the edge of sight
  function visibleAt() {
    var at = War.at, pl = Game.player; if (!War.fog || !pl) return at;
    var vis = War.visibility(pl), out = {};
    for (var id in at) {
      if (vis[id]) { out[id] = at[id]; continue; }
      var l = at[id].filter(function (d) { return War.allied(pl, d.tag); }); if (l.length) out[id] = l;
    }
    return out;
  }
  function stackGroups(stack) {
    var groups = {}, order = [], pl = Game.player, dim = stack.length && War.seen(stack[0].prov) < 2;
    for (var i = 0; i < stack.length; i++) {
      var d = stack[i], g = groups[d.tag];
      if (!g) { g = groups[d.tag] = { tag: d.tag, n: 0, str: 0, org: 0, to: null, prog: 0, sel: false, army: undefined, fog: dim && !War.allied(pl, d.tag), inf: 0, cav: 0, art: 0 }; order.push(g); }
      g.n++; g[d.type] = (g[d.type] || 0) + 1; g.str += d.str; g.org += d.org; if (sel[d.id] && d.tag === Game.player) g.sel = true;
      if (d.path.length && g.to === null) { g.to = d.path[0].to; g.prog = d.prog / War.legDays(d, d.prov, d.path[0]); g.sea = d.path[0].sea; g.fight = d.battle !== null; }
    }
    return order;
  }
  function counterRects(p, k, X, Y, n) {
    var big = k >= 1.1, out = [];
    if (!big && (k < 0.62 || p.r * k < 4.5)) { for (var i = 0; i < n; i++) out.push({ x: X - 3 + i * 5 - (n - 1) * 2.5, y: Y - 9, w: 5, h: 5, pip: true }); return out; }
    var w = big ? 36 : 27, ht = big ? 16 : 12, x0 = X - (n * (w + 2) - 2) / 2;
    for (i = 0; i < n; i++) out.push({ x: x0 + i * (w + 2), y: Y - (big ? 26 : 18), w: w, h: ht, big: big });
    return out;
  }
  // which army counter (if any) is under this point of the stage?
  function counterAt(sx, sy) {
    var v = MapView.view(), at = visibleAt();
    for (var id in at) {
      var p = Game.provinces[id], X = p.x * v.k + v.tx, Y = p.y * v.k + v.ty;
      if (Math.abs(sx - X) > 110 || sy < Y - 34 || sy > Y + 4) continue;
      var groups = stackGroups(at[id]), rects = counterRects(p, v.k, X, Y, groups.length);
      for (var i = 0; i < rects.length; i++) { var r = rects[i], pad = r.pip ? 3 : 1; if (sx >= r.x - pad && sx <= r.x + r.w + pad && sy >= r.y - pad && sy <= r.y + r.h + pad + 3) return { prov: +id, tag: groups[i].tag }; }
    }
    return null;
  }

  // ---------- drawing on the map ----------
  function arrow(c, x0, y0, x1, y1, color, live) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 8) return;
    // a gentle curve, bowed to one side like a staff officer's pencil, tapering from tail to head
    var px = -dy / len, py = dx / len, bow = Math.min(60, len * 0.18), cx = (x0 + x1) / 2 + px * bow, cy = (y0 + y1) / 2 + py * bow;
    var head = Math.min(26, len * 0.32), N = 18, L = [], R = [], i, t, x, y, tx, ty, tl, w;
    function at(t) { var u = 1 - t; return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]; }
    function tan(t) { var u = 1 - t; return [2 * u * (cx - x0) + 2 * t * (x1 - cx), 2 * u * (cy - y0) + 2 * t * (y1 - cy)]; }
    // where the head starts: walk back along the curve by the head's length
    var tEnd = 1 - head / len * 1.05;
    for (i = 0; i <= N; i++) {
      t = tEnd * i / N; var q = at(t), g = tan(t); tl = Math.hypot(g[0], g[1]) || 1; tx = -g[1] / tl; ty = g[0] / tl; w = 2.5 + 5 * (i / N);
      L.push([q[0] + tx * w, q[1] + ty * w]); R.push([q[0] - tx * w, q[1] - ty * w]);
    }
    var hb = at(tEnd), hg = tan(tEnd), hl = Math.hypot(hg[0], hg[1]) || 1, hx = -hg[1] / hl, hy = hg[0] / hl, hw = 15;
    c.beginPath(); c.moveTo(L[0][0], L[0][1]);
    for (i = 1; i < L.length; i++) c.lineTo(L[i][0], L[i][1]);
    c.lineTo(hb[0] + hx * hw, hb[1] + hy * hw); c.lineTo(x1, y1); c.lineTo(hb[0] - hx * hw, hb[1] - hy * hw);
    for (i = R.length - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
    c.closePath();
    var gr = c.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.35)');
    c.globalAlpha = live ? 0.88 : 0.45; c.fillStyle = color; c.fill(); c.fillStyle = gr; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = '#14100a'; c.lineWidth = 1.6; if (!live) c.setLineDash([6, 4]); c.stroke(); c.setLineDash([]);
  }
  // counters glide toward where the march has got to, rather than jumping a day at a time
  var slide = {};
  function glide(key, x, y) {
    var s = slide[key]; if (!s) { if (Object.keys(slide).length > 400) slide = {}; slide[key] = { x: x, y: y, t: Date.now() }; return [x, y]; }
    s.t = Date.now(); var dx = x - s.x, dy = y - s.y;
    if (Math.abs(dx) + Math.abs(dy) > 120) { s.x = x; s.y = y; return [x, y]; }
    s.x += dx * 0.3; s.y += dy * 0.3; if (Math.abs(dx) + Math.abs(dy) > 0.6) window.__mapAnim = true; else { s.x = x; s.y = y; }
    return [s.x, s.y];
  }
  function smoke(c, X, Y, r, seed) {
    var now = Date.now() / 1000;
    for (var i = 0; i < 7; i++) {
      var ph = (now * 0.35 + i / 7 + seed * 0.13) % 1, ang = i * 2.4 + seed, d = r * (0.6 + ph * 1.6);
      var x = X + Math.cos(ang) * d * 0.8, y = Y - ph * r * 2.2 + Math.sin(ang) * d * 0.35, rad = r * (0.35 + ph * 0.9);
      c.fillStyle = 'rgba(214,208,196,' + (0.6 * (1 - ph)).toFixed(3) + ')'; c.beginPath(); c.arc(x, y, rad, 0, 6.2832); c.fill();
    }
    window.__mapAnim = true;
  }
  function paint(c, v) {
    var provs = Game.provinces, pl = Game.player, at = visibleAt(), k = v.k, big = k >= 1.1, i;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineCap = 'round';

    // front lines and offensive arrows of the player's armies
    if (pl) myArmies().forEach(function (a) {
      if (!a.front) return;
      var key = War.ctrlVersion + '|' + a.front.type + '|' + (a.front.foe || a.front.provs.join(','));
      if (a._key !== key || !a._path) {
        var fr = War.frontOf(a), inF = {}; fr.forEach(function (id) { inF[id] = 1; }); a._fr = fr;
        a._path = a.front.type === 'border' ? MapView.borderPath(function (x, y) { return inF[x] && provs[y].ctrl === a.front.foe; }) : MapView.borderPath(function (x, y) { return inF[x] && !inF[y]; });
        a._key = key;
      }
      var col = armyColor(a), on = a.id === activeArmy;
      v.world();
      c.strokeStyle = '#14100a'; c.lineWidth = (on ? 8 : 6) / k; c.stroke(a._path);
      c.strokeStyle = col; c.lineWidth = (on ? 5 : 3.5) / k; if (a.front.type === 'line') c.setLineDash([8 / k, 6 / k]); c.stroke(a._path); c.setLineDash([]);
      v.screen();
      if (a.front.type !== 'border') a._fr.forEach(function (id) { var p = provs[id]; c.fillStyle = col; c.strokeStyle = '#14100a'; c.lineWidth = 1; c.beginPath(); if (a.front.type === 'garrison') c.rect(v.sx(p.x) - 4, v.sy(p.y) - 4, 8, 8); else c.arc(v.sx(p.x), v.sy(p.y), 3.5, 0, 6.2832); c.fill(); c.stroke(); });
      War.fixArmy(a);
      if (a.fallback && a.fallback.length) {
        var fk = War.ctrlVersion + '|' + a.fallback.join(',');
        if (a._fkey !== fk) { var inB = {}; a.fallback.forEach(function (id) { inB[id] = 1; }); a._fpath = MapView.borderPath(function (x, y) { return inB[x] && !inB[y]; }); a._fkey = fk; }
        v.world(); c.strokeStyle = col; c.globalAlpha = 0.55; c.lineWidth = 2.5 / k; c.setLineDash([3 / k, 5 / k]); c.stroke(a._fpath); c.setLineDash([]); c.globalAlpha = 1; v.screen();
      }
      a.targets.forEach(function (tid, ti) {
        var t = provs[tid], from = null, bd = 1e18, sp = a.spears && a.spears[ti];
        if (sp !== undefined && sp >= 0 && provs[sp]) from = provs[sp];
        else (a._fr || []).forEach(function (id) { var p = provs[id], d = (p.x - t.x) * (p.x - t.x) + (p.y - t.y) * (p.y - t.y); if (d < bd) { bd = d; from = p; } });
        if (from) arrow(c, v.sx(from.x), v.sy(from.y), v.sx(t.x), v.sy(t.y), col, a.exec);
      });
    });

    // routes of the selected divisions
    var chosen = picked();
    if (chosen.length) {
      c.strokeStyle = '#f2ead6'; c.lineWidth = 2; c.setLineDash([6, 5]);
      var drawn = {};
      chosen.forEach(function (d) {
        if (!d.path.length) return; var key2 = d.prov + '>' + d.path[d.path.length - 1].to; if (drawn[key2]) return; drawn[key2] = 1;
        var p = provs[d.prov]; c.beginPath(); c.moveTo(v.sx(p.x), v.sy(p.y));
        d.path.forEach(function (leg) { var q = provs[leg.to]; c.lineTo(v.sx(q.x), v.sy(q.y)); });
        c.stroke();
      });
      c.setLineDash([]);
    }

    var divArmy = {}; if (pl) myArmies().forEach(function (a) { a.divs.forEach(function (id) { divArmy[id] = a; }); });
    for (var id in at) {
      var p = provs[id]; if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      var groups = stackGroups(at[id]), X = v.sx(p.x), Y = v.sy(p.y), rects = counterRects(p, k, X, Y, groups.length);
      for (i = 0; i < groups.length; i++) {
        var g = groups[i], r = rects[i], col = Game.nations[g.tag].color;
        if (g.to !== null && !g.fog && !g.fight && !r.pip) { var q0 = provs[g.to], f0 = Math.min(0.8, g.prog), gx = (v.sx(q0.x) - X) * f0, gy = (v.sy(q0.y) - Y) * f0, gl = glide(id + ':' + g.tag, gx, gy); r = { x: r.x + gl[0], y: r.y + gl[1], w: r.w, h: r.h, big: r.big }; }
        else if (slide[id + ':' + g.tag]) { var gl2 = glide(id + ':' + g.tag, 0, 0); r = { x: r.x + gl2[0], y: r.y + gl2[1], w: r.w, h: r.h, big: r.big, pip: r.pip }; }
        if (r.pip) { c.fillStyle = col; c.strokeStyle = g.sel ? '#fff' : '#111'; c.lineWidth = g.sel ? 2 : 1; c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.fill(); c.stroke(); continue; }
        if (g.to !== null && !g.fog) { // marching: a line toward the next province, with a dot for how far along
          var q = provs[g.to], tx = v.sx(q.x), ty = v.sy(q.y);
          c.strokeStyle = g.fight ? '#b3261e' : 'rgba(20,14,8,0.75)'; c.lineWidth = g.fight ? 2.5 : 1.5; if (g.sea) c.setLineDash([3, 4]);
          c.beginPath(); c.moveTo(X, Y); c.lineTo(tx, ty); c.stroke(); c.setLineDash([]);
          c.fillStyle = col; c.strokeStyle = '#111'; c.lineWidth = 1; c.beginPath(); c.arc(X + (tx - X) * g.prog, Y + (ty - Y) * g.prog, 3, 0, 6.2832); c.fill(); c.stroke();
        }
        if (g.sel) { c.strokeStyle = '#fff'; c.lineWidth = 4; c.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 5); }
        // the counter: a shadow, the nation's colour, a unit symbol for the main arm, and the number of divisions
        c.fillStyle = 'rgba(10,8,5,0.35)'; c.fillRect(r.x + 1.5, r.y + 2, r.w, r.h + 3);
        c.fillStyle = col; c.strokeStyle = g.tag === pl ? '#d0a94f' : pl && War.atWar(pl, g.tag) ? (window.Visuals && Visuals.cb() ? '#e07b00' : '#b3261e') : '#14100a'; c.lineWidth = g.tag === pl ? 2 : 1.2;
        c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.fill(); c.stroke();
        var sb = r.h - 4, sx0 = r.x + 2, sy0 = r.y + 2, ink = lum(col) < 0.5 ? '#fff' : '#111';
        c.fillStyle = 'rgba(242,234,214,0.92)'; c.fillRect(sx0, sy0, sb * 1.35, sb);
        if (!g.fog) {
          var main = g.cav > g.inf && g.cav >= g.art ? 'cav' : g.art > g.inf ? 'art' : 'inf';
          c.strokeStyle = '#1b1408'; c.fillStyle = '#1b1408'; c.lineWidth = r.big ? 1.3 : 1; c.beginPath();
          if (main === 'inf' || main === 'cav') { c.moveTo(sx0 + 1, sy0 + sb - 1); c.lineTo(sx0 + sb * 1.35 - 1, sy0 + 1); }
          if (main === 'inf') { c.moveTo(sx0 + 1, sy0 + 1); c.lineTo(sx0 + sb * 1.35 - 1, sy0 + sb - 1); }
          c.stroke();
          if (main === 'art') { c.beginPath(); c.arc(sx0 + sb * 0.675, sy0 + sb / 2, sb * 0.26, 0, 6.2832); c.fill(); }
          if (g.inf && g.cav && main === 'inf') { c.fillRect(sx0 + sb * 1.35 - 3, sy0 + 1, 2, 2); }   // a few horse with the foot
        }
        c.fillStyle = ink; c.font = '700 ' + (r.big ? 11 : 9) + 'px system-ui, sans-serif'; c.fillText(g.fog ? '?' : String(g.n), r.x + sb * 1.35 + 2 + (r.w - sb * 1.35 - 2) / 2, r.y + r.h / 2 + 0.5);
        if (g.fog) continue;
        c.fillStyle = '#14100a'; c.fillRect(r.x, r.y + r.h, r.w, 3); c.fillStyle = window.Visuals && Visuals.cb() ? '#5aa0e0' : '#7fc46a'; c.fillRect(r.x, r.y + r.h, r.w * g.str / g.n, 1.5); c.fillStyle = '#e3c15a'; c.fillRect(r.x, r.y + r.h + 1.5, r.w * g.org / g.n, 1.5);
        if (g.tag === pl) { // a tab in the army's colour when the whole stack belongs to one army
          var st = at[id], one = null, same = true; for (var j = 0; j < st.length; j++) if (st[j].tag === pl) { var aa = divArmy[st[j].id] || 0; if (one === null) one = aa; else if (one !== aa) same = false; }
          if (same && one) { c.fillStyle = armyColor(one); c.fillRect(r.x, r.y - 3, r.w, 3); }
        }
      }
    }

    War.battles.forEach(function (bt) {
      var p = provs[bt.prov]; if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) return;
      var X = v.sx(p.x), Y = v.sy(p.y) + (big ? 6 : 3), r = big ? 9 : 6;
      if (k >= 0.7 && !(window.Visuals && Visuals.reduced())) smoke(c, X, Y - r, r * 1.3, bt.prov);
      // a ring split in the two sides' colours by how the fighting goes (the attacker's share runs clockwise from the top)
      var share = Math.max(0.05, Math.min(0.95, (bt.r || 1) / (1 + (bt.r || 1)))), rr = r + (big ? 4 : 3), top = -Math.PI / 2;
      c.lineWidth = big ? 3.5 : 2.5;
      c.strokeStyle = 'rgba(10,8,5,0.6)'; c.beginPath(); c.arc(X, Y, rr, 0, 6.2832); c.stroke();
      c.strokeStyle = Game.nations[bt.tag].color; c.beginPath(); c.arc(X, Y, rr, top, top + share * 6.2832); c.stroke();
      c.strokeStyle = Game.nations[p.ctrl].color; c.beginPath(); c.arc(X, Y, rr, top + share * 6.2832, top + 6.2832); c.stroke();
      c.fillStyle = '#b3261e'; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(X, Y, r, 0, 6.2832); c.fill(); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(X - r * 0.5, Y - r * 0.5); c.lineTo(X + r * 0.5, Y + r * 0.5); c.moveTo(X + r * 0.5, Y - r * 0.5); c.lineTo(X - r * 0.5, Y + r * 0.5); c.stroke();
    });
  }

  function showHelp(on) { $('help').hidden = !on; if (!on) { try { localStorage.setItem('coalition1805.help', '1'); } catch (e) { /* fine */ } } }

  function init() {
    MapView.addPainter(paint);

    // clicking a counter selects that stack; a box selects every division inside it
    Game.unitClick = function (sx, sy, add) {
      var hit = counterAt(sx, sy); if (!hit || hit.tag !== Game.player) return false;
      var list = (War.at[hit.prov] || []).filter(function (d) { return d.tag === Game.player; });
      keepSel = true; Game.select(hit.prov); keepSel = false;
      setSel(list, add); UI.refresh(); return true;
    };
    Game.on('box', function (r, o) {
      if (!Game.player) return;
      var v = MapView.view(), list = [];
      War.divs.forEach(function (d) { if (d.tag !== Game.player) return; var p = Game.provinces[d.prov], X = p.x * v.k + v.tx, Y = p.y * v.k + v.ty - 10; if (X >= r.x0 && X <= r.x1 && Y >= r.y0 - 12 && Y <= r.y1 + 12) list.push(d); });
      keepSel = true; Game.select(null); keepSel = false;
      setSel(list, o && o.shift);
    });
    Game.on('select', function (id) {
      askWar = null; if (keepSel) return;
      setSel(id === null ? [] : myDivsAt(id), false); // looking at a province takes command of your divisions there
      if (id !== null && myDivsAt(id).length) UI.refresh();
    });
    Game.on('context', function (id) { if (Game.player && picked().length) order(id, false); });

    Game.on('day', function () {
      MapView.refreshOverlay();
      var now = Date.now();
      if (now - lastBar > 900 && !Game.pick) renderBar();
      var v = UI.view();
      if (v && v.type === 'province' && now - lastRefresh > 600 && ((War.at[v.id] || []).length || War.battleAt(v.id)) && !Game.pick) {
        var a = document.activeElement; if (a && a.type === 'checkbox' && $('panel').contains(a)) return;
        lastRefresh = now; UI.refresh();
      }
    });
    Game.on('reset', function () { multi = {}; sel = {}; activeArmy = null; cancelTool(); renderBar(); MapView.refreshOverlay(); showOffers(); });
    Game.on('month', showOffers);
    Game.on('player', function () { sel = {}; activeArmy = null; cancelTool(); renderBar(); MapView.refreshOverlay(); });
    Game.on('event', function (e) {
      var pl = Game.player, d = e.data || {}, mineToo = pl && (d.a === pl || d.b === pl);
      var bigTwo = d.a && d.b && Game.nations[d.a] && Game.nations[d.b] && Game.nations[d.a].major && Game.nations[d.b].major;
      if (window.Msg && Msg.mute(e, mineToo)) { /* muted in the message settings: in the log only */ }
      else if (e.type === 'storyevent' || e.type === 'spyquiet' || e.type === 'siegequiet' || ((e.type === 'mil' || e.type === 'econ') && !mineToo && !(d.a && Game.nations[d.a] && Game.nations[d.a].major))) { /* the story's own popup; other nations' small news */ }
      else if (e.type === 'offer') showOffers();
      else if (e.type === 'battle' || e.type === 'lost' || e.type === 'ready' || e.type === 'plan') { if (mineToo) toast(e.text, e.type === 'lost' && d.a === pl ? 'bad' : ''); }
      else if (e.type === 'peace' && !mineToo && !bigTwo) { /* minor powers settling: in the news list only */ }
      else toast(e.text, e.type === 'war' || e.type === 'coalition' ? 'bad' : '');
      EconUI.refresh(false);
    });

    document.addEventListener('keydown', function (e) {
      var t = e.target, tn = t && t.tagName; if (tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'Escape') { if (!$('help').hidden) showHelp(false); else if (Game.pick || Game.paint) cancelTool(); else { activeArmy = null; setSel([], false); Game.select(null); } }
      else if (key === '?' || key === 'F1') showHelp($('help').hidden);
      else if (key >= '1' && key <= '4') Game.setSpeed(+key);
      else if (!Game.player) return;
      else if (key === 'g') newArmy();
      else if (key === 'z') frontTool();
      else if (key === 'x') offensiveTool();
      else if (key === 'v') fallbackTool();
      else if (key === 'b') garrisonTool();
      else if (key === 'e') toggleExec();
      else if (key === 'h') haltSel();
      else return;
      e.preventDefault();
    });
    $('help-btn').addEventListener('click', function () { showHelp($('help').hidden); });
    $('help-close').addEventListener('click', function () { showHelp(false); });
    $('help').addEventListener('click', function (e) { if (e.target === $('help')) showHelp(false); });
    var seen = false; try { seen = !!localStorage.getItem('coalition1805.help'); } catch (e) { /* fine */ }
    if (!seen && !window.matchMedia('(max-width: 720px)').matches) showHelp(true);
    renderBar();
  }

  window.WarUI = { init: init, provinceSection: provinceSection, nationSection: nationSection, armyTab: armyTab, picked: picked, showOffers: showOffers, renderBar: renderBar, counterAt: counterAt };
})();
