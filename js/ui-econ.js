// Screens for the clock and the economy: time controls, budget / market / industry, building in provinces,
// and the population and goods map modes.
(function () {
  'use strict';
  var Game = window.Game, Econ = window.Econ, MapView = window.MapView, UI = window.UI;
  var B = Econ.BUILDINGS, GOODS = Econ.GOODS, GOOD = {};
  GOODS.forEach(function (g) { GOOD[g.id] = g; });
  var $ = function (id) { return document.getElementById(id); };
  var h = UI.h, num = UI.num;
  var tab = 'budget', confirmNew = false;

  function money(v) { return (v < 0 ? '−' : '') + 'ƒ' + num(Math.abs(Math.round(v))); }
  function qty(v) { return v >= 100 ? num(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2); }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function viewTag() {
    if (Game.player) return Game.player;
    var v = UI.view();
    if (v && v.type === 'nation') return v.tag;
    if (v && v.type === 'province') return Game.province(v.id).owner;
    return 'FRA';
  }

  // ---------- clock ----------
  function updateClock() {
    $('date').textContent = Game.dateText();
    var t = $('clock-toggle'); t.textContent = Game.paused ? '▶' : '❚❚'; t.setAttribute('aria-label', Game.paused ? 'Start the clock' : 'Pause the clock');
    t.classList.toggle('is-running', !Game.paused);
    var s = ''; for (var i = 1; i <= 4; i++) s += i <= Game.speed ? '●' : '○';
    $('clock-speed').textContent = s;
  }
  function updateChip() {
    var n = Game.player ? Econ.N[Game.player] : null;
    $('player-money').textContent = n ? money(n.treasury) : '';
  }

  // ---------- map modes ----------
  function mix(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), out = 0;
    for (var s = 16; s >= 0; s -= 8) out = (out << 8) | Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
    return '#' + ('000000' + (out >>> 0).toString(16)).slice(-6);
  }
  var DENS = [3, 12, 35, 80, 180];
  function densityColor(d) {
    var t = Math.max(0, Math.min(1, Math.log(Math.max(d, 1) / 3) / Math.log(250 / 3)));
    return t < 0.5 ? mix('#f4eed4', '#d69a45', t * 2) : mix('#d69a45', '#6e1f1a', (t - 0.5) * 2);
  }
  function density(id) { var p = Game.province(id); return Econ.P[id].pop / Math.max(p.area, 150); }
  // supply, weather and victory point map modes
  var SUP = [0, 2, 4, 8, 14, 22], VPS = [1, 3, 6, 10, 18];
  var WXC = [['Clear', '#cdbf8f'], ['Rain', '#6f8fa8'], ['Mud', '#7a5a36'], ['Snow', '#eef2f6'], ['Heat', '#d9883a']];
  function ramp(stops, cols, v) {
    for (var i = stops.length - 1; i >= 0; i--) if (v >= stops[i]) return cols[i];
    return cols[0];
  }
  function supColor(v) { return ramp(SUP, window.Visuals && Visuals.cb() ? ['#b35806', '#e08214', '#fdb863', '#d8daeb', '#8073ac', '#2d004b'] : ['#8e2a1e', '#c0562b', '#d79a3c', '#c9c35a', '#7fae52', '#3f8a4a'], v); }
  function vpColor(v) { return ramp(VPS, ['#efe6cf', '#e2c98a', '#d79a3c', '#b8612a', '#7e2b1d'], v); }
  function supplyMode(id) {
    var p = War.provs[id], tag = Game.player || p.ctrl, s = War.supply && War.supply[tag];
    if (!s) { (War.supply = War.supply || {})[tag] = s = War.supplyFor(tag); }
    return War.friendly(tag, p) ? supColor(s.cap[id]) : '#5b5650';
  }
  function weatherMode(id) {
    var w = War.weatherAt(War.provs[id]);
    return w ? WXC.filter(function (x) { return x[0] === w.name; })[0][1] : WXC[0][1];
  }
  function updateLegend(mode) {
    var el = $('legend'); el.innerHTML = ''; el.hidden = mode === 'political';
    function item(color, text) { var s = h('span'), i = h('i'); i.style.background = color; s.appendChild(i); s.appendChild(document.createTextNode(text)); el.appendChild(s); }
    if (mode === 'terrain') Object.keys(Game.terrain).forEach(function (t) { item('var(' + Game.terrain[t].css + ')', Game.terrain[t].name); });
    else if (mode === 'population') { el.appendChild(h('span', 'legend-title', 'People per km²')); DENS.forEach(function (d, i) { item(densityColor(d), (i === DENS.length - 1 ? d + '+' : String(d))); }); }
    else if (mode === 'goods') { el.appendChild(h('span', 'legend-title', 'Speciality of the land')); GOODS.forEach(function (g) { if (g.raw) item(g.color, g.name); }); }
    else if (mode === 'supply') { el.appendChild(h('span', 'legend-title', 'Supply wagons a day' + (Game.player ? ' for ' + Game.nations[Game.player].short : ''))); SUP.forEach(function (d, i) { item(supColor(d), i === SUP.length - 1 ? d + '+' : String(d)); }); item('#5b5650', 'Hostile'); }
    else if (mode === 'weather') { el.appendChild(h('span', 'legend-title', 'Weather this week')); WXC.forEach(function (w) { item(w[1], w[0]); }); }
    else if (mode === 'vp') { el.appendChild(h('span', 'legend-title', 'Victory points')); VPS.forEach(function (d, i) { item(vpColor(d), i === VPS.length - 1 ? d + '+' : String(d)); }); }
    else if (window.DiploUI) window.DiploUI.legend(mode, el, item);
  }

  // ---------- province panel ----------
  function provinceSection(id) {
    var p = Game.province(id), e = Econ.P[id], n = Econ.N[p.owner], mine = Game.player === p.owner, wrap = h('div', 'econ');
    wrap.appendChild(h('h3', 'p-sub', 'People and work'));
    var dl = h('dl', 'facts');
    function row(k, v) { dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, v)); }
    row('Population', num(Math.round(e.pop / 100) * 100));
    var land = GOOD[e.res].name + ' ' + qty(e.out);
    if (e.res !== 'grain' && e.grain > 0) land += ' · Grain ' + qty(e.grain);
    row('Land yields', Econ.month ? land + ' a month' : GOOD[e.res].name + (e.res !== 'grain' ? ' and grain' : ''));
    if (e.fworkers > 0) row('Mill hands', num(Math.round(e.fworkers / 100) * 100) + (e.staffing < 0.99 ? ' (short-handed)' : ''));
    wrap.appendChild(dl);

    var list = h('div', 'blds'), any = false;
    Object.keys(B).forEach(function (type) {
      var bd = B[type], lvl = e.b[type] || 0, q = Econ.queued(id, type);
      if (!lvl && !q && !mine) return;
      if (!lvl && !q && bd.coastal && !p.coastal) return;
      any = true;
      var r = h('div', 'bld'), name = h('div', 'bld-name');
      name.appendChild(h('strong', null, bd.name)); name.appendChild(h('span', null, bd.blurb));
      r.appendChild(name);
      r.appendChild(h('div', 'bld-lvl', lvl ? 'Level ' + lvl : '—'));
      if (mine) {
        var why = Econ.buildBlock(id, type), cost = Econ.buildCost(id, type), btn = h('button', 'bld-btn'); btn.type = 'button';
        btn.textContent = why || 'Queue · ' + num(Econ.cpCost ? Econ.cpCost(type) : 0) + ' work'; btn.disabled = !!why;
        btn.title = 'Costs about ' + money(cost) + ', paid as the builders work. See the Construction tab for the queue.';
        btn.addEventListener('click', function () { if (!Econ.build(id, type)) { Game.save(); UI.refresh(); updateChip(); refreshEconomy(true); } });
        r.appendChild(btn);
      }
      list.appendChild(r);
      if (q) list.appendChild(h('div', 'bld-q', 'In the queue: ' + bd.name + (q > 1 ? ' ×' + q : '') + ', ' + monthsLeft(id, type)));
    });
    if (any) { wrap.appendChild(h('h3', 'p-sub', mine ? 'Buildings' : 'Buildings here')); wrap.appendChild(list); }
    else wrap.appendChild(h('p', 'note', 'No mills, roads or ports of note.'));
    return wrap;
  }
  function monthsLeft(id, type) {
    var best = null; Econ.queue.forEach(function (q) { if (q.prov === id && q.type === type && (!best || q.cp / q.need > best.cp / best.need)) best = q; }); if (!best) return '';
    var eta = Econ.projectEta ? Econ.projectEta(best) : Infinity; return Math.round(best.cp / best.need * 100) + '% done' + (isFinite(eta) ? ', ' + eta + ' days left' : ', waiting for builders');
  }

  function nationFacts(dl, tag, fact) {
    var n = Econ.N[tag];
    fact(dl, 'Population', num(Math.round(n.pop / 1000) * 1000));
    fact(dl, 'Treasury', money(n.treasury));
  }

  // ---------- economy drawer ----------
  function line(tbl, label, value, cls) { var tr = h('tr', cls); tr.appendChild(h('td', null, label)); tr.appendChild(h('td', 'n', value)); tbl.appendChild(tr); }
  function slider(id, label, value, max, fmt, enabled, set) {
    var w = h('div', 'slider'), lab = h('label', null, label), out = h('output', null, fmt(value)), inp = document.createElement('input');
    lab.setAttribute('for', id); inp.type = 'range'; inp.id = id; inp.min = 0; inp.max = max; inp.step = 1; inp.value = Math.round(value * 100); inp.disabled = !enabled;
    inp.addEventListener('input', function () { var v = inp.value / 100; set(v); out.textContent = fmt(v); });
    inp.addEventListener('change', function () { Game.save(); });
    var top = h('div', 'slider-top'); top.appendChild(lab); top.appendChild(out); w.appendChild(top); w.appendChild(inp);
    return w;
  }
  function bar(label, v) {
    var w = h('div', 'bar'), t = h('div', 'bar-top'); t.appendChild(h('span', null, label)); t.appendChild(h('span', 'n', pct(Math.min(1, v))));
    var tr = h('div', 'bar-track'), f = h('div', 'bar-fill'); f.style.width = Math.round(Math.min(1, v) * 100) + '%'; if (v < 0.6) f.classList.add('low');
    tr.appendChild(f); w.appendChild(t); w.appendChild(tr); return w;
  }
  function spark(hist, base) {
    var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), w = 48, ht = 18;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + ht); svg.setAttribute('class', 'spark'); svg.setAttribute('aria-hidden', 'true');
    if (hist.length < 2) return svg;
    var lo = Math.min.apply(null, hist.concat([base])) * 0.95, hi = Math.max.apply(null, hist.concat([base])) * 1.05, pts = '';
    for (var i = 0; i < hist.length; i++) pts += (i / (hist.length - 1) * w).toFixed(1) + ',' + (ht - (hist[i] - lo) / (hi - lo) * ht).toFixed(1) + ' ';
    var bl = document.createElementNS(NS, 'line'), y = (ht - (base - lo) / (hi - lo) * ht).toFixed(1);
    bl.setAttribute('x1', 0); bl.setAttribute('x2', w); bl.setAttribute('y1', y); bl.setAttribute('y2', y); bl.setAttribute('class', 'spark-base'); svg.appendChild(bl);
    var pl = document.createElementNS(NS, 'polyline'); pl.setAttribute('points', pts.trim()); pl.setAttribute('class', 'spark-line'); svg.appendChild(pl);
    return svg;
  }

  function budgetTab(body, tag, n, mine) {
    var last = n.last || { taxRev: 0, tariffRev: 0, admin: 0, armsCost: 0, interest: 0, build: 0, balance: 0 };
    var hero = h('div', 'hero');
    var a = h('div'); a.appendChild(h('div', 'p-kicker', 'Treasury')); a.appendChild(h('div', 'big' + (n.treasury < 0 ? ' neg' : ''), money(n.treasury)));
    var b = h('div'); b.appendChild(h('div', 'p-kicker', 'Last month')); b.appendChild(h('div', 'big' + (last.balance < 0 ? ' neg' : ''), (last.balance >= 0 ? '+' : '') + money(last.balance)));
    hero.appendChild(a); hero.appendChild(b); body.appendChild(hero);
    if (!n.last) body.appendChild(h('p', 'note', 'Start the clock to see the first month\'s accounts.'));

    var tbl = h('table', 'ledger');
    line(tbl, 'Taxes', money(last.taxRev)); line(tbl, 'Tariffs on imports', money(last.tariffRev));
    line(tbl, 'Administration', money(-last.admin)); line(tbl, 'Army pay and upkeep', money(-(last.army || 0))); var navyC = (War.NV && War.NV[tag] && War.NV[tag].cost) || 0; line(tbl, 'Military production', money(-Math.max(0, (last.prodCost || 0) - navyC))); line(tbl, 'Navy: upkeep and dockyards', money(-navyC)); line(tbl, 'Arms purchases', money(-last.armsCost));
    line(tbl, 'Building and recruiting', money(-last.build)); if (last.interest > 0) line(tbl, 'Interest on debt', money(-last.interest));
    body.appendChild(tbl);

    body.appendChild(h('h3', 'p-sub', mine ? 'Policy' : 'Policy (choose this nation to change it)'));
    body.appendChild(slider('s-tax', 'Tax on incomes', n.tax, 30, pct, mine, function (v) { n.tax = v; }));
    body.appendChild(slider('s-tariff', 'Tariff on imports', n.tariff, 30, pct, mine, function (v) { n.tariff = v; }));
    body.appendChild(slider('s-arms', 'Arms purchases', n.arms, 100, pct, mine, function (v) { n.arms = v; }));
    body.appendChild(h('p', 'note', 'Higher taxes fill the treasury but leave households less to spend. Tariffs make foreign goods dearer at home. Arms purchases fill the arsenal for the armies to come.'));

    if (window.ProdUI) body.appendChild(window.ProdUI.lawsSection(tag, mine));
    body.appendChild(h('h3', 'p-sub', 'How the people live'));
    body.appendChild(bar('Food and fuel', n.sol.life)); body.appendChild(bar('Everyday goods', n.sol.daily)); body.appendChild(bar('Fine goods', n.sol.lux));
    var dl = h('dl', 'facts');
    function row(k, v) { dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, v)); }
    row('Population', num(Math.round(n.pop / 1000) * 1000));
    row('Growth', ((Math.pow(1 + (n.growth || 0), 12) - 1) * 100).toFixed(2) + '% a year');
    row('Cost of living', pct(n.pi || 1) + ' of normal');
    row('Arsenal', num(Math.round(n.stockpile.muskets)) + ' muskets · ' + num(Math.round(n.stockpile.artillery)) + ' guns · ' + num(Math.round(n.stockpile.horses)) + ' horses');
    body.appendChild(dl);

    var ng = h('div', 'newgame');
    if (!confirmNew) {
      var nb = h('button', 'ghost', 'New game'); nb.type = 'button'; nb.addEventListener('click', function () { confirmNew = true; refreshEconomy(true); }); ng.appendChild(nb);
      var dl2 = h('button', 'ghost', 'Download save'); dl2.type = 'button'; dl2.title = 'Keep a copy of this game as a file';
      dl2.addEventListener('click', function () {
        var blob = new Blob([Game.saveText()], { type: 'application/json' }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'coalition-' + Game.player + '-' + Game.date.year + '-' + Game.date.month + '.json'; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      });
      var up = h('button', 'ghost', 'Load save file'); up.type = 'button'; up.title = 'Continue a game from a downloaded save';
      up.addEventListener('click', function () {
        var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.addEventListener('change', function () {
          var f = inp.files && inp.files[0]; if (!f) return; var r = new FileReader();
          r.onload = function () { var why = Game.importSave(String(r.result)); if (why) { var t = document.getElementById('toasts'), el = h('div', 'toast bad', why); t.appendChild(el); setTimeout(function () { el.remove(); }, 5000); } else location.reload(); };
          r.readAsText(f);
        });
        inp.click();
      });
      ng.appendChild(dl2); ng.appendChild(up);
    }
    else {
      ng.appendChild(h('span', 'note', 'Start again from September 1805? This erases the save.'));
      var y = h('button', 'ghost danger', 'Erase and restart'), no = h('button', 'ghost', 'Keep playing'); y.type = no.type = 'button';
      y.addEventListener('click', function () { confirmNew = false; Game.newGame(); }); no.addEventListener('click', function () { confirmNew = false; refreshEconomy(true); });
      ng.appendChild(y); ng.appendChild(no);
    }
    body.appendChild(ng);
  }

  function marketTab(body, tag, n) {
    body.appendChild(h('p', 'note', 'Prices in florins per unit; the bar in each chart is the normal price. Made, wanted and trade are last month\'s units.'));
    var wrap = h('div', 'tbl-wrap'), tbl = h('table', 'market'), hd = h('tr');
    ['Good', 'Price', '', 'Made', 'Wanted', 'Trade'].forEach(function (t, i) { hd.appendChild(h('th', i ? 'n' : null, t)); });
    tbl.appendChild(hd);
    GOODS.forEach(function (g) {
      var tr = h('tr'), name = h('td'), dot = h('i', 'dot'); dot.style.background = g.color; name.appendChild(dot); name.appendChild(document.createTextNode(g.name));
      var rel = n.price[g.id] / g.base, pc = h('td', 'n'); pc.appendChild(document.createTextNode(n.price[g.id].toFixed(1) + ' '));
      pc.appendChild(h('span', rel > 1.15 ? 'up' : rel < 0.85 ? 'down' : 'flat', rel > 1.15 ? '▲' : rel < 0.85 ? '▼' : '•'));
      var sp = h('td'); sp.appendChild(spark(n.hist[g.id], g.base));
      var net = n.imp ? n.imp[g.id] - n.exp[g.id] : 0;
      tr.appendChild(name); tr.appendChild(pc); tr.appendChild(sp);
      tr.appendChild(h('td', 'n', n.prod && n.prod[g.id] > 0.005 ? qty(n.prod[g.id]) : '—')); tr.appendChild(h('td', 'n', n.dem && n.dem[g.id] > 0.005 ? qty(n.dem[g.id]) : '—'));
      tr.appendChild(h('td', 'n ' + (net > 0.005 ? 'imp' : net < -0.005 ? 'exp' : ''), Math.abs(net) < 0.005 ? '—' : (net > 0 ? '+' : '−') + qty(Math.abs(net))));
      tbl.appendChild(tr);
    });
    wrap.appendChild(tbl); body.appendChild(wrap);
    body.appendChild(h('p', 'note', 'Trade: + is bought abroad, − is sold abroad. A shortage pushes a price up; unsold stock pushes it down.'));
  }

  function industryTab(body, tag, n) {
    var lv = {}, q = [];
    Game.provinces.forEach(function (p) { if (p.owner !== tag) return; var b = Econ.P[p.id].b; for (var t in b) lv[t] = (lv[t] || 0) + b[t]; });
    Econ.queue.forEach(function (x) { if (Game.province(x.prov).owner === tag) q.push(x); });
    var wrap = h('div', 'tbl-wrap'), tbl = h('table', 'market'), hd = h('tr');
    ['Works', 'Levels', 'Running', 'Profit a level'].forEach(function (t, i) { hd.appendChild(h('th', i ? 'n' : null, t)); });
    tbl.appendChild(hd);
    Econ.FACTORIES.forEach(function (t) {
      var tr = h('tr'), pf = Econ.factoryProfit(tag, t);
      tr.appendChild(h('td', null, B[t].name)); tr.appendChild(h('td', 'n', String(lv[t] || 0)));
      tr.appendChild(h('td', 'n', lv[t] ? pct(n.u[t]) : '—')); tr.appendChild(h('td', 'n ' + (pf < 0 ? 'imp' : 'exp'), money(pf)));
      tbl.appendChild(tr);
    });
    wrap.appendChild(tbl); body.appendChild(wrap);
    body.appendChild(h('p', 'note', 'Roads ' + (lv.roads || 0) + ' · Improved estates ' + (lv.estates || 0) + ' · Ports ' + (lv.port || 0) + '. To build, choose your nation, then click one of your provinces.'));

    body.appendChild(h('h3', 'p-sub', 'Under construction'));
    if (!q.length) body.appendChild(h('p', 'note', 'Nothing is being built.'));
    else {
      var ul = h('ul', 'queue');
      q.sort(function (a, b) { return a.left - b.left; }).forEach(function (x) {
        var li = h('li'), b = h('button', 'chip', Game.province(x.prov).name); b.type = 'button';
        b.addEventListener('click', function () { Game.select(x.prov); MapView.focusProvince(x.prov); });
        li.appendChild(b); li.appendChild(h('span', null, B[x.type].name)); li.appendChild(h('span', 'n', x.left + ' mo'));
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }
  }

  function refreshEconomy(force) {
    var d = $('economy'); if (d.hidden) return;
    var body = $('economy-body'), act = document.activeElement;
    if (!force && act && act.type === 'range' && body.contains(act)) return; // do not yank a slider from under the player's finger
    var tag = viewTag(), n = Econ.N[tag], mine = Game.player === tag, top = body.scrollTop;
    $('economy-title').textContent = Game.nations[tag].short + (mine ? '' : ' (viewing)');
    body.innerHTML = '';
    if (tab === 'budget') budgetTab(body, tag, n, mine); else if (tab === 'politics' && window.PolUI) window.PolUI.politicsTab(body, tag, mine); else if (tab === 'finance' && window.ComUI) window.ComUI.financeTab(body, tag, mine); else if (tab === 'market') marketTab(body, tag, n); else if (tab === 'army' && window.WarUI) window.WarUI.armyTab(body, tag, mine); else if (tab === 'production' && window.ProdUI) window.ProdUI.productionTab(body, tag, mine); else if (tab === 'research' && window.ProdUI) window.ProdUI.researchTab(body, tag, mine); else if (tab === 'navy' && window.NavyUI) window.NavyUI.navyTab(body, tag, mine); else if (tab === 'ledger' && window.DiploUI) window.DiploUI.ledgerTab(body, tag, mine); else if (tab === 'training' && window.TrainUI) window.TrainUI.trainingTab(body, tag, mine); else if (tab === 'construction' && window.BuildUI) window.BuildUI.constructionTab(body, tag, mine); else industryTab(body, tag, n);
    body.scrollTop = top;
  }

  function init() {
    MapView.addMode('population', function (id) { return densityColor(density(id)); });
    MapView.addMode('goods', function (id) { return GOOD[Econ.P[id].res].color; });
    MapView.addMode('supply', supplyMode);
    MapView.addMode('weather', weatherMode);
    MapView.addMode('vp', function (id) { return vpColor(War.provs[id].vp || 1); });
    var regionPath = null, srcCache = null;
    Game.on('owner', function () { srcCache = null; });
    MapView.addPainter(function (c, v) {
      var m = MapView.mode();
      if (m === 'vp') {
        if (!regionPath) regionPath = MapView.borderPath(function (a, b) { return War.provs[a].state !== War.provs[b].state; });
        v.world(); c.strokeStyle = 'rgba(40,24,10,0.55)'; c.lineWidth = 1.6 / v.k; c.stroke(regionPath); v.screen();
        if (v.k > 0.9) { c.font = '700 10px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          War.provs.forEach(function (p) { if (p.vp < 4 || p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) return; var X = v.sx(p.x), Y = v.sy(p.y) + 10; c.fillStyle = 'rgba(20,14,8,0.8)'; c.fillRect(X - 9, Y - 6, 18, 12); c.fillStyle = '#f2ead6'; c.fillText(String(p.vp), X, Y + 0.5); }); }
      } else if (m === 'supply') {
        var tag = Game.player; if (!tag) return;
        if (!srcCache || srcCache.tag !== tag || srcCache.month !== Game.date.month) srcCache = { tag: tag, month: Game.date.month, list: War.supplySources(tag) };
        srcCache.list.forEach(function (sp) { var p = War.provs[sp[1]]; if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) return;
          var X = v.sx(p.x), Y = v.sy(p.y), r = 3 + Math.min(5, sp[0] / 4); c.fillStyle = '#f2ead6'; c.strokeStyle = '#14100a'; c.lineWidth = 1.5; c.beginPath(); c.rect(X - r, Y - r, 2 * r, 2 * r); c.fill(); c.stroke(); });
      }
    });
    Game.on('day', function () { var m = MapView.mode(); if ((m === 'supply' || m === 'weather') && War.day % 7 === 0) MapView.redraw(); });
    Game.on('player', function () { if ($('mode-select').value === 'supply') updateLegend('supply'); });
    $('mode-select').addEventListener('change', function () { var m = $('mode-select').value; MapView.setMode(m); updateLegend(m); });

    $('clock-toggle').addEventListener('click', function () { Game.setPaused(!Game.paused); });
    $('clock-slower').addEventListener('click', function () { Game.setSpeed(Game.speed - 1); });
    $('clock-faster').addEventListener('click', function () { Game.setSpeed(Game.speed + 1); });
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'Space' || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test((e.target.tagName || ''))) return;
      e.preventDefault(); Game.setPaused(!Game.paused);
    });

    $('economy-btn').addEventListener('click', function () { var d = $('economy'); d.hidden = !d.hidden; if (!d.hidden) { $('nations').hidden = true; refreshEconomy(true); } });
    $('economy-close').addEventListener('click', function () { $('economy').hidden = true; });
    $('nations-btn').addEventListener('click', function () { if (!$('nations').hidden) $('economy').hidden = true; });
    Array.prototype.forEach.call(document.querySelectorAll('#economy .tab'), function (b) {
      b.addEventListener('click', function () {
        tab = b.getAttribute('data-tab');
        Array.prototype.forEach.call(document.querySelectorAll('#economy .tab'), function (o) { o.classList.toggle('is-on', o === b); });
        $('economy-body').scrollTop = 0; refreshEconomy(true);
      });
    });

    Game.on('day', function () { $('date').textContent = Game.dateText(); });
    Game.on('clock', updateClock);
    Game.on('month', function () {
      updateChip(); refreshEconomy(false); UI.refresh();
      if (Game.date.month === 1 && MapView.mode() === 'population') MapView.redraw();
    });
    Game.on('player', function () { updateChip(); refreshEconomy(true); });
    Game.on('select', function () { if (!Game.player) refreshEconomy(true); });
    Game.on('reset', function () { updateClock(); updateChip(); refreshEconomy(true); MapView.redraw(); });
    updateClock(); updateChip(); updateLegend('political');
  }

  window.EconUI = { init: init, provinceSection: provinceSection, nationFacts: nationFacts, refresh: refreshEconomy, money: money, updateChip: updateChip, viewTag: viewTag, openTab: function (t) { tab = t; $('economy').hidden = false; $('nations').hidden = true; Array.prototype.forEach.call(document.querySelectorAll('#economy .tab'), function (o) { o.classList.toggle('is-on', o.getAttribute('data-tab') === t); }); refreshEconomy(true); } };
})();
