// Interactive hole play controller
(function () {
  'use strict';
  var T = PG.T;
  var P = PG.Play = {};
  var S = null; // play state
  var view, vctx, meterCv, meter, mini, mctx, raf = null, lastT = 0;

  P.init = function () {
    view = document.getElementById('view'); vctx = view.getContext('2d');
    meterCv = document.getElementById('meter'); meter = new PG.Meter(meterCv);
    mini = document.getElementById('mini'); mctx = mini.getContext('2d');
    view.addEventListener('mousedown', function (e) {
      if (!S || S.phase !== 'aim') return;
      var r = view.getBoundingClientRect();
      var sx = (e.clientX - r.left) * view.width / r.width, sy = (e.clientY - r.top) * view.height / r.height;
      var w = PG.Render.s2w(S.cam, view.width, view.height, sx, sy);
      setAim(w.x, w.y);
    });
    view.addEventListener('wheel', function (e) {
      if (!S) return; e.preventDefault();
      S.zoomBias = PG.clamp((S.zoomBias || 1) * (e.deltaY < 0 ? 1.15 : 0.87), 0.5, 3);
    }, { passive: false });
    mini.addEventListener('mousedown', function (e) {
      if (!S || S.phase !== 'aim' || !S.miniGeo) return;
      var r = mini.getBoundingClientRect(), g = S.miniGeo;
      var sx = (e.clientX - r.left) * mini.width / r.width, sy = (e.clientY - r.top) * mini.height / r.height;
      setAim((sx - g.ox) / g.s / PG.PPY, (sy - g.oy) / g.s / PG.PPY);
    });
    meterCv.addEventListener('mousedown', function () { swingClick(); });
    document.addEventListener('keydown', onKey);
    document.getElementById('scr-play').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pact]'); if (!b || !S) return;
      var a = b.getAttribute('data-pact'), v = b.getAttribute('data-v');
      if (a === 'club') changeClub(+v);
      else if (a === 'shape') setShape(+v);
      else if (a === 'scale') changeScale(+v);
      else if (a === 'caddie') caddieShot();
      else if (a === 'simhole') simRestOfHole();
      else if (a === 'swing') swingClick();
      else if (a === 'quit') PG.UI.confirmQuitPlay();
    });
  };

  function onKey(e) {
    if (!S || !PG.UI.isScreen('play') || PG.UI.modalOpen()) return;
    var k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); swingClick(); return; }
    if (S.phase !== 'aim') return;
    if (k === 'w' || k === 'arrowup') { changeClub(-1); e.preventDefault(); }
    else if (k === 's' || k === 'arrowdown') { changeClub(1); e.preventDefault(); }
    else if (k === 'a' || k === 'arrowleft') { rotateAim(e.shiftKey ? -3 : -0.5); e.preventDefault(); }
    else if (k === 'd' || k === 'arrowright') { rotateAim(e.shiftKey ? 3 : 0.5); e.preventDefault(); }
    else if (k === 'z') setShape(-1); else if (k === 'x') setShape(0); else if (k === 'c') setShape(1);
    else if (k === 'q') changeScale(-1); else if (k === 'e') changeScale(1);
  }

  // ---------- lifecycle ----------
  P.begin = function (c, t) {
    S = { c: c, t: t, phase: 'idle', cam: { x: 0, y: 0, zoom: 1 }, zoomBias: 1, time: 0, logLines: [] };
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); }
    renderLB();
    advance();
  };
  P.stop = function () { S = null; meter.disarm(); };
  P.debugState = function () { return S; };

  function log(msg) {
    S.logLines.unshift(msg); S.logLines = S.logLines.slice(0, 40);
    document.getElementById('pLog').innerHTML = S.logLines.map(function (l) { return '<div>' + l + '</div>'; }).join('');
  }

  function advance() {
    var c = S.c, t = S.t;
    if (t.done) { PG.UI.tournamentDone(t); return; }
    if (t.round >= t.rounds) { // playoff with player
      if (t.playoff && !t.playoff.done && t.playoff.playerIn) {
        if (t.mode === 'sim') { simPlayoffHole(); return; }
        setupHole(17, true); return;
      }
      PG.UI.tournamentDone(t); return;
    }
    if (!t.roundStarted) PG.startRound(c, t);
    var simmed = [];
    while (t.hole < 18 && !PG.isManualHole(c, t, t.hole)) {
      var h = t.hole, r = PG.autoHole(c, t, h, false), par = PG.tCourse(c, t).holes[h].par;
      PG.recordHole(c, t, h, r.strokes, r);
      simmed.push('#' + (h + 1) + ' ' + scoreTag(r.strokes - par));
      if (r.lost) simmed[simmed.length - 1] += ' (lost ' + r.lost + ' ball)';
    }
    if (simmed.length) log('<span class="dim">R' + (t.round + 1) + ' sim:</span> ' + simmed.join(' · '));
    renderLB();
    PG.save(c);
    if (t.hole >= 18) { PG.UI.roundComplete(t); return; }
    setupHole(t.hole, false);
  }
  P.advance = function () { if (S) advance(); };

  function scoreTag(d) {
    var cls = d < 0 ? 'u' : d > 0 ? 'o' : 'e';
    return '<b class="sc ' + cls + '">' + (d === 0 ? 'Par' : PG.scoreName(d)) + '</b>';
  }

  function setupHole(h, playoff) {
    var c = S.c, t = S.t;
    var hc = PG.holeContext(c, t, h, playoff);
    S.hc = hc; S.h = h; S.playoff = playoff; S.hole = hc.hole; S.pin = hc.pin;
    S.ball = { x: hc.hole.tee.x, y: hc.hole.tee.y };
    S.strokes = 0; S.lost = 0; S.trees = 0; S.shape = 0;
    S.cam.x = S.ball.x; S.cam.y = S.ball.y - 100;
    S.flyover = 1.6; S.baseZoom = 1;
    var title = playoff ? 'PLAYOFF — Hole 18' : 'Round ' + (t.round + 1) + ' — Hole ' + (h + 1);
    PG.UI.toast(title + '<br><small>Par ' + hc.hole.par + ' · ' + hc.hole.len + ' yds</small>', 1600);
    prepareShot();
  }

  function holeInfoHTML() {
    var t = S.t, hole = S.hole, c = S.c;
    var course = PG.tCourse(c, t);
    var sit = PG.playerSituation(c, t, S.h);
    var toPar = sit.me.toPar;
    var w = S.hc.wind, wdir = Math.atan2(w.y, w.x) * 180 / Math.PI + 90;
    return '<div class="hh"><div><div class="big">' + (S.playoff ? 'PLAYOFF' : 'HOLE ' + (S.h + 1)) + '</div><div>Par ' + hole.par + ' · ' + hole.len + ' yds</div></div>' +
      '<div class="wind"><div class="arrow" style="transform:rotate(' + wdir.toFixed(0) + 'deg)">↑</div><div>' + w.mph.toFixed(0) + ' mph</div></div></div>' +
      '<div class="row"><span>Stroke</span><b>' + (S.strokes + 1) + '</b></div>' +
      '<div class="row"><span>Total</span><b>' + PG.toPar(toPar) + ' (' + (sit.me.tie ? 'T' : '') + PG.ordinal(sit.pos) + ')</b></div>' +
      '<div class="row"><span>Course</span><b class="dim">' + PG.esc(course.name) + '</b></div>';
  }

  // ---------- shot prep ----------
  function prepareShot() {
    var c = S.c, t = S.t, hole = S.hole;
    S.phase = 'aim';
    S.lie = PG.lieAt(hole, S.ball.x, S.ball.y);
    S.dist = PG.dist(S.ball.x, S.ball.y, S.pin.x, S.pin.y);
    var keyPutt = S.dist < 7;
    S.pressure = PG.pressureFor(c, t, S.h, { playoff: S.playoff, keyPutt: keyPutt && t.round === t.rounds - 1 });
    S.trail = null;
    var plan = PG.aiPlan({ hole: hole, pin: S.pin, base: S.hc.base, mom: t.mom, pe: S.pressure, bag: S.hc.bag, ball: S.hc.ball, wind: { x: 0, y: 0 } }, S.ball.x, S.ball.y);
    S.plan = plan;
    S.club = plan.clubId;
    S.scale = plan.maxDist || PG.autoPutterScale(S.dist);
    if (S.club === 'PT') S.aim = { x: S.pin.x, y: S.pin.y };
    else {
      // aim where the caddie would land it
      var st = curStats(), full = PG.clubCarry(S.club, st, S.hc.bag[S.club] || {}, S.hc.ball, S.lie);
      var dx = plan.aimX - S.ball.x, dy = plan.aimY - S.ball.y, L = Math.hypot(dx, dy) || 1;
      var land = Math.min(L, full * plan.power);
      S.aim = { x: S.ball.x + dx / L * land, y: S.ball.y + dy / L * land };
    }
    document.getElementById('pHole').innerHTML = holeInfoHTML();
    updatePreview();
    renderLB();
  }

  function curStats() {
    var m = S.hc.bag[S.club] || {};
    return PG.shotStats(S.hc.base, S.t.mom, S.pressure, m, { playoff: S.playoff, shortPutt: S.club === 'PT' && S.dist < 5 });
  }

  function setAim(x, y) { S.aim = { x: x, y: y }; updatePreview(); }
  function rotateAim(deg) {
    var dx = S.aim.x - S.ball.x, dy = S.aim.y - S.ball.y, a = deg * Math.PI / 180;
    S.aim = { x: S.ball.x + dx * Math.cos(a) - dy * Math.sin(a), y: S.ball.y + dx * Math.sin(a) + dy * Math.cos(a) };
    updatePreview();
  }
  function changeClub(d) {
    if (S.phase !== 'aim') return;
    var i = PG.SLOTS.indexOf(S.club) + d;
    i = PG.clamp(i, 0, PG.SLOTS.length - 1);
    S.club = PG.SLOTS[i];
    if (S.club === 'PT') S.scale = PG.autoPutterScale(PG.dist(S.ball.x, S.ball.y, S.aim.x, S.aim.y));
    updatePreview();
  }
  function setShape(v) { if (S.phase !== 'aim') return; S.shape = v; updatePreview(); }
  function changeScale(d) {
    if (S.phase !== 'aim' || S.club !== 'PT') return;
    var arr = PG.putterScales, i = PG.clamp(arr.indexOf(S.scale) + d, 0, arr.length - 1);
    S.scale = arr[i]; updatePreview();
  }

  function updatePreview() {
    var st = curStats(), m = S.hc.bag[S.club] || {}, hole = S.hole;
    var aimD = PG.dist(S.ball.x, S.ball.y, S.aim.x, S.aim.y);
    var pv = { target: S.aim };
    var targetP = null, label = '';
    if (S.club === 'PT') {
      targetP = PG.clamp(aimD / S.scale, 0, 1.1);
      var a = PG.attrs(S.c.golfer);
      var frac = PG.clamp(0.2 + a.prec * 0.004 + (st.perks.reader ? 0.25 : 0) + (m.read || 0) / 100, 0.15, 0.95);
      var r = PG.resolveShot({ hole: hole, x: S.ball.x, y: S.ball.y, aimX: S.aim.x, aimY: S.aim.y, clubId: 'PT', power: targetP, acc: 0, stats: st, mods: m, ball: S.hc.ball, pin: null, noise: false, maxDist: S.scale });
      var pts = r.roll || [];
      pv.path = pts.slice(0, Math.max(2, Math.floor(pts.length * frac)));
      label = aimD.toFixed(1) + ' yd';
      S.meterLabels = [(S.scale * 0.25).toFixed(1) + 'y', (S.scale * 0.5).toFixed(1) + 'y', (S.scale * 0.75).toFixed(1) + 'y', S.scale + 'y'];
    } else {
      var full = PG.clubCarry(S.club, st, m, S.hc.ball, S.lie);
      targetP = PG.clamp(aimD / Math.max(1, full), 0.05, 1.0);
      var r2 = PG.resolveShot({ hole: hole, x: S.ball.x, y: S.ball.y, aimX: S.aim.x, aimY: S.aim.y, clubId: S.club, power: targetP, acc: 0, shape: S.shape, stats: st, mods: m, ball: S.hc.ball, wind: { x: 0, y: 0 }, pin: S.pin, noise: false });
      var f = r2.flight, path = [];
      if (f) for (var i = 0; i <= 20; i++) { var tt = i / 20 * f.tEnd; path.push({ x: f.sx + f.ddx * f.carry * tt + f.ppx * f.lat * tt * tt, y: f.sy + f.ddy * f.carry * tt + f.ppy * f.lat * tt * tt }); }
      pv.path = path; pv.land = r2.land; pv.radius = Math.max(2, (f ? f.carry : 50) * 0.05 * st.dispMult);
      label = Math.round(aimD) + ' yd';
      S.meterLabels = [Math.round(full * 0.25) + '', Math.round(full * 0.5) + '', Math.round(full * 0.75) + '', Math.round(full) + ' yd'];
      S.fullCarry = full;
    }
    S.preview = pv; S.targetP = targetP;
    meter.arm({ speed: 100 * st.meterSpeed, pure: st.pureHalf, jitter: st.jitter, target: targetP, targetLabel: label, labels: S.meterLabels, onDone: onSwing, onCancel: function () { } });
    renderShotPanel(st);
  }

  function renderShotPanel(st) {
    var club = PG.CLUB[S.club], item = PG.findItem(S.c, S.c.bag[S.club]);
    var m = S.hc.bag[S.club] || {};
    var rar = item ? PG.clubRarity(item) : 1;
    var lieCls = S.lie.t === T.FAIR || S.lie.t === T.TEE || S.lie.t === T.GREEN ? 'good' : 'bad';
    var html = '<div class="club" style="border-color:' + PG.RARITY[rar].c + '"><button data-pact="club" data-v="-1">▲</button><div><div class="big">' + club.name + '</div><div class="dim">' + (item ? PG.esc(PG.clubName(item)) : '') + '</div></div><button data-pact="club" data-v="1">▼</button></div>';
    if (S.club === 'PT') html += '<div class="row"><span>Putt scale</span><span><button data-pact="scale" data-v="-1">−</button> <b>' + S.scale + ' yd</b> <button data-pact="scale" data-v="1">+</button></span></div>';
    else html += '<div class="row"><span>Full carry</span><b>' + Math.round(S.fullCarry) + ' yd</b></div>' +
      '<div class="shape">' + [[-1, 'Draw'], [0, 'Straight'], [1, 'Fade']].map(function (s) { return '<button data-pact="shape" data-v="' + s[0] + '" class="' + (S.shape === s[0] ? 'on' : '') + '">' + s[1] + '</button>'; }).join('') + '</div>';
    html += '<div class="row"><span>Lie</span><b class="' + lieCls + '">' + S.lie.name + '</b></div>';
    html += '<div class="row"><span>To pin</span><b>' + (S.dist < 30 ? S.dist.toFixed(1) : Math.round(S.dist)) + ' yd</b></div>';
    html += '<div class="row"><span>Ball</span><b>' + S.hc.ball.n + '</b></div>';
    var momTxt = S.t.mom > 0.4 ? '<b class="good">Hot ▲' + S.t.mom.toFixed(1) + '</b>' : S.t.mom < -0.4 ? '<b class="bad">Cold ▼' + S.t.mom.toFixed(1) + '</b>' : '<b>Even</b>';
    html += '<div class="row"><span>Momentum</span>' + momTxt + '</div>';
    var pe = st.pe;
    html += '<div class="row"><span>Pressure</span><b class="' + (pe > 0.3 ? 'bad' : pe > 0.1 ? 'warn' : 'good') + '">' + (pe > 0.3 ? 'HIGH' : pe > 0.1 ? 'Some' : 'Calm') + (pe > 0.02 ? ' ' + Math.round(pe * 100) + '%' : '') + '</b></div>';
    html += '<div class="btns"><button data-pact="swing" class="pri">Swing (Space)</button><button data-pact="caddie">Caddie hits</button><button data-pact="simhole">Sim hole</button></div>';
    document.getElementById('pShot').innerHTML = html;
  }

  // ---------- swing ----------
  function swingClick() {
    if (!S || S.phase !== 'aim') return;
    meter.click();
  }
  function onSwing(power, acc) {
    if (!S || S.phase !== 'aim') return;
    executeShot(power, acc, S.club, S.aim, S.shape, S.scale);
  }
  function caddieShot() {
    if (S.phase !== 'aim') return;
    var st = PG.shotStats(S.hc.base, S.t.mom, S.pressure, S.hc.bag[S.plan.clubId] || {}, { playoff: S.playoff });
    var sw = PG.aiSwing(S.plan, st, PG.R, PG.trailMult(S.c, S.t, S.h));
    S.club = S.plan.clubId;
    meter.disarm();
    executeShot(sw.power, sw.acc, S.plan.clubId, { x: S.plan.aimX, y: S.plan.aimY }, 0, S.plan.maxDist);
  }
  function simRestOfHole() {
    if (S.phase !== 'aim') return;
    S.phase = 'anim'; meter.disarm();
    var hc = {}; for (var k in S.hc) hc[k] = S.hc[k];
    var pres = S.pressure, guard = 0;
    hc.rng = PG.R; hc.mom = S.t.mom; hc.trailMult = PG.trailMult(S.c, S.t, S.h);
    var x = S.ball.x, y = S.ball.y, strokes = S.strokes, max = S.hole.par + 5;
    while (strokes < max && guard++ < 20) {
      var plan = PG.aiPlan({ hole: S.hole, pin: S.pin, base: hc.base, mom: hc.mom, pe: pres, bag: hc.bag, ball: hc.ball, wind: hc.wind }, x, y);
      var m = hc.bag[plan.clubId] || {}, st = PG.shotStats(hc.base, hc.mom, pres, m, { playoff: S.playoff });
      var sw = PG.aiSwing(plan, st, PG.R, hc.trailMult);
      var r = PG.resolveShot({ hole: S.hole, x: x, y: y, aimX: plan.aimX, aimY: plan.aimY, clubId: plan.clubId, power: sw.power, acc: sw.acc, shape: 0, stats: st, mods: m, ball: hc.ball, wind: hc.wind, pin: S.pin, rng: PG.R, noise: true, streak: S.t.streak, maxDist: plan.maxDist });
      strokes++;
      if (r.outcome === 'holed') { x = S.pin.x; y = S.pin.y; break; }
      if (r.outcome === 'water') { strokes++; S.lost++; x = r.drop.x; y = r.drop.y; }
      else if (r.outcome === 'ob') { strokes++; S.lost++; }
      else { x = r.final.x; y = r.final.y; }
    }
    S.strokes = Math.min(strokes, max);
    S.ball = { x: S.pin.x, y: S.pin.y };
    finishHole();
  }

  function executeShot(power, acc, clubId, aim, shape, scale) {
    var c = S.c, t = S.t;
    S.phase = 'anim';
    var m = S.hc.bag[clubId] || {};
    var st = PG.shotStats(S.hc.base, t.mom, S.pressure, m, { playoff: S.playoff, shortPutt: clubId === 'PT' && S.dist < 5 });
    var r = PG.resolveShot({ hole: S.hole, x: S.ball.x, y: S.ball.y, aimX: aim.x, aimY: aim.y, clubId: clubId, power: power, acc: acc, shape: shape, stats: st, mods: m, ball: S.hc.ball, wind: S.hc.wind, pin: S.pin, rng: PG.R, noise: true, streak: t.streak, maxDist: scale });
    S.strokes++;
    S.shot = r;
    S.anim = { t: 0, stage: r.flight ? 'fly' : 'roll', ri: 0 };
    S.trail = [];
    if (r.flight) S.anim.dur = 0.7 + r.flight.carry * r.flight.tEnd / 140;
    var q = r.quality === 'pure' ? 'PURE!' : r.quality === 'good' ? 'Good' : r.quality === 'hook' ? (clubId === 'PT' ? 'Pulled' : 'Hooked') : (clubId === 'PT' ? 'Pushed' : 'Sliced');
    if (clubId !== 'PT' || r.quality !== 'pure') PG.UI.toast(q + (power > 1.0 ? ' <small>(overswing)</small>' : ''), 900, r.quality === 'pure' ? 'gold' : r.quality === 'good' ? '' : 'bad');
  }

  function animStep(dt) {
    var a = S.anim, r = S.shot;
    if (a.stage === 'fly') {
      a.t += dt / a.dur;
      var f = r.flight, tt = Math.min(1, a.t) * f.tEnd;
      var x = f.sx + f.ddx * f.carry * tt + f.ppx * f.lat * tt * tt, y = f.sy + f.ddy * f.carry * tt + f.ppy * f.lat * tt * tt;
      var h = 4 * f.apex * tt * (1 - tt);
      S.ballDraw = { x: x, y: y, h: h };
      S.trail.push({ x: x, y: y, h: h });
      if (a.t >= 1) {
        if (r.treeHit) PG.UI.toast('Clipped the trees!', 900, 'bad');
        if (r.outcome === 'water' || r.outcome === 'ob') { endShot(); return; }
        a.stage = 'roll'; a.ri = 0;
      }
    } else if (a.stage === 'roll') {
      var pts = r.roll || [];
      a.ri += dt / 0.06 * (r.putt ? 1.3 : 1.6);
      var i = Math.min(pts.length - 1, Math.floor(a.ri));
      if (pts.length) S.ballDraw = { x: pts[i].x, y: pts[i].y, h: 0 };
      if (i >= pts.length - 1) endShot();
    }
  }

  function endShot() {
    var r = S.shot, t = S.t;
    S.anim = null; S.ballDraw = null;
    if (r.outcome === 'holed') {
      S.ball = { x: S.pin.x, y: S.pin.y, holed: true };
      finishHole(); return;
    }
    if (r.outcome === 'water') {
      S.strokes++; S.lost++;
      S.ball = { x: r.drop.x, y: r.drop.y };
      PG.UI.toast('SPLASH! +1 penalty', 1400, 'bad');
    } else if (r.outcome === 'ob') {
      S.strokes++; S.lost++;
      PG.UI.toast('Out of bounds! Stroke & distance', 1400, 'bad');
    } else {
      S.ball = { x: r.final.x, y: r.final.y };
      var lie = PG.lieAt(S.hole, S.ball.x, S.ball.y);
      if (lie.tree) S.trees++;
      if (r.club !== 'PT') {
        var carry = Math.round(r.carry), msg = carry + ' yds';
        if (lie.t === T.SAND) msg += ' — in the bunker'; else if (lie.t === T.GREEN) msg += ' — on the green!'; else if (lie.tree) msg += ' — in the trees';
        log('<span class="dim">' + PG.CLUB[r.club].name + ':</span> ' + msg);
      }
    }
    if (S.strokes >= S.hole.par + 5) { PG.UI.toast('Picked up', 1000, 'bad'); finishHole(); return; }
    setTimeout(function () { if (S) prepareShot(); }, 450);
  }

  function finishHole() {
    var c = S.c, t = S.t, d = S.strokes - S.hole.par;
    S.phase = 'done'; meter.disarm();
    var name = S.strokes === 1 ? 'HOLE IN ONE!' : PG.scoreName(d);
    PG.UI.toast(name + '<br><small>' + S.strokes + ' strokes</small>', 1800, d < 0 ? 'gold' : d > 0 ? 'bad' : '');
    log('<b>' + (S.playoff ? 'Playoff' : '#' + (S.h + 1)) + '</b> ' + scoreTag(d) + ' (' + S.strokes + ')');
    if (S.playoff) {
      PG.loseBall(c, S.lost);
      var sc = PG.playoffOppScores(c, t); sc.P = S.strokes;
      var oppTxt = Object.keys(sc).filter(function (k) { return k !== 'P'; }).map(function (k) { var p = t.field.filter(function (f) { return f.id === k; })[0]; return PG.esc(p.name) + ': ' + sc[k]; }).join(', ');
      PG.applyPlayoffHole(c, t, sc);
      setTimeout(function () {
        PG.UI.modal('<h2>Playoff hole ' + t.playoff.n + '</h2><p>You: ' + S.strokes + ' · ' + oppTxt + '</p><p>' + (t.done ? (t.winnerId === 'P' ? '<b class="gold">You win the playoff!</b>' : 'Eliminated.') : 'Still tied — back to the 18th tee.') + '</p>', [{ t: 'Continue', f: function () { PG.save(c); advance(); } }]);
      }, 1500);
      return;
    }
    PG.recordHole(c, t, S.h, S.strokes, { lost: S.lost, trees: S.trees });
    PG.save(c);
    renderLB();
    setTimeout(function () { if (S) advance(); }, 1700);
  }

  function simPlayoffHole() {
    var c = S.c, t = S.t;
    var guard = 0;
    while (!t.done && t.playoff.playerIn && guard++ < 20) {
      var sc = PG.playoffOppScores(c, t); sc.P = PG.autoHole(c, t, 17, true).strokes;
      PG.applyPlayoffHole(c, t, sc);
    }
    PG.UI.tournamentDone(t);
  }
  P.simPlayoff = function (c, t) { var g = 0; while (!t.done && t.playoff && t.playoff.playerIn && g++ < 20) { var sc = PG.playoffOppScores(c, t); sc.P = PG.autoHole(c, t, 17, true).strokes; PG.applyPlayoffHole(c, t, sc); } };

  // ---------- leaderboard ----------
  function renderLB() {
    if (!S) return;
    var c = S.c, t = S.t, r = Math.min(t.round, t.rounds - 1);
    var lb = PG.leaderboard(c, t, r, t.round >= t.rounds ? 18 : t.hole);
    var rows = lb.slice(0, 8), me = lb.filter(function (e) { return e.p.isP; })[0];
    if (rows.indexOf(me) < 0) rows.push(me);
    document.getElementById('pLB').innerHTML = '<div class="lbh">LEADERBOARD · R' + (r + 1) + '</div>' + rows.map(function (e) {
      return '<div class="lbr' + (e.p.isP ? ' me' : '') + (e.p.cut ? ' cut' : '') + '"><span>' + (e.p.cut ? 'MC' : (e.tie ? 'T' : '') + e.pos) + '</span><span class="nm">' + PG.esc(e.p.name) + '</span><span class="' + (e.toPar < 0 ? 'u' : e.toPar > 0 ? 'o' : '') + '">' + PG.toPar(e.toPar) + '</span><span class="dim">' + (e.thru >= 18 ? 'F' : e.thru) + '</span></div>';
    }).join('');
  }
  P.renderLB = renderLB;

  // ---------- render loop ----------
  function loop(now) {
    raf = requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (!S || !S.hole || !PG.UI.isScreen('play')) return;
    S.time += dt;
    meter.update(dt);
    if (S.anim) animStep(dt);
    // camera
    // S.baseZoom is a stable framing zoom set while aiming; it is never derived from the
    // live camera zoom, so the wheel bias can't compound frame over frame.
    var ballP = S.ballDraw || S.ball, target;
    if (S.phase === 'aim') {
      if (S.club === 'PT' || S.dist < 40) {
        target = { x: (S.ball.x + S.pin.x) / 2, y: (S.ball.y + S.pin.y) / 2 };
        S.baseZoom = PG.clamp(view.height * 0.5 / (Math.max(S.dist, 5) * PG.PPY), 1.5, 4);
      } else {
        var l = S.preview && S.preview.land ? S.preview.land : S.aim;
        target = { x: S.ball.x + (l.x - S.ball.x) * 0.5, y: S.ball.y + (l.y - S.ball.y) * 0.5 };
        var span = PG.dist(S.ball.x, S.ball.y, l.x, l.y);
        S.baseZoom = PG.clamp(view.height / (span * PG.PPY * 1.35), 0.75, 2);
      }
    } else {
      target = { x: ballP.x, y: ballP.y };
      // long shots in flight ease out a little; putts and short chips keep their framing
      if (S.phase === 'anim' && S.shot && !S.shot.putt && S.shot.carry > 60) S.baseZoom = Math.min(S.baseZoom || 1, 1.3);
    }
    var zoom = PG.clamp((S.baseZoom || 1) * S.zoomBias, 0.5, 6);
    var k = S.phase === 'anim' ? 0.12 : 0.08;
    if (S.flyover > 0) { S.flyover -= dt; k = 0.03; }
    S.cam.x += (target.x - S.cam.x) * k; S.cam.y += (target.y - S.cam.y) * k; S.cam.zoom *= Math.pow(zoom / S.cam.zoom, Math.min(1, dt * 2.2)); // smooth, frame-rate independent, log-space
    var showSlope = S.club === 'PT' || PG.dist(ballP.x, ballP.y, S.pin.x, S.pin.y) < 45;
    PG.Render.drawView(vctx, S.hole, S.cam, {
      pin: S.pin, ball: ballP, preview: S.phase === 'aim' ? S.preview : null, time: S.time, showSlope: showSlope, trail: S.trail
    });
    var hw = view.width / (2 * S.cam.zoom * PG.PPY), hh = view.height / (2 * S.cam.zoom * PG.PPY);
    S.miniGeo = PG.Render.drawMinimap(mctx, S.hole, { ball: ballP, pin: S.pin, aim: S.phase === 'aim' ? S.aim : null, view: { x0: S.cam.x - hw, y0: S.cam.y - hh, x1: S.cam.x + hw, y1: S.cam.y + hh } });
    meter.draw();
  }
})();
