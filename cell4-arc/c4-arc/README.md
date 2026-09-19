# Editable ARC engine

The archive supplied only a concatenated browser bundle. Its original source sections have been recovered into `src/`; these are recovered JavaScript sections, not a claim to recover the original author's full repository. `manifest.json` defines their load order. The four `51-legacy-additions-*` sections preserve the previous nine added solver families.

Build the same self-contained browser/Node entry point:

```sh
node c4-arc/build.js
```

No dependency installation is required. Existing HTML script tags still load `c4-arc-engine.js`. Edit source modules, then rebuild; do not patch the generated bundle.

## New mechanisms

- `52-scene.js`: bounded scene graphs, shape equivalence under the eight square symmetries, bounding-box relations, strict unique selectors, shared-marker alignment with collision rejection. The search-local scene cache is bounded.
- `53-bidirectional.js`: inverse construction of latent demonstration outputs. Reductions cover scaling, tiling, mirror concatenation, framing, partial periodicity, and changed-cell masks. Search can compose two inverse constructors, relational input extraction, and an existing specialist. Final execution decodes onto an input-derived canvas. All complete programs must exactly fit every demonstration. Typed ASTs and structural costs describe the composition.
- `54-reductions.js`: typed object-set filtering, integer reduction, and output construction. Primitive predicates compose with palette selectors; count, area, holes, and distinct shapes feed bounded canvas renderers. Constant demonstration counts incur an ambiguity penalty.
- `50-portfolio.js`: per-search diagnostics, correct unrun-module accounting when the planner invokes its extra `deepen` action, and a budget guard: bidirectional search runs by default only when earlier solvers have no demonstration-fitting hypothesis with valid predictions for every test input. Existing ranking is preserved. Direct `BIDI.generate(ctx)` remains available for unrestricted composition experiments; this guard deliberately trades some exploration of ambiguous tasks for protection of the existing portfolio's budget.
- `90-engine.js`: exposes `SCENE`, `BIDI`, and `REDUCE`; removes the duplicate `rankMode` property.

This extends the existing typed DSL and forward composition. It does not implement macro learning, evolutionary search, a learned neural model, or AGI.

## Verification

```sh
npm test
```

Tests include held-out synthetic examples with different sizes, shapes, colors, and placements; contradictory demonstrations; inverse round trips; assembly conflicts; inference answer isolation; work-bounded repeatability; browser-global integration; and the original retrieval gates. Browser integration is script-level, not a complete visual UI test. The supplied archive omits unrelated application files; this upgrade preserves that limitation.

The benchmark harness has a separate synthetic-corpus test:

```sh
node c4-arc/bench-test.js work/bench-selftest
```

It checks exact scoring across multiple test pairs, retention of failed tasks, persisted prediction commits, resume without recomputation, and rejection of mismatched resume settings. Its synthetic tasks are never included in ARC scores.

## Reproducible measurement

```sh
node c4-arc/bench.js --budget 3 --jobs 2 --out results/run
node c4-arc/bench.js --budget 3 --jobs 2 --without bidirectional,reductions --out results/ablation
node c4-arc/compare.js results/ablation results/run comparison.json
```

`--root` selects another extracted engine directory. `--start` and `--end` select sequential shards; `--ids` selects explicit comma-separated regression checks. Keep the complete 400-task run separate from checks on selected tasks. `--no-policy` disables the supplied planner.

Workers receive demonstrations and test inputs only. A throwing getter protects `test.output`. The parent persists each unscored prediction before comparing it with answers. Every test pair must match exactly for a task to count as top-1 or top-2. Predictions are deduplicated by the unchanged engine. Completed task records allow resume; engine, corpus, policy, budget, and worker settings must match.

The reported `oracle_retained` is a LOWER BOUND on generation coverage: it examines all ranked predictions returned with `collect_all`, after the existing 600-hypothesis reservoir and 150-behavior voting limits. It must not be described as exhaustive oracle coverage. A missing correct retained prediction does not establish that no discarded candidate was correct.

Failure labels report directly observed conditions, not speculative diagnoses of which conceptual skill is missing. Wall-clock budgets can produce different search/refit paths across machines and CPU load; fixed work-cap repeatability tests do not make the entire legacy portfolio deterministic.

`corpus-provenance.json` records that all 400 bundled ARC-1 identifiers match the upstream training split and none match evaluation. Neither those tasks nor the supplied pretrained planner constitute a clean unseen evaluation. New primitives were designed using synthetic examples and the first 80 tasks' demonstrations. A subsequent full development run exposed budget interference and informed the final general scheduling guard. All reported scores are therefore development measurements, with no claim of untouched held-out evaluation.

See `../ARC-UPGRADE-REPORT.md` for actual measured results and limitations.
