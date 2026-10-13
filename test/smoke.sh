#!/usr/bin/env bash
# smoke.sh — 36 quick checks for menucraft-ai
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
// menuToCSV: header + rows with margin + allergen columns
var csv = M.menuToCSV([rich, poor]);
var lines = csv.split('\n');
if (lines[0] !== 'name,category,cost,price,margin_pct,target_margin_pct,status,allergens,sales_per_week') { console.error('csv header: ' + lines[0]); process.exit(1); }
if (lines.length !== 3 || lines[1].indexOf('Rich Dish,main,1.00,20.00,95,70,green') !== 0) { console.error('csv rows: ' + lines[1]); process.exit(1); }
var algDish = { name: 'A', category: 'main', price: 10, targetMargin: 70, ingredients: [], allergens: ['milk', 'peanut'] };
var csvA = M.menuToCSV([algDish]).split('\n');
if (csvA[1].indexOf('Milk / dairy; Peanuts') < 0) { console.error('csv allergen col: ' + csvA[1]); process.exit(1); }
console.log('dish-management logic checks ok');
" && ok "logic: duplicate/search/sort/csv" || bad "dish-management logic checks"

for id in dishSearch dishCatFilter dishSort dishCsvBtn cancelEdit menuVoice menuPrices menuAllergens ingLib mAllergens; do
  grep -q "id=\"$id\"" index.html && ok "index.html has id=$id" || bad "index.html missing id=$id"
done

node -e "
var M = require('./lib/logic.js');
// allergens: sanitize unknown ids, dedupe
var d = { name: 'Pasta', allergens: ['milk', 'bogus', 'milk'] };
if (M.dishAllergens(d).join('|') !== 'milk') { console.error('dishAllergens sanitize: ' + JSON.stringify(M.dishAllergens(d))); process.exit(1); }
if (M.allergenLabel('peanut') !== 'Peanuts') { console.error('allergenLabel'); process.exit(1); }
var d2 = { name: 'X' };
M.setDishAllergens(d2, ['soy', 'sesame', 'nope']);
if (d2.allergens.join('|') !== 'soy|sesame') { console.error('setDishAllergens: ' + JSON.stringify(d2.allergens)); process.exit(1); }
if (M.MAJOR_ALLERGENS.length !== 9) { console.error('allergen count'); process.exit(1); }
// ingredient library: last-used cost wins, trims, skips blanks
var lib = M.ingredientLibrary([
  { ingredients: [{ name: 'Tomato', cost: 0.5 }, { name: ' ', cost: 9 }] },
  { ingredients: [{ name: 'tomato', cost: 0.75 }] }
]);
if (Object.keys(lib).length !== 1) { console.error('lib keys'); process.exit(1); }
if (lib['tomato'].cost !== 0.75) { console.error('lib last cost: ' + lib['tomato'].cost); process.exit(1); }
// buildMenuModel: category order/labels, voice none, prices off, allergens on/off
var menu = [
  { id: 'd1', name: 'Soup', category: 'starter', price: 8, ingredients: [], allergens: ['wheat'] },
  { id: 'd2', name: 'Steak', category: 'main', price: 28, ingredients: [] }
];
var m1 = M.buildMenuModel(menu, { voice: 'upscale', showPrices: true, showAllergens: true });
if (m1.length !== 2 || m1[0].label !== 'Starters' || m1[1].label !== 'Mains') { console.error('menu model cats'); process.exit(1); }
if (!m1[0].items[0].description || m1[0].items[0].description.length < 20) { console.error('menu desc'); process.exit(1); }
if (m1[0].items[0].allergens.join('|') !== 'Wheat / gluten') { console.error('menu allergens'); process.exit(1); }
var m2 = M.buildMenuModel(menu, { voice: 'none', showPrices: false, showAllergens: false });
if (m2[1].items[0].description !== null) { console.error('voice none'); process.exit(1); }
if (m2[1].items[0].price !== null) { console.error('prices off'); process.exit(1); }
if (m2[0].items[0].allergens.length !== 0) { console.error('allergens off'); process.exit(1); }
// buildMenuModel never crashes on empty
if (M.buildMenuModel([], {}).length !== 0) { console.error('empty menu model'); process.exit(1); }
console.log('allergen + pantry + menu-model checks ok');
" && ok "logic: allergens/pantry/menu-model" || bad "allergen/pantry/menu-model checks"

