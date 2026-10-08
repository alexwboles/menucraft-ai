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
    });
  });

  // ---------- ingredient rows ----------
  var ingRows = document.getElementById('ingRows');
  function addIngRow(name, cost) {
    var div = document.createElement('div');
    div.className = 'ing-row';
    div.innerHTML = '<input placeholder="Ingredient" value="' + esc(name || '') + '">' +
      '<input type="number" step="0.01" min="0" placeholder="$ cost" value="' + esc(cost == null ? '' : cost) + '">' +
      '<button title="remove">×</button>';
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
      var row = document.createElement('div');
      row.className = 'dish-row';
      row.innerHTML =
        '<div><span class="dot ' + h.status + '"></span><strong>' + esc(d.name) + '</strong> ' +
        '<span class="cat">' + esc(d.category) + '</span><br>' +
        '<span class="muted small">cost ' + money(h.cost) + ' · price ' + money(d.price) + ' · margin ' + h.margin + '%</span></div>' +
        '<div><button class="ghost">Open</button> <button class="ghost edit">Edit</button> ' +
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
      '<span class="muted">Suggested price at ' + tm + '% margin: <strong>' + money(suggested) + '</strong></span></p>';
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
    modal.classList.remove('hidden');
  }

  // ---------- menu preview ----------
  var CAT_ORDER = ['starter', 'main', 'side', 'dessert', 'drink'];
  function renderMenu() {
    var dishes = load();
    var body = document.getElementById('menuBody');
    var biz = document.getElementById('bizName').value.trim();
    if (!dishes.length) { body.innerHTML = '<p class="muted">Add dishes to see your menu here.</p>'; return; }
    var descs = {};
    dishes.forEach(function (d) { descs[d.id] = M.generateDescriptions(d, 'upscale').upscale; });
    var html = '';
    CAT_ORDER.forEach(function (cat) {
      var items = dishes.filter(function (d) { return d.category === cat; });
      if (!items.length) return;
      html += '<div class="menu-cat"><h3>' + cat + 's</h3>';
      items.forEach(function (d) {
        html += '<div class="menu-item"><div><div class="nm">' + esc(d.name) + '</div>' +
          '<div class="ds">' + esc(descs[d.id]) + '</div></div>' +
          '<div class="pr">' + money(d.price) + '</div></div>';
      });
      html += '</div>';
    });
    body.innerHTML = html;
  }
  document.getElementById('bizName').addEventListener('input', renderMenu);
  document.getElementById('printMenu').addEventListener('click', function () { window.print(); });

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
})();
