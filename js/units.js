// Units, division templates and generals, in the manner of Hearts of Iron IV.
// A division is built from a template: up to 25 battalions in five columns, plus up to five support companies.
// Its stats are the sum (or average) of its parts, adjusted by research, doctrine, experience and its general.
(function (root) {
  'use strict';

  // ---------- battalions ----------
  // atk = attacks it makes each day, def = attacks it can parry when defending, brk = attacks it can parry when attacking,
  // org = organisation (how long it fights before breaking), hp = how much damage it soaks, w = combat width,
  // spd = km a day on the march, sup = supply it eats, eq = arms it needs (units from the arsenal), terr = attack by terrain.
  var BATTALIONS = {
    line: { name: 'Line infantry', cls: 'inf', men: 1000, atk: 8, def: 13, brk: 6, org: 60, hp: 25, w: 2, spd: 20, sup: 0.10, eq: { muskets: 7 }, money: 60, upkeep: 9 },
    light: { name: 'Light infantry', cls: 'inf', men: 800, atk: 8, def: 11, brk: 7, org: 65, hp: 20, w: 2, spd: 22, sup: 0.09, eq: { muskets: 6 }, money: 70, upkeep: 9, terr: { h: 1.25, f: 1.3, s: 1.2, m: 1.3 }, blurb: 'Skirmishers: better in hills, forest and marsh' },
    gren: { name: 'Grenadiers', cls: 'inf', men: 800, atk: 11, def: 15, brk: 10, org: 75, hp: 22, w: 2, spd: 20, sup: 0.11, eq: { muskets: 6 }, money: 110, upkeep: 13, tech: 'grenadiers', blurb: 'Picked men: hit harder, hold longer' },
    mil: { name: 'Militia', cls: 'inf', men: 1000, atk: 4, def: 10, brk: 3, org: 35, hp: 25, w: 2, spd: 18, sup: 0.08, eq: { muskets: 4 }, money: 25, upkeep: 5, blurb: 'Cheap levies: fine behind walls, poor in the open' },
    hus: { name: 'Light cavalry', cls: 'cav', men: 600, atk: 7, def: 4, brk: 12, org: 60, hp: 10, w: 2, spd: 34, sup: 0.14, eq: { horses: 9, muskets: 1 }, money: 90, upkeep: 15, terr: { p: 1.2, d: 1.2, f: 0.7, s: 0.6, m: 0.6 }, blurb: 'Hussars and chasseurs: fast, scout well' },
    dra: { name: 'Dragoons', cls: 'cav', men: 600, atk: 8, def: 7, brk: 10, org: 55, hp: 12, w: 2, spd: 30, sup: 0.14, eq: { horses: 9, muskets: 3 }, money: 90, upkeep: 15, terr: { p: 1.1, d: 1.1, f: 0.85, s: 0.75, m: 0.75 }, blurb: 'Mounted infantry: can fight on foot' },
    cuir: { name: 'Cuirassiers', cls: 'cav', men: 500, atk: 9, def: 5, brk: 20, org: 55, hp: 10, w: 2, spd: 28, sup: 0.15, eq: { horses: 11, muskets: 1 }, money: 120, upkeep: 18, tech: 'heavycav', terr: { p: 1.3, d: 1.2, f: 0.6, s: 0.5, m: 0.5 }, blurb: 'Armoured horse: smash through on open ground' },
    fart: { name: 'Foot artillery', cls: 'art', men: 400, atk: 26, def: 3, brk: 3, org: 0, hp: 6, w: 3, spd: 16, sup: 0.16, eq: { artillery: 6, horses: 4 }, money: 120, upkeep: 14, terr: { f: 0.8, s: 0.8, m: 0.7 }, blurb: '12-pounders: the most attacks, but no organisation of their own' },
    hart: { name: 'Horse artillery', cls: 'art', men: 350, atk: 18, def: 3, brk: 6, org: 0, hp: 5, w: 3, spd: 26, sup: 0.17, eq: { artillery: 4, horses: 8 }, money: 140, upkeep: 16, tech: 'horseart', terr: { f: 0.8, s: 0.8, m: 0.7 }, blurb: 'Light guns that keep up with cavalry' }
  };
  // ---------- support companies (no combat width) ----------
  var SUPPORT = {
    eng: { name: 'Sappers', men: 200, eq: { muskets: 1 }, money: 40, upkeep: 3, def: 3, blurb: '+3 defence, dig in deeper, half the penalty for crossing rivers, +25% against forts' },
    scouts: { name: 'Scouts', men: 150, eq: { horses: 3 }, money: 40, upkeep: 3, blurb: '+8% attack (they find the weak spots), and they see further' },
    surg: { name: 'Field surgeons', men: 100, eq: {}, money: 50, upkeep: 3, blurb: '−25% casualties; veterans are kept when men are replaced' },
    train: { name: 'Supply train', men: 200, eq: { horses: 6 }, money: 50, upkeep: 4, blurb: '−20% supply use, −25% losses to hunger and winter' },
    staff: { name: 'Couriers', men: 100, eq: { horses: 2 }, money: 40, upkeep: 3, blurb: '+25% chance to bring reserves into battle, +20% organisation recovery' },
    siege: { name: 'Siege train', men: 250, eq: { artillery: 4, horses: 8 }, money: 90, upkeep: 6, blurb: 'Mortars, heavy guns and gabions: doubles the division\'s weight in a siege, and −40% to the penalty of attacking a fort' },
    guns: { name: 'Regimental guns', men: 150, eq: { artillery: 2, horses: 2 }, money: 60, upkeep: 4, atk: 7, brk: 1, blurb: '+7 attack, +1 breakthrough' }
  };
  var COLS = 5, ROWS = 5, SUP_SLOTS = 5;

  // ---------- the templates each nation starts with ----------
  // cols: five columns of battalion ids (each column holds one class of battalion), sup: support companies.
  var STD = {
    inf: { name: 'Infantry division', cols: [['line', 'line', 'line'], ['line', 'line', 'line'], ['line', 'line', 'light'], ['fart'], []], sup: [] },
    cav: { name: 'Cavalry division', cols: [['hus', 'hus', 'hus'], ['dra', 'dra'], [], [], []], sup: [] },
    art: { name: 'Artillery reserve', cols: [['line', 'line'], ['line', 'line'], ['fart', 'fart', 'fart'], [], []], sup: [] }
  };
  var START_TEMPLATES = {
    FRA: { inf: { name: 'Corps division', cols: [['line', 'line', 'line'], ['line', 'line', 'line'], ['light', 'light', 'light'], ['fart'], []], sup: ['eng', 'staff'] },
      cav: { name: 'Reserve cavalry', cols: [['cuir', 'cuir'], ['dra', 'dra'], ['hart'], [], []], sup: ['scouts'] },
      art: { name: 'Grand battery', cols: [['line', 'line'], ['gren', 'gren'], ['fart', 'fart', 'fart'], [], []], sup: ['eng'] } },
    GBR: { inf: { name: 'British division', cols: [['line', 'line', 'line'], ['line', 'line', 'line'], ['light', 'light'], ['fart'], []], sup: ['scouts', 'train'] } },
    RUS: { inf: { name: 'Russian division', cols: [['line', 'line', 'line'], ['line', 'line', 'line'], ['line', 'line', 'light'], ['fart', 'fart'], []], sup: [] },
      cav: { name: 'Cossack host', cols: [['hus', 'hus', 'hus'], ['hus', 'dra'], [], [], []], sup: ['scouts'] } },
    AUS: { inf: { name: 'Austrian division', cols: [['line', 'line', 'line'], ['line', 'line', 'line'], ['line', 'line', 'light'], ['fart'], []], sup: ['eng'] },
      cav: { name: 'Austrian horse', cols: [['cuir', 'cuir'], ['hus', 'hus'], ['dra'], [], []], sup: [] } },
    PRU: { inf: { name: 'Prussian division', cols: [['line', 'line', 'line'], ['line', 'line', 'line'], ['gren', 'light'], ['fart'], []], sup: [] } },
    OTT: { inf: { name: 'Nizam and levies', cols: [['mil', 'mil', 'mil'], ['mil', 'mil', 'mil'], ['line', 'line', 'light'], ['fart'], []], sup: [] },
      cav: { name: 'Sipahi horse', cols: [['hus', 'hus', 'hus'], ['hus', 'hus'], [], [], []], sup: [] } }
  };
  ['PER', 'MOR', 'ALG', 'TUN', 'TRI', 'CAU', 'IME', 'MON', 'WAL', 'MOL'].forEach(function (t) {
    START_TEMPLATES[t] = { inf: { name: 'Levy division', cols: [['mil', 'mil', 'mil'], ['mil', 'mil', 'mil'], ['light', 'light'], [], []], sup: [] },
      cav: { name: 'Tribal horse', cols: [['hus', 'hus', 'hus'], ['hus', 'hus'], [], [], []], sup: [] } };
  });

  // ---------- generals ----------
  // [name, skill, attack, defence, planning, logistics, traits, field marshal?]
  var GENERALS = {
    FRA: [['Napoleon Bonaparte', 5, 5, 4, 5, 4, ['emperor', 'offensive'], 1], ['Louis-Nicolas Davout', 4, 4, 5, 4, 4, ['staff'], 0], ['Jean Lannes', 4, 5, 3, 3, 2, ['offensive'], 0],
      ['Joachim Murat', 3, 5, 1, 2, 2, ['cavalry'], 0], ['Michel Ney', 3, 4, 3, 2, 2, ['offensive'], 0], ['Nicolas Soult', 4, 4, 3, 4, 3, ['staff'], 0], ['André Masséna', 4, 4, 4, 3, 3, ['hills'], 0],
      ['Jean-Baptiste Bernadotte', 3, 3, 3, 3, 3, [], 0], ['Auguste Marmont', 3, 3, 3, 3, 3, ['gunner'], 0], ['Louis-Alexandre Berthier', 3, 1, 2, 5, 5, ['staff', 'logistics'], 1], ['Pierre Augereau', 3, 3, 3, 2, 2, [], 0]],
    AUS: [['Archduke Charles', 4, 4, 4, 4, 3, ['defensive'], 1], ['Karl Mack', 2, 2, 2, 3, 2, [], 0], ['Archduke John', 2, 2, 2, 2, 2, [], 0], ['Karl Schwarzenberg', 3, 3, 3, 3, 4, ['logistics'], 0],
      ['Johann von Hiller', 3, 3, 3, 2, 3, [], 0], ['Johann Liechtenstein', 3, 4, 2, 2, 2, ['cavalry'], 0], ['Michael von Kienmayer', 2, 2, 3, 2, 2, [], 0]],
    RUS: [['Mikhail Kutuzov', 4, 3, 5, 4, 4, ['defensive', 'winter'], 1], ['Pyotr Bagration', 4, 4, 4, 2, 2, ['offensive'], 0], ['Michael Barclay de Tolly', 3, 2, 4, 4, 4, ['logistics'], 0],
      ['Levin Bennigsen', 3, 3, 3, 3, 2, ['winter'], 0], ['Matvei Platov', 3, 4, 1, 2, 3, ['cavalry'], 0], ['Mikhail Miloradovich', 3, 4, 3, 2, 2, ['offensive'], 0], ['Dmitry Dokhturov', 3, 2, 4, 2, 2, ['defensive'], 0]],
    PRU: [['Duke of Brunswick', 2, 2, 2, 3, 2, [], 1], ['Gebhard von Blücher', 3, 5, 2, 2, 2, ['cavalry', 'offensive'], 0], ['Prince Hohenlohe', 2, 2, 2, 2, 2, [], 0],
      ['Gerhard von Scharnhorst', 3, 2, 3, 5, 4, ['staff'], 0], ['August von Gneisenau', 3, 3, 3, 4, 3, ['staff'], 0], ['Ernst von Rüchel', 2, 2, 2, 2, 2, [], 0]],
    GBR: [['Arthur Wellesley', 4, 3, 5, 4, 5, ['defensive', 'logistics'], 1], ['Sir John Moore', 3, 3, 3, 3, 3, ['light'], 0], ['Rowland Hill', 3, 3, 3, 3, 3, [], 0], ['Thomas Graham', 2, 3, 2, 2, 2, [], 0]],
    SPA: [['Francisco Castaños', 2, 2, 3, 2, 2, [], 0], ['Gregorio de la Cuesta', 2, 2, 2, 1, 2, [], 0], ['Joaquín Blake', 2, 2, 2, 2, 2, [], 0], ['Pedro Caro, Marqués de la Romana', 3, 3, 2, 3, 3, [], 0]],
    OTT: [['Alemdar Mustafa Pasha', 3, 3, 3, 2, 2, [], 0], ['Kör Yusuf Ziya Pasha', 2, 2, 3, 2, 2, ['hills'], 0], ['Muhammad Ali', 3, 3, 3, 3, 3, [], 0], ['Ahmed Pasha', 2, 2, 2, 2, 2, [], 0]],
    SWE: [['Georg Carl von Döbeln', 3, 3, 3, 2, 3, ['winter'], 0], ['Gustaf Mauritz Armfelt', 2, 2, 2, 2, 2, [], 0], ['Johan Christopher Toll', 2, 2, 2, 3, 2, [], 0]],
    ITA: [['Eugène de Beauharnais', 3, 3, 3, 3, 3, [], 0]], BAV: [['Karl Philipp von Wrede', 3, 3, 3, 2, 2, [], 0]], PER: [['Abbas Mirza', 3, 3, 3, 2, 2, ['hills'], 0]],
    POR: [['Bernardim Freire', 2, 2, 2, 2, 2, [], 0]], DEN: [['Prince Frederick of Hesse', 2, 2, 2, 2, 2, [], 0]], SAX: [['Johann Adolf von Thielmann', 2, 3, 2, 2, 2, ['cavalry'], 0]]
  };
  var TRAITS = {
    emperor: { name: 'Emperor', blurb: '+15% attack, +10% organisation for every army he leads' },
    offensive: { name: 'Offensive doctrine', blurb: '+10% attack' },
    defensive: { name: 'Defensive doctrine', blurb: '+10% defence, digs in faster' },
    cavalry: { name: 'Cavalry officer', blurb: '+15% attack for cavalry battalions' },
    gunner: { name: 'Artillerist', blurb: '+15% attack for artillery battalions' },
    hills: { name: 'Hill fighter', blurb: '+15% attack and defence in hills and mountains' },
    winter: { name: 'Winter specialist', blurb: 'Half the losses to winter' },
    logistics: { name: 'Logistics wizard', blurb: '−15% supply use, −25% losses to hunger' },
    staff: { name: 'Skilled staffer', blurb: '+20% planning speed, +15% organisation recovery' },
    light: { name: 'Light infantry tactics', blurb: '+15% attack in forest and marsh' },
    veteran: { name: 'Old campaigner', blurb: '+5% attack and defence' },
    brawler: { name: 'Brawler', blurb: '+8% breakthrough' }
  };
  var NAMES = {
    fr: ['Dupont', 'Vandamme', 'Suchet', 'Oudinot', 'Mortier', 'Victor', 'Junot', 'Lefebvre', 'Gouvion', 'Lasalle', 'Friant', 'Morand', 'Gudin', 'Legrand', 'Molitor'],
    de: ['von Kleist', 'von Bülow', 'von Yorck', 'von Tauentzien', 'von Zieten', 'von Lestocq', 'von Grawert', 'von Holtzendorff', 'von Kalckreuth', 'von Schmettau', 'von Stutterheim', 'von Bellegarde', 'von Klenau', 'von Gyulai', 'von Merveldt'],
    ru: ['Raevsky', 'Tuchkov', 'Osterman-Tolstoy', 'Wittgenstein', 'Golitsyn', 'Uvarov', 'Konovnitsyn', 'Sacken', 'Langeron', 'Kamensky', 'Tormasov', 'Essen', 'Buxhoeveden'],
    en: ['Paget', 'Craufurd', 'Picton', 'Beresford', 'Hope', 'Cotton', 'Stuart', 'Spencer', 'Baird', 'Abercromby'],
    es: ['Palafox', 'Venegas', 'Ballesteros', 'Areizaga', 'Reding', 'Freire', 'Morla', 'Mina'],
    it: ['Pino', 'Lechi', 'Fontanelli', 'Teulié', 'Caracciolo', 'Pignatelli', 'Colli', 'Ruffo'],
    ott: ['Hüsrev Pasha', 'Pehlivan Ibrahim', 'Mustafa Bayraktar', 'Hurshid Pasha', 'Ali Pasha', 'Selim Pasha', 'Osman Pasha', 'Ismail Bey'],
    no: ['Stedingk', 'Adlercreutz', 'Klingspor', 'Cronstedt', 'Ewald', 'Castenschiold', 'Wedel', 'Staffeldt'],
    zh: ['Eledengbao', 'Delengtai', 'Yang Yuchun', 'Nayancheng', 'Fu Kang\'an', 'Mingliang', 'Luo Siju', 'Changling', 'Yang Fang', 'Songyun'],
    ja: ['Matsudaira', 'Ii Naoaki', 'Sakai', 'Honda', 'Shimazu', 'Date', 'Maeda', 'Hosokawa', 'Mōri', 'Sanada'],
    ko: ['Yi Yeo-jeol', 'Kim Jo-sun', 'Pak Chong-gyong', 'Yi Hae-u', 'Sin Hong-ju', 'Jeong Man-seok'],
    hi: ['Yashwantrao Holkar', 'Daulat Rao Scindia', 'Raghoji Bhonsle', 'Bapu Gokhale', 'Amir Khan', 'Hari Singh Nalwa', 'Dewan Mokham Chand', 'Mir Alam', 'Purnaiah', 'Amar Singh Thapa', 'Bhimsen Thapa', 'Zalim Singh'],
    sea: ['Maha Bandula', 'Bodawpaya', 'Chao Phraya Bodin', 'Lê Văn Duyệt', 'Nguyễn Văn Thành', 'Phraya Tak', 'Raja Ali', 'Tuanku Ibrahim'],
    af: ['Usman dan Fodio', 'Muhammad Bello', 'Osei Bonsu', 'Ras Gugsa', 'Adandozan', 'Abiodun', 'Mansong Diarra', 'Dingiswayo', 'Zwide', 'Radama', 'Sabun', 'al-Kanemi'],
    na: ['Tecumseh', 'Tenskwatawa', 'Blue Jacket', 'Little Turtle', 'Red Eagle', 'Menawa', 'Little Crow', 'Wabasha', 'Iron Jacket', 'Lautaro', 'Hongi Hika', 'Te Rauparaha'],
    ca: ['Abdullah bin Saud', 'Shah Shuja', 'Fateh Khan', 'Haydar Tura', 'Alim Khan', 'Eltuzar Khan', 'Said bin Sultan', 'Ali Mansur', 'Abu\'l-Khayr', 'Dost Mohammad'],
    us: ['Dearborn', 'Wilkinson', 'Hull', 'Harrison', 'Jackson', 'Scott', 'Brown', 'Pike', 'Macomb', 'Winchester'],
    la: ['Bolívar', 'San Martín', 'Sucre', 'Belgrano', 'O\'Higgins', 'Morelos', 'Hidalgo', 'Páez', 'Santander', 'Artigas', 'Iturbide', 'Dessalines', 'Christophe', 'Pétion'],
    ar: ['Hassan Bey', 'Mehmed Khan', 'Yusuf Karamanli', 'Hammuda Bey', 'Mustafa Khan', 'Ali Khan', 'Suleiman Bey', 'Ahmad Khan']
  };
  var CULTURE = { FRA: 'fr', BAT: 'fr', SWI: 'fr', VAL: 'fr', GBR: 'en', RUS: 'ru', SPA: 'es', POR: 'es', OTT: 'ott', SWE: 'no', DEN: 'no',
    ITA: 'it', NAP: 'it', SAR: 'it', PAP: 'it', ETR: 'it', RAG: 'it', SEP: 'it', USA: 'us', QNG: 'zh', JAP: 'ja', RYU: 'ja', KOR: 'ko', MAR: 'hi', HYD: 'hi', MYS: 'hi', TRA: 'hi', OUD: 'hi', SIK: 'hi', RAJ: 'hi', NEP: 'hi', SIN: 'hi', KAN: 'hi', AHO: 'hi',
    BUR: 'sea', SIA: 'sea', VIE: 'sea', JOH: 'sea', ACE: 'sea', BRN: 'sea', SUL: 'sea', ETH: 'af', SOK: 'af', BOR: 'af', SEG: 'af', ASH: 'af', DAH: 'af', OYO: 'af', BEN: 'af', KON: 'af', DAR: 'af', FUN: 'af',
    MER: 'af', LUN: 'af', LBA: 'af', BUG: 'af', ROZ: 'af', NGU: 'af', FUT: 'af', WAD: 'af', TEC: 'na', CRE: 'na', SIO: 'na', COM: 'na', MAP: 'na', MAO: 'na', HAW: 'na', OMA: 'ca', YEM: 'ca', NAJ: 'ca', AFG: 'ca',
    BUK: 'ca', KHI: 'ca', KOK: 'ca', KAZ: 'ca', HAI: 'la', MEX: 'la', GCO: 'la', ARG: 'la', CHL: 'la', PEU: 'la', PAR: 'la', BRZ: 'la',
    PER: 'ar', MOR: 'ar', ALG: 'ar', TUN: 'ar', TRI: 'ar', CAU: 'ar', IME: 'ru', MON: 'ru', WAL: 'ott', MOL: 'ott' };

  // experience levels, as in HoI4
  var XP_LEVELS = [{ at: 0, name: 'Green', mod: -0.1 }, { at: 0.1, name: 'Trained', mod: 0 }, { at: 0.3, name: 'Regular', mod: 0.1 }, { at: 0.55, name: 'Veteran', mod: 0.25 }, { at: 0.8, name: 'Elite', mod: 0.4 }];

  root.UNITS = { BATTALIONS: BATTALIONS, SUPPORT: SUPPORT, COLS: COLS, ROWS: ROWS, SUP_SLOTS: SUP_SLOTS, STD: STD, START_TEMPLATES: START_TEMPLATES,
    GENERALS: GENERALS, TRAITS: TRAITS, NAMES: NAMES, CULTURE: CULTURE, XP_LEVELS: XP_LEVELS };
})(typeof window !== 'undefined' ? window : globalThis);