node -e "
var M = require('./lib/logic.js');
// menuReport: mix counts, best/worst, unpriced handling
var dishes = [
  { id:'d1', name:'Steak', category:'main', price:32, targetMargin:70, ingredients:[{name:'ribeye',cost:9}] },
  { id:'d2', name:'Salad', category:'starter', price:9, targetMargin:70, ingredients:[{name:'greens',cost:1.2}] },
  { id:'d3', name:'Soup', category:'starter', price:0, targetMargin:70, ingredients:[{name:'stock',cost:0.8}] }
];
var r = M.menuReport(dishes);
if (r.dishes !== 3 || r.priced !== 2 || r.unpriced !== 1) { console.error('counts '+JSON.stringify(r)); process.exit(1); }
if (r.best[0].name !== 'Salad' || r.worst[0].name !== 'Steak') { console.error('ranking'); process.exit(1); }
if (typeof r.avgMargin !== 'number') { console.error('avgMargin'); process.exit(1); }
if (M.menuReport([]).avgMargin !== null) { console.error('empty report'); process.exit(1); }
// repriceToTarget + repriceMenu
var cheap = { id:'d4', name:'Burger', category:'main', price:10, targetMargin:70, ingredients:[{name:'beef',cost:4}] };
var np = M.repriceToTarget(cheap);
if (cheap.price !== np || np !== M.suggestPrice(4, 70)) { console.error('reprice '+np); process.exit(1); }
var res = M.repriceMenu(dishes.concat([cheap]));
if (res.updated < 1) { console.error('bulk reprice'); process.exit(1); }
try { M.repriceToTarget(null); console.error('should throw'); process.exit(1); } catch (e) {}
// dishesFromCSV: header + quoted fields + blank rows
var csv = 'name,category,price,target_margin,ingredients,allergens\n\"Margherita Pizza\",main,14.99,70,\"flour:0.80;tomato:1.20\",\"milk;wheat\"\n\nFries,side,4.50,,\"potato:0.60\",\n';
var imp = M.dishesFromCSV(csv);
if (imp.dishes.length !== 2 || imp.skipped !== 1) { console.error('import '+JSON.stringify(imp)); process.exit(1); }
var pz = imp.dishes[0];
if (pz.ingredients.length !== 2 || pz.allergens.join(',') !== 'milk,wheat' || pz.category !== 'main') { console.error('pizza '+JSON.stringify(pz)); process.exit(1); }
if (imp.dishes[1].targetMargin !== 70) { console.error('default margin'); process.exit(1); }
var plain = M.dishesFromCSV('Taco\nBurrito\n');
if (plain.dishes.length !== 2 || plain.dishes[0].category !== 'main') { console.error('plain import'); process.exit(1); }
console.log('report + reprice + import checks ok');
" && ok "logic: menuReport/repriceToTarget/repriceMenu/dishesFromCSV" || bad "report/reprice/import checks"

# new UI wiring present
for needle in renderReport repriceAllBtn useSuggested dishImportBtn dishImportFile menuReport repriceMenu dishesFromCSV; do
  grep -q "$needle" js/app.js && ok "app.js wires $needle" || bad "app.js missing $needle"
done
for id in view-report reportBody dishImportBtn dishImportFile; do
  grep -q "id=\"$id\"" index.html && ok "index.html has #$id" || bad "index.html missing #$id"
done
grep -q 'data-view="report"' index.html && ok "nav has report view" || bad "nav missing report view"

grep -q 'data-view="engineering"' index.html && ok "nav has engineering view" || bad "nav missing engineering view"
grep -q 'id="engBody"' index.html && ok "engineering view body exists" || bad "engBody missing"
grep -q 'renderEngineering' js/app.js && ok "app.js has renderEngineering" || bad "renderEngineering missing"
grep -q 'data-sales' js/app.js && ok "app.js has sold/wk editor" || bad "sold/wk editor missing"
grep -q 'eng-grid' css/style.css && ok "matrix CSS present" || bad "matrix CSS missing"

node << 'NODEEOF'
const M = require('/home/hatch/workspace/menucraft-ai/lib/logic.js');
const dishes = [
  { id: 'a', name: 'Star', category: 'main', ingredients: [{ name: 'x', cost: 2 }], price: 20, targetMargin: 70, salesPerWeek: 50 },
  { id: 'b', name: 'Plow', category: 'main', ingredients: [{ name: 'x', cost: 9 }], price: 20, targetMargin: 70, salesPerWeek: 50 },
  { id: 'c', name: 'Puzzle', category: 'main', ingredients: [{ name: 'x', cost: 2 }], price: 20, targetMargin: 70, salesPerWeek: 5 },
  { id: 'd', name: 'Dog', category: 'main', ingredients: [{ name: 'x', cost: 9 }], price: 20, targetMargin: 70, salesPerWeek: 5 },
  { id: 'e', name: 'Unpriced', category: 'main', ingredients: [{ name: 'x', cost: 2 }], price: 0, targetMargin: 70, salesPerWeek: 99 }
];
const e = M.menuEngineering(dishes);
const names = (rs) => rs.map(r => r.dish.name).sort().join(',');
if (e.empty) { console.error('should not be empty'); process.exit(1); }
if (names(e.stars) !== 'Star' || names(e.plowhorses) !== 'Plow' ||
    names(e.puzzles) !== 'Puzzle' || names(e.dogs) !== 'Dog') {
  console.error('quadrants wrong: ' + JSON.stringify({ s: names(e.stars), p: names(e.plowhorses), z: names(e.puzzles), d: names(e.dogs) }));
  process.exit(1);
}
if (e.unjudged !== 1) { console.error('unjudged=' + e.unjudged); process.exit(1); }
// no sales data -> empty matrix
const e2 = M.menuEngineering(dishes.map(d => Object.assign({}, d, { salesPerWeek: 0 })));
if (!e2.empty) { console.error('expected empty'); process.exit(1); }
// CSV round-trips sales_per_week
const csv = M.menuToCSV(dishes);
if (csv.indexOf('sales_per_week') < 0) { console.error('csv missing sales column'); process.exit(1); }
const back = M.dishesFromCSV('name,category,price,target_margin,ingredients,allergens,sales_per_week\nX,main,20,70,x:2,,12\n');
if (back.dishes.length !== 1 || back.dishes[0].salesPerWeek !== 12) { console.error('import sales=' + JSON.stringify(back.dishes)); process.exit(1); }
const legacy = M.dishesFromCSV('name,category,price,target_margin,ingredients,allergens\nY,main,20,70,x:2,\n');
if (legacy.dishes.length !== 1 || legacy.dishes[0].salesPerWeek !== 0) { console.error('legacy import'); process.exit(1); }
NODEEOF
rc=$?; [ $rc -eq 0 ] && ok "menuEngineering quadrants + CSV sales round-trip" || bad "menuEngineering logic (exit $rc)"

echo "--- smoke: $PASS passed, $FAIL failed ---"
[ "$FAIL" -eq 0 ]
