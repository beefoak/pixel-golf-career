// Shot resolution: flight, wind, lies, trees, rolling, putting, cup capture
(function () {
  'use strict';
  var T = PG.T;
  var G = 10.7; // yd/s^2
  var FRIC = {}; FRIC[T.FAIR] = 3.4; FRIC[T.TEE] = 3.4; FRIC[T.FRINGE] = 3.0; FRIC[T.ROUGH] = 10; FRIC[T.DEEP] = 22; FRIC[T.SAND] = 60; FRIC[T.WASTE] = 12; FRIC[T.OB] = 6; FRIC[T.WATER] = 99;
  var LIE = {}; // d: distance factor, a: accuracy (dispersion) factor, s: spin factor
  LIE[T.TEE] = { d: 1, a: 1, s: 1 }; LIE[T.FAIR] = { d: 1, a: 1, s: 1 }; LIE[T.GREEN] = { d: 1, a: 1, s: 1 };
  LIE[T.FRINGE] = { d: 0.97, a: 1.05, s: 0.9 }; LIE[T.ROUGH] = { d: 0.86, a: 1.3, s: 0.55 };
  LIE[T.DEEP] = { d: 0.68, a: 1.7, s: 0.3 }; LIE[T.SAND] = { d: 0.74, a: 1.5, s: 0.5 }; LIE[T.WASTE] = { d: 0.9, a: 1.2, s: 0.75 };
  LIE[T.OB] = LIE[T.DEEP]; LIE[T.WATER] = LIE[T.DEEP];
  var RETAIN = {}; RETAIN[T.FAIR] = 1; RETAIN[T.TEE] = 1; RETAIN[T.FRINGE] = 0.75; RETAIN[T.ROUGH] = 0.3; RETAIN[T.DEEP] = 0.1; RETAIN[T.SAND] = 0; RETAIN[T.WASTE] = 0.35; RETAIN[T.OB] = 0.5;

  PG.lieAt = function (hole, x, y) {
    var t = hole.at(x, y), tree = hole.treeAt(x, y) > 0;
    var b = LIE[t] || LIE[T.ROUGH];
    var l = { t: t, tree: tree, d: b.d, a: b.a, s: b.s, name: tree ? 'Under Trees' : PG.TNAME[t] };
    if (tree) { l.d = Math.min(l.d, 0.6); l.a *= 1.4; l.s *= 0.5; l.punch = true; }
    return l;
  };

  function lieFactors(lie, club, st, m) {
    var d = lie.d, a = lie.a, s = lie.s;
    var red = st.adverse;
    if (lie.t === T.ROUGH || lie.t === T.DEEP) red += (m.rough || 0) / 100;
    if (lie.t === T.SAND || lie.t === T.WASTE) red += (m.sand || 0) / 100;
    red = Math.min(0.8, red);
    d = 1 - (1 - d) * (1 - red); a = 1 + (a - 1) * (1 - red); s = 1 - (1 - s) * (1 - red * 0.5);
    if (lie.t === T.SAND && club.cat !== 'wedge') { d *= 0.9; a *= 1.2; }
    if (club.cat === 'wood' && lie.t !== T.TEE && lie.t !== T.FAIR) { d *= 0.9; a *= 1.15; }
    if (club.id === 'D' && lie.t !== T.TEE) { d *= 0.93; a *= 1.25; }
    return { d: d, a: a, s: s, punch: lie.punch };
  }

  function segDist(ax, ay, bx, by, px, py) {
    var vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
    var t = L2 > 0 ? PG.clamp(((px - ax) * vx + (py - ay) * vy) / L2, 0, 1) : 0;
    return Math.hypot(ax + vx * t - px, ay + vy * t - py);
  }

  // Roll simulation. opt: {pin, capMult}
  PG.simRoll = function (hole, x, y, vx, vy, opt) {
    opt = opt || {};
    var dt = 0.02, pts = [{ x: x, y: y }], capR = 0.06 * (opt.capMult || 1);
    for (var step = 0; step < 3000; step++) {
      var t = hole.at(x, y);
      if (t === T.WATER) return { x: x, y: y, out: 'water', pts: pts };
      if (t === T.OB) return { x: x, y: y, out: 'ob', pts: pts };
      var f = t === T.GREEN ? hole.greenF : FRIC[t];
      if (t === T.GREEN || t === T.FRINGE) {
        var g = hole.slope(x, y); vx -= G * g.x * dt; vy -= G * g.y * dt;
      }
      var sp = Math.hypot(vx, vy), dec = f * dt;
      if (sp <= dec) { vx = 0; vy = 0; sp = 0; }
      else { vx -= vx / sp * dec; vy -= vy / sp * dec; }
      var nx = x + vx * dt, ny = y + vy * dt;
      if (opt.pin && sp < 1.5 && segDist(x, y, nx, ny, opt.pin.x, opt.pin.y) < capR * (1 - Math.pow(sp / 1.5, 2) * 0.6)) {
        pts.push({ x: opt.pin.x, y: opt.pin.y });
        return { x: opt.pin.x, y: opt.pin.y, out: 'holed', pts: pts };
      }
      x = nx; y = ny;
      if (step % 3 === 0) pts.push({ x: x, y: y });
      if (sp < 0.04) break;
    }
    pts.push({ x: x, y: y });
    return { x: x, y: y, out: 'ok', pts: pts };
  };

  // where to drop after a water ball: walk back toward origin until dry land
  PG.waterDrop = function (hole, sx, sy, ex, ey) {
    var dx = sx - ex, dy = sy - ey, L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    for (var d = 1; d < L; d += 1) {
      var x = ex + dx * d, y = ey + dy * d, t = hole.at(x, y);
      if (t !== T.WATER && t !== T.OB) {
        x += dx * 2; y += dy * 2;
        if (hole.at(x, y) === T.WATER || hole.at(x, y) === T.OB) { x -= dx * 2; y -= dy * 2; }
        return { x: x, y: y };
      }
    }
    return { x: sx, y: sy };
  };

  PG.putterScales = [4, 8, 15, 25, 40];
  PG.autoPutterScale = function (d) {
    for (var i = 0; i < PG.putterScales.length; i++) if (PG.putterScales[i] >= d * 1.3 + 0.5) return PG.putterScales[i];
    return PG.putterScales[PG.putterScales.length - 1];
  };

  // Expected full-power carry for a club (no wind, perfect strike)
  PG.clubCarry = function (clubId, st, m, ball, lie) {
    var club = PG.CLUB[clubId];
    if (club.cat === 'putter') return 0;
    var c = (club.carry + (m.dist || 0)) * st.distMult * (1 + (ball.dist || 0) / 100);
    if (st.perks && st.perks.bigturn && club.cat === 'wood') c *= 1.03;
    if (lie) c *= lieFactors(lie, club, st, m).d;
    return c;
  };

  /* o: {hole, x, y, aimX, aimY, clubId, power, acc, shape(-1,0,1), stats, mods, ball, wind{x,y}, pin,
         rng, noise(bool), streak, maxDist(putter), angOff(deg, eval only)} */
  PG.resolveShot = function (o) {
    var R = o.rng || PG.R, hole = o.hole, st = o.stats, m = o.mods || {}, ball = o.ball || PG.BALLS.basic;
    var club = PG.CLUB[o.clubId], lie = PG.lieAt(hole, o.x, o.y);
    var dx = o.aimX - o.x, dy = o.aimY - o.y, dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    var pure = st.pureHalf, a = o.acc || 0, absA = Math.abs(a);
    var err = absA <= pure ? 0 : Math.sign(a) * (absA - pure);
    if (m.laser && absA <= pure * 2) err = 0;
    var quality = absA <= pure ? 'pure' : Math.abs(err) < 3 ? 'good' : (a < 0 ? 'hook' : 'slice');
    var p = o.power, pe = st.pe || 0;
    var res = { club: o.clubId, sx: o.x, sy: o.y, quality: quality, err: err, lie: lie };

    if (club.cat === 'putter') {
      var intended = Math.max(0.05, p * (o.maxDist || 10));
      var v0 = Math.sqrt(2 * hole.greenF * intended);
      var ang = Math.atan2(dy, dx) + (o.angOff || 0) * Math.PI / 180;
      var lineErr = err * 0.22 * (1 - (m.line || 0) / 100) * (1 - (ball.putt || 0) / 100);
      ang += lineErr * Math.PI / 180;
      if (o.noise) {
        var nsd = 0.3 * st.dispMult * (1 + pe * 0.6) * (1 - (m.line || 0) / 100) * (1 - (ball.putt || 0) / 100);
        ang += R.normal(0, nsd) * Math.PI / 180;
        var vErr = R.normal(0, 0.025 * st.dispMult * (1 - (m.speed || 0) / 100) * (1 + pe * 0.5));
        if (m.lag && vErr < -0.05) vErr = -0.05;
        v0 *= 1 + vErr;
      }
      if (p > 1) v0 *= 1 + (p - 1) * 0.5;
      var rr = PG.simRoll(hole, o.x, o.y, Math.cos(ang) * v0, Math.sin(ang) * v0, { pin: o.pin, capMult: m.magnet ? 1.6 : 1 });
      res.putt = true; res.carry = 0; res.flight = null; res.roll = rr.pts;
      res.final = { x: rr.x, y: rr.y }; res.outcome = rr.out;
      if (rr.out === 'water') res.drop = PG.waterDrop(hole, o.x, o.y, rr.x, rr.y);
      return res;
    }

    var L = lieFactors(lie, club, st, m);
    var carry = PG.clubCarry(o.clubId, st, m, ball, null);
    if (o.streak && m.streak) carry *= 1 + Math.min(0.1, o.streak * 0.02);
    carry *= p <= 1 ? p : 1 + (p - 1) * 0.7;
    if (p > 1 && o.noise) err += R.normal(0, (p - 1) * 35);
    carry *= L.d;
    err *= 1 - (m.forg || 0) / 100;
    carry *= 1 - Math.min(0.3, Math.abs(err) * 0.007);
    var lat = err * carry * 0.011;
    var shapeAmt = o.shape < 0 ? -(1 + (m.draw || 0) / 100) : o.shape > 0 ? (1 + (m.fade || 0) / 100) : 0;
    lat += shapeAmt * carry * 0.07;
    var dispSd = 3.0 * st.dispMult * club.disp * L.a * (1 - (m.acc || 0) / 100) * (1 + pe * 0.5);
    if (st.perks && st.perks.surgeon && carry < 150) dispSd *= 0.85;
    var angErr = (o.angOff || 0) + (o.noise ? R.normal(0, dispSd) : 0);
    if (o.noise) carry *= 1 + R.normal(0, 0.022 * st.dispMult * L.a);
    if (o.carryMul) carry *= o.carryMul;
    // wind
    var w = o.wind || { x: 0, y: 0 };
    var wf = (1 - Math.min(0.7, st.windRes)) * (1 - (m.wind || 0) / 100) * (1 - (ball.wind || 0) / 100) * (club.apex / 31) * (1 + (ball.spin || 0) / 250) * (carry / 200);
    if (st.perks && st.perks.stinger && (club.cat === 'wood' || club.cat === 'hybrid')) wf *= 0.85;
    if (L.punch) wf *= 0.4;
    var px = -dy, py = dx;
    var along = w.x * dx + w.y * dy, cross = w.x * px + w.y * py;
    carry += along * (along < 0 ? 0.72 : 0.5) * wf;
    lat += cross * 0.8 * wf;
    carry = Math.max(3, carry);
    var a0 = Math.atan2(dy, dx) + angErr * Math.PI / 180;
    var ddx = Math.cos(a0), ddy = Math.sin(a0), ppx = -ddy, ppy = ddx;
    var apex = club.apex * (0.55 + 0.45 * Math.min(1, p)) * (L.punch ? 0.35 : 1);
    var fl = { sx: o.x, sy: o.y, ddx: ddx, ddy: ddy, ppx: ppx, ppy: ppy, carry: carry, lat: lat, apex: apex, tEnd: 1 };
    res.flight = fl; res.carry = carry;
    // flight path & tree collisions
    var N = Math.max(12, Math.ceil(carry / 2)), startTree = lie.tree;
    for (var i = 1; i <= N; i++) {
      var t = i / N;
      var fx = o.x + ddx * carry * t + ppx * lat * t * t, fy = o.y + ddy * carry * t + ppy * lat * t * t;
      var h = 4 * apex * t * (1 - t), th = hole.treeAt(fx, fy);
      if (th && h < th && !(startTree && t * carry < 12) && t * carry > 4) {
        fl.tEnd = t; res.treeHit = true;
        var bx = fx - ddx * 2 + (o.noise ? R.range(-2, 2) : 0), by = fy - ddy * 2 + (o.noise ? R.range(-2, 2) : 0);
        res.land = { x: bx, y: by };
        var tt = hole.at(bx, by);
        if (tt === T.WATER) { res.outcome = 'water'; res.final = res.land; res.drop = PG.waterDrop(hole, o.x, o.y, bx, by); return res; }
        if (tt === T.OB) { res.outcome = 'ob'; res.final = res.land; return res; }
        res.roll = [res.land]; res.final = res.land; res.outcome = 'ok';
        return res;
      }
    }
    var ex = o.x + ddx * carry + ppx * lat, ey = o.y + ddy * carry + ppy * lat;
    res.land = { x: ex, y: ey };
    var lt = hole.at(ex, ey);
    if (lt === T.WATER) { res.outcome = 'water'; res.final = res.land; res.drop = PG.waterDrop(hole, o.x, o.y, ex, ey); return res; }
    if (lt === T.OB) { res.outcome = 'ob'; res.final = res.land; return res; }
    // roll
    var spinT = club.spin * (1 + (m.spin || 0) / 100) * (1 + (ball.spin || 0) / 100) * L.s;
    var rollDist = carry * club.roll * (1 + (m.roll || 0) / 100) * (o.shape < 0 ? 1.2 : o.shape > 0 ? 0.85 : 1) * (1 - (ball.spin || 0) / 200) * (p < 0.7 ? 0.75 : 1);
    if (m.boomer) rollDist *= 1.25;
    var ret = lt === T.GREEN ? PG.clamp(0.85 - spinT * 0.8, 0.04, 0.85) : RETAIN[lt];
    if (ret === undefined) ret = 0.3;
    var v0r = Math.sqrt(2 * FRIC[T.FAIR] * Math.max(0, rollDist)) * ret;
    var tx = ddx * carry + ppx * 2 * lat, ty = ddy * carry + ppy * 2 * lat, tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    if (lt === T.GREEN && spinT > 1.02 && p > 0.6) { v0r = -(spinT - 0.95) * 7; } // zip back
    var rr2 = PG.simRoll(hole, ex, ey, tx * v0r, ty * v0r, { pin: o.pin, capMult: 1 });
    res.roll = rr2.pts; res.final = { x: rr2.x, y: rr2.y }; res.outcome = rr2.out;
    if (rr2.out === 'water') res.drop = PG.waterDrop(hole, o.x, o.y, rr2.x, rr2.y);
    return res;
  };
})();
