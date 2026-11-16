// Economy rules and starting data: goods, what people need, buildings, and rough 1805 figures per nation.
// Everything here is a tunable number; the simulation in econ.js reads it and nothing else.
(function (root) {
  'use strict';

  // base = the "normal" price in florins per unit. raw goods come from the land, the rest from buildings.
  var GOODS = [
    { id: 'grain', name: 'Grain', base: 10, raw: true, color: '#dcc462' },
    { id: 'meat', name: 'Livestock', base: 18, raw: true, color: '#c98a66' },
    { id: 'fish', name: 'Fish', base: 12, raw: true, color: '#6aa6cc' },
    { id: 'timber', name: 'Timber', base: 5, raw: true, color: '#5f9455' },
    { id: 'wool', name: 'Wool', base: 8, raw: true, color: '#ece6d6' },
    { id: 'wine', name: 'Wine', base: 15, raw: true, color: '#a04f80' },
    { id: 'iron', name: 'Iron', base: 12, raw: true, color: '#8d939c' },
    { id: 'coal', name: 'Coal', base: 8, raw: true, color: '#4b4b52' },
    { id: 'horses', name: 'Horses', base: 25, raw: true, color: '#b37d3c' },
    { id: 'cloth', name: 'Cloth', base: 20, raw: false, color: '#7f8fd0' },
    { id: 'tools', name: 'Tools', base: 30, raw: false, color: '#b0623c' },
    { id: 'luxuries', name: 'Fine goods', base: 40, raw: false, color: '#d6a1d8' },
    { id: 'muskets', name: 'Muskets', base: 45, raw: false, color: '#7a5a3a' },
    { id: 'artillery', name: 'Artillery', base: 120, raw: false, color: '#3d4a3d' }
  ];

  // Units each 1,000 people want per month, in the order they spend on them.
  var NEEDS = {
    life: { grain: 0.30, meat: 0.05, fish: 0.03, timber: 0.04 },
    daily: { cloth: 0.04, wine: 0.03, tools: 0.01, coal: 0.004 },
    lux: { luxuries: 0.01 }
  };
  // What the state buys per 1,000 people per month when arms purchases are at 100%.
  var ARMS = { muskets: 0.004, artillery: 0.0006, horses: 0.003 };

  // Output per 1,000 land workers per month. Speciality goods are set so a month's work is worth about the same
  // whatever the good; econ.js then decides how much of each district's land goes to its speciality (the rest grows grain).
  var YIELD = { grain: 1.6, meat: 1.45, fish: 2.2, timber: 5.2, wool: 3.25, wine: 1.75, iron: 2.2, coal: 3.25, horses: 1.05 };
  // How well each terrain grows grain.
  var FERTILITY = { p: 1, h: 0.75, m: 0.5, f: 0.6, s: 0.65, d: 0.35 };
  // Workers per km² the land can employ, by terrain.
  var LAND = { p: 22, h: 14, m: 7, f: 9, s: 9, d: 2 };

  var FACTORY_WORKERS = 5000;
  var BUILDINGS = {
    textile: { name: 'Textile mill', kind: 'factory', input: { wool: 7.5 }, output: { cloth: 7.5 }, money: 2600, goods: { timber: 40, tools: 12 }, months: 8, blurb: 'Wool into cloth' },
    ironworks: { name: 'Ironworks', kind: 'factory', input: { iron: 5, coal: 5 }, output: { tools: 5 }, money: 3200, goods: { timber: 40, iron: 20 }, months: 10, blurb: 'Iron and coal into tools' },
    armoury: { name: 'Armoury', kind: 'factory', input: { iron: 2.5, timber: 2.5, tools: 1.25 }, output: { muskets: 3.75 }, money: 3400, goods: { timber: 40, tools: 20 }, months: 10, blurb: 'Iron, timber and tools into muskets' },
    foundry: { name: 'Cannon foundry', kind: 'factory', input: { iron: 5, coal: 5 }, output: { artillery: 1.5 }, money: 3800, goods: { timber: 30, iron: 30, tools: 15 }, months: 12, blurb: 'Iron and coal into artillery' },
    workshop: { name: 'Workshops', kind: 'factory', input: { timber: 2.5, cloth: 2.5 }, output: { luxuries: 3.75 }, money: 2400, goods: { timber: 40, tools: 10 }, months: 8, blurb: 'Timber and cloth into fine goods' },
    estates: { name: 'Improved estates', kind: 'infra', max: 3, money: 1600, goods: { timber: 20, tools: 10 }, months: 6, blurb: '+15% land output per level' },
    roads: { name: 'Roads', kind: 'infra', max: 3, money: 1400, goods: { timber: 30, tools: 6 }, months: 6, blurb: '+5% to everything made here per level' },
    port: { name: 'Port', kind: 'infra', max: 3, coastal: true, money: 2200, goods: { timber: 60, tools: 10 }, months: 9, blurb: 'More foreign trade for the nation' }
  };
  var FACTORY_MAX = 6; // levels of one factory type per province

  // Rough 1805 population (millions) of each nation's territory on this map, and a productivity index.
  var NATION = {
    // the wider world: people are counted province by province there, so only the level of development matters
    USA: [0.1, 1.15], HAI: [0.1, 0.60], TEC: [0.1, 0.40], CRE: [0.1, 0.40], SIO: [0.1, 0.35], COM: [0.1, 0.35], MAP: [0.1, 0.40], ETH: [0.1, 0.45], SOK: [0.1, 0.45], BOR: [0.1, 0.40], SEG: [0.1, 0.40], ASH: [0.1, 0.50], DAH: [0.1, 0.45], OYO: [0.1, 0.45], BEN: [0.1, 0.45], KON: [0.1, 0.40], DAR: [0.1, 0.40], FUN: [0.1, 0.40], MER: [0.1, 0.45], LUN: [0.1, 0.35], LBA: [0.1, 0.35], BUG: [0.1, 0.40], ROZ: [0.1, 0.35], NGU: [0.1, 0.35], FUT: [0.1, 0.40], WAD: [0.1, 0.35], OMA: [0.1, 0.60], YEM: [0.1, 0.50], NAJ: [0.1, 0.45], AFG: [0.1, 0.50], BUK: [0.1, 0.50], KHI: [0.1, 0.45], KOK: [0.1, 0.50], KAZ: [0.1, 0.40], MAR: [0.1, 0.55], HYD: [0.1, 0.55], MYS: [0.1, 0.60], TRA: [0.1, 0.55], OUD: [0.1, 0.55], SIK: [0.1, 0.60], RAJ: [0.1, 0.50], NEP: [0.1, 0.50], SIN: [0.1, 0.50], KAN: [0.1, 0.45], AHO: [0.1, 0.45], BUR: [0.1, 0.50], SIA: [0.1, 0.55], VIE: [0.1, 0.55], JOH: [0.1, 0.50], ACE: [0.1, 0.50], BRN: [0.1, 0.45], SUL: [0.1, 0.45], QNG: [0.1, 0.60], KOR: [0.1, 0.55], JAP: [0.1, 0.70], RYU: [0.1, 0.55], HAW: [0.1, 0.45], MAO: [0.1, 0.40], MEX: [0.1, 0.70], GCO: [0.1, 0.65], ARG: [0.1, 0.70], CHL: [0.1, 0.70], PEU: [0.1, 0.65], PAR: [0.1, 0.60], BRZ: [0.1, 0.65],
    FRA: [37, 1.10], GBR: [16.5, 1.35], AUS: [23, 0.95], PRU: [10, 1.00], RUS: [38, 0.80], SPA: [11, 0.90], OTT: [23, 0.75],
    POR: [3, 0.90], SWE: [3.3, 0.95], DEN: [2.5, 1.00], BAT: [2.1, 1.20], SWI: [1.7, 1.10], VAL: [0.06, 0.90], ITA: [3.8, 1.05],
    NAP: [6.5, 0.85], SAR: [0.5, 0.80], PAP: [2.4, 0.85], ETR: [1.2, 1.00], BAV: [2.9, 1.00], WUR: [0.95, 1.00], BAD: [0.5, 1.00],
    SAX: [2.0, 1.10], HAN: [1.0, 1.00], HES: [0.55, 1.00], HDA: [0.5, 1.00], NAS: [0.27, 1.00], BRG: [0.3, 1.05], BRU: [0.2, 1.00],
    OLD: [0.16, 0.95], MEC: [0.4, 0.90], THU: [0.4, 1.00], SZB: [0.25, 0.95], HAM: [0.13, 1.25], BRE: [0.05, 1.25], LUB: [0.045, 1.20],
    FRK: [0.05, 1.25], WAL: [1.0, 0.70], MOL: [0.8, 0.70], RAG: [0.035, 1.10], SEP: [0.2, 0.85], MON: [0.06, 0.55], ALG: [2.0, 0.65],
    TUN: [1.0, 0.65], TRI: [0.4, 0.60], MOR: [2.5, 0.65], PER: [2.0, 0.70], IME: [0.15, 0.60], CAU: [0.6, 0.55]
  };

  // Provinces that held a great city in 1805 carry more people than their land alone would.
  var CITIES = {
    'London': 6, 'Paris': 5, 'Constantinople': 6, 'Naples': 4, 'Moscow': 3, 'St. Petersburg': 3.5, 'Vienna': 3.5, 'Amsterdam': 3, 'Lisbon': 3.5,
    'Madrid': 3, 'Milan': 2, 'Venice': 2.5, 'Rome': 2.5, 'Lyon': 2, 'Marseille': 2, 'Berlin': 3, 'Hamburg': 1, 'Copenhagen': 3, 'Stockholm': 3,
    'Dublin': 2, 'Edinburgh': 1.8, 'Glasgow': 1.8, 'Manchester': 2.2, 'Liverpool': 2, 'Birmingham': 2, 'Bristol': 1.6, 'Leeds': 1.8,
    'Barcelona': 2, 'Seville': 1.8, 'Cádiz': 1.8, 'Valencia': 1.6, 'Porto': 1.6, 'Bordeaux': 1.6, 'Rouen': 1.5, 'Nantes': 1.4, 'Lille': 1.5,
    'Brussels': 1.6, 'Antwerp': 1.5, 'Ghent': 1.5, 'Genoa': 1.8, 'Turin': 1.8, 'Florence': 1.6, 'Bologna': 1.4, 'Palermo': 2, 'Warsaw': 1.8,
    'Prague': 1.8, 'Buda': 1.6, 'Munich': 1.5, 'Dresden': 1.6, 'Breslau': 1.5, 'Königsberg': 1.5, 'Danzig': 1.5, 'Riga': 1.4, 'Kiev': 1.3,
    'Smyrna': 2.5, 'Salonica': 2, 'Adrianople': 2, 'Bucharest': 1.6, 'Aleppo': 2.5, 'Damascus': 2.5, 'Baghdad': 2, 'Bursa': 1.6,
    'Cairo': 9, 'Alexandria': 3, 'Tanta': 6, 'Damietta': 4, 'Rosetta': 4, 'Tunis': 2.5, 'Algiers': 2, 'Fez': 2.5, 'Tabriz': 2.5,
    'The Hague': 2, 'Rotterdam': 2, 'Cologne': 1.4, 'Frankfurt': 1, 'Malta': 3, 'Gibraltar': 0.3
  };

  // Known mining, fishing, wine and horse districts. Everything else is decided from terrain in econ.js.
  var RESOURCE = {
    iron: ['Falun', 'Gävle', 'Västerås', 'Örebro', 'Leoben', 'Bilbao', 'Tula', 'Metz', 'Nancy', 'Amberg', 'Kielce', 'Neusohl', 'Elba', 'Birmingham', 'Arnsberg', 'Chemnitz', 'Olonets', 'Klagenfurt', 'Namur', 'Oviedo', 'Charleville', 'Gotha'],
    coal: ['Newcastle', 'Leeds', 'Sheffield', 'Cardiff', 'Swansea', 'Manchester', 'Glasgow', 'Mons', 'Liège', 'Hamm', 'Saarbrücken', 'Saint-Étienne', 'Oppeln', 'Ratibor', 'Nottingham', 'Lancaster', 'Pilsen', 'Wesel', 'Aix-la-Chapelle', 'Edinburgh', 'Teschen'],
    fish: ['Bergen', 'Ålesund', 'Stavanger', 'Bodø', 'Namsos', 'Faroe Islands', 'Hull', 'Aberdeen', 'Wick', 'Brest', 'Saint-Brieuc', 'Vigo', 'La Coruña', 'Leeuwarden', 'Kem', 'Plymouth', 'Truro', 'Galway', 'Fort William', 'Trondheim', 'Middelburg', 'Faro', 'Boulogne', 'Visby', 'Bornholm', 'Jersey', 'Astrakhan', 'Zara', 'Mo i Rana', 'Onega'],
    wine: ['Bordeaux', 'Dijon', 'Reims', 'Porto', 'Cádiz', 'Miskolc', 'Mâcon', 'Montpellier', 'Nîmes', 'Angers', 'Tours', 'Coblenz', 'Mainz', 'Florence', 'Siena', 'Málaga', 'Logroño', 'Trapani', 'Candia', 'Cephalonia', 'Zante', 'Naxos', 'Colmar', 'Troyes', 'Lausanne'],
    horses: ['Cherkassk', 'Kalmyk Steppe', 'Debrecen', 'Kecskemét', 'Schwerin', 'Córdoba', 'Celle', 'Manych', 'Stavropol', 'Szolnok', 'Tilsit', 'Gumbinnen', 'Alençon', 'Konya', 'Kizlyar', 'Poltava', 'Kharkov', 'Lipetsk', 'Meknes', 'Tiaret']
  };

  root.ECON_DATA = { GOODS: GOODS, NEEDS: NEEDS, ARMS: ARMS, YIELD: YIELD, FERTILITY: FERTILITY, LAND: LAND, FACTORY_WORKERS: FACTORY_WORKERS, BUILDINGS: BUILDINGS, FACTORY_MAX: FACTORY_MAX, NATION: NATION, CITIES: CITIES, RESOURCE: RESOURCE };
})(typeof window !== 'undefined' ? window : globalThis);
