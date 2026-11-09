// Pixel-art course rendering
(function () {
  'use strict';
  var T = PG.T;
  var PPY = PG.PPY = 2; // offscreen pixels per yard
  var R = PG.Render = {};

  function hex(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(c, f) { return [PG.clamp(c[0] * f, 0, 255) | 0, PG.clamp(c[1] * f, 0, 255) | 0, PG.clamp(c[2] * f, 0, 255) | 0]; }
  function noise(x, y, s) { var h = Math.imul(x * 374761393 + y * 668265263 + s * 1442695041, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  R.holeCanvas = function (hole) {
    if (hole._canvas) return hole._canvas;
    var pal = hole.pal, CP = PG.CELL * PPY; // px per cell
    var Wp = hole.cw * CP, Hp = hole.ch * CP;
    var cv = document.createElement('canvas'); cv.width = Wp; cv.height = Hp;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(Wp, Hp), d = img.data;
    var cols = {};
    cols[T.OB] = hex(pal.ob); cols[T.DEEP] = hex(pal.deep); cols[T.ROUGH] = hex(pal.rough); cols[T.FAIR] = hex(pal.fair);
    cols[T.FRINGE] = hex(pal.fringe); cols[T.GREEN] = hex(pal.green); cols[T.SAND] = hex(pal.sand); cols[T.WATER] = hex(pal.water);
    cols[T.TEE] = hex(pal.tee); cols[T.WASTE] = hex(pal.waste);
    var seed = hole.seed & 0xffff;
    for (var py = 0; py < Hp; py++) {
      var cy = (py / CP) | 0;
      for (var px = 0; px < Wp; px++) {
        var cx = (px / CP) | 0, t = hole.grid[cy * hole.cw + cx], c = cols[t];
        var n = noise(px >> 1, py >> 1, seed), f = 1;
        switch (t) {
          case T.FAIR: f = (((py / 24) | 0) % 2 ? 1.0 : 1.07) * (0.97 + n * 0.06); break;
          case T.TEE: f = 1.04 + n * 0.05; break;
          case T.GREEN: f = (((px + py) / 6 | 0) % 2 ? 1.0 : 1.04) * (0.98 + n * 0.04); break;
          case T.FRINGE: f = 0.98 + n * 0.05; break;
          case T.ROUGH: f = 0.92 + n * 0.14; break;
          case T.DEEP: f = n < 0.15 ? 0.78 : 0.9 + n * 0.16; break;
          case T.OB: f = 0.8 + n * 0.2; break;
          case T.SAND: f = n < 0.08 ? 0.88 : 0.97 + n * 0.05; break;
          case T.WASTE: f = n < 0.12 ? 0.85 : 0.95 + n * 0.08; break;
          case T.WATER: f = noise(px >> 2, py, seed + 7) < 0.06 ? 1.25 : 0.95 + n * 0.08; break;
        }
        // edge shading: darker lip where terrain changes
        var lx = px % CP, ly = py % CP;
        if ((t === T.SAND || t === T.WATER || t === T.GREEN || t === T.FRINGE) && (ly === 0 || lx === 0)) {
          var nt = ly === 0 && cy > 0 ? hole.grid[(cy - 1) * hole.cw + cx] : (lx === 0 && cx > 0 ? hole.grid[cy * hole.cw + cx - 1] : t);
          if (nt !== t && !(t === T.GREEN && nt === T.FRINGE)) f *= t === T.SAND ? 0.82 : t === T.WATER ? 0.75 : 0.88;
        }
        var o = (py * Wp + px) * 4;
        d[o] = PG.clamp(c[0] * f, 0, 255); d[o + 1] = PG.clamp(c[1] * f, 0, 255); d[o + 2] = PG.clamp(c[2] * f, 0, 255); d[o + 3] = 255;
      }
    }
    // tee markers
    function put(px, py, col) { if (px < 0 || py < 0 || px >= Wp || py >= Hp) return; var o = (py * Wp + px) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
    var tx = Math.round(hole.tee.x * PPY), ty = Math.round(hole.tee.y * PPY);
    [[-8, 0], [8, 0]].forEach(function (o) { for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) put(tx + o[0] + i, ty + j, [240, 240, 240]); });
    // trees: shadows first then canopies
    var tc = hex(pal.tree), tc2 = hex(pal.tree2), trunk = hex(pal.trunk);
    hole.trees.forEach(function (tr) {
      var cx = tr.x * PPY + 3, cy = tr.y * PPY + 4, r = tr.r * PPY;
      for (var yy = -r; yy <= r; yy++) for (var xx = -r; xx <= r; xx++) {
        if (xx * xx + yy * yy > r * r) continue;
        var px = Math.round(cx + xx), py = Math.round(cy + yy);
        if (px < 0 || py < 0 || px >= Wp || py >= Hp) continue;
        var o = (py * Wp + px) * 4; d[o] *= 0.7; d[o + 1] *= 0.7; d[o + 2] *= 0.7;
      }
    });
    hole.trees.forEach(function (tr) {
      var cx = tr.x * PPY, cy = tr.y * PPY, r = tr.r * PPY;
      for (var yy = -r; yy <= r; yy++) for (var xx = -r; xx <= r; xx++) {
        var dd = xx * xx + yy * yy;
        if (dd > r * r) continue;
        var px = Math.round(cx + xx), py = Math.round(cy + yy);
        var light = (-xx - yy) / (r * 1.4);
        var n2 = noise(px, py, 99);
        var col = light > 0.25 ? tc2 : tc;
        if (n2 < 0.18) col = shade(col, 0.85); else if (n2 > 0.9) col = shade(col, 1.15);
        if (dd > (r - 1) * (r - 1)) col = shade(tc, 0.7);
        put(px, py, col);
      }
      put(Math.round(cx), Math.round(cy), shade(tc2, 1.25));
    });
    ctx.putImageData(img, 0, 0);
    hole._canvas = cv;
    return cv;
  };

  // camera: {x, y (world center), zoom (screen px per offscreen px)}
  R.w2s = function (cam, W, H, x, y) { return { x: (x * PPY - cam.x * PPY) * cam.zoom + W / 2, y: (y * PPY - cam.y * PPY) * cam.zoom + H / 2 }; };
  R.s2w = function (cam, W, H, sx, sy) { return { x: (sx - W / 2) / (cam.zoom * PPY) + cam.x, y: (sy - H / 2) / (cam.zoom * PPY) + cam.y }; };

  R.drawView = function (ctx, hole, cam, st) {
    var W = ctx.canvas.width, H = ctx.canvas.height, z = cam.zoom * PPY;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = hole.pal.ob; ctx.fillRect(0, 0, W, H);
    var cv = R.holeCanvas(hole);
    var sx = cam.x * PPY - W / 2 / cam.zoom, sy = cam.y * PPY - H / 2 / cam.zoom;
    ctx.drawImage(cv, Math.round(sx), Math.round(sy), Math.round(W / cam.zoom), Math.round(H / cam.zoom), 0, 0, W, H);
    var w2s = function (x, y) { return R.w2s(cam, W, H, x, y); };

    // green slope arrows when putting / near green
    if (st.showSlope) {
      var g = hole.green, step = cam.zoom >= 3 ? 2.5 : 4;
      for (var yy = g.y - g.ry - 3; yy <= g.y + g.ry + 3; yy += step) for (var xx = g.x - g.rx - 3; xx <= g.x + g.rx + 3; xx += step) {
        var tt = hole.at(xx, yy); if (tt !== T.GREEN && tt !== T.FRINGE) continue;
        var s = hole.slope(xx, yy), m = Math.hypot(s.x, s.y); if (m < 0.002) continue;
        var p = w2s(xx, yy), L = Math.min(1, m / 0.03) * step * z * 0.45, ux = -s.x / m, uy = -s.y / m;
        var phase = ((st.time || 0) * 1.2 + (xx + yy) * 0.05) % 1;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.25 + 0.35 * Math.min(1, m / 0.025)) + ')';
        ctx.lineWidth = Math.max(1, cam.zoom * 0.6);
        ctx.beginPath(); ctx.moveTo(p.x - ux * L / 2, p.y - uy * L / 2); ctx.lineTo(p.x + ux * L / 2, p.y + uy * L / 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(Math.round(p.x + ux * L * (phase - 0.5)) - 1, Math.round(p.y + uy * L * (phase - 0.5)) - 1, 2, 2);
      }
    }
    // aim / preview
    if (st.preview) {
      var pv = st.preview;
      ctx.save();
      if (pv.path) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath();
        pv.path.forEach(function (q, i) { var p = w2s(q.x, q.y); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (pv.land) {
        var lp = w2s(pv.land.x, pv.land.y), rr = Math.max(5, pv.radius * z);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(lp.x, lp.y, rr, rr * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(lp.x - 1, lp.y - 1, 3, 3);
      }
      if (pv.target) {
        var tp = w2s(pv.target.x, pv.target.y);
        ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(tp.x - 6, tp.y); ctx.lineTo(tp.x + 6, tp.y); ctx.moveTo(tp.x, tp.y - 6); ctx.lineTo(tp.x, tp.y + 6); ctx.stroke();
      }
      ctx.restore();
    }
    // pin
    if (st.pin) {
      var pp = w2s(st.pin.x, st.pin.y), u = Math.max(1, Math.round(cam.zoom));
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.ellipse(pp.x, pp.y, 2.5 * u, 1.8 * u, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(Math.round(pp.x), Math.round(pp.y - 22 * u), u, 22 * u);
      var wave = Math.sin((st.time || 0) * 6) * u;
      ctx.fillStyle = '#e8413c';
      ctx.beginPath(); ctx.moveTo(pp.x + u, pp.y - 22 * u); ctx.lineTo(pp.x + 11 * u, pp.y - 18 * u + wave); ctx.lineTo(pp.x + u, pp.y - 14 * u); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round(pp.x), Math.round(pp.y), 10 * u, u);
    }
    // ball (with height)
    if (st.ball) {
      var b = st.ball, bp = w2s(b.x, b.y), h = (b.h || 0), bs = Math.max(3, Math.round(1.5 * cam.zoom + 1));
      if (!b.holed) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(Math.round(bp.x - bs / 2 + h * 0.4), Math.round(bp.y - bs / 2 + h * 0.2), bs, bs);
        var by = bp.y - h * z * 0.9;
        var size = bs + Math.round(h / 12);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(bp.x - size / 2), Math.round(by - size / 2), size, size);
        ctx.fillStyle = '#c9ccd2'; ctx.fillRect(Math.round(bp.x - size / 2) + size - 1, Math.round(by - size / 2) + 1, 1, size - 1);
      }
    }
    if (st.trail && st.trail.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      st.trail.forEach(function (q, i) { var p = w2s(q.x, q.y); var yv = p.y - (q.h || 0) * z * 0.9; if (i) ctx.lineTo(p.x, yv); else ctx.moveTo(p.x, yv); });
      ctx.stroke();
    }
  };

  R.drawMinimap = function (ctx, hole, st) {
    var W = ctx.canvas.width, H = ctx.canvas.height;
    var cv = R.holeCanvas(hole);
    var s = Math.min(W / cv.width, H / cv.height);
    var dw = cv.width * s, dh = cv.height * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
    ctx.fillStyle = '#10161c'; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cv, ox, oy, dw, dh);
    function m(x, y) { return { x: ox + x * PPY * s, y: oy + y * PPY * s }; }
    if (st.view) {
      var a = m(st.view.x0, st.view.y0), b = m(st.view.x1, st.view.y1);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    if (st.aim && st.ball) {
      var p1 = m(st.ball.x, st.ball.y), p2 = m(st.aim.x, st.aim.y);
      ctx.strokeStyle = '#ffe14a'; ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    if (st.pin) { var pp = m(st.pin.x, st.pin.y); ctx.fillStyle = '#e8413c'; ctx.fillRect(pp.x - 2, pp.y - 2, 4, 4); }
    if (st.ball) { var bp = m(st.ball.x, st.ball.y); ctx.fillStyle = '#fff'; ctx.fillRect(bp.x - 2, bp.y - 2, 4, 4); }
    return { s: s, ox: ox, oy: oy };
  };
})();
