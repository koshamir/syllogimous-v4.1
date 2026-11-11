# Syllogimous v5

A relational-integration (RI) trainer in Russian. Every item has exactly as many premises as its difficulty says,
and **every premise is necessary**: without any one of them the answer cannot be derived. Solving an item means
integrating the whole chain, not picking two or three relevant lines out of eight.

Maintained by [koshamir](https://github.com/koshamir), based on [Syllogimous v4 by 4skinSkywalker](https://github.com/4skinSkywalker/Syllogimous-v4).
See [MODIFICATIONS.md](MODIFICATIONS.md) for the changes and attribution. Play it on
[GitHub Pages](https://koshamir.github.io/syllogimous-v4.1/) in a desktop or mobile browser.

> **Honest caveat.** The result in the trainer is not IQ and not a measure of intelligence. Training transfers best
> to similar tasks; growth of fluid intelligence is not promised. The «Контроль переноса» section exists to check
> near transfer on formats that are never trained.

## What v5.1 is

- **Difficulty = number of premises.** The staircase adds a premise after correct answers and removes one after
  errors (≈ 75 % correct); the count can also be set by hand for every task type, and the free mode fixes it.
- **No spare premises.** No distractors and no filler: the exact solver checks that removing any premise leaves
  the conclusion open. "Unknown" items have the same shape with one link turned, weakened or missing.
- **Everything else that loads integration is always on**, even with two premises: three-place relations, exact
  steps, two dimensions in one premise, meta-relations, scattered premise order, mixed wording, red (inverted)
  words.
- **Short wording**: «WCA позже BWA», «KLO левее ZKP», «Все WCA — это BWA». Names are meaningless three-letter
  Latin strings by default.
- **Three answers** — «Следует / Неизвестно / Противоречит» (two answers are available in the settings).
- **One deterministic engine** (`src/app/syllogimous/engine/`, pure TypeScript): an item is fully defined by
  (engine version, family, premise count, parameters, seed). Every answer is computed by an exact solver and
  cross-checked by independent brute force in the tests.
- **16 task types**: same/opposite, three groups, number and time order, linear and circular order, 2D/3D
  directions, space-time, syllogisms, graph comparison, analogies, logical connectives, conditions, hierarchy,
  perspective.
- **Modes**: regular game, free mode, «Конструктор» (build the model from clues, all of them needed),
  «Отображение структур», «Беглость», «Контроль переноса» and «Тренировка дня».

Scientific rationale: [Scientific_Basis_Gf_RI_Transfer_EN.md](Scientific_Basis_Gf_RI_Transfer_EN.md).
Implementation notes, deviations from the specification and audit results: [docs/V5_NOTES.md](docs/V5_NOTES.md),
[reports/cue-audit-v5.md](reports/cue-audit-v5.md).

## Commands

```bash
npm ci
npm start                    # dev server
npm run test:engine          # engine tests (Vitest, Node)
npm run audit                # audit with gates (AUDIT_N=1500 by default; AUDIT_N=300 for a quick run)
npx vitest run --config vitest.stats.config.ts   # generation statistics and sample items per premise count
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
