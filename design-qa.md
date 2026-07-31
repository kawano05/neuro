# Design QA — NEURONODE 年齢非依存アクティビティホーム

- Source of truth: `/Users/otyagasi/.codex/generated_images/019fa713-8630-7203-a400-71ee957ee8eb/call_74TC5h196OX2rYi1wbKQRGbm.png`
- Implementation capture: `/Users/otyagasi/.codex/visualizations/2026/07/28/019fa713-8630-7203-a400-71ee957ee8eb/neuronode-home-implementation-834x1194-pass2.png`
- Target viewport: 834 × 1194 CSS px, iPad portrait
- Captured pixels: source 1048 × 1501; implementation 819 × 1117
- Comparison normalization: source was scaled to 834 × 1194 and cropped to the visible 834 × 1137 browser content area. The implementation capture was scaled to 834 × 1137. No aspect-changing crop was applied to the five activity rows.
- State: home, default theme, default text size and contrast, automatic scan active on row 2

## Evidence

- Full-view comparison: `/Users/otyagasi/.codex/visualizations/2026/07/28/019fa713-8630-7203-a400-71ee957ee8eb/neuronode-home-comparison-pass2.png`
- Focused comparison: `/Users/otyagasi/.codex/visualizations/2026/07/28/019fa713-8630-7203-a400-71ee957ee8eb/neuronode-home-comparison-pass2-focus.png`
- Runtime capture: `/Users/otyagasi/.codex/visualizations/2026/07/28/019fa713-8630-7203-a400-71ee957ee8eb/neuronode-home-implementation-834x1194-pass2.png`

## Findings

No P0, P1, or P2 fidelity issue remains.

- Typography: hierarchy, weight, alignment, and large row-label scale match the selected direction.
- Spacing: the five-row rhythm, left numbering, centered content, and fixed bottom switch dock match the target composition.
- Colors: calm off-white surface, dark type, green scan state, and yellow focus ring are preserved.
- Imagery and icons: the implementation uses one coherent Font Awesome icon family. The network mark is not the exact generated four-node brand mark, and the activity glyphs are simpler than the generated illustrations; both are accepted P3 differences because they avoid fabricated assets while retaining the intended meaning and weight.
- Copy: age-neutral labels and the five selected activity groups match the approved direction.

## Interaction and runtime checks

- Start → home does not fall through into the first activity.
- Automatic scan can focus and activate the activity rows.
- Rhythm opens its four-choice second level and returns to home.
- The supporter menu opens outside the scan order and exposes supporter-only settings.
- The fixed switch dock remains reachable and changes its label by context.
- Browser console errors and warnings checked: none.
- Full test suite passed: 12 judge tests, pointing tests, reaction tests, 14 data-integrity tests, 42 browser smoke tests, and 1 PWA update-race test.

## Comparison history

- Pass 1 exposed two P2 mismatches: the rows and icons were too compact, and the header status was visually off-center.
- Fixes: changed the header to a centered three-column grid, increased row and icon scale, strengthened type hierarchy, and replaced the mismatched smile mark with the Font Awesome network mark.
- Pass 2 was compared again in both full-view and focused composites. Only the two accepted P3 icon differences remain.

## Checklist

- [x] Same viewport and visible state
- [x] Full-view comparison
- [x] Focused comparison
- [x] Typography, spacing, color, icon, and copy review
- [x] Primary interaction path
- [x] Console review
- [x] Responsive and accessibility-oriented regression coverage

final result: passed
