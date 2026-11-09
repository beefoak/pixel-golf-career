// Golfer attributes, skill web, derived shot stats, pressure & momentum
(function () {
  'use strict';
  var BR = PG.BRANCH = {
    prec: { n: 'Precision', a: -90, c: '#4aa3ff', d: 'Accuracy & swing meter speed' },
    pow: { n: 'Power', a: 0, c: '#ff6b4a', d: 'Distance' },
    comp: { n: 'Composure', a: 90, c: '#5ccf6a', d: 'Pure zone, wind & bad lies, playoffs' },
    conf: { n: 'Confidence', a: 180, c: '#ffc93a', d: 'Momentum, protecting leads, comebacks' }
  };
  PG.ATTRS = ['prec', 'pow', 'comp', 'conf'];
  var PERKS = PG.PERKS = {
    steady: 'Steady Hands: swing meter 6% slower',
    surgeon: 'Surgeon: 15% tighter dispersion inside 150 yds',
    bigturn: 'Big Turn: +3% carry with woods',
    bomber: 'Bomber: +3% carry with every club',
    unflap: 'Unflappable: wind effect -12%',
    icewater: 'Ice Water: pressure effects -30%',
    swagger: 'Swagger: birdies give double momentum',
    closer: 'Closer: when you lead a final round, chasers wilt (+0.6 strokes)',
    ctrlagg: 'Controlled Aggression: +2% carry, no accuracy cost',
    stinger: 'Stinger: woods & hybrids ignore 15% of wind',
    tempo: 'Smooth Tempo: +0.6 pure zone',
    escape: 'Escape Artist: rough & sand penalties -20%',
    grinder: 'Grinder: momentum losses halved',
    fortress: 'Mental Fortress: pressure effects -25%',
    reader: 'Green Reader: putt preview +25% longer',
    clutchputt: 'Clutch Putter: putts inside 5 yds ignore pressure'
  };

  // ---------- skill web ----------
  var ORDER = ['prec', 'pow', 'comp', 'conf'];
  var TIER_BONUS = [5, 5, 6, 6, 7, 9];
  var TIER_COST = [6, 9, 12, 16, 20, 28];
  var TIER_PERK = {
    prec: { 2: 'steady', 5: 'surgeon' }, pow: { 2: 'bigturn', 5: 'bomber' },
    comp: { 2: 'unflap', 5: 'icewater' }, conf: { 2: 'swagger', 5: 'closer' }
  };
  var HYB = [ // between ORDER[i] and ORDER[i+1]
    { inner: 'ctrlagg', outer: 'stinger' },
    { inner: 'tempo', outer: 'escape' },
    { inner: 'grinder', outer: 'fortress' },
    { inner: 'reader', outer: 'clutchputt' }
  ];
  var NODES = [], NODE = {};
  NODES.push({ id: 'core', x: 0, y: 0, br: [], cost: {}, bonus: {}, req: [], tier: 0 });
  ORDER.forEach(function (b) {
    var a = BR[b].a * Math.PI / 180;
    for (var t = 0; t < 6; t++) {
      var r = 52 + t * 40, bonus = {}, cost = {};
      bonus[b] = TIER_BONUS[t]; cost[b] = TIER_COST[t];
      NODES.push({ id: b + t, x: Math.cos(a) * r, y: Math.sin(a) * r, br: [b], cost: cost, bonus: bonus, perk: TIER_PERK[b][t] || null, req: [t === 0 ? 'core' : b + (t - 1)], reqAll: false, tier: t + 1 });
    }
  });
  ORDER.forEach(function (b, i) {
    var b2 = ORDER[(i + 1) % 4];
    var a = (BR[b].a + 45) * Math.PI / 180;
    var hi = { id: 'h' + i + 'i', x: Math.cos(a) * 128, y: Math.sin(a) * 128, br: [b, b2], cost: {}, bonus: {}, perk: HYB[i].inner, req: [b + '1', b2 + '1'], reqAll: false, tier: 3 };
    hi.cost[b] = 8; hi.cost[b2] = 8; hi.bonus[b] = 3; hi.bonus[b2] = 3;
    var ho = { id: 'h' + i + 'o', x: Math.cos(a) * 236, y: Math.sin(a) * 236, br: [b, b2], cost: {}, bonus: {}, perk: HYB[i].outer, req: ['h' + i + 'i', b + '3', b2 + '3'], reqOne: true, tier: 5 };
    ho.cost[b] = 16; ho.cost[b2] = 16; ho.bonus[b] = 3; ho.bonus[b2] = 3;
    NODES.push(hi, ho);
  });
  NODES.forEach(function (n) { NODE[n.id] = n; });
  PG.NODES = NODES; PG.NODE = NODE;

  PG.nodeAvailable = function (g, id) {
    var n = NODE[id];
    if (g.nodes.indexOf(id) >= 0) return false;
    if (n.reqOne) { // outer hybrid: needs inner hybrid AND one of the tier-4 branch nodes
      return g.nodes.indexOf(n.req[0]) >= 0 && (g.nodes.indexOf(n.req[1]) >= 0 || g.nodes.indexOf(n.req[2]) >= 0);
    }
    return n.req.some(function (r) { return r === 'core' || g.nodes.indexOf(r) >= 0; });
  };
  // SP from a branch pool, topped up by flex points
  PG.nodeAffordable = function (g, id) {
    var n = NODE[id], need = 0;
    for (var b in n.cost) need += Math.max(0, n.cost[b] - g.sp[b]);
    return need <= g.sp.flex;
  };
  PG.buyNode = function (g, id) {
    if (!PG.nodeAvailable(g, id) || !PG.nodeAffordable(g, id)) return false;
    var n = NODE[id];
    for (var b in n.cost) {
      var fromB = Math.min(g.sp[b], n.cost[b]);
      g.sp[b] -= fromB; g.sp.flex -= (n.cost[b] - fromB);
    }
    g.nodes.push(id);
    return true;
  };

  PG.attrs = function (g) {
    var a = { prec: g.base.prec, pow: g.base.pow, comp: g.base.comp, conf: g.base.conf };
    g.nodes.forEach(function (id) { var n = NODE[id]; if (!n) return; for (var b in n.bonus) a[b] += n.bonus[b]; });
    PG.ATTRS.forEach(function (k) { a[k] = Math.min(99, a[k]); });
    return a;
  };
  PG.perkSet = function (g) {
    var p = {};
    g.nodes.forEach(function (id) { var n = NODE[id]; if (n && n.perk) p[n.perk] = true; });
    return p;
  };
  PG.overall = function (a) { return Math.round((a.prec * 1.1 + a.pow + a.comp + a.conf * 0.9) / 4); };

  // Base derived stats for a golfer
  PG.makeStats = function (g) {
    var a = PG.attrs(g), pk = PG.perkSet(g);
    var s = {
      a: a, perks: pk,
      distMult: 0.86 + a.pow * 0.0026,
      dispMult: 1.9 - a.prec * 0.0145,
      meterSpeed: 1.32 - a.prec * 0.0058,
      pureHalf: 1.8 + a.comp * 0.055,
      windRes: a.comp * 0.0035,
      adverse: a.comp * 0.004,
      pressRes: PG.clamp(a.comp * 0.0045 + a.conf * 0.0025, 0, 0.75)
    };
    if (pk.steady) s.meterSpeed *= 0.94;
    if (pk.bomber) s.distMult *= 1.03;
    if (pk.ctrlagg) s.distMult *= 1.02;
    if (pk.unflap) s.windRes += 0.12;
    if (pk.tempo) s.pureHalf += 0.6;
    if (pk.escape) s.adverse += 0.2;
    return s;
  };

  // Apply momentum, pressure and club grip/shaft modifiers -> per-shot stats
  PG.shotStats = function (base, mom, pressure, mods, ctx) {
    var s = {}; for (var k in base) s[k] = base[k];
    mods = mods || {}; ctx = ctx || {};
    var pe = pressure || 0;
    if (base.perks.icewater) pe *= 0.7;
    if (base.perks.fortress) pe *= 0.75;
    if (ctx.playoff && mods.ice) pe = 0;
    if (ctx.shortPutt && base.perks.clutchputt) pe = 0;
    pe *= (1 - base.pressRes) * (1 - (mods.clutch || 0) / 100);
    s.pe = pe;
    s.pureHalf = (base.pureHalf + (mods.pure || 0)) * (1 - 0.35 * pe);
    s.meterSpeed = base.meterSpeed * (1 - (mods.tempo || 0) / 100) * (1 + 0.3 * pe);
    s.jitter = 0.04 + pe * 0.25;
    if (mom > 0) { s.pureHalf += mom * 0.25; s.distMult = base.distMult * (1 + mom * 0.004); }
    if (mom < 0) { s.meterSpeed *= 1 - mom * 0.03; }
    return s;
  };

  // Pressure for a shot given tournament situation
  PG.situationPressure = function (sit) {
    // sit: {finalRound, holeIdx, behind (strokes behind leader, negative = leading), playoff, keyPutt, conf}
    var p = 0;
    if (sit.playoff) p = 0.85;
    else if (sit.finalRound && sit.behind <= 3) p = 0.25 + (sit.holeIdx >= 14 ? 0.3 : sit.holeIdx >= 9 ? 0.12 : 0);
    else if (sit.behind <= 1 && sit.roundIdx > 0) p = 0.12;
    if (sit.keyPutt) p += 0.1;
    // Confidence: protects leads, but low confidence makes chasing harder
    var c = sit.conf || 50;
    if (sit.behind < 0) p *= 1.1 - c / 120;
    else if (sit.behind > 0 && p > 0) p *= 1 + Math.max(0, (55 - c)) / 60;
    return PG.clamp(p, 0, 1);
  };

  PG.momentumAfterHole = function (mom, diff, perks, comp) {
    var gain = 0;
    if (diff <= -2) gain = 1.2; else if (diff === -1) gain = 0.55; else if (diff === 0) gain = 0.05; else if (diff === 1) gain = -0.6; else gain = -1.1;
    if (gain > 0 && perks.swagger) gain *= 2;
    if (gain < 0) { gain *= (1 - comp / 220); if (perks.grinder) gain *= 0.5; }
    var m = mom * 0.88 + gain;
    return PG.clamp(m, -3, 3);
  };

  // ---------- training ----------
  PG.DRILLS = [
    { id: 'range', n: 'Driving Range', d: 'Bomb drivers until your hands hurt.', sp: { pow: 3 }, icon: '⚡' },
    { id: 'target', n: 'Target Practice', d: 'Flag-hunting with mid-irons and wedges.', sp: { prec: 3 }, icon: '◎' },
    { id: 'putt', n: 'Pressure Putting', d: 'Make 50 straight four-footers. Miss? Start over.', sp: { comp: 3 }, icon: '◉' },
    { id: 'mental', n: 'Mental Coach', d: 'Visualization and swagger reps.', sp: { conf: 3 }, icon: '★' },
    { id: 'round', n: 'Practice Round', d: 'A bit of everything.', sp: { prec: 1, pow: 1, comp: 1, conf: 1 }, icon: '⛳' },
    { id: 'coach', n: 'Tour Coach', d: 'Paid private lesson. +6 SP to your weakest branch.', sp: {}, paid: true, icon: '$' }
  ];
  PG.coachCost = function (tier) { return [400, 3000, 15000, 60000][tier]; };
})();
