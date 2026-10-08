#!/usr/bin/env bash
# smoke.sh — 16 quick checks for menucraft-ai
set -u
cd "$(dirname "$0")/.."
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL: $1"; }

[ -f index.html ] && ok "index.html exists" || bad "index.html missing"
[ -f css/style.css ] && ok "css/style.css exists" || bad "css missing"
[ -f js/app.js ] && ok "js/app.js exists" || bad "js missing"
[ -f lib/logic.js ] && ok "lib/logic.js exists" || bad "logic missing"
[ -f README.md ] && ok "README exists" || bad "README missing"

node --check lib/logic.js 2>/dev/null && ok "logic.js syntax valid" || bad "logic.js syntax"
node --check js/app.js 2>/dev/null && ok "app.js syntax valid" || bad "app.js syntax"

node -e "
var M = require('./lib/logic.js');
// cost math exact
var d = {name:'Test Pasta', ingredients:[{name:'pasta',cost:0.75},{name:'sauce',cost:1.25},{name:'cheese',cost:2.00}]};
var c = M.computePlateCost(d);
if (c !== 4.00) { console.error('cost '+c); process.exit(1); }
// suggestPrice: 4 / (1-0.7) = 13.33
var p = M.suggestPrice(4, 70);
if (p !== 13.33) { console.error('price '+p); process.exit(1); }
// all 3 styles generated, non-empty, distinct
var ds = M.generateDescriptions(d);
var ks = Object.keys(ds);
if (ks.length !== 3 || ks.indexOf('upscale')<0 || ks.indexOf('casual')<0 || ks.indexOf('fun')<0) { console.error('styles'); process.exit(1); }
if (!ds.upscale || !ds.casual || !ds.fun) { console.error('empty style'); process.exit(1); }
if (ds.upscale === ds.casual || ds.casual === ds.fun) { console.error('not distinct'); process.exit(1); }
// margin flags: exact boundaries
var g = M.marginHealth(d, 13.34, 70); // 70.0%+ -> green
if (g.status !== 'green') { console.error('green '+g.status); process.exit(1); }
var y = M.marginHealth(d, 12.50, 70); // 68% -> yellow (within 7)
if (y.status !== 'yellow') { console.error('yellow '+y.status); process.exit(1); }
var r = M.marginHealth(d, 8.00, 70); // 50% -> red
if (r.status !== 'red') { console.error('red '+r.status); process.exit(1); }
// specials: 3 combos from dishes
var s = M.generateSpecials([
  {name:'Steak', category:'main', ingredients:[{name:'beef',cost:8}]},
  {name:'Fries', category:'side', ingredients:[{name:'potato',cost:1}]},
  {name:'Cake', category:'dessert', ingredients:[{name:'flour',cost:1.5}]}
]);
if (s.length !== 3 || !s[0].comboPrice || s[0].items.length < 2) { console.error('specials'); process.exit(1); }
console.log('logic checks ok');
" && ok "logic: cost/price/styles/flags/specials" || bad "logic checks"

grep -q "printMenu\|window.print" index.html js/app.js 2>/dev/null && ok "print menu wired" || bad "print menu missing"
grep -q "localStorage" js/app.js && ok "localStorage persistence" || bad "no persistence"

node -e "
var M = require('./lib/logic.js');
function mk(name, cat, cost, price, ings) {
  return { id: 'd' + name, name: name, category: cat, price: price, targetMargin: 70,
           ingredients: (ings || []).map(function (i) { return { name: i, cost: cost }; }) };
}
// duplicateDish: fresh id, (copy) name, deep copy
var src = mk('Pasta', 'main', 2, 13.34, ['pasta', 'sauce']);
var cp = M.duplicateDish(src, 'd_copy');
if (cp.id !== 'd_copy' || cp.name !== 'Pasta (copy)' || cp.price !== 13.34) { console.error('dup fields'); process.exit(1); }
cp.ingredients[0].name = 'CHANGED';
if (src.ingredients[0].name !== 'pasta') { console.error('dup not deep'); process.exit(1); }
var threw = false;
try { M.duplicateDish(null); } catch (e) { threw = true; }
if (!threw) { console.error('dup null should throw'); process.exit(1); }
// searchDishes: name + ingredient, case-insensitive
var menu = [mk('Margherita Pizza', 'main', 3, 16, ['tomato', 'mozzarella']),
            mk('Caesar Salad', 'starter', 2, 12, ['romaine', 'parmesan'])];
if (M.searchDishes(menu, 'pizza').length !== 1) { console.error('search name'); process.exit(1); }
if (M.searchDishes(menu, 'MOZZARELLA')[0].name !== 'Margherita Pizza') { console.error('search ingredient'); process.exit(1); }
if (M.searchDishes(menu, 'zzz').length !== 0) { console.error('search no-match'); process.exit(1); }
if (M.searchDishes(menu, '').length !== 2) { console.error('search empty'); process.exit(1); }
// sortDishes: margin worst-first, name A-Z, newest = reverse, no mutation
var rich = mk('Rich Dish', 'main', 1, 20, ['x']);   // 95% margin
var poor = mk('Poor Dish', 'main', 9, 10, ['y']);   // 10% margin
var mid = mk('Mid Dish', 'side', 4, 10, ['z']);     // 60% margin
var arr = [rich, poor, mid], snap = arr.slice();
var byMargin = M.sortDishes(arr, 'margin');
if (byMargin[0].name !== 'Poor Dish' || byMargin[2].name !== 'Rich Dish') { console.error('margin sort'); process.exit(1); }
var byName = M.sortDishes(arr, 'name').map(function (d) { return d.name; });
if (byName.join('|') !== 'Mid Dish|Poor Dish|Rich Dish') { console.error('name sort: ' + byName); process.exit(1); }
var byNew = M.sortDishes(arr, 'newest');
if (byNew[0] !== mid || byNew[2] !== rich) { console.error('newest sort'); process.exit(1); }
if (arr.join('|') !== snap.join('|')) { console.error('sort mutated'); process.exit(1); }
// menuToCSV: header + rows with margin columns
var csv = M.menuToCSV([rich, poor]);
var lines = csv.split('\n');
if (lines[0] !== 'name,category,cost,price,margin_pct,target_margin_pct,status') { console.error('csv header: ' + lines[0]); process.exit(1); }
if (lines.length !== 3 || lines[1].indexOf('Rich Dish,main,1.00,20.00,95,70,green') !== 0) { console.error('csv rows: ' + lines[1]); process.exit(1); }
console.log('dish-management logic checks ok');
" && ok "logic: duplicate/search/sort/csv" || bad "dish-management logic checks"

for id in dishSearch dishCatFilter dishSort dishCsvBtn cancelEdit; do
  grep -q "id=\"$id\"" index.html && ok "index.html has id=$id" || bad "index.html missing id=$id"
done

echo "--- smoke: $PASS passed, $FAIL failed ---"
[ "$FAIL" -eq 0 ]
