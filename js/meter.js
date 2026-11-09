// Three-click swing meter
(function () {
  'use strict';
  function Meter(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.phase = 'off'; this.pos = 0; this.power = null; this.t = 0;
    this.opts = { speed: 100, pure: 3, jitter: 0, target: null };
  }
  Meter.prototype.geo = function () {
    var W = this.cv.width, L = 34, Rr = W - 34;
    var S = (Rr - L) / 1.25; // px per 1.0 of power
    return { X0: L + 1.10 * S, S: S, L: L, R: Rr };
  };
  Meter.prototype.xOf = function (p) { var g = this.geo(); return g.X0 - p * g.S; };
  Meter.prototype.arm = function (opts) {
    this.opts = opts; this.phase = 'ready'; this.pos = 0; this.power = null; this.acc = null;
  };
  Meter.prototype.disarm = function () { this.phase = 'off'; };
  Meter.prototype.busy = function () { return this.phase === 'up' || this.phase === 'back' || this.phase === 'ret'; };
  Meter.prototype.click = function () {
    if (this.phase === 'ready') { this.phase = 'up'; this.pos = 0; this.t = 0; return true; }
    if (this.phase === 'up' || this.phase === 'back') { this.power = Math.max(0.01, this.pos); this.phase = 'ret'; return true; }
    if (this.phase === 'ret') { this.finish(-this.pos * 100); return true; }
    return false;
  };
  Meter.prototype.finish = function (acc) {
    this.acc = PG.clamp(acc, -15, 15); this.phase = 'done';
    var o = this.opts, pw = this.power, ac = this.acc;
    if (o.onDone) setTimeout(function () { o.onDone(pw, ac); }, 0);
  };
  Meter.prototype.update = function (dt) {
    if (!this.busy()) return;
    this.t += dt;
    var o = this.opts;
    var sp = o.speed / 100 * (1 + (o.jitter || 0) * Math.sin(this.t * 17) * Math.sin(this.t * 5.3));
    if (this.phase === 'up') { this.pos += sp * dt; if (this.pos >= 1.10) { this.pos = 1.10; this.phase = 'back'; } }
    else if (this.phase === 'back') { this.pos -= sp * dt; if (this.pos <= 0) { this.phase = 'ready'; this.pos = 0; if (o.onCancel) o.onCancel(); } }
    else if (this.phase === 'ret') { this.pos -= sp * 1.1 * dt; if (this.pos <= -0.15) { this.pos = -0.15; this.finish(15); } }
  };
  Meter.prototype.draw = function () {
    var c = this.ctx, W = this.cv.width, H = this.cv.height, g = this.geo(), o = this.opts;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#0e1418'; c.fillRect(0, 0, W, H);
    var top = 16, bh = H - 34;
    // bar body
    c.fillStyle = '#1e2a33'; c.fillRect(g.L - 2, top - 2, g.R - g.L + 4, bh + 4);
    var grd = c.createLinearGradient(this.xOf(0), 0, this.xOf(1), 0);
    grd.addColorStop(0, '#2b6b8f'); grd.addColorStop(0.6, '#3fa0c9'); grd.addColorStop(1, '#7fe0ff');
    c.fillStyle = grd; c.fillRect(this.xOf(1), top, this.xOf(0) - this.xOf(1), bh);
    c.fillStyle = '#a83a3a'; c.fillRect(this.xOf(1.10), top, this.xOf(1) - this.xOf(1.10), bh);
    c.fillStyle = '#26323b'; c.fillRect(this.xOf(0), top, this.xOf(-0.15) - this.xOf(0), bh);
    // pure zone
    var pz = (o.pure || 3) / 100;
    c.fillStyle = '#ffd34a'; c.fillRect(this.xOf(pz), top, this.xOf(-pz) - this.xOf(pz), bh);
    c.fillStyle = '#fff6c0'; c.fillRect(Math.round(this.xOf(0)), top, 1, bh);
    // ticks
    c.fillStyle = '#d8e6ee'; c.font = '12px "VT323", monospace'; c.textAlign = 'center';
    var lbl = o.labels || ['25%', '50%', '75%', '100%'];
    [0.25, 0.5, 0.75, 1].forEach(function (p, i) {
      var x = Math.round(this.xOf(p)); c.fillRect(x, top, 1, 5); c.fillRect(x, top + bh - 5, 1, 5);
      c.fillText(lbl[i], x, top + bh + 13);
    }, this);
    // target
    if (o.target !== null && o.target !== undefined && o.target > 0) {
      var tx = Math.round(this.xOf(Math.min(1.1, o.target)));
      c.fillStyle = '#5cff7a'; c.fillRect(tx - 1, top - 6, 3, bh + 12);
      c.fillText(o.targetLabel || '', tx, 11);
    }
    // power set marker
    if (this.power !== null) { var px = Math.round(this.xOf(this.power)); c.fillStyle = '#ffffff'; c.fillRect(px - 1, top - 4, 3, bh + 8); }
    // cursor
    if (this.phase !== 'off') {
      var cx = Math.round(this.xOf(this.pos));
      c.fillStyle = '#000'; c.fillRect(cx - 3, top - 5, 6, bh + 10);
      c.fillStyle = this.phase === 'ret' ? '#ff5ca8' : '#ffffff'; c.fillRect(cx - 2, top - 4, 4, bh + 8);
    }
    c.textAlign = 'left'; c.fillStyle = '#8fa3b0';
    var hint = this.phase === 'ready' ? 'SPACE / click: start swing' : this.phase === 'up' || this.phase === 'back' ? 'click to set POWER' : this.phase === 'ret' ? 'click in the GOLD zone!' : '';
    c.fillText(hint, 6, 11);
  };
  PG.Meter = Meter;
})();
