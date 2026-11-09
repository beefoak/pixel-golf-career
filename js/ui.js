// Screens, hub, menus, modals
(function () {
  'use strict';
  var U = PG.UI = {};
  var C = null; // career
  var tab = 'overview';
  var wsSel = { head: null, shaft: null, grip: null, fuse: [] };
  var $ = function (id) { return document.getElementById(id); };

  // ---------- basics ----------
  U.show = function (name) {
    document.querySelectorAll('.scr').forEach(function (s) { s.classList.remove('active'); });
    $('scr-' + name).classList.add('active');
    U.cur = name;
    window.scrollTo(0, 0);
  };
  U.isScreen = function (n) { return U.cur === n; };
  var toastTimer = null;
  U.toast = function (html, ms, cls) {
    var el = $('toast'); el.innerHTML = html; el.className = 'show ' + (cls || '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.className = ''; }, ms || 1200);
  };
  U.modal = function (html, buttons) {
    var m = $('modal');
    m.innerHTML = html + '<div class="btns" id="mBtns"></div>';
    (buttons || [{ t: 'OK' }]).forEach(function (b) {
      var el = document.createElement('button'); el.textContent = b.t; if (b.cls) el.className = b.cls;
      el.onclick = function () { U.closeModal(); if (b.f) b.f(); };
      $('mBtns').appendChild(el);
    });
    $('modalBg').classList.add('show');
  };
  U.closeModal = function () { $('modalBg').classList.remove('show'); };
  U.modalOpen = function () { return $('modalBg').classList.contains('show'); };
  function save() { PG.save(C); }

  // tooltips
  document.addEventListener('mousemove', function (e) {
    var el = e.target.closest ? e.target.closest('[data-tip]') : null, tip = $('tip');
    if (!el) { tip.style.display = 'none'; return; }
    tip.innerHTML = el.getAttribute('data-tip'); tip.style.display = 'block';
    var x = e.clientX + 16, y = e.clientY + 16;
    if (x + 330 > window.innerWidth) x = e.clientX - 330;
    if (y + tip.offsetHeight > window.innerHeight) y = window.innerHeight - tip.offsetHeight - 6;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });

  // ---------- item rendering ----------
  function modsHTML(mods) {
    return Object.keys(mods).map(function (k) {
      var uni = !!PG.UNIQUES[k], tier = uni ? 5 : PG.modTierOf(k, mods[k]);
      return '<div><span class="mtier" style="background:' + PG.RARITY[tier].c + '">' + (uni ? '★' : tier) + '</span>' + PG.esc(PG.modLabel(k, mods[k])) + '</div>';
    }).join('') || '<div class="dim">No modifiers</div>';
  }
  U.itemCard = function (it, opts) {
    opts = opts || {};
    if (it.kind === 'club') {
      var r = PG.clubRarity(it), m = PG.clubMods(it);
      return '<div class="item' + (opts.sel ? ' sel' : '') + '" data-uid="' + it.uid + '" style="border-color:' + PG.RARITY[r].c + '">' +
        (opts.price ? '<span class="price">' + PG.money(opts.price) + '</span>' : '') +
        '<div class="nm">' + PG.esc(PG.clubName(it)) + '</div><div class="rar" style="color:' + PG.RARITY[r].c + '">' + PG.RARITY[r].n + ' ' + PG.CLUB[it.slot].name + '</div>' +
        '<div class="dim" style="font-size:15px">Head ' + dot(it.head) + ' · Shaft ' + dot(it.shaft) + ' · Grip ' + dot(it.grip) + '</div>' +
        '<div class="mods">' + modsHTML(m) + '</div>' + (opts.extra || '') + '</div>';
    }
    return '<div class="item' + (opts.sel ? ' sel' : '') + '" data-uid="' + it.uid + '" style="border-color:' + PG.RARITY[it.rarity].c + '">' +
      (opts.price ? '<span class="price">' + PG.money(opts.price) + '</span>' : '') +
      '<div class="nm">' + PG.esc(it.name) + '</div><div class="rar" style="color:' + PG.RARITY[it.rarity].c + '">' + PG.RARITY[it.rarity].n + ' ' + it.part + (it.part === 'head' ? '' : it.fit === 'putter' ? ' (putter)' : '') + '</div>' +
      '<div class="mods">' + modsHTML(it.mods) + '</div>' + (opts.extra || '') + '</div>';
  };
  function dot(p) { return '<b style="color:' + PG.RARITY[p.rarity].c + '">■</b>'; }
  function ballCard(k, count, extra) {
    var b = PG.BALLS[k];
    return '<div class="item" data-ball="' + k + '" style="border-color:' + PG.RARITY[b.r].c + '"><div class="nm">' + b.n + '</div><div class="rar" style="color:' + PG.RARITY[b.r].c + '">' + PG.RARITY[b.r].n + ' ball' + (count !== undefined ? ' · ×' + count : '') + '</div>' +
      '<div class="mods"><div>Distance ' + (b.dist >= 0 ? '+' : '') + b.dist + '%</div><div>Spin ' + (b.spin >= 0 ? '+' : '') + b.spin + '%</div>' + (b.wind ? '<div>Wind resist ' + b.wind + '%</div>' : '') + (b.putt ? '<div>Putting ' + (b.putt > 0 ? '+' : '') + b.putt + '%</div>' : '') + '</div><div class="dim" style="font-size:15px">' + b.desc + '</div>' + (extra || '') + '</div>';
  }

  // ---------- title ----------
  function titleArt() {
    var cv = $('titleArt'), ctx = cv.getContext('2d');
    var hole = PG.genHole(PG.hash('title', 3), 1, 4, 380, 'parkland', PG.TOURS[2]);
    var hc = PG.Render.holeCanvas(hole);
    ctx.imageSmoothingEnabled = false;
    ctx.save(); ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate(-Math.PI / 2);
    ctx.drawImage(hc, -hc.width / 2 * 0.36, -hc.height / 2 * 0.36 + 0, hc.width * 0.36, hc.height * 0.36);
    ctx.restore();
  }
  U.title = function () {
    U.show('title');
    var saved = PG.load();
    var h = '';
    if (saved) h += '<button class="pri" id="tCont">Continue career</button><div class="dim">' + PG.esc(saved.golfer.name) + ' · Season ' + saved.season + ' · ' + PG.TOURS[saved.tier].short + '</div>';
    h += '<button id="tNew"' + (saved ? '' : ' class="pri"') + '>New career</button>';
    h += '<button id="tHelp">How to play</button>';
    $('titleMenu').innerHTML = h;
    if (saved) $('tCont').onclick = function () { C = saved; resume(); };
    $('tNew').onclick = function () {
      if (saved) U.modal('<h2>Start over?</h2><p>This overwrites your current career.</p>', [{ t: 'Cancel' }, { t: 'Overwrite', cls: 'danger', f: create }]);
      else create();
    };
    $('tHelp').onclick = help;
    try { titleArt(); } catch (e) { }
  };
  function help() {
    U.modal('<h2>How to play</h2>' +
      '<p><b>Swing meter</b> (3 clicks / SPACE): start → set <b>power</b> (green tick = power needed to land on your aim point) → stop the returning cursor in the <b class="gold">gold pure zone</b>. Early = hook/pull left, late = slice/push right. Overswing (red) adds distance and risk.</p>' +
      '<p><b>Aim</b>: click the course or minimap where you want the ball to land. The caddie pre-aims each shot. Wind is NOT included in the preview — check the arrow.</p>' +
      '<p><b>Putting</b>: pick a putt scale (Q/E), read the slope arrows (they flow downhill), and the preview line shows the first part of the break (longer with Precision).</p>' +
      '<p><b>Modes</b>: <i>Every shot</i>, <i>Key shots</i> (featured holes each round, plus the closing stretch when you\'re in contention, plus playoffs), or <i>Simulate</i>.</p>' +
      '<p><b>Attributes</b>: Precision (accuracy, slower meter), Power (distance), Composure (pure zone size, wind/lie resistance, playoffs), Confidence (momentum, protecting leads, chasing).</p>' +
      '<p><b>Career</b>: 12 events a season. Finish top ' + PG.PROMOTE_TOP + ' on the points list (or win 3 times) to move up a tour.</p>');
  }

  // ---------- create ----------
  var alloc = { prec: 5, pow: 5, comp: 5, conf: 5 };
  function create() {
    U.show('create');
    alloc = { prec: 5, pow: 5, comp: 5, conf: 5 };
    renderAlloc();
    $('cBack').onclick = U.title;
    $('cGo').onclick = function () {
      var name = $('cName').value.trim() || 'Player One';
      C = PG.newCareer(name, alloc);
      save();
      resume();
      setTimeout(help, 300);
    };
  }
  function renderAlloc() {
    var left = 20 - alloc.prec - alloc.pow - alloc.comp - alloc.conf;
    $('cLeft').textContent = left;
    $('cAlloc').innerHTML = PG.ATTRS.map(function (k) {
      var b = PG.BRANCH[k], v = 25 + alloc[k];
      return '<div class="alloc"><span style="color:' + b.c + '">' + b.n + '</span><button data-k="' + k + '" data-d="-1">−</button><div class="bar"><i style="width:' + v + '%;background:' + b.c + '"></i></div><button data-k="' + k + '" data-d="1">+</button><b>' + v + '</b></div><div class="dim" style="font-size:16px;margin:-4px 0 6px">' + b.d + '</div>';
    }).join('');
    $('cAlloc').querySelectorAll('button').forEach(function (bt) {
      bt.onclick = function () {
        var k = bt.getAttribute('data-k'), d = +bt.getAttribute('data-d');
        var left2 = 20 - alloc.prec - alloc.pow - alloc.comp - alloc.conf;
        if (d > 0 && (left2 <= 0 || alloc[k] >= 15)) return;
        if (d < 0 && alloc[k] <= 0) return;
        alloc[k] += d; renderAlloc();
      };
    });
  }

  function resume() {
    if (C.active) {
      var t = C.active;
      U.modal('<h2>Tournament in progress</h2><p>' + PG.esc(C.schedule[t.ev].name) + ' — Round ' + Math.min(t.round + 1, t.rounds) + ', hole ' + (t.hole + 1) + '.</p>', [{ t: 'Resume', cls: 'pri', f: function () { launchTournament(t); } }, { t: 'Withdraw (counts as MC)', cls: 'danger', f: function () { withdraw(); } }]);
    }
    hub();
  }
  function withdraw() {
    var t = C.active; if (!t) return;
    C.schedule[t.ev].result = { pos: null, cut: true, toPar: 0, money: 0, wd: true };
    C.log.unshift(C.schedule[t.ev].name + ': WD');
    C.active = null; PG.advanceWeek(C); save(); hub();
  }

  // ---------- hub ----------
  var TABS = [['overview', 'This Week'], ['train', 'Training'], ['skills', 'Skill Web'], ['bag', 'Bag'], ['workshop', 'Workshop'], ['shop', 'Pro Shop'], ['standings', 'Standings'], ['career', 'Career']];
  function hub() {
    U.show('hub');
    PG.Play.stop();
    var a = PG.attrs(C.golfer);
    $('hubTop').innerHTML = '<div class="who">' + PG.esc(C.golfer.name) + ' <span class="dim" style="font-size:10px">OVR ' + PG.overall(a) + '</span></div><div class="chips">' +
      '<span class="chip">' + PG.TOURS[C.tier].n + '</span><span class="chip">Season ' + C.season + ' · Week ' + (C.week + 1) + '/' + PG.EVENTS_PER_SEASON + '</span>' +
      '<span class="chip gold">' + PG.money(C.cash) + '</span><span class="chip" data-tip="Scrap: used in the Workshop">⚙ ' + C.scrap + '</span><span class="chip">' + C.pts + ' pts</span>' +
      '<button id="hMenu">Menu</button></div>';
    $('hMenu').onclick = function () { save(); U.title(); };
    $('hubTabs').innerHTML = TABS.map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + t[1] + (t[0] === 'train' && C.sessions ? ' (' + C.sessions + ')' : '') + (t[0] === 'skills' && anyNodeBuyable() ? ' ●' : '') + '</button>'; }).join('');
    $('hubTabs').querySelectorAll('button').forEach(function (b) { b.onclick = function () { tab = b.getAttribute('data-tab'); hub(); }; });
    ({ overview: tabOverview, train: tabTrain, skills: tabSkills, bag: tabBag, workshop: tabWorkshop, shop: tabShop, standings: tabStandings, career: tabCareer })[tab]();
  }
  U.hub = function () { hub(); };
  function anyNodeBuyable() { return PG.NODES.some(function (n) { return n.id !== 'core' && PG.nodeAvailable(C.golfer, n.id) && PG.nodeAffordable(C.golfer, n.id); }); }

  function tabOverview() {
    var ev = C.schedule[C.week], tour = PG.TOURS[C.tier];
    var course = PG.eventCourse(C, ev);
    var b = '<div class="cols"><div>';
    b += '<div class="card"><div class="ttl">' + (ev.major ? '★ MAJOR · ' : '') + PG.esc(ev.name) + '</div>' +
      '<div class="kv"><span>Course</span><b>' + PG.esc(course.name) + '</b></div>' +
      '<div class="kv"><span>Style</span><b>' + PG.THEMES[course.theme].n + '</b></div>' +
      '<div class="kv"><span>Par / Yardage</span><b>' + course.par() + ' · ' + course.yards() + ' yds</b></div>' +
      '<div class="kv"><span>Format</span><b>' + tour.rounds + ' rounds' + (tour.cut ? ', cut after R2' : '') + ' · ' + tour.field + ' players</b></div>' +
      '<div class="kv"><span>Purse</span><b class="gold">' + PG.money(ev.purse) + '</b></div>' +
      '<div class="kv"><span>Featured holes</span><b>' + course.featured.map(function (i) { return '#' + (i + 1); }).join(', ') + '</b></div>' +
      '<div class="kv"><span>Ball in play</span><b>' + PG.currentBall(C).n + (C.ballSel !== 'range' ? ' (×' + (C.balls[C.ballSel] || 0) + ')' : '') + '</b></div>';
    if (C.active) {
      b += '<p class="gold">Tournament in progress — Round ' + Math.min(C.active.round + 1, C.active.rounds) + ', hole ' + (C.active.hole + 1) + '.</p><div class="btns"><button class="pri" id="resumeEv">Resume</button><button class="danger" id="wdEv">Withdraw</button></div>';
    } else if (ev.result && ev.result.skipped) {
      b += '<p class="dim">You are skipping this event (+3 training sessions).</p><div class="btns"><button class="pri" id="advWeek">Advance to next week</button></div>';
    } else {
      b += '<h3>Choose how to play</h3><div class="modes">' +
        '<button data-mode="full"><b>EVERY SHOT</b>Play all ' + tour.rounds * 18 + ' holes yourself.</button>' +
        '<button data-mode="key"><b>KEY SHOTS</b>Play ' + course.featured.length + ' featured holes per round + the finish when in contention. Caddie sims the rest.</button>' +
        '<button data-mode="sim"><b>SIMULATE</b>Your golfer, gear & stats play it out instantly.</button></div>' +
        '<div class="btns"><button id="skipEv">Skip event (+3 training sessions)</button>' + (C.sessions ? '<span class="dim" style="align-self:center">You still have ' + C.sessions + ' training session(s) this week.</span>' : '') + '</div>';
    }
    b += '</div>';
    b += '<div class="card"><div class="ttl">Scorecard preview</div>' + scorecardHTML(course, null) + '</div>';
    b += '</div><div>';
    var st = PG.seasonStandings(C), me = st.filter(function (r) { return r.isP; })[0];
    b += '<div class="card"><div class="ttl">Season race</div><table class="t">' + st.slice(0, 8).concat(me.pos > 8 ? [me] : []).map(function (r) { return '<tr class="' + (r.isP ? 'me' : '') + '"><td>' + r.pos + '</td><td>' + PG.esc(r.name) + '</td><td>' + r.pts + '</td></tr>'; }).join('') + '</table><p class="dim">Top ' + PG.PROMOTE_TOP + ' (or 3 wins) earn promotion' + (C.tier === 3 ? ' — you are on the top tour.' : ' to the ' + PG.TOURS[C.tier + 1].n + '.') + '</p></div>';
    b += '<div class="card"><div class="ttl">Schedule</div><div class="sched">' + C.schedule.map(function (e, i) {
      var r = e.result, rs = r ? (r.skipped ? 'skipped' : r.wd ? 'WD' : r.cut ? 'MC' : (r.tie ? 'T' : '') + PG.ordinal(r.pos)) : '';
      return '<div class="' + (i === C.week ? 'cur' : '') + (e.major ? ' major' : '') + '">' + (i + 1) + '. ' + PG.esc(e.name) + '<br><span class="dim">' + (rs || PG.money(e.purse)) + '</span></div>';
    }).join('') + '</div></div>';
    b += '</div></div>';
    $('hubBody').innerHTML = b;
    $('hubBody').querySelectorAll('[data-mode]').forEach(function (bt) {
      bt.onclick = function () {
        var go = function () { var t = PG.createTournament(C, bt.getAttribute('data-mode')); C.active = t; save(); launchTournament(t); };
        if (C.sessions > 0) U.modal('<h2>Unused training</h2><p>You have ' + C.sessions + ' training session(s) left this week. They are lost once the event starts.</p>', [{ t: 'Train first', f: function () { tab = 'train'; hub(); } }, { t: 'Play anyway', cls: 'pri', f: go }]);
        else go();
      };
    });
    if ($('resumeEv')) $('resumeEv').onclick = function () { launchTournament(C.active); };
    if ($('wdEv')) $('wdEv').onclick = function () { U.modal('<h2>Withdraw?</h2><p>You forfeit this event.</p>', [{ t: 'Cancel' }, { t: 'Withdraw', cls: 'danger', f: withdraw }]); };
    if ($('skipEv')) $('skipEv').onclick = function () { PG.skipWeek(C); save(); tab = 'train'; hub(); };
    if ($('advWeek')) $('advWeek').onclick = nextWeek;
  }

  function nextWeek() {
    var rec = PG.advanceWeek(C);
    save();
    if (rec) seasonEndModal(rec);
    tab = 'overview'; hub();
  }
  function seasonEndModal(rec) {
    U.modal('<h2>Season ' + rec.season + ' complete</h2><p>' + rec.tour + ' points list: <b>' + PG.ordinal(rec.pos) + '</b> (' + rec.pts + ' pts, ' + rec.wins + ' wins)</p>' +
      (rec.bonus ? '<p>Season bonus: <b class="gold">' + PG.money(rec.bonus) + '</b></p>' : '') +
      (rec.promoted ? '<p class="good">PROMOTED to the ' + PG.TOURS[C.tier].n + '!</p>' : '<p class="dim">You remain on the ' + PG.TOURS[C.tier].n + '.</p>'));
  }

  function scorecardHTML(course, rows) {
    var h = '<table class="scorecard"><tr><th>Hole</th>' + course.holes.map(function (x, i) { return '<th>' + (i + 1) + '</th>'; }).join('') + '<th>Tot</th></tr>';
    h += '<tr><td>Yds</td>' + course.holes.map(function (x) { return '<td class="dim">' + x.len + '</td>'; }).join('') + '<td>' + course.yards() + '</td></tr>';
    h += '<tr><td>Par</td>' + course.holes.map(function (x) { return '<td>' + x.par + '</td>'; }).join('') + '<td>' + course.par() + '</td></tr>';
    (rows || []).forEach(function (r, ri) {
      var tot = 0;
      h += '<tr><td>R' + (ri + 1) + '</td>' + course.holes.map(function (x, i) {
        var s = r[i]; if (s === undefined) return '<td></td>';
        tot += s; var d = s - x.par;
        return '<td class="' + (d <= -2 ? 'eag' : d === -1 ? 'bird' : d === 1 ? 'bog' : d >= 2 ? 'dbl' : '') + '">' + s + '</td>';
      }).join('') + '<td>' + (tot || '') + '</td></tr>';
    });
    return h + '</table>';
  }
  U.scorecardHTML = scorecardHTML;

  // ---------- training ----------
  function tabTrain() {
    var b = '<h2>Training — ' + C.sessions + ' session(s) left this week</h2><p class="dim">Each drill earns skill points (SP) for a branch of your Skill Web. Play the optional <b>Tempo Drill</b> mini-game for bonus SP.</p><div class="drills">';
    PG.DRILLS.forEach(function (d) {
      var sp = d.paid ? '+6 to weakest · ' + PG.money(PG.coachCost(C.tier)) : Object.keys(d.sp).map(function (k) { return '<span style="color:' + PG.BRANCH[k].c + '">+' + d.sp[k] + ' ' + PG.BRANCH[k].n + '</span>'; }).join(' ');
      b += '<div class="drill"><div class="ic">' + d.icon + '</div><b>' + d.n + '</b><div class="dim">' + d.d + '</div><div>' + sp + '</div><div class="btns">' +
        '<button data-drill="' + d.id + '"' + (C.sessions ? '' : ' disabled') + '>Quick session</button>' + (d.paid ? '' : '<button class="pri" data-drill="' + d.id + '" data-mini="1"' + (C.sessions ? '' : ' disabled') + '>Tempo Drill</button>') + '</div></div>';
    });
    b += '</div><h3>Skill points banked</h3>' + spPools();
    if (C.schedule[C.week].result && C.schedule[C.week].result.skipped) b += '<div class="btns"><button class="pri" id="advWeek2">Done training — advance week</button></div>';
    $('hubBody').innerHTML = b;
    $('hubBody').querySelectorAll('[data-drill]').forEach(function (bt) {
      bt.onclick = function () {
        var id = bt.getAttribute('data-drill');
        if (bt.getAttribute('data-mini')) miniGame(function (bonus) { applyDrill(id, bonus); });
        else applyDrill(id, 0);
      };
    });
    if ($('advWeek2')) $('advWeek2').onclick = nextWeek;
  }
  function applyDrill(id, bonus) {
    var g = PG.doDrill(C, id, bonus);
    if (!g) { U.modal('<p>Not enough cash or sessions.</p>'); return; }
    save();
    hub();
    U.modal('<h2>Session complete</h2><p>' + Object.keys(g).map(function (k) { return '<span style="color:' + PG.BRANCH[k].c + '">+' + g[k] + ' ' + PG.BRANCH[k].n + ' SP</span>'; }).join(', ') + (bonus ? ' <span class="gold">(incl. ' + bonus + ' bonus)</span>' : '') + '</p>');
  }
  function spPools() {
    var sp = C.golfer.sp;
    return '<div class="sp-pools">' + PG.ATTRS.map(function (k) { return '<div style="border-color:' + PG.BRANCH[k].c + '">' + PG.BRANCH[k].n + ': <b>' + sp[k] + '</b></div>'; }).join('') + '<div style="border-color:#fff;grid-column:span 2">Flex (any branch, from tournaments): <b>' + sp.flex + '</b></div></div>';
  }

  // Tempo drill mini-game: 5 swings at random power targets
  function miniGame(done) {
    var st = PG.shotStats(PG.makeStats(C.golfer), 0, 0, {});
    U.modal('<h2>Tempo Drill</h2><p>Hit the green power tick, then stop in the gold zone. 5 swings. Click the meter or press SPACE.</p><canvas id="mgMeter" width="700" height="62" style="width:100%;image-rendering:pixelated;cursor:pointer"></canvas><p id="mgLog"></p>', [{ t: 'Quit drill' }]);
    var cv = $('mgMeter'), m = new PG.Meter(cv), n = 0, score = 0, alive = true, last = performance.now();
    function armNext() {
      var target = 0.45 + Math.random() * 0.5;
      m.arm({ speed: 100 * st.meterSpeed, pure: st.pureHalf, jitter: 0.04, target: target, targetLabel: 'target', onDone: function (p, a) {
        var pts = (Math.abs(p - target) < 0.03 ? 1 : 0) + (Math.abs(a) <= st.pureHalf ? 1 : 0) + (Math.abs(p - target) < 0.015 && Math.abs(a) <= st.pureHalf / 2 ? 1 : 0);
        score += pts; n++;
        $('mgLog').innerHTML += 'Swing ' + n + ': power ' + Math.round(p * 100) + '% (target ' + Math.round(target * 100) + '%), ' + (Math.abs(a) <= st.pureHalf ? '<b class="gold">pure</b>' : a < 0 ? 'early' : 'late') + ' → +' + pts + '<br>';
        if (n >= 5) { alive = false; var bonus = Math.floor(score / 3); setTimeout(function () { U.closeModal(); done(bonus); }, 700); }
        else setTimeout(armNext, 500);
      } });
    }
    function key(e) { if (e.key === ' ' && alive) { e.preventDefault(); m.click(); } }
    cv.onmousedown = function () { m.click(); };
    document.addEventListener('keydown', key);
    $('mBtns').firstChild.onclick = function () { alive = false; U.closeModal(); };
    function frame(now) { if (!alive || !U.modalOpen()) { document.removeEventListener('keydown', key); return; } m.update(Math.min(0.05, (now - last) / 1000)); last = now; m.draw(); requestAnimationFrame(frame); }
    armNext(); requestAnimationFrame(frame);
  }

  // ---------- skill web ----------
  var webSel = null;
  function tabSkills() {
    var g = C.golfer, a = PG.attrs(g), pk = PG.perkSet(g);
    var b = '<div class="web-wrap"><div><svg id="webSvg" viewBox="-310 -310 620 620">';
    // ring guides
    [92, 172, 252].forEach(function (r) { b += '<circle r="' + r + '" fill="none" stroke="#1a2933" stroke-dasharray="3 5"/>'; });
    // edges
    PG.NODES.forEach(function (n) {
      n.req.forEach(function (rid) {
        var r = PG.NODE[rid]; if (!r) return;
        var own = g.nodes.indexOf(n.id) >= 0 && (rid === 'core' || g.nodes.indexOf(rid) >= 0);
        b += '<line x1="' + r.x + '" y1="' + r.y + '" x2="' + n.x + '" y2="' + n.y + '" stroke="' + (own ? '#ffd34a' : '#2a3a46') + '" stroke-width="' + (own ? 3 : 2) + '"/>';
      });
    });
    PG.NODES.forEach(function (n) {
      var owned = n.id === 'core' || g.nodes.indexOf(n.id) >= 0, avail = !owned && PG.nodeAvailable(g, n.id), aff = avail && PG.nodeAffordable(g, n.id);
      var col = n.br.length === 1 ? PG.BRANCH[n.br[0]].c : n.br.length ? mix(PG.BRANCH[n.br[0]].c, PG.BRANCH[n.br[1]].c) : '#fff';
      var r = n.id === 'core' ? 20 : n.perk ? 14 : 10;
      var fill = owned ? col : '#0e161c', stroke = owned ? '#fff' : aff ? '#5cff7a' : col;
      var shape = n.br.length === 2 ? '<rect x="' + (n.x - r) + '" y="' + (n.y - r) + '" width="' + r * 2 + '" height="' + r * 2 + '" transform="rotate(45 ' + n.x + ' ' + n.y + ')"' : '<circle cx="' + n.x + '" cy="' + n.y + '" r="' + r + '"';
      b += '<g class="node" data-node="' + n.id + '">' + shape + ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (webSel === n.id ? 4 : 2.5) + '" opacity="' + (owned || avail ? 1 : 0.55) + '"/>' +
        (n.perk ? '<text x="' + n.x + '" y="' + (n.y + 4) + '" text-anchor="middle" font-size="12" fill="' + (owned ? '#000' : '#fff') + '">★</text>' : '') + '</g>';
    });
    PG.ATTRS.forEach(function (k) {
      var an = PG.BRANCH[k].a * Math.PI / 180, x = Math.cos(an) * 290, y = Math.sin(an) * 290;
      b += '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" font-family="Press Start 2P" font-size="11" fill="' + PG.BRANCH[k].c + '">' + PG.BRANCH[k].n.toUpperCase() + '</text>';
    });
    b += '<text x="0" y="5" text-anchor="middle" font-size="12" fill="#000">' + PG.overall(a) + '</text>';
    b += '</svg></div><div>';
    b += '<div class="card"><div class="ttl">Attributes</div>' + radar(a) + PG.ATTRS.map(function (k) { return '<div class="kv"><span style="color:' + PG.BRANCH[k].c + '">' + PG.BRANCH[k].n + '</span><b>' + a[k] + '</b></div>'; }).join('') + '</div>';
    b += '<div class="card"><div class="ttl">Skill points</div>' + spPools() + '</div>';
    b += '<div class="card" id="nodeInfo">' + nodeInfo() + '</div>';
    var perks = Object.keys(pk);
    b += '<div class="card"><div class="ttl">Perks</div>' + (perks.length ? perks.map(function (p) { return '<div>★ ' + PG.PERKS[p] + '</div>'; }).join('') : '<div class="dim">Unlock ★ nodes to gain perks.</div>') + '</div>';
    b += '</div></div>';
    $('hubBody').innerHTML = b;
    $('webSvg').querySelectorAll('[data-node]').forEach(function (el) {
      el.onclick = function () { webSel = el.getAttribute('data-node'); tabSkills(); };
    });
    var buy = $('buyNode');
    if (buy) buy.onclick = function () { if (PG.buyNode(C.golfer, webSel)) { save(); hub(); } };
  }
  function nodeInfo() {
    if (!webSel || webSel === 'core') return '<div class="ttl">Node</div><div class="dim">Click a node. Branch nodes boost one attribute; ◆ hybrid nodes boost two and unlock combo perks. Costs come from that branch\'s SP, topped up by Flex SP.</div>';
    var n = PG.NODE[webSel], g = C.golfer, owned = g.nodes.indexOf(n.id) >= 0, avail = PG.nodeAvailable(g, n.id), aff = PG.nodeAffordable(g, n.id);
    var h = '<div class="ttl">' + (n.br.length === 2 ? 'Hybrid · ' + PG.BRANCH[n.br[0]].n + ' / ' + PG.BRANCH[n.br[1]].n : PG.BRANCH[n.br[0]].n + ' tier ' + n.tier) + '</div>';
    h += Object.keys(n.bonus).map(function (k) { return '<div style="color:' + PG.BRANCH[k].c + '">+' + n.bonus[k] + ' ' + PG.BRANCH[k].n + '</div>'; }).join('');
    if (n.perk) h += '<div class="gold">★ ' + PG.PERKS[n.perk] + '</div>';
    h += '<div class="dim">Cost: ' + Object.keys(n.cost).map(function (k) { return n.cost[k] + ' ' + PG.BRANCH[k].n + ' SP'; }).join(' + ') + '</div>';
    if (n.reqOne) h += '<div class="dim">Requires the inner hybrid and tier 4 in either branch.</div>';
    if (owned) h += '<div class="good">Unlocked</div>';
    else h += '<div class="btns"><button class="pri" id="buyNode"' + (avail && aff ? '' : ' disabled') + '>' + (!avail ? 'Locked' : aff ? 'Unlock' : 'Not enough SP') + '</button></div>';
    return h;
  }
  function mix(a, b) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var r = (((x >> 16) + (y >> 16)) / 2) | 0, g = ((((x >> 8) & 255) + ((y >> 8) & 255)) / 2) | 0, bl = (((x & 255) + (y & 255)) / 2) | 0;
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function radar(a) {
    var pts = PG.ATTRS.map(function (k) { var an = PG.BRANCH[k].a * Math.PI / 180, r = a[k] / 100 * 70; return (Math.cos(an) * r).toFixed(1) + ',' + (Math.sin(an) * r).toFixed(1); }).join(' ');
    return '<svg viewBox="-90 -90 180 180" style="width:180px;display:block;margin:0 auto"><polygon points="0,-70 70,0 0,70 -70,0" fill="none" stroke="#2a3a46"/><polygon points="0,-35 35,0 0,35 -35,0" fill="none" stroke="#1d2a33"/><polygon points="' + pts + '" fill="rgba(92,255,122,.25)" stroke="#5cff7a" stroke-width="2"/>' +
      PG.ATTRS.map(function (k) { var an = PG.BRANCH[k].a * Math.PI / 180; return '<text x="' + Math.cos(an) * 80 + '" y="' + (Math.sin(an) * 80 + 4) + '" text-anchor="middle" font-size="11" fill="' + PG.BRANCH[k].c + '">' + PG.BRANCH[k].n.slice(0, 4) + '</text>'; }).join('') + '</svg>';
  }

  // ---------- bag ----------
  var bagSlot = null;
  function tabBag() {
    var b = '<div class="cols"><div><div class="card"><div class="ttl">Your bag (14 clubs)</div>';
    PG.SLOTS.forEach(function (s) {
      var it = PG.findItem(C, C.bag[s]), r = it ? PG.clubRarity(it) : 1, m = it ? PG.clubMods(it) : {};
      var owned = C.inv.filter(function (i) { return i.kind === 'club' && i.slot === s; }).length;
      b += '<div class="bagrow' + (bagSlot === s ? ' sel' : '') + '" data-slot="' + s + '" data-tip="' + PG.esc(Object.keys(m).map(function (k) { return PG.modLabel(k, m[k]); }).join('<br>') || 'No modifiers') + '"><span class="slot" style="color:' + PG.RARITY[r].c + '">' + s + '</span><span>' + (it ? PG.esc(PG.clubName(it)) : '<i class="dim">empty</i>') + '</span><span class="dim">' + owned + ' owned</span></div>';
    });
    b += '</div></div><div>';
    if (bagSlot) {
      b += '<div class="card"><div class="ttl">' + PG.CLUB[bagSlot].name + ' options</div><div class="inv">';
      C.inv.filter(function (i) { return i.kind === 'club' && i.slot === bagSlot; }).forEach(function (it) {
        var eq = C.bag[bagSlot] === it.uid;
        b += U.itemCard(it, { sel: eq, extra: '<div class="btns">' + (eq ? '<span class="good">Equipped</span>' : '<button data-equip="' + it.uid + '">Equip</button>') + '</div>' });
      });
      b += '</div></div>';
    } else b += '<div class="card dim">Select a club slot to swap clubs. Build new clubs in the Workshop or buy them in the Pro Shop.</div>';
    b += '<div class="card"><div class="ttl">Golf balls</div><div class="inv">';
    Object.keys(PG.BALLS).forEach(function (k) {
      var n = k === 'range' ? '∞' : (C.balls[k] || 0);
      if (k !== 'range' && !n) return;
      b += ballCard(k, n, '<div class="btns">' + (C.ballSel === k ? '<span class="good">In play</span>' : '<button data-ball-sel="' + k + '">Use</button>') + '</div>');
    });
    b += '</div><p class="dim">Balls hit into water or out of bounds are lost. When you run out, you\'re back to Range Rocks.</p></div></div></div>';
    $('hubBody').innerHTML = b;
    $('hubBody').querySelectorAll('[data-slot]').forEach(function (el) { el.onclick = function () { bagSlot = el.getAttribute('data-slot'); tabBag(); }; });
    $('hubBody').querySelectorAll('[data-equip]').forEach(function (el) { el.onclick = function () { C.bag[bagSlot] = el.getAttribute('data-equip'); save(); tabBag(); }; });
    $('hubBody').querySelectorAll('[data-ball-sel]').forEach(function (el) { el.onclick = function () { C.ballSel = el.getAttribute('data-ball-sel'); save(); tabBag(); }; });
  }

  // ---------- workshop ----------
  function tabWorkshop() {
    var comps = C.inv.filter(function (i) { return i.kind === 'comp'; });
    var clubs = C.inv.filter(function (i) { return i.kind === 'club' && C.bag[i.slot] !== i.uid; });
    ['head', 'shaft', 'grip'].forEach(function (p) { if (wsSel[p] && !PG.findItem(C, wsSel[p])) wsSel[p] = null; });
    wsSel.fuse = wsSel.fuse.filter(function (u) { return PG.findItem(C, u); });
    var h = wsSel.head && PG.findItem(C, wsSel.head), s = wsSel.shaft && PG.findItem(C, wsSel.shaft), g = wsSel.grip && PG.findItem(C, wsSel.grip);
    var b = '<div class="cols"><div>';
    b += '<div class="card"><div class="ttl">Assemble a club</div><p class="dim">Pick a head (sets the club type), a shaft and a grip from your parts. Putter heads need putter shafts & grips.</p>';
    b += '<div class="kv"><span>Head</span><b>' + (h ? PG.esc(h.name) : '—') + '</b></div><div class="kv"><span>Shaft</span><b>' + (s ? PG.esc(s.name) : '—') + '</b></div><div class="kv"><span>Grip</span><b>' + (g ? PG.esc(g.name) : '—') + '</b></div>';
    var ok = h && s && g && ((h.fit === 'PT') === (s.fit === 'putter')) && ((h.fit === 'PT') === (g.fit === 'putter'));
    var cost = ok ? PG.assembleCost(h, s, g) : 0;
    b += '<div class="btns"><button class="pri" id="wsBuild"' + (ok && C.scrap >= cost ? '' : ' disabled') + '>Assemble' + (ok ? ' (⚙ ' + cost + ')' : '') + '</button><button id="wsClear">Clear</button></div>';
    if (h && s && g && !ok) b += '<p class="bad">Putter heads require putter shafts and grips (and vice versa).</p>';
    b += '</div>';
    b += '<div class="card"><div class="ttl">Fuse parts</div><p class="dim">Select 3 parts of the same rarity → 1 random part of the next rarity.</p><div>' + wsSel.fuse.length + '/3 selected</div>';
    var fr = wsSel.fuse.length ? PG.findItem(C, wsSel.fuse[0]).rarity : 0;
    b += '<div class="btns"><button class="pri" id="wsFuse"' + (wsSel.fuse.length === 3 && fr < 5 && C.scrap >= PG.fuseCost(fr) ? '' : ' disabled') + '>Fuse' + (fr ? ' (⚙ ' + PG.fuseCost(fr) + ')' : '') + '</button></div></div>';
    b += '<div class="card"><div class="ttl">Spare clubs</div><p class="dim">Disassemble to recover parts, or sell.</p><div class="inv">' + (clubs.map(function (it) {
      return U.itemCard(it, { extra: '<div class="btns"><button data-dis="' + it.uid + '">Disassemble</button><button data-sell="' + it.uid + '">Sell ' + PG.money(PG.sellPrice(it)) + '</button></div>' });
    }).join('') || '<div class="dim">None</div>') + '</div></div>';
    b += '</div><div><div class="card"><div class="ttl">Parts (' + comps.length + ')</div><div class="inv">';
    comps.sort(function (a, b2) { return b2.rarity - a.rarity || a.part.localeCompare(b2.part); }).forEach(function (it) {
      var sel = wsSel[it.part] === it.uid, fz = wsSel.fuse.indexOf(it.uid) >= 0;
      b += U.itemCard(it, { sel: sel || fz, extra: '<div class="btns"><button data-use="' + it.uid + '">' + (sel ? 'Selected' : 'Use') + '</button><button data-fuse="' + it.uid + '"' + (fz ? ' class="on"' : '') + '>Fuse</button><button data-salv="' + it.uid + '">Salvage ⚙' + PG.scrapValue(it) + '</button><button data-sell="' + it.uid + '">' + PG.money(PG.sellPrice(it)) + '</button></div>' });
    });
    b += '</div></div></div></div>';
    $('hubBody').innerHTML = b;
    var Q = function (sel, fn) { $('hubBody').querySelectorAll(sel).forEach(function (el) { el.onclick = function (e) { e.stopPropagation(); fn(el); }; }); };
    Q('[data-use]', function (el) { var it = PG.findItem(C, el.getAttribute('data-use')); wsSel[it.part] = wsSel[it.part] === it.uid ? null : it.uid; tabWorkshop(); });
    Q('[data-fuse]', function (el) {
      var u = el.getAttribute('data-fuse'), it = PG.findItem(C, u), i = wsSel.fuse.indexOf(u);
      if (i >= 0) wsSel.fuse.splice(i, 1);
      else {
        if (wsSel.fuse.length && PG.findItem(C, wsSel.fuse[0]).rarity !== it.rarity) wsSel.fuse = [];
        if (wsSel.fuse.length < 3) wsSel.fuse.push(u);
      }
      tabWorkshop();
    });
    Q('[data-salv]', function (el) { var it = PG.findItem(C, el.getAttribute('data-salv')); C.scrap += PG.scrapValue(it); PG.removeItem(C, it.uid); save(); hub(); });
    Q('[data-sell]', function (el) { var it = PG.findItem(C, el.getAttribute('data-sell')); C.cash += PG.sellPrice(it); PG.removeItem(C, it.uid); save(); hub(); });
    Q('[data-dis]', function (el) { var it = PG.findItem(C, el.getAttribute('data-dis')); PG.removeItem(C, it.uid); C.inv.push(it.head, it.shaft, it.grip); save(); tabWorkshop(); });
    if ($('wsClear')) $('wsClear').onclick = function () { wsSel = { head: null, shaft: null, grip: null, fuse: [] }; tabWorkshop(); };
    if ($('wsBuild')) $('wsBuild').onclick = function () {
      var club = PG.assembleClub(h, s, g);
      C.scrap -= cost; [h, s, g].forEach(function (p) { PG.removeItem(C, p.uid); }); C.inv.push(club);
      wsSel = { head: null, shaft: null, grip: null, fuse: [] };
      save(); hub();
      U.modal('<h2>Club assembled</h2><div class="inv">' + U.itemCard(club) + '</div>', [{ t: 'Equip now', cls: 'pri', f: function () { C.bag[club.slot] = club.uid; save(); hub(); } }, { t: 'Keep in locker' }]);
    };
    if ($('wsFuse')) $('wsFuse').onclick = function () {
      var r = PG.findItem(C, wsSel.fuse[0]).rarity;
      C.scrap -= PG.fuseCost(r);
      wsSel.fuse.forEach(function (u) { PG.removeItem(C, u); });
      var it = PG.randomComponent(PG.R, r + 1); C.inv.push(it);
      wsSel.fuse = []; save(); hub();
      U.modal('<h2>Fusion result</h2><div class="inv">' + U.itemCard(it) + '</div>');
    };
  }

  // ---------- shop ----------
  function tabShop() {
    PG.ensureShop(C);
    var b = '<h2>Pro Shop <span class="dim" style="font-size:11px">— restocks weekly</span></h2><div class="inv">';
    C.shop.forEach(function (s, i) {
      if (s.sold) return;
      b += U.itemCard(s.item, { price: s.price, extra: '<div class="btns"><button class="pri" data-buy="' + i + '"' + (C.cash >= s.price ? '' : ' disabled') + '>Buy</button></div>' });
    });
    b += '</div><h3>Golf balls (dozen)</h3><div class="inv">';
    PG.ballsForSale(C.tier).forEach(function (k) {
      var p = PG.BALLS[k].price * 12;
      b += ballCard(k, C.balls[k] || 0, '<div class="btns"><button class="pri" data-bball="' + k + '"' + (C.cash >= p ? '' : ' disabled') + '>Buy 12 — ' + PG.money(p) + '</button></div>');
    });
    b += '</div>';
    $('hubBody').innerHTML = b;
    $('hubBody').querySelectorAll('[data-buy]').forEach(function (el) {
      el.onclick = function () {
        var s = C.shop[+el.getAttribute('data-buy')]; if (C.cash < s.price) return;
        C.cash -= s.price; s.sold = true; C.inv.push(s.item); save(); hub();
        U.modal('<h2>Purchased</h2><div class="inv">' + U.itemCard(s.item) + '</div>' + (s.item.kind === 'club' ? '' : '<p class="dim">Parts go to your Workshop.</p>'),
          s.item.kind === 'club' ? [{ t: 'Equip now', cls: 'pri', f: function () { C.bag[s.item.slot] = s.item.uid; save(); hub(); } }, { t: 'Later' }] : null);
      };
    });
    $('hubBody').querySelectorAll('[data-bball]').forEach(function (el) {
      el.onclick = function () { var k = el.getAttribute('data-bball'), p = PG.BALLS[k].price * 12; if (C.cash < p) return; C.cash -= p; C.balls[k] = (C.balls[k] || 0) + 12; save(); hub(); };
    });
  }

  // ---------- standings / career ----------
  function tabStandings() {
    var st = PG.seasonStandings(C);
    $('hubBody').innerHTML = '<h2>' + PG.TOURS[C.tier].n + ' — Season ' + C.season + ' points</h2><table class="t"><tr><th>#</th><th>Player</th><th>Points</th><th>Wins</th></tr>' +
      st.map(function (r) { return '<tr class="' + (r.isP ? 'me' : '') + '"><td>' + r.pos + (r.pos <= PG.PROMOTE_TOP && C.tier < 3 ? ' ▲' : '') + '</td><td>' + PG.esc(r.name) + '</td><td>' + r.pts + '</td><td>' + r.wins + '</td></tr>'; }).join('') + '</table>';
  }
  function tabCareer() {
    var s = C.stats;
    var b = '<div class="cols"><div><div class="card"><div class="ttl">Career</div>' +
      [['Events', s.events], ['Wins', s.wins], ['Top 10s', s.top10], ['Cuts made', s.cuts], ['Earnings', PG.money(s.earnings)], ['Best round', s.bestRound || '—']].map(function (kv) { return '<div class="kv"><span>' + kv[0] + '</span><b>' + kv[1] + '</b></div>'; }).join('') + '</div>';
    b += '<div class="card"><div class="ttl">Seasons</div>' + (s.seasons.length ? '<table class="t"><tr><th>Season</th><th>Tour</th><th>Rank</th><th>Wins</th><th></th></tr>' + s.seasons.map(function (r) { return '<tr><td>' + r.season + '</td><td>' + r.tour + '</td><td>' + r.pos + '</td><td>' + r.wins + '</td><td>' + (r.promoted ? '<span class="good">▲ promoted</span>' : '') + '</td></tr>'; }).join('') + '</table>' : '<div class="dim">First season in progress.</div>') + '</div></div>';
    b += '<div><div class="card"><div class="ttl">Recent results</div>' + (C.log.slice(0, 20).map(function (l) { return '<div>' + PG.esc(l) + '</div>'; }).join('') || '<div class="dim">No events yet.</div>') + '</div>';
    b += '<div class="card"><div class="ttl">Danger zone</div><div class="btns"><button class="danger" id="delSave">Delete career</button></div></div></div></div>';
    $('hubBody').innerHTML = b;
    $('delSave').onclick = function () { U.modal('<h2>Delete career?</h2><p>This cannot be undone.</p>', [{ t: 'Cancel' }, { t: 'Delete', cls: 'danger', f: function () { PG.deleteSave(); C = null; U.title(); } }]); };
  }

  // ---------- tournament flow ----------
  function launchTournament(t) {
    if (t.mode === 'sim') { simScreen(t); return; }
    U.show('play');
    PG.Play.begin(C, t);
  }
  U.confirmQuitPlay = function () {
    U.modal('<h2>Leave the course?</h2><p>Progress is saved after each completed hole. You can resume from the hub.</p>', [{ t: 'Keep playing' }, { t: 'Back to hub', f: function () { save(); PG.Play.stop(); hub(); } }]);
  };
  U.roundComplete = function (t) {
    var course = PG.tCourse(C, t), me = t.field[0], r = t.round;
    PG.endRound(C, t);
    save();
    var lb = PG.leaderboard(C, t, Math.min(r, t.rounds - 1), 18);
    var meRow = lb.filter(function (e) { return e.p.isP; })[0];
    var rs = me.sc[r].reduce(function (a, b) { return a + b; }, 0);
    var html = '<h2>Round ' + (r + 1) + ' complete</h2><p>You shot <b>' + rs + '</b> (' + PG.toPar(rs - course.par()) + ') — ' + (meRow.p.cut ? '<b class="bad">missed the cut</b>' : (meRow.tie ? 'T' : '') + PG.ordinal(meRow.pos) + ' at ' + PG.toPar(meRow.toPar)) + '</p>';
    if (t.cutLine !== undefined && r === 1) html += '<p class="dim">Cut line: ' + PG.toPar(t.cutLine) + '</p>';
    html += scorecardHTML(course, me.sc.filter(function (x) { return x && x.length; }));
    html += lbTable(lb, 10);
    if (t.finds.length) html += '<p class="gold">Found while searching the rough: ' + t.finds.map(function (f) { return f.ball ? f.count + '× ' + PG.BALLS[f.ball].n : PG.esc(f.name); }).join(', ') + '</p>';
    t.finds = [];
    var btn = t.done ? 'See results' : (t.round >= t.rounds ? 'To the playoff!' : 'Next round');
    U.modal(html, [{ t: btn, cls: 'pri', f: function () { PG.Play.advance(); } }]);
  };
  function lbTable(lb, n) {
    var rows = lb.slice(0, n), me = lb.filter(function (e) { return e.p.isP; })[0];
    if (rows.indexOf(me) < 0) rows.push(me);
    return '<table class="t"><tr><th>Pos</th><th>Player</th><th>To par</th><th>Today</th></tr>' + rows.map(function (e) {
      return '<tr class="' + (e.p.isP ? 'me' : '') + '"><td>' + (e.p.cut ? 'MC' : (e.tie ? 'T' : '') + e.pos) + '</td><td>' + PG.esc(e.p.name) + '</td><td>' + PG.toPar(e.toPar) + '</td><td class="dim">' + PG.toPar(e.today) + '</td></tr>';
    }).join('') + '</table>';
  }
  U.tournamentDone = function (t) {
    PG.Play.stop();
    var res = PG.finishTournament(C, t);
    var rec = PG.advanceWeek(C);
    save();
    resultsScreen(res, rec);
  };

  function simScreen(t) {
    U.show('sim');
    var ev = C.schedule[t.ev];
    var body = $('simBody');
    body.innerHTML = '<h2>' + PG.esc(ev.name) + ' — simulating</h2><div id="simProg" class="dim">Teeing off…</div><div id="simLB"></div>';
    var course = PG.tCourse(C, t);
    function step() {
      if (t.done) { U.tournamentDone(t); return; }
      if (t.round >= t.rounds) { PG.Play.simPlayoff(C, t); if (!t.done) PG.checkPlayoff(C, t); U.tournamentDone(t); return; }
      if (!t.roundStarted) PG.startRound(C, t);
      var h = t.hole;
      var r = PG.autoHole(C, t, h, false);
      PG.recordHole(C, t, h, r.strokes, r);
      $('simProg').innerHTML = 'Round ' + (t.round + 1) + ' · thru ' + t.hole + ' — ' + scorecardHTML(course, t.field[0].sc.filter(function (x) { return x && x.length; }));
      $('simLB').innerHTML = lbTable(PG.leaderboard(C, t, t.round, t.hole), 10);
      if (t.hole >= 18) { PG.endRound(C, t); save(); }
      setTimeout(step, 16);
    }
    step();
  }

  function resultsScreen(r, rec) {
    U.show('results');
    var head = r.cut ? '<span class="bad">Missed cut</span>' : r.pos === 1 ? '<span class="gold">🏆 CHAMPION!</span>' : (r.tie ? 'T' : '') + PG.ordinal(r.pos) + ' of ' + r.field;
    var b = '<h2>' + PG.esc(r.event) + ' — Final</h2><div class="cols"><div>';
    b += '<div class="card"><div class="ttl" style="font-size:16px">' + head + '</div>' +
      '<div class="kv"><span>Your score</span><b>' + PG.toPar(r.toPar) + '</b></div>' +
      '<div class="kv"><span>Winner</span><b>' + PG.esc(r.winner) + ' (' + PG.toPar(r.winnerToPar) + ')' + (r.playoff ? ' — playoff' : '') + '</b></div>' +
      '<div class="kv"><span>Prize money</span><b class="gold">' + PG.money(r.money) + '</b></div>' +
      '<div class="kv"><span>Season points</span><b>+' + r.pts + '</b></div>' +
      '<div class="kv"><span>Flex skill points</span><b>+' + r.flex + '</b></div>' +
      '<div class="kv"><span>Scrap</span><b>+' + r.scrap + '</b></div></div>';
    b += '<div class="card"><div class="ttl">Top 10</div><table class="t">' + r.top.map(function (e) { return '<tr class="' + (e.isP ? 'me' : '') + '"><td>' + (e.tie ? 'T' : '') + e.pos + '</td><td>' + PG.esc(e.name) + '</td><td>' + PG.toPar(e.toPar) + '</td></tr>'; }).join('') + '</table></div></div><div>';
    var all = r.loot.concat(r.finds);
    b += '<div class="card"><div class="ttl">Loot</div>' + (all.length ? '<div class="inv">' + all.map(function (it) { return it.ball ? ballCard(it.ball, it.count) : U.itemCard(it); }).join('') + '</div>' : '<div class="dim">No drops this week. Finish higher for better loot.</div>') + '</div>';
    b += '</div></div><div class="btns"><button class="pri" id="resNext">Continue</button></div>';
    $('resBody').innerHTML = b;
    $('resNext').onclick = function () { tab = 'overview'; hub(); if (rec) seasonEndModal(rec); };
  }

  // ---------- boot ----------
  window.addEventListener('load', function () {
    PG.Play.init();
    U.title();
  });
})();
