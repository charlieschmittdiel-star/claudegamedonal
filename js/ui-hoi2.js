// On screen: command power and generals' training on the Army tab, planned landings, the front line drawn
// where your land meets the enemy's, and five save slots.
(function () {
  'use strict';
  var h = UI.h;
  function $(id) { return document.getElementById(id); }
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function toast(text, kind) {
    var box = $('toasts'), t = h('div', 'toast' + (kind ? ' ' + kind : ''), text); box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5200);
  }
  function after(why, ok) { if (why) toast(why, 'bad'); else if (ok) toast(ok); Game.save(); EconUI.refresh(true); UI.refresh(); MapView.refreshOverlay(); }

  // ---------- the Army tab: command power, generals, landings ----------
  function commandSection(body, tag, mine) {
    body.appendChild(h('h3', 'p-sub', 'Command power: ' + Math.floor(War.cpOf(tag)) + ' of 100'));
    body.appendChild(h('p', 'muted small', '+' + War.cpGain(tag).toFixed(2) + ' a day. Spend it on army abilities (from the army bar) or on teaching your generals a new trait.'));
    if (mine) {
      var gens = War.gens.filter(function (g) { return g.tag === tag; }).sort(function (a, b) { return b.skill - a.skill; }).slice(0, 8);
      var tbl = h('table', 'ledger'), hr = h('tr'); ['General', 'Skill', 'Traits', 'Teach'].forEach(function (x) { hr.appendChild(h('th', null, x)); }); tbl.appendChild(hr);
      gens.forEach(function (g) {
        var tr = h('tr'); tr.appendChild(h('td', null, g.name)); tr.appendChild(h('td', null, String(g.skill)));
        tr.appendChild(h('td', 'small', g.traits.map(function (x) { return UNITS.TRAITS[x] ? UNITS.TRAITS[x].name : x; }).join(', ')));
        var td = h('td'), sel = document.createElement('select'); sel.className = 'pol-sel';
        var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Teach… (' + War.teachCost(g) + ')'; sel.appendChild(o0);
        War.TEACHABLE.forEach(function (k) { if (g.traits.indexOf(k) >= 0) return; var o = document.createElement('option'); o.value = k; o.textContent = UNITS.TRAITS[k].name; o.title = UNITS.TRAITS[k].blurb; sel.appendChild(o); });
        sel.addEventListener('change', function () { if (!sel.value) return; after(War.teachTrait(g, sel.value), g.name + ' learns: ' + UNITS.TRAITS[sel.value].name); });
        td.appendChild(sel); tr.appendChild(td); tbl.appendChild(tr);
      });
      body.appendChild(tbl);
    }
    var inv = War.divs.filter(function (d) { return d.tag === tag && d.inv; });
    if (inv.length) {
      body.appendChild(h('h3', 'p-sub', 'Planned landings'));
      var by = {}; inv.forEach(function (d) { (by[d.inv.to] = by[d.inv.to] || []).push(d); });
      var ul = h('ul', 'pol-list');
      Object.keys(by).forEach(function (to) {
        var ds = by[to], st = War.invasionStatus(ds[0]), li = h('li', null, Game.province(+to).name + ': ' + ds.length + ' division' + (ds.length > 1 ? 's' : '') + ' · ' + st.text + ' ');
        if (mine && st.left === 0 && !st.ok) li.appendChild(btn('ghost small danger', 'Land anyway', function () { ds.forEach(function (d) { War.launchInvasion(d, true); }); after(null, 'The landing goes in without naval supremacy'); }, 'Sail without control of the sea: convoys may be caught and sunk'));
        if (mine) li.appendChild(btn('ghost small', 'Cancel', function () { ds.forEach(function (d) { d.inv = null; }); after(null); }));
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }
  }

  // ---------- painters: planned landings and the front line ----------
  var front = { key: '', path: null };
  function frontPath() {
    var pl = Game.player; if (!pl || !window.topojson) return null;
    var key = pl + ':' + War.ctrlVersion + ':' + Object.keys(War.wars).length;
    if (front.key === key || (front.at && Date.now() - front.at < 600 && front.key.split(':')[0] === pl)) return front.path;
    front.key = key; front.path = null; front.at = Date.now();
    if (!War.atWarAny(pl)) return null;
    var P = Game.provinces;
    function side(i) { var c = P[i].ctrl; return c === pl || War.allied(pl, c) ? 1 : War.atWar(pl, c) ? -1 : 0; }
    var mesh = topojson.mesh(MAP.topology, MAP.topology.objects.provinces, function (a, b) { return a !== b && side(a.id) * side(b.id) === -1 && P[a.id].adj.indexOf(b.id) >= 0; });
    if (!mesh || !mesh.coordinates || !mesh.coordinates.length) return null;
    var p = new Path2D(); mesh.coordinates.forEach(function (line) { line.forEach(function (pt, i) { if (i) p.lineTo(pt[0], pt[1]); else p.moveTo(pt[0], pt[1]); }); });
    front.path = p; return p;
  }
  function paint(c, v) {
    var mode = MapView.mode();
    // the front line, HoI4 style: a red line where your land meets the enemy's
    if (mode !== 'timeline') {
      var fp = frontPath();
      if (fp) {
        c.save(); c.translate(v.sx(0), v.sy(0)); c.scale(v.k, v.k);
        c.lineJoin = 'round'; c.lineCap = 'round';
        c.strokeStyle = 'rgba(255,240,220,.7)'; c.lineWidth = 5 / v.k; c.stroke(fp);
        c.strokeStyle = window.Visuals && Visuals.cb() ? '#e07b00' : '#b3261e'; c.lineWidth = 2.6 / v.k; c.stroke(fp);
        c.restore();
      }
    }
    // planned landings: a dotted line from port to beach with the days to go
    var pl = Game.player; if (!pl) return; var done = {};
    War.divs.forEach(function (d) {
      if (d.tag !== pl || !d.inv) return; var k = d.inv.from + '>' + d.inv.to; if (done[k]) { done[k].n++; return; }
      var a = Game.provinces[d.inv.from], b = Game.provinces[d.inv.to], st = War.invasionStatus(d); done[k] = { a: a, b: b, st: st, n: 1 };
    });
    Object.keys(done).forEach(function (k) {
      var x = done[k], X0 = v.sx(x.a.x), Y0 = v.sy(x.a.y), X1 = v.sx(x.b.x), Y1 = v.sy(x.b.y), mx = (X0 + X1) / 2, my = (Y0 + Y1) / 2 - Math.hypot(X1 - X0, Y1 - Y0) * 0.2;
      c.save(); c.setLineDash([6, 5]); c.lineWidth = 3; c.strokeStyle = x.st.ok ? '#d0a94f' : '#9aa5ae';
      c.beginPath(); c.moveTo(X0, Y0); c.quadraticCurveTo(mx, my, X1, Y1); c.stroke(); c.setLineDash([]);
      var ang = Math.atan2(Y1 - my, X1 - mx); c.fillStyle = c.strokeStyle; c.beginPath(); c.moveTo(X1, Y1); c.lineTo(X1 - 12 * Math.cos(ang - 0.4), Y1 - 12 * Math.sin(ang - 0.4)); c.lineTo(X1 - 12 * Math.cos(ang + 0.4), Y1 - 12 * Math.sin(ang + 0.4)); c.closePath(); c.fill();
      var label = '⚓ ' + x.n + ' · ' + (x.st.left > 0 ? x.st.left + 'd' : x.st.ok ? 'sailing' : 'needs the sea');
      c.font = '600 11px system-ui, sans-serif'; var w = c.measureText(label).width + 10;
      c.fillStyle = 'rgba(20,16,10,.85)'; c.fillRect(mx - w / 2, my - 9, w, 18); c.fillStyle = '#efe6cf'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, mx, my); c.restore();
    });
  }

  // ---------- save slots ----------
  var SLOT = 'coalition1805.slot.';
  function gz(text) { if (!window.CompressionStream) return Promise.resolve('raw:' + text); return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then(function (buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return 'gz:' + btoa(s); }); }
  function ungz(data) {
    if (data.indexOf('raw:') === 0) return Promise.resolve(data.slice(4));
    var bin = atob(data.slice(3)), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  function slotInfo(i) { try { return JSON.parse(localStorage.getItem(SLOT + i + '.meta') || 'null'); } catch (e) { return null; } }
  function slots() {
    var m = $('modal'); m.innerHTML = ''; m.hidden = false; m._refresh = null;
    var card = h('div', 'modal-card'), head = h('div', 'drawer-head'); head.appendChild(h('h2', null, 'Save slots'));
    head.appendChild(btn('x-btn', '×', function () { m.hidden = true; m.innerHTML = ''; }, 'Close')); card.appendChild(head);
    var body = h('div', 'modal-body'); card.appendChild(body); m.appendChild(card);
    body.appendChild(h('p', 'note', 'Five slots besides the autosave, kept in this browser (compressed). For a copy you can move to another computer, use Download save on the Budget tab.'));
    for (var i = 1; i <= 5; i++) (function (i) {
      var info = slotInfo(i), row = h('div', 'slot');
      row.appendChild(h('b', null, 'Slot ' + i)); row.appendChild(h('span', 'small ' + (info ? '' : 'muted'), info ? info.nation + ' · ' + info.date + ' · saved ' + new Date(info.when).toLocaleString() : 'Empty'));
      var acts = h('div', 'acts');
      acts.appendChild(btn('ghost small', info ? 'Overwrite' : 'Save here', function () {
        gz(Game.saveText()).then(function (data) {
          try { localStorage.setItem(SLOT + i, data); localStorage.setItem(SLOT + i + '.meta', JSON.stringify({ nation: Game.player ? Game.nations[Game.player].name : 'Observer', date: Game.dateText(), when: Date.now(), size: data.length })); toast('Saved to slot ' + i); slots(); }
          catch (e) { toast('The browser will not store it (storage full?)', 'bad'); }
        });
      }));
      if (info) {
        acts.appendChild(btn('primary small', 'Load', function () {
          var data = localStorage.getItem(SLOT + i); if (!data) return;
          ungz(data).then(function (text) { var why = Game.importSave(text); if (why) toast(why, 'bad'); else { toast('Loading slot ' + i + '…'); setTimeout(function () { location.reload(); }, 300); } });
        }));
        acts.appendChild(btn('ghost small', 'Delete', function () { localStorage.removeItem(SLOT + i); localStorage.removeItem(SLOT + i + '.meta'); slots(); }));
      }
      row.appendChild(acts); body.appendChild(row);
    })(i);
  }

  window.Hoi2UI = { slots: slots, init: function () {
    var prevArmy = MilUI.armySection; MilUI.armySection = function (body, tag, mine) { prevArmy(body, tag, mine); commandSection(body, tag, mine); };
    MapView.addPainter(paint);
    if (window.Feel) { var prevSet = Feel.settingsSection; Feel.settingsSection = function (body) { body.appendChild(h('h3', 'p-sub', 'Saves')); body.appendChild(btn('ghost small', 'Save slots…', slots, 'Five save slots besides the autosave')); prevSet(body); }; }
    Game.on('owner', function () { front.key = ''; }); Game.on('player', function () { front.key = ''; });
    document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); slots(); } });
  } };
})();
