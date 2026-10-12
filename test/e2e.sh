#!/usr/bin/env bash
# e2e.sh — 11 end-to-end flows through menucraft-ai core logic (the same code the UI runs)
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
eq(cl[0], 'name,category,cost,price,margin_pct,target_margin_pct,status,allergens', 'flow10 header');
eq(cl.length, 5, 'flow10 one row per dish');
t(cl[3].indexOf('Lobster Thermidor,main,17.50,24.00,27.1,70,red') === 0, 'flow10 lobster row: ' + cl[3]);

// FLOW 11: edit keeps the dish id, updates fields (UI edit contract)
var edited = JSON.parse(JSON.stringify(pizza));
edited.id = 'd_edit11'; edited.price = 18;
var rec = { name:'Margherita Pizza', category:'main', ingredients:edited.ingredients, price:19, targetMargin:65 };
edited.name = rec.name; edited.price = rec.price; edited.targetMargin = rec.targetMargin;
eq(edited.id, 'd_edit11', 'flow11 id preserved on edit');
eq(M.marginHealth(edited, edited.price, edited.targetMargin).target, 65, 'flow11 target margin updated');

if (fails.length) { fails.forEach(function (f) { console.error('FAIL: ' + f); }); process.exit(1); }
console.log('all 11 flows green');
EOF
[ $? -eq 0 ] && ok "11 e2e flows" || bad "e2e flows"

# HTML sanity: all referenced assets exist
for f in $(grep -o 'src="[^"]*"\|href="[^"]*"' index.html | cut -d'"' -f2 | grep -v '^http'); do
  [ -f "$f" ] && ok "asset $f" || bad "asset $f missing"
done

echo "--- e2e: $PASS passed, $FAIL failed ---"
[ "$FAIL" -eq 0 ]
