# Insights

`app/(tabs)/reports.tsx`, built on `utils/insights.ts`.

## Filtering

One visible filter band above the charts — date range, accounts, categories,
spending vs income — rather than a modal, because the active selection is itself
information and a hidden filter is one you forget is applied. Every chart reads
the same filtered array, which is computed **once** per render; re-scanning the
ledger per chart is what made earlier versions stutter.

`utils/insights.ts` is pure and covered by `npm run test:insights` (16 cases),
including range boundaries, each filter dimension, and the empty-selection paths
that would otherwise divide by zero.

## Charts and why each form was chosen

| Section | Form | Why |
| --- | --- | --- |
| Total + comparison | Stat tile | The headline is one number. A one-number chart is the most common way a chart misses its point. |
| Trend by month | Single-series area | Change over time, one measure. One hue, so no legend — the title names the series. |
| By category | Donut, ≤ 6 segments | Part-to-whole at a glance. The tail folds into "Other"; past ~6 the slices stop being comparable. |
| Busiest days | Bars, one colour | One measure. Shading each bar by its own value would double-encode height as hue. The peak is emphasised and labelled instead. |
| Most frequent | List | Ranked text, not a chart. |

Only the peak and latest points on the trend carry value labels; labelling every
point is noise the reader has to filter out.

## A known palette defect

The app's category colours were run through the palette validator rather than
eyeballed. Two fail against each other:

```
#6BADDB (Travel) vs #5FB6C4 (Education)
  normal vision  ΔE 5.0   (below the floor of 15 — hard to tell apart even
                           with full colour vision)
  deuteranopia   ΔE 4.1
```

Several other category colours also sit below a 3:1 contrast ratio against the
card surface, and three (`#5FB6C4`, `#6BADDB`, `#9A93AC`) fall under the chroma
floor, meaning they read as grey.

**This has not been changed** — recolouring categories alters how every existing
user's data looks, which is a product decision. The charts compensate the way the
guidance requires when colours are this close: every segment is directly
labelled with its name, segments are separated by a 2° surface gap, and the
legend is part of the chart rather than optional decoration. So identity is never
carried by colour alone.

Re-stepping those two hues would be a small, safe fix if you want it.
