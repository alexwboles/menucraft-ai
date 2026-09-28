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
    computePlateCost: computePlateCost,
    suggestPrice: suggestPrice,
    actualMarginPct: actualMarginPct,
    marginHealth: marginHealth,
    generateDescriptions: generateDescriptions,
    polishWithOpenAI: polishWithOpenAI,
    generateSpecials: generateSpecials,
    TEMPLATES: TEMPLATES
  };
}));
