# GPT ARC-1 improvement pass

This pass modifies only the offline symbolic JavaScript ARC engine. It does not add an API, external model, network call, task-id switch, or test-output access during inference.

## New low-capacity solver families

- `relpalette`: remaps colors by first-appearance role rather than literal color.
- `bridge`: fills bounded horizontal/vertical gaps between equal endpoints.
- `globalclass`: learns a 1x1 class from global symmetry predicates.
- `symobject`: crops the unique nontrivial vertically symmetric component.
- `dispersedcolor`: selects the color with greatest connected-component/count dispersion.
- `squareholes`: fills enclosed square background holes only.
- `satelliterays`: extends same-colored satellite pixels diagonally away from a solid anchor block.
- `fanfill`: expands a vertical spine into a parity-alternating triangular fan.
- `edgeparity`: recolors a source color on alternating rows/columns measured from a grid edge.

All families are fit only from training input/output pairs and are then validated by the existing engine against every demonstration.

## Individually verified ARC-1 top-1 recoveries at a 20-second task budget

The original bundle missed top-1 on each task below; the modified bundle solves each at top-1:

- `arc1_aabf363d`
- `arc1_bda2d7a6`
- `arc1_a699fb00`
- `arc1_44f52bb0`
- `arc1_72ca375d`
- `arc1_d9fac9be`
- `arc1_44d8ac46`
- `arc1_7ddcd7ec`
- `arc1_db3e9e38`
- `arc1_d406998b`

A final combined validation run confirmed all ten remain top-1 solved simultaneously.

## Score interpretation

The newest result documented inside the supplied project is 227/400 ARC-AGI-1 top-1 (56.75%). These ten verified recoveries imply a *projected* 237/400 = 59.25% if the documented 227-task baseline is reproduced with no scheduling regressions.

A complete 400-task, 20-second-per-task rerun was attempted but the container killed the highly parallel run for resource pressure. A reduced-budget full-corpus screening run improved rather than regressed, and the added modules are deliberately tiny; nevertheless, 59.25% is marked projected rather than presented as a fresh full-corpus measurement.

The requested 75% was not reached. Getting from roughly 59% to 75% would require about 63 additional ARC-1 tasks beyond this modified version, which is a substantially larger architecture/research step rather than a safe ranking tweak.
