// The national storylines: a chain of choices for each great power (France, Britain, Austria, Prussia, Russia, Spain
// and the United States). Each choice has clear effects and many lead on to further events, so every nation's story
// branches with what it picks. They use the same toolkit as the main story (story.js): E.* effects, R.* requirements.
// branch: only this nation's player sees it coming in the journal; hy: when it happened in history (for start dates).
(function (root) {
  'use strict';
  var War = root.War, K = War.storyKit; if (!K) return;
  var E = K.E, R = K.R, flag = K.flag, alive = K.alive, at = K.at, S = K.S, prov = K.prov;
  function W() { return War; }
  function owns(tag, name) { var p = prov(name); return !!p && p.owner === tag; }
  function ownsAny(tag, names) { return names.some(function (n) { return owns(tag, n); }); }
  function since(f) { var d = S().flags[f]; return d === undefined ? -1 : War.day - d; }
  function majorAllies(t, foe) { return War.allies(t).filter(function (a) { return War.nations[a] && War.nations[a].major && War.atWar(a, foe); }); }
  // new divisions where the nation or a friend holds the province (an army landed in an ally's port)
  function spawnNear(tag, names, n, str, what) {
    return { txt: function () { return K.nm(tag) + ': ' + n + ' new ' + (what || 'division') + (n > 1 ? 's' : '') + ' at ' + names[0]; },
      run: function () {
        var p = null; names.forEach(function (nm) { var q = prov(nm); if (!p && q && (q.ctrl === tag || War.allied(tag, q.ctrl))) p = q; });
        if (!p) { K.spawnAt(tag, names[0], n, str); return; }
        var tp = War.tplOfCls(tag, 'inf'); for (var i = 0; i < n; i++) { var d = War.spawn(tag, tp.id, p.id, str || 0.9); d.org = 0.8; d.xp = Math.max(d.xp || 0, 0.5); }
        War.indexStacks(); if (War.refreshUpkeep) War.refreshUpkeep();
      } };
  }
  function provsOf(tags, test) { return function () { return War.provs.filter(function (p) { return tags.indexOf(p.owner) >= 0 && (!test || test(p)); }).map(function (p) { return p.id; }); }; }
  var FINLAND = ['Åbo', 'Björneborg', 'Helsingfors', 'Tavastehus', 'Tammerfors', 'Vasa', 'Gamlakarleby', 'Uleåborg', 'Kajana', 'Kuopio', 'Jyväskylä', 'St. Michel', 'Joensuu', 'Torneå'];
  var BESSARABIA = ['Kishinev', 'Bălți', 'Bender', 'Izmail', 'Khotin'];
  var FLORIDA = ['Pensacola', 'Tallahassee', 'San Agustín', 'Tampa Bay', 'Cape Florida'];
  var LOMBARDY = ['Milan', 'Novara', 'Como', 'Bergamo', 'Brescia', 'Cremona', 'Mantua', 'Venice', 'Treviso', 'Padua', 'Vicenza', 'Verona', 'Belluno', 'Udine'];
  var TYROL = ['Innsbruck', 'Bozen', 'Lienz', 'Bregenz', 'Trent'];
  var NEWREP = ['ARG', 'GCO', 'MEX', 'CHL', 'PEU'];

  var FRA = 'France: The Emperor\'s Choices', GBR = 'Britain: Ruling the Waves', PRU = 'Prussia: Iron and Reform', AUS = 'Austria: The House of Habsburg',
    RUS = 'Russia: The Tsar\'s Road', SPA = 'Spain: Crown and Juntas', USA = 'America: The Young Republic';

  var BR = [
    // ================= FRANCE =================
    { id: 'fra_boulogne', ch: FRA, title: 'The camp at Boulogne', who: 'FRA', from: [1805, 9], until: [1806, 6], mtth: 20, hy: [1805, 8],
      cond: function () { return War.atWar('FRA', 'GBR') && !flag('invasion_england'); },
      text: 'The Army of England has drilled at Boulogne for two years and the invasion barges are rotting on the beach. The Channel is still Britain\'s, and Austria is marching.',
      expect: 'France turns its back on the Channel', opts: [
        { t: 'Break camp and march east', hist: true, ai: 3, eff: [E.boost('FRA', { spd: 0.1, plan: 0.2 }, 90), E.flag('boulogne_east')] },
        { t: 'Leave a corps watching the Channel', ai: 1, eff: [E.spawn('FRA', 'Boulogne', 3, 0.85), E.money('FRA', -6000), E.stab('GBR', -0.03), E.flag('boulogne_corps')] },
        { t: 'Build an even bigger flotilla', ai: 1, req: [R.money('FRA', 25000)], eff: [E.money('FRA', -25000), E.say('France: +40 transport convoys', function () { War.NV.FRA.convoys += 40; }), E.flag('flotilla'), E.say('Leads on to: the flotilla sails, or not')] }] },
    { id: 'fra_flotilla', ch: FRA, title: 'The flotilla is ready', who: 'FRA', from: [1806, 1], until: [1809, 1], mtth: 30,
      cond: function () { return flag('flotilla') && War.atWar('FRA', 'GBR'); },
      text: 'Two thousand barges, prames and gun-brigs crowd the harbours from Étaples to Ostend. One calm night and a favourable tide, and the Army of England could be on the beaches of Kent.',
      expect: 'The invasion flotilla', opts: [
        { t: 'Make ready for the crossing', ai: 1, req: [R.check('The Royal Navy has not won a great sea victory', function () { return !flag('trafalgar'); })], eff: [E.flag('invasion_england'), E.say('France: +60 more convoys', function () { War.NV.FRA.convoys += 60; }), E.boost('FRA', { ngun: 0.15 }, 180), E.stab('GBR', -0.06), E.ws('GBR', 0.05)] },
        { t: 'Turn the barges over to coastal trade', hist: true, ai: 2, eff: [E.money('FRA', 18000), E.flag('flotilla_sold')] },
        { t: 'Burn them and spend the money on the army', ai: 1, eff: [E.money('FRA', 8000), E.boost('FRA', { org: 0.05 }, 365)] }] },
    { id: 'fra_marshals', ch: FRA, title: 'The Marshalate', who: 'FRA', from: [1806, 1], until: [1813, 1], mtth: 120, hy: [1808, 3],
      cond: function () { return War.atWarAny('FRA') && S().nap.state === 'emperor'; },
      text: 'Ney cannot stand Soult, Lannes despises Murat, and Bernadotte answers to no one. The marshals want titles, estates and glory, and the young colonels want their turn.',
      expect: 'How Napoleon handles his marshals', opts: [
        { t: 'Shower them with titles and estates', hist: true, ai: 2, req: [R.money('FRA', 20000)], eff: [E.money('FRA', -20000), E.boost('FRA', { org: 0.05, atk: 0.05 }, 730), E.flag('imperial_nobility')] },
        { t: 'Promote young officers on merit', ai: 1, eff: [E.boost('FRA', { xpgain: 0.2, plan: 0.2 }, 730), E.stab('FRA', -0.02)] },
        { t: 'Keep every decision in the Emperor\'s hands', ai: 1, eff: [E.boost('FRA', { plan: 0.3 }, 365), E.boost('FRA', { org: -0.03 }, 365)] }] },
    { id: 'fra_class', ch: FRA, title: 'The class of next year', who: 'FRA', from: [1806, 6], until: [1814, 6], mtth: 60, hy: [1809, 1],
      cond: function () { return War.atWarAny('FRA') && War.M.FRA.manpower < 120000; },
      text: 'The depots are empty. The prefects report that the conscripts of next year could be called up now, if the Emperor does not mind the grumbling in the villages.',
      expect: 'France runs short of men', opts: [
        { t: 'Call up next year\'s class early', hist: true, ai: 2, eff: [E.mp('FRA', 100000), E.stab('FRA', -0.05), E.ws('FRA', -0.03)] },
        { t: 'Let the rich buy substitutes', ai: 1, eff: [E.mp('FRA', 50000), E.money('FRA', 15000), E.stab('FRA', -0.02)] },
        { t: 'Leave the young men at home', ai: 1, eff: [E.stab('FRA', 0.05), E.ws('FRA', -0.05)] }] },
    { id: 'fra_ulcer', ch: FRA, title: 'The Spanish ulcer', who: 'FRA', from: [1808, 6], until: [1814, 1], mtth: 45, hy: [1810, 6],
      cond: function () { return flag('peninsula') && War.atWar('FRA', 'SPA') && K.divsIn('FRA', 'SPA') >= 6 && since('peninsula') > 300; },
      text: function () { return 'There are ' + K.divsIn('FRA', 'SPA') + ' French divisions in Spain and the war is no nearer its end. Every convoy needs an escort, every village is a fortress, and the British are in Portugal. The marshals say Spain is eating the army.'; },
      expect: 'If the war in Spain drags on', opts: [
        { t: 'Pour in more troops', hist: true, ai: 2, req: [R.mp('FRA', 30000)], eff: [E.spawn('FRA', 'Bayonne', 4, 0.85), E.mp('FRA', -30000), E.money('FRA', -12000)] },
        { t: 'Bring Ferdinand back and make peace', ai: 1, eff: [E.peace('FRA', 'SPA', 'Peace with Spain: Joseph leaves, Ferdinand returns, French-held Spain goes back'), E.rename('SPA', 'Kingdom of Spain', 'Spain'), E.unflag('bayonne'), E.flag('spain_settled'), E.recall('FRA', 'SPA'), E.stab('FRA', -0.05)] },
        { t: 'Hand the war to Joseph and fight a cheaper war', ai: 1, eff: [E.boost('FRA', { def: 0.1, supply: 0.15 }, 540), E.money('FRA', 10000), E.resist('SPA', 'FRA', 0.9, 'Spanish resistance grows even fiercer (90% in French-held land)')] }] },
    { id: 'fra_hanse', ch: FRA, title: 'Smugglers on the North Sea', who: 'FRA', from: [1809, 6], until: [1812, 6], mtth: 50, hy: [1810, 12],
      cond: function () { return S().cs.on && (alive('HAM') || alive('BRE') || alive('LUB') || alive('OLD')); },
      text: 'British sugar, coffee and cloth pour in through Hamburg, Bremen and Lübeck, and half the customs officers are on the smugglers\' payroll. The blockade leaks like a sieve.',
      expect: 'France annexes the North Sea coast (1810)', opts: [
        { t: 'Annex the whole coast to France', hist: true, ai: 2, eff: [E.give(provsOf(['HAM', 'BRE', 'LUB', 'OLD']), 'FRA', null, 'Hamburg, Bremen, Lübeck and Oldenburg'), E.opinion('RUS', 'FRA', -15), E.flag('hanse'), E.say('The Tsar\'s family ruled Oldenburg: Russia is insulted')] },
        { t: 'Sell licences to trade with Britain', ai: 1, eff: [E.money('FRA', 30000), E.money('GBR', 10000), E.flag('licences'), E.opinion('RUS', 'FRA', -5)] },
        { t: 'Burn British goods in the squares', ai: 1, eff: [E.money('GBR', -15000), E.stab('FRA', -0.03), E.opinion('HAM', 'FRA', -20)] }] },
    { id: 'fra_poland', ch: FRA, title: 'The Polish question', who: 'FRA', from: [1807, 9], until: [1812, 6], mtth: 50, hy: [1809, 10],
      cond: function () { return flag('tilsit') && alive('SAX') && owns('SAX', 'Warsaw'); },
      text: 'The Poles of the Duchy of Warsaw are the Emperor\'s most devoted soldiers and they want their kingdom back. The Tsar has made it plain: a Kingdom of Poland would mean war.',
      expect: 'What becomes of Poland', opts: [
        { t: 'Keep the Duchy as it is', hist: true, ai: 2, eff: [E.opinion('RUS', 'FRA', 5), E.opinion('SAX', 'FRA', 5)] },
        { t: 'Restore the Kingdom of Poland', ai: 1, eff: [E.rename('SAX', 'Kingdom of Saxony and Poland', 'Saxony'), E.spawn('SAX', 'Warsaw', 3, 0.85, 'Polish division'), E.opinion('SAX', 'FRA', 30), E.opinion('RUS', 'FRA', -40), E.opinion('AUS', 'FRA', -15), E.flag('poland_restored')] },
        { t: 'Promise the Tsar Poland will never return', ai: 1, eff: [E.opinion('RUS', 'FRA', 30), E.opinion('SAX', 'FRA', -20), E.flag('poland_promise'), E.say('Russia waits a year longer before breaking the blockade')] }] },
    { id: 'fra_heir', ch: FRA, title: 'The King of Rome', who: 'FRA', from: [1811, 1], until: [1815, 1], mtth: 40, hy: [1811, 3],
      cond: function () { return flag('marie_louise') && S().nap.state === 'emperor'; },
      text: 'A hundred and one guns announce an heir. Paris goes wild. The dynasty has a future, and every court in Europe must reckon with it.',
      expect: 'An heir for the Empire (1811)', opts: [
        { t: 'Proclaim him King of Rome', hist: true, ai: 2, eff: [E.stab('FRA', 0.08), E.ws('FRA', 0.05), E.opinion('AUS', 'FRA', 10), E.opinion('PAP', 'FRA', -15)] },
        { t: 'A great festival for the whole Empire', ai: 1, req: [R.money('FRA', 12000)], eff: [E.money('FRA', -12000), E.stab('FRA', 0.12), E.ws('FRA', 0.05)] },
        { t: 'A general amnesty', ai: 1, eff: [E.stab('FRA', 0.06), E.pp('FRA', 50), E.opinion('GBR', 'FRA', 5)] }] },

    // ================= BRITAIN =================
    { id: 'gbr_pitt', ch: GBR, title: 'The death of Pitt', who: 'GBR', from: [1806, 1], until: [1806, 12], mtth: 15, hy: [1806, 1],
      cond: function () { return alive('GBR'); },
      text: 'William Pitt is dead at forty-six, worn out by war, debt and port wine. "My country! How I leave my country!" The King must find a new ministry.',
      expect: 'Britain chooses a new government (1806)', opts: [
        { t: 'The Ministry of All the Talents', hist: true, ai: 2, eff: [E.flag('talents'), E.stab('GBR', 0.03), E.opinion('FRA', 'GBR', 10), E.say('Leads on to: Fox\'s peace talks with France')] },
        { t: 'A war ministry under Portland and Canning', ai: 1, eff: [E.ws('GBR', 0.08), E.boost('GBR', { ngun: 0.05 }, 365), E.money('GBR', -10000), E.flag('canning')] },
        { t: 'A quiet caretaker ministry', ai: 1, eff: [E.stab('GBR', 0.05), E.ws('GBR', -0.03)] }] },
    { id: 'gbr_fox', ch: GBR, title: 'Fox talks peace', who: 'GBR', from: [1806, 3], until: [1807, 6], mtth: 40, hy: [1806, 9],
      cond: function () { return flag('talents') && War.atWar('GBR', 'FRA'); },
      text: 'Charles James Fox has opened talks with Talleyrand. Napoleon offers Hanover back and asks for Sicily. Fox is ill and may not live to finish them.',
      expect: 'Peace talks with France', opts: [
        { t: 'The talks fail when Fox dies', hist: true, ai: 2, eff: [E.ws('GBR', 0.05), E.opinion('FRA', 'GBR', -10)] },
        { t: 'Make peace with France', ai: 0.5, eff: [E.peace('GBR', 'FRA'), E.flag('peace1806'), E.stab('GBR', 0.05), E.opinion('RUS', 'GBR', -20)] },
        { t: 'Use the talks to buy time', ai: 1, eff: [E.boost('GBR', { def: 0.1 }, 180), E.money('GBR', 8000)] }] },
    { id: 'gbr_subsidies', ch: GBR, title: 'Pitt\'s gold', who: 'GBR', from: [1805, 12], until: [1815, 6], mtth: 150,
      cond: function () { return War.atWar('GBR', 'FRA') && majorAllies('GBR', 'FRA').length > 0 && War.econ.N.GBR.treasury > 30000; },
      text: function () { return 'Our allies on the continent (' + majorAllies('GBR', 'FRA').map(K.nm).join(', ') + ') can field armies but cannot pay them. The City can. How much British gold goes to the war on land this year?'; },
      expect: 'Britain pays the allies', opts: [
        { t: 'Generous subsidies to every ally', hist: true, ai: 2, req: [R.money('GBR', 30000)], eff: [E.money('GBR', -30000),
          E.say(function () { var a = majorAllies('GBR', 'FRA'); return a.length ? a.map(K.nm).join(', ') + ': +ƒ' + Math.round(30000 / a.length).toLocaleString('en-US') + ' each and +5% organisation for a year' : null; }, function () { var a = majorAllies('GBR', 'FRA'); a.forEach(function (t) { War.econ.N[t].treasury += 30000 / a.length; K.boost(t, { org: 0.05 }, 365); K.goodwill(t, 'GBR', 10); }); }),
          E.later('gbr_subsidies', 365)] },
        { t: 'Pay only the strongest ally', ai: 1, req: [R.money('GBR', 15000)], eff: [E.money('GBR', -15000),
          E.say(function () { var a = majorAllies('GBR', 'FRA').sort(function (x, y) { return War.fieldPower(y) - War.fieldPower(x); })[0]; return a ? K.nm(a) + ': +ƒ15,000' : null; }, function () { var a = majorAllies('GBR', 'FRA').sort(function (x, y) { return War.fieldPower(y) - War.fieldPower(x); })[0]; if (a) War.econ.N[a].treasury += 15000; }),
          E.later('gbr_subsidies', 365)] },
        { t: 'Keep the money for the Navy', ai: 1, eff: [E.boost('GBR', { ngun: 0.1 }, 365), E.say('Every ally at war with France: opinion of Britain −10', function () { majorAllies('GBR', 'FRA').forEach(function (t) { K.goodwill(t, 'GBR', -10); }); }), E.later('gbr_subsidies', 365)] }] },
    { id: 'gbr_copenhagen', ch: GBR, title: 'The Danish fleet', who: 'GBR', from: [1807, 7], until: [1808, 6], mtth: 20, hy: [1807, 8],
      cond: function () { return (flag('tilsit') || flag('tilsit_cold')) && alive('DEN') && !War.atWar('GBR', 'DEN') && !War.allied('GBR', 'DEN') && War.fleets.some(function (f) { return f.tag === 'DEN' && f.ships.length > 6; }); },
      text: 'Our agents report that Napoleon means to seize the Danish fleet, thirty ships of the line at anchor in Copenhagen, and turn it against us. Denmark is neutral, and weak.',
      expect: 'Britain strikes at Copenhagen (1807)', opts: [
        { t: 'Bombard Copenhagen and take the fleet', hist: true, ai: 2, eff: [E.duel('GBR', 'DEN', 'Britain attacks Copenhagen'), E.say(function () { var n = 0; War.fleets.forEach(function (f) { if (f.tag === 'DEN' && f.ships.length > 6) n += f.ships.length; }); return 'The Danish battle fleet (' + n + ' ships) is taken out of the war'; }, function () { War.fleets.filter(function (f) { return f.tag === 'DEN' && f.ships.length > 6; }).forEach(function (f) { War.removeFleet(f); }); }),
          E.boost('GBR', { ngun: 0.05 }, 365), E.opinion('DEN', 'GBR', -50), E.join('DEN', 'FRA'), E.say('Every neutral thinks less of Britain', function () { War.tags.forEach(function (t) { if (!War.atWarAny(t)) K.goodwill(t, 'GBR', -8); }); })] },
        { t: 'Offer Denmark an alliance and subsidies', ai: 1, req: [R.money('GBR', 15000)], eff: [E.money('GBR', -15000), E.money('DEN', 15000), E.opinion('DEN', 'GBR', 25), E.flag('dan_offer')] },
        { t: 'Leave the Danes alone', ai: 1, eff: [E.say('Denmark will probably join France\'s blockade', function () { War.csJoin('DEN'); }), E.opinion('DEN', 'GBR', 10)] }] },
    { id: 'gbr_peninsula', ch: GBR, title: 'An army for Portugal', who: 'GBR', from: [1808, 5], until: [1812, 1], mtth: 20, hy: [1808, 8],
      cond: function () { return flag('peninsula') && War.atWar('GBR', 'FRA') && War.atWar('SPA', 'FRA'); },
      text: 'Spain has risen and the juntas beg for help. Portugal can still be held. Sir Arthur Wellesley, the "Sepoy General", asks for an army and a free hand.',
      expect: 'Britain sends an army to the Peninsula (1808)', opts: [
        { t: 'Send Wellesley to Portugal', hist: true, ai: 2, req: [R.money('GBR', 20000)], eff: [spawnNear('GBR', ['Lisbon', 'Porto', 'Cádiz'], 4, 0.95), E.money('GBR', -20000), E.flag('wellesley'), E.say('Leads on to: Spain may give Wellington its armies')] },
        { t: 'Pay the Spanish juntas instead', ai: 1, req: [R.money('GBR', 30000)], eff: [E.money('GBR', -30000), E.money('SPA', 30000), E.spawn('SPA', 'Seville', 2, 0.8), E.opinion('SPA', 'GBR', 20)] },
        { t: 'Keep the army at home', ai: 1, eff: [E.money('GBR', 10000), E.opinion('SPA', 'GBR', -20)] }] },
    { id: 'gbr_luddites', ch: GBR, title: 'Frame-breakers and Orders in Council', who: 'GBR', from: [1811, 3], until: [1813, 1], mtth: 40, hy: [1812, 6],
      cond: function () { return S().cs.on && War.atWar('GBR', 'FRA'); },
      text: 'With Europe closed to our goods, the mills are idle. Weavers in Nottingham smash the new frames, and America is furious at our Orders in Council, which seize her ships trading with France.',
      expect: 'Britain repeals the Orders in Council (1812)', opts: [
        { t: 'Repeal the Orders in Council', hist: true, ai: 2, eff: [E.opinion('USA', 'GBR', 30), E.flag('orders_repealed'), E.money('GBR', 10000), E.say('America has less reason for war (though the news may arrive too late)')] },
        { t: 'Send in the troops', ai: 1, eff: [E.stab('GBR', 0.05), E.ws('GBR', -0.05), E.opinion('USA', 'GBR', -10)] },
        { t: 'Poor relief for the weavers', ai: 1, req: [R.money('GBR', 20000)], eff: [E.money('GBR', -20000), E.stab('GBR', 0.08)] }] },
    { id: 'gbr_america', ch: GBR, title: 'The American war', who: 'GBR', from: [1812, 6], until: [1815, 3], mtth: 30, hy: [1813, 2],
      cond: function () { return flag('war1812us') && War.atWar('GBR', 'USA'); },
      text: 'The Americans have marched on Canada. With the army in Spain there is little to spare, but the Admiralty has ships, and the Canadians have pluck.',
      expect: 'How Britain fights the War of 1812', opts: [
        { t: 'Blockade and raid the Chesapeake', hist: true, ai: 2, eff: [spawnNear('GBR', ['Halifax', 'Quebec'], 3, 0.9), E.money('USA', -8000), E.stab('USA', -0.05), E.flag('chesapeake_raid')] },
        { t: 'Send the Peninsular veterans', ai: 1, req: [R.check('France beaten or at peace with Britain', function () { return !War.atWar('GBR', 'FRA') || flag('elba'); })], eff: [spawnNear('GBR', ['Montreal', 'Quebec', 'Halifax'], 6, 0.95, 'veteran division')] },
        { t: 'Offer peace on the old borders', ai: 1, eff: [E.peace('GBR', 'USA'), E.opinion('USA', 'GBR', 10)] }] },
    { id: 'gbr_india', ch: GBR, title: 'The Maratha question', who: 'GBR', from: [1805, 9], until: [1810, 1], mtth: 60, hy: [1805, 12],
      cond: function () { return alive('MAR') && !War.atWar('GBR', 'MAR'); },
      text: 'In Calcutta the Marquess Wellesley wanted to finish the Marathas once and for all. The Company\'s directors in London want profits, not wars.',
      expect: 'The East India Company makes peace with the Marathas (1805)', opts: [
        { t: 'Recall Wellesley and make peace', hist: true, ai: 2, eff: [E.money('GBR', 15000), E.opinion('MAR', 'GBR', 15)] },
        { t: 'Finish the Marathas', ai: 1, eff: [E.duel('GBR', 'MAR', 'The East India Company makes war on the Marathas'), E.money('GBR', -8000)] },
        { t: 'Subsidiary alliances with the princes', ai: 1, eff: [E.opinion('MAR', 'GBR', 25), E.opinion('HYD', 'GBR', 15), E.pp('GBR', 20)] }] },

    // ================= PRUSSIA =================
    { id: 'pru_potsdam', ch: PRU, title: 'The oath at Potsdam', who: 'PRU', from: [1805, 10], until: [1806, 3], mtth: 15, hy: [1805, 12],
      cond: function () { return War.atWar('AUS', 'FRA') && !War.atWar('PRU', 'FRA') && !War.allied('PRU', 'FRA'); },
      text: 'Tsar Alexander has sworn eternal friendship over the tomb of Frederick the Great, and French troops have marched through our Ansbach. Count Haugwitz is sent to Napoleon with an ultimatum, but Napoleon may make him an offer instead: Hanover.',
      expect: 'Prussia takes Hanover from Napoleon\'s hand (1805)', opts: [
        { t: 'Take Hanover from Napoleon\'s hand', hist: true, ai: 2, eff: [E.give(provsOf(['HAN']), 'PRU', null, 'Hanover'), E.opinion('GBR', 'PRU', -30), E.opinion('FRA', 'PRU', 15), E.flag('pru_hanover')] },
        { t: 'Join the coalition now', ai: 1, req: [R.risk('PRU', 'FRA')], eff: [E.join('PRU', 'GBR'), E.war('PRU', 'FRA', 'Prussia joins the Third Coalition'), E.flag('war1806'), E.ws('PRU', 0.1)] },
        { t: 'Armed neutrality', ai: 1, eff: [E.boost('PRU', { def: 0.1 }, 365), E.ws('PRU', 0.05)] }] },
    { id: 'pru_reform', ch: PRU, title: 'Stein and Scharnhorst', who: 'PRU', from: [1807, 1], until: [1812, 12], mtth: 30, hy: [1807, 10],
      cond: function () { return (K.yielded('PRU', 'FRA') || flag('pru_fled')) && !War.atWar('PRU', 'FRA'); },
      text: 'Prussia lies in ruins. Baron vom Stein wants to free the serfs and let the towns govern themselves; Scharnhorst and Gneisenau want an army of citizens, led by officers chosen for talent rather than birth.',
      expect: 'Prussia reforms after defeat (1807)', opts: [
        { t: 'Full reform: free the serfs, open the officer corps', hist: true, ai: 2, eff: [E.stab('PRU', -0.05), E.boost('PRU', { org: 0.1, atk: 0.05, xpgain: 0.2 }, 2190), E.boost('PRU', { factory: 0.05 }, 2190), E.flag('pru_reformed'), E.say('Leads on to: the Krümper system')] },
        { t: 'Reform the army only', ai: 1, eff: [E.boost('PRU', { org: 0.08 }, 1460), E.flag('pru_reformed')] },
        { t: 'Keep the old Prussia', ai: 1, eff: [E.stab('PRU', 0.05), E.pp('PRU', 30), E.flag('pru_old')] }] },
    { id: 'pru_krumper', ch: PRU, title: 'The Krümper system', who: 'PRU', from: [1808, 1], until: [1812, 12], mtth: 40, hy: [1808, 9],
      cond: function () { return flag('pru_reformed') && K.yielded('PRU', 'FRA') && !War.atWar('PRU', 'FRA'); },
      text: 'Napoleon has limited our army to 42,000 men. Scharnhorst proposes to train recruits for a few months, send them home and train more. On paper the army stays small.',
      expect: 'Prussia trains reserves in secret', opts: [
        { t: 'Train reserves in secret', hist: true, ai: 2, eff: [E.mp('PRU', 60000), E.boost('PRU', { reinf: 0.2 }, 1460), E.say('30% chance France finds out: opinion of Prussia −30', function () { if (K.rnd() < 0.3) { K.goodwill('FRA', 'PRU', -30); War.event('story', 'France discovers Prussia\'s secret reserves', { a: 'FRA', b: 'PRU' }); } })] },
        { t: 'Obey the treaty', ai: 1, eff: [E.opinion('FRA', 'PRU', 15), E.stab('PRU', 0.02)] },
        { t: 'Build fortresses instead', ai: 1, req: [R.money('PRU', 10000)], eff: [E.money('PRU', -10000), E.boost('PRU', { fort: 0.3, entr: 0.1 }, 1460)] }] },
    { id: 'pru_landwehr', ch: PRU, title: 'To my people!', who: 'PRU', from: [1812, 10], until: [1815, 6], mtth: 20, hy: [1813, 3],
      cond: function () { return War.atWar('PRU', 'FRA') && (flag('war1813') || at(1813, 1)); },
      text: 'The King has called on his people. Students, foresters, tradesmen and peasants come forward in thousands. The question is how to use them.',
      expect: 'Prussia raises the Landwehr (1813)', opts: [
        { t: 'Raise the Landwehr', hist: true, ai: 2, req: [R.mp('PRU', 30000)], eff: [E.spawn('PRU', 'Breslau', 5, 0.6, 'Landwehr division'), E.mp('PRU', -30000), E.ws('PRU', 0.1)] },
        { t: 'Free corps of volunteers', ai: 1, eff: [E.spawn('PRU', 'Breslau', 2, 0.95, 'volunteer corps'), E.boost('PRU', { atk: 0.05 }, 365), E.ws('PRU', 0.05)] },
        { t: 'Rely on the regulars', ai: 1, eff: [E.boost('PRU', { org: 0.1 }, 365)] }] },
    { id: 'pru_blucher', ch: PRU, title: 'Marshal Forwards', who: 'PRU', from: [1813, 3], until: [1815, 9], mtth: 30, hy: [1813, 8],
      cond: function () { return War.atWar('PRU', 'FRA') && S().nap.state === 'emperor'; },
      text: 'Old Blücher is seventy, half-mad and adored by his men, who call him "Marshal Forwards". His chief of staff Gneisenau is a cool planner. Who leads the army?',
      expect: 'Blücher takes command', opts: [
        { t: 'Give Blücher the army', hist: true, ai: 2, eff: [E.boost('PRU', { atk: 0.15, spd: 0.1 }, 365)] },
        { t: 'Gneisenau plans, Blücher fights', ai: 1, eff: [E.boost('PRU', { plan: 0.3, atk: 0.08 }, 365)] },
        { t: 'The cautious Bülow', ai: 1, eff: [E.boost('PRU', { def: 0.15 }, 365)] }] },
    { id: 'pru_saxony', ch: PRU, title: 'The Saxon question', who: 'PRU', from: [1814, 1], until: [1817, 1], mtth: 30, hy: [1815, 2],
      cond: function () { return (flag('elba') || flag('helena')) && alive('SAX') && !War.atWar('PRU', 'SAX') && !War.allied('PRU', 'SAX'); },
      text: 'The King of Saxony stood by Napoleon to the end and is now a prisoner. Prussia wants his whole kingdom as its reward; Austria and Britain will not hear of it.',
      expect: 'Prussia\'s reward at Vienna (1815)', opts: [
        { t: 'Take half of Saxony', hist: true, ai: 2, eff: [E.give(['Wittenberg', 'Bautzen'], 'PRU', ['SAX']), E.give(['Cologne', 'Trier', 'Düsseldorf'], 'PRU', ['FRA', 'BRG', 'HES']), E.opinion('SAX', 'PRU', -20)] },
        { t: 'Demand all of Saxony', ai: 1, eff: [E.give(provsOf(['SAX']), 'PRU', null, 'all of Saxony'), E.opinion('AUS', 'PRU', -30), E.opinion('GBR', 'PRU', -15)] },
        { t: 'The Rhineland instead', ai: 1, eff: [E.give(['Cologne', 'Trier', 'Düsseldorf', 'Münster', 'Hamm', 'Wesel'], 'PRU', ['FRA', 'BRG', 'HES']), E.opinion('AUS', 'PRU', 10)] }] },

    // ================= AUSTRIA =================
    { id: 'aus_mack', ch: AUS, title: 'Mack at Ulm', who: 'AUS', from: [1805, 9], until: [1805, 12], mtth: 8, hy: [1805, 10],
      cond: function () { return War.atWar('AUS', 'FRA') && !K.yielded('AUS', 'FRA'); },
      text: 'General Mack has pushed into Bavaria and sits at Ulm waiting for the Russians. His scouts report French columns crossing the Rhine far to the north. Is he being surrounded?',
      expect: 'The Austrian army at Ulm', opts: [
        { t: 'Hold Ulm and wait for the Russians', hist: true, ai: 2, eff: [E.boost('AUS', { def: 0.15 }, 60), E.say('Risky: the French may get round behind you')] },
        { t: 'Fall back to the Inn', ai: 1, eff: [E.boost('AUS', { spd: 0.15, def: 0.05 }, 90)] },
        { t: 'Give the command to Archduke Charles', ai: 1, req: [R.check('20 political power', function () { return War.pol && War.pol.N.AUS.pp >= 20; })], eff: [E.boost('AUS', { atk: 0.1, plan: 0.25 }, 180), E.pp('AUS', -20)] }] },
    { id: 'aus_charles', ch: AUS, title: 'The Archduke\'s reforms', who: 'AUS', from: [1806, 1], until: [1808, 12], mtth: 40, hy: [1806, 6],
      cond: function () { return K.yielded('AUS', 'FRA') && !War.atWar('AUS', 'FRA'); },
      text: 'The Archduke Charles, the only general who has beaten the French, wants a free hand: a Landwehr of every able man, an army of corps like Napoleon\'s, and an end to the court\'s meddling.',
      expect: 'Austria rebuilds its army', opts: [
        { t: 'The Landwehr and the corps system', hist: true, ai: 2, req: [R.money('AUS', 15000)], eff: [E.mp('AUS', 80000), E.boost('AUS', { org: 0.1 }, 1095), E.money('AUS', -15000), E.flag('aus_reformed')] },
        { t: 'A cheaper army', ai: 1, eff: [E.money('AUS', 25000), E.boost('AUS', { org: -0.05 }, 730)] },
        { t: 'Build up the economy first', ai: 1, eff: [E.boost('AUS', { factory: 0.1, cons: 0.15 }, 1095)] }] },
    { id: 'aus_hofer', ch: AUS, title: 'Andreas Hofer', who: 'AUS', from: [1809, 3], until: [1810, 6], mtth: 15, hy: [1809, 4],
      cond: function () { return War.atWar('AUS', 'FRA') && alive('BAV') && War.atWar('AUS', 'BAV') && ownsAny('BAV', TYROL); },
      text: 'The Tyroleans, led by the bearded innkeeper Andreas Hofer, have risen against their Bavarian masters and want to be Austrian again. They ask for arms and officers.',
      expect: 'The Tyrol rises (1809)', opts: [
        { t: 'Send arms and officers', hist: true, ai: 2, eff: [E.say('The Tyrol rises: every Bavarian-held Tyrolean province without a Bavarian garrison goes over to Austria', function () { TYROL.forEach(function (n) { var p = prov(n); if (p && p.owner === 'BAV' && p.ctrl === 'BAV' && !War.divs.some(function (d) { return d.prov === p.id && d.tag !== 'AUS'; })) War.setCtrl(p, 'AUS'); }); }), E.spawn('AUS', 'Salzburg', 1, 0.7, 'Tyrolean rifle division'), E.opinion('BAV', 'AUS', -20)] },
        { t: 'Leave them to their fate', ai: 1, eff: [E.stab('AUS', -0.03), E.opinion('BAV', 'AUS', 10)] }] },
    { id: 'aus_metternich', ch: AUS, title: 'Metternich\'s course', who: 'AUS', from: [1809, 10], until: [1812, 6], mtth: 40, hy: [1810, 1],
      cond: function () { return (flag('schonbrunn') || (K.yielded('AUS', 'FRA') && at(1809, 10))) && !War.atWar('AUS', 'FRA'); },
      text: 'Count Metternich, the new Foreign Minister, says Austria cannot fight France again for years. It must "tack and turn, and flatter" until the moment comes.',
      expect: 'Austria leans towards France (1810)', opts: [
        { t: 'Tack and turn: lean on France and wait', hist: true, ai: 2, eff: [E.opinion('FRA', 'AUS', 20), E.flag('aus_tack'), E.stab('AUS', 0.03)] },
        { t: 'A full alliance with France', ai: 1, eff: [E.join('AUS', 'FRA'), E.opinion('RUS', 'AUS', -20), E.opinion('GBR', 'AUS', -20), E.flag('aus_french_ally')] },
        { t: 'Secret talks with Russia', ai: 1, eff: [E.opinion('RUS', 'AUS', 25), E.opinion('AUS', 'RUS', 15), E.flag('aus_rus_talks')] }] },
    { id: 'aus_bankrupt', ch: AUS, title: 'State bankruptcy', who: 'AUS', from: [1810, 6], until: [1813, 1], mtth: 40, hy: [1811, 2],
      cond: function () { return flag('schonbrunn') || War.econ.N.AUS.treasury < 20000; },
      text: 'Twenty years of war have been paid for with paper. The Bancozettel is worth a fifth of its face value and the state cannot pay its debts.',
      expect: 'Austria goes bankrupt (1811)', opts: [
        { t: 'Declare bankruptcy and devalue the paper', hist: true, ai: 2, eff: [E.money('AUS', 40000), E.stab('AUS', -0.1)] },
        { t: 'Borrow from the London bankers', ai: 1, req: [R.alive('GBR')], eff: [E.money('AUS', 30000), E.opinion('GBR', 'AUS', 10), E.opinion('FRA', 'AUS', -10)] },
        { t: 'Cut the army to the bone', ai: 1, eff: [E.money('AUS', 25000), E.boost('AUS', { atk: -0.05, org: -0.05 }, 730)] }] },
    { id: 'aus_italy', ch: AUS, title: 'Italy for the Habsburgs?', who: 'AUS', from: [1814, 1], until: [1817, 1], mtth: 30, hy: [1815, 6],
      cond: function () { return (flag('elba') || flag('helena')) && (ownsAny('ITA', LOMBARDY) || ownsAny('FRA', LOMBARDY)); },
      text: 'With Napoleon gone, northern Italy is up for grabs. Lombardy and Venice are rich, and Austria has the army in place. But a Habsburg Italy will make enemies.',
      expect: 'Austria takes Lombardy–Venetia (1815)', opts: [
        { t: 'Lombardy–Venetia for the Habsburgs', hist: true, ai: 2, eff: [E.give(LOMBARDY, 'AUS', ['ITA', 'FRA']), E.opinion('SAR', 'AUS', -15), E.flag('aus_italy')] },
        { t: 'Restore the old princes', ai: 1, eff: [E.give(LOMBARDY, 'SAR', ['ITA', 'FRA']), E.opinion('SAR', 'AUS', 30), E.opinion('PAP', 'AUS', 20), E.stab('AUS', 0.03)] },
        { t: 'Take Venice only', ai: 1, eff: [E.give(['Venice', 'Treviso', 'Padua', 'Vicenza', 'Verona', 'Belluno', 'Udine'], 'AUS', ['ITA', 'FRA']), E.opinion('SAR', 'AUS', 10)] }] },

    // ================= RUSSIA =================
    { id: 'rus_persia', ch: RUS, title: 'The Persian war', who: 'RUS', from: [1810, 1], until: [1814, 1], mtth: 60, hy: [1813, 10],
      cond: function () { return War.atWar('RUS', 'PER'); },
      text: 'In the Caucasus the war with Persia drags on, year after year. General Kotlyarevsky promises a decisive blow, but every man there is a man not facing Napoleon.',
      expect: 'Russia makes peace with Persia at Gulistan (1813)', opts: [
        { t: 'The Treaty of Gulistan', hist: true, ai: 2, eff: [E.peace('RUS', 'PER', 'Peace with Persia: Russia keeps what it holds in the Caucasus'), E.opinion('PER', 'RUS', -10)] },
        { t: 'Push on to the Aras', ai: 1, eff: [E.spawn('RUS', 'Tiflis', 2, 0.85), E.boost('RUS', { atk: 0.05 }, 180)] },
        { t: 'Bribe the Shah\'s ministers', ai: 1, req: [R.money('RUS', 15000)], eff: [E.money('RUS', -15000), E.peace('RUS', 'PER'), E.opinion('PER', 'RUS', 15)] }] },
    { id: 'rus_danube', ch: RUS, title: 'The Danubian Principalities', who: 'RUS', from: [1806, 10], until: [1809, 1], mtth: 30, hy: [1806, 11],
      cond: function () { return alive('OTT') && !War.atWar('RUS', 'OTT'); },
      text: 'Egged on by the French ambassador, the Sultan has dismissed the pro-Russian princes of Moldavia and Wallachia. The road to the Danube lies open.',
      expect: 'Russia goes to war with the Ottomans (1806)', opts: [
        { t: 'Occupy Moldavia and Wallachia', hist: true, ai: 2, req: [R.risk('RUS', 'OTT')], eff: [E.duel('RUS', 'OTT', 'Russia invades the Danubian Principalities'), E.flag('rus_turk_war'), E.say('Leads on to: the Peace of Bucharest')] },
        { t: 'Protest, but keep the peace', ai: 1, eff: [E.opinion('OTT', 'RUS', 10), E.stab('RUS', 0.02)] },
        { t: 'Send gold to the Serbian rebels', ai: 1, req: [R.money('RUS', 10000)], eff: [E.money('RUS', -10000), E.stab('OTT', -0.06), E.opinion('OTT', 'RUS', -15)] }] },
    { id: 'rus_bucharest', ch: RUS, title: 'The Peace of Bucharest', who: 'RUS', from: [1811, 6], until: [1814, 1], mtth: 20, hy: [1812, 5],
      cond: function () { return War.atWar('RUS', 'OTT') && (flag('ukase') || War.atWar('RUS', 'FRA') || at(1812, 1)); },
      text: 'Kutuzov has trapped the Grand Vizier\'s army on the Danube. Napoleon is gathering his forces in Poland. Peace in the south now would free the Army of the Danube.',
      expect: 'Russia takes Bessarabia and makes peace (1812)', opts: [
        { t: 'Take Bessarabia and make peace', hist: true, ai: 2, eff: [E.give(BESSARABIA, 'RUS', ['MOL', 'OTT', 'WAL']), E.peace('RUS', 'OTT'), E.recall('RUS', 'OTT', 'FRA')] },
        { t: 'Fight on for the whole Danube', ai: 1, eff: [E.boost('RUS', { atk: 0.1 }, 180), E.ws('RUS', -0.05)] },
        { t: 'Peace with nothing gained', ai: 1, eff: [E.peace('RUS', 'OTT'), E.opinion('OTT', 'RUS', 20), E.recall('RUS', 'OTT', 'FRA')] }] },
    { id: 'rus_finland', ch: RUS, title: 'Finland', who: 'RUS', from: [1808, 1], until: [1809, 12], mtth: 20, hy: [1808, 2],
      cond: function () { return (flag('tilsit') || flag('tilsit_cold')) && alive('SWE') && !War.atWar('RUS', 'SWE') && !War.allied('RUS', 'SWE') && ownsAny('SWE', FINLAND); },
      text: 'At Tilsit Napoleon told the Tsar to make Sweden close her ports to Britain, and hinted that Finland would be a fair reward. Sweden\'s king is stubborn and his army is small.',
      expect: 'Russia conquers Finland (1808)', opts: [
        { t: 'Invade Finland', hist: true, ai: 2, req: [R.risk('RUS', 'SWE')], eff: [E.duel('RUS', 'SWE', 'Russia invades Finland'), E.flag('finnish_war'), E.say('Leads on to: the Peace of Fredrikshamn')] },
        { t: 'Demand that Sweden close her ports', ai: 1, eff: [E.opinion('SWE', 'RUS', -15), E.when(function () { return S().cs.on; }, E.say('Sweden may join the Continental System', function () { if (K.rnd() < 0.5) War.csJoin('SWE'); }))] },
        { t: 'Leave Sweden alone', ai: 1, eff: [E.opinion('SWE', 'RUS', 15), E.opinion('FRA', 'RUS', -10)] }] },
    { id: 'rus_fredrikshamn', ch: RUS, title: 'The Peace of Fredrikshamn', who: 'RUS', from: [1808, 6], until: [1811, 1], mtth: 25, hy: [1809, 9],
      cond: function () { return flag('finnish_war') && War.atWar('RUS', 'SWE') && since('finnish_war') > 180; },
      text: 'The Swedish army has been driven out of Finland and the King of Sweden has been deposed by his own officers. Stockholm asks for terms.',
      expect: 'Finland becomes a Russian Grand Duchy (1809)', opts: [
        { t: 'Finland becomes a Grand Duchy of the Tsar', hist: true, ai: 2, eff: [E.give(FINLAND, 'RUS', ['SWE'], 'Finland'), E.peace('RUS', 'SWE'), E.stab('RUS', 0.03)] },
        { t: 'Push on into Sweden', ai: 1, eff: [E.boost('RUS', { atk: 0.1 }, 120)] },
        { t: 'Make peace for nothing', ai: 1, eff: [E.peace('RUS', 'SWE'), E.opinion('SWE', 'RUS', 25)] }] },
    { id: 'rus_kutuzov', ch: RUS, title: 'Space for time', who: 'RUS', from: [1812, 3], until: [1814, 1], mtth: 10, hy: [1812, 8],
      cond: function () { return War.atWar('RUS', 'FRA') && K.divsIn('FRA', 'RUS') >= 4; },
      text: function () { return 'There are ' + K.divsIn('FRA', 'RUS') + ' French divisions on Russian soil. Barclay retreats and burns everything behind him; the court calls him a traitor. Old Kutuzov, one-eyed and fat, says Russia is big enough to swallow any army.'; },
      expect: 'Russia trades space for time (1812)', opts: [
        { t: 'Appoint Kutuzov and burn as we retreat', hist: true, ai: 2, eff: [E.boost('RUS', { def: 0.15, plan: 0.25 }, 365), E.wear('RUS', 'RUS', 0.5, 0.05, 'Every enemy division in Russia goes hungry: down to 50% organisation, −5% men'), E.resist('RUS', 'FRA', 0.7)] },
        { t: 'Stand and fight at the border', ai: 1, eff: [E.boost('RUS', { atk: 0.15 }, 90), E.ws('RUS', 0.05)] },
        { t: 'Ask Napoleon for terms', ai: 0.5, eff: [E.say('France dictates the peace (land and gold)', function () { if (War.atWar('RUS', 'FRA')) War.dictatePeace(War.peaceTerms('FRA', 'RUS')); }), E.stab('RUS', -0.1)] }] },
    { id: 'rus_opolchenie', ch: RUS, title: 'The Opolchenie', who: 'RUS', from: [1812, 6], until: [1814, 6], mtth: 15, hy: [1812, 7],
      cond: function () { return War.atWar('RUS', 'FRA') && flag('war1812'); },
      text: 'The Tsar has come to Moscow and called on the nobles and merchants. They offer money and men: their serfs, armed with pikes and old muskets.',
      expect: 'Russia raises a militia (1812)', opts: [
        { t: 'Call out the opolchenie', hist: true, ai: 2, eff: [E.spawn('RUS', 'Moscow', 6, 0.6, 'militia division'), E.mp('RUS', -40000), E.ws('RUS', 0.1)] },
        { t: 'Arm the serfs and promise them freedom', ai: 1, eff: [E.spawn('RUS', 'Moscow', 10, 0.6, 'militia division'), E.stab('RUS', -0.15), E.flag('serfs_armed'), E.say('The nobles will not forget this')] },
        { t: 'Only the regular army', ai: 1, eff: [E.boost('RUS', { org: 0.05 }, 365), E.money('RUS', 10000)] }] },
    { id: 'rus_holy', ch: RUS, title: 'The Holy Alliance', who: 'RUS', from: [1815, 6], until: [1820, 1], mtth: 30, hy: [1815, 9],
      cond: function () { return flag('vienna') && alive('AUS') && alive('PRU'); },
      text: 'The Tsar, grown mystical, proposes that the Christian monarchs bind themselves in a Holy Alliance to rule by the Gospel and keep the peace (and the revolutionaries down).',
      expect: 'The Holy Alliance (1815)', opts: [
        { t: 'The Holy Alliance', hist: true, ai: 2, eff: [E.say('Austria and Prussia join Russia\'s side', function () { K.joinSide('AUS', 'RUS'); K.joinSide('PRU', 'RUS'); }), E.stab('RUS', 0.05)] },
        { t: 'A constitution for Poland', ai: 1, eff: [E.stab('RUS', 0.05), E.opinion('SAX', 'RUS', 20), E.pp('RUS', -30)] },
        { t: 'Go our own way', ai: 1, eff: [E.pp('RUS', 50)] }] },

    // ================= SPAIN =================
    { id: 'spa_godoy', ch: SPA, title: 'The Prince of the Peace', who: 'SPA', from: [1805, 12], until: [1808, 3], mtth: 120, hy: [1806, 10],
      cond: function () { return War.allied('SPA', 'FRA'); },
      text: 'Manuel Godoy, the Queen\'s favourite, runs Spain. The alliance with France has cost us our fleet and our trade. Godoy wonders whether to stay loyal, arm in secret, or whether he should go.',
      expect: 'Spain and its alliance with France', opts: [
        { t: 'Stay France\'s loyal ally', hist: true, ai: 2, eff: [E.opinion('FRA', 'SPA', 15), E.money('SPA', -5000)] },
        { t: 'Arm in secret and wait', ai: 1, eff: [E.mp('SPA', 40000), E.opinion('FRA', 'SPA', -15), E.flag('godoy_arms')] },
        { t: 'Dismiss Godoy', ai: 1, eff: [E.stab('SPA', 0.1), E.pp('SPA', -30), E.opinion('FRA', 'SPA', -10), E.flag('godoy_gone')] }] },
    { id: 'spa_portugal', ch: SPA, title: 'Dividing Portugal', who: 'SPA', from: [1807, 9], until: [1808, 6], mtth: 20, hy: [1807, 10],
      cond: function () { return alive('POR') && !War.atWar('SPA', 'POR') && War.allied('SPA', 'FRA') && !War.allied('SPA', 'POR'); },
      text: 'By the secret Treaty of Fontainebleau, France offers to share Portugal with Spain. A French army will march across Spain to Lisbon, and Godoy will get a principality in the Algarve.',
      expect: 'France and Spain invade Portugal (1807)', opts: [
        { t: 'Join the invasion', hist: true, ai: 2, req: [R.risk('SPA', 'POR')], eff: [E.war('SPA', 'POR', 'France and Spain invade Portugal'), E.opinion('FRA', 'SPA', 10)] },
        { t: 'Let the French pass, but stay out', ai: 1, eff: [E.opinion('FRA', 'SPA', 5), E.flag('spa_passage'), E.say('French troops in Spain: Spain will rise even harder if France turns on it')] },
        { t: 'Refuse', ai: 1, eff: [E.opinion('FRA', 'SPA', -25), E.opinion('POR', 'SPA', 20)] }] },
    { id: 'spa_guerrilla', ch: SPA, title: 'The little war', who: 'SPA', from: [1808, 6], until: [1814, 1], mtth: 30, hy: [1809, 1],
      cond: function () { return flag('peninsula') && War.atWar('SPA', 'FRA') && War.provs.some(function (p) { return p.owner === 'SPA' && p.ctrl === 'FRA'; }); },
      text: 'Our regular armies keep losing battles. But in the hills, priests, smugglers and peasants ambush French couriers and convoys. They call it the guerrilla: the little war.',
      expect: 'Spain fights a guerrilla war', opts: [
        { t: 'Wage the guerrilla', hist: true, ai: 2, eff: [E.resist('SPA', 'FRA', 0.85, 'Every Spanish province the French hold rises (85% resistance)'), E.boost('SPA', { def: 0.1, attr: 0.1 }, 540), E.spawn('SPA', 'Seville', 2, 0.5, 'guerrilla band')] },
        { t: 'Raise new regular armies', ai: 1, req: [R.mp('SPA', 30000)], eff: [E.spawn('SPA', 'Cádiz', 4, 0.8), E.mp('SPA', -30000), E.money('SPA', -10000)] },
        { t: 'Seek terms with King Joseph', ai: 0.5, eff: [E.peace('SPA', 'FRA'), E.rename('SPA', 'Kingdom of Spain (Joseph I)'), E.join('SPA', 'FRA'), E.stab('SPA', -0.15)] }] },
    { id: 'spa_cortes', ch: SPA, title: 'The Cortes of Cádiz', who: 'SPA', from: [1810, 9], until: [1813, 12], mtth: 30, hy: [1812, 3],
      cond: function () { return flag('peninsula') && !flag('joseph_accepted'); },
      text: 'Besieged in Cádiz, with French shells falling short in the bay, the Cortes have written a constitution: sovereignty of the nation, a free press, an end to the Inquisition. They call it "La Pepa".',
      expect: 'Spain\'s Constitution of 1812', opts: [
        { t: 'Proclaim the Constitution of 1812', hist: true, ai: 2, eff: [E.ws('SPA', 0.15), E.stab('SPA', -0.05), E.mp('SPA', 30000), E.flag('pepa'), E.say('Leads on to: will Ferdinand swear to it?')] },
        { t: 'Rule through the Regency', ai: 1, eff: [E.stab('SPA', 0.05), E.pp('SPA', 40)] }] },
    { id: 'spa_wellington', ch: SPA, title: 'A British generalissimo', who: 'SPA', from: [1810, 1], until: [1814, 6], mtth: 40, hy: [1812, 9],
      cond: function () { return flag('peninsula') && War.atWar('SPA', 'FRA') && War.atWar('GBR', 'FRA') && (flag('wellesley') || at(1811, 1)); },
      text: 'Wellington has beaten the French at Salamanca. The Cortes propose to give him command of every Spanish army. Our generals are outraged.',
      expect: 'Wellington commands the Spanish armies (1812)', opts: [
        { t: 'Make Wellington generalissimo', hist: true, ai: 2, eff: [E.boost('SPA', { atk: 0.1, def: 0.1, plan: 0.2 }, 540), E.opinion('GBR', 'SPA', 15), E.stab('SPA', -0.03)] },
        { t: 'Spanish armies for Spanish generals', ai: 1, eff: [E.stab('SPA', 0.05), E.boost('SPA', { def: 0.05 }, 365)] }] },
    { id: 'spa_ferdinand', ch: SPA, title: 'The Desired returns', who: 'SPA', from: [1813, 10], until: [1816, 1], mtth: 30, hy: [1814, 5],
      cond: function () { return flag('peninsula') && !War.atWar('SPA', 'FRA'); },
      text: 'Ferdinand VII, "the Desired", is home from his French captivity. The liberals want him to swear to the Constitution; the generals and the clergy want him to tear it up.',
      expect: 'Ferdinand VII returns (1814)', opts: [
        { t: 'Abolish the Constitution', hist: true, ai: 2, eff: [E.stab('SPA', 0.08), E.pp('SPA', 50), E.ws('SPA', -0.05), E.flag('ferdinand_absolute')] },
        { t: 'Swear to the Constitution', ai: 1, eff: [E.stab('SPA', -0.05), E.ws('SPA', 0.05), E.flag('liberal_spain'), E.say('The American colonies are less eager to break away')] },
        { t: 'Send an army to reconquer America', ai: 1, req: [R.mp('SPA', 40000), R.money('SPA', 20000)], eff: [E.spawn('SPA', 'Mexico', 4, 0.85), E.spawn('SPA', 'Lima', 2, 0.85), E.mp('SPA', -40000), E.money('SPA', -20000)] }] },
    { id: 'spa_florida', ch: SPA, title: 'The Floridas', who: 'SPA', from: [1810, 9], until: [1821, 1], mtth: 60, hy: [1819, 2],
      cond: function () { return alive('USA') && ownsAny('SPA', FLORIDA) && !War.atWar('SPA', 'USA') && at(1814, 1); },
      text: 'American settlers pour into the Floridas and General Jackson\'s raids against the Seminoles respect no border. Madrid cannot defend them. Washington offers to buy.',
      expect: 'Spain sells Florida to the United States (1819)', opts: [
        { t: 'Sell the Floridas', hist: true, ai: 2, eff: [E.give(FLORIDA, 'USA', ['SPA']), E.money('SPA', 15000), E.money('USA', -15000), E.opinion('USA', 'SPA', 20)] },
        { t: 'Defend Florida', ai: 1, eff: [E.spawn('SPA', 'Pensacola', 2, 0.8), E.opinion('USA', 'SPA', -20)] },
        { t: 'Ask Britain to protect it', ai: 1, eff: [E.opinion('GBR', 'SPA', 10), E.opinion('USA', 'SPA', -10), E.pp('SPA', -20)] }] },

    // ================= UNITED STATES =================
    { id: 'usa_burr', ch: USA, title: 'The Burr conspiracy', who: 'USA', from: [1806, 6], until: [1807, 12], mtth: 50, hy: [1806, 11],
      cond: function () { return alive('USA'); },
      text: 'Aaron Burr, once Vice-President, is gathering armed men and boats on the Ohio. Some say he means to seize New Orleans; some say Spanish Texas; some say he means to be emperor of the West.',
      expect: 'Jefferson arrests Aaron Burr (1807)', opts: [
        { t: 'Arrest Burr and try him for treason', hist: true, ai: 2, eff: [E.stab('USA', 0.05), E.pp('USA', 20)] },
        { t: 'Let him march on Spanish Texas', ai: 1, eff: [E.opinion('SPA', 'USA', -30), E.flag('burr_west'), E.stab('USA', -0.03)] },
        { t: 'Ignore it', ai: 1, eff: [E.stab('USA', -0.05)] }] },
    { id: 'usa_chesapeake', ch: USA, title: 'The Chesapeake affair', who: 'USA', from: [1807, 6], until: [1808, 6], mtth: 20, hy: [1807, 6],
      cond: function () { return alive('GBR') && War.atWar('GBR', 'FRA') && !War.atWar('USA', 'GBR'); },
      text: 'HMS Leopard has fired on the frigate USS Chesapeake off Norfolk, killed three men and taken four "deserters" from her crew. The country is in uproar.',
      expect: 'The Embargo Act (1807)', opts: [
        { t: 'The Embargo Act: no trade with anyone', hist: true, ai: 2, eff: [E.money('USA', -8000), E.money('GBR', -10000), E.stab('USA', -0.05), E.flag('embargo')] },
        { t: 'Demand an apology and compensation', ai: 1, eff: [E.opinion('GBR', 'USA', -10), E.ws('USA', 0.05)] },
        { t: 'War now!', ai: 0.5, req: [R.risk('USA', 'GBR')], eff: [E.duel('USA', 'GBR', 'The United States declare war on Britain'), E.flag('war1812us'), E.ws('USA', 0.1)] }] },
    { id: 'usa_navy', ch: USA, title: 'Gunboats or frigates?', who: 'USA', from: [1806, 1], until: [1811, 12], mtth: 90, hy: [1807, 1],
      cond: function () { return alive('USA'); },
      text: 'President Jefferson wants a fleet of small, cheap gunboats to defend the harbours. The Federalists want real frigates that can fight on the open sea.',
      expect: 'America chooses its navy', opts: [
        { t: 'Jefferson\'s gunboats', hist: true, ai: 2, eff: [E.money('USA', 5000), E.boost('USA', { fort: 0.2 }, 1825)] },
        { t: 'Build frigates', ai: 1, req: [R.money('USA', 10000)], eff: [E.money('USA', -10000), E.boost('USA', { ngun: 0.15, nspd: 0.1 }, 1825)] },
        { t: 'Save the money', ai: 1, eff: [E.money('USA', 8000)] }] },
    { id: 'usa_tecumseh', ch: USA, title: 'Tecumseh\'s confederacy', who: 'USA', from: [1809, 6], until: [1812, 6], mtth: 40, hy: [1811, 11],
      cond: function () { return alive('TEC') && !War.atWar('USA', 'TEC'); },
      text: 'The Shawnee leader Tecumseh and his brother the Prophet are uniting the tribes of the north-west at Prophetstown, and the British in Canada are supplying them.',
      expect: 'The battle of Tippecanoe (1811)', opts: [
        { t: 'March on Prophetstown', hist: true, ai: 2, eff: [E.duel('USA', 'TEC', 'Governor Harrison marches on Prophetstown'), E.flag('tippecanoe')] },
        { t: 'A treaty and annuities', ai: 1, req: [R.money('USA', 6000)], eff: [E.money('USA', -6000), E.opinion('TEC', 'USA', 25), E.flag('tec_treaty'), E.say('Tecumseh will not join Britain in a war')] },
        { t: 'Leave the frontier alone', ai: 1, eff: [E.opinion('TEC', 'USA', 5)] }] },
    { id: 'usa_westflorida', ch: USA, title: 'The Republic of West Florida', who: 'USA', from: [1810, 9], until: [1813, 1], mtth: 30, hy: [1810, 10],
      cond: function () { return alive('SPA') && owns('SPA', 'Pensacola') && !War.atWar('USA', 'SPA'); },
      text: 'Settlers in Spanish West Florida have stormed the fort at Baton Rouge, raised a lone-star flag and asked to join the Union.',
      expect: 'The United States annex West Florida (1810)', opts: [
        { t: 'Annex West Florida', hist: true, ai: 2, eff: [E.give(['Pensacola'], 'USA', ['SPA']), E.opinion('SPA', 'USA', -25)] },
        { t: 'Leave it to Spain', ai: 1, eff: [E.opinion('SPA', 'USA', 10)] }] },
    { id: 'usa_canada', ch: USA, title: 'On to Canada!', who: 'USA', from: [1812, 6], until: [1814, 12], mtth: 15, hy: [1812, 7],
      cond: function () { return flag('war1812us') && War.atWar('USA', 'GBR'); },
      text: 'Thomas Jefferson says the conquest of Canada will be "a mere matter of marching". The militia of New York and Ohio are not so sure.',
      expect: 'America invades Canada (1812)', opts: [
        { t: 'Invade Upper Canada', hist: true, ai: 2, eff: [E.spawn('USA', 'Albany', 3, 0.6, 'militia division'), E.boost('USA', { atk: 0.1 }, 180)] },
        { t: 'Defend the coast and the ports', ai: 1, eff: [E.boost('USA', { def: 0.15, fort: 0.2 }, 365)] },
        { t: 'Let loose the privateers', ai: 1, eff: [E.money('GBR', -15000), E.money('USA', 5000), E.boost('USA', { ngun: 0.05 }, 365)] }] },
    { id: 'usa_hartford', ch: USA, title: 'The Hartford Convention', who: 'USA', from: [1814, 9], until: [1815, 6], mtth: 30, hy: [1814, 12],
      cond: function () { return War.atWar('USA', 'GBR') && flag('war1812us'); },
      text: 'Washington has been burned. New England Federalists, ruined by the war, are meeting at Hartford, and some are talking of leaving the Union.',
      expect: 'New England grumbles (1814)', opts: [
        { t: 'Ignore them and wait for peace', hist: true, ai: 2, eff: [E.stab('USA', -0.03)] },
        { t: 'Concessions to New England', ai: 1, eff: [E.stab('USA', 0.05), E.ws('USA', -0.1), E.pp('USA', -20)] },
        { t: 'Make peace quickly', ai: 1, eff: [E.peace('USA', 'GBR'), E.stab('USA', 0.05)] }] },
    { id: 'usa_monroe', ch: USA, title: 'America for the Americans', who: 'USA', from: [1817, 1], until: [1825, 1], mtth: 60, hy: [1823, 12],
      cond: function () { return !War.atWar('USA', 'GBR') && NEWREP.some(alive); },
      text: 'The new republics of Spanish America have won their freedom, and the kings of Europe talk of helping Spain win them back. Britain proposes a joint warning.',
      expect: 'The Monroe Doctrine (1823)', opts: [
        { t: 'A declaration of our own: the Monroe Doctrine', hist: true, ai: 2, eff: [E.say('Every new American republic: opinion of the United States +20', function () { NEWREP.forEach(function (t) { if (alive(t)) K.goodwill(t, 'USA', 20); }); }), E.opinion('SPA', 'USA', -20), E.pp('USA', 30)] },
        { t: 'A joint declaration with Britain', ai: 1, eff: [E.opinion('GBR', 'USA', 25), E.say('Every new American republic: opinion of the United States +10', function () { NEWREP.forEach(function (t) { if (alive(t)) K.goodwill(t, 'USA', 10); }); })] },
        { t: 'Stay out of it', ai: 1, eff: [E.stab('USA', 0.03)] }] }
  ];
  BR.forEach(function (e) { e.branch = true; War.STORY.push(e); });

  // ---------- the national stories reach back into the main one ----------
  function wrapCond(id, fn) { var e = War.storyEventById(id); if (!e) return; var base = e.cond; e.cond = function () { return base.call(this) && fn(); }; }
  // a promise to the Tsar about Poland buys a year before Russia breaks the blockade
  wrapCond('ukase', function () { return !flag('poland_promise') || at(1811, 6); });
  // a liberal Spain keeps more of its empire (a treaty with Tecumseh keeps him out of 1812: see 'madison' in story.js)
  ['mayo', 'boyaca', 'iguala', 'ayacucho', 'chacabuco'].forEach(function (id) { wrapCond(id, function () { return !flag('liberal_spain') || K.rnd() < 0.35; }); });
  // Britain at peace with France in 1806 does not proclaim the Berlin Decree on itself
  wrapCond('berlin', function () { return !flag('peace1806') || War.atWar('FRA', 'GBR'); });

  // start dates: the national stories that happened before are already history
  War.storyScenario = function (year, fire, mark) {
    var sc = War.SCENARIOS[year]; if (!sc) return; var t = sc.year + (sc.month - 1) / 12;
    BR.forEach(function (e) { if (e.hy && e.hy[0] + (e.hy[1] - 1) / 12 < t) mark(e.id); });
  };
})(typeof window !== 'undefined' ? window : globalThis);
