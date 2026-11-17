// The feel of the game: difficulty, sound and music, the monthly Gazette, the player's diary, achievements, a
// guided tutorial, hot-seat turns for several players, observer mode, sandbox tools, mods and the end screen.
(function () {
  'use strict';
  var h = UI.h, num = UI.num;
  function $(id) { return document.getElementById(id); }
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function short(t) { return Game.nations[t] ? Game.nations[t].short : t; }
  function toast(text, kind) {
    var box = $('toasts'), t = h('div', 'toast' + (kind ? ' ' + kind : ''), text); box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5200);
  }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dateOf(day) { var y = 1805 + (243 + day) / 365, yy = Math.floor(y), m = Math.min(11, Math.floor((y - yy) * 12)); return MONTHS[m] + ' ' + yy; }
  function dayOf(day) { var y = 1805 + (243 + day) / 365, yy = Math.floor(y), frac = (y - yy) * 12, m = Math.min(11, Math.floor(frac)); return Math.max(1, Math.min(28, Math.round((frac - m) * 30) + 1)) + ' ' + MONTHS[m] + ' ' + yy; }
  var KEY = 'coalition1805.feel', F = { music: false, sfx: true, vol: 0.5, gazette: false, tutorialDone: false };
  try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); Object.keys(sv).forEach(function (k) { F[k] = sv[k]; }); } catch (e) { /* defaults */ }
  function store() { try { localStorage.setItem(KEY, JSON.stringify(F)); } catch (e) { /* not saved */ } }
  function modal(title, wide) {
    var m = $('modal'); m.innerHTML = ''; m.hidden = false; m._refresh = null;
    var card = h('div', 'modal-card' + (wide ? ' wide' : '')), head = h('div', 'drawer-head'); head.appendChild(h('h2', null, title));
    head.appendChild(btn('x-btn', '×', function () { m.hidden = true; m.innerHTML = ''; }, 'Close')); card.appendChild(head);
    var body = h('div', 'modal-body'); card.appendChild(body); m.appendChild(card); return body;
  }
  function close() { var m = $('modal'); m.hidden = true; m.innerHTML = ''; }

  // ---------- sound: drums, fife and cannon, made on the spot ----------
  var AC = null, master = null, musicOn = false, nextBar = 0, barN = 0, melody = null;
  function audio() {
    if (AC) return AC; var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    AC = new C(); master = AC.createGain(); master.gain.value = F.vol; master.connect(AC.destination); return AC;
  }
  function noise(dur) { var n = Math.floor(AC.sampleRate * dur), b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; var s = AC.createBufferSource(); s.buffer = b; return s; }
  function snare(t, v) { var s = noise(0.12), f = AC.createBiquadFilter(), g = AC.createGain(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.11); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.13); }
  function bass(t, v) { var o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.4); }
  function fife(t, freq, dur, v) {
    var o = AC.createOscillator(), o2 = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain(), g = AC.createGain(), f = AC.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'square'; o.frequency.value = freq; o2.frequency.value = freq; lfo.frequency.value = 5.5; lg.gain.value = freq * 0.008; lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    f.type = 'lowpass'; f.frequency.value = 3200; var g2 = AC.createGain(); g2.gain.value = 0.12;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.setValueAtTime(v, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(f); f.connect(master); [o, o2, lfo].forEach(function (x) { x.start(t); x.stop(t + dur + 0.05); });
  }
  // a fresh march tune each game: steps along a D major scale, phrases ending home on the tonic
  var SCALE = [587.3, 659.3, 740.0, 784.0, 880.0, 987.8, 1108.7, 1174.7, 1318.5];
  function makeMelody() {
    var seed = (War.seed || 1805) + 7, r = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }, out = [], deg = 4;
    for (var bar = 0; bar < 8; bar++) {
      var notes = [], beats = 0;
      while (beats < 4) { var len = r() < 0.55 ? 0.5 : r() < 0.7 ? 1 : 0.25; if (beats + len > 4) len = 4 - beats; deg = Math.max(0, Math.min(8, deg + [-2, -1, -1, 0, 1, 1, 2][Math.floor(r() * 7)])); notes.push([deg, len]); beats += len; }
      if (bar === 3) notes[notes.length - 1][0] = 4; if (bar === 7) notes[notes.length - 1][0] = 0;
      out.push(notes);
    }
    return out;
  }
  function musicTick() {
    if (!musicOn || !AC) return;
    var beat = 60 / 104;
    while (nextBar < AC.currentTime + 0.6) {
      var t = nextBar, phrase = melody[barN % melody.length];
      [1, 0, 0.6, 0, 1, 0.6, 0.6, 0].forEach(function (v, i) { if (v) snare(t + i * beat / 2, 0.18 * v); });
      bass(t, 0.35); bass(t + beat * 2, 0.25);
      if (barN % 16 >= 2) { var off = 0; phrase.forEach(function (n) { fife(t + off * beat, SCALE[n[0]], n[1] * beat * 0.92, 0.07); off += n[1]; }); }
      nextBar += beat * 4; barN++;
    }
    setTimeout(musicTick, 200);
  }
  function setMusic(on) { F.music = on; store(); if (!on) { musicOn = false; return; } if (!audio()) return; AC.resume(); if (musicOn) return; musicOn = true; melody = makeMelody(); barN = 0; nextBar = AC.currentTime + 0.1; musicTick(); }
  var lastBoom = 0;
  function cannon() { if (!F.sfx || !audio() || AC.state !== 'running') return; var now = AC.currentTime; if (now - lastBoom < 0.8) return; lastBoom = now; var s = noise(0.9), f = AC.createBiquadFilter(), g = AC.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, now); f.frequency.exponentialRampToValueAtTime(120, now + 0.6); g.gain.setValueAtTime(0.7, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.85); s.connect(f); f.connect(g); g.connect(master); s.start(now); s.stop(now + 0.9); bass(now, 0.6); }
  function fanfare() { if (!F.sfx || !audio() || AC.state !== 'running') return; var t = AC.currentTime + 0.02; [0, 2, 4, 7].forEach(function (d, i) { fife(t + i * 0.13, SCALE[Math.min(8, d)] / 2 * (i === 3 ? 2 : 1), i === 3 ? 0.5 : 0.12, 0.09); }); }
  function bell() { if (!F.sfx || !audio() || AC.state !== 'running') return; var t = AC.currentTime; [523, 1046, 1567].forEach(function (f0, i) { var o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f0; g.gain.setValueAtTime(0.18 / (i + 1), t); g.gain.exponentialRampToValueAtTime(0.001, t + 2.2); o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.3); }); }

  // ---------- the Gazette and the diary ----------
  var NEWS_TYPES = { war: 5, surrender: 6, story: 4, capital: 5, seabattle: 3, coalition: 4, revolution: 5, marriage: 2, faction: 1, conference: 3, gameover: 9, mil: 2, econ: 2, battle: 1, lost: 1 };
  function record(e) {
    var M = War.modes; if (!M) return;
    var w = NEWS_TYPES[e.type]; if (!w) return;
    var d = e.data || {}, big = d.a && Game.nations[d.a] && Game.nations[d.a].major || d.b && Game.nations[d.b] && Game.nations[d.b].major;
    if ((e.type === 'battle' || e.type === 'lost') && !/wins at|takes|surrenders|siege|fortress/.test(e.text)) return;
    M.news = M.news || []; M.news.push({ day: War.day, type: e.type, text: e.text, w: w + (big ? 2 : 0) + (d.a === Game.player || d.b === Game.player ? 1 : 0) });
    if (M.news.length > 500) M.news.splice(0, M.news.length - 500);
    var pl = Game.player;
    if (pl && (d.a === pl || d.b === pl) && ['war', 'surrender', 'capital', 'story', 'revolution', 'marriage', 'general', 'gameover', 'lost', 'battle', 'request', 'claim', 'conference'].indexOf(e.type) >= 0) {
      if ((e.type === 'battle' || e.type === 'lost') && !/capital|takes|surrender|fortress|siege/i.test(e.text) && Math.random() < 0.85) return;
      M.diary = M.diary || []; M.diary.push({ day: War.day, text: e.text }); if (M.diary.length > 400) M.diary.shift();
    }
  }
  var HEADS = { war: 'WAR!', surrender: 'PEACE SIGNED', story: 'FROM OUR CORRESPONDENT', capital: 'CAPITAL FALLS', seabattle: 'NEWS FROM THE FLEET', coalition: 'A NEW COALITION', revolution: 'REVOLUTION', marriage: 'A ROYAL WEDDING', conference: 'THE PEACE CONGRESS', gameover: 'THE END OF AN AGE', mil: 'FROM THE FRONT', econ: 'TRADE AND MONEY', faction: 'ALLIANCES', battle: 'BATTLE', lost: 'BATTLE' };
  function gazette(monthsBack) {
    var M = War.modes, now = War.day, from = now - 31 * (monthsBack || 1);
    var items = (M && M.news || []).filter(function (n) { return n.day >= from && n.day <= now; }).sort(function (a, b) { return b.w - a.w; });
    var body = modal('The Coalition Gazette', true); body.classList.add('gazette');
    var mast = h('div', 'gz-mast'); mast.appendChild(h('div', 'gz-title', 'The Coalition Gazette')); mast.appendChild(h('div', 'gz-sub', 'Price one sou · ' + dateOf(now) + ' · All the news of Europe, fit to print')); body.appendChild(mast);
    if (!items.length) { body.appendChild(h('p', 'gz-lead', 'A quiet month. The editors report that nothing of consequence has happened, which nobody believes.')); return; }
    var lead = items[0], la = h('div', 'gz-lead'); la.appendChild(h('div', 'gz-kicker', HEADS[lead.type] || 'NEWS')); la.appendChild(h('div', 'gz-head', lead.text)); la.appendChild(h('div', 'gz-date', dayOf(lead.day))); body.appendChild(la);
    var cols = h('div', 'gz-cols');
    items.slice(1, 13).forEach(function (n) { var c = h('div', 'gz-item'); c.appendChild(h('div', 'gz-kicker', HEADS[n.type] || 'NEWS')); c.appendChild(h('div', 'gz-text', n.text)); c.appendChild(h('div', 'gz-date', dayOf(n.day))); cols.appendChild(c); });
    body.appendChild(cols);
    var pl = Game.player; if (pl && War.pol) { var n0 = War.pol.N[pl]; body.appendChild(h('p', 'gz-foot', 'In ' + Game.nations[pl].name + ': stability ' + Math.round(n0.stab * 100) + '%, war support ' + Math.round(n0.ws * 100) + '%, treasury ' + EconUI.money(Econ.N[pl].treasury) + '.')); }
    if (F.sfx && audio() && AC.state === 'running') { var s = noise(0.25), f = AC.createBiquadFilter(), g = AC.createGain(); f.type = 'highpass'; f.frequency.value = 2500; g.gain.value = 0.06; s.connect(f); f.connect(g); g.connect(master); s.start(); }
  }
  function diary() {
    var M = War.modes, body = modal('Diary' + (Game.player ? ' of the ' + (Game.player === 'FRA' ? 'Emperor' : 'Sovereign') + ' of ' + Game.nations[Game.player].short : ''), true);
    var form = h('div', 'acts'), ta = document.createElement('textarea'); ta.className = 'diary-in'; ta.placeholder = 'Write in your diary…'; ta.rows = 2; form.appendChild(ta);
    form.appendChild(btn('ghost', 'Add entry', function () { var t = ta.value.trim(); if (!t) return; M.diary = M.diary || []; M.diary.push({ day: War.day, text: t, mine: true }); Game.save(); diary(); }));
    body.appendChild(form);
    var list = h('ol', 'diary'), last = null;
    (M.diary || []).slice().reverse().forEach(function (d) { var mo = dateOf(d.day); if (mo !== last) { list.appendChild(h('li', 'diary-month', mo)); last = mo; } list.appendChild(h('li', d.mine ? 'mine' : '', (d.mine ? '' : dayOf(d.day).split(' ')[0] + ' — ') + d.text)); });
    if (!list.children.length) list.appendChild(h('li', 'muted', 'Nothing yet. Great events will be noted here as they happen, and you can write your own thoughts.'));
    body.appendChild(list);
  }

  // ---------- achievements ----------
  var AKEY = 'coalition1805.achievements', ACH = {};
  try { ACH = JSON.parse(localStorage.getItem(AKEY) || '{}'); } catch (e) { ACH = {}; }
  function P() { return Game.player; }
  function owns(t) { var n = 0; Game.provinces.forEach(function (p) { if (p.owner === t) n++; }); return n; }
  var LIST = [
    ['austerlitz', 'Sun of Austerlitz', 'Win a battle with 15 or more divisions in it', function () { var s = War.modes.stats[P()]; return s && s.bigwon >= 1; }],
    ['veteran', 'Old Moustaches', 'Win 50 battles', function () { var s = War.modes.stats[P()]; return s && s.won >= 50; }],
    ['empire', 'The Grand Empire', 'Rule 200 provinces', function () { return owns(P()) >= 200; }],
    ['blockade', 'Nation of Shopkeepers', 'As Britain, hold ƒ1,000,000 in the treasury', function () { return P() === 'GBR' && Econ.N.GBR.treasury >= 1e6; }],
    ['continental', 'Continental System', 'As France, have twelve nations in the Continental System', function () { return P() === 'FRA' && War.story && Object.keys(War.story.cs.members).length >= 12; }],
    ['winter', 'General Winter', 'As Russia, outlast an invasion: the enemy loses 20,000 men to the winter in one month', function () { return P() === 'RUS' && War.modes.stats.RUS && War.modes.stats.RUS.winterKill; }],
    ['hundred', 'The Hundred Days', 'As France, return from Elba', function () { return P() === 'FRA' && War.story && War.story.fired.hundreddays !== undefined; }],
    ['vienna', 'Congress Dances', 'Reach the Congress of Vienna as one of the victors', function () { return War.story && War.story.fired.vienna !== undefined && P() !== 'FRA' && !War.gone[P()]; }],
    ['nelson', 'England Expects', 'Win a sea battle in which the enemy loses ten ships', function () { return (War.seaLog || []).some(function (r) { var k = r.tags.indexOf(P()); return k >= 0 && r.winner === P() && r.sunk[1 - k].length + r.taken[1 - k].length >= 10; }); }],
    ['kingmaker', 'Kingmaker', 'Make another nation your client kingdom', function () { return War.puppetsOf && War.puppetsOf(P()).length > 0; }],
    ['marriage', 'Bella gerant alii', 'Make two royal marriages', function () { return War.marriagesOf && War.marriagesOf(P()).length >= 2; }],
    ['coup', 'Fouché Would Be Proud', 'Bring down a foreign government with a coup', function () { return War.modes.stats[P()] && War.modes.stats[P()].coup; }],
    ['loans', 'Friend of the Rothschilds', 'Have three loans at once', function () { return War.loansOf && War.loansOf(P()).length >= 3; }],
    ['assignats', 'Assignats', 'Let inflation reach 40%', function () { return War.com && (War.com.infl[P()] || 0) >= 0.4; }],
    ['guard', 'The Old Guard', 'Have three Guard divisions', function () { return War.divs.filter(function (d) { return d.tag === P() && d.guard; }).length >= 3; }],
    ['guerrilla', 'Little War', 'Have five partisan bands in the field', function () { return War.divs.filter(function (d) { return d.tag === P() && d.partisan; }).length >= 5; }],
    ['marshal', 'A Baton in Every Knapsack', 'Have a general reach skill 5', function () { return War.gens.some(function (g) { return g.tag === P() && g.skill >= 5; }); }],
    ['scholar', 'Age of Reason', 'Research 45 techs', function () { return War.R && War.R[P()] && Object.keys(War.R[P()].done).length >= 45; }],
    ['colonies', 'Sun Never Sets', 'Hold ten colonies', function () { return War.coloniesOf && War.coloniesOf(P()).length >= 10; }],
    ['minor', 'David and Goliath', 'As a minor nation, make a great power yield to you', function () { var t = P(); return t && !Game.nations[t].major && War.story && Object.keys(War.story.flags).some(function (f) { var m = /^yield:(\w+):(\w+)$/.exec(f); return m && m[2] === t && Game.nations[m[1]] && Game.nations[m[1]].major; }); }],
    ['peace', 'Peace in Our Time', 'Stay at peace for five years', function () { var t = P(); if (!t) return false; var m = War.modes; if (War.atWarAny(t)) { m.peaceSince = null; return false; } if (m.peaceSince === null || m.peaceSince === undefined) m.peaceSince = War.day; return War.day - m.peaceSince >= 1825; }],
    ['unhistorical', 'Another History', 'Choose differently from history in a story event', function () { return War.story && War.story.log.some(function (l) { return l.who === P() && !l.hist; }); }],
    ['survivor', 'Still Standing', 'Reach 1830 with your nation alive', function () { return War.year() >= 1830 && !War.gone[P()]; }],
    ['conqueror', 'Master of Europe', 'Win a conquest victory', function () { return War.modes.over && War.modes.over.kind === 'conquest'; }]
  ];
  function checkAch() {
    if (!P() || !War.modes || War.modes.sandbox || War.modes.observer || War.hotseat()) return;
    LIST.forEach(function (a) {
      if (ACH[a[0]]) return; var ok = false; try { ok = a[3](); } catch (e) { ok = false; }
      if (ok) { ACH[a[0]] = { day: War.day, nation: P(), when: Date.now() }; try { localStorage.setItem(AKEY, JSON.stringify(ACH)); } catch (e) { /* not saved */ } toast('🏆 Achievement: ' + a[1] + ' — ' + a[2]); fanfare(); }
    });
  }
  function achievements() {
    var body = modal('Achievements', true), n = Object.keys(ACH).length;
    body.appendChild(h('p', 'note', n + ' of ' + LIST.length + ' won. They are kept across games in this browser. None are given while sandbox tools have been used, or in observer and hot-seat games.'));
    var g = h('div', 'ach-grid');
    LIST.forEach(function (a) { var w = ACH[a[0]], c = h('div', 'ach' + (w ? ' won' : '')); c.appendChild(h('b', null, (w ? '🏆 ' : '') + a[1])); c.appendChild(h('span', 'small', a[2])); if (w) c.appendChild(h('span', 'small muted', 'Won as ' + short(w.nation) + ', ' + dateOf(w.day))); g.appendChild(c); });
    body.appendChild(g);
  }

  // ---------- the tutorial ----------
  var STEPS = [
    [null, 'Welcome to Coalition 1805', 'Europe, September 1805. Napoleon has crowned himself Emperor, and Britain, Austria and Russia have formed the Third Coalition against him. This short tour shows you where everything is. You can leave it at any time.'],
    ['#nations-btn', 'Choose a nation', 'Open Nations and pick one, or click any province and then its nation, and press "Play as". France is the obvious choice; Prussia and Austria are harder; a minor like Bavaria or Portugal is a real challenge.'],
    ['.clock', 'The clock', 'Time stops until you start it. Space pauses and unpauses; 1 to 4 set the speed. Story events and peace conferences pause the clock for you.'],
    ['#stage', 'Your armies', 'Click (or tap) one of your division counters to pick it, then right-click a province to march there (on a phone: tap it). Z or Draw front: drag along the border to lay the front line. X adds an offensive arrow, E executes the plan, as in Hearts of Iron. Clicking land shows its country; double-click opens the province.'],
    ['#economy-btn', 'The State screen', 'Budget, Politics, Finance, Market, Industry, Construction, Army, Production, Research, Navy and Ledger all live here. Construction and Research (T) work like HoI4: queues, builders, slots and a tech tree.'],
    ['#story-btn', 'The storyline', 'History unfolds as events: Austerlitz, Tilsit, Moscow, Waterloo. The Story journal (J) shows what history expects next, and lets you switch between historical and unhistorical play.'],
    ['#mode-select', 'Map modes', 'Supply, weather, factions, resistance, opinion, claims and more. Each has a legend in the corner.'],
    ['#outliner-btn', 'The outliner', 'Your wars, armies, fleets and anything that needs your attention, in one list (O).'],
    ['#settings-btn', 'Settings', 'Difficulty, sound, colour-blind mode, hot-seat play, observer mode, sandbox tools, mods, achievements, and new games from 1809, 1812 or 1815. Good luck, and remember: the Russian winter is real.']
  ];
  var tStep = -1, tBox = null;
  function tutorial(start) {
    if (start) tStep = 0;
    if (!tBox) { tBox = h('div', 'tut'); var hi = h('div', 'tut-hi'), bub = h('div', 'tut-bub'); tBox.appendChild(hi); tBox.appendChild(bub); document.body.appendChild(tBox); tBox._hi = hi; tBox._bub = bub; }
    if (tStep < 0 || tStep >= STEPS.length) { tBox.hidden = true; F.tutorialDone = true; store(); return; }
    var s = STEPS[tStep], el = s[0] ? document.querySelector(s[0]) : null, r = el ? el.getBoundingClientRect() : null;
    tBox.hidden = false; var hi2 = tBox._hi, b = tBox._bub; b.innerHTML = '';
    if (r && r.width) { hi2.hidden = false; hi2.style.left = (r.left - 6) + 'px'; hi2.style.top = (r.top - 6) + 'px'; hi2.style.width = (r.width + 12) + 'px'; hi2.style.height = (s[0] === '#stage' ? Math.min(r.height, 300) : r.height + 12) + 'px'; }
    else hi2.hidden = true;
    b.appendChild(h('div', 'tut-n', (tStep + 1) + ' of ' + STEPS.length)); b.appendChild(h('b', null, s[1])); b.appendChild(h('p', null, s[2]));
    var row = h('div', 'acts');
    if (tStep > 0) row.appendChild(btn('ghost small', 'Back', function () { tStep--; tutorial(); }));
    row.appendChild(btn('primary small', tStep === STEPS.length - 1 ? 'Finish' : 'Next', function () { tStep++; tutorial(); }));
    row.appendChild(btn('ghost small', 'Skip the tour', function () { tStep = -1; tutorial(); }));
    b.appendChild(row);
    var bw = Math.min(360, window.innerWidth - 24), x = r && r.width ? Math.min(window.innerWidth - bw - 12, Math.max(12, r.left)) : (window.innerWidth - bw) / 2, y = r && r.width ? (r.bottom + 16 + 220 > window.innerHeight ? Math.max(60, r.top - 230) : r.bottom + 16) : window.innerHeight / 3;
    if (s[0] === '#stage') { x = (window.innerWidth - bw) / 2; y = window.innerHeight / 2 - 80; }
    b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.width = bw + 'px';
  }

  // ---------- hot-seat, observer, sandbox ----------
  function hotseatSetup() {
    var body = modal('Hot-seat: several players, one computer', true);
    body.appendChild(h('p', 'note', 'Each player takes a turn of game time, then the game stops and asks you to pass the laptop. The computer leaves every player\'s nation alone. Fog of war follows whoever is playing.'));
    var pick = {}, grid = h('div', 'chips hs-grid');
    Object.keys(Game.nations).filter(function (t) { return !War.gone[t] && owns(t) > 0; }).sort(function (a, b) { return (Game.nations[b].major ? 1 : 0) - (Game.nations[a].major ? 1 : 0) || short(a).localeCompare(short(b)); }).forEach(function (t) {
      var c = btn('chip', short(t), function () { pick[t] = !pick[t]; c.classList.toggle('on', !!pick[t]); }); var i = h('i'); i.style.background = Game.nations[t].color; c.insertBefore(i, c.firstChild); grid.appendChild(c);
    });
    body.appendChild(grid);
    var row = h('div', 'acts'), sel = document.createElement('select'); sel.className = 'pol-sel'; [[7, 'Turns of a week'], [14, 'Turns of a fortnight'], [30, 'Turns of a month'], [91, 'Turns of a season']].forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; if (o[0] === 30) op.selected = true; sel.appendChild(op); });
    row.appendChild(sel);
    row.appendChild(btn('primary', 'Start hot-seat', function () {
      var list = Object.keys(pick).filter(function (t) { return pick[t]; }); if (list.length < 2) { toast('Pick at least two nations', 'bad'); return; }
      War.setHumans(list, +sel.value); if (War.story) War.storyMode(War.story.mode); Game.setPlayer(list[0]); close(); passScreen(list[0], true);
    }));
    if (War.hotseat()) row.appendChild(btn('ghost danger', 'End hot-seat', function () { War.setHumans([], 30); close(); toast('Back to one player'); }));
    body.appendChild(row);
  }
  function passScreen(t, first) {
    Game.setPaused(true);
    var ov = $('hotseat') || h('div', 'hotseat'); ov.id = 'hotseat'; ov.innerHTML = ''; ov.hidden = false; document.body.appendChild(ov);
    var c = h('div', 'hs-card'), sw = h('i'); sw.style.background = Game.nations[t].color; c.appendChild(sw);
    c.appendChild(h('div', 'gz-kicker', first ? 'HOT-SEAT GAME' : 'TURN OVER'));
    c.appendChild(h('h2', null, 'Pass the laptop to ' + Game.nations[t].name));
    c.appendChild(h('p', 'muted', 'Your turn runs until ' + dayOf(War.day + War.modes.turnDays) + '. Nobody else should be looking.'));
    c.appendChild(btn('primary', 'I am ' + short(t) + ': begin my turn', function () { ov.hidden = true; Game.setPlayer(t); UI.refresh(); EconUI.refresh(true); MapView.redraw(); if (window.PolUI) PolUI.showRequests(); }));
    ov.appendChild(c);
  }
  function observer() {
    close(); War.modes.observer = true; if (War.hotseat()) War.setHumans([], 30);
    Game.setPlayer(null); Game.setPaused(false); toast('Observer mode: the computer plays every nation. Choose a nation any time to take over.');
  }
  function sandbox() {
    var body = modal('Sandbox tools', true);
    body.appendChild(h('p', 'note warn-inline', 'For experiments. Using any of these switches off achievements for this game.'));
    function natSel() { var s = document.createElement('select'); s.className = 'pol-sel'; Object.keys(Game.nations).filter(function (t) { return !War.gone[t]; }).sort(function (a, b) { return short(a).localeCompare(short(b)); }).forEach(function (t) { var o = document.createElement('option'); o.value = t; o.textContent = Game.nations[t].name; if (t === (Game.player || 'FRA')) o.selected = true; s.appendChild(o); }); return s; }
    var A = natSel(), B = natSel(); B.value = 'GBR';
    var r1 = h('div', 'acts wrap'); r1.appendChild(h('span', 'small muted', 'Nation')); r1.appendChild(A); r1.appendChild(h('span', 'small muted', 'and')); r1.appendChild(B); body.appendChild(r1);
    function done(t) { toast(t); Game.save(); UI.refresh(); EconUI.refresh(true); MapView.redraw(); Game.emit('owner'); }
    var r2 = h('div', 'acts wrap');
    r2.appendChild(btn('ghost small', '+ƒ100,000', function () { War.sandbox.money(A.value, 100000); done('Gold delivered'); }));
    r2.appendChild(btn('ghost small', '+100 political power', function () { War.sandbox.power(A.value, 100); done('Power granted'); }));
    r2.appendChild(btn('ghost small', 'Stability to 90%', function () { War.sandbox.stability(A.value, 0.9); done('Order restored'); }));
    r2.appendChild(btn('ghost small', 'Declare war on the second', function () { War.sandbox.war(A.value, B.value); done('War declared'); }));
    r2.appendChild(btn('ghost small', 'Make peace with the second', function () { War.sandbox.peace(A.value, B.value); done('Peace made'); }));
    r2.appendChild(btn('ghost small', 'Give it the selected province', function () { if (Game.selected === null) { toast('Select a province on the map first', 'bad'); return; } War.sandbox.owner(Game.selected, A.value); done('Province transferred'); }));
    r2.appendChild(btn('ghost small', 'Three divisions at the selected province', function () { if (Game.selected === null) { toast('Select a province on the map first', 'bad'); return; } War.sandbox.spawn(A.value, Game.selected, 3); done('Divisions raised'); }));
    r2.appendChild(btn('ghost small', War.fog ? 'Turn fog of war off' : 'Turn fog of war on', function () { War.fog = !War.fog; War.modes.sandbox = true; done('Fog of war ' + (War.fog ? 'on' : 'off')); sandbox(); }));
    body.appendChild(r2);
  }

  // ---------- the end ----------
  function endScreen() {
    var o = War.modes.over; if (!o) return;
    Game.setPaused(true);
    var body = modal(o.kind === 'defeat' ? 'Defeat' : o.kind === 'conquest' ? 'Victory' : 'The End of the Age', true);
    body.appendChild(h('p', 'story-text', o.text));
    var pl = Game.player, rank = War.ranking(), pos = pl ? rank.map(function (r) { return r.tag; }).indexOf(pl) + 1 : 0;
    if (pl) body.appendChild(h('p', 'big-line', pos ? Game.nations[pl].name + ' finishes ' + ['first', 'second', 'third', 'fourth', 'fifth'][pos - 1] + (pos > 5 ? pos + 'th' : '') + ' among the powers of Europe.' : Game.nations[pl].name + ' is no more.'));
    var tbl = h('table', 'ledger'), hr = h('tr'); ['', 'Nation', 'Score', 'Provinces'].forEach(function (x) { hr.appendChild(h('th', null, x)); }); tbl.appendChild(hr);
    rank.slice(0, 10).forEach(function (r, i) { var tr = h('tr', r.tag === pl ? 'is-me' : ''); tr.appendChild(h('td', null, String(i + 1))); tr.appendChild(h('td', null, Game.nations[r.tag].name)); tr.appendChild(h('td', null, num(r.score))); tr.appendChild(h('td', null, String(owns(r.tag)))); tbl.appendChild(tr); });
    body.appendChild(tbl);
    if (pl) {
      var s = War.modes.stats[pl] || {}, hist = War.story ? War.story.log.filter(function (l) { return l.hist; }).length : 0, alt = War.story ? War.story.log.length - hist : 0;
      body.appendChild(h('p', 'note', 'Battles won ' + (s.won || 0) + ', lost ' + (s.lost || 0) + '. History took its course in ' + hist + ' events and went another way in ' + alt + '. Napoleon ended ' + ({ emperor: 'still Emperor', wounded: 'recovering from a wound', elba: 'on Elba', helena: 'on Saint Helena', dead: 'in his grave' })[War.story ? War.story.nap.state : 'emperor'] + '.'));
    }
    var row = h('div', 'acts'); row.appendChild(btn('primary', 'Play on', function () { close(); }));
    row.appendChild(btn('ghost', 'The Gazette', function () { gazette(3); })); row.appendChild(btn('ghost', 'The diary', diary)); body.appendChild(row);
    fanfare();
  }

  // ---------- settings section (inside the settings window) ----------
  function settingsSection(body) {
    body.appendChild(h('h3', 'p-sub', 'Difficulty'));
    var row = h('div', 'diff-row');
    War.DIFFICULTY.forEach(function (d, i) { var b = btn('seg' + (War.modes.diff === i ? ' on' : ''), d.name, function () { War.setDifficulty(i); Game.save(); Visuals.settings(); }, d.blurb); row.appendChild(b); });
    body.appendChild(row); body.appendChild(h('p', 'muted small', War.DIFFICULTY[War.modes.diff].blurb));
    body.appendChild(h('h3', 'p-sub', 'Sound'));
    function tog(key, label, note, fn) { var r = h('label', 'set-row'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!F[key]; cb.addEventListener('change', function () { F[key] = cb.checked; store(); if (fn) fn(cb.checked); }); r.appendChild(cb); var t = h('span'); t.appendChild(h('b', null, label)); if (note) t.appendChild(h('span', 'muted small', ' ' + note)); r.appendChild(t); body.appendChild(r); }
    tog('music', 'Music', 'Drums and fife: a march made up fresh for each game.', setMusic);
    tog('sfx', 'Sound effects', 'Cannon for your battles, bells for peace, a fanfare for achievements.', function (on) { if (on) { audio(); AC.resume(); } });
    var vr = h('label', 'set-row'), vol = document.createElement('input'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.05; vol.value = F.vol; vol.addEventListener('input', function () { F.vol = +vol.value; store(); if (master) master.gain.value = F.vol; }); vr.appendChild(h('b', null, 'Volume')); vr.appendChild(vol); body.appendChild(vr);
    tog('gazette', 'Monthly Gazette', 'The newspaper opens on the first of each month (you can always read it from the Story journal).');
    body.appendChild(h('h3', 'p-sub', 'Ways to play'));
    var acts = h('div', 'acts wrap');
    acts.appendChild(btn('ghost small', 'Start the tutorial', function () { close(); tutorial(true); }));
    acts.appendChild(btn('ghost small', 'Achievements (' + Object.keys(ACH).length + '/' + LIST.length + ')', achievements));
    acts.appendChild(btn('ghost small', 'Hot-seat players', hotseatSetup));
    acts.appendChild(btn('ghost small', 'Observer mode', observer, 'Watch the computer play every nation'));
    acts.appendChild(btn('ghost small', 'Sandbox tools', sandbox));
    acts.appendChild(btn('ghost small', 'Score and end of game', function () { if (!War.modes.over) { War.modes.over = { kind: 'time', text: 'You call an end to the game in ' + dateOf(War.day) + '.', day: War.day }; } endScreen(); }, 'See the standings now (the game ends by itself in 1830)'));
    body.appendChild(acts);
    if (window.Mods) Mods.settingsSection(body);
  }

  window.Feel = { settingsSection: settingsSection, gazette: gazette, diary: diary, achievements: achievements, tutorial: tutorial, endScreen: endScreen, passScreen: passScreen, checkAch: checkAch, LIST: LIST, init: function () {
    Game.on('event', function (e) {
      record(e); var d = e.data || {}, pl = Game.player;
      if ((e.type === 'battle' || e.type === 'lost') && (d.a === pl || d.b === pl)) cannon();
      if (e.type === 'surrender' && (d.a === pl || d.b === pl)) bell();
      if (e.type === 'gameover') setTimeout(endScreen, 50);
      if (e.type === 'spy' && /Coup/.test(e.text) && d.a === pl) War.mstat(pl, 'coup');
      if (/Russian winter costs/.test(e.text) && pl === 'RUS' && d.a !== 'RUS') { var m = /costs [^ ]+ ([\d,]+) men/.exec(e.text); if (m && +m[1].replace(/,/g, '') >= 20000) War.mstat('RUS', 'winterKill'); }
    });
    Game.on('month', function () {
      checkAch();
      if (F.gazette && Game.player && !War.modes.observer && $('modal').hidden && !War.conference && !(War.story && War.story.pending.length)) setTimeout(function () { if ($('modal').hidden) gazette(1); }, 30);
    });
    Game.on('day', function () {
      if (War.hotseat() && Game.player && War.day - (War.modes.turnStart || 0) >= War.modes.turnDays) { var nx = War.nextHuman(); if (nx) passScreen(nx); }
    });
    Game.on('player', function () { if (Game.player) War.modes.observer = false; });
    // music needs a click first (browsers forbid sound before one)
    document.addEventListener('pointerdown', function once() { document.removeEventListener('pointerdown', once); if (F.music) setMusic(true); if (F.sfx) { audio(); if (AC) AC.resume(); } });
    // the journal gets buttons for the Gazette and the diary
    // the first visit offers the tour
    if (!F.tutorialDone) setTimeout(function () { if ($('help') && !$('help').hidden) { var hb = $('help').querySelector('.help-body'); if (hb && !hb.querySelector('.tut-offer')) { var p = h('p', 'note tut-offer'), b = btn('primary small', 'Take the guided tour', function () { $('help').hidden = true; try { localStorage.setItem('coalition1805.help', '1'); } catch (e) { /* fine */ } tutorial(true); }); p.appendChild(document.createTextNode('New to the game? ')); p.appendChild(b); hb.insertBefore(p, hb.firstChild); } } }, 400);
    window.addEventListener('resize', function () { if (tBox && !tBox.hidden) tutorial(); });
    if (War.hotseat() && Game.player) setTimeout(function () { passScreen(Game.player, false); }, 300);
  } };
})();
