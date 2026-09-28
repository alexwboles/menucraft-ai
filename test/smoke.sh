#!/usr/bin/env bash
# smoke.sh — 11 quick checks for menucraft-ai
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

echo "--- smoke: $PASS passed, $FAIL failed ---"
[ "$FAIL" -eq 0 ]
