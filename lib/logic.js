/* menucraft-ai core logic — shared between Node (tests) and browser.
   No dependencies. All AI copy is local template-based; works fully offline. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MenuCraft = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Sensory word bank ----------
  var SENSORY = {
    taste: ['buttery', 'smoky', 'tangy', 'savory', 'sweet', 'zesty', 'rich', 'peppery', 'caramelized', 'bright'],
    texture: ['crispy', 'tender', 'silky', 'flaky', 'juicy', 'velvety', 'golden', 'charred', 'melt-in-your-mouth', 'crunchy'],
    aroma: ['fragrant', 'aromatic', 'wood-fired', 'freshly-baked', 'herb-kissed', 'citrus-kissed']
  };

  function pick(arr, seed) {
    return arr[Math.abs(seed) % arr.length];
  }

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return h;
  }

  function mainIngredients(dish) {
    return (dish.ingredients || []).slice(0, 3).map(function (i) { return i.name; });
  }

  // ---------- Allergens ----------
  // The 9 major US allergens (FDA FALCPA + sesame). Stored on dish.allergens as id strings.
  var MAJOR_ALLERGENS = [
    { id: 'milk', name: 'Milk / dairy' },
    { id: 'egg', name: 'Eggs' },
    { id: 'fish', name: 'Fish' },
    { id: 'shellfish', name: 'Shellfish' },
    { id: 'tree-nut', name: 'Tree nuts' },
    { id: 'peanut', name: 'Peanuts' },
    { id: 'wheat', name: 'Wheat / gluten' },
    { id: 'soy', name: 'Soy' },
    { id: 'sesame', name: 'Sesame' }
  ];
  function allergenIds() { return MAJOR_ALLERGENS.map(function (a) { return a.id; }); }
  // Return only valid, de-duplicated allergen ids from whatever is stored on the dish.
  function dishAllergens(dish) {
    var valid = {};
    allergenIds().forEach(function (id) { valid[id] = true; });
    var out = [];
    ((dish && dish.allergens) || []).forEach(function (a) {
      if (valid[a] && out.indexOf(a) < 0) out.push(a);
    });
    return out;
  }
  function setDishAllergens(dish, ids) {
    var valid = {};
    allergenIds().forEach(function (id) { valid[id] = true; });
    var out = [];
    (ids || []).forEach(function (id) { if (valid[id] && out.indexOf(id) < 0) out.push(id); });
    dish.allergens = out;
    return dish;
  }
  function allergenLabel(id) {
    var hit = MAJOR_ALLERGENS.filter(function (a) { return a.id === id; })[0];
    return hit ? hit.name : id;
  }

  // ---------- Dish math ----------
  function computePlateCost(dish) {
    var total = 0;
    (dish.ingredients || []).forEach(function (ing) {
      var c = parseFloat(ing.cost);
      if (!isNaN(c) && c >= 0) total += c;
    });
    return Math.round(total * 100) / 100;
  }

  // targetMarginPct like 70 => price = cost / (1 - 0.70)
  function suggestPrice(plateCost, targetMarginPct) {
    var m = Math.max(0, Math.min(95, parseFloat(targetMarginPct) || 70)) / 100;
    if (plateCost <= 0) return 0;
    var p = plateCost / (1 - m);
    return Math.round(p * 100) / 100;
  }

  function actualMarginPct(plateCost, price) {
    if (!price || price <= 0) return 0;
    return Math.round(((price - plateCost) / price) * 1000) / 10;
  }

  // Health vs the target margin: green (>= target), yellow (within 7 pts below), red (worse)
  function marginHealth(dish, price, targetMarginPct) {
    var cost = computePlateCost(dish);
    var target = parseFloat(targetMarginPct) || 70;
    var margin = actualMarginPct(cost, price);
    var diff = margin - target;
    var status, message;
    if (diff >= 0) {
      status = 'green';
      message = 'Healthy margin — at ' + margin + '% you are beating your ' + target + '% target. This dish earns its place.';
    } else if (diff >= -7) {
      status = 'yellow';
      message = 'Close but under target — ' + margin + '% vs your ' + target + '% goal. Consider raising the price by a dollar or trimming a costly ingredient.';
    } else {
      status = 'red';
      message = 'Losing money on every plate — only ' + margin + '% margin vs your ' + target + '% target. Raise the price or rework the recipe before it goes on the menu.';
    }
    return { cost: cost, margin: margin, target: target, status: status, message: message };
  }

  // ---------- AI descriptions (local template bank) ----------
  var TEMPLATES = {
    upscale: [
      'A study in {tex1}: {ing1} {prep}, finished with {ing2} and a whisper of {ing3}. {taste1} and unapologetically {taste2}.',
      '{ing1}, {tex1} and {tex2}, composed with {ing2} and {ing3} in a {taste1} harmony.',
      'Our chef\'s {taste1} ode to {ing1} — {tex1}, {aroma1}, and layered with {ing2} and {ing3}.'
    ],
    casual: [
      'You know what hits the spot? {tex1} {ing1} loaded up with {ing2} and {ing3}. {taste1}, {taste2}, gone in minutes.',
      'The {ing1} you\'ll crave all week — {tex1}, {tex2}, stacked with {ing2} and finished with {ing3}.',
      'No fuss, all flavor: {ing1} with {ing2} and {ing3}, {taste1} and {tex1} in every bite.'
    ],
    fun: [
      'Warning: our {ing1} may cause happy dances. {tex1}, {taste1}, with {ing2} and {ing3} crashing the party.',
      'The {ing1} that broke our regulars\' group chat — {tex2}, {taste2}, {ing2} and {ing3} doing the most.',
      'Plot twist: {ing1} but make it legendary. {tex1} meets {taste1}, plus {ing2} and {ing3} for the win.'
    ]
  };

  function fillTemplate(tpl, dish, seed) {
    var ings = mainIngredients(dish);
    while (ings.length < 3) ings.push('seasonal garnish');
    var h = hashStr(dish.name + seed);
    var words = {
      ing1: ings[0], ing2: ings[1], ing3: ings[2],
      tex1: pick(SENSORY.texture, h + 1),
      tex2: pick(SENSORY.texture, h + 7),
      taste1: pick(SENSORY.taste, h + 3),
      taste2: pick(SENSORY.taste, h + 11),
      aroma1: pick(SENSORY.aroma, h + 5),
      prep: pick(['slow-roasted', 'pan-seared', 'fire-grilled', 'hand-crafted', 'house-made'], h + 9)
    };
    return tpl.replace(/\{(\w+)\}/g, function (_, k) { return words[k] || k; });
  }

  function generateDescriptions(dish, style) {
    var name = (dish && dish.name || 'Untitled dish').trim() || 'Untitled dish';
    var styles = style ? [style] : ['upscale', 'casual', 'fun'];
    var out = {};
    styles.forEach(function (s) {
      var bank = TEMPLATES[s] || TEMPLATES.casual;
      var h = Math.abs(hashStr(name + s));
      out[s] = fillTemplate(bank[h % bank.length], dish, h);
    });
    return out;
  }

  // Duplicate a dish: fresh id, " (copy)" name, same recipe + pricing.
  function duplicateDish(dish, newId) {
    if (!dish || typeof dish !== 'object') throw new Error('duplicateDish: dish is required');
    var copy = JSON.parse(JSON.stringify(dish));
    copy.id = newId || ('d' + Date.now().toString(36));
    copy.name = (dish.name || 'Untitled dish') + ' (copy)';
    return copy;
  }

  // Case-insensitive search over dish name + ingredient names.
  function searchDishes(dishes, q) {
    var query = String(q == null ? '' : q).trim().toLowerCase();
    if (!query) return (dishes || []).slice();
    return (dishes || []).filter(function (d) {
      var blob = [d.name].concat((d.ingredients || []).map(function (i) { return i.name; }))
        .join(' ').toLowerCase();
      return blob.indexOf(query) !== -1;
    });
  }

  function marginOf(d) {
    return actualMarginPct(computePlateCost(d), d.price);
  }

  // Sort dishes without mutating: 'margin' (worst margin first — find the
  // losers), 'name' (A–Z), anything else = newest first (dishes are pushed in order).
  function sortDishes(dishes, key) {
    var arr = (dishes || []).slice();
    if (key === 'name') {
      arr.sort(function (a, b) {
        return String(a.name || '').toLowerCase().localeCompare(String(b.name || '').toLowerCase());
      });
    } else if (key === 'margin') {
      arr.sort(function (a, b) { return marginOf(a) - marginOf(b); });
    } else {
      arr.reverse();
    }
    return arr;
  }

  // ---------- Menu engineering matrix ----------
  // Weekly sales per dish; missing/invalid values count as 0.
  function salesOf(d) {
    var v = d && d.salesPerWeek;
    var n = typeof v === 'string' ? parseFloat(v) : v;
    return (typeof n === 'number' && isFinite(n) && n > 0) ? Math.round(n) : 0;
  }

  // The trade-standard 2x2: margin (vs target) x popularity (vs median sales).
  // Stars: high margin + popular — feature them. Plowhorses: low margin +
  // popular — reprice or trim cost. Puzzles: high margin + slow — promote.
  // Dogs: low margin + slow — consider dropping. Dishes with no price or no
  // cost can't be judged; when nobody has sales data the matrix stays empty.
  function menuEngineering(dishes) {
    var priced = (dishes || []).filter(function (d) {
      return d && Number(d.price) > 0 && computePlateCost(d) > 0;
    });
    var rows = priced.map(function (d) {
      var tm = d.targetMargin || 70;
      var h = marginHealth(d, d.price, tm);
      return { dish: d, sales: salesOf(d), margin: h.margin, target: h.target,
               cost: h.cost, status: h.status };
    });
    var totalSales = rows.reduce(function (s, r) { return s + r.sales; }, 0);
    var out = { empty: true, stars: [], plowhorses: [], puzzles: [], dogs: [],
                unjudged: (dishes || []).length - priced.length,
                medianSales: 0, totalSales: totalSales, dishCount: priced.length };
    if (!rows.length || totalSales <= 0) return out;
    var sales = rows.map(function (r) { return r.sales; }).sort(function (a, b) { return a - b; });
    var mid = Math.floor(sales.length / 2);
    var median = sales.length % 2 ? sales[mid] : (sales[mid - 1] + sales[mid]) / 2;
    out.medianSales = median;
    out.empty = false;
    rows.forEach(function (r) {
      var highMargin = r.margin >= r.target;
      var popular = r.sales >= median;
      if (highMargin && popular) out.stars.push(r);
      else if (!highMargin && popular) out.plowhorses.push(r);
      else if (highMargin && !popular) out.puzzles.push(r);
      else out.dogs.push(r);
    });
    var bySales = function (a, b) { return b.sales - a.sales; };
    out.stars.sort(bySales); out.plowhorses.sort(bySales);
    out.puzzles.sort(bySales); out.dogs.sort(bySales);
    return out;
  }

  var ENG_PLAYBOOKS = {
    stars: { title: 'Stars', advice: 'Your winners — high margin and selling well. Feature them on the menu, photograph them, never discount them.' },
    plowhorses: { title: 'Plowhorses', advice: 'Guests love them but margins are thin. Nudge the price up a dollar or trim the costliest ingredient.' },
    puzzles: { title: 'Puzzles', advice: 'Great margins, slow sales. Give them a crave-worthy description and move them to the menu\u2019s sweet spot.' },
    dogs: { title: 'Dogs', advice: 'Low margin and slow. Consider dropping them — every dog you cut simplifies the kitchen.' }
  };

  // CSV of the menu with cost/margin/allergen columns (for the accountant).
  function menuToCSV(dishes) {
    function cell(v) {
      var s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    var rows = [['name', 'category', 'cost', 'price', 'margin_pct', 'target_margin_pct', 'status', 'allergens', 'sales_per_week']];
    (dishes || []).forEach(function (d) {
      var h = marginHealth(d, d.price, d.targetMargin || 70);
      rows.push([
        d.name, d.category, h.cost.toFixed(2), Number(d.price || 0).toFixed(2),
        h.margin, h.target, h.status, dishAllergens(d).map(allergenLabel).join('; '),
        salesOf(d)
      ]);
    });
    return rows.map(function (r) { return r.map(cell).join(','); }).join('\n');
  }

  // ---------- Ingredient pantry ----------
  // Learn ingredient -> last-used cost from existing dishes so the composer can
  // autocomplete costs. Keyed by lowercase name; last occurrence wins.
  function ingredientLibrary(dishes) {
    var lib = {};
    (dishes || []).forEach(function (d) {
      (d.ingredients || []).forEach(function (ing) {
        var name = String(ing.name || '').trim();
        if (!name) return;
        var cost = parseFloat(ing.cost);
        lib[name.toLowerCase()] = { name: name, cost: isNaN(cost) ? 0 : cost };
      });
    });
    return lib;
  }

  // ---------- Menu model ----------
  // Build a render-ready menu model honoring display options:
  //   voice: 'upscale'|'casual'|'fun'|'none' (description voice; 'none' = no descriptions)
  //   showPrices: bool — when false, prices are omitted (e.g. "market price" menus)
  //   showAllergens: bool — include allergen badges
  var CAT_LABELS = { starter: 'Starters', main: 'Mains', side: 'Sides', dessert: 'Desserts', drink: 'Drinks' };
  function buildMenuModel(dishes, opts) {
    opts = opts || {};
    var voice = opts.voice || 'upscale';
    var showPrices = opts.showPrices !== false;
    var showAllergens = opts.showAllergens !== false;
    var cats = ['starter', 'main', 'side', 'dessert', 'drink'];
    var model = [];
    cats.forEach(function (cat) {
      var items = (dishes || []).filter(function (d) { return d.category === cat; });
      if (!items.length) return;
      model.push({
        cat: cat,
        label: CAT_LABELS[cat],
        items: items.map(function (d) {
          var desc = null;
          if (voice !== 'none') {
            try { desc = generateDescriptions(d, voice)[voice]; }
            catch (e) { desc = null; }
          }
          return {
            id: d.id, name: d.name,
            description: desc,
            price: showPrices ? d.price : null,
            allergens: showAllergens ? dishAllergens(d).map(allergenLabel) : []
          };
        })
      });
    });
    return model;
  }

  // ---------- Menu health report ----------
  // One-glance P&L for the whole menu: average margin, margin-mix counts,
  // and the best / worst dishes by margin. Dishes with no price are skipped
  // from margin stats (they can't be judged) but counted separately.
  function menuReport(dishes) {
    var priced = [], unpriced = 0;
    (dishes || []).forEach(function (d) {
      if (d.price && d.price > 0) priced.push(d);
      else unpriced++;
    });
    var mix = { green: 0, yellow: 0, red: 0 };
    var sum = 0;
    var ranked = priced.map(function (d) {
      var h = marginHealth(d, d.price, d.targetMargin || 70);
      mix[h.status]++;
      sum += h.margin;
      return { id: d.id, name: d.name, category: d.category, cost: h.cost,
               price: Number(d.price), margin: h.margin, status: h.status,
               target: h.target };
    });
    ranked.sort(function (a, b) { return b.margin - a.margin; });
    return {
      dishes: (dishes || []).length,
      priced: priced.length,
      unpriced: unpriced,
      avgMargin: priced.length ? Math.round((sum / priced.length) * 10) / 10 : null,
      mix: mix,
      best: ranked.slice(0, 3),
      worst: ranked.slice(-3).reverse(),
      belowTarget: ranked.filter(function (r) { return r.status === 'red'; })
    };
  }

  // ---------- Reprice to target margin ----------
  // Set one dish's price to the suggested price for its target margin.
  // Returns the new price (0 when the dish has no food cost).
  function repriceToTarget(dish) {
    if (!dish || typeof dish !== 'object') throw new Error('repriceToTarget: dish is required');
    var cost = computePlateCost(dish);
    var target = parseFloat(dish.targetMargin) || 70;
    var price = suggestPrice(cost, target);
    dish.price = price;
    return price;
  }

  // Reprice every dish currently below its target margin. Returns
  // { updated: n, dishes } — mutates the dish objects in place.
  function repriceMenu(dishes) {
    var updated = 0;
    (dishes || []).forEach(function (d) {
      var h = marginHealth(d, d.price, d.targetMargin || 70);
      if (h.status !== 'green' && h.cost > 0) {
        repriceToTarget(d);
        updated++;
      }
    });
    return { updated: updated, dishes: dishes };
  }

  // ---------- CSV dish import ----------
  // Header: name,category,price,target_margin,ingredients,allergens
  // ingredients: "flour:0.80;tomato:1.20" pairs; allergens: "milk;egg" ids.
  // Returns { dishes, skipped } — dishes have fresh ids.
  function splitCsvRow(line) {
    var cells = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return cells.map(function (c) { return c.trim(); });
  }

  var VALID_CATS = { starter: 1, main: 1, side: 1, dessert: 1, drink: 1 };

  function dishesFromCSV(text) {
    var lines = String(text == null ? '' : text).replace(/^\uFEFF/, '').split(/\r?\n/);
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    var dishes = [], skipped = 0;
    if (!lines.length) return { dishes: dishes, skipped: skipped };
    var header = splitCsvRow(lines[0]).map(function (c) { return c.toLowerCase(); });
    var hasHeader = header[0] === 'name';
    var idx = function (name) { return header.indexOf(name); };
    var start = hasHeader ? 1 : 0;
    var col = hasHeader ? idx : function () { return -1; };
    for (var i = start; i < lines.length; i++) {
      if (!lines[i].trim()) { skipped++; continue; }
      var cells = splitCsvRow(lines[i]);
      var name = hasHeader ? (cells[col('name')] || '') : (cells[0] || '');
      if (!name) { skipped++; continue; }
      var cat = hasHeader ? String(cells[col('category')] || '').toLowerCase() : 'main';
      if (!VALID_CATS[cat]) cat = 'main';
      var price = hasHeader ? parseFloat(cells[col('price')]) : parseFloat(cells[1]);
      var tm = hasHeader ? parseFloat(cells[col('target_margin')]) : NaN;
      var ingRaw = hasHeader ? (cells[col('ingredients')] || '') : (cells[2] || '');
      var ingredients = [];
      ingRaw.split(';').forEach(function (pair) {
        var p = pair.trim();
        if (!p) return;
        var kv = p.split(':');
        var iname = kv[0].trim();
        var icost = kv.length > 1 ? parseFloat(kv[1]) : 0;
        if (iname) ingredients.push({ name: iname, cost: isNaN(icost) || icost < 0 ? 0 : Math.round(icost * 100) / 100 });
      });
      var algRaw = hasHeader ? (cells[col('allergens')] || '') : '';
      var dish = {
        id: 'd' + Date.now().toString(36) + i.toString(36),
        name: name,
        category: cat,
        ingredients: ingredients,
        price: isNaN(price) || price < 0 ? 0 : Math.round(price * 100) / 100,
        targetMargin: isNaN(tm) || tm < 10 || tm > 95 ? 70 : tm,
        allergens: [],
        salesPerWeek: (function () {
          var sv = hasHeader ? parseFloat(cells[col('sales_per_week')]) : NaN;
          return isNaN(sv) || sv < 0 ? 0 : Math.round(sv);
        })()
      };
      if (algRaw) {
        var ids = algRaw.split(';').map(function (s) { return s.trim().toLowerCase(); });
        setDishAllergens(dish, ids);
      }
      dishes.push(dish);
    }
    return { dishes: dishes, skipped: skipped };
  }

  // Optional OpenAI polish — never required; pure enhancement hook.
  function polishWithOpenAI(texts, apiKey) {
    // Returns a promise; resolves with {polished:boolean, texts}. Falls back silently.
    return new Promise(function (resolve) {
      if (!apiKey || typeof fetch === 'undefined') { resolve({ polished: false, texts: texts }); return; }
      resolve({ polished: false, texts: texts }); // hook: wire real call when key present
    });
  }

  // ---------- Weekend special combos ----------
  function generateSpecials(dishes) {
    if (!dishes || dishes.length === 0) return [];
    var mains = dishes.filter(function (d) { return d.category === 'main'; });
    var sides = dishes.filter(function (d) { return d.category === 'side'; });
    var desserts = dishes.filter(function (d) { return d.category === 'dessert'; });
    var pool = mains.length ? mains : dishes;
    var specials = [];
    var names = ['Weekend Feast', 'Chef\'s Table Special', 'Sunday Supper'];
    for (var i = 0; i < 3; i++) {
      var main = pool[i % pool.length];
      var side = sides.length ? sides[i % sides.length] : null;
      var dessert = desserts.length ? desserts[i % desserts.length] : null;
      var items = [main.name]
        .concat(side ? [side.name] : [])
        .concat(dessert ? [dessert.name] : []);
      var cost = computePlateCost(main)
        + (side ? computePlateCost(side) : 0)
        + (dessert ? computePlateCost(dessert) : 0);
      var comboPrice = Math.round((suggestPrice(cost, 65) * 0.9) * 100) / 100;
      specials.push({
        title: names[i],
        items: items,
        comboCost: Math.round(cost * 100) / 100,
        comboPrice: comboPrice,
        blurb: 'This weekend only: ' + items.join(' + ') + ' — a ' +
          (dessert ? 'full three-course treat' : 'hearty pairing') + ' at one friendly price.'
      });
    }
    return specials;
  }

  return {
    SENSORY: SENSORY,
    MAJOR_ALLERGENS: MAJOR_ALLERGENS,
    allergenIds: allergenIds,
    dishAllergens: dishAllergens,
    setDishAllergens: setDishAllergens,
    allergenLabel: allergenLabel,
    ingredientLibrary: ingredientLibrary,
    buildMenuModel: buildMenuModel,
    computePlateCost: computePlateCost,
    suggestPrice: suggestPrice,
    actualMarginPct: actualMarginPct,
    marginHealth: marginHealth,
    generateDescriptions: generateDescriptions,
    polishWithOpenAI: polishWithOpenAI,
    generateSpecials: generateSpecials,
    menuReport: menuReport,
    repriceToTarget: repriceToTarget,
    repriceMenu: repriceMenu,
    dishesFromCSV: dishesFromCSV,
    duplicateDish: duplicateDish,
    searchDishes: searchDishes,
    sortDishes: sortDishes,
    menuToCSV: menuToCSV,
    menuEngineering: menuEngineering,
    salesOf: salesOf,
    ENG_PLAYBOOKS: ENG_PLAYBOOKS,
    TEMPLATES: TEMPLATES
  };
}));
