// Trade and finance on screen: the Finance tab (colonies, bankers and loans, paper money, harvests, smuggling,
// trade agreements and tariffs, migration, privateers and press gangs), trade on each nation's card, storms on
// the map, and the most famous ships on the Navy tab.
(function () {
  'use strict';
  var h = UI.h, num = UI.num;
  function $(id) { return document.getElementById(id); }
  function btn(cls, text, fn, title) { var b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function short(t) { return Game.nations[t] ? Game.nations[t].short : t; }
  function money(v) { return EconUI.money(v); }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function toast(text, kind) {
    var box = $('toasts'), t = h('div', 'toast' + (kind ? ' ' + kind : ''), text); box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5200);
  }
  function after(why, ok) { if (why) toast(why, 'bad'); else if (ok) toast(ok); Game.save(); EconUI.refresh(true); UI.refresh(); }

  function financeTab(body, tag, mine) {
    if (!War.com) return;
    var C = War.com, E = Econ.N[tag], dl = h('dl', 'facts');
    function row(k, v) { dl.appendChild(h('dt', null, k)); var dd = h('dd'); if (typeof v === 'string') dd.textContent = v; else dd.appendChild(v); dl.appendChild(dd); }
    var cols = War.coloniesOf(tag);
    row('Colonies', cols.length ? cols.map(function (c) { return c.name + (c.home !== tag ? ' (taken from ' + short(c.home) + ')' : ''); }).join(', ') : 'None');
    if (cols.length) row('Colonial trade', money(War.colonyIncome(tag)) + ' a month' + (War.blockadeShare && War.blockadeShare(tag) > 0.05 ? ' (cut by blockade)' : '') + ((C.privCut[tag] || 0) > 0 ? ' (privateers about)' : ''));
    var h0 = C.harvest[tag]; row('This year\'s harvest', h0 ? (h0 >= 1 ? '+' : '−') + Math.abs(Math.round((h0 - 1) * 100)) + '% grain' + (h0 < 0.82 ? ' · famine' : h0 > 1.1 ? ' · bumper' : '') : 'Not yet in (decided each September)');
    var inf = C.infl[tag] || 0; row('Inflation', inf > 0.005 ? pct(inf) + ': taxes lose ' + pct(inf * 0.5) + ' of their worth, and people grumble' : 'None: the currency is sound');
    if (E.tradeInc) row('Trade agreements and tariffs', '+' + money(E.tradeInc) + ' a month');
    if (War.inSystem && War.inSystem(tag)) row('Smuggling', pct(War.smuggling(tag)) + ' of the blockade leaks through' + (C.blind[tag] ? ' (you look the other way)' : ''));
    if (tag === 'GBR' && War.story && War.story.cs.on) row('Smuggling into Europe', pct(War.smuggling('GBR')) + ' of the Continental System is evaded');
    if (C.flight[tag] > 500) row('Refugees', num(Math.round(C.flight[tag])) + ' have fled the fighting to the capital');
    if (C.emig[tag] > 500) row('Emigrants', num(Math.round(C.emig[tag])) + ' have left for the Americas');
    body.appendChild(dl);

    body.appendChild(h('h3', 'p-sub', 'Bankers and loans'));
    var L = War.loansOf(tag);
    if (L.length) { var ul = h('ul', 'pol-list'); L.forEach(function (l, i) { var li = h('li', null, l.bank + ': ' + money(l.left) + ' owed at ' + (l.rate * 100).toFixed(1) + '% a month '); if (mine) li.appendChild(btn('ghost small', 'Repay', function () { after(War.repayLoan(tag, i)); })); ul.appendChild(li); }); body.appendChild(ul); }
    if (C.credit[tag] > War.day) body.appendChild(h('p', 'note warn-inline', 'Your credit is ruined: no banker will lend until ' + Math.ceil((C.credit[tag] - War.day) / 30) + ' months from now.'));
    if (mine) {
      var why = War.loanBlock(tag), acts = h('div', 'acts wrap');
      War.BANKERS.forEach(function (b, i) { var x = btn('ghost small', b[0] + ' · ' + money(War.loanSize(tag)), function () { after(War.takeLoan(tag, i), 'A loan from ' + b[0]); }, 'Lent from ' + b[1] + ' at ' + (War.loanRate(tag) * 100).toFixed(2) + '% a month, repaid over five years. Default and no one will lend again for years.'); x.disabled = !!why; if (why) x.title = why; acts.appendChild(x); });
      var pw = War.printBlock(tag), pb = btn('ghost small', 'Print paper money', function () { after(War.printMoney(tag), 'The presses run all night'); }, pw || 'Three months of taxes at once, but +8% inflation: taxes worth less and stability lower until it wears off'); pb.disabled = !!pw; acts.appendChild(pb);
      body.appendChild(acts);
    }

    body.appendChild(h('h3', 'p-sub', 'Trade'));
    var tl = h('ul', 'pol-list');
    C.trade.forEach(function (x) { if (x[0] !== tag && x[1] !== tag) return; var o = x[0] === tag ? x[1] : x[0], li = h('li', 'up', 'Trade agreement with ' + short(o) + ' (+5% market access) '); if (mine) li.appendChild(btn('ghost small', 'End', function () { after(War.endTrade(tag, o)); })); tl.appendChild(li); });
    C.tariff.forEach(function (x) { if (x[0] === tag) { var li = h('li', null, 'Tariff war on ' + short(x[1]) + ' '); if (mine) li.appendChild(btn('ghost small', 'Lift tariffs', function () { after(War.endTariff(tag, x[1])); })); tl.appendChild(li); } else if (x[1] === tag) tl.appendChild(h('li', 'down', short(x[0]) + ' has raised tariffs against you (−5% market access)')); });
    if (!tl.children.length) tl.appendChild(h('li', 'muted', 'No agreements. Sign them, or raise tariffs, from another nation\'s card.'));
    body.appendChild(tl);

    body.appendChild(h('h3', 'p-sub', 'At sea'));
    var sea = h('dl', 'facts');
    function srow(k, v) { sea.appendChild(h('dt', null, k)); sea.appendChild(h('dd', null, v)); }
    srow('Letters of marque', C.priv[tag] ? 'Privateers sail under your flag: they take enemy merchantmen and frighten their trade' : 'None issued');
    srow('Press gangs', C.press[tag] ? 'Sailors seized in the ports: ships built and repaired 25% faster, stability −3%' : 'Crews are volunteers');
    body.appendChild(sea);
    if (mine) {
      var a2 = h('div', 'acts wrap');
      a2.appendChild(btn('ghost small', C.priv[tag] ? 'Recall the privateers' : 'Issue letters of marque', function () { C.priv[tag] = !C.priv[tag]; after(null); }));
      a2.appendChild(btn('ghost small', C.press[tag] ? 'Stop the press gangs' : 'Send out the press gangs', function () { C.press[tag] = !C.press[tag]; War.techVer++; after(null); }));
      if (War.inSystem && War.inSystem(tag) && tag !== 'FRA') a2.appendChild(btn('ghost small', C.blind[tag] ? 'Enforce the blockade' : 'Turn a blind eye to smugglers', function () { C.blind[tag] = !C.blind[tag]; after(null); Econ.refreshAccess(); }, 'More British goods slip through; France will notice'));
      body.appendChild(a2);
    }
  }

  function nationSection(tag) {
    var wrap = h('div', 'econ'), pl = Game.player; if (!War.com || !pl || pl === tag || War.gone[tag]) return wrap;
    var acts = h('div', 'pol-acts');
    if (War.tradeWith(pl, tag)) acts.appendChild(btn('ghost small', 'End the trade agreement', function () { after(War.endTrade(pl, tag)); }));
    else { var why = War.tradeBlock(pl, tag), b = btn('ghost small', 'Propose a trade agreement', function () { after(War.signTrade(pl, tag), 'Trade agreement signed with ' + short(tag)); }, why || 'Both get +5% market access and a share of each other\'s trade'); b.disabled = !!why; acts.appendChild(b); }
    if (War.tariffOn(pl, tag)) acts.appendChild(btn('ghost small', 'Lift your tariffs', function () { after(War.endTariff(pl, tag)); }));
    else if (!War.atWar(pl, tag)) acts.appendChild(btn('ghost small', 'Start a tariff war', function () { after(War.startTariff(pl, tag), 'Tariffs raised against ' + short(tag)); }, 'Their access to your market falls (and yours a little); some tariff income; they will be angry and may answer in kind'));
    if (War.tariffOn(tag, pl)) wrap.appendChild(h('p', 'note warn-inline', short(tag) + ' has tariffs on your goods.'));
    var cols = War.coloniesOf(tag); if (cols.length) wrap.appendChild(h('p', 'note', 'Colonies: ' + cols.map(function (c) { return c.name; }).join(', ')));
    wrap.appendChild(acts); return wrap;
  }

  function famousShips(body) {
    var F = (War.com && War.com.fame) || []; if (!F.length) return;
    body.appendChild(h('h3', 'p-sub', 'Famous ships'));
    var ul = h('ul', 'pol-list');
    F.slice(0, 8).forEach(function (s) { ul.appendChild(h('li', null, s.name + ' (' + short(s.tag) + ', ' + s.fleet + ') · ' + s.fame + ' fame · ' + s.bat.slice(-3).join(', '))); });
    body.appendChild(ul);
  }

  // storms drawn as dark swirls over the sea
  function paint(c, v) {
    if (!War.com) return; var S = War.com.storms, t = Date.now() / 900;
    Object.keys(S).forEach(function (k) {
      var z = War.seas[k]; if (!z) return; var X = v.sx(z.x), Y = v.sy(z.y), r = Math.max(12, 16 * v.k);
      c.save(); c.translate(X, Y); c.strokeStyle = 'rgba(40,52,70,.75)'; c.lineWidth = 2;
      for (var i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, r * (0.45 + 0.25 * i), t + i * 2, t + i * 2 + 4.2); c.stroke(); }
      c.fillStyle = 'rgba(232,226,210,.85)'; c.font = '600 10px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('Storm', 0, r + 12); c.restore();
    });
  }

  window.ComUI = { financeTab: financeTab, nationSection: nationSection, init: function () {
    MapView.addPainter(paint);
    if (window.NavyUI) { var prev = NavyUI.navyTab; NavyUI.navyTab = function (body, tag, mine) { prev(body, tag, mine); famousShips(body); }; }
    Game.on('day', function () { if (War.com && Object.keys(War.com.storms).length && War.day % 2 === 0) MapView.refreshOverlay(); });
  } };
})();
