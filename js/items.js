// Equipment: components (head/shaft/grip), clubs, balls, shop, crafting
(function () {
  'use strict';
  var BRANDS = ['Kestrel', 'Ironwood', 'Bramble', 'Northwind', 'Copperline', 'Halcyon', 'Mako', 'Thistle', 'Vantage', 'Orion', 'Pinecrest', 'Larkspur'];
  var HEAD_MODEL = [null, ['Classic', 'Basic', 'Club', 'Starter'], ['Pro', 'Plus', 'Sport', 'Select'], ['Tour', 'Forged', 'Elite', 'Precision'], ['Apex', 'Phantom', 'Masterline', 'Obsidian'], ['Starfall', 'Thunderclap', 'Zenith', 'Wyvern', 'Northern Crown', 'Eclipse']];
  var SHAFT_MAT = [null, ['Steel', 'Graphite'], ['Steel Lite', 'Graphite'], ['Tour Steel', 'Carbon'], ['Nano Carbon', 'Titanium-Core'], ['Dragonspine', 'Comettail', 'Aurora Weave']];
  var GRIP_T = [null, ['Rubber', 'Basic Wrap'], ['Cord', 'Tacky Wrap'], ['Velvet Cord', 'Pro Wrap'], ['Hybrid Silk', 'Tour Cord'], ['Phoenix Leather', 'Moonthread']];
  var FLEX = ['R', 'S', 'X'];

  function modEligible(id, def, part, isPutter, tier) {
    if (def.parts.split(' ').indexOf(part) < 0) return false;
    if (def.club === 'full' && isPutter) return false;
    if (def.club === 'putter' && !isPutter) return false;
    return !def.t || !!def.t[tier - 1];
  }
  function rollMods(R, part, rarity, isPutter) {
    var count = rarity === 1 ? (R.chance(0.6) ? 1 : 0) : rarity === 2 ? 1 : rarity === 3 ? (R.chance(0.5) ? 2 : 1) : 2;
    var mods = {}, keys = Object.keys(PG.MODS), guard = 0;
    while (Object.keys(mods).length < count && guard++ < 60) {
      var id = R.pick(keys), def = PG.MODS[id];
      if (mods[id] !== undefined) continue;
      var tier = Math.max(1, rarity - (R.chance(0.35) ? 1 : 0));
      if (!modEligible(id, def, part, isPutter, tier)) { tier = rarity; if (!modEligible(id, def, part, isPutter, tier)) continue; }
      var rg = def.t[tier - 1], v = R.range(rg[0], rg[1]);
      mods[id] = def.dec ? Math.round(v * 10) / 10 : Math.round(v);
    }
    if (rarity === 5) {
      var u = Object.keys(PG.UNIQUES).filter(function (k) {
        var d = PG.UNIQUES[k]; return d.parts === part && (d.club === 'any' || (d.club === 'putter') === isPutter);
      });
      if (u.length) mods[R.pick(u)] = 1;
    }
    return mods;
  }

  PG.genComponent = function (R, part, rarity, fit) {
    var isPutter = part === 'head' ? fit === 'PT' : fit === 'putter';
    var brand = R.pick(BRANDS), name;
    if (part === 'head') {
      var model = R.pick(HEAD_MODEL[rarity]);
      name = (rarity === 5 ? model : brand + ' ' + model) + ' ' + PG.CLUB[fit].name + ' Head';
    } else if (part === 'shaft') {
      var mat = R.pick(SHAFT_MAT[rarity]);
      name = (rarity === 5 ? mat : brand + ' ' + mat) + (isPutter ? ' Putter Shaft' : ' ' + (50 + R.int(0, 7) * 10) + FLEX[R.int(0, 2)] + ' Shaft');
    } else {
      name = (rarity === 5 ? '' : brand + ' ') + R.pick(GRIP_T[rarity]) + (isPutter ? ' Putter Grip' : ' Grip');
    }
    return { uid: PG.uid(), kind: 'comp', part: part, fit: fit, rarity: rarity, name: name, mods: rollMods(R, part, rarity, isPutter) };
  };
  PG.randomComponent = function (R, rarity, slot) {
    var part = R.pick(['head', 'head', 'shaft', 'grip']);
    slot = slot || R.pick(PG.SLOTS);
    var fit = part === 'head' ? slot : (slot === 'PT' ? 'putter' : 'full');
    return PG.genComponent(R, part, rarity, fit);
  };
  PG.assembleClub = function (head, shaft, grip) {
    return { uid: PG.uid(), kind: 'club', slot: head.fit, head: head, shaft: shaft, grip: grip };
  };
  PG.genClub = function (R, slot, rarity, spread) {
    var fit = slot === 'PT' ? 'putter' : 'full';
    function r() { return PG.clamp(rarity - (spread && R.chance(0.4) ? 1 : 0), 1, 5); }
    return PG.assembleClub(PG.genComponent(R, 'head', rarity, slot), PG.genComponent(R, 'shaft', r(), fit), PG.genComponent(R, 'grip', r(), fit));
  };
  PG.clubRarity = function (c) { return Math.max(c.head.rarity, c.shaft.rarity, c.grip.rarity); };
  PG.clubName = function (c) {
    var h = c.head.name.replace(/ Head$/, '');
    return h;
  };
  PG.clubMods = function (c) {
    var m = {};
    if (!c) return m;
    [c.head, c.shaft, c.grip].forEach(function (p) { for (var k in p.mods) m[k] = (m[k] || 0) + p.mods[k]; });
    return m;
  };
  PG.modLabel = function (id, v) {
    var d = PG.MODS[id] || PG.UNIQUES[id];
    if (!d) return id;
    return d.l.replace('{v}', v);
  };
  PG.modTierOf = function (id, v) {
    var d = PG.MODS[id]; if (!d) return 5;
    for (var t = 5; t >= 1; t--) { var rg = d.t[t - 1]; if (rg && v >= rg[0] - 1e-6) return t; }
    return 1;
  };
  PG.itemPrice = function (it) {
    if (it.kind === 'club') return Math.round((PG.itemPrice(it.head) + PG.itemPrice(it.shaft) + PG.itemPrice(it.grip)) * 1.1);
    var n = 0; for (var k in it.mods) n++;
    return Math.round(PG.RARITY[it.rarity].price * (0.8 + n * 0.12) * (it.part === 'head' ? 1.2 : 0.9));
  };
  PG.sellPrice = function (it) { return Math.round(PG.itemPrice(it) * 0.3); };
  PG.scrapValue = function (it) {
    if (it.kind === 'club') return PG.scrapValue(it.head) + PG.scrapValue(it.shaft) + PG.scrapValue(it.grip);
    return PG.RARITY[it.rarity].scrap;
  };
  PG.assembleCost = function (h, s, g) { return (h.rarity + s.rarity + g.rarity) * 4; };
  PG.fuseCost = function (r) { return PG.RARITY[Math.min(5, r + 1)].scrap; };

  PG.starterBag = function (R) {
    var inv = [], bag = {};
    PG.SLOTS.forEach(function (s) {
      var c = PG.genClub(R, s, 1, false);
      inv.push(c); bag[s] = c.uid;
    });
    return { inv: inv, bag: bag };
  };

  PG.rollRarity = function (R, weights, boost) {
    var w = weights.slice();
    if (boost) for (var i = 0; i < boost; i++) { w = [w[0] * 0.55, w[1] * 0.9 + w[0] * 0.25, w[2] * 1.15 + w[1] * 0.1, w[3] * 1.35 + 0.5, w[4] * 1.5 + 0.12]; }
    return R.weighted(w) + 1;
  };

  PG.genShop = function (R, tier) {
    var tour = PG.TOURS[tier], stock = [];
    for (var i = 0; i < 7; i++) {
      var r = PG.rollRarity(R, tour.rarity, 0), it;
      if (i < 2) it = PG.genClub(R, R.pick(PG.SLOTS), r, true);
      else it = PG.randomComponent(R, r);
      stock.push({ item: it, price: PG.itemPrice(it), sold: false });
    }
    return stock;
  };
  PG.ballsForSale = function (tier) {
    return Object.keys(PG.BALLS).filter(function (k) { var b = PG.BALLS[k]; return b.price > 0 && b.r <= tier + 2 && b.r < 5; });
  };

  // Loot after tournament (position 1-based, field size)
  PG.genLoot = function (R, tier, pos, n) {
    var loot = [], pct = pos / n;
    var drops = pos === 1 ? 3 : pct <= 0.1 ? 2 : pct <= 0.3 ? 1 : (R.chance(0.35) ? 1 : 0);
    var boost = pos === 1 ? 2 : pct <= 0.1 ? 1 : 0;
    for (var i = 0; i < drops; i++) {
      var r = PG.rollRarity(R, PG.TOURS[tier].rarity, boost);
      if (R.chance(0.2)) loot.push({ ball: R.pick(Object.keys(PG.BALLS).filter(function (k) { return PG.BALLS[k].r <= Math.min(5, r + 1) && k !== 'range'; })), count: R.int(3, 12) });
      else if (R.chance(0.25)) loot.push(PG.genClub(R, R.pick(PG.SLOTS), r, true));
      else loot.push(PG.randomComponent(R, r));
    }
    return loot;
  };
})();
