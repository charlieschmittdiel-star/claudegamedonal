// The Training tab: recruits and the divisions being raised, then drill, army by army.
// Layout follows the Construction tab: big tiles, cards, and tap targets of 44px.
(function () {
  'use strict';
  var h = UI.h, num = UI.num;
  function $(id) { return document.getElementById(id); }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function meter(v, cls) { var w = h('div', 'meter' + (cls ? ' ' + cls : '')), i = h('i'); i.style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%'; w.appendChild(i); return w; }
  function tile(k, v, sub) { var d = h('div', 'tile'); d.appendChild(h('div', 'tile-k', k)); d.appendChild(h('div', 'tile-v', v)); if (sub) d.appendChild(h('div', 'tile-s', sub)); return d; }
  function after() { Game.save(); UI.refresh(); EconUI.updateChip(); EconUI.refresh(true); }
  function toast(text, kind) { var box = $('toasts'), t = h('div', 'toast' + (kind ? ' ' + kind : ''), text); box.appendChild(t); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4500); }

  var chosenTpl = null;   // the template picked for the next division
  var DRILL_CAP = 0.45;   // drill stops adding experience here (see hoi.js)

  function trainingTab(body, tag, mine) {
    var m = War.M[tag], rq = War.recruits.filter(function (r) { return r.tag === tag; });
    var monthly = Math.round(Econ.N[tag].pop * 0.00035 * (1 + War.mod(tag, 'mp'))), cap = Econ.N[tag].pop * 0.03 * (1 + War.mod(tag, 'mpcap'));
    var tiles = h('div', 'tiles');
    tiles.appendChild(tile('Recruits', num(Math.round(m.manpower / 100) * 100), 'in the pool'));
    tiles.appendChild(tile('Monthly', '+' + num(Math.round(monthly / 100) * 100), 'cap ' + num(Math.round(cap / 1000) * 1000)));
    tiles.appendChild(tile('Raising', String(rq.length), rq.length === 1 ? 'division' : 'divisions'));
    body.appendChild(tiles);

    // ----- being raised -----
    body.appendChild(h('h3', 'sec-title', 'Raising now'));
    if (!rq.length) body.appendChild(h('p', 'note', 'No divisions are being raised.'));
    rq.slice().sort(function (a, b) { return a.left - b.left; }).forEach(function (r) {
      var tp = r.tpl !== undefined ? War.tplById(r.tpl) : null, name = tp ? tp.name : (War.TYPES[r.type] || { name: 'Division' }).name, total = r.total || r.left;
      var c = h('div', 'card'), top = h('div', 'card-top'), t = h('div');
      t.appendChild(h('strong', null, name));
      var where = btn('link', 'Mustering at ' + Game.province(r.prov).name, function () { Game.select(r.prov); MapView.focusProvince(r.prov); }); t.appendChild(h('div', 'note')); t.lastChild.appendChild(where);
      top.appendChild(t); c.appendChild(top);
      c.appendChild(meter(1 - r.left / total, 'brass'));
      c.appendChild(h('div', 'note', pct(1 - r.left / total) + ' · ready in ' + r.left + ' days'));
      body.appendChild(c);
    });

    if (mine) {
      var tpls = War.tpls[tag] || [];
      if (chosenTpl === null || !War.tplById(chosenTpl)) chosenTpl = tpls.length ? tpls[0].id : null;
      var box = h('div', 'raise');
      if (tpls.length > 1) {
        var row = h('div', 'chips');
        tpls.forEach(function (tp) { row.appendChild(btn('chip' + (tp.id === chosenTpl ? ' is-on' : ''), tp.name, function () { chosenTpl = tp.id; EconUI.refresh(true); })); });
        box.appendChild(row);
      }
      var go = btn('raise-btn', '+ Raise a new division', function () {
        if (chosenTpl === null) return;
        var tp = War.tplById(chosenTpl), s = War.tplStats(tp);
        Game.pick = function (id) {
          $('hint').hidden = true;
          if (id === null) return;
          var why = War.recruit(tag, tp.id, id);
          if (why) { toast(why, 'bad'); return; }
          toast(tp.name + ' is being raised at ' + Game.province(id).name); after();
        };
        var hint = $('hint'); hint.hidden = false; hint.textContent = 'Tap one of your provinces to raise ' + tp.name + ' (' + s.days + ' days, ƒ' + num(Math.round(s.money)) + ')';
        if (UI.isPhone()) $('economy').hidden = true;
      });
      box.appendChild(go);
      box.appendChild(h('p', 'note', 'Each division uses recruits, arms from the arsenal and money. Raise "Arms purchases" on the Budget tab to fill the arsenal faster.'));
      body.appendChild(box);
    }

    // ----- drill -----
    body.appendChild(h('h3', 'sec-title', 'Drill, army by army'));
    var armies = War.armies.filter(function (a) { return a.tag === tag; });
    if (!armies.length) body.appendChild(h('p', 'note', 'No armies yet. Pick some divisions on the map and press G to form one.'));
    armies.forEach(function (a) {
      War.fixArmy(a);
      var ds = a.divs.map(function (id) { for (var i = 0; i < War.divs.length; i++) if (War.divs[i].id === id) return War.divs[i]; return null; }).filter(Boolean);
      if (!ds.length) return;
      var xp = 0, home = 0; ds.forEach(function (d) { xp += d.xp || 0; if (d.battle === null && !d.path.length && Game.provinces[d.prov].owner === d.tag) home++; }); xp /= ds.length;
      var lvl = War.xpLevel(xp), c = h('div', 'card'), top = h('div', 'card-top'), t = h('div');
      t.appendChild(h('strong', null, a.name + ' · ' + ds.length));
      t.appendChild(h('div', 'note', lvl.name + (a.drill ? ' · drilling' : home === ds.length ? ' · at home' : ' · ' + home + ' of ' + ds.length + ' at home')));
      top.appendChild(t);
      if (mine) top.appendChild(btn(a.drill ? 'tgl is-on' : 'tgl', a.drill ? 'Drilling' : 'Start drill', function () { War.setDrill(a, !a.drill); after(); },
        'Divisions at home gain experience up to ' + pct(DRILL_CAP) + ', and the army learns, at a cost in gold and organisation'));
      c.appendChild(top);
      var ladder = h('div', 'ladder'), L = UNITS.XP_LEVELS, max = 0.8;
      ladder.appendChild(meter(xp / max, 'good'));
      var cap = h('i', 'cap'); cap.style.left = (DRILL_CAP / max * 100) + '%'; cap.title = 'Drill stops here'; ladder.appendChild(cap);
      c.appendChild(ladder);
      var names = h('div', 'ladder-names'); L.forEach(function (x, i) { if (!i) return; var s = h('span', xp >= x.at ? 'on' : '', x.name); s.style.left = (x.at / max * 100) + '%'; s.style.transform = i === L.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)'; names.appendChild(s); });
      c.appendChild(names);
      c.appendChild(h('div', 'note', a.drill ? 'Costs ƒ40 and a little organisation per division each day; stops at ' + pct(DRILL_CAP) + ' experience.' : 'Drill happens at home, away from the fighting.'));
      body.appendChild(c);
    });
  }

  window.TrainUI = { trainingTab: trainingTab };
})();
