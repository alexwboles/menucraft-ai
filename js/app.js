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

  // ---------- save dish ----------
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
    dishes.push({
      id: 'd' + Date.now(),
      name: name,
      category: document.getElementById('dishCat').value,
      ingredients: ingredients,
      price: parseFloat(document.getElementById('dishPrice').value) || 0,
      targetMargin: parseFloat(document.getElementById('targetMargin').value) || 70
    });
    save(dishes);
    document.getElementById('dishName').value = '';
    document.getElementById('dishPrice').value = '';
    ingRows.innerHTML = ''; addIngRow('', ''); addIngRow('', '');
    renderList();
  });

  // ---------- dish list ----------
  function renderList() {
    var dishes = load();
    var box = document.getElementById('dishList');
    if (!dishes.length) { box.innerHTML = '<p class="muted">No dishes yet — add your first above.</p>'; return; }
    box.innerHTML = '';
    dishes.forEach(function (d) {
      var h = M.marginHealth(d, d.price, d.targetMargin);
      var row = document.createElement('div');
      row.className = 'dish-row';
      row.innerHTML =
        '<div><span class="dot ' + h.status + '"></span><strong>' + esc(d.name) + '</strong> ' +
        '<span class="cat">' + esc(d.category) + '</span><br>' +
        '<span class="muted small">cost ' + money(h.cost) + ' · price ' + money(d.price) + ' · margin ' + h.margin + '%</span></div>' +
        '<div><button class="ghost">Open</button> <button class="ghost del">Delete</button></div>';
      row.querySelector('.ghost:not(.del)').addEventListener('click', function () { openDish(d.id); });
      row.querySelector('.del').addEventListener('click', function () {
        if (confirm('Delete "' + d.name + '"?')) { save(load().filter(function (x) { return x.id !== d.id; })); renderList(); }
      });
      box.appendChild(row);
    });
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
    var suggested = M.suggestPrice(cost, d.targetMargin);
    document.getElementById('mCost').innerHTML =
      '<p>Plate cost: <strong>' + money(cost) + '</strong> · Your price: <strong>' + money(d.price) + '</strong><br>' +
      '<span class="muted">Suggested price at ' + d.targetMargin + '% margin: <strong>' + money(suggested) + '</strong></span></p>';
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
    var h = M.marginHealth(d, d.price, d.targetMargin);
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
