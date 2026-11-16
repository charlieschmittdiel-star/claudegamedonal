// The navy, in the manner of HoI4: sea regions, fleets with missions (patrol, strike, raid, escort), naval
// battles with ships that strike their colours and are taken as prizes, blockades that close ports, convoys that
// carry trade and troops and can be sunk, dockyards that build ships, and admirals.
(function (root) {
  'use strict';
  var War = root.War, Econ = root.Econ;

  // ---------- ships ----------
  // guns and hull (hp) per ship; spd in knots-ish; vis = how far its lookouts see; pts = dockyard work to build
  var SHIPS = {
    first: { name: 'First rate', plural: 'First rates', cls: 'heavy', guns: 110, hp: 120, spd: 4, vis: 1, pts: 900, crew: 850, upkeep: 40, goods: { timber: 0.16, iron: 0.035, cloth: 0.03 } },
    line: { name: 'Ship of the line', plural: 'Ships of the line', cls: 'heavy', guns: 74, hp: 80, spd: 5, vis: 1, pts: 480, crew: 600, upkeep: 22, goods: { timber: 0.16, iron: 0.03, cloth: 0.03 } },
    frig: { name: 'Frigate', plural: 'Frigates', cls: 'screen', guns: 38, hp: 34, spd: 8, vis: 3, pts: 170, crew: 260, upkeep: 8, goods: { timber: 0.14, iron: 0.025, cloth: 0.035 } },
    brig: { name: 'Brig', plural: 'Brigs', cls: 'screen', guns: 16, hp: 14, spd: 9, vis: 2, pts: 70, crew: 110, upkeep: 3, goods: { timber: 0.13, iron: 0.02, cloth: 0.04 } }
  };
  var ORDER = ['first', 'line', 'frig', 'brig'];
  var CONVOY = { name: 'Convoy (10 merchantmen)', pts: 60, n: 10, goods: { timber: 0.14, cloth: 0.03 } };
  var DOCK_PTS = 25;                  // dockyard work per level per month
  var MONEY_PER_PT = 5;               // wages per point of dockyard work
  var CONVOYS_PER_DIV = 3;
  // how well each navy's crews sail and fight
  var QUAL = { GBR: 1.3, FRA: 0.9, SPA: 0.8, RUS: 0.92, DEN: 1.0, SWE: 0.95, BAT: 0.95, POR: 0.9, OTT: 0.75, NAP: 0.85, ALG: 0.85, TUN: 0.8, TRI: 0.8, MOR: 0.8 };
  var MISSIONS = {
    hold: { name: 'Stay in port', blurb: 'Rest, repair and wait. A fleet in being still worries the enemy.', vis: 0, pow: 0 },
    patrol: { name: 'Patrol', blurb: 'Sweep the sea for enemy fleets and hold it; blockades enemy ports here.', vis: 1.5, pow: 1 },
    strike: { name: 'Strike force', blurb: 'Keep the fleet together and fight whatever is found; sees less than a patrol.', vis: 0.6, pow: 1.1 },
    raid: { name: 'Raid convoys', blurb: 'Hunt the enemy\'s merchantmen; avoids battle with ships of the line.', vis: 0.8, pow: 0.3 },
    escort: { name: 'Escort convoys', blurb: 'Guard your own trade and troop convoys from raiders.', vis: 0.7, pow: 0.6 },
    coast: { name: 'Raid the coast', blurb: 'Frigates and brigs land raiding parties on enemy shores in this sea: loot, burned harbours, unrest. Shore batteries and garrisons fight back.', vis: 0.8, pow: 0.4 }
  };

  // ---------- 1805 ----------
  // [nation, port, fleet name, admiral, {first, line, frig, brig}, mission, zone key]
  var START = [
    ['GBR', 'Portsmouth', 'Channel Fleet', 'Cornwallis', { first: 2, line: 20, frig: 12, brig: 12 }, 'patrol', 'chan'],
    ['GBR', 'Plymouth', 'Western Squadron', 'Pellew', { line: 8, frig: 10, brig: 10 }, 'patrol', 'wapp'],
    ['GBR', 'Gibraltar', 'Mediterranean Fleet', 'Nelson', { first: 2, line: 25, frig: 8, brig: 6 }, 'patrol', 'albo'],
    ['GBR', 'Malta', 'Malta Squadron', 'Duckworth', { line: 3, frig: 8, brig: 8 }, 'escort', 'sicil'],
    ['GBR', 'Hull', 'North Sea Fleet', 'Keith', { line: 9, frig: 10, brig: 14 }, 'patrol', 'nss'],
    ['GBR', 'Cork', 'Irish Station', 'Saumarez', { frig: 8, brig: 10 }, 'escort', 'wapp'],
    ['GBR', 'Liverpool', 'Cruisers', 'Cochrane', { frig: 8, brig: 6 }, 'escort', 'irish'],
    ['FRA', 'Brest', 'Brest Fleet', 'Ganteaume', { line: 18, frig: 6, brig: 4 }, 'hold'],
    ['FRA', 'Cádiz', 'Combined Fleet', 'Villeneuve', { line: 18, frig: 5, brig: 2 }, 'hold'],
    ['FRA', 'La Rochelle', 'Rochefort Squadron', 'Allemand', { line: 5, frig: 4, brig: 2 }, 'hold'],
    ['FRA', 'Toulon', 'Toulon Squadron', 'Missiessy', { line: 3, frig: 6, brig: 6 }, 'hold'],
    ['FRA', 'Boulogne', 'Boulogne Flotilla', null, { brig: 18 }, 'hold'],
    ['FRA', 'Lorient', 'Corsairs', 'Linois', { frig: 6, brig: 4 }, 'raid', 'wapp'],
    ['SPA', 'Cádiz', 'Ocean Squadron', 'Gravina', { first: 3, line: 12, frig: 4, brig: 4 }, 'hold'],
    ['SPA', 'La Coruña', 'Ferrol Squadron', 'Álava', { line: 8, frig: 4, brig: 4 }, 'hold'],
    ['SPA', 'Cartagena', 'Cartagena Squadron', 'Cisneros', { line: 6, frig: 4, brig: 4 }, 'hold'],
    ['RUS', 'St. Petersburg', 'Baltic Fleet', 'Khanykov', { line: 18, frig: 10, brig: 12 }, 'hold'],
    ['RUS', 'Sevastopol', 'Black Sea Fleet', 'Pustoshkin', { line: 10, frig: 6, brig: 8 }, 'hold'],
    ['RUS', 'Reval', 'Mediterranean Squadron', 'Senyavin', { line: 6, frig: 3, brig: 3 }, 'hold'],
    ['OTT', 'Constantinople', 'Imperial Fleet', 'Seyit Ali', { first: 2, line: 12, frig: 10, brig: 10 }, 'hold'],
    ['DEN', 'Copenhagen', 'Danish Fleet', 'Bille', { line: 12, frig: 10, brig: 12 }, 'hold'],
    ['DEN', 'Christiania', 'Norwegian Gunboats', null, { brig: 8 }, 'hold'],
    ['SWE', 'Karlskrona', 'Swedish Fleet', 'Cederström', { line: 10, frig: 6, brig: 10 }, 'hold'],
    ['BAT', 'Amsterdam', 'Batavian Fleet', 'Ver Huell', { line: 8, frig: 6, brig: 6 }, 'hold'],
    ['POR', 'Lisbon', 'Portuguese Fleet', 'Rodrigues', { line: 6, frig: 6, brig: 6 }, 'hold'],
    ['NAP', 'Naples', 'Neapolitan Squadron', 'Caracciolo', { line: 2, frig: 3, brig: 4 }, 'hold'],
    ['AUS', 'Venice', 'Venetian Flotilla', null, { frig: 2, brig: 6 }, 'hold'],
    ['ITA', 'Ancona', 'Italian Flotilla', null, { brig: 4 }, 'hold'],
    ['SAR', 'Cagliari', 'Sardinian Squadron', null, { frig: 2, brig: 3 }, 'hold'],
    ['ALG', 'Algiers', 'Corsairs of Algiers', 'Raïs Hamidou', { frig: 3, brig: 8 }, 'hold'],
    ['TUN', 'Tunis', 'Corsairs of Tunis', null, { frig: 1, brig: 6 }, 'hold'],
    ['TRI', 'Tripoli', 'Corsairs of Tripoli', null, { frig: 1, brig: 5 }, 'hold'],
    ['MOR', 'Rabat', 'Salé Rovers', null, { brig: 5 }, 'hold'],
    // the stations overseas
    ['GBR', 'Kingston', 'Jamaica Station', null, { line: 4, frig: 6, brig: 5 }, 'patrol', 'carw'],
    ['GBR', 'Antigua', 'Leeward Islands Station', null, { line: 2, frig: 5, brig: 5 }, 'patrol', 'antil'],
    ['GBR', 'Halifax', 'North American Station', null, { line: 2, frig: 4, brig: 4 }, 'escort', 'newf'],
    ['GBR', 'Madras', 'East Indies Station', null, { line: 5, frig: 7, brig: 4 }, 'patrol', 'bengal'],
    ['GBR', 'Bombay', 'Bombay Marine', null, { frig: 3, brig: 5 }, 'escort', 'arab'],
    ['SPA', 'Havana', 'Havana Squadron', null, { line: 4, frig: 4, brig: 3 }, 'hold'],
    ['SPA', 'Cartagena de Indias', 'Armada de Barlovento', null, { line: 1, frig: 3, brig: 3 }, 'hold'],
    ['SPA', 'Lima', 'South Sea Squadron', null, { frig: 3, brig: 3 }, 'hold'],
    ['SPA', 'Manila', 'Manila Galleons', null, { frig: 2, brig: 2 }, 'hold'],
    ['FRA', 'Île de France', 'Indian Ocean Squadron', null, { line: 1, frig: 5, brig: 2 }, 'raid', 'masc'],
    ['FRA', 'Martinique', 'Antilles Division', null, { frig: 3, brig: 3 }, 'hold'],
    ['BAT', 'Batavia', 'East Indies Squadron', null, { line: 3, frig: 3, brig: 4 }, 'hold'],
    ['POR', 'Rio de Janeiro', 'Brazil Squadron', null, { line: 2, frig: 3, brig: 3 }, 'hold'],
    ['USA', 'Boston', 'United States Navy', null, { frig: 7, brig: 6 }, 'hold'],
    ['OMA', 'Muscat', 'Fleet of Muscat', null, { frig: 3, brig: 6 }, 'hold'],
    ['QNG', 'Canton', 'Guangdong Water Force', null, { brig: 10 }, 'hold'],
    ['JAP', 'Edo', 'Bakufu Guard Ships', null, { brig: 4 }, 'hold'],
    ['VIE', 'Saigon', 'Nguyễn Fleet', null, { frig: 2, brig: 6 }, 'hold'],
    ['HAW', 'Honolulu', 'Kamehameha\'s Fleet', null, { brig: 3 }, 'hold'],
    ['RUS', 'Novo-Arkhangelsk', 'Russian-American Company', null, { brig: 2 }, 'hold']
  ];
  var CONVOYS = { USA: 60, OMA: 20, QNG: 30, JAP: 10, VIE: 10, HAW: 5, JOH: 8, ACE: 8, SUL: 6, BRN: 5, GBR: 420, FRA: 90, SPA: 70, BAT: 60, DEN: 55, SWE: 45, POR: 45, RUS: 45, OTT: 55, NAP: 25, HAM: 30, BRE: 15, LUB: 15, PRU: 25, RAG: 15, SAR: 10, ALG: 10, TUN: 8, TRI: 6, MOR: 6, ITA: 15, AUS: 15, SEP: 10 };
  var DOCKYARDS = { 'Portsmouth': 4, 'Plymouth': 3, 'London': 3, 'Hull': 1, 'Liverpool': 1, 'Brest': 3, 'Toulon': 3, 'La Rochelle': 2, 'Lorient': 1, 'Antwerp': 1, 'Cherbourg': 1,
    'Cádiz': 2, 'La Coruña': 2, 'Cartagena': 2, 'St. Petersburg': 2, 'Sevastopol': 1, 'Nikolayev': 1, 'Constantinople': 2, 'Copenhagen': 2, 'Karlskrona': 2, 'Amsterdam': 2,
    'Lisbon': 1, 'Naples': 1, 'Venice': 1, 'Genoa': 1 };
  // admirals: [nation, name, skill 1-5, trait]
  var ADMIRALS = [
    ['GBR', 'Nelson', 5, 'aggressive'], ['GBR', 'Collingwood', 4, 'blockader'], ['GBR', 'Cornwallis', 3, 'blockader'], ['GBR', 'Pellew', 4, 'raider'], ['GBR', 'Saumarez', 4, null],
    ['GBR', 'Keith', 3, 'blockader'], ['GBR', 'Duckworth', 3, null], ['GBR', 'Cochrane', 4, 'raider'], ['GBR', 'Strachan', 3, 'aggressive'], ['GBR', 'Gambier', 2, 'cautious'],
    ['FRA', 'Villeneuve', 2, 'cautious'], ['FRA', 'Ganteaume', 2, 'cautious'], ['FRA', 'Allemand', 3, 'raider'], ['FRA', 'Missiessy', 2, null], ['FRA', 'Linois', 3, 'raider'],
    ['FRA', 'Surcouf', 4, 'raider'], ['FRA', 'Lucas', 3, 'aggressive'], ['SPA', 'Gravina', 3, null], ['SPA', 'Álava', 2, null], ['SPA', 'Cisneros', 2, 'cautious'], ['SPA', 'Churruca', 3, 'aggressive'],
    ['RUS', 'Senyavin', 4, 'aggressive'], ['RUS', 'Khanykov', 2, 'cautious'], ['RUS', 'Pustoshkin', 2, null], ['RUS', 'Chichagov', 2, null],
    ['OTT', 'Seyit Ali', 2, null], ['OTT', 'Küçük Hüseyin', 3, 'aggressive'], ['DEN', 'Bille', 2, null], ['DEN', 'Willemoes', 3, 'aggressive'], ['SWE', 'Cederström', 2, null], ['SWE', 'Puke', 3, null],
    ['BAT', 'Ver Huell', 3, null], ['BAT', 'De Winter', 2, null], ['POR', 'Rodrigues', 2, null], ['NAP', 'Caracciolo', 2, null], ['ALG', 'Raïs Hamidou', 4, 'raider']
  ];
  var TRAITS = { aggressive: 'Aggressive: +10% firepower', blockader: 'Blockader: fleets stay at sea twice as long', raider: 'Raider: +30% convoys taken', cautious: 'Cautious: breaks off battle sooner, loses fewer ships' };
  var NAMES = {
    GBR: ['Victory', 'Royal Sovereign', 'Britannia', 'Temeraire', 'Dreadnought', 'Prince', 'Neptune', 'Tonnant', 'Bellerophon', 'Colossus', 'Achille', 'Mars', 'Revenge', 'Leviathan', 'Conqueror', 'Ajax', 'Orion', 'Minotaur', 'Spartiate', 'Defence', 'Thunderer', 'Defiance', 'Polyphemus', 'Swiftsure', 'Belleisle', 'Africa', 'Agamemnon', 'Bellona', 'Canopus', 'Superb', 'Spencer', 'Donegal', 'Hibernia', 'Ville de Paris', 'Caesar', 'Hero', 'Courageux', 'Namur', 'Kent', 'Elephant', 'Ganges', 'Edgar', 'Goliath', 'Theseus', 'Vanguard', 'Zealous', 'Audacious', 'Majestic', 'Culloden', 'Royal George', 'Queen Charlotte', 'Impregnable', 'Barfleur', 'Prince George', 'Formidable', 'Glory', 'Windsor Castle', 'Atlas', 'Montagu', 'Venerable', 'Triumph', 'Warrior', 'Resolution', 'Valiant', 'Hannibal', 'Monarch', 'Russell', 'Powerful', 'Repulse', 'Illustrious', 'Centaur', 'Mars II', 'Implacable', 'Pompee', 'Saturn', 'Albion', 'Bulwark', 'Northumberland', 'Royal Oak', 'Sceptre'],
    FRA: ['Bucentaure', 'Redoutable', 'Neptune', 'Fougueux', 'Pluton', 'Algésiras', 'Formidable', 'Héros', 'Indomptable', 'Intrépide', 'Mont-Blanc', 'Scipion', 'Duguay-Trouin', 'Swiftsure', 'Berwick', 'Argonaute', 'Achille', 'Aigle', 'Impérial', 'Alexandre', 'Jupiter', 'Brave', 'Diomède', 'Cassard', 'Vétéran', 'Foudroyant', 'Océan', 'Majestueux', 'Magnanime', 'Lion', 'Jemmapes', 'Suffren', 'Ulm', 'Austerlitz', 'Wagram', 'Friedland', 'Tourville', 'Patriote', 'Régulus', 'Batave', 'Courageux', 'Commerce de Paris', 'Donawerth', 'Eylau', 'Marengo', 'Jean Bart', 'Ville de Varsovie', 'Tonnerre'],
    SPA: ['Santísima Trinidad', 'Santa Ana', 'Príncipe de Asturias', 'Rayo', 'San Justo', 'Neptuno', 'San Leandro', 'Bahama', 'Montañés', 'San Agustín', 'San Francisco de Asís', 'Monarca', 'San Juan Nepomuceno', 'San Ildefonso', 'Argonauta', 'Purísima Concepción', 'Mexicano', 'Conde de Regla', 'Reina María Luisa', 'Salvador del Mundo', 'San Fernando', 'Glorioso', 'Asia', 'Terrible', 'España', 'Castilla', 'San Pablo', 'Guerrero', 'Firme'],
    RUS: ['Tverdyi', 'Uriil', 'Selafail', 'Rafail', 'Moshchnyi', 'Yaroslav', 'Sviatoi Petr', 'Retvizan', 'Silnyi', 'Skoryi', 'Gavriil', 'Mikhail', 'Asia', 'Iona', 'Tri Ierarkha', 'Chesma', 'Ne Tron Menia', 'Blagodat', 'Arkhangel Gavriil', 'Sviatoi Pavel', 'Iezekiil', 'Lesnoe', 'Smelyi', 'Pamiat Evstafiia', 'Kniaz Vladimir'],
    OTT: ['Mesudiye', 'Selimiye', 'Bahr-i Zafer', 'Fatih', 'Tevfik-i Hüda', 'Mukaddeme-i Nusret', 'Anka-yı Bahri', 'Hilal-i Zafer', 'Sadd-ül Bahr', 'Burc-u Zafer', 'Taus-u Bahri', 'Mesir-i Feth', 'Peleng-i Bahri', 'Nüvid-i Fütuh'],
    DEN: ['Christian VII', 'Neptunus', 'Valdemar', 'Danmark', 'Norge', 'Sophia Frederica', 'Justitia', 'Arveprins Frederik', 'Kronprins Frederik', 'Fyen', 'Odin', 'Tre Kroner', 'Skjold', 'Kronprinsesse Marie', 'Dithmarschen', 'Prinds Christian Frederik'],
    SWE: ['Gustav IV Adolf', 'Konung Adolf Fredrik', 'Dristigheten', 'Försiktigheten', 'Fädernesland', 'Wladislaff', 'Manligheten', 'Tapperheten', 'Ömheten', 'Rättvisan', 'Dygden', 'Gustav III', 'Vasa'],
    BAT: ['Brutus', 'Koninklijke Hollander', 'Chatham', 'Haarlem', 'Wassenaar', 'Utrecht', 'Admiraal de Ruyter', 'Doggersbank', 'Pluto', 'Jupiter', 'Piet Hein', 'Tromp'],
    POR: ['Príncipe Real', 'Rainha de Portugal', 'Conde D. Henrique', 'Medusa', 'Afonso de Albuquerque', 'Martim de Freitas', 'D. João de Castro', 'Príncipe do Brasil', 'Vasco da Gama']
  };

  War.SHIPS = SHIPS; War.SHIP_ORDER = ORDER; War.CONVOY = CONVOY; War.MISSIONS = MISSIONS; War.ADM_TRAITS = TRAITS; War.CONVOYS_PER_DIV = CONVOYS_PER_DIV; War.DOCK_PTS = DOCK_PTS;

  Econ.BUILDINGS.dockyard = { name: 'Dockyard', kind: 'naval', max: 5, coastal: true, money: 3500, goods: { timber: 80, tools: 20 }, months: 12, blurb: 'Builds warships and merchantmen: ' + DOCK_PTS + ' points of work a month per level' };
  var baseBlock = Econ.buildBlock;
  Econ.buildBlock = function (id, type) {
    if (type === 'dockyard') {
      var p = this.provs[id], e = this.P[id], have = (e.b.dockyard || 0) + this.queued(id, 'dockyard');
      if (p.ctrl && p.ctrl !== p.owner) return 'Occupied';
      if (!p.coastal || p.sea < 0) return 'Needs a coast';
      if (!(e.b.port > 0)) return 'Build a port first';
      return have >= 5 ? 'Fully built' : null;
    }
    return baseBlock.call(this, id, type);
  };

  function rnd(o) { var t = o.seed += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

  // ---------- sea zones ----------
  War.initSeas = function () {
    var M = root.MAP, self = this; if (!M || !M.seaZones) { this.seas = []; return; }
    this.seas = M.seaZones.map(function (z) { return { id: z.id, key: z.key, name: z.name, x: z.x, y: z.y, lx: z.lx, ly: z.ly, lon: z.lon, lat: z.lat, area: z.area, adj: z.adj.slice() }; });
    this.seaByKey = {}; this.seas.forEach(function (z) { self.seaByKey[z.key] = z.id; z.ports = []; z.coast = []; });
    this.provs.forEach(function (p) { if (p.sea >= 0 && self.seas[p.sea]) self.seas[p.sea].coast.push(p.id); });
  };
  War.seaKm = function (a, b) { return this.distKm(this.seas[a], this.seas[b]); };
  War.seaRoute = function (a, b) {
    if (a === b) return [];
    var memo = this._sr || (this._sr = {}), mk = a * 256 + b; if (memo[mk] !== undefined) return memo[mk] ? memo[mk].slice() : null;
    var prev = {}, q = [a], seen = {}; seen[a] = 1;
    for (var h = 0; h < q.length; h++) {
      var z = q[h]; if (z === b) break;
      this.seas[z].adj.forEach(function (n) { if (!seen[n]) { seen[n] = 1; prev[n] = z; q.push(n); } });
    }
    if (!seen[b]) { memo[mk] = null; return null; }
    var path = [], c = b; while (c !== a) { path.unshift(c); c = prev[c]; }
    memo[mk] = path; return path.slice();
  };
  War.isPort = function (prov) { var p = this.provs[prov]; return p.coastal && p.sea >= 0 && this.econ.P[prov].b.port > 0; };

  // ---------- fleets and ships ----------
  War.shipStat = function (tag, t, key) {
    var s = SHIPS[t][key];
    if (key === 'guns') s *= 1 + this.mod(tag, 'ngun') + (SHIPS[t].cls === 'screen' ? this.mod(tag, 'nscreen') : 0) + (t === 'frig' ? this.mod(tag, 'nfrig') : 0);
    else if (key === 'hp') s *= 1 + this.mod(tag, 'nhp') + (t === 'frig' ? this.mod(tag, 'nfrig') : 0);
    else if (key === 'spd') s *= 1 + this.mod(tag, 'nspd');
    else if (key === 'vis') s *= 1 + this.mod(tag, 'nspot');
    return s;
  };
  War.qual = function (tag) { return QUAL[tag] || 0.85; };
  War.newShip = function (tag, t) {
    var nv = this.NV[tag], list = NAMES[tag] || [], name = null;
    if (SHIPS[t].cls === 'heavy') {
      nv.named = nv.named || 0;
      name = list.length ? list[nv.named % list.length] + (nv.named >= list.length ? ' ' + (Math.floor(nv.named / list.length) + 1) : '') : null;
      nv.named++;
    }
    return { t: t, hp: this.shipStat(tag, t, 'hp'), name: name, xp: 0 };
  };
  War.newFleet = function (tag, base, name) {
    var nv = this.NV[tag]; nv.fleetN = (nv.fleetN || 0) + 1;
    var f = { id: this.nextId++, tag: tag, name: name || ordinal(nv.fleetN) + ' Squadron', ships: [], base: base, zone: this.provs[base].sea, inPort: true, path: [], prog: 0,
      mission: 'hold', target: this.provs[base].sea, org: 1, adm: null, repairAt: 0.5, battle: null, home: false };
    this.fleets.push(f); return f;
  };
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  War.fleetById = function (id) { for (var i = 0; i < this.fleets.length; i++) if (this.fleets[i].id === id) return this.fleets[i]; return null; };
  War.fleetCount = function (f) { var c = { first: 0, line: 0, frig: 0, brig: 0 }; f.ships.forEach(function (s) { c[s.t]++; }); return c; };
  War.fleetHp = function (f) { var h = 0, m = 0, self = this; f.ships.forEach(function (s) { h += s.hp; m += self.shipStat(f.tag, s.t, 'hp'); }); return m ? h / m : 1; };
  War.fleetSpeed = function (f) { var self = this, s = 99; f.ships.forEach(function (x) { s = Math.min(s, self.shipStat(f.tag, x.t, 'spd')); }); return s === 99 ? 5 : s; };
  // fighting strength: guns weighted by hull and crews
  War.fleetPower = function (f) {
    var self = this, p = 0, q = this.qual(f.tag) * this.admMod(f);
    f.ships.forEach(function (s) { var mx = self.shipStat(f.tag, s.t, 'hp'); p += self.shipStat(f.tag, s.t, 'guns') * (0.3 + 0.7 * s.hp / mx) * (SHIPS[s.t].cls === 'heavy' ? 1 : 0.35); });
    return p * q * (0.4 + 0.6 * f.org) / 74;   // about one per healthy ship of the line
  };
  War.fleetVis = function (f) { var self = this, v = 0; f.ships.forEach(function (s) { v += self.shipStat(f.tag, s.t, 'vis'); }); return v; };
  War.admiral = function (id) { return id === null || id === undefined ? null : this.admirals[id] || null; };
  War.admMod = function (f) { var a = this.admiral(f.adm); return 1 + (a ? 0.06 * (a.skill - 1) + this.mod(f.tag, 'nadm') : this.mod(f.tag, 'nadm')); };

  War.initNavy = function () {
    var self = this, P = this.econ.P, byName = {};
    this.initSeas(); this.fleets = []; this.navalBattles = []; this.NV = {}; this.admirals = [];
    this.provs.forEach(function (p) { byName[p.name] = p; });
    this.tags.forEach(function (t) {
      var ports = self.provs.filter(function (p) { return p.owner === t && p.coastal && p.sea >= 0; });
      self.NV[t] = { convoys: CONVOYS[t] !== undefined ? CONVOYS[t] : Math.min(20, ports.length * 3), queue: [], stats: { sunk: 0, lost: 0, taken: 0, prizes: 0, convSunk: 0, convLost: 0 }, lostMonth: 0, sunkMonth: 0, cost: 0, built: 0 };
    });
    ADMIRALS.forEach(function (a) { if (self.NV[a[0]]) self.admirals.push({ id: self.admirals.length, tag: a[0], name: a[1], skill: a[2], trait: a[3], xp: 0, fleet: null }); });
    for (var name in DOCKYARDS) { var p = byName[name]; if (p && p.coastal && p.sea >= 0) { P[p.id].b.dockyard = DOCKYARDS[name]; if (!(P[p.id].b.port > 0)) P[p.id].b.port = 1; } }
    START.forEach(function (s) {
      var tag = s[0], p = byName[s[1]]; if (!self.NV[tag] || !p || !p.coastal || p.sea < 0) return;
      if (!self.allied(tag, p.owner)) return;
      if (!(P[p.id].b.port > 0)) P[p.id].b.port = 1;
      var f = self.newFleet(tag, p.id, s[2]);
      ORDER.forEach(function (t) { for (var i = 0; i < (s[4][t] || 0); i++) f.ships.push(self.newShip(tag, t)); });
      if (s[3]) { var a = self.admirals.filter(function (x) { return x.tag === tag && x.name === s[3]; })[0]; if (a) { f.adm = a.id; a.fleet = f.id; } }
      f.mission = s[5];
      if (s[6] !== undefined && self.seaByKey[s[6]] !== undefined) { f.target = self.seaByKey[s[6]]; f.inPort = false; f.zone = f.target; }
    });
    this.navyVer = 1; this.refreshSea();
  };

  // ---------- who holds the sea ----------
  // power at sea per zone per nation, by mission (fleets in port and fleets on the move count for little)
  War.refreshSea = function () {
    var self = this, pow = {}, vis = {};
    this.fleets.forEach(function (f) {
      if (f.inPort || !f.ships.length) return;
      var m = f.path.length ? 0.25 : MISSIONS[f.mission].pow || 0.25, z = f.zone, pz = pow[z] = pow[z] || {}, vz = vis[z] = vis[z] || {};
      pz[f.tag] = (pz[f.tag] || 0) + self.fleetPower(f) * m;
      vz[f.tag] = (vz[f.tag] || 0) + self.fleetVis(f) * (f.path.length ? 0.5 : MISSIONS[f.mission].vis || 0.5);
    });
    this.seaPow = pow; this.seaVis = vis; this._blk = {};
  };
  // share of the power at sea here held by this nation and its allies (0.5 when nobody is there)
  War.superiority = function (tag, zone) {
    var pz = this.seaPow[zone]; if (!pz) return 0.5;
    var mine = 0, foe = 0;
    for (var t in pz) { if (this.allied(tag, t)) mine += pz[t]; else if (this.atWar(tag, t)) foe += pz[t]; }
    if (mine + foe < 0.01) return 0.5;
    return mine / (mine + foe);
  };
  War.enemyPowerAt = function (tag, zone) { var pz = this.seaPow[zone], foe = 0; if (pz) for (var t in pz) if (this.atWar(tag, t)) foe += pz[t]; return foe; };
  // a port is blockaded when enemy warships hold its sea
  War.blockaded = function (prov, tag) {
    var p = this.provs[prov]; if (!p.coastal || p.sea < 0 || !this.seaPow) return false;
    tag = tag || p.ctrl; var k = tag + ':' + p.sea;
    if (this._blk[k] === undefined) this._blk[k] = this.enemyPowerAt(tag, p.sea) >= 1.5 && this.superiority(tag, p.sea) < 0.35;
    return this._blk[k];
  };
  War.blockadeShare = function (tag) {
    var P = this.econ.P, all = 0, shut = 0, self = this;
    (this.ctrlIds ? this.ctrlIds(tag) : this.provs.map(function (p) { return p.id; })).forEach(function (id) { var p = self.provs[id]; if (p.ctrl !== tag || !(P[id].b.port > 0) || p.sea < 0) return; all += P[id].b.port; if (self.blockaded(id, tag)) shut += P[id].b.port; });
    return all ? shut / all : 0;
  };
  // what an observer can see of a zone: 2 = clearly, 0 = nothing
  War.seaSeen = function (tag, zone) {
    if (!this.fog || !tag) return 2;
    var self = this, z = this.seas[zone];
    if (this.fleets.some(function (f) { return !f.inPort && self.allied(tag, f.tag) && (f.zone === zone || self.seas[f.zone].adj.indexOf(zone) >= 0); })) return 2;
    if (z.coast.some(function (id) { return self.allied(tag, self.provs[id].ctrl); })) return 2;
    return 0;
  };

  // ---------- orders ----------
  War.setMission = function (f, mission, zone) {
    if (!MISSIONS[mission]) return 'No such mission';
    if (zone !== undefined && zone !== null) {
      if (!this.seas[zone]) return 'No such sea';
      if (this.seaRoute(f.inPort ? this.provs[f.base].sea : f.zone, zone) === null) return 'No sea route from here';
      f.target = zone;
    }
    if (mission !== 'hold' && f.ships.every(function (s) { return SHIPS[s.t].cls === 'heavy'; }) && mission === 'raid') return 'Raiding needs frigates or brigs';
    f.mission = mission; f.home = false;
    if (mission === 'hold') this.goHome(f); else if (!f.inPort) this.sailTo(f, f.target);
    return null;
  };
  War.sailTo = function (f, zone) { var r = this.seaRoute(f.zone, zone); f.path = r || []; f.prog = 0; };
  War.goHome = function (f) {
    if (f.inPort) return;
    var bz = this.provs[f.base].sea;
    if (!this.baseOk(f.tag, f.base)) { var nb = this.findBase(f.tag, f.zone); if (nb === null) return; f.base = nb; bz = this.provs[nb].sea; }
    f.home = true; f.path = this.seaRoute(f.zone, bz) || []; f.prog = 0;
  };
  War.baseOk = function (tag, prov) { var p = this.provs[prov]; return this.isPort(prov) && this.allied(tag, p.ctrl) && this.allied(tag, p.owner); };
  // the nearest friendly port reachable by sea, preferring dockyards
  War.findBase = function (tag, zone) {
    var self = this, best = null, bv = 1e9, P = this.econ.P;
    this.provs.forEach(function (p) {
      if (!self.baseOk(tag, p.id)) return;
      var r = self.seaRoute(zone, p.sea); if (r === null) return;
      var v = r.length * 3 - (P[p.id].b.dockyard || 0) - (p.owner === tag ? 2 : 0);
      if (v < bv) { bv = v; best = p.id; }
    });
    return best;
  };
  War.setBase = function (f, prov) {
    if (!this.baseOk(f.tag, prov)) return 'Not a friendly port';
    if (this.seaRoute(f.inPort ? this.provs[f.base].sea : f.zone, this.provs[prov].sea) === null) return 'No sea route to that port';
    var wasIn = f.inPort; f.base = prov;
    if (wasIn) { f.inPort = false; f.zone = this.provs[f.base].sea; }
    this.goHome(f); if (f.mission !== 'hold') f.home = true;
    return null;
  };
  War.splitFleet = function (f) {
    if (f.ships.length < 2) return null;
    var g = this.newFleet(f.tag, f.base), keep = [], give = [], self = this;
    // half of each kind of ship
    ORDER.forEach(function (t) { var of = f.ships.filter(function (s) { return s.t === t; }); of.forEach(function (s, i) { (i % 2 ? give : keep).push(s); }); });
    if (!give.length) { this.fleets.pop(); return null; }
    f.ships = keep; g.ships = give; g.inPort = f.inPort; g.zone = f.zone; g.org = f.org; g.mission = f.mission; g.target = f.target; g.path = f.path.slice(); g.prog = f.prog; g.home = f.home;
    return g;
  };
  // split off one kind of ship into a new squadron
  War.detach = function (f, kind) {
    var cls = kind === 'heavy' ? ['first', 'line'] : ['frig', 'brig'];
    var give = f.ships.filter(function (s) { return cls.indexOf(s.t) >= 0; }); if (!give.length || give.length === f.ships.length) return null;
    var g = this.newFleet(f.tag, f.base, kind === 'heavy' ? null : null);
    f.ships = f.ships.filter(function (s) { return cls.indexOf(s.t) < 0; }); g.ships = give;
    g.inPort = f.inPort; g.zone = f.zone; g.org = f.org; g.mission = kind === 'heavy' ? f.mission : 'escort'; g.target = f.target; g.path = f.path.slice(); g.prog = f.prog; g.home = f.home;
    if (g.mission !== 'hold' && !g.inPort && !g.path.length && g.zone !== g.target) this.sailTo(g, g.target);
    return g;
  };
  War.mergeFleets = function (a, b) {
    if (a.tag !== b.tag || a === b) return 'Different flags';
    if (a.inPort !== b.inPort || a.zone !== b.zone || (a.inPort && a.base !== b.base)) return 'Must be in the same place';
    if (a.battle !== null || b.battle !== null) return 'In battle';
    a.ships = a.ships.concat(b.ships); a.org = Math.min(a.org, b.org);
    if (a.adm === null && b.adm !== null) { a.adm = b.adm; this.admirals[a.adm].fleet = a.id; } else if (b.adm !== null) this.admirals[b.adm].fleet = null;
    this.fleets.splice(this.fleets.indexOf(b), 1); return null;
  };
  War.setAdmiral = function (f, admId) {
    var a = this.admirals[admId]; if (!a || a.tag !== f.tag) return 'Not your admiral';
    if (a.fleet !== null) { var o = this.fleetById(a.fleet); if (o) o.adm = null; }
    if (f.adm !== null && this.admirals[f.adm]) this.admirals[f.adm].fleet = null;
    f.adm = a.id; a.fleet = f.id; return null;
  };
  War.removeFleet = function (f) {
    if (f.adm !== null && this.admirals[f.adm]) this.admirals[f.adm].fleet = null;
    var i = this.fleets.indexOf(f); if (i >= 0) this.fleets.splice(i, 1);
  };

  // ---------- each day ----------
  War.navyDay = function () {
    var self = this;
    this.refreshSea();
    // 1. fleets: sail, rest, repair, come home
    this.fleets.slice().forEach(function (f) {
      if (!f.ships.length) { self.removeFleet(f); return; }
      if (self.gone[f.tag]) { self.removeFleet(f); return; }
      if (f.battle !== null) return;
      var adm = self.admiral(f.adm), hp = self.fleetHp(f);
      if (f.inPort) {
        if (!self.baseOk(f.tag, f.base)) { self.portLost(f); return; }
        f.org = Math.min(1, f.org + 0.04);
        var dock = self.econ.P[f.base].b.dockyard || 0, rate = (0.01 + 0.008 * dock) * (1 + self.mod(f.tag, 'nrepair'));
        f.ships.forEach(function (s) { var mx = self.shipStat(f.tag, s.t, 'hp'); if (s.hp < mx) s.hp = Math.min(mx, s.hp + mx * rate); });
        if (f.mission !== 'hold' && f.org >= 0.7 && self.fleetHp(f) >= Math.min(0.95, f.repairAt + 0.35)) {
          f.inPort = false; f.zone = self.provs[f.base].sea; f.home = false; self.sailTo(f, f.target);
        }
        return;
      }
      // at sea
      var decay = (f.path.length ? 0.002 : 0.0035) * (adm && adm.trait === 'blockader' ? 0.5 : 1);
      if (f.mission !== 'hold') f.org = Math.max(0, f.org - decay);
      if (!f.home && (f.mission === 'hold' || hp < f.repairAt || f.org < 0.3)) self.goHome(f);
      if (f.path.length) {
        var need = Math.max(1, Math.ceil(self.seaKm(f.zone, f.path[0]) / (self.fleetSpeed(f) * 26)));
        f.prog++;
        if (f.prog >= need) { f.zone = f.path.shift(); f.prog = 0; }
      }
      if (!f.path.length) {
        if (f.home) {
          if (f.zone === self.provs[f.base].sea && self.baseOk(f.tag, f.base)) { f.inPort = true; f.home = false; }
          else self.goHome(f);
        } else if (f.mission !== 'hold' && f.zone !== f.target) self.sailTo(f, f.target);
      }
    });
    // 2. fleets meet
    this.refreshSea();
    var at = {};
    this.fleets.forEach(function (f) { if (!f.inPort && f.ships.length) (at[f.zone] = at[f.zone] || []).push(f); });
    for (var z in at) {
      var list = at[z]; if (list.length < 2) continue;
      for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
        var a = list[i], b = list[j]; if (a.battle !== null || b.battle !== null || !this.atWar(a.tag, b.tag)) continue;
        var va = (this.seaVis[z] && this.seaVis[z][a.tag]) || 1, vb = (this.seaVis[z] && this.seaVis[z][b.tag]) || 1;
        var p = Math.min(0.85, 0.07 * (va + vb) / (Math.sqrt(this.seas[z].area) / 60));
        if (rnd(this) < p) this.startNavalBattle(+z, a, b, list);
      }
    }
    // 3. battles
    this.navalBattles = this.navalBattles.filter(function (bt) { return self.navalRound(bt); });
    // 4. troops at sea
    this.convoyDay();
  };

  // ---------- battle ----------
  function heavy(s) { return SHIPS[s.t].cls === 'heavy'; }
  War.startNavalBattle = function (zone, a, b, here) {
    var self = this, sideA = [], sideB = [];
    here.forEach(function (f) {
      if (f.battle !== null || !f.ships.length) return;
      if (self.allied(f.tag, a.tag)) sideA.push(f); else if (self.allied(f.tag, b.tag)) sideB.push(f);
    });
    // raiders slip away from ships of the line
    function evade(side, other) {
      var heavyFoe = other.some(function (f) { return f.ships.some(heavy); });
      return side.filter(function (f) {
        if (f.mission !== 'raid' || !heavyFoe) return true;
        var adm = self.admiral(f.adm), ch = 0.55 + (adm && adm.trait === 'raider' ? 0.2 : 0);
        if (rnd(self) < ch) { f.org = Math.max(0, f.org - 0.05); return false; }
        return true;
      });
    }
    sideA = evade(sideA, sideB); sideB = evade(sideB, sideA);
    if (!sideA.length || !sideB.length) return;
    var bt = { id: this.nextId++, zone: zone, sides: [sideA.map(function (f) { return f.id; }), sideB.map(function (f) { return f.id; })], tags: [a.tag, b.tag], day: 0,
      start: [0, 0], sunk: [[], []], taken: [[], []], heavies: 0, gauge: rnd(this) < 0.5 ? 0 : 1 };
    [sideA, sideB].forEach(function (side, k) { side.forEach(function (f) { f.battle = bt.id; f.path = []; f.prog = 0; f.ships.forEach(function (s) { bt.start[k] += s.hp; if (heavy(s)) bt.heavies++; s.struck = false; }); }); });
    // the admiral with the better eye takes the weather gauge
    var best = [0, 1].map(function (k) { var m = 0; [sideA, sideB][k].forEach(function (f) { m = Math.max(m, self.admMod(f)); }); return m * (0.7 + 0.6 * rnd(self)); });
    bt.gauge = best[0] >= best[1] ? 0 : 1;
    this.navalBattles.push(bt);

  };
  War.navalBattleIn = function (zone) { for (var i = 0; i < this.navalBattles.length; i++) if (this.navalBattles[i].zone === zone) return this.navalBattles[i]; return null; };
  War.battleFleets = function (bt, k) { var self = this; return bt.sides[k].map(function (id) { return self.fleetById(id); }).filter(Boolean); };
  // one day of a sea battle: three exchanges of broadsides; returns false when the battle is over
  War.navalRound = function (bt) {
    var self = this, F = [this.battleFleets(bt, 0), this.battleFleets(bt, 1)];
    if (!F[0].length || !F[1].length) { this.endNavalBattle(bt, F, F[0].length ? 0 : 1); return false; }
    bt.day++;
    for (var r = 0; r < 3; r++) {
      var dmg = [[], []];
      [0, 1].forEach(function (k) {
        var foes = []; F[1 - k].forEach(function (f) { f.ships.forEach(function (s) { if (!s.struck && s.hp > 0) foes.push([f, s]); }); });
        if (!foes.length) return;
        var fh = foes.filter(function (x) { return heavy(x[1]); }), fs = foes.filter(function (x) { return !heavy(x[1]); });
        F[k].forEach(function (f) {
          var adm = self.admiral(f.adm), mul = 0.04 * self.qual(f.tag) * self.admMod(f) * (0.5 + 0.5 * f.org) * (bt.gauge === k ? 1.1 : 1) * (adm && adm.trait === 'aggressive' ? 1.1 : 1);
          f.ships.forEach(function (s) {
            if (s.struck || s.hp <= 0) return;
            var g = self.shipStat(f.tag, s.t, 'guns') * mul * (0.6 + 0.8 * rnd(self)), tgt;
            if (heavy(s)) tgt = fh.length && (rnd(self) < 0.85 || !fs.length) ? fh[Math.floor(rnd(self) * fh.length)] : fs[Math.floor(rnd(self) * fs.length)];
            else if (fs.length) tgt = fs[Math.floor(rnd(self) * fs.length)];
            else { tgt = fh[Math.floor(rnd(self) * fh.length)]; g *= 0.3; }
            if (tgt) dmg[1 - k].push([tgt[0], tgt[1], g]);
          });
        });
      });
      [0, 1].forEach(function (k) {
        dmg[k].forEach(function (d) {
          var f = d[0], s = d[1], g = d[2], adm = self.admiral(f.adm); if (s.hp <= 0) return;
          if (adm && adm.trait === 'cautious') g *= 0.9;
          s.hp -= g; f.org = Math.max(0, f.org - g / Math.max(60, self.fleetMaxHp(f)) * 2.2);
          var mx = self.shipStat(f.tag, s.t, 'hp');
          if (s.hp <= 0) { s.hp = 0; }
          else if (!s.struck && s.hp < 0.28 * mx && rnd(self) < 0.3) s.struck = true;
        });
      });
      // the sunk go down
      [0, 1].forEach(function (k) {
        F[k].forEach(function (f) {
          f.ships = f.ships.filter(function (s) { if (s.hp > 0) return true; bt.sunk[k].push(s.name || SHIPS[s.t].name); self.NV[f.tag].stats.lost++; self.NV[bt.tags[1 - k]] && self.NV[bt.tags[1 - k]].stats.sunk++; return false; });
        });
      });
    }
    // does a side break off?
    var frac = [0, 1].map(function (k) { var h = 0; F[k].forEach(function (f) { f.ships.forEach(function (s) { if (!s.struck) h += s.hp; }); }); return bt.start[k] ? h / bt.start[k] : 0; });
    var org = [0, 1].map(function (k) { var o = 0, n = 0; F[k].forEach(function (f) { o += f.org * f.ships.length; n += f.ships.length; }); return n ? o / n : 0; });
    var cautious = [0, 1].map(function (k) { return F[k].some(function (f) { var a = self.admiral(f.adm); return a && a.trait === 'cautious'; }) ? 0.08 : 0; });
    var quit = [0, 1].map(function (k) { return frac[k] < 0.7 + cautious[k] || org[k] < 0.3 + cautious[k] || !F[k].some(function (f) { return f.ships.length; }); });
    if (quit[0] || quit[1] || bt.day >= 2) {
      var loser = quit[0] && !quit[1] ? 0 : quit[1] && !quit[0] ? 1 : frac[0] <= frac[1] ? 0 : 1;
      this.endNavalBattle(bt, F, 1 - loser);
      return false;
    }
    return true;
  };
  War.fleetMaxHp = function (f) { var self = this, m = 0; f.ships.forEach(function (s) { m += self.shipStat(f.tag, s.t, 'hp'); }); return m; };
  War.endNavalBattle = function (bt, F, winner) {
    var self = this, loser = 1 - winner, prizeTo = F[winner].slice().sort(function (a, b) { return b.ships.length - a.ships.length; })[0];
    // ships that struck: the winner takes the loser's as prizes; the winner's own are refloated
    F[loser].forEach(function (f) {
      f.ships = f.ships.filter(function (s) {
        if (!s.struck) return true;
        if (prizeTo && rnd(self) < 0.6) {
          var mx = self.shipStat(prizeTo.tag, s.t, 'hp');
          prizeTo.ships.push({ t: s.t, hp: mx * 0.25, name: s.name, xp: 0, prize: f.tag });
          bt.taken[loser].push(s.name || SHIPS[s.t].name); self.NV[f.tag].stats.lost++; self.NV[prizeTo.tag].stats.prizes++;
        } else { bt.sunk[loser].push(s.name || SHIPS[s.t].name); self.NV[f.tag].stats.lost++; if (self.NV[bt.tags[winner]]) self.NV[bt.tags[winner]].stats.sunk++; }
        return false;
      });
      f.battle = null; f.org = Math.max(f.org, 0.05); if (f.ships.length) self.goHome(f);
    });
    F[winner].forEach(function (f) { f.battle = null; f.ships.forEach(function (s) { s.struck = false; }); });
    // admirals learn
    [F[0], F[1]].forEach(function (side, k) { side.forEach(function (f) { var a = self.admiral(f.adm); if (a) { a.xp += k === winner ? 12 : 5; if (a.xp >= 40 && a.skill < 5) { a.skill++; a.xp = 0; } } }); });
    this.fleets = this.fleets.filter(function (f) { if (f.ships.length) return true; if (f.adm !== null && self.admirals[f.adm]) self.admirals[f.adm].fleet = null; return false; });
    var wn = this.nations[bt.tags[winner]].short, ln = this.nations[bt.tags[loser]].short, z = this.seas[bt.zone].name;
    if (bt.heavies >= 10 && this.addBonus) { var Rw = this.R[bt.tags[winner]]; if (Rw && (!Rw.lastSeaLesson || this.day - Rw.lastSeaLesson > 150)) { Rw.lastSeaLesson = this.day; this.addBonus(bt.tags[winner], ['nav'], 0.5, 'Lessons of the ' + z); } }
    var lost = [bt.sunk[0].length + bt.taken[0].length, bt.sunk[1].length + bt.taken[1].length];
    var text = 'Battle of the ' + z + ': ' + wn + ' victory. ' + ln + ' lost ' + lost[loser] + (bt.taken[loser].length ? ' (' + bt.taken[loser].length + ' taken as prizes)' : '') + ', ' + wn + ' lost ' + lost[winner] + '.';
    bt.result = { winner: bt.tags[winner], text: text, day: this.day, zone: bt.zone, sunk: bt.sunk, taken: bt.taken, tags: bt.tags };
    this.seaLog = this.seaLog || []; this.seaLog.push(bt.result); if (this.seaLog.length > 30) this.seaLog.shift();
    var pl = this.player, mine = pl && (this.allied(pl, bt.tags[0]) || this.allied(pl, bt.tags[1]));
    if (mine) this.event(this.allied(pl, bt.tags[winner]) ? 'battle' : 'lost', text, { a: pl, b: bt.tags[this.allied(pl, bt.tags[0]) ? 1 : 0], zone: bt.zone });
    else if (bt.heavies >= 16) this.event('seabattle', text, { a: bt.tags[0], b: bt.tags[1], zone: bt.zone });
    this.refreshSea();
  };

  // a fleet whose port has fallen: those at anchor are seized or scuttled, those at sea find another harbour
  War.portLost = function (f) {
    var p = this.provs[f.base], taker = p.ctrl, self = this;
    if (f.inPort && this.atWar(f.tag, taker)) {
      var escaped = [], seized = [];
      var shut = this.superiority(f.tag, p.sea) < 0.4 && this.enemyPowerAt(f.tag, p.sea) > 1;
      f.ships.forEach(function (s) { (rnd(self) < (shut ? 0.35 : 0.8) ? escaped : seized).push(s); });
      if (seized.length && this.NV[taker] && this.provs.some(function (q) { return q.ctrl === taker && self.isPort(q.id); })) {
        var g = this.newFleet(taker, f.base, 'Prizes of ' + p.name); g.ships = seized.map(function (s) { s.prize = f.tag; return s; }); g.org = 0.2;
        var home = this.findBase(taker, p.sea); if (home !== null) { g.base = home; g.inPort = false; g.zone = p.sea; this.goHome(g); }
        this.NV[taker].stats.prizes += seized.length;
      }
      this.NV[f.tag].stats.lost += seized.length;
      if (f.tag === this.player || taker === this.player) this.event(f.tag === this.player ? 'lost' : 'battle', 'The ' + f.name + ' is caught in ' + p.name + ': ' + seized.length + ' ships seized by ' + this.nations[taker].short, { a: f.tag, b: taker });
      f.ships = escaped;
    }
    var nb = this.findBase(f.tag, p.sea);
    if (nb === null || !f.ships.length) { this.removeFleet(f); return; }
    f.base = nb; f.inPort = false; f.zone = p.sea; this.goHome(f);
  };

  // ---------- convoys ----------
  War.convoysUsed = function (tag) { var n = 0; this.divs.forEach(function (d) { if (d.tag === tag && d.convoy) n += d.convoy; }); return n; };
  War.freeConvoys = function (tag) { return Math.max(0, Math.floor(this.NV[tag].convoys - this.convoysUsed(tag))); };
  // troops at sea can be caught by enemy warships
  War.convoyDay = function () {
    var self = this;
    this.divs.forEach(function (d) {
      var leg = d.path[0];
      if (!leg || !leg.sea) { if (d.convoy) d.convoy = 0; return; }
      if (!d.route || !d.route.length) return;
      var need = self.legDays(d, d.prov, leg), i = Math.min(d.route.length - 1, Math.floor(d.prog / Math.max(1, need) * d.route.length)), z = d.route[i];
      var foe = self.enemyPowerAt(d.tag, z); if (foe < 0.5) return;
      var sup = self.superiority(d.tag, z), risk = 0.12 * (1 - sup) * Math.min(1, foe / 3);
      if (rnd(self) >= risk) return;
      var origin = d.prov;
      if (rnd(self) < 0.35) {
        d.str = 0; d.org = 0; d.lostAtSea = true;
        self.NV[d.tag].convoys = Math.max(0, self.NV[d.tag].convoys - (d.convoy || 0)); self.NV[d.tag].stats.convLost += d.convoy || 0;
        if (self.allied(self.player, d.tag) || d.tag === self.player) self.event('lost', 'Troop convoy sunk in the ' + self.seas[z].name + ': a division is lost', { a: d.tag });
      } else {
        d.str *= 0.6; d.org = 0.05; d.path = []; d.prog = 0; d.prov = origin; d.convoy = 0; d.retreat = false;
        if (d.tag === self.player) self.event('lost', 'Enemy warships in the ' + self.seas[z].name + ' turn back a troop convoy', { a: d.tag });
      }
    });
    if (this.divs.some(function (d) { return d.lostAtSea; })) { this.divs = this.divs.filter(function (d) { return !d.lostAtSea; }); this.indexStacks(); }
  };
  War.troopRoute = function (from, to) {
    var a = this.provs[from], b = this.provs[to]; if (a.sea < 0 || !b.seas || !b.seas.length) return null;
    var best = null, self = this;
    b.seas.forEach(function (z) { var r = self.seaRoute(a.sea, z); if (r && (!best || r.length < best.length)) best = [a.sea].concat(r); });
    return best;
  };
  var baseOrderSea = War.orderSea;
  War.orderSea = function (d, target) {
    var from = this.provs[d.prov], to = this.provs[target];
    if (from.coastal && to.coastal) {
      var route = this.troopRoute(d.prov, target);
      if (!route) return 'No sea route between those coasts';
      if (route.length > 7) return 'Too far to ship';
      var nv = this.NV[d.tag], need = CONVOYS_PER_DIV;
      if (nv && this.freeConvoys(d.tag) < need) return 'Not enough convoys (' + need + ' needed per division)';
      // the computer will not send troops into a sea held by the enemy
      if (d.tag !== this.player) { var self = this; if (route.some(function (z) { return self.superiority(d.tag, z) < 0.3 && self.enemyPowerAt(d.tag, z) > 2; })) return 'The enemy holds the sea'; }
    }
    var r = baseOrderSea.call(this, d, target); if (r) return r;
    d.route = this.troopRoute(d.prov, target) || []; d.convoy = CONVOYS_PER_DIV;
    return null;
  };
  War.seaDanger = function (tag, from, to) {
    var route = this.troopRoute(from, to), self = this, worst = 1; if (!route) return null;
    route.forEach(function (z) { if (self.enemyPowerAt(tag, z) > 0.5) worst = Math.min(worst, self.superiority(tag, z)); });
    return worst;
  };

  // ---------- each month: trade war, shipbuilding, upkeep ----------
  War.navyMonth = function () {
    var self = this, P = this.econ.P;
    this.tags.forEach(function (t) { var nv = self.NV[t]; nv.lostMonth = 0; nv.sunkMonth = 0; });
    // raiders take merchantmen
    var portLv = {}, zoneLv = {};
    this.provs.forEach(function (p) { if (p.sea < 0 || !(P[p.id].b.port > 0)) return; var t = p.ctrl; portLv[t] = (portLv[t] || 0) + P[p.id].b.port; var k = t + ':' + p.sea; zoneLv[k] = (zoneLv[k] || 0) + P[p.id].b.port; });
    this.fleets.forEach(function (f) {
      if (f.inPort || f.mission !== 'raid' || f.path.length || f.battle !== null) return;
      var adm = self.admiral(f.adm), raid = 0;
      f.ships.forEach(function (s) { raid += s.t === 'frig' ? 1 + self.mod(f.tag, 'nfrig') : s.t === 'brig' ? 0.55 : 0.2; });
      raid *= (0.4 + 0.6 * f.org) * (adm && adm.trait === 'raider' ? 1.3 : 1);
      // the trade passing through this sea and the neighbouring ones
      var zones = [f.zone].concat(self.seas[f.zone].adj);
      self.tags.forEach(function (t) {
        if (!self.atWar(f.tag, t) || self.gone[t] || !portLv[t]) return;
        var lv = 0; zones.forEach(function (z, i) { lv += (zoneLv[t + ':' + z] || 0) * (i ? 0.35 : 1); });
        if (!lv) return;
        var exposed = self.NV[t].convoys * Math.min(1, lv / portLv[t]), esc = 0;
        self.fleets.forEach(function (g) {
          if (g.inPort || !self.allied(g.tag, t) || zones.indexOf(g.zone) < 0) return;
          var w = g.mission === 'escort' ? 1 : g.mission === 'patrol' ? 0.5 : 0.25;
          g.ships.forEach(function (s) { esc += (s.t === 'brig' ? 1 : s.t === 'frig' ? 0.8 : 0.3) * w; });
        });
        var sunk = Math.min(exposed * 0.25, exposed * 0.1 * raid / (raid + 1.5 * esc + 3));
        sunk = Math.floor(sunk + rnd(self)); if (sunk <= 0) return;
        self.NV[t].convoys = Math.max(0, self.NV[t].convoys - sunk);
        self.NV[t].stats.convLost += sunk; self.NV[t].lostMonth += sunk; self.NV[f.tag].stats.convSunk += sunk; self.NV[f.tag].sunkMonth += sunk;
        // escorts bite back
        if (esc > 0) f.ships.forEach(function (s) { if (rnd(self) < Math.min(0.5, esc / (raid * 8))) s.hp = Math.max(1, s.hp - self.shipStat(f.tag, s.t, 'hp') * 0.3); });
      });
    });
    if (this.player && this.NV[this.player] && this.NV[this.player].lostMonth > 0) this.event('lost', 'Enemy raiders took ' + this.NV[this.player].lostMonth + ' of your convoys this month', { a: this.player });
    if (this.player && this.NV[this.player] && this.NV[this.player].sunkMonth > 0) this.event('battle', 'Your raiders took ' + this.NV[this.player].sunkMonth + ' enemy merchantmen this month', { a: this.player });
    // shipyards and upkeep (costs are paid through the budget)
    this.tags.forEach(function (t) {
      var nv = self.NV[t]; if (self.gone[t]) { nv.queue = []; return; }
      var pts = nv.made || 0; nv.made = 0;
      while (pts > 0 && nv.queue.length) {
        var q = nv.queue[0], need = q.t === 'convoy' ? CONVOY.pts : SHIPS[q.t].pts, use = Math.min(pts, need - q.prog);
        q.prog += use; pts -= use;
        if (q.prog >= need - 0.5) { nv.queue.shift(); self.launch(t, q.t); }
      }
      var up = 0; self.fleets.forEach(function (f) { if (f.tag === t) f.ships.forEach(function (s) { up += SHIPS[s.t].upkeep; }); });
      nv.upkeep = up;
    });
    if (this.R) this.tags.forEach(function (t) { if (t !== self.player && !self.gone[t]) self.aiNavy(t, true); });
    this.econ.refreshAccess();
  };
  War.launch = function (tag, t) {
    var nv = this.NV[tag], self = this;
    if (t === 'convoy') { nv.convoys += CONVOY.n; return; }
    var yards = this.ownP(tag).filter(function (p) { return p.ctrl === tag && (self.econ.P[p.id].b.dockyard || 0) > 0; }).sort(function (a, b) { return self.econ.P[b.id].b.dockyard - self.econ.P[a.id].b.dockyard; });
    var port = yards[0] || null; if (!port) { var b = this.findBaseAny(tag); if (b === null) return; port = this.provs[b]; }
    var m = this.M[tag]; if (m) m.manpower = Math.max(0, m.manpower - SHIPS[t].crew);
    var f = this.fleets.filter(function (g) { return g.tag === tag && g.inPort && g.base === port.id && g.battle === null; })[0];
    if (!f) { f = this.newFleet(tag, port.id); f.name = 'New ' + (SHIPS[t].cls === 'heavy' ? 'Squadron' : 'Cruisers') + ' at ' + port.name; f.mission = 'hold'; }
    f.ships.push(this.newShip(tag, t)); nv.built++;
    if (tag === this.player) this.event('ready', SHIPS[t].name + (f.ships[f.ships.length - 1].name ? ' ' + f.ships[f.ships.length - 1].name : '') + ' launched at ' + port.name, { a: tag, prov: port.id });
  };
  War.findBaseAny = function (tag) { var ids = this.ownIds(tag); for (var k = 0; k < ids.length; k++) { var i = ids[k]; if (this.provs[i].owner === tag && this.baseOk(tag, i)) return i; } return null; };
  War.dockyards = function (tag) { var n = 0, P = this.econ.P; this.eachOwned(tag, function (p) { if (p.owner === tag && p.ctrl === tag) n += P[p.id].b.dockyard || 0; }); return n; };
  War.dockPts = function (tag) { return this.dockyards(tag) * DOCK_PTS * (1 + this.mod(tag, 'nprod')); };
  War.queueShip = function (tag, t) {
    if (t !== 'convoy' && !SHIPS[t]) return 'No such ship';
    if (!this.dockyards(tag)) return 'You have no dockyards';
    if (this.NV[tag].queue.length >= 12) return 'The slipways are full';
    this.NV[tag].queue.push({ t: t, prog: 0 }); return null;
  };
  War.unqueueShip = function (tag, i) { this.NV[tag].queue.splice(i, 1); };
  War.navyUpkeep = function (tag) { var up = 0; this.fleets.forEach(function (f) { if (f.tag === tag) f.ships.forEach(function (s) { up += SHIPS[s.t].upkeep; }); }); return up; };
  War.shipsOf = function (tag) { var c = { first: 0, line: 0, frig: 0, brig: 0 }; this.fleets.forEach(function (f) { if (f.tag === tag) f.ships.forEach(function (s) { c[s.t]++; }); }); return c; };
  War.navalWeight = function (tag) { var c = this.shipsOf(tag), n = c.first * 2 + c.line + c.frig * 0.3 + c.brig * 0.1; return n > 0 ? Math.min(4, 0.5 + n / 10) : 0; };
  War.convoyNeed = function (tag) { return (this.econ.N[tag].ports || 0) * 12 + 6; };

  // economy hooks: dockyards draw timber, iron and cloth and pay wages; ships need upkeep; blockades and lost
  // merchantmen choke trade
  var prevDemand = Econ.onDemand;
  Econ.onDemand = function (N) {
    if (prevDemand) prevDemand.call(this, N);
    if (!War.NV) return;
    War.tags.forEach(function (tag) {
      var n = N[tag], nv = War.NV[tag]; if (!n || War.gone[tag] || !nv) return;
      var pts = nv.queue.length ? War.dockPts(tag) : 0, left = 0; nv.queue.forEach(function (q) { left += (q.t === 'convoy' ? CONVOY.pts : SHIPS[q.t].pts) - q.prog; });
      pts = Math.min(pts, left * 1.6 + 1); nv.plan = pts;
      var g = mixGoods(nv.queue); for (var k in g) n.stateDem[k] = (n.stateDem[k] || 0) + pts * g[k];
    });
  };
  function mixGoods(queue) { var q = queue[0]; return q ? (q.t === 'convoy' ? CONVOY.goods : SHIPS[q.t].goods) : {}; }
  var prevSettle = Econ.onSettle;
  Econ.onSettle = function (n) {
    var cost = prevSettle ? prevSettle.call(this, n) : 0;
    if (!War.NV || !War.NV[n.tag]) return cost;
    var nv = War.NV[n.tag], pts = nv.plan || 0, fill = 1, g = mixGoods(nv.queue), k;
    for (k in g) fill = Math.min(fill, n.f[k] === undefined ? 1 : n.f[k]);
    var made = pts * fill; nv.made = (nv.made || 0) + made;
    var build = made * MONEY_PER_PT; for (k in g) build += made * g[k] * n.price[k];
    var up = War.navyUpkeep(n.tag) * n.pi;
    nv.cost = Math.round(build + up); nv.buildCost = Math.round(build); nv.upCost = Math.round(up); nv.fill = fill;
    return cost + build + up;
  };
  var baseAccess = Econ.refreshAccess;
  Econ.refreshAccess = function () {
    baseAccess.call(this);
    if (!War.NV || !War.seaPow) return;
    var self = this;
    this.tags.forEach(function (t) {
      var n = self.N[t], nv = War.NV[t]; if (!nv || !n.ports) return;
      var blk = War.blockadeShare(t), conv = Math.min(1, nv.convoys / War.convoyNeed(t));
      n.blockade = blk; n.convoyFill = conv;
      n.access = Math.max(0.3, n.access * (1 - 0.4 * blk) * (0.8 + 0.2 * conv));
    });
  };

  // ---------- the computer's admiralty ----------
  War.aiNavy = function (tag, monthly) {
    var self = this, mine = this.fleets.filter(function (f) { return f.tag === tag && f.battle === null; }); if (!mine.length && !monthly) return;
    var foes = this.enemies(tag), nv = this.NV[tag];
    if (monthly) {
      // shipbuilding
      var yards = this.dockyards(tag), qlen = nv.queue.length;
      if (yards && qlen < 2) {
        var c = this.shipsOf(tag), nHeavy = c.first + c.line, foePow = 0, myPow = 0;
        foes.forEach(function (f) { var o = self.shipsOf(f); foePow += o.first * 1.5 + o.line; });
        myPow = c.first * 1.5 + c.line;
        var want;
        if (nv.convoys < this.convoyNeed(tag) * 0.7) want = 'convoy';
        else if (foes.length && foePow > myPow * 2) want = c.frig < nHeavy * 1.2 + 4 ? 'frig' : 'brig';   // guerre de course
        else if (c.brig < (c.frig + nHeavy) * 0.6) want = 'brig';
        else if (c.frig < nHeavy * 0.8 + 2) want = 'frig';
        else want = nHeavy > 8 && rnd(this) < 0.15 ? 'first' : 'line';
        if (this.econ.N[tag].treasury > 0) this.queueShip(tag, want);
      }
      // a nation with a navy and money builds dockyards
      var w = this.navalWeight(tag), n = this.econ.N[tag];
      if (w >= 1.5 && yards < Math.round(w * 3) && n.treasury > 8000 && rnd(this) < 0.2) {
        var best = null, bv = -1, P = this.econ.P;
        this.eachOwned(tag, function (p) { if (p.owner !== tag || p.ctrl !== tag || self.econ.buildBlock(p.id, 'dockyard')) return; var v = P[p.id].pop + (P[p.id].b.dockyard || 0) * 200000; if (v > bv) { bv = v; best = p.id; } });
        if (best !== null) this.econ.build(best, 'dockyard');
      }
    }
    if (!foes.length) {
      mine.forEach(function (f) { if (f.mission !== 'hold') self.setMission(f, 'hold'); });
      return;
    }
    // what the enemy has where
    var foeAt = {}, foeHome = {};
    this.fleets.forEach(function (g) {
      if (!self.atWar(tag, g.tag)) return; var pw = self.fleetPower(g);
      if (g.inPort) { var z = self.provs[g.base].sea; foeHome[z] = (foeHome[z] || 0) + pw; } else foeAt[g.zone] = (foeAt[g.zone] || 0) + pw;
    });
    var myPorts = {}; this.eachHeld(tag, function (p) { if (p.ctrl === tag && p.sea >= 0 && self.econ.P[p.id].b.port > 0) myPorts[p.sea] = (myPorts[p.sea] || 0) + self.econ.P[p.id].b.port; });
    var foePorts = {}; this.provs.forEach(function (p) { if (p.sea >= 0 && self.econ.P[p.id].b.port > 0 && foes.some(function (f) { return self.allied(f, p.ctrl); })) foePorts[p.sea] = (foePorts[p.sea] || 0) + self.econ.P[p.id].b.port; });
    // gather small squadrons into the bigger fleets in the same harbour, or send them to the main base
    var bases = {};
    mine.forEach(function (f) { if (f.inPort) (bases[f.base] = bases[f.base] || []).push(f); });
    var mainBase = null, mb = -1; for (var b in bases) { var nS = 0; bases[b].forEach(function (f) { nS += f.ships.length; }); if (nS > mb) { mb = nS; mainBase = +b; } }
    for (b in bases) {
      var list = bases[b].sort(function (x, y) { return y.ships.length - x.ships.length; });
      for (var i = 1; i < list.length; i++) if (list[i].ships.length < 6 && !self.mergeFleets(list[0], list[i])) list[i].merged = true;
      if (list.length === 1 && list[0].ships.length < 4 && mainBase !== null && +b !== mainBase && self.econ.P[+b] && self.seaRoute(self.provs[+b].sea, self.provs[mainBase].sea)) self.setBase(list[0], mainBase);
    }
    mine = this.fleets.filter(function (f) { return f.tag === tag && f.battle === null; });
    // enemy strength that could reach a sea within days: what is there, what is next door, what waits in harbour
    function threatAt(z) {
      var t = (foeAt[z] || 0) + (foeHome[z] || 0) * 0.8;
      self.seas[z].adj.forEach(function (n) { t += (foeAt[n] || 0) * 0.5 + (foeHome[n] || 0) * 0.4; });
      return t;
    }
    var claimed = {};
    mine.sort(function (a, b) { return self.fleetPower(b) - self.fleetPower(a); }).forEach(function (f) {
      var hp = self.fleetHp(f), pw = self.fleetPower(f) / Math.max(0.3, f.org), heavyF = f.ships.some(heavy);
      if (hp < 0.6 || f.org < 0.35 || f.ships.length < 2) { if (f.mission !== 'hold') self.setMission(f, 'hold'); return; }
      var home = self.provs[f.base].sea, from = f.inPort ? home : f.zone, best = null, bv = 0;
      self.seas.forEach(function (z) {
        var rh = self.seaRoute(home, z.id); if (rh === null || rh.length > (heavyF ? 3 : 4)) return;
        var rf = self.seaRoute(from, z.id); if (rf === null) return;
        // the danger on the way counts as much as the danger there
        var threat = threatAt(z.id), v, have = claimed[z.id] || 0;
        [from].concat(rf).forEach(function (y) { if (y !== z.id) threat = Math.max(threat, (foeAt[y] || 0) + (foeHome[y] || 0) * 0.5); });
        if (heavyF) {
          // battle fleets: blockade enemy harbours and clear our own seas, but only with the odds
          if (pw + have < threat * 1.4) return;
          v = (foePorts[z.id] || 0) * 2 + (foeHome[z.id] || 0) * 3 + (foeAt[z.id] || 0) * 2 + (myPorts[z.id] || 0) * (foeAt[z.id] ? 2 : 0.3) - rh.length * 1.5;
          if (have > threat * 1.6 + 2) v *= 0.15;   // enough of our ships there already
        } else {
          // cruisers: raid where the enemy's trade is and his battle fleets are not
          if (threat > pw * 0.6) return;
          v = (foePorts[z.id] || 0) * 1.5 - (foeAt[z.id] || 0) - rh.length - (have > 4 ? have : 0);
        }
        if (z.id === f.target && f.mission !== 'hold') v *= 1.6;   // keep to the station already taken
        if (v > bv) { bv = v; best = z.id; }
      });
      var mission = best === null ? 'hold' : heavyF ? 'patrol' : 'raid';
      // a weak navy's cruisers guard its own trade when nothing can be raided
      if (best === null && !heavyF) {
        var hz = null, hv = 0; for (var z in myPorts) { var w = myPorts[z] - (foeAt[z] || 0) * 3; if (w > hv && threatAt(+z) < pw && self.seaRoute(home, +z) !== null && self.seaRoute(home, +z).length <= 2) { hv = w; hz = +z; } }
        if (hz !== null) { best = hz; mission = 'escort'; }
      }
      if (best === null) { if (f.mission !== 'hold') self.setMission(f, 'hold'); return; }
      claimed[best] = (claimed[best] || 0) + pw;
      if (f.mission !== mission || f.target !== best) self.setMission(f, mission, best);
    });
  };

  // ---------- hooks ----------
  var baseInit = War.init;
  War.init = function (provinces, nations, econ, km) { baseInit.call(this, provinces, nations, econ, km); this.initNavy(); this.refreshSupply && this.refreshSupply(); this.econ.refreshAccess(); };
  var baseStep = War.step;
  War.step = function () {
    baseStep.call(this); this.navyDay();
    if (this.day % 10 === 5) { var self = this; this.tags.forEach(function (t) { if (t !== self.player && !self.gone[t]) self.aiNavy(t, false); }); }
  };
  var baseMonth = War.month;
  War.month = function () { baseMonth.call(this); this.navyMonth(); };
  var baseSer = War.serialize;
  War.serialize = function () {
    var s = baseSer.call(this);
    s.navy = { fleets: this.fleets, NV: this.NV, admirals: this.admirals, battles: this.navalBattles, log: this.seaLog || [] };
    s.divRoute = {}; this.divs.forEach(function (d) { if (d.route && d.path.length && d.path[0].sea) s.divRoute[d.id] = [d.route, d.convoy || 0]; });
    return s;
  };
  var baseRestore = War.restore;
  War.restore = function (s) {
    var ok = baseRestore.call(this, s); if (!ok) return ok;
    if (s.navy) {
      this.initSeas(); this.fleets = s.navy.fleets; this.NV = s.navy.NV; this.admirals = s.navy.admirals; this.navalBattles = s.navy.battles || []; this.seaLog = s.navy.log || [];
      var self = this; this.tags.forEach(function (t) { if (!self.NV[t]) self.NV[t] = { convoys: 0, queue: [], stats: { sunk: 0, lost: 0, taken: 0, prizes: 0, convSunk: 0, convLost: 0 }, lostMonth: 0, sunkMonth: 0, cost: 0, built: 0 }; });
      if (s.divRoute) this.divs.forEach(function (d) { var r = s.divRoute[d.id]; if (r) { d.route = r[0]; d.convoy = r[1]; } });
      this.refreshSea();
    } else this.initNavy();
    return ok;
  };
})(typeof window !== 'undefined' ? window : globalThis);
