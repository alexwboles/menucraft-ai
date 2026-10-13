# MenuCraft AI — Redesign Audit (2026-10-13)

Competitors researched: **Plate-cost/food-cost calculators** (ingredient master list, recipe costing sheets, menu profitability dashboard, menu engineering matrix: Stars/Plowhorses/Puzzles/Dogs), **MenuGauge AI** (cost, gross profit, price recommendations vs target margin), **MenuMath Pro** (dietary icons, margin flags), **MustHaveMenus** (elegant printable menu design).

## Visual gaps vs competitors
1. Dish rows were text lines (cost · price · margin%) — food-cost tools show **per-dish margin bars** and cost breakdowns at a glance.
2. The report was a flat list; the industry-standard **menu engineering matrix** (2×2: Stars, Plowhorses, Puzzles, Dogs) — the single most-used menu-analysis view in the trade — was missing entirely.
3. MustHaveMenus-grade menu preview existed and stays; the numbers side needed the same polish.

## Functional gaps vs competitors
1. **No popularity dimension**: every food-cost tool pairs margin with sales to classify dishes. MenuCraft tracked cost and price but never "how many do we sell?"
2. **No matrix playbooks**: Stars→feature, Plowhorses→reprice, Puzzles→promote, Dogs→drop. The plain-language "what to do" per dish class.
3. CSV round-trip didn't carry sales data.

## Redesign plan
- **Menu engineering matrix** (new nav view): 2×2 quadrant board — Stars, Plowhorses, Puzzles, Dogs — each with a playbook card ("do this"), dish chips showing margin + weekly sales. Empty state teaches the concept and links to the sales editor.
- **Sales/week per dish**: inline number editor on every dish row ("sold/wk"), persisted on the dish record, included in CSV export/import (backward compatible).
- **Margin bars** on dish rows: visual cost/price/margin strip replacing the text line.
- logic.js gains pure, tested `menuEngineering(dishes)` + CSV sales column. All existing features preserved: composer, descriptions, health flags, menu preview, report + reprice-all, specials, allergens, pantry, import/export.

## Concept (1 paragraph)
The chef's P&L studio: keep the bistro editorial identity (cream paper, wine-red accent, Georgia display), but give the numbers side the menu-engineering treatment the trade expects — dish rows with margin bars and a sold-per-week editor, and a proper 2×2 Stars/Plowhorses/Puzzles/Dogs matrix with plain-English playbooks per quadrant, so it reads like the food-cost tools restaurant consultants actually use. One accent: wine #9e2b25.
