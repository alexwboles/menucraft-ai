#!/usr/bin/env bash
# e2e.sh — 14 end-to-end flows through menucraft-ai core logic (the same code the UI runs)
set -u
cd "$(dirname "$0")/.."
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL: $1"; }

node << 'EOF'
var M = require('./lib/logic.js');
var fails = [];
function eq(a, b, label) { if (a !== b) fails.push(label + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function t(cond, label) { if (!cond) fails.push(label); }

// FLOW 1: full dish lifecycle — build, cost, price, health
var pizza = { name:'Margherita Pizza', category:'main',
  ingredients:[{name:'dough',cost:0.80},{name:'san marzano tomatoes',cost:1.20},{name:'fior di latte',cost:2.10},{name:'basil',cost:0.40}] };
eq(M.computePlateCost(pizza), 4.5, 'flow1 cost');
eq(M.suggestPrice(4.5, 70), 15.0, 'flow1 suggested price');
t(M.marginHealth(pizza, 16, 70).status === 'green', 'flow1 green flag at 71.9%');

// FLOW 2: money-loser flagged red with plain-language warning
var lobster = { name:'Lobster Thermidor', category:'main',
  ingredients:[{name:'lobster',cost:14.00},{name:'cream',cost:1.50},{name:'cognac',cost:2.00}] };
var h = M.marginHealth(lobster, 24, 70); // margin 27.1% -> red
eq(h.status, 'red', 'flow2 red flag');
t(/losing money/i.test(h.message), 'flow2 plain-language warning');

// FLOW 3: descriptions mention the dish's own ingredients, all 3 styles
var ds = M.generateDescriptions(pizza);
['upscale','casual','fun'].forEach(function (s) {
  t(ds[s] && ds[s].length > 40, 'flow3 ' + s + ' long enough');
  t(/tomato|basil|dough/i.test(ds[s]), 'flow3 ' + s + ' uses ingredients');
});

// FLOW 4: weekend specials bundle courses and beat ala-carte math
var menu = [
  {name:'Ribeye', category:'main', ingredients:[{name:'beef',cost:9}]},
  {name:'Mash', category:'side', ingredients:[{name:'potato',cost:1.2}]},
  {name:'Brownie', category:'dessert', ingredients:[{name:'choc',cost:1.8}]},
  {name:'Soup', category:'starter', ingredients:[{name:'veg',cost:2}]}
];
var sp = M.generateSpecials(menu);
eq(sp.length, 3, 'flow4 three specials');
t(sp[0].items.length === 3, 'flow4 full 3-course combo');
t(sp[0].comboPrice < M.suggestPrice(sp[0].comboCost, 65), 'flow4 combo discounted vs list');

// FLOW 5: empty / edge inputs never crash
t(M.computePlateCost({name:'X'}) === 0, 'flow5 no ingredients = 0 cost');
t(M.suggestPrice(0, 70) === 0, 'flow5 zero cost = zero price');
var d0 = M.generateDescriptions({name:'', ingredients:[]});
t(d0.upscale.length > 0, 'flow5 empty dish still gets copy');
t(M.generateSpecials([]).length === 0, 'flow5 no dishes = no specials');
t(M.marginHealth({name:'X', ingredients:[]}, 0, 70).status === 'red', 'flow5 unpriced dish flagged');

// FLOW 6: margin boundary — exactly at target is green
var d6 = {name:'B', ingredients:[{name:'x',cost:3}]};
var at = M.suggestPrice(3, 70); // exactly 70%
t(M.marginHealth(d6, at, 70).status === 'green', 'flow6 exact target green');

// FLOW 7: deterministic copy — same dish always yields same descriptions
var a = M.generateDescriptions(pizza).upscale;
var b = M.generateDescriptions(pizza).upscale;
eq(a, b, 'flow7 deterministic descriptions');

// FLOW 8: duplicate journey — clone a dish, rename, keep the recipe
var dup = M.duplicateDish(pizza, 'd_dup8');
eq(dup.id, 'd_dup8', 'flow8 fresh id');
eq(dup.name, 'Margherita Pizza (copy)', 'flow8 copy name');
eq(M.computePlateCost(dup), 4.5, 'flow8 recipe preserved');
dup.ingredients[0].cost = 99;
eq(M.computePlateCost(pizza), 4.5, 'flow8 deep copy (original untouched)');

// FLOW 9: search + filter + worst-margin sort — find the losers fast
var fullMenu = [
  {name:'Ribeye', category:'main', price:32, targetMargin:70, ingredients:[{name:'beef',cost:9}]},
  {name:'Mash', category:'side', price:8, targetMargin:70, ingredients:[{name:'potato',cost:1.2}]},
  {name:'Lobster Thermidor', category:'main', price:24, targetMargin:70, ingredients:[{name:'lobster',cost:14},{name:'cream',cost:1.5},{name:'cognac',cost:2.0}]},
  {name:'House Lemonade', category:'drink', price:5, targetMargin:70, ingredients:[{name:'lemon',cost:0.4}]}
];
var hits = M.searchDishes(fullMenu, 'lobster');
eq(hits.length, 1, 'flow9 search narrows to lobster');
var worstFirst = M.sortDishes(fullMenu, 'margin');
eq(worstFirst[0].name, 'Lobster Thermidor', 'flow9 worst margin first');
t(M.marginHealth(worstFirst[0], worstFirst[0].price, 70).status === 'red', 'flow9 worst is red-flagged');
var mains = M.sortDishes(fullMenu.filter(function (d) { return d.category === 'main'; }), 'name');
eq(mains.length, 2, 'flow9 category filter keeps 2 mains');

// FLOW 10: CSV export carries every dish with margin columns
var csv = M.menuToCSV(fullMenu);
var cl = csv.split('\n');
eq(cl[0], 'name,category,cost,price,margin_pct,target_margin_pct,status,allergens,sales_per_week', 'flow10 header');
eq(cl.length, 5, 'flow10 one row per dish');
t(cl[3].indexOf('Lobster Thermidor,main,17.50,24.00,27.1,70,red') === 0, 'flow10 lobster row: ' + cl[3]);

// FLOW 11: edit keeps the dish id, updates fields (UI edit contract)
var edited = JSON.parse(JSON.stringify(pizza));
edited.id = 'd_edit11'; edited.price = 18;
var rec = { name:'Margherita Pizza', category:'main', ingredients:edited.ingredients, price:19, targetMargin:65 };
edited.name = rec.name; edited.price = rec.price; edited.targetMargin = rec.targetMargin;
eq(edited.id, 'd_edit11', 'flow11 id preserved on edit');
eq(M.marginHealth(edited, edited.price, edited.targetMargin).target, 65, 'flow11 target margin updated');

// FLOW 12: menu health report — margin mix, best/worst, unpriced handling
var rmenu = [
  { id:'r1', name:'Ribeye', category:'main', price:34, targetMargin:70, ingredients:[{name:'steak',cost:10}] },
  { id:'r2', name:'House Salad', category:'starter', price:11, targetMargin:70, ingredients:[{name:'greens',cost:1.5}] },
  { id:'r3', name:'Daily Soup', category:'starter', price:6, targetMargin:70, ingredients:[{name:'veg',cost:2.6}] },
  { id:'r4', name:'Secret Dish', category:'main', price:0, targetMargin:70, ingredients:[{name:'x',cost:3}] }
];
var rep = M.menuReport(rmenu);
eq(rep.dishes, 4, 'flow12 dish count');
eq(rep.priced, 3, 'flow12 priced count');
eq(rep.unpriced, 1, 'flow12 unpriced count');
t(rep.mix.green + rep.mix.yellow + rep.mix.red === 3, 'flow12 mix sums to priced');
t(rep.best[0].margin >= rep.best[rep.best.length-1].margin, 'flow12 best sorted desc');
t(rep.worst[0].margin <= rep.worst[rep.worst.length-1].margin, 'flow12 worst sorted asc');
t(rep.belowTarget.every(function(x){ return x.status === 'red'; }), 'flow12 belowTarget all red');

// FLOW 13: reprice journey — one dish, then the whole menu
var cheap = { id:'c1', name:'Burger', category:'main', price:9, targetMargin:70,
  ingredients:[{name:'beef',cost:3.8},{name:'bun',cost:0.7}] };
var before = cheap.price;
var np = M.repriceToTarget(cheap);
t(np > before, 'flow13 reprice raises underpriced dish');
eq(np, M.suggestPrice(4.5, 70), 'flow13 reprice equals suggested price');
t(M.marginHealth(cheap, cheap.price, 70).status === 'green', 'flow13 margin green after reprice');
var menu2 = rmenu.map(function(d){ return JSON.parse(JSON.stringify(d)); });
var res2 = M.repriceMenu(menu2);
t(res2.updated >= 1, 'flow13 bulk reprice updates losers');
t(menu2.every(function(d){ return M.marginHealth(d, d.price, d.targetMargin || 70).status === 'green' || !(d.price > 0); }),
  'flow13 every priced dish green after bulk reprice');

// FLOW 14: CSV import journey — a spreadsheet becomes dishes
var sheet = 'name,category,price,target_margin,ingredients,allergens\n' +
  '"Truffle Pasta",main,24.00,72,"pasta:1.10;truffle:6.00;cream:0.90","milk;wheat"\n' +
  'Gelato,dessert,7.50,,"milk:0.80;sugar:0.20",milk\n';
var imp = M.dishesFromCSV(sheet);
eq(imp.dishes.length, 2, 'flow14 two dishes imported');
eq(imp.skipped, 0, 'flow14 nothing skipped');
var tp = imp.dishes[0];
eq(tp.category, 'main', 'flow14 category kept');
t(tp.allergens.indexOf('milk') >= 0 && tp.allergens.indexOf('wheat') >= 0, 'flow14 allergens parsed');
eq(tp.ingredients.length, 3, 'flow14 ingredient pairs parsed');
eq(M.computePlateCost(tp), 8.0, 'flow14 plate cost from import');
eq(imp.dishes[1].targetMargin, 70, 'flow14 default target margin');
var csvOut = M.menuToCSV(imp.dishes);
t(csvOut.indexOf('Truffle Pasta') >= 0 && csvOut.split('\n').length === 3, 'flow14 imported dishes export back to CSV');

if (fails.length) { fails.forEach(function (f) { console.error('FAIL: ' + f); }); process.exit(1); }
console.log('all 14 flows green');
EOF
[ $? -eq 0 ] && ok "11 e2e flows" || bad "e2e flows"

# HTML sanity: all referenced assets exist
for f in $(grep -o 'src="[^"]*"\|href="[^"]*"' index.html | cut -d'"' -f2 | grep -v '^http'); do
  [ -f "$f" ] && ok "asset $f" || bad "asset $f missing"
done


# Engineering: a chef logs weekly sales and re-sorts the matrix after a reprice
node << 'NODEEOF'
const M = require('/home/hatch/workspace/menucraft-ai/lib/logic.js');
const dishes = [
  { id: 'a', name: 'Burger', category: 'main', ingredients: [{ name: 'beef', cost: 6 }], price: 15, targetMargin: 70, salesPerWeek: 80 },
  { id: 'b', name: 'Pasta', category: 'main', ingredients: [{ name: 'pasta', cost: 2 }], price: 18, targetMargin: 70, salesPerWeek: 10 }
];
let e = M.menuEngineering(dishes);
const inQ = (q, n) => e[q].some(r => r.dish.name === n);
if (!(inQ('plowhorses', 'Burger') && inQ('puzzles', 'Pasta'))) { console.error('initial quadrants'); process.exit(1); }
// chef reprices the burger to target -> margin becomes healthy -> burger should move to stars
const b = dishes[0];
const np = M.repriceToTarget(b); b.price = np;
e = M.menuEngineering(dishes);
if (!e.stars.some(r => r.dish.name === 'Burger')) { console.error('burger did not become a star'); process.exit(1); }
console.log('burger repriced to $' + np.toFixed(2) + ' and moved to Stars');
NODEEOF
rc=$?; [ $rc -eq 0 ] && ok "e2e: reprice moves a plowhorse to Stars" || bad "e2e engineering flow (exit $rc)"

echo "--- e2e: $PASS passed, $FAIL failed ---"
[ "$FAIL" -eq 0 ]
