// Career, season, field, tournament logic, rewards, save/load
(function () {
  'use strict';
  var SAVE_KEY = 'pixelgolf.career.v1';

  // ---------- opponent hole-score model ----------
  var BASE_P = [0.008, 0.17, 0.62, 0.17, 0.027, 0.005]; // -2..+3
  var distCache = {};
  function scoreDist(mu) {
    var key = Math.round(mu * 100);
    if (distCache[key]) return distCache[key];
    var lo = -6, hi = 6, p;
    for (var it = 0; it < 40; it++) {
      var th = (lo + hi) / 2, s = 0, mean = 0;
      p = BASE_P.map(function (b, k) { return b * Math.exp(th * (k - 2)); });
      p.forEach(function (v) { s += v; });
      p = p.map(function (v) { return v / s; });
      p.forEach(function (v, k) { mean += v * (k - 2); });
      if (mean < mu) lo = th; else hi = th;
    }
    distCache[key] = p;
    return p;
  }
  function sampleHole(R, mu) { return R.weighted(scoreDist(mu)) - 2; }

  // ---------- career ----------
  PG.newCareer = function (name, alloc) {
    var seed = PG.R.int(1, 2e9);
    var R = new PG.RNG(seed);
    var sb = PG.starterBag(R);
    var c = {
      v: 1, seed: seed, cash: 500, scrap: 20,
      golfer: { name: name, base: { prec: 25 + alloc.prec, pow: 25 + alloc.pow, comp: 25 + alloc.comp, conf: 25 + alloc.conf }, nodes: [], sp: { prec: 0, pow: 0, comp: 0, conf: 0, flex: 6 } },
      inv: sb.inv, bag: sb.bag, balls: { basic: 24 }, ballSel: 'basic',
      tier: 0, season: 1, week: 0, sessions: 3, skipped: false,
      schedule: null, pool: null, pts: 0, wins: 0, seasonWins: 0,
      shop: null, shopWeek: -1, active: null, log: [],
      stats: { events: 0, wins: 0, top10: 0, cuts: 0, earnings: 0, bestRound: null, seasons: [] }
    };
    PG.startSeason(c);
    return c;
  };

  PG.startSeason = function (c) {
    var R = new PG.RNG(PG.hash(c.seed, 'season', c.season, c.tier));
    var tour = PG.TOURS[c.tier];
    c.schedule = [];
    for (var i = 0; i < PG.EVENTS_PER_SEASON; i++) {
      var major = c.tier === 3 && (i === 3 || i === 7 || i === 11);
      var cseed = PG.hash(c.seed, 'course', c.season, c.tier, i);
      var cr = new PG.RNG(cseed);
      var theme = cr.pick(PG.THEME_KEYS);
      var cn = PG.genCourseName(cseed, theme);
      var title = major ? ['The Crown Championship', 'The Pixel Open', 'The Grand Masters'][[3, 7, 11].indexOf(i)] : (R.pick(PG.COURSE_A) + ' ' + R.pick(PG.EVENT_A));
      c.schedule.push({ name: title, seed: cseed, theme: theme, course: cn, major: major, purse: Math.round(tour.purse * (major ? 2.2 : R.range(0.8, 1.3)) / 1000) * 1000, result: null });
    }
    // opponents pool
    c.pool = [];
    var used = {};
    for (i = 0; i < Math.round(tour.field * 1.3); i++) {
      var nm;
      do { nm = R.pick(PG.FIRST) + ' ' + R.pick(PG.LAST); } while (used[nm]);
      used[nm] = 1;
      c.pool.push({ id: 'o' + i, name: nm, rating: R.normal(tour.mean, tour.sd), pts: 0, wins: 0 });
    }
    c.pts = 0; c.seasonWins = 0; c.week = 0; c.sessions = 3; c.skipped = false;
    c.shopWeek = -1;
  };
  PG.genCourseName = function (seed, theme) {
    var R = new PG.RNG(seed); // mirrors genCourse rng order when theme is given
    return R.pick(PG.COURSE_A) + ' ' + R.pick(PG.COURSE_B) + ' ' + R.pick(PG.THEMES[theme].suffix);
  };
  PG.eventCourse = function (c, ev, tier) {
    return PG.genCourse(ev.seed, tier === undefined ? c.tier : tier, { theme: ev.theme, major: ev.major });
  };

  PG.ensureShop = function (c) {
    if (c.shopWeek !== c.week + c.season * 100) {
      c.shop = PG.genShop(new PG.RNG(PG.hash(c.seed, 'shop', c.season, c.week, c.tier)), c.tier);
      c.shopWeek = c.week + c.season * 100;
    }
  };

  PG.findItem = function (c, uid) { for (var i = 0; i < c.inv.length; i++) if (c.inv[i].uid === uid) return c.inv[i]; return null; };
  PG.removeItem = function (c, uid) { c.inv = c.inv.filter(function (i) { return i.uid !== uid; }); };
  PG.bagMods = function (c) {
    var m = {};
    PG.SLOTS.forEach(function (s) { m[s] = PG.clubMods(PG.findItem(c, c.bag[s])); });
    return m;
  };
  PG.currentBall = function (c) {
    if (c.ballSel !== 'range' && (c.balls[c.ballSel] || 0) > 0) return PG.BALLS[c.ballSel];
    return PG.BALLS.range;
  };
  PG.loseBall = function (c, n) {
    if (c.ballSel === 'range') return;
    c.balls[c.ballSel] = Math.max(0, (c.balls[c.ballSel] || 0) - n);
  };

  // ---------- tournament ----------
  PG.createTournament = function (c, mode) {
    var ev = c.schedule[c.week], tour = PG.TOURS[c.tier];
    var R = new PG.RNG(PG.hash(ev.seed, 'field'));
    var field = c.pool.slice();
    R.shuffle(field);
    var n = tour.field - 1;
    if (ev.major) field.sort(function (a, b) { return a.rating - b.rating; });
    field = field.slice(0, n).map(function (o) {
      return { id: o.id, name: o.name, rating: o.rating + (ev.major ? -0.3 : 0), sc: [], cut: false, isP: false };
    });
    field.unshift({ id: 'P', name: c.golfer.name, isP: true, sc: [], cut: false });
    return {
      ev: c.week, seed: ev.seed, tier: c.tier, rounds: tour.rounds, cutOn: tour.cut, mode: mode,
      field: field, round: 0, hole: 0, mom: 0, streak: 0, done: false, roundStarted: false,
      winds: [], lost: 0, trees: 0, playoff: null, finds: []
    };
  };

  PG.tCourse = function (c, t) {
    if (!t._course) t._course = PG.eventCourse(c, c.schedule[t.ev], t.tier);
    return t._course;
  };
  PG.tWind = function (t, round, hole) {
    var R = new PG.RNG(PG.hash(t.seed, 'wind', round, hole));
    var tour = PG.TOURS[t.tier];
    var sp = Math.max(0, R.normal(tour.wind * 0.55, tour.wind * 0.35)), a = R.range(0, Math.PI * 2);
    return { x: Math.cos(a) * sp, y: Math.sin(a) * sp, mph: sp };
  };

  // total strokes for a player through (round r, hole h exclusive) relative to par
  PG.tToPar = function (course, p, rounds, holes) {
    var s = 0;
    for (var r = 0; r < p.sc.length && r <= rounds; r++) {
      var row = p.sc[r], lim = r < rounds ? 18 : holes;
      for (var h = 0; h < Math.min(lim, row.length); h++) s += row[h] - course.holes[h].par;
    }
    return s;
  };
  PG.tThru = function (p, r) { return p.sc[r] ? p.sc[r].length : 0; };

  PG.startRound = function (c, t) {
    var course = PG.tCourse(c, t), R = new PG.RNG(PG.hash(t.seed, 'round', t.round));
    var stats = PG.makeStats(c.golfer), conf = stats.a.conf;
    var final = t.round === t.rounds - 1;
    // standings before this round
    var lb = PG.leaderboard(c, t, t.round - 1, 18);
    var leader = lb.length ? lb[0].toPar : 0;
    var me = lb.filter(function (e) { return e.p.isP; })[0];
    var playerLeads = me && me.toPar <= leader && !me.p.cut;
    t.field.forEach(function (p) {
      if (p.isP) { p.sc[t.round] = []; return; }
      if (p.cut) return;
      var form = R.normal(0, 1.1);
      var mu = p.rating + form;
      // Confidence: when the player leads, chasers within 5 feel it
      if (playerLeads && t.round > 0) {
        var mine = PG.tToPar(course, p, t.round - 1, 18);
        if (mine - me.toPar <= 5) mu += (conf - 50) / 50 * 0.6 + (final && stats.perks.closer ? 0.6 : 0);
      }
      var row = [];
      for (var h = 0; h < 18; h++) {
        var hh = course.hole(h);
        var hmu = mu / 18 + hh.diff * 0.75;
        row.push(hh.par + sampleHole(R, hmu));
      }
      p.sc[t.round] = row; // revealed progressively by UI
    });
    t.roundStarted = true;
    t.hole = 0;
  };

  // leaderboard: through round r (0-based), holes h in round r (reveal opponents to same hole)
  PG.leaderboard = function (c, t, r, h) {
    var course = PG.tCourse(c, t);
    if (r < 0) return t.field.map(function (p) { return { p: p, toPar: 0, thru: 0, tot: 0 }; });
    var rows = t.field.map(function (p) {
      var toPar = 0, tot = 0, thru;
      for (var rr = 0; rr <= r; rr++) {
        var row = p.sc[rr] || [];
        var lim = rr < r ? 18 : (p.isP ? row.length : Math.min(h, row.length));
        for (var k = 0; k < lim; k++) { toPar += row[k] - course.holes[k].par; tot += row[k]; }
        thru = lim;
      }
      return { p: p, toPar: toPar, tot: tot, thru: thru, today: (function () { var s = 0, row = p.sc[r] || []; var lim = p.isP ? row.length : Math.min(h, row.length); for (var k = 0; k < lim; k++) s += row[k] - course.holes[k].par; return s; })() };
    });
    rows.sort(function (a, b) { return (a.p.cut - b.p.cut) || (a.toPar - b.toPar) || (a.p.isP ? -1 : 0); });
    var pos = 1;
    rows.forEach(function (e, i) {
      if (i > 0 && e.toPar !== rows[i - 1].toPar) pos = i + 1;
      e.pos = pos; e.tie = false;
    });
    rows.forEach(function (e, i) { e.tie = rows.some(function (o, j) { return j !== i && o.pos === e.pos && !o.p.cut && !e.p.cut; }); });
    return rows;
  };

  PG.playerSituation = function (c, t, holeIdx) {
    var lb = PG.leaderboard(c, t, t.round, holeIdx);
    var me = null, best = null;
    lb.forEach(function (e) { if (e.p.isP) me = e; else if (!e.p.cut && (best === null || e.toPar < best)) best = e.toPar; });
    // behind > 0: strokes behind the best opponent; 0: tied; < 0: leading by that many
    return { behind: me.toPar - (best === null ? me.toPar : best), pos: me.pos, finalRound: t.round === t.rounds - 1, roundIdx: t.round, holeIdx: holeIdx, me: me };
  };

  // Is this hole played manually in the current mode?
  PG.isManualHole = function (c, t, h) {
    if (t.mode === 'full') return true;
    if (t.mode === 'sim') return false;
    var course = PG.tCourse(c, t);
    if (course.featured.indexOf(h) >= 0) return true;
    if (t.round === t.rounds - 1 && h >= 14) {
      var s = PG.playerSituation(c, t, h);
      if (s.behind <= 3) return true;
    }
    return false;
  };

  PG.pressureFor = function (c, t, h, opts) {
    var base = PG.makeStats(c.golfer);
    var s = PG.playerSituation(c, t, h);
    return PG.situationPressure({ finalRound: s.finalRound, roundIdx: t.round, holeIdx: h, behind: s.behind, playoff: !!(opts && opts.playoff), keyPutt: !!(opts && opts.keyPutt), conf: base.a.conf });
  };
  PG.trailMult = function (c, t, h) {
    var s = PG.playerSituation(c, t, h), conf = PG.attrs(c.golfer).conf;
    if (s.finalRound && s.behind > 0 && s.behind <= 5) return 1 + Math.max(0, (50 - conf) / 50) * 0.25;
    return 1;
  };

  PG.holeContext = function (c, t, h, playoff) {
    var course = PG.tCourse(c, t), hole = course.hole(h);
    var pinIdx = playoff ? 4 : Math.min(3, t.round);
    return {
      hole: hole, pin: hole.pins[pinIdx], base: PG.makeStats(c.golfer), mom: t.mom, bag: PG.bagMods(c),
      ball: PG.currentBall(c), wind: PG.tWind(t, playoff ? 99 + (t.playoff ? t.playoff.n : 0) : t.round, h), streak: t.streak, playoff: !!playoff
    };
  };

  PG.autoHole = function (c, t, h, playoff) {
    var hc = PG.holeContext(c, t, h, playoff);
    hc.rng = new PG.RNG(PG.hash(t.seed, 'auto', t.round, h, PG.R.int(0, 1e9)));
    hc.trailMult = PG.trailMult(c, t, h);
    var pres = PG.pressureFor(c, t, h, { playoff: playoff });
    hc.pressureFn = function (k, d) { return pres + (d < 6 ? 0.05 : 0); };
    var res = PG.playHoleAuto(hc);
    return res;
  };

  // record a completed player hole
  PG.recordHole = function (c, t, h, strokes, info) {
    var course = PG.tCourse(c, t), par = course.holes[h].par;
    var me = t.field[0];
    me.sc[t.round][h] = strokes;
    var d = strokes - par, base = PG.makeStats(c.golfer);
    t.mom = PG.momentumAfterHole(t.mom, d, base.perks, base.a.comp);
    t.streak = d <= 0 ? t.streak + 1 : 0;
    if (info) { t.lost += info.lost || 0; t.trees += info.trees || 0; PG.loseBall(c, info.lost || 0); }
    t.hole = h + 1;
  };

  PG.endRound = function (c, t) {
    var course = PG.tCourse(c, t);
    var me = t.field[0];
    var rs = me.sc[t.round].reduce(function (a, b) { return a + b; }, 0);
    if (c.stats.bestRound === null || rs < c.stats.bestRound) c.stats.bestRound = rs;
    // finds in the woods
    var R = PG.R;
    if (R.chance(0.1 + Math.min(0.25, t.trees * 0.03))) {
      var it = PG.randomComponent(R, PG.rollRarity(R, PG.TOURS[t.tier].rarity, 0));
      c.inv.push(it); t.finds.push(it);
    }
    if (R.chance(0.12)) {
      var bk = R.pick(Object.keys(PG.BALLS).filter(function (k) { return PG.BALLS[k].r <= t.tier + 2 && k !== 'range'; }));
      var n = R.int(1, 3); c.balls[bk] = (c.balls[bk] || 0) + n; t.finds.push({ ball: bk, count: n });
    }
    // cut
    if (t.cutOn && t.round === 1) {
      var lb = PG.leaderboard(c, t, 1, 18);
      var line = lb[Math.min(lb.length - 1, Math.floor(lb.length * 0.5) - 1)].toPar;
      lb.forEach(function (e) { if (e.toPar > line) e.p.cut = true; });
      t.cutLine = line;
    }
    t.round++;
    t.hole = 0;
    t.roundStarted = false;
    if (t.round >= t.rounds || me.cut) {
      if (me.cut) { // finish remaining rounds for the field
        while (t.round < t.rounds) { PG.startRound(c, t); t.round++; }
      }
      t.round = t.rounds; // finished regulation
      PG.checkPlayoff(c, t);
    }
  };

  PG.checkPlayoff = function (c, t) {
    var lb = PG.leaderboard(c, t, t.rounds - 1, 18);
    var lead = lb.filter(function (e) { return !e.p.cut && e.toPar === lb[0].toPar; });
    if (lead.length > 1) {
      var inIt = lead.some(function (e) { return e.p.isP; });
      t.playoff = { ids: lead.map(function (e) { return e.p.id; }), n: 0, playerIn: inIt, done: false, winner: null, log: [] };
      if (!inIt) PG.resolvePlayoffAI(c, t);
    } else {
      t.winnerId = lb[0].p.id;
      t.done = true;
    }
  };
  // opponents' playoff hole scores (sudden death on 18)
  PG.playoffOppScores = function (c, t) {
    var course = PG.tCourse(c, t), hole = course.hole(17), R = PG.R, conf = PG.attrs(c.golfer).conf;
    var res = {};
    t.playoff.ids.forEach(function (id) {
      if (id === 'P') return;
      var p = t.field.filter(function (f) { return f.id === id; })[0];
      var mu = p.rating / 18 + hole.diff * 0.75 + 0.08 + (conf - 50) / 50 * 0.08;
      res[id] = hole.par + sampleHole(R, mu);
    });
    return res;
  };
  PG.applyPlayoffHole = function (c, t, scores) {
    var best = Math.min.apply(null, t.playoff.ids.map(function (id) { return scores[id]; }));
    t.playoff.log.push(scores);
    t.playoff.ids = t.playoff.ids.filter(function (id) { return scores[id] === best; });
    t.playoff.n++;
    if (t.playoff.ids.length === 1) { t.playoff.done = true; t.playoff.winner = t.playoff.ids[0]; t.winnerId = t.playoff.winner; t.done = true; }
    else if (t.playoff.ids.indexOf('P') < 0) PG.resolvePlayoffAI(c, t);
  };
  PG.resolvePlayoffAI = function (c, t) {
    t.playoff.playerIn = false;
    var guard = 0;
    while (!t.playoff.done && guard++ < 30) PG.applyPlayoffHole(c, t, PG.playoffOppScores(c, t));
    if (!t.playoff.done) { t.winnerId = t.playoff.ids[0]; t.playoff.done = true; t.done = true; }
  };

  // ---------- final results / rewards ----------
  function purseShare(pos, n) {
    if (pos === 1) return 0.18;
    var paid = Math.max(10, Math.round(n * 0.65));
    if (pos > paid) return 0;
    var table = [0.18, 0.109, 0.069, 0.049, 0.041, 0.036, 0.0335, 0.031, 0.029, 0.027];
    if (pos <= 10) return table[pos - 1];
    return Math.max(0.002, 0.027 * Math.pow(0.93, pos - 10));
  }
  function pointsFor(pos, n, major) {
    var p = pos === 1 ? 500 : pos <= 10 ? Math.round(300 * Math.pow(0.82, pos - 2)) : Math.max(0, Math.round(70 * (1 - (pos - 10) / (n * 0.7))));
    return major ? p * 2 : p;
  }
  PG.finalStandings = function (c, t) {
    var lb = PG.leaderboard(c, t, t.rounds - 1, 18);
    if (t.winnerId) { // winner first
      lb.sort(function (a, b) { return (a.p.cut - b.p.cut) || (a.toPar - b.toPar) || ((b.p.id === t.winnerId) - (a.p.id === t.winnerId)); });
      lb.forEach(function (e, i) { if (e.p.id === t.winnerId) { e.pos = 1; e.tie = false; } else if (e.pos === 1) { e.pos = 2; } });
      var tieCount = {};
      lb.forEach(function (e) { tieCount[e.pos] = (tieCount[e.pos] || 0) + 1; });
      lb.forEach(function (e) { e.tie = tieCount[e.pos] > 1 && !e.p.cut; });
    }
    return lb;
  };
  PG.finishTournament = function (c, t) {
    var ev = c.schedule[t.ev], lb = PG.finalStandings(c, t), n = lb.length;
    var R = PG.R;
    // money: ties split averaged shares
    var byPos = {};
    lb.forEach(function (e) { if (!e.p.cut) (byPos[e.pos] = byPos[e.pos] || []).push(e); });
    var result = null;
    Object.keys(byPos).forEach(function (pos) {
      var grp = byPos[pos], p0 = +pos, sh = 0, pt = 0;
      for (var k = 0; k < grp.length; k++) { sh += purseShare(p0 + k, n); pt += pointsFor(p0 + k, n, ev.major); }
      sh /= grp.length; pt = Math.round(pt / grp.length);
      grp.forEach(function (e) {
        e.money = Math.round(ev.purse * sh); e.pts = pt;
        if (e.p.isP) result = e;
        else { var o = c.pool.filter(function (q) { return q.id === e.p.id; })[0]; if (o) { o.pts += pt; if (p0 === 1) o.wins++; } }
      });
    });
    var me = lb.filter(function (e) { return e.p.isP; })[0];
    if (!result) { result = me; me.money = 0; me.pts = 0; }
    var pos = me.p.cut ? null : me.pos;
    c.cash += me.money; c.pts += me.pts;
    c.stats.events++; c.stats.earnings += me.money;
    if (!me.p.cut) c.stats.cuts++;
    if (pos === 1) { c.stats.wins++; c.seasonWins++; }
    if (pos && pos <= 10) c.stats.top10++;
    var pct = pos ? pos / n : 1;
    var flex = Math.round(2 + (1 - pct) * 8 + (pos === 1 ? 6 : 0) + c.tier);
    c.golfer.sp.flex += flex;
    var scrap = Math.round((3 + (1 - pct) * 12) * (1 + c.tier * 0.6));
    c.scrap += scrap;
    var loot = pos ? PG.genLoot(R, c.tier, pos, n) : [];
    loot.forEach(function (it) { if (it.ball) c.balls[it.ball] = (c.balls[it.ball] || 0) + it.count; else c.inv.push(it); });
    var summary = {
      event: ev.name, course: ev.course, pos: pos, tie: me.tie, cut: me.p.cut, toPar: me.toPar, money: me.money, pts: me.pts, flex: flex, scrap: scrap,
      loot: loot, finds: t.finds, field: n, winner: lb[0].p.name, winnerToPar: lb[0].toPar, playoff: !!t.playoff,
      top: lb.slice(0, 10).map(function (e) { return { name: e.p.name, pos: e.pos, tie: e.tie, toPar: e.toPar, isP: e.p.isP }; })
    };
    ev.result = { pos: pos, tie: me.tie, cut: me.p.cut, toPar: me.toPar, money: me.money };
    c.log.unshift(summary.event + ': ' + (pos ? (me.tie ? 'T' : '') + PG.ordinal(pos) : 'MC') + ' (' + PG.toPar(me.toPar) + ')');
    c.active = null;
    // simulate the rest of the pool's points for non-field players (light noise)
    c.pool.forEach(function (o) { if (!t.field.some(function (f) { return f.id === o.id; })) o.pts += Math.max(0, Math.round(R.normal(15 - o.rating * 4, 20))); });
    return summary;
  };

  // weekly flow
  PG.skipWeek = function (c) {
    var ev = c.schedule[c.week];
    ev.result = { skipped: true };
    c.sessions += 3; c.skipped = true;
    c.pool.forEach(function (o) { o.pts += Math.max(0, Math.round(PG.R.normal(25 - o.rating * 5, 30))); });
  };
  PG.advanceWeek = function (c) {
    c.week++; c.sessions = 3; c.skipped = false;
    if (c.week >= c.schedule.length) return PG.endSeason(c);
    return null;
  };
  PG.seasonStandings = function (c) {
    var rows = c.pool.map(function (o) { return { name: o.name, pts: o.pts, wins: o.wins, isP: false }; });
    rows.push({ name: c.golfer.name, pts: c.pts, wins: c.seasonWins, isP: true });
    rows.sort(function (a, b) { return b.pts - a.pts; });
    rows.forEach(function (r, i) { r.pos = i + 1; });
    return rows;
  };
  PG.endSeason = function (c) {
    var st = PG.seasonStandings(c), me = st.filter(function (r) { return r.isP; })[0];
    var promoted = c.tier < 3 && (me.pos <= PG.PROMOTE_TOP || c.seasonWins >= 3);
    var bonus = Math.round(PG.TOURS[c.tier].purse * (me.pos === 1 ? 0.5 : me.pos <= 5 ? 0.2 : me.pos <= 10 ? 0.08 : 0));
    c.cash += bonus;
    var rec = { season: c.season, tour: PG.TOURS[c.tier].short, pos: me.pos, pts: me.pts, wins: c.seasonWins, promoted: promoted, bonus: bonus };
    c.stats.seasons.push(rec);
    c.season++;
    if (promoted) c.tier++;
    PG.startSeason(c);
    return rec;
  };

  // ---------- training ----------
  PG.doDrill = function (c, drillId, bonus) {
    var d = PG.DRILLS.filter(function (x) { return x.id === drillId; })[0];
    if (!d || c.sessions <= 0) return null;
    var gained = {};
    if (d.paid) {
      var cost = PG.coachCost(c.tier);
      if (c.cash < cost) return null;
      c.cash -= cost;
      var a = PG.attrs(c.golfer), weakest = PG.ATTRS.slice().sort(function (x, y) { return a[x] - a[y]; })[0];
      gained[weakest] = 6;
    } else for (var k in d.sp) gained[k] = d.sp[k];
    if (bonus) {
      var keys = Object.keys(gained);
      for (var i = 0; i < bonus; i++) { var kk = keys[i % keys.length]; gained[kk] = (gained[kk] || 0) + 1; }
    }
    for (var g in gained) c.golfer.sp[g] += gained[g];
    c.sessions--;
    return gained;
  };

  // ---------- save/load ----------
  PG.save = function (c) {
    try {
      var copy = JSON.parse(JSON.stringify(c, function (k, v) { return k.charAt(0) === '_' ? undefined : v; }));
      localStorage.setItem(SAVE_KEY, JSON.stringify(copy));
    } catch (e) { console.warn('save failed', e); }
  };
  PG.load = function () {
    try { var s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  };
  PG.deleteSave = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } };
})();
