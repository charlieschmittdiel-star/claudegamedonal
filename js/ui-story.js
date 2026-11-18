// The storyline on screen: event popups with choices (the clock waits for you), and the Story journal (J) with the
// historical / unhistorical / off switch, the chapters so far, what history expects next, Napoleon and the
// Continental System.
(function () {
  'use strict';
  var h = UI.h;
  function $(id) { return document.getElementById(id); }
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function short(t) { return Game.nations[t] ? Game.nations[t].short : t; }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dateOf(day) { var y = 1805 + (243 + day) / 365, yy = Math.floor(y), m = Math.min(11, Math.floor((y - yy) * 12)); return MONTHS[m] + ' ' + yy; }
  var MODE = { historical: 'Historical', free: 'Unhistorical', off: 'Off' };
  var MODE_TIP = {
    historical: 'The other nations take history\'s choices, and the great powers leave the big wars to the story while Napoleon reigns. If the world goes another way (France loses, Russia falls) the story follows it.',
    free: 'The same events, but every nation chooses freely and wars break out as the AI sees fit. History is only a suggestion.',
    off: 'No story events at all: a pure sandbox.'
  };
  var NAP = { emperor: 'Emperor of the French, leading the armies', wounded: 'Wounded, recovering away from the army', elba: 'In exile on Elba', helena: 'Exiled to Saint Helena', dead: 'Dead' };
  var open = null;

  function modalCard(title, wide) {
    var m = $('modal'); m.innerHTML = ''; m.hidden = false; m._refresh = null;
    var card = h('div', 'modal-card' + (wide ? ' wide' : '')), head = h('div', 'drawer-head');
    head.appendChild(h('h2', null, title)); card.appendChild(head);
    var b = h('div', 'modal-body'); card.appendChild(b); m.appendChild(card);
    return { m: m, head: head, body: b };
  }
  function closeModal() { var m = $('modal'); m.hidden = true; m.innerHTML = ''; m._refresh = null; open = null; }

  // ---------- an event for the player ----------
  function showEvent() {
    var s = War.story; if (!s || !s.pending.length || !Game.player) return;
    var p = s.pending[0], e = War.storyEventById(p.id); if (!e) { s.pending.shift(); return; }
    if (open === 'event:' + e.id) return;
    open = 'event:' + e.id;
    var c = modalCard(e.title); c.m.classList.add('story-modal');
    c.body.appendChild(h('p', 'story-chapter', e.ch + ' · ' + Game.dateText()));
    c.body.appendChild(h('p', 'story-text', War.storyText(e)));
    var opts = h('div', 'story-opts'), st = War.storyOptState(e), anyOk = st.some(function (x) { return x.ok; });
    e.opts.forEach(function (o, i) {
      var x = st[i], ok = x.ok || (!anyOk && i === e.opts.length - 1);
      var b = btn('story-opt' + (o.hist && s.mode !== 'off' ? ' hist' : '') + (ok ? '' : ' blocked'), '', function () {
        if (!ok) return;
        War.storyChoose(e, i); closeModal(); Game.save(); UI.refresh(); EconUI.refresh(true); MapView.redraw(); MapView.refreshOverlay();
        if (War.story.pending.length) setTimeout(showEvent, 0); else if (Game.paused && War.story.resume) { War.story.resume = false; Game.setPaused(false); }
      });
      b.appendChild(h('span', 'story-opt-t', o.t));
      // what it does
      if (x.fx.length) { var ul = h('ul', 'story-fx'); x.fx.forEach(function (t) { ul.appendChild(h('li', null, t)); }); b.appendChild(ul); }
      // what it needs: met (✓), missing (✗, blocks the choice) or a warning (⚠, does not block)
      if (x.need.length) {
        var rl = h('ul', 'story-req');
        x.need.forEach(function (r) { rl.appendChild(h('li', r.ok ? 'ok' : r.warn ? 'warn' : 'no', (r.ok ? '✓ ' : r.warn ? '⚠ ' : '✗ ') + r.txt)); });
        b.appendChild(rl);
      }
      if (!ok) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
      if (o.hist) b.title = 'What happened in history';
      opts.appendChild(b);
    });
    c.body.appendChild(opts);
    c.body.appendChild(h('p', 'muted small', 'The ★ choice is what happened in history. Greyed-out choices are not possible yet (✗ shows what is missing); ⚠ is a warning only. Either way, the story follows what you do.'));
  }

  // ---------- the journal ----------
  function journal() {
    var s = War.story; if (!s) return;
    open = 'journal';
    var c = modalCard('The Story of the Coalition Wars', true);
    if (window.Feel) { c.head.appendChild(btn('ghost small', 'The Gazette', function () { open = null; Feel.gazette(1); }, 'This month\'s newspaper')); c.head.appendChild(btn('ghost small', 'Diary', function () { open = null; Feel.diary(); }, 'Your diary of the war')); }
    c.head.appendChild(btn('x-btn', '×', closeModal, 'Close (Esc)'));
    var body = c.body;

    var sw = h('div', 'story-switch', null), lab = h('span', 'muted', 'Story: ');
    sw.appendChild(lab);
    ['historical', 'free', 'off'].forEach(function (m) {
      var b = btn('seg' + (s.mode === m ? ' on' : ''), MODE[m], function () { War.storyMode(m); Game.save(); journal(); }, MODE_TIP[m]);
      sw.appendChild(b);
    });
    body.appendChild(sw);
    body.appendChild(h('p', 'muted small', MODE_TIP[s.mode]));

    var grid = h('div', 'story-grid'), left = h('div'), right = h('div');
    grid.appendChild(left); grid.appendChild(right); body.appendChild(grid);

    // what history expects next
    left.appendChild(h('h3', null, 'History expects next'));
    var next = War.storyNext(8, Game.player), ul = h('ul', 'story-next');
    if (!next.length) ul.appendChild(h('li', 'muted', s.mode === 'off' ? 'The story is switched off.' : 'History has nothing more to say. The rest is yours.'));
    next.forEach(function (x) {
      var li = h('li', x.ready ? 'ready' : x.open ? 'open' : 'later');
      li.appendChild(h('b', null, x.e.title)); li.appendChild(h('span', null, ' · ' + short(x.e.who)));
      li.appendChild(h('div', 'small', x.e.expect));
      li.appendChild(h('div', 'small muted', x.wait ? 'Put off until about ' + dateOf(x.wait) : x.ready ? 'Could happen any day now' : x.open ? 'Waiting for the world to make it possible' : 'Not before ' + MONTHS[x.e.from[1] - 1] + ' ' + x.e.from[0]));
      ul.appendChild(li);
    });
    left.appendChild(ul);
    var watch = War.STORY.filter(function (e) { return e.side && s.fired[e.id] === undefined && !s.missed[e.id]; });
    if (watch.length && s.mode !== 'off') left.appendChild(h('p', 'muted small', 'Also waiting in the wings: ' + watch.map(function (e) { return e.title; }).join(', ') + '.'));

    // Napoleon and the blockade
    right.appendChild(h('h3', null, 'Napoleon'));
    var n = s.nap; right.appendChild(h('p', 'story-nap ' + n.state, NAP[n.state] + (n.state === 'wounded' && n.until ? ' (back around ' + dateOf(n.until) + ')' : '')));
    right.appendChild(h('h3', null, 'The Continental System'));
    if (!s.cs.on) right.appendChild(h('p', 'muted', 'Not proclaimed. Britain trades freely with Europe.'));
    else {
      var share = War.csShare();
      right.appendChild(h('p', null, 'Closes ' + Math.round(share * 100) + '% of Europe\'s ports to British trade, cutting about ' + Math.round(45 * share) + '% of Britain\'s trade (less what smugglers get through). Members lose some trade too, and resent it.'));
      var chips = h('div', 'chips');
      Object.keys(s.cs.members).forEach(function (t) { var b = btn('chip', short(t), function () { closeModal(); UI.showNation(t, true); }); var i = h('i'); i.style.background = Game.nations[t].color; b.insertBefore(i, b.firstChild); chips.appendChild(b); });
      right.appendChild(chips);
      var pl = Game.player;
      if (pl && pl !== 'FRA' && pl !== 'GBR') {
        if (War.inSystem(pl)) right.appendChild(btn('ghost small', 'Leave the Continental System', function () { War.csLeave(pl); Game.save(); EconUI.refresh(true); journal(); }, 'Trade with Britain again. France will not like it.'));
        else if (!War.atWar(pl, 'FRA')) right.appendChild(btn('ghost small', 'Join the Continental System', function () { War.csJoin(pl); War.goodwill.FRA && (War.goodwill.FRA[pl] = (War.goodwill.FRA[pl] || 0) + 15); Game.save(); EconUI.refresh(true); journal(); }, 'Close your ports to Britain. France will be pleased.'));
      }
    }

    // the chapters so far
    body.appendChild(h('h3', null, 'The story so far'));
    var log = h('ol', 'story-log'), lastCh = null;
    if (!s.log.length) log.appendChild(h('li', 'muted', 'Nothing yet. It is ' + Game.dateText() + ' and the War of the Third Coalition has begun.'));
    s.log.forEach(function (r) {
      var e = War.storyEventById(r.id); if (!e) return;
      if (e.ch !== lastCh) { log.appendChild(h('li', 'story-ch', e.ch)); lastCh = e.ch; }
      var li = h('li', r.hist ? 'hist' : 'alt');
      li.appendChild(h('span', 'muted small', dateOf(r.day) + ' ')); li.appendChild(h('b', null, e.title));
      li.appendChild(h('span', null, ': ' + short(r.who) + ' chose "' + r.choice + '"' + (r.hist ? '' : ' (not as in history)')));
      // what the choice did (for your own choices, and the great powers')
      if (r.fx && r.fx.length && (r.who === Game.player || (Game.nations[r.who] && Game.nations[r.who].major))) li.appendChild(h('div', 'small muted story-log-fx', '→ ' + r.fx.join(' · ')));
      log.appendChild(li);
    });
    body.appendChild(log);
    var missed = Object.keys(s.missed).map(function (id) { return War.storyEventById(id); }).filter(function (e) { return e && e.ch !== 'Another History'; });
    if (missed.length) body.appendChild(h('p', 'muted small', 'History that never happened in this world: ' + missed.map(function (e) { return e.title; }).join(', ') + '.'));
  }

  function toggleJournal() { if (open === 'journal') closeModal(); else if (!open) journal(); }

  window.StoryUI = { init: function () {
    var bar = $('outliner-btn'), b = btn('ghost', 'Story', toggleJournal, 'The storyline (J)'); b.id = 'story-btn'; bar.parentNode.insertBefore(b, bar);
    Game.on('storyevent', function () { if (!open || open === 'journal') { if (open) closeModal(); showEvent(); } });
    Game.on('event', function (e) { if (e.type === 'storyevent') { if (!Game.paused) War.story.resume = true; setTimeout(function () { if (!open || open === 'journal') { if (open) closeModal(); showEvent(); } }, 0); } });
    Game.on('reset', function () { if (open) closeModal(); });
    Game.on('day', function () { if (open === 'journal' && War.day % 7 === 0) journal(); });
    document.addEventListener('keydown', function (e) {
      var t = e.target, tn = t && t.tagName; if (tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'j' || e.key === 'J') { toggleJournal(); e.preventDefault(); }
      else if (e.key === 'Escape' && open === 'journal') closeModal();
    });
    // a modal closed some other way (another window took over) forgets what it was
    new MutationObserver(function () { if ($('modal').hidden) open = null; }).observe($('modal'), { attributes: true, attributeFilter: ['hidden'] });
  } };
})();
