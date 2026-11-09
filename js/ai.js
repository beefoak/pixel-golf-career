// Caddie AI: shot planning, auto-swing execution, auto-played holes
(function () {
  'use strict';
  var T = PG.T;

  function puttE(d) {
    var make = 1 / (1 + Math.pow(d / 2.8, 2.3));
    var three = PG.clamp((d - 6) * 0.008, 0, 0.2);
    return 1 + (1 - make) * (1 + three);
  }
  PG.expStrokes = function (hole, x, y, pin) {
    var t = hole.at(x, y), d = PG.dist(x, y, pin.x, pin.y);
    if (t === T.WATER || t === T.OB) return 9;
    if (t === T.GREEN) return puttE(d);
    if (t === T.FRINGE && d < 20) return puttE(d) + 0.08;
    var e = d < 30 ? 2.2 + d * 0.012 : 2.38 + d * 0.0042;
    if (t === T.ROUGH) e += 0.18; else if (t === T.DEEP) e += 0.45; else if (t === T.SAND) e += d < 40 ? 0.3 : 0.5; else if (t === T.WASTE) e += 0.2;
    if (hole.treeAt(x, y)) e += 0.5;
    return e;
  };

  function shotValue(hole, pin, r) {
    if (r.outcome === 'holed') return 1;
    if (r.outcome === 'water') return 2 + PG.expStrokes(hole, r.drop.x, r.drop.y, pin);
    if (r.outcome === 'ob') return 2 + PG.expStrokes(hole, r.sx, r.sy, pin);
    return 1 + PG.expStrokes(hole, r.final.x, r.final.y, pin);
  }

  // c: {hole, pin, base(stats), mom, pe, bag:{slot:mods}, ball, wind}
  PG.aiPlan = function (c, bx, by) {
    var hole = c.hole, pin = c.pin, lie = PG.lieAt(hole, bx, by);
    var D = PG.dist(bx, by, pin.x, pin.y);
    var stPlain = PG.shotStats(c.base, c.mom || 0, c.pe || 0, {});
    if (lie.t === T.GREEN || (lie.t === T.FRINGE && D < 18) || (lie.t === T.FAIR && D < 9 && hole.at((bx + pin.x) / 2, (by + pin.y) / 2) !== T.SAND)) {
      return planPutt(c, bx, by, stPlain);
    }
    var best = null;
    var clubs = PG.SLOTS.filter(function (s) { return s !== 'PT'; });
    var tries = 0;
    clubs.forEach(function (id) {
      var club = PG.CLUB[id], m = c.bag[id] || {};
      var st = PG.shotStats(c.base, c.mom || 0, c.pe || 0, m);
      var carry = PG.clubCarry(id, st, m, c.ball, lie);
      if (carry < 5) return;
      var rollEst = carry * club.roll * 0.45;
      var minPow = club.cat === 'wedge' ? 0.12 : club.cat === 'iron' ? 0.5 : 0.65;
      var cands = [];
      if (carry + rollEst >= D * 0.9) {
        var pw = (D - rollEst * 0.4) / carry;
        if (pw >= minPow && pw <= 1.0) {
          cands.push({ ax: pin.x, ay: pin.y, power: pw, pinShot: true });
          var gc = hole.green; cands.push({ ax: (pin.x * 2 + gc.x) / 3, ay: (pin.y * 2 + gc.y) / 3, power: pw, pinShot: true });
        }
      } else {
        var tgt = hole.pointAtDist(bx, by, carry + rollEst);
        if (tgt) {
          cands.push({ ax: tgt.x, ay: tgt.y, power: 1 });
          cands.push({ ax: tgt.x - tgt.dy * 7, ay: tgt.y + tgt.dx * 7, power: 1 });
          cands.push({ ax: tgt.x + tgt.dy * 7, ay: tgt.y - tgt.dx * 7, power: 1 });
        } else if (carry < D + 25) {
          cands.push({ ax: pin.x, ay: pin.y, power: 1, pinShot: true });
        }
      }
      var spread = 1.5 * st.dispMult * club.disp * lie.a + 1.2;
      cands.forEach(function (cd) {
        tries++;
        var o = { hole: hole, x: bx, y: by, aimX: cd.ax, aimY: cd.ay, clubId: id, power: cd.power, acc: 0, shape: 0, stats: st, mods: m, ball: c.ball, wind: c.wind, pin: pin, noise: false };
        // one correction pass for wind / lie
        var r0 = PG.resolveShot(o);
        if (r0.final && !r0.treeHit && r0.outcome !== 'holed') {
          var dax = cd.ax - bx, day = cd.ay - by, dl = Math.hypot(dax, day) || 1, ux = dax / dl, uy = day / dl;
          var ex = r0.final.x - cd.ax, ey = r0.final.y - cd.ay;
          var alongErr = ex * ux + ey * uy, latErr = -ex * uy + ey * ux;
          if (cd.pinShot) o.power = PG.clamp(cd.power * dl / Math.max(5, dl + alongErr), minPow * 0.9, 1.0);
          o.aimX = cd.ax + uy * latErr; o.aimY = cd.ay - ux * latErr;
        }
        var v = 0, W = [0.25, 0.5, 0.25], offs = [-spread, 0, spread];
        for (var k = 0; k < 3; k++) {
          o.angOff = offs[k];
          v += W[k] * shotValue(hole, pin, PG.resolveShot(o));
        }
        o.angOff = 0;
        if (!best || v < best.v) best = { v: v, clubId: id, aimX: o.aimX, aimY: o.aimY, power: o.power, shape: 0 };
      });
    });
    if (!best) best = { clubId: 'SW', aimX: pin.x, aimY: pin.y, power: 0.5, shape: 0 };
    return best;
  };

  function planPutt(c, bx, by, st) {
    var hole = c.hole, pin = c.pin, m = c.bag.PT || {};
    var D = PG.dist(bx, by, pin.x, pin.y), maxDist = PG.autoPutterScale(D);
    var base = Math.atan2(pin.y - by, pin.x - bx);
    var A = PG.clamp(3 + 30 / (D + 1), 3, 22);
    var best = null;
    function evalP(off, k) {
      var intended = D * k + 0.35;
      var a = base + off * Math.PI / 180;
      var o = { hole: hole, x: bx, y: by, aimX: bx + Math.cos(a) * 5, aimY: by + Math.sin(a) * 5, clubId: 'PT', power: intended / maxDist, acc: 0, stats: st, mods: m, ball: c.ball, pin: pin, noise: false, maxDist: maxDist };
      var r = PG.resolveShot(o);
      var sc = r.outcome === 'holed' ? -1 + Math.abs(k - 1.05) * 0.1 : PG.dist(r.final.x, r.final.y, pin.x, pin.y);
      if (r.outcome === 'water') sc = 50;
      if (!best || sc < best.sc) best = { sc: sc, off: off, k: k, o: o };
    }
    var ks = [0.85, 0.95, 1.05, 1.15, 1.3, 1.5, 1.75];
    for (var i = 0; i <= 12; i++) for (var j = 0; j < ks.length; j++) evalP(-A + (2 * A) * i / 12, ks[j]);
    var bo = best.off, bk = best.k, dA = A / 6;
    for (i = -3; i <= 3; i++) for (j = -2; j <= 2; j++) evalP(bo + dA * i / 3, bk + j * 0.04);
    var o = best.o;
    return { clubId: 'PT', aimX: o.aimX, aimY: o.aimY, power: o.power, maxDist: maxDist, shape: 0 };
  }

  // Simulated swing execution for auto-played shots
  PG.aiSwing = function (plan, st, R, mult) {
    mult = mult || 1;
    var accSd = (1.5 + (100 - st.a.prec) * 0.085) * (1 + st.pe * 0.7) * mult;
    var powSd = (0.02 + (100 - st.a.prec) * 0.0006) * (1 + st.pe * 0.5) * mult;
    var acc = R.normal(0, accSd);
    if (plan.clubId === 'PT') acc += R.normal(0, 1.2 + (100 - st.a.prec) * 0.02); // green misread
    var power = plan.clubId === 'PT' ? plan.power * (1 + R.normal(0, powSd * 1.4)) : plan.power + R.normal(0, powSd);
    return { power: PG.clamp(power, 0.03, 1.08), acc: PG.clamp(acc, -15, 15) };
  };

  /* hc: {hole, pin, base, mom, bag, ball, wind, rng, streak, trailMult, pressureFn(shotIdx, distToPin)} */
  PG.playHoleAuto = function (hc) {
    var hole = hc.hole, x = hole.tee.x, y = hole.tee.y, strokes = 0, lost = 0, trees = 0, max = hole.par + 5;
    var shots = [];
    while (strokes < max) {
      var pe = hc.pressureFn ? hc.pressureFn(strokes, PG.dist(x, y, hc.pin.x, hc.pin.y)) : 0;
      var plan = PG.aiPlan({ hole: hole, pin: hc.pin, base: hc.base, mom: hc.mom, pe: pe, bag: hc.bag, ball: hc.ball, wind: hc.wind }, x, y);
      var m = hc.bag[plan.clubId] || {};
      var st = PG.shotStats(hc.base, hc.mom, pe, m, { playoff: hc.playoff, shortPutt: plan.clubId === 'PT' && PG.dist(x, y, hc.pin.x, hc.pin.y) < 5 });
      var sw = PG.aiSwing(plan, st, hc.rng, hc.trailMult);
      var r = PG.resolveShot({ hole: hole, x: x, y: y, aimX: plan.aimX, aimY: plan.aimY, clubId: plan.clubId, power: sw.power, acc: sw.acc, shape: plan.shape, stats: st, mods: m, ball: hc.ball, wind: hc.wind, pin: hc.pin, rng: hc.rng, noise: true, streak: hc.streak, maxDist: plan.maxDist });
      strokes++;
      shots.push({ club: plan.clubId, outcome: r.outcome, x: x, y: y });
      if (r.treeHit || PG.lieAt(hole, r.final.x, r.final.y).tree) trees++;
      if (r.outcome === 'holed') break;
      if (r.outcome === 'water') { strokes++; lost++; x = r.drop.x; y = r.drop.y; }
      else if (r.outcome === 'ob') { strokes++; lost++; }
      else { x = r.final.x; y = r.final.y; }
    }
    return { strokes: Math.min(strokes, max), lost: lost, trees: trees, shots: shots };
  };
})();
