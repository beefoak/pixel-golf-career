// Procedural 18-hole course generation
(function () {
  'use strict';
  var T = PG.T = { OB: 0, DEEP: 1, ROUGH: 2, FAIR: 3, FRINGE: 4, GREEN: 5, SAND: 6, WATER: 7, TEE: 8, WASTE: 9 };
  PG.TNAME = ['Out of Bounds', 'Deep Rough', 'Rough', 'Fairway', 'Fringe', 'Green', 'Bunker', 'Water', 'Tee Box', 'Waste Area'];
  var CELL = PG.CELL = 2; // yards per terrain cell

  function Hole(o) { for (var k in o) this[k] = o[k]; }
  Hole.prototype.idx = function (x, y) {
    var cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= this.cw || cy >= this.ch) return -1;
    return cy * this.cw + cx;
  };
  Hole.prototype.at = function (x, y) { var i = this.idx(x, y); return i < 0 ? T.OB : this.grid[i]; };
  Hole.prototype.treeAt = function (x, y) { var i = this.idx(x, y); return i < 0 ? 0 : this.treeH[i]; };
  Hole.prototype.slope = function (x, y) {
    var g = this.gs;
    return {
      x: g.a + g.c * g.f1 * Math.cos(x * g.f1 + g.p1) * Math.cos(y * g.f2 + g.p2),
      y: g.b - g.c * g.f2 * Math.sin(x * g.f1 + g.p1) * Math.sin(y * g.f2 + g.p2)
    };
  };
  // centerline helpers
  Hole.prototype.pointAt = function (s) {
    var p = this.pts, acc = 0;
    for (var i = 0; i < p.length - 1; i++) {
      var L = PG.dist(p[i].x, p[i].y, p[i + 1].x, p[i + 1].y);
      if (s <= acc + L || i === p.length - 2) {
        var t = PG.clamp((s - acc) / L, 0, 1);
        return { x: p[i].x + (p[i + 1].x - p[i].x) * t, y: p[i].y + (p[i + 1].y - p[i].y) * t, dx: (p[i + 1].x - p[i].x) / L, dy: (p[i + 1].y - p[i].y) / L };
      }
      acc += L;
    }
    return { x: p[0].x, y: p[0].y, dx: 0, dy: -1 };
  };
  Hole.prototype.project = function (x, y) { return projectPts(this.pts, x, y); };
  // first point along centerline (after the ball's projection) that is at straight distance R from the ball
  Hole.prototype.pointAtDist = function (x, y, R) {
    var s0 = this.project(x, y).s, step = 3;
    for (var s = s0; s <= this.len; s += step) {
      var p = this.pointAt(s);
      if (PG.dist(x, y, p.x, p.y) >= R) return p;
    }
    return null;
  };

  function projectPts(p, x, y) {
    var best = { d: 1e9, s: 0, side: 0 }, acc = 0;
    for (var i = 0; i < p.length - 1; i++) {
      var ax = p[i].x, ay = p[i].y, bx = p[i + 1].x, by = p[i + 1].y;
      var vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy, L = Math.sqrt(L2);
      var t = ((x - ax) * vx + (y - ay) * vy) / L2;
      var tc = PG.clamp(t, 0, 1);
      var qx = ax + vx * tc, qy = ay + vy * tc;
      var d = Math.hypot(x - qx, y - qy);
      if (d < best.d) {
        var cross = vx * (y - ay) - vy * (x - ax);
        best = { d: d, s: acc + t * L, side: cross > 0 ? 1 : -1 };
        if (i === 0 && t < 0) best.s = t * L; // behind tee
        if (i === p.length - 2 && t > 1) best.s = acc + t * L;
      }
      acc += L;
    }
    return best;
  }

  function inEllipse(x, y, e, grow) {
    var dx = x - e.x, dy = y - e.y, c = Math.cos(-e.rot), s = Math.sin(-e.rot);
    var u = dx * c - dy * s, v = dx * s + dy * c;
    var rx = e.rx + (grow || 0), ry = e.ry + (grow || 0);
    return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1;
  }
  PG.inEllipse = inEllipse;

  PG.genHole = function (seed, num, par, length, themeKey, tour) {
    var R = new PG.RNG(seed);
    var th = PG.THEMES[themeKey];
    // --- centerline ---
    var ang = -Math.PI / 2 + R.range(-0.15, 0.15);
    var segs;
    if (par === 3) segs = [length];
    else if (par === 4) {
      var b = R.range(225, 270);
      segs = (length - b > 90 && R.chance(0.75)) ? [b, length - b] : [length];
    } else {
      var b1 = R.range(240, 280), rest = length - b1, b2 = rest * R.range(0.45, 0.6);
      segs = [b1, b2, rest - b2];
    }
    var pts = [{ x: 0, y: 0 }], cur = { x: 0, y: 0 };
    var bendDir = R.chance(0.5) ? 1 : -1;
    segs.forEach(function (L, i) {
      if (i > 0) { ang += bendDir * R.range(0.15, 0.55); if (R.chance(0.4)) bendDir = -bendDir; }
      ang = PG.clamp(ang, -Math.PI / 2 - 0.85, -Math.PI / 2 + 0.85);
      cur = { x: cur.x + Math.cos(ang) * L, y: cur.y + Math.sin(ang) * L };
      pts.push(cur);
    });
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    pts.forEach(function (p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    var MX = 95, MT = 70, MB = 45;
    pts = pts.map(function (p) { return { x: p.x - minX + MX, y: p.y - minY + MT }; });
    var W = (maxX - minX) + MX * 2, H = (maxY - minY) + MT + MB;
    var cw = Math.ceil(W / CELL), ch = Math.ceil(H / CELL);
    var tee = pts[0], gc = pts[pts.length - 1];
    var len = segs.reduce(function (a, b) { return a + b; }, 0);

    // --- green ---
    var green = { x: gc.x, y: gc.y, rx: R.range(11, 16), ry: R.range(10, 15), rot: R.range(0, Math.PI) };
    if (par === 3) { green.rx *= 0.9; green.ry *= 0.9; }
    var hw0 = R.range(13, 19) * tour.fair, ph = R.range(0, 6);
    var fairStart = par === 3 ? len - 38 : R.range(35, 70);
    var rough0 = R.range(14, 22);
    function hw(s) { return hw0 * (1 + 0.18 * Math.sin(s / 37 + ph)); }
    function rw(s) { return hw(s) + rough0; }
    var coastSide = th.coast ? (R.chance(0.5) ? 1 : -1) : 0;

    var grid = new Uint8Array(cw * ch), treeH = new Uint8Array(cw * ch);
    var projCache = new Array(cw * ch);
    var x, y, cx, cy, i, p;
    for (cy = 0; cy < ch; cy++) for (cx = 0; cx < cw; cx++) {
      x = (cx + 0.5) * CELL; y = (cy + 0.5) * CELL; i = cy * cw + cx;
      p = projectPts(pts, x, y); projCache[i] = p;
      var t = T.OB;
      var limit = p.s > len ? 50 : 70;
      if (p.s < -30) limit = 0;
      if (p.d < limit) t = th.waste ? T.WASTE : T.DEEP;
      if (coastSide && p.side === coastSide && p.d > rw(p.s) + 8 && p.s > 20) t = T.WATER;
      if (p.d < rw(p.s) && p.s > -15) t = T.ROUGH;
      if (p.d < hw(p.s) && p.s > fairStart && p.s < len) t = T.FAIR;
      if (inEllipse(x, y, green, 2.5)) t = T.FRINGE;
      if (inEllipse(x, y, green, 0)) t = T.GREEN;
      if (Math.abs(x - tee.x) < 6 && Math.abs(y - tee.y) < 5) t = T.TEE;
      grid[i] = t;
    }
    function setCircle(cxw, cyw, r, type, protect) {
      var x0 = Math.floor((cxw - r) / CELL), x1 = Math.ceil((cxw + r) / CELL), y0 = Math.floor((cyw - r) / CELL), y1 = Math.ceil((cyw + r) / CELL);
      for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) {
        if (xx < 0 || yy < 0 || xx >= cw || yy >= ch) continue;
        var wx = (xx + 0.5) * CELL, wy = (yy + 0.5) * CELL;
        if ((wx - cxw) * (wx - cxw) + (wy - cyw) * (wy - cyw) > r * r) continue;
        var k = yy * cw + xx, cur = grid[k];
        if (protect.indexOf(cur) >= 0) continue;
        grid[k] = type;
      }
    }
    var bunkers = 0, waters = 0;
    function blob(bx, by, r, type, protect) {
      setCircle(bx, by, r, type, protect);
      var n = R.int(1, 3);
      for (var k = 0; k < n; k++) setCircle(bx + R.range(-r, r) * 0.7, by + R.range(-r, r) * 0.7, r * R.range(0.5, 0.8), type, protect);
    }
    var protSand = [T.GREEN, T.TEE, T.WATER];
    // fairway bunkers
    if (par > 3) {
      var nb = Math.round(R.range(0, 2.6) * th.sand * tour.haz);
      for (var k = 0; k < nb; k++) {
        var s = R.range(210, Math.min(290, len - 60)), side = R.chance(0.5) ? 1 : -1;
        var pa = pointOn(pts, s), off = side * (hw(s) + R.range(-5, 7));
        blob(pa.x - pa.dy * off, pa.y + pa.dx * off, R.range(4.5, 8), T.SAND, protSand); bunkers++;
      }
      if (th.pot) {
        var np = R.int(2, 5);
        for (k = 0; k < np; k++) {
          var s2 = R.range(150, len - 40), pb = pointOn(pts, s2), off2 = R.range(-hw(s2), hw(s2));
          setCircle(pb.x - pb.dy * off2, pb.y + pb.dx * off2, R.range(2.4, 3.6), T.SAND, protSand); bunkers++;
        }
      }
    }
    // greenside bunkers
    var ng = PG.clamp(Math.round(R.range(0.6, 3.2) * th.sand * tour.haz), 0, 4);
    for (k = 0; k < ng; k++) {
      var a = R.range(0, Math.PI * 2);
      var r = R.range(3.5, 6.5);
      var gx = green.x + Math.cos(a) * (Math.max(green.rx, green.ry) + 2 + r * 0.6);
      var gy = green.y + Math.sin(a) * (Math.max(green.rx, green.ry) + 2 + r * 0.6);
      blob(gx, gy, r, T.SAND, protSand); bunkers++;
    }
    // water
    var protW = [T.GREEN, T.FRINGE, T.TEE];
    if (R.chance(th.water * tour.haz)) {
      var kind = par === 3 ? (R.chance(0.6) ? 'front' : 'lateral') : (par === 5 && R.chance(0.45) ? 'creek' : R.pick(['lateral', 'lateral', 'front']));
      if (kind === 'front') {
        var sF = len - R.range(28, 48), pf = pointOn(pts, sF), rr = R.range(10, 16);
        var gd = PG.dist(pf.x, pf.y, green.x, green.y);
        if (gd > Math.max(green.rx, green.ry) + rr + 3 && sF > 40) { blob(pf.x + R.range(-6, 6), pf.y, rr, T.WATER, protW); waters++; }
      } else if (kind === 'lateral') {
        var sL = R.range(Math.min(170, len * 0.5), Math.max(len * 0.55, len - 70)), pl = pointOn(pts, sL), sd = R.chance(0.5) ? 1 : -1, rl = R.range(14, 26);
        var offL = sd * (hw(sL) + R.range(4, 10) + rl);
        var lx = pl.x - pl.dy * offL, ly = pl.y + pl.dx * offL;
        blob(lx, ly, rl, T.WATER, protW);
        blob(lx + pl.dx * rl, ly + pl.dy * rl, rl * 0.8, T.WATER, protW); waters++;
      } else {
        var sc = R.range(len - 170, len - 100), wdt = R.range(5, 8);
        for (i = 0; i < grid.length; i++) {
          var pc = projCache[i];
          if (Math.abs(pc.s - sc) < wdt / 2 && pc.d < 90 && protW.indexOf(grid[i]) < 0) grid[i] = T.WATER;
        }
        waters++;
      }
    }
    // trees
    var trees = [];
    if (th.trees > 0) {
      for (y = 0; y < H; y += 7) for (x = 0; x < W; x += 7) {
        var jx = x + R.range(0, 7), jy = y + R.range(0, 7);
        var tt = (function () { var ii = Math.floor(jy / CELL) * cw + Math.floor(jx / CELL); return ii >= 0 && ii < grid.length ? grid[ii] : -1; })();
        if (tt !== T.ROUGH && tt !== T.DEEP && tt !== T.WASTE && tt !== T.OB) continue;
        var pp = projectPts(pts, jx, jy);
        var edge = hw(pp.s) + 9;
        if (pp.d < edge) continue;
        if (PG.dist(jx, jy, green.x, green.y) < Math.max(green.rx, green.ry) + 10) continue;
        var prob = th.trees * PG.clamp((pp.d - edge) / 38, 0, 1) * 0.55;
        if (tt === T.OB) prob *= 0.8;
        if (pp.s < 15) prob *= 0.3;
        if (R.chance(prob)) trees.push({ x: jx, y: jy, r: R.range(3.5, 6.5), h: R.range(11, 20) });
      }
      // dogleg corner clumps
      for (i = 1; i < pts.length - 1 && th.trees > 0.3; i++) {
        var ax = pts[i].x - pts[i - 1].x, ay = pts[i].y - pts[i - 1].y, bx = pts[i + 1].x - pts[i].x, by = pts[i + 1].y - pts[i].y;
        var cr = ax * by - ay * bx; // >0 => turning right (screen coords)
        var al = Math.hypot(ax, ay), inX = ax / al, inY = ay / al;
        var side2 = cr > 0 ? 1 : -1; // inside of bend: right side
        var rx = -inY * side2, ry = inX * side2;
        var nT = R.int(4, 8);
        for (k = 0; k < nT; k++) {
          var dd = hw(0) + R.range(12, 32), back = R.range(10, 60);
          var tx = pts[i].x + rx * dd - inX * back, ty = pts[i].y + ry * dd - inY * back;
          var g2 = grid[Math.floor(ty / CELL) * cw + Math.floor(tx / CELL)];
          if (g2 === T.ROUGH || g2 === T.DEEP || g2 === T.WASTE) trees.push({ x: tx, y: ty, r: R.range(4, 7), h: R.range(14, 22) });
        }
      }
    }
    trees.forEach(function (tr) {
      var r = tr.r * 0.85;
      var x0 = Math.floor((tr.x - r) / CELL), x1 = Math.ceil((tr.x + r) / CELL), y0 = Math.floor((tr.y - r) / CELL), y1 = Math.ceil((tr.y + r) / CELL);
      for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) {
        if (xx < 0 || yy < 0 || xx >= cw || yy >= ch) continue;
        var wx = (xx + 0.5) * CELL, wy = (yy + 0.5) * CELL;
        if ((wx - tr.x) * (wx - tr.x) + (wy - tr.y) * (wy - tr.y) > r * r) continue;
        var g3 = grid[yy * cw + xx];
        if (g3 === T.ROUGH || g3 === T.DEEP || g3 === T.WASTE || g3 === T.OB) treeH[yy * cw + xx] = Math.max(treeH[yy * cw + xx], Math.round(tr.h));
      }
    });

    // pins (one per round + spare for playoff)
    var pins = [];
    for (k = 0; k < 5; k++) {
      for (var tries = 0; tries < 50; tries++) {
        var pa2 = R.range(0, Math.PI * 2), pr = Math.sqrt(R.next()) * 0.72;
        var u = Math.cos(pa2) * green.rx * pr, v = Math.sin(pa2) * green.ry * pr;
        var px = green.x + u * Math.cos(green.rot) - v * Math.sin(green.rot), py = green.y + u * Math.sin(green.rot) + v * Math.cos(green.rot);
        var cell = grid[Math.floor(py / CELL) * cw + Math.floor(px / CELL)];
        if (cell === T.GREEN) { pins.push({ x: px, y: py }); break; }
      }
      if (pins.length <= k) pins.push({ x: green.x, y: green.y });
    }
    // green slope field
    var sm = R.range(0.004, 0.016), sa = R.range(0, Math.PI * 2);
    var gs = { a: Math.cos(sa) * sm, b: Math.sin(sa) * sm, c: R.range(0.04, 0.11), f1: R.range(0.07, 0.17), f2: R.range(0.07, 0.17), p1: R.range(0, 6.3), p2: R.range(0, 6.3) };

    // difficulty estimate (strokes vs par relative to a tour-average hole)
    var std = { 3: 175, 4: 405, 5: 535 }[par] * tour.len;
    var diff = (len - std) / std * 1.4 + bunkers * 0.035 + waters * 0.12 + Math.min(trees.length, 120) * 0.0012 + (par === 5 ? -0.22 : par === 3 ? 0.06 : 0.04);

    return new Hole({
      num: num, par: par, len: Math.round(len), seed: seed, theme: themeKey, pal: th.pal,
      W: W, H: H, cw: cw, ch: ch, grid: grid, treeH: treeH, trees: trees, pts: pts,
      tee: { x: tee.x, y: tee.y - 1 }, green: green, pins: pins, gs: gs,
      greenF: tour.green * R.range(0.95, 1.05), diff: diff, hasWater: waters > 0, bunkers: bunkers
    });
  };

  function pointOn(pts, s) {
    var acc = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var L = PG.dist(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      if (s <= acc + L || i === pts.length - 2) {
        var t = PG.clamp((s - acc) / L, 0, 1);
        return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, dx: (pts[i + 1].x - pts[i].x) / L, dy: (pts[i + 1].y - pts[i].y) / L };
      }
      acc += L;
    }
  }

  // ---------- Course ----------
  function Course(o) { for (var k in o) this[k] = o[k]; this._cache = {}; }
  Course.prototype.hole = function (i) {
    if (!this._cache[i]) {
      var h = this.holes[i];
      this._cache[i] = PG.genHole(h.seed, i + 1, h.par, h.len, this.theme, PG.TOURS[this.tier]);
      if (this.major) this._cache[i].greenF *= 0.94;
    }
    return this._cache[i];
  };
  Course.prototype.par = function () { return this.holes.reduce(function (a, h) { return a + h.par; }, 0); };
  Course.prototype.yards = function () { return this.holes.reduce(function (a, h) { return a + h.len; }, 0); };

  PG.genCourse = function (seed, tier, opts) {
    opts = opts || {};
    var R = new PG.RNG(seed), tour = PG.TOURS[tier];
    var theme = opts.theme || R.pick(PG.THEME_KEYS);
    var th = PG.THEMES[theme];
    var name = R.pick(PG.COURSE_A) + ' ' + R.pick(PG.COURSE_B) + ' ' + R.pick(th.suffix);
    function nine() {
      var arr = [3, 3, 5, 5, 4, 4, 4, 4, 4];
      do { R.shuffle(arr); } while (arr[0] === 3 || (arr[0] === 5 && R.chance(0.7)));
      return arr;
    }
    var pars = nine().concat(nine());
    var lenMul = tour.len * (opts.major ? 1.04 : 1);
    var holes = pars.map(function (par, i) {
      var len = par === 3 ? R.range(135, 225) : par === 4 ? R.range(335, 470) : R.range(495, 590);
      return { par: par, len: Math.round(len * lenMul), seed: PG.hash(seed, 'h', i) };
    });
    var c = new Course({ seed: seed, tier: tier, theme: theme, name: name, holes: holes, major: !!opts.major });
    // featured (key) holes: hardest par 4, a par 3 (water if any), a par 5, plus 18
    var diffs = holes.map(function (h, i) { return { i: i, par: h.par, d: c.hole(i).diff, w: c.hole(i).hasWater }; });
    var p4 = diffs.filter(function (d) { return d.par === 4 && d.i !== 17; }).sort(function (a, b) { return b.d - a.d; })[0];
    var p3s = diffs.filter(function (d) { return d.par === 3 && d.i !== 17; });
    var p3 = p3s.filter(function (d) { return d.w; })[0] || p3s[0];
    var p5 = diffs.filter(function (d) { return d.par === 5 && d.i !== 17; }).sort(function (a, b) { return b.d - a.d; })[0];
    c.featured = [p4, p3, p5].filter(Boolean).map(function (d) { return d.i; }).concat([17]);
    return c;
  };
})();
