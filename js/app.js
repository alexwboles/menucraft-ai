/* menucraft-ai UI — localStorage persistence, no network. */
(function () {
  'use strict';
  var M = window.MenuCraft;
  var LS_KEY = 'menucraft.dishes.v1';

  function load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }
  function save(dishes) { localStorage.setItem(LS_KEY, JSON.stringify(dishes)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2); }

  // ---------- nav ----------
  document.querySelectorAll('.topbar nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.topbar nav button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      document.querySelectorAll('.view').forEach(function (v) { v.classList.add('hidden'); });
      document.getElementById('view-' + b.dataset.view).classList.remove('hidden');
      if (b.dataset.view === 'menu') renderMenu();
      if (b.dataset.view === 'report') renderReport();
      if (b.dataset.view === 'engineering') renderEngineering();
    });
  });

  // ---------- ingredient rows ----------
  var ingRows = document.getElementById('ingRows');
  var ingLibList = document.getElementById('ingLib');

  // Refresh the shared ingredient-cost pantry from saved dishes.
  function refreshIngLibrary() {
    if (!ingLibList) return;
    var lib = M.ingredientLibrary(load());
    var names = Object.keys(lib).sort(function (a, b) {
      return lib[a].name.toLowerCase().localeCompare(lib[b].name.toLowerCase());
    });
    ingLibList.innerHTML = '';
    names.forEach(function (k) {
      var o = document.createElement('option');
      o.value = lib[k].name;
      o.label = '$' + lib[k].cost.toFixed(2);
      o.textContent = lib[k].name + ' — $' + lib[k].cost.toFixed(2);
      ingLibList.appendChild(o);
    });
  }

  function addIngRow(name, cost) {
    var div = document.createElement('div');
    div.className = 'ing-row';
    div.innerHTML = '<input placeholder="Ingredient" list="ingLib" value="' + esc(name || '') + '">' +
      '<input type="number" step="0.01" min="0" placeholder="$ cost" value="' + esc(cost == null ? '' : cost) + '">' +
      '<button title="remove">×</button>';
    var ins = div.querySelectorAll('input');
    // Autofill the cost from the pantry when the cook picks a known ingredient.
    ins[0].addEventListener('change', function () {
      if (ins[1].value !== '' && parseFloat(ins[1].value) > 0) return;
      var hit = M.ingredientLibrary(load())[ins[0].value.trim().toLowerCase()];
      if (hit) ins[1].value = hit.cost.toFixed(2);
    });
    div.querySelector('button').addEventListener('click', function () { div.remove(); });
    ingRows.appendChild(div);
  }
  document.getElementById('addIng').addEventListener('click', function () { addIngRow('', ''); });
  addIngRow('', ''); addIngRow('', '');

  // ---------- save / edit dish ----------
  var editingId = null;

  function resetComposer() {
    editingId = null;
    document.getElementById('dishName').value = '';
    document.getElementById('dishPrice').value = '';
    document.getElementById('dishCat').value = 'main';
    document.getElementById('targetMargin').value = '70';
    ingRows.innerHTML = ''; addIngRow('', ''); addIngRow('', '');
    document.getElementById('saveDish').textContent = 'Save dish';
    document.getElementById('cancelEdit').style.display = 'none';
  }

  document.getElementById('saveDish').addEventListener('click', function () {
    var name = document.getElementById('dishName').value.trim();
    if (!name) { alert('Give the dish a name first.'); return; }
    var ingredients = [];
    ingRows.querySelectorAll('.ing-row').forEach(function (r) {
      var ins = r.querySelectorAll('input');
      var n = ins[0].value.trim(), c = parseFloat(ins[1].value);
      if (n) ingredients.push({ name: n, cost: isNaN(c) ? 0 : c });
    });
    var dishes = load();
    var record = {
      name: name,
      category: document.getElementById('dishCat').value,
      ingredients: ingredients,
      price: parseFloat(document.getElementById('dishPrice').value) || 0,
      targetMargin: parseFloat(document.getElementById('targetMargin').value) || 70
    };
    if (editingId) {
      var existing = dishes.find(function (x) { return x.id === editingId; });
      if (existing) {
        existing.name = record.name; existing.category = record.category;
        existing.ingredients = record.ingredients; existing.price = record.price;
        existing.targetMargin = record.targetMargin;
      }
    } else {
      record.id = 'd' + Date.now();
      dishes.push(record);
    }
    save(dishes);
    resetComposer();
    renderList();
    refreshIngLibrary();
  });
  document.getElementById('cancelEdit').addEventListener('click', resetComposer);

  function startEdit(id) {
    var d = load().find(function (x) { return x.id === id; });
    if (!d) return;
    editingId = id;
    document.getElementById('dishName').value = d.name;
    document.getElementById('dishCat').value = d.category;
    document.getElementById('dishPrice').value = d.price || '';
    document.getElementById('targetMargin').value = d.targetMargin || 70;
    ingRows.innerHTML = '';
    (d.ingredients || []).forEach(function (i) { addIngRow(i.name, i.cost); });
    if (!d.ingredients || !d.ingredients.length) { addIngRow('', ''); addIngRow('', ''); }
    document.getElementById('saveDish').textContent = 'Update dish';
    document.getElementById('cancelEdit').style.display = '';
    document.querySelector('.composer').scrollIntoView({ behavior: 'smooth' });
  }

  // ---------- dish list ----------
  var dishSearch = '', dishCatFilter = 'all', dishSort = 'newest';

  function downloadFile(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  function renderList() {
    var dishes = load();
    var box = document.getElementById('dishList');
    if (!dishes.length) { box.innerHTML = '<p class="muted">No dishes yet — add your first above.</p>'; return; }
    var visible = M.sortDishes(
      M.searchDishes(dishes, dishSearch).filter(function (d) {
        return dishCatFilter === 'all' || d.category === dishCatFilter;
      }),
      dishSort
    );
    if (!visible.length) {
      box.innerHTML = '<p class="muted">No dishes match your search / filter.</p>';
      return;
    }
    box.innerHTML = '';
    visible.forEach(function (d) {
      var h = M.marginHealth(d, d.price, d.targetMargin || 70);
      var allergens = M.dishAllergens(d);
      var algBadges = allergens.length
        ? '<span class="alg-row">' + allergens.map(function (a) {
            return '<span class="alg" title="' + esc(M.allergenLabel(a)) + '">' + esc(M.allergenLabel(a)) + '</span>';
          }).join('') + '</span>'
        : '';
      var row = document.createElement('div');
      row.className = 'dish-row';
      var mbarW = Math.max(0, Math.min(100, Math.round(h.margin)));
      row.innerHTML =
        '<div><span class="dot ' + h.status + '"></span><strong>' + esc(d.name) + '</strong> ' +
        '<span class="cat">' + esc(d.category) + '</span><br>' +
        '<span class="muted small">cost ' + money(h.cost) + ' · price ' + money(d.price) + ' · margin ' + h.margin + '%</span>' +
        '<span class="mbar ' + h.status + '"><i style="width:' + mbarW + '%"></i></span>' +
        algBadges + '</div>' +
        '<div class="dish-acts">' +
        '<label class="sales-ed">sold/wk <input type="number" min="0" step="1" value="' + M.salesOf(d) + '" data-sales="' + d.id + '"></label>' +
        '<br><button class="ghost">Open</button> <button class="ghost edit">Edit</button> ' +
        '<button class="ghost dup">Duplicate</button> <button class="ghost del">Delete</button></div>';
      row.querySelector('.ghost:not(.del):not(.edit):not(.dup)').addEventListener('click', function () { openDish(d.id); });
      row.querySelector('.edit').addEventListener('click', function () { startEdit(d.id); });
      row.querySelector('.dup').addEventListener('click', function () {
        var all = load();
        all.push(M.duplicateDish(d));
        save(all);
        renderList();
      });
      row.querySelector('.del').addEventListener('click', function () {
        if (confirm('Delete "' + d.name + '"?')) { save(load().filter(function (x) { return x.id !== d.id; })); renderList(); }
      });
      row.querySelector('[data-sales]').addEventListener('change', function (e) {
        var all = load();
        var rec = all.find(function (x) { return x.id === d.id; });
        if (rec) { rec.salesPerWeek = Math.max(0, Math.round(parseFloat(e.target.value) || 0)); save(all); }
      });
      box.appendChild(row);
    });
  }

  document.getElementById('dishSearch').addEventListener('input', function (e) {
    dishSearch = e.target.value;
    renderList();
  });
  document.getElementById('dishCatFilter').addEventListener('change', function (e) {
    dishCatFilter = e.target.value;
    renderList();
  });
  document.getElementById('dishSort').addEventListener('change', function (e) {
    dishSort = e.target.value;
    renderList();
  });
  document.getElementById('dishCsvBtn').addEventListener('click', function () {
    var dishes = load();
    if (!dishes.length) { alert('No dishes to export yet.'); return; }
    downloadFile('menucraft-menu.csv', M.menuToCSV(dishes), 'text/csv;charset=utf-8');
  });
  document.getElementById('dishImportBtn').addEventListener('click', function () {
    document.getElementById('dishImportFile').click();
  });
  document.getElementById('dishImportFile').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var res = M.dishesFromCSV(reader.result);
        if (!res.dishes.length) { alert('No dishes found in that file.'); return; }
        var dishes = load();
        res.dishes.forEach(function (d) { dishes.push(d); });
        save(dishes);
        renderList();
        refreshIngLibrary();
        alert('Imported ' + res.dishes.length + ' dish' + (res.dishes.length === 1 ? '' : 'es') +
          (res.skipped ? ' (' + res.skipped + ' blank rows skipped)' : '') + '.');
      } catch (err) {
        alert('Could not import that file.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  // ---------- menu health report ----------
  function renderReport() {
    var dishes = load();
    var box = document.getElementById('reportBody');
    if (!dishes.length) { box.innerHTML = '<p class="muted">Add dishes to see your menu report.</p>'; return; }
    var r = M.menuReport(dishes);
    function row(d) {
      return '<div class="rep-row"><span class="dot ' + d.status + '"></span>' +
        '<span class="rep-name">' + esc(d.name) + ' <span class="cat">' + esc(d.category) + '</span></span>' +
        '<span class="rep-num">cost ' + money(d.cost) + ' · price ' + money(d.price) + '</span>' +
        '<strong class="rep-margin ' + d.status + '">' + d.margin + '%</strong></div>';
    }
    var mixBar = ['green', 'yellow', 'red'].map(function (s) {
      return '<span class="mix ' + s + '">' + r.mix[s] + ' ' + s + '</span>';
    }).join(' ');
    box.innerHTML =
      '<div class="rep-stats">' +
      '<div class="rep-stat"><span class="num">' + r.dishes + '</span><span class="lbl">dishes</span></div>' +
      '<div class="rep-stat"><span class="num">' + (r.avgMargin == null ? '—' : r.avgMargin + '%') + '</span><span class="lbl">avg margin</span></div>' +
      '<div class="rep-stat"><span class="num">' + r.unpriced + '</span><span class="lbl">unpriced</span></div>' +
      '</div>' +
      '<p class="rep-mix">Margin mix: ' + mixBar + '</p>' +
      (r.best.length ? '<h3>Best margins</h3><div class="rep-list">' + r.best.map(row).join('') + '</div>' : '') +
      (r.worst.length ? '<h3>Needs attention</h3><div class="rep-list">' + r.worst.map(row).join('') + '</div>' : '') +
      (r.belowTarget.length
        ? '<div class="rep-cta"><p><strong>' + r.belowTarget.length + '</strong> dish' +
          (r.belowTarget.length === 1 ? ' is' : 'es are') + ' losing money against target. ' +
          'Reprice them all to their target margin in one click:</p>' +
          '<button id="repriceAllBtn" class="primary">Price all to target margin</button></div>'
        : '<p class="rep-ok">Every priced dish meets its target margin. Nice.</p>');
    var btn = document.getElementById('repriceAllBtn');
    if (btn) btn.addEventListener('click', function () {
      var all = load();
      var res = M.repriceMenu(all);
      save(all);
      renderList();
      refreshIngLibrary();
      renderReport();
      alert(res.updated + ' dish' + (res.updated === 1 ? '' : 'es') + ' repriced to target margin.');
    });
  }

  // ---------- menu engineering matrix ----------
  function renderEngineering() {
    var dishes = load();
    var box = document.getElementById('engBody');
    var e = M.menuEngineering(dishes);
    if (e.empty) {
      box.innerHTML =
        '<div class="eng-empty"><p><strong>The matrix needs two things:</strong> priced dishes and weekly sales.</p>' +
        '<p class="muted small">Every dish needs a price above its plate cost, and at least one dish needs a "sold/wk" number. ' +
        'Add those on the Dishes tab, then come back — we\u2019ll sort the menu into Stars, Plowhorses, Puzzles and Dogs.</p></div>';
      return;
    }
    function chip(r) {
      return '<div class="quad-chip"><span class="dot ' + r.status + '"></span><strong>' + esc(r.dish.name) + '</strong>' +
        '<span class="muted small">' + r.margin + '% margin · ' + r.sales + '/wk</span></div>';
    }
    var html = '<p class="eng-note">Popularity line: ' + e.medianSales + ' sold/wk (median). ' +
      e.dishCount + ' priced dishes judged' +
      (e.unjudged ? ', ' + e.unjudged + ' skipped (no price or no cost)' : '') + '.</p>' +
      '<div class="eng-grid">';
    ['stars', 'plowhorses', 'puzzles', 'dogs'].forEach(function (key) {
      var pb = M.ENG_PLAYBOOKS[key];
      html += '<div class="quad q-' + key + '"><div class="quad-head"><span class="quad-count">' +
        e[key].length + '</span><h3>' + pb.title + '</h3></div>' +
        '<p class="quad-advice">' + esc(pb.advice) + '</p>' +
        (e[key].length ? '<div class="quad-dishes">' + e[key].map(chip).join('') + '</div>'
          : '<p class="muted small">None in this quadrant.</p>') + '</div>';
    });
    box.innerHTML = html + '</div>';
  }

  // ---------- dish modal ----------
  var modal = document.getElementById('modal');
  document.getElementById('closeModal').addEventListener('click', function () { modal.classList.add('hidden'); });
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.add('hidden'); });

  function openDish(id) {
    var d = load().find(function (x) { return x.id === id; });
    if (!d) return;
    document.getElementById('mTitle').textContent = d.name + ' (' + d.category + ')';
    var cost = M.computePlateCost(d);
    var tm = d.targetMargin || 70;
    var suggested = M.suggestPrice(cost, tm);
    document.getElementById('mCost').innerHTML =
      '<p>Plate cost: <strong>' + money(cost) + '</strong> · Your price: <strong>' + money(d.price) + '</strong><br>' +
      '<span class="muted">Suggested price at ' + tm + '% margin: <strong>' + money(suggested) + '</strong></span> ' +
      (cost > 0 && suggested !== d.price
        ? '<button id="useSuggested" class="ghost small" style="margin-left:8px">Use suggested price</button>'
        : '') + '</p>';
    var useBtn = document.getElementById('useSuggested');
    if (useBtn) useBtn.addEventListener('click', function () {
      var all = load();
      var rec = all.find(function (x) { return x.id === id; });
      if (rec) {
        var np = M.repriceToTarget(rec);
        save(all);
        renderList();
        openDish(id); // refresh the modal with the new price
      }
    });
    var descs = M.generateDescriptions(d);
    var dbox = document.getElementById('mDesc');
    dbox.innerHTML = '';
    Object.keys(descs).forEach(function (style) {
      var c = document.createElement('div');
      c.className = 'desc-card';
      c.innerHTML = '<div class="style">' + style + ' — click to copy</div><div>' + esc(descs[style]) + '</div>';
      c.addEventListener('click', function () {
        var t = descs[style];
        if (navigator.clipboard) navigator.clipboard.writeText(t);
        c.style.borderLeftColor = '#1e7e34';
        setTimeout(function () { c.style.borderLeftColor = ''; }, 900);
      });
      dbox.appendChild(c);
    });
    var h = M.marginHealth(d, d.price, d.targetMargin || 70);
    document.getElementById('mHealth').innerHTML =
      '<div class="health-box ' + h.status + '"><span class="flag ' + h.status + '">' +
      h.status.toUpperCase() + '</span><p>' + esc(h.message) + '</p></div>';

    // allergen editor
    var cur = M.dishAllergens(d);
    var abox = document.getElementById('mAllergens');
    abox.innerHTML = '<div class="alg-grid">' + M.MAJOR_ALLERGENS.map(function (a) {
      return '<label class="alg-pick"><input type="checkbox" value="' + esc(a.id) + '"' +
        (cur.indexOf(a.id) >= 0 ? ' checked' : '') + '> ' + esc(a.name) + '</label>';
    }).join('') + '</div>' +
      '<button id="saveAllergens" class="ghost" style="margin-top:8px">Save allergens</button>';
    document.getElementById('saveAllergens').addEventListener('click', function () {
      var ids = [];
      abox.querySelectorAll('input[type="checkbox"]:checked').forEach(function (cb) { ids.push(cb.value); });
      var all = load();
      var rec = all.find(function (x) { return x.id === id; });
      if (rec) { M.setDishAllergens(rec, ids); save(all); renderList(); }
      modal.classList.add('hidden');
    });

    modal.classList.remove('hidden');
  }

  // ---------- menu preview ----------
  var menuOpts = { voice: 'upscale', showPrices: true, showAllergens: true };
  function renderMenu() {
    var dishes = load();
    var body = document.getElementById('menuBody');
    var biz = document.getElementById('bizName').value.trim();
    if (!dishes.length) { body.innerHTML = '<p class="muted">Add dishes to see your menu here.</p>'; return; }
    var model = M.buildMenuModel(dishes, menuOpts);
    var html = '';
    model.forEach(function (cat) {
      html += '<div class="menu-cat"><h3>' + esc(cat.label) + '</h3>';
      cat.items.forEach(function (d) {
        html += '<div class="menu-item"><div><div class="nm">' + esc(d.name) + '</div>' +
          (d.description ? '<div class="ds">' + esc(d.description) + '</div>' : '') +
          (d.allergens.length ? '<div class="alg-row">' + d.allergens.map(function (a) {
            return '<span class="alg">' + esc(a) + '</span>';
          }).join('') + '</div>' : '') +
          '</div>' +
          '<div class="pr">' + (d.price === null ? '' : money(d.price)) + '</div></div>';
      });
      html += '</div>';
    });
    body.innerHTML = html;
  }
  document.getElementById('bizName').addEventListener('input', renderMenu);
  document.getElementById('printMenu').addEventListener('click', function () { window.print(); });
  document.getElementById('menuVoice').addEventListener('change', function (e) {
    menuOpts.voice = e.target.value; renderMenu();
  });
  document.getElementById('menuPrices').addEventListener('change', function (e) {
    menuOpts.showPrices = e.target.checked; renderMenu();
  });
  document.getElementById('menuAllergens').addEventListener('change', function (e) {
    menuOpts.showAllergens = e.target.checked; renderMenu();
  });

  // ---------- specials ----------
  document.getElementById('genSpecials').addEventListener('click', function () {
    var dishes = load();
    var box = document.getElementById('specialList');
    var specials = M.generateSpecials(dishes);
    if (!specials.length) { box.innerHTML = '<p class="muted">Add some dishes first.</p>'; return; }
    box.innerHTML = '';
    specials.forEach(function (s) {
      var div = document.createElement('div');
      div.className = 'special';
      div.innerHTML = '<h3>' + esc(s.title) + '</h3><p>' + esc(s.blurb) + '</p>' +
        '<div class="price">' + money(s.comboPrice) + '</div>' +
        '<p class="muted small">Food cost ' + money(s.comboCost) + ' — margin ' +
        M.actualMarginPct(s.comboCost, s.comboPrice) + '%</p>';
      box.appendChild(div);
    });
  });

  renderList();
  refreshIngLibrary();
})();
