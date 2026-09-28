# 🍽️ MenuCraft AI

**Menus that sell, margins that hold** — an AI menu writer + food-cost helper for independent cafes and restaurants.

## The problem
Independent restaurants lose money two ways: bland menu descriptions that don't sell dishes, and plates priced without knowing the true food cost. Hiring a copywriter and a food-cost consultant is out of reach for a small cafe.

## The solution
Type in a dish with its ingredients and what each costs. MenuCraft AI:

1. **Writes crave-worthy descriptions** in 3 styles — upscale, casual, fun — from a local sensory-word template bank (buttery, charred, melt-in-your-mouth…). Click any description to copy it.
2. **Does the food-cost math** — plate cost, suggested price at *your* target margin, and a plain-language health flag:
   - 🟢 Healthy — beating your target
   - 🟡 Close — within a few points, nudge the price
   - 🔴 Losing money — rework before it goes on the menu
3. **Previews an elegant printable menu** grouped by course, ready for the printer (Print button → clean print CSS).
4. **Generates weekend specials** — combos from your existing dishes with a friendly combo price.

Everything runs **locally in the browser** (localStorage). No account, no network, no fees. If you set `OPENAI_API_KEY`, descriptions can optionally be polished by a model — never required.

## Run it
No build step. Open `index.html` in a browser, or serve it:

```bash
npx serve .          # or: python3 -m http.server 8080
```

## Pricing vision
Free for up to 15 dishes · **Pro $24/mo** — unlimited dishes, specials calendar, multi-location menus · **Studio $59/mo** — done-for-you menu rewrites.

## Tests
```bash
bash test/smoke.sh   # 10 checks
bash test/e2e.sh     # 7 flows
```

## Tech
Pure static HTML/CSS/JS. Core logic lives in `lib/logic.js`, shared between the browser and Node tests (UMD wrapper) — so the math the tests verify is exactly the math the UI runs.
