// The new Hearts of Iron screens: the European tension gauge, army and navy experience with reforms, occupation
// laws, intelligence reports, the timeline of the map, and message settings with a full message log (M).
(function () {
  'use strict';
  var h = UI.h, num = UI.num;
  function $(id) { return document.getElementById(id); }
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function short(t) { return Game.nations[t] ? Game.nations[t].short : t; }
  function pct(v) { return Math.round(v * 100) + '%'; }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateOf(day) { var y = 1805 + (243 + day) / 365, yy = Math.floor(y); return MONTHS[Math.min(11, Math.floor((y - yy) * 12))] + ' ' + yy; }
  function toast(text, kind) {
    var box = $('toasts'), t = h('div', 'toast' + (kind ? ' ' + kind : ''), text); box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5200);
  }
  function after(why, ok) { if (why) toast(why, 'bad'); else if (ok) toast(ok); Game.save(); EconUI.refresh(true); UI.refresh(); }
  function modal(title, wide) {
    var m = $('modal'); m.innerHTML = ''; m.hidden = false; m._refresh = null;
    var card = h('div', 'modal-card' + (wide ? ' wide' : '')), head = h('div', 'drawer-head'); head.appendChild(h('h2', null, title));
    var x = btn('x-btn', '×', function () { m.hidden = true; m.innerHTML = ''; if (card._close) card._close(); }, 'Close'); head.appendChild(x); card.appendChild(head);
    var body = h('div', 'modal-body'); card.appendChild(body); m.appendChild(card); body._card = card; body._head = head; return body;
  }

  // ---------- tension ----------
  var chip = null;
  function tensionWord(v) { return ['Calm', 'Uneasy', 'Tense', 'On the brink', 'Total war'][Math.min(4, Math.floor(v / 25))]; }
  function updateChip() {
    if (!chip || !War.hoi) return; var v = War.tension();
    chip.textContent = '⚔ ' + Math.round(v) + '%'; chip.title = 'European tension: ' + tensionWord(v) + '. Click for what is driving it.';
    chip.className = 'ghost tension t' + Math.min(4, Math.floor(v / 25));
  }
  function tensionWindow() {
    var body = modal('European tension: ' + Math.round(War.tension()) + '%');
    var tr = h('div', 'bar-track big'), f = h('div', 'bar-fill tension-fill'); f.style.width = Math.round(War.tension()) + '%'; tr.appendChild(f); body.appendChild(tr);
    body.appendChild(h('p', 'note', 'Wars, conquests, ultimatums and annexations raise tension; peace lets it fall by about half a point a month. The higher it is, the readier nations are to ally (+1 to alliance willingness for every 5%), the faster claims are justified, and the more the small nations expect the worst.'));
    var ul = h('ul', 'pol-list');
    War.hoi.tlog.slice().reverse().forEach(function (x) { ul.appendChild(h('li', x[1] > 0 ? 'down' : 'up', dateOf(x[0]) + ': ' + x[2] + ' (' + (x[1] > 0 ? '+' : '') + x[1] + ')')); });
    if (!ul.children.length) ul.appendChild(h('li', 'muted', 'Nothing yet.'));
    body.appendChild(ul);
  }

  // ---------- army experience and reforms (on the Army and Navy tabs) ----------
  function reforms(body, tag, mine, kind) {
    var xp = War.xpOf(tag), have = War.hoi.reforms[tag] || {};
    body.appendChild(h('h3', 'p-sub', (kind === 'a' ? 'Army' : 'Navy') + ' experience: ' + Math.floor(xp[kind]) + ' · reforms'));
    body.appendChild(h('p', 'muted small', kind === 'a' ? 'Earned in battle and by drilling armies at home (the Drill order). Spend it on reforms of how your army fights.' : 'Earned in sea battles. Spend it on reforms of how your fleets fight.'));
    var g = h('div', 'adv-grid');
    Object.keys(War.REFORMS).forEach(function (id) {
      var r = War.REFORMS[id]; if (r.kind !== kind) return;
      var c = h('div', 'adv' + (have[id] ? ' on' : '')); c.appendChild(h('b', null, r.name)); c.appendChild(h('span', 'small', r.text));
      if (r.req) c.appendChild(h('span', 'small muted', 'After: ' + War.REFORMS[r.req].name));
      if (have[id]) c.appendChild(h('span', 'small muted', 'Adopted ' + dateOf(have[id])));
      else if (mine) { var why = War.reformBlock(tag, id), b = btn('ghost small', 'Adopt · ' + r.cost + ' xp', function () { after(War.adoptReform(tag, id), r.name + ' adopted'); }); b.disabled = !!why; if (why) b.title = why; c.appendChild(b); }
      g.appendChild(c);
    });
    body.appendChild(g);
  }

  // ---------- occupation laws (on the Politics tab) ----------
  function occupation(body, tag, mine) {
    var held = {}; Game.provinces.forEach(function (p, i) { var by = p.ctrl !== p.owner ? p.ctrl : (War.core[i] && War.core[i] !== p.owner ? p.owner : null), of = p.ctrl !== p.owner ? p.owner : War.core[i]; if (by === tag && of && of !== tag) held[of] = (held[of] || 0) + 1; });
    var list = Object.keys(held); if (!list.length) return;
    body.appendChild(h('h3', 'p-sub', 'Occupied lands'));
    body.appendChild(h('p', 'muted small', 'How you govern the land you hold that is not yours by right. Compliance grows where resistance is quiet; with enough of it, a collaboration government takes over. Income from occupation: ' + EconUI.money(Econ.N[tag].occInc || 0) + ' last month.'));
    var tbl = h('table', 'ledger'), hr = h('tr'); ['People of', 'Provinces', 'Compliance', 'Law'].forEach(function (x) { hr.appendChild(h('th', null, x)); }); tbl.appendChild(hr);
    list.forEach(function (n) {
      var tr = h('tr'); tr.appendChild(h('td', null, short(n))); tr.appendChild(h('td', null, String(held[n]))); tr.appendChild(h('td', null, pct(War.complianceOf(tag, n))));
      var td = h('td');
      if (mine) { var s = document.createElement('select'); s.className = 'pol-sel'; Object.keys(War.OCCLAWS).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = War.OCCLAWS[k].name; o.title = War.OCCLAWS[k].text; if (War.occLaw(tag, n) === k) o.selected = true; s.appendChild(o); }); s.addEventListener('change', function () { var why = War.setOccLaw(tag, n, s.value); if (why) { toast(why, 'bad'); s.value = War.occLaw(tag, n); } else after(null); }); td.appendChild(s); td.appendChild(h('div', 'small muted', War.OCCLAWS[War.occLaw(tag, n)].text)); }
      else td.textContent = War.OCCLAWS[War.occLaw(tag, n)].name;
      tr.appendChild(td); tbl.appendChild(tr);
    });
    body.appendChild(tbl);
  }

  // ---------- intelligence report ----------
  function report(t) {
    var pl = Game.player, e = War.estimate(pl, t), body = modal('Intelligence report: ' + Game.nations[t].name, true);
    body.appendChild(h('p', 'note', e.exact ? 'Exact figures: ' + (t === pl ? 'your own nation' : 'an ally shares everything') + '.' : 'Our estimate, ' + pct(e.intel) + ' reliable. A spy network (from the nation\'s card) narrows the ranges; at war, prisoners and deserters tell us a little.'));
    var dl = h('dl', 'facts');
    function row(k, x, money) { var f = money ? EconUI.money : num; dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, e.exact ? f(x.v) : f(x.lo) + ' – ' + f(x.hi))); }
    row('Divisions', e.divs); row('Men under arms', e.men); row('Manpower in reserve', e.manpower); row('Ships', e.ships); row('Treasury', e.treasury, true); row('Techs known', e.techs);
    if (e.best) { dl.appendChild(h('dt', null, 'Best generals')); dl.appendChild(h('dd', null, e.best.join(', ') || 'None of note')); }
    if (e.reforms) { dl.appendChild(h('dt', null, 'Army reforms')); dl.appendChild(h('dd', null, e.reforms.length ? e.reforms.join(', ') : 'None')); }
    if (War.pol && (e.exact || e.intel >= 0.25)) { dl.appendChild(h('dt', null, 'Stability / war support')); dl.appendChild(h('dd', null, pct(War.pol.N[t].stab) + ' / ' + pct(War.pol.N[t].ws))); }
    body.appendChild(dl);
    if (pl && t !== pl) {
      var me = War.estimate(pl, pl), ratio = me.men.v / Math.max(1, e.men.v);
      body.appendChild(h('p', 'big-line', ratio >= 1.5 ? 'We have the larger army, by about ' + ratio.toFixed(1) + ' to one.' : ratio <= 0.67 ? 'They outnumber us, by about ' + (1 / ratio).toFixed(1) + ' to one.' : 'Our armies are of a size.'));
    }
  }

  // ---------- timeline ----------
  var tlFrame = null, prevMode = null;
  function timeline() {
    var n = War.timelineLength(); if (!n) { toast('The timeline starts recording from the first month', 'bad'); return; }
    var body = modal('Timeline of Europe', true), card = body._card; card.classList.add('tl-card'); $('modal').classList.add('tl-modal');
    prevMode = MapView.mode(); tlFrame = n; MapView.setMode('timeline'); MapView.redraw();
    var lab = h('div', 'tl-date'), sl = document.createElement('input'); sl.type = 'range'; sl.min = 0; sl.max = n; sl.value = n; sl.className = 'tl-slider';
    function show() { tlFrame = +sl.value; var f = War.timelineAt(tlFrame); lab.textContent = f ? dateOf(f.day) : ''; tlOwners = f ? f.owners : null; MapView.redraw(); }
    sl.addEventListener('input', show);
    var play = null, pb = btn('primary small', '▶ Play', function () { if (play) { clearInterval(play); play = null; pb.textContent = '▶ Play'; return; } if (+sl.value >= n) sl.value = 0; pb.textContent = '❚❚ Pause'; play = setInterval(function () { if ($('modal').hidden) { clearInterval(play); return; } sl.value = +sl.value + 1; show(); if (+sl.value >= n) { clearInterval(play); play = null; pb.textContent = '▶ Play'; } }, 220); });
    var row = h('div', 'acts'); row.appendChild(pb); row.appendChild(sl); row.appendChild(lab); body.appendChild(row);
    body.appendChild(h('p', 'muted small', 'Every month of this game, from ' + dateOf(War.hoi.tl.day0) + '. Drag to see the map as it was.'));
    card._close = function () { if (play) clearInterval(play); $('modal').classList.remove('tl-modal'); tlOwners = null; MapView.setMode(prevMode || 'political'); MapView.redraw(); };
    show();
  }
  var tlOwners = null;
  function tlColor(i) { var o = tlOwners ? tlOwners[i] : Game.provinces[i].owner; return Game.nations[o] ? Game.nations[o].color : '#d9d0bb'; }
  function compColor(i) {
    var p = Game.provinces[i], c = War.hoi && War.hoi.comp[i];
    if (p.ctrl === p.owner && (!War.core[i] || War.core[i] === p.owner)) return '#d9d0bb';
    var t = Math.max(0, Math.min(1, c || 0)), r = Math.round(170 - 110 * t), g = Math.round(80 + 70 * t), b = Math.round(70 + 40 * t);
    return window.Visuals ? Visuals.recolor('rgb(' + r + ',' + g + ',' + b + ')') : 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // ---------- message settings and the log ----------
  var MKEY = 'coalition1805.messages', GROUPS = {
    battle: ['Battles and sieges', ['battle', 'lost', 'siegequiet', 'plan', 'ready', 'seabattle']],
    war: ['Wars and peace', ['war', 'surrender', 'peace', 'coalition', 'faction', 'conference', 'capital']],
    story: ['Story and news', ['story', 'tension', 'revolution', 'marriage', 'gameover']],
    diplo: ['Diplomacy and requests', ['request', 'guarantee', 'volunteers', 'aid', 'claim']],
    spy: ['Spies', ['spy', 'spyquiet']],
    mil: ['Armies, generals and research', ['mil', 'general', 'research']],
    econ: ['Trade, money and the sea', ['econ']]
  }, MS = {}, LOG = [];
  try { MS = JSON.parse(localStorage.getItem(MKEY) || '{}'); } catch (e) { MS = {}; }
  function groupOf(type) { for (var g in GROUPS) if (GROUPS[g][1].indexOf(type) >= 0) return g; return null; }
  window.Msg = {
    mute: function (e, mine) { if (e.type === 'offer' || e.type === 'storyevent' || e.type === 'gameover') return false; var g = groupOf(e.type), s = g && MS[g]; if (!s) return false; if (s === 'mine') return !mine; return s === 'log' || s === 'off'; },
    settings: function (body) {
      body.appendChild(h('h3', 'p-sub', 'Messages'));
      var tbl = h('table', 'ledger msg-set');
      Object.keys(GROUPS).forEach(function (g) {
        var tr = h('tr'); tr.appendChild(h('td', null, GROUPS[g][0])); var td = h('td'), s = document.createElement('select'); s.className = 'pol-sel';
        [['', 'Pop up'], ['mine', 'Only if it involves me'], ['log', 'Log only'], ['off', 'Ignore']].forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; if ((MS[g] || '') === o[0]) op.selected = true; s.appendChild(op); });
        s.addEventListener('change', function () { if (s.value) MS[g] = s.value; else delete MS[g]; try { localStorage.setItem(MKEY, JSON.stringify(MS)); } catch (e) { /* not saved */ } });
        td.appendChild(s); tr.appendChild(td); tbl.appendChild(tr);
      });
      body.appendChild(tbl);
      body.appendChild(btn('ghost small', 'Open the message log (M)', logWindow));
    }
  };
  function logWindow() {
    var body = modal('Message log', true), filt = document.createElement('select'); filt.className = 'pol-sel';
    [['', 'Everything']].concat(Object.keys(GROUPS).map(function (g) { return [g, GROUPS[g][0]]; })).concat([['me', 'Only my nation']]).forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; filt.appendChild(op); });
    var list = h('ol', 'msg-log');
    function fill() {
      list.innerHTML = ''; var f = filt.value, pl = Game.player;
      LOG.slice().reverse().forEach(function (e) {
        if (f === 'me' ? !(e.a === pl || e.b === pl) : f && groupOf(e.type) !== f) return;
        if (e.type === 'offer' || e.type === 'storyevent') return;
        var li = h('li', (e.a === pl || e.b === pl) ? 'mine' : ''); li.appendChild(h('span', 'muted small', e.date + ' ')); li.appendChild(document.createTextNode(e.text));
        if (e.prov !== undefined && e.prov !== null) { li.classList.add('go'); li.title = 'Show on the map'; li.addEventListener('click', function () { $('modal').hidden = true; Game.select(e.prov); MapView.focusProvince(e.prov); }); }
        list.appendChild(li);
      });
      if (!list.children.length) list.appendChild(h('li', 'muted', 'Nothing here yet.'));
    }
    filt.addEventListener('change', fill); body.appendChild(filt); body.appendChild(list); fill();
  }

  window.HoiUI = { report: report, timeline: timeline, logWindow: logWindow, init: function () {
    chip = btn('ghost tension', '⚔', tensionWindow); chip.id = 'tension-chip'; var dt = $('date'); dt.parentNode.insertBefore(chip, dt.nextSibling); updateChip();
    MapView.addMode('timeline', tlColor); MapView.addMode('compliance', compColor);
    var ms = $('mode-select'), op = document.createElement('option'); op.value = 'compliance'; op.textContent = 'Compliance'; ms.appendChild(op);
    var prevLegend = DiploUI.legend; DiploUI.legend = function (mode, el, item) {
      if (mode === 'compliance') { el.appendChild(h('span', 'legend-title', 'Compliance in occupied and foreign-ruled land')); item('rgb(170,80,70)', 'Defiant'); item('rgb(115,115,90)', 'Grudging'); item('rgb(60,150,110)', 'Compliant'); item('#d9d0bb', 'Not occupied'); return; }
      if (mode === 'timeline') { el.appendChild(h('span', 'legend-title', 'The map as it was')); return; }
      prevLegend(mode, el, item);
    };
    // tabs: army and navy reforms, occupation laws, timeline in the ledger, intelligence on nation cards
    var prevArmy = MilUI.armySection; MilUI.armySection = function (body, tag, mine) { prevArmy(body, tag, mine); reforms(body, tag, mine, 'a'); };
    if (window.NavyUI) { var prevNavy = NavyUI.navyTab; NavyUI.navyTab = function (body, tag, mine) { prevNavy(body, tag, mine); reforms(body, tag, mine, 'n'); }; }
    var prevPol = PolUI.politicsTab; PolUI.politicsTab = function (body, tag, mine) { prevPol(body, tag, mine); occupation(body, tag, mine); };
    var prevLedger = DiploUI.ledgerTab; DiploUI.ledgerTab = function (body, tag, mine) { var b = btn('ghost', 'Open the timeline of Europe', timeline, 'Replay the map month by month'); body.appendChild(b); prevLedger(body, tag, mine); };
    var prevNat = PolUI.nationSection; PolUI.nationSection = function (tag) { var w = prevNat(tag); if (!War.gone[tag]) w.appendChild(btn('ghost small', 'Intelligence report', function () { report(tag); })); return w; };
    if (window.Feel) { var prevSet = Feel.settingsSection; Feel.settingsSection = function (body) { prevSet(body); Msg.settings(body); }; }
    Game.on('event', function (e) {
      var d = e.data || {}; LOG.push({ type: e.type, text: e.text, a: d.a, b: d.b, prov: d.prov, date: Game.dateText() }); if (LOG.length > 400) LOG.shift();
      if (e.type === 'tension' || e.type === 'war' || e.type === 'surrender') updateChip();
    });
    Game.on('month', updateChip); Game.on('reset', function () { LOG = []; updateChip(); });
    document.addEventListener('keydown', function (e) { var t = e.target, tn = t && t.tagName; if (tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return; if (e.key === 'm' || e.key === 'M') { if ($('modal').hidden) logWindow(); else { $('modal').hidden = true; } e.preventDefault(); } });
  } };
})();
