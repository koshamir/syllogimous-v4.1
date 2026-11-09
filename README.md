# Syllogimous v5

A relational-integration (RI) trainer in Russian: every item requires holding and integrating several relations at
once, and any path to the answer that skips this integration (counting words, a prior over wording, reading the
order from the instructions, a local heuristic) is audited down to chance level.

Maintained by [koshamir](https://github.com/koshamir), based on [Syllogimous v4 by 4skinSkywalker](https://github.com/4skinSkywalker/Syllogimous-v4).
See [MODIFICATIONS.md](MODIFICATIONS.md) for the changes and attribution. Play it on
[GitHub Pages](https://koshamir.github.io/syllogimous-v4.1/) in a desktop or mobile browser.

> **Honest caveat.** The trainer level is not IQ and not a measure of intelligence. Training transfers best to
> similar tasks; growth of fluid intelligence is not promised. The «Контроль переноса» section exists to check
> near transfer on formats that are never trained.

## What v5 is

- **Three answers** — «Следует / Неизвестно / Противоречит»: "Unknown" requires checking every model, guessing
  chance drops to 33 %. A two-answer format is available in the settings.
- **One deterministic engine** (`src/app/syllogimous/engine/`, pure TypeScript): an item is fully defined by
  (engine version, family, level, parameters, seed). Every answer is computed by an exact solver and cross-checked
  by independent brute force in the tests.
- **Generation pipeline**: target answer and bot opinions are drawn first from independent bags, premises are built
  constructively around them, then the solver verifies class, minimal support σ, non-locality and the lure.
- **16 families**: same/opposite, three groups, number and time order, linear and circular order, 2D/3D directions,
  space-time, syllogisms, graph comparison, analogies, logical connectives, conditions, hierarchy, perspective.
- **Adaptive staircase** per family (≈ 75 % correct with three answers), interleaved families, a fingerprint window
  against repeats, explanations after errors (decisive premises, one or two models, the lure, a strategy card).
- **Modes**: regular game, free mode (fixed levels), «Конструктор» (build the model), «Отображение структур»
  (role correspondence between systems), «Беглость» (speed of basic inferences), «Контроль переноса»
  (untrained probes) and «Тренировка дня» (a planned session: 50 / 25 / 15 / 10 % of the minutes).

Scientific rationale: [Scientific_Basis_Gf_RI_Transfer_EN.md](Scientific_Basis_Gf_RI_Transfer_EN.md).
Implementation notes, deviations from the specification and audit results: [docs/V5_NOTES.md](docs/V5_NOTES.md),
[reports/cue-audit-v5.md](reports/cue-audit-v5.md).

## Commands

```bash
npm ci
npm start                    # dev server
npm run test:engine          # engine tests (Vitest, Node)
npm run audit                # cue audit with gates (AUDIT_N=1500 by default; AUDIT_N=300 for a quick run)
npm test                     # Angular unit tests (Karma, Chrome)
npm run build:verify         # production build into dist-validation/
npm run prep-deploy:prod     # production build into docs/ for GitHub Pages
```

## GitHub Pages

GitHub Pages publishes the `docs` folder from the `main` branch. To update the site, run `npm ci` and
`npm run prep-deploy:prod`, then commit and push the updated files. The build keeps `docs/V5_NOTES.md` in `docs`
and provides `404.html` for direct links to Angular routes.

Original version: [Syllogimous v4 by 4skinSkywalker](https://4skinskywalker.github.io/Syllogimous-v4/).

## Attribution-NonCommercial 3.0 Unported (CC BY-NC 3.0)

### You are free to:
#### Share — copy and redistribute the material in any medium or format
#### Adapt — remix, transform, and build upon the material

The licensor cannot revoke these freedoms as long as you follow the license terms.

### Under the following terms:
#### Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.
#### NonCommercial — You may not use the material for commercial purposes.

No additional restrictions — You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits.
