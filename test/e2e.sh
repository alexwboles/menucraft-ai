#!/usr/bin/env bash
# e2e.sh — 7 end-to-end flows through menucraft-ai core logic (the same code the UI runs)
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

if (fails.length) { fails.forEach(function (f) { console.error('FAIL: ' + f); }); process.exit(1); }
console.log('all 7 flows green');
EOF
[ $? -eq 0 ] && ok "7 e2e flows" || bad "e2e flows"

# HTML sanity: all referenced assets exist
for f in $(grep -o 'src="[^"]*"\|href="[^"]*"' index.html | cut -d'"' -f2 | grep -v '^http'); do
  [ -f "$f" ] && ok "asset $f" || bad "asset $f missing"
done

echo "--- e2e: $PASS passed, $FAIL failed ---"
[ "$FAIL" -eq 0 ]
