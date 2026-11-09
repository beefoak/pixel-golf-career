// Pixel Golf Career - core utilities & static data
var PG = {};
(function () {
  'use strict';

  // ---------- RNG ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function RNG(seed) { this.seed = (seed >>> 0) || 1; this.f = mulberry32(this.seed); }
  RNG.prototype.next = function () { return this.f(); };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this.f(); };
  RNG.prototype.int = function (a, b) { return Math.floor(a + (b - a + 1) * this.f()); };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.f() * arr.length)]; };
  RNG.prototype.chance = function (p) { return this.f() < p; };
  RNG.prototype.normal = function (m, s) {
    var u = 1 - this.f(), v = this.f();
    return (m || 0) + (s === undefined ? 1 : s) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  RNG.prototype.weighted = function (weights) { // returns index
    var tot = 0, i; for (i = 0; i < weights.length; i++) tot += weights[i];
    var r = this.f() * tot;
    for (i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
    return weights.length - 1;
  };
  RNG.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(this.f() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  };
  PG.RNG = RNG;
  PG.R = new RNG(((Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 4294967295)) >>> 0);

  PG.hash = function () {
    var h = 2166136261 >>> 0;
    for (var k = 0; k < arguments.length; k++) {
      var s = String(arguments[k]);
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= 0x9e37; h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  PG.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  PG.lerp = function (a, b, t) { return a + (b - a) * t; };
  PG.dist = function (ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); };
  PG.money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  PG.toPar = function (n) { return n === 0 ? 'E' : (n > 0 ? '+' + n : '' + n); };
  PG.uid = function () { return PG.R.int(0, 2e9).toString(36) + (Date.now() % 1e7).toString(36); };
  PG.ordinal = function (n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  PG.esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  PG.scoreName = function (d, par) {
    if (d <= -3) return par - d === 1 || d === -par + 1 ? 'Hole in One!' : 'Albatross!';
    return { '-2': 'Eagle', '-1': 'Birdie', '0': 'Par', '1': 'Bogey', '2': 'Double Bogey', '3': 'Triple Bogey' }[d] || ('+' + d);
  };

  // ---------- Clubs (fixed bag distribution) ----------
  PG.CLUBS = [
    { id: 'D', name: 'Driver', cat: 'wood', carry: 242, roll: 0.13, apex: 30, disp: 1.25, spin: 0.20 },
    { id: '3W', name: '3 Wood', cat: 'wood', carry: 222, roll: 0.11, apex: 29, disp: 1.15, spin: 0.28 },
    { id: '5W', name: '5 Wood', cat: 'wood', carry: 208, roll: 0.09, apex: 30, disp: 1.10, spin: 0.34 },
    { id: '4H', name: '4 Hybrid', cat: 'hybrid', carry: 195, roll: 0.08, apex: 30, disp: 1.05, spin: 0.40 },
    { id: '5I', name: '5 Iron', cat: 'iron', carry: 183, roll: 0.07, apex: 29, disp: 1.00, spin: 0.48 },
    { id: '6I', name: '6 Iron', cat: 'iron', carry: 172, roll: 0.065, apex: 30, disp: 0.97, spin: 0.55 },
    { id: '7I', name: '7 Iron', cat: 'iron', carry: 161, roll: 0.06, apex: 31, disp: 0.94, spin: 0.62 },
    { id: '8I', name: '8 Iron', cat: 'iron', carry: 149, roll: 0.05, apex: 32, disp: 0.91, spin: 0.70 },
    { id: '9I', name: '9 Iron', cat: 'iron', carry: 137, roll: 0.045, apex: 33, disp: 0.88, spin: 0.78 },
    { id: 'PW', name: 'Pitching Wedge', cat: 'wedge', carry: 124, roll: 0.04, apex: 33, disp: 0.85, spin: 0.86 },
    { id: 'GW', name: 'Gap Wedge', cat: 'wedge', carry: 109, roll: 0.035, apex: 34, disp: 0.83, spin: 0.92 },
    { id: 'SW', name: 'Sand Wedge', cat: 'wedge', carry: 93, roll: 0.03, apex: 35, disp: 0.81, spin: 1.00 },
    { id: 'LW', name: 'Lob Wedge', cat: 'wedge', carry: 76, roll: 0.025, apex: 37, disp: 0.80, spin: 1.06 },
    { id: 'PT', name: 'Putter', cat: 'putter', carry: 0, roll: 0, apex: 0, disp: 0.5, spin: 0 }
  ];
  PG.CLUB = {};
  PG.CLUBS.forEach(function (c) { PG.CLUB[c.id] = c; });
  PG.SLOTS = PG.CLUBS.map(function (c) { return c.id; });

  // ---------- Rarity ----------
  PG.RARITY = [null,
    { n: 'Common', c: '#b8bcc2', price: 120, scrap: 5 },
    { n: 'Uncommon', c: '#5ccf6a', price: 450, scrap: 15 },
    { n: 'Rare', c: '#4aa3ff', price: 1600, scrap: 45 },
    { n: 'Epic', c: '#c06cff', price: 6000, scrap: 140 },
    { n: 'Legendary', c: '#ffa53a', price: 21000, scrap: 450 }
  ];

  // ---------- Modifiers ----------
  // t: value range per tier (1..5); null = not available at that tier. club: full | putter | any
  PG.MODS = {
    dist: { l: '+{v} yd carry', parts: 'head shaft', club: 'full', t: [[1, 2], [2, 4], [4, 6], [6, 9], [9, 14]] },
    acc: { l: '{v}% tighter dispersion', parts: 'head shaft grip', club: 'any', t: [[2, 3], [3, 5], [5, 8], [8, 12], [12, 18]] },
    forg: { l: '{v}% mishit forgiveness', parts: 'head', club: 'full', t: [[3, 5], [5, 8], [8, 12], [12, 18], [18, 26]] },
    draw: { l: '{v}% more draw', parts: 'head shaft', club: 'full', t: [[4, 7], [7, 11], [11, 16], [16, 23], [24, 32]] },
    fade: { l: '{v}% more fade', parts: 'head shaft', club: 'full', t: [[4, 7], [7, 11], [11, 16], [16, 23], [24, 32]] },
    spin: { l: '+{v}% spin', parts: 'head grip', club: 'full', t: [[3, 5], [5, 8], [8, 12], [12, 17], [17, 24]] },
    roll: { l: '+{v}% roll', parts: 'head shaft', club: 'full', t: [[3, 5], [5, 8], [8, 12], [12, 17], [17, 24]] },
    wind: { l: '{v}% wind resistance', parts: 'head shaft', club: 'full', t: [null, [4, 7], [7, 11], [11, 16], [16, 24]] },
    rough: { l: '{v}% better from rough', parts: 'head', club: 'full', t: [null, [6, 10], [10, 16], [16, 24], [24, 35]] },
    sand: { l: '{v}% better from sand', parts: 'head', club: 'full', t: [null, [8, 12], [12, 20], [20, 30], [30, 45]] },
    pure: { l: '+{v} pure zone', parts: 'grip shaft', club: 'any', dec: 1, t: [null, [0.3, 0.5], [0.5, 0.9], [0.9, 1.4], [1.4, 2.2]] },
    tempo: { l: '{v}% slower meter', parts: 'grip shaft', club: 'any', t: [null, null, [3, 5], [5, 8], [8, 12]] },
    clutch: { l: '{v}% less pressure', parts: 'grip', club: 'any', t: [null, null, [10, 15], [15, 22], [22, 32]] },
    line: { l: '{v}% truer putt line', parts: 'head grip', club: 'putter', t: [[4, 7], [7, 11], [11, 16], [16, 23], [23, 32]] },
    speed: { l: '{v}% putt speed control', parts: 'head shaft grip', club: 'putter', t: [[4, 7], [7, 11], [11, 16], [16, 23], [23, 32]] },
    read: { l: '+{v}% green read', parts: 'head grip', club: 'putter', t: [null, [5, 10], [10, 15], [15, 25], [25, 40]] }
  };
  // Legendary-only unique effects
  PG.UNIQUES = {
    streak: { l: 'Hot Streak: +2% carry per straight par-or-better hole (max +10%)', parts: 'head', club: 'full' },
    laser: { l: 'Laser: small mishits fly dead straight', parts: 'shaft', club: 'full' },
    boomer: { l: 'Boomer: +25% roll on firm ground', parts: 'shaft', club: 'full' },
    ice: { l: 'Ice Veins: immune to playoff pressure', parts: 'grip', club: 'any' },
    magnet: { l: 'Magnet Cup: +60% cup capture radius', parts: 'head', club: 'putter' },
    lag: { l: 'Lag Master: long putts never come up short by >10%', parts: 'shaft', club: 'putter' }
  };

  // ---------- Golf balls ----------
  PG.BALLS = {
    range: { n: 'Range Rock', r: 1, dist: -3, spin: -15, wind: 0, putt: -4, price: 0, desc: 'Scuffed range ball. Free, infinite, awful.' },
    basic: { n: 'Pixel Two-Piece', r: 1, dist: 0, spin: 0, wind: 0, putt: 0, price: 40, desc: 'Durable, honest, average.' },
    soft: { n: 'Featherfeel Soft', r: 2, dist: -1, spin: 12, wind: 0, putt: 6, price: 70, desc: 'Soft core. Grabs greens, gentle off the putter.' },
    rocket: { n: 'Rocket Distance', r: 2, dist: 3, spin: -18, wind: 0, putt: -2, price: 80, desc: 'Hot core for distance. Runs out on greens.' },
    tour: { n: 'Tour Urethane', r: 3, dist: 1.5, spin: 18, wind: 0, putt: 4, price: 180, desc: 'Urethane cover with tour-level spin.' },
    storm: { n: 'Stormpiercer', r: 3, dist: 2, spin: -5, wind: 20, putt: 0, price: 200, desc: 'Aerodynamic dimples that bore through wind.' },
    prox: { n: 'Tour Pro X', r: 4, dist: 3, spin: 22, wind: 8, putt: 6, price: 450, desc: 'Elite 5-piece ball. Speed and stop.' },
    comet: { n: 'Comet Prototype', r: 5, dist: 5, spin: 28, wind: 15, putt: 10, price: 1600, desc: 'An unreleased prototype. Shouldn\'t exist.' }
  };

  // ---------- Tours ----------
  PG.TOURS = [
    { n: 'County Amateur Circuit', short: 'Amateur', rounds: 2, field: 36, mean: 8.5, sd: 3.0, purse: 8000, cut: false, len: 0.90, fair: 1.2, green: 1.35, haz: 0.65, wind: 7, rarity: [60, 30, 9, 1, 0] },
    { n: 'Regional Pro Series', short: 'Regional', rounds: 3, field: 54, mean: 4.0, sd: 2.3, purse: 90000, cut: false, len: 0.95, fair: 1.08, green: 1.24, haz: 0.85, wind: 10, rarity: [40, 38, 18, 4, 0.3] },
    { n: 'Challenger Tour', short: 'Challenger', rounds: 4, field: 72, mean: 1.0, sd: 1.9, purse: 600000, cut: true, len: 1.0, fair: 1.0, green: 1.14, haz: 1.0, wind: 13, rarity: [25, 38, 27, 9, 1] },
    { n: 'World Tour', short: 'World', rounds: 4, field: 90, mean: -1.0, sd: 1.7, purse: 5000000, cut: true, len: 1.04, fair: 0.93, green: 1.04, haz: 1.15, wind: 15, rarity: [12, 30, 35, 19, 4] }
  ];
  PG.EVENTS_PER_SEASON = 12;
  PG.PROMOTE_TOP = 5;

  // ---------- Themes ----------
  PG.THEMES = {
    parkland: { n: 'Parkland', suffix: ['Country Club', 'Golf Club', 'National'], trees: 1.0, water: 0.4, sand: 1.0, waste: false, coast: false, pot: false,
      pal: { ob: '#2f4a2a', deep: '#3f6b33', rough: '#4f8a3c', fair: '#6fb84a', fringe: '#7fcc58', green: '#8ee06a', sand: '#e8d7a0', water: '#3b78c4', tee: '#78c452', waste: '#c9b27a', tree: '#2b5e2b', tree2: '#3d7d36', trunk: '#4a3520' } },
    links: { n: 'Links', suffix: ['Links', 'Golf Links', 'Old Course'], trees: 0.12, water: 0.15, sand: 1.7, waste: false, coast: false, pot: true,
      pal: { ob: '#5a6a3c', deep: '#a3a35a', rough: '#86a052', fair: '#a7c467', fringe: '#b2d071', green: '#bfdc7a', sand: '#efe2b6', water: '#4a7fa8', tee: '#a7c467', waste: '#c9b27a', tree: '#4a6a32', tree2: '#5d8040', trunk: '#4a3520' } },
    desert: { n: 'Desert', suffix: ['Desert Club', 'Canyon Club', 'Mesa Golf Club'], trees: 0.35, water: 0.3, sand: 1.1, waste: true, coast: false, pot: false,
      pal: { ob: '#b5814f', deep: '#d6a76b', rough: '#8fa14d', fair: '#79b34c', fringe: '#86c457', green: '#93d566', sand: '#f2deaa', water: '#3a8ac0', tee: '#79b34c', waste: '#dcb67c', tree: '#5d7a3a', tree2: '#76944a', trunk: '#5a4025' } },
    coastal: { n: 'Coastal', suffix: ['Ocean Course', 'Bay Club', 'Shores'], trees: 0.5, water: 0.55, sand: 1.2, waste: false, coast: true, pot: false,
      pal: { ob: '#33603a', deep: '#4c7d3d', rough: '#5c9845', fair: '#76c254', fringe: '#84cf5e', green: '#94e06d', sand: '#f0e2b0', water: '#2f6fb8', tee: '#76c254', waste: '#c9b27a', tree: '#2f6a3a', tree2: '#418a48', trunk: '#4a3520' } },
    pine: { n: 'Pine Forest', suffix: ['Pines', 'Forest Club', 'Timbers'], trees: 1.7, water: 0.3, sand: 0.8, waste: false, coast: false, pot: false,
      pal: { ob: '#22402a', deep: '#33603a', rough: '#467e3e', fair: '#64ab4c', fringe: '#72bd55', green: '#83d062', sand: '#e4d4a2', water: '#336fb0', tee: '#64ab4c', waste: '#c9b27a', tree: '#1d4a2c', tree2: '#2a643a', trunk: '#3d2a18' } }
  };
  PG.THEME_KEYS = Object.keys(PG.THEMES);

  // ---------- Names ----------
  PG.FIRST = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Taylor', 'Jamie', 'Kai', 'Rowan', 'Ellis', 'Quinn', 'Hayden', 'Sasha', 'Nico', 'Mateo', 'Lars', 'Ivo', 'Kenji', 'Ravi', 'Tomas', 'Felix', 'Hugo', 'Oskar', 'Arlo', 'Emil', 'Diego', 'Rafael', 'Seo-jun', 'Haruto', 'Liam', 'Noah', 'Owen', 'Callum', 'Finn', 'Duncan', 'Ari', 'Bram', 'Cyrus', 'Dev', 'Ezra', 'Gus', 'Hank', 'Jude', 'Milo', 'Otis', 'Pax', 'Reed', 'Silas', 'Wes'];
  PG.LAST = ['Ashford', 'Bellamy', 'Carver', 'Delacroix', 'Eastwood', 'Fairbanks', 'Garrison', 'Holloway', 'Ingram', 'Jensen', 'Kowalski', 'Lindqvist', 'Moreau', 'Nakamura', 'Okafor', 'Pemberton', 'Quill', 'Rasmussen', 'Sandoval', 'Thorne', 'Underhill', 'Vance', 'Whitlock', 'Yamada', 'Zeller', 'Abernathy', 'Brandt', 'Castellano', 'Dunmore', 'Everly', 'Falk', 'Grimsby', 'Hartigan', 'Ishikawa', 'Kingsley', 'Lockhart', 'McAllister', 'Novak', 'Oyelaran', 'Prescott', 'Rourke', 'Strand', 'Talbot', 'Voss', 'Wexley', 'Achterberg', 'Bonfield', 'Crane', 'Drummond', 'Ekwueme'];
  PG.COURSE_A = ['Whispering', 'Copper', 'Saltmarsh', 'Eagle', 'Hollow', 'Granite', 'Silver', 'Cedar', 'Heron', 'Thunder', 'Briar', 'Lantern', 'Red', 'Kingfisher', 'Juniper', 'Blackwater', 'Sunset', 'Highland', 'Fox', 'Raven', 'Willow', 'Iron', 'Amber', 'Stone'];
  PG.COURSE_B = ['Pines', 'Mesa', 'Dunes', 'Ridge', 'Creek', 'Hills', 'Bay', 'Valley', 'Point', 'Glen', 'Harbor', 'Canyon', 'Meadows', 'Bluff', 'Lake', 'Hollow', 'Crossing', 'Heath'];
  PG.EVENT_A = ['Classic', 'Open', 'Invitational', 'Championship', 'Challenge', 'Masters Cup', 'Pro-Am', 'Shootout'];
})();
