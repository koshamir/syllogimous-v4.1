# Syllogimous v5 — Technical Specification for Claude Code

A redesign of `syllogimous-v4.1` into a relational integration (RI) trainer in which the answer cannot be obtained by a template, the load on relational binding is set explicitly and measured, and formats and structures vary enough that the skill does not get "locked" into a single task type.

The scientific rationale for every decision is in the document "Scientific Basis: Gf, Relational Integration, and Transfer" (provided to the user separately). This file contains only what is needed for implementation, with a short pointer to the reason.

**Language note.** This specification is in English, but the application's UI and all task texts stay in **Russian**. Russian strings quoted below in «guillemets» are the exact UI wording to use; English glosses in parentheses are for your understanding only and must not appear in the UI.

---

## 0. How to work with this document

1. **Execute phases strictly in order.** The user will give commands like "Execute phase 1A". Do not start the next phase without a command.
2. **Every phase ends like this:** all tests green (`npm run test:engine`, then `npm run build:verify`); for phases 1+, `npm run audit` with a report; then a short report to the user: what was done, what numbers the audit produced, which deviations from the spec were made and why. If the repository is under git — one commit per phase (or sub-phase).
3. **Do not overengineer.** It is forbidden to bring back the machinery of the deleted experimental module: "certificates", versioned semantic grammars, IndexedDB repositories, "protected assessment manifests", a Web Worker for regular generation. The engine is a set of pure TypeScript functions + tests. Storage is `localStorage`, as now.
4. **Pure engine.** Everything in `src/app/syllogimous/engine/` — no Angular, DOM, or `localStorage` imports. The Angular layer only calls the engine and stores state.
5. **Determinism.** Any item is fully determined by `(engineVersion, family, level, params, seed)`. No `Math.random()` in the engine and no wall-clock budgets that change the result: only attempt counters.
6. **Language.** UI and task texts — Russian. Code, identifiers, comments — English.
7. **If the spec diverges from the reality of the code** — act in the spirit of the spec and record the deviation in `docs/V5_NOTES.md` (section «Отступления» / "Deviations") in one or two lines.
8. **User data must not be lost.** Old history records, score, and settings must keep loading (see phase 2, migrations).
9. **Karma** (`npm test`) requires Chrome. If it is unavailable — `ng test --watch=false --browsers=ChromeHeadless`; if that is unavailable too — note in the report that Karma was not run. The engine is tested with Vitest and does not depend on a browser.

### Phase map

| Phase | Section | Essence | Result |
| --- | --- | --- | --- |
| 0 | §3 | Remove the experimental mode, Vitest, audit baseline, engine skeleton | App works as before |
| 1A | §4, §5.1–5.2, §5.4 | Engine core, audit, families `groups`, `orderNum`, `orderTime`, `linear` | Gates passed for 4 families |
| 1B | §5.3, §5.5–5.7 | `circular`, `dir2d`, `dir3dSpace`, `dir3dTime`, `syllogism` | Gates passed for 9 families |
| 1C | §5.8–5.10 | `graph`, `analogy`, `binary` | All 12 families on the engine |
| 2 | §6 | Integration: three answers, explanations, staircase, scheduler, stats, strategies | Playable v5 (can start after 1A) |
| 3 | §7 | «Конструктор» (Constructor) mode | Generative model building |
| 4 | §8 | «Отображение структур» (Structure Mapping) mode | Comparing relational networks |
| 5 | §9 | Frames «Условия» (Conditions), «Иерархия» (Hierarchy), «Точка зрения» (Perspective), «Три группы» (Three Groups) | 16 families |
| 6 | §10 | «Беглость» (Fluency) mode | Speed and flexibility of basic inferences |
| 7 | §11 | «Контроль переноса» (Transfer Check) | Untrained probes and charts |
| 8 | §12 | Daily plan, documentation, build | Finished build on GitHub Pages |

### Delivered together with this file

Next to it is the folder `audit-baseline/` (put it in the repository root):

- `legacy-cue-audit.ts`, `legacy-extra-audit.ts` — audit of the v4.1 generators by "bots" that see only the on-screen text. They reproduce the table in section 2.3.
- `proto-constructive-order.ts` — a working prototype of the key v5 method (generation of "answer × cue profile" with constructive lures) for the order family: bots drop to chance level, median generation time 0.2–3 ms.
- `build.mjs`, `stubs/` — builds these scripts with esbuild using Angular stubs. Instructions are in `audit-baseline/README.md`.

---

## 1. Goal and invariants that must not be violated

**Goal.** Every item must require holding and integrating several relations jointly; any path to the answer without such integration (counting words, a prior over wording, reading the order from the instructions, a local heuristic) must yield chance-level accuracy. Additionally — train what research links to Gf: flexible binding under random access order, multi-model reasoning, interference suppression, structure mapping, segmentation (selecting the relevant premises).

| # | Invariant | Why (briefly) |
| --- | --- | --- |
| I1 | Accuracy of every heuristic bot on the generated stream ≤ chance + 5 pp; of the "learned" bot on surface features ≤ chance + 7 pp. Checked automatically (`npm run audit`). | A loophole absorbs the load and forms a narrow routine that does not transfer to other tasks. |
| I2 | From level 4: the answer **cannot be derived** from the premises that mention at least one conclusion entity ("non-locality"), and the minimal support σ ≥ 3. | The WM–Gf link rests on flexible binding, which cannot be replaced by local chunking. |
| I3 | By default the answer is ternary: «Следует / Противоречит / Неизвестно» (Follows / Contradicts / Unknown). Classes balanced ≈ 1/3. | "Unknown" requires checking all models, not one preferred one; guessing chance drops from 50% to 33%. |
| I4 | Difficulty is multidimensional (σ, width, arity, convergence, indeterminacy, distractors, lures), not "number of premises". | A long chain is solved by sequential ternary steps and loads memory, not integration. |
| I5 | Variability: topologies (chain/tree/DAG/cycle), wording, names, frames, answer formats; no repeat of a structural "fingerprint" within a window of 50 items. | A skill trained on one material does not transfer even to the same operation on different material. |
| I6 | Frame interleaving: in the regular game, two items of the same family in a row are forbidden (if ≥ 2 families are enabled). | Interleaving forces recognizing the structure rather than repeating the last procedure. |
| I7 | Adaptivity: weighted staircase targeting ≈ 75% correct (3 options) / 80% (2 options). | Prolonged supply–demand mismatch without failure. |
| I8 | After answering — an explanation: decisive premises, counter-model, lure type, strategy hint. | Comparison and a principle after the attempt produce schema abstraction. |
| I9 | Determinism by seed; engine without Angular. | Reproducibility, testability, audit. |
| I10 | Correctness: every answer is computed by an exact solver; for small sizes — cross-checked by an independent brute force in tests. | A wrong item teaches the wrong thing. |
| I11 | Inversions (red words) are a separate "decoding" parameter and do not count as an increase in RI difficulty. | They load reading, not binding. |
| I12 | Honest interface: no "IQ", "percentiles", or promises of intelligence gains. Trainer level ≠ Gf. | Self-deception prevents correcting the training. |

---

## 2. What you need to know about the current code

### 2.1 v4.1 architecture

- Angular 15, NgModule. Root routing: `src/app/app.module.ts` (lazy modules `experimental` and the main one). Main module: `src/app/syllogimous/syllogimous.module.ts`.
- **All generators** are methods of `GameService` (`src/app/syllogimous/services/game.service.ts`): `createDistinction`, `createComparison`, `createArrangement`, `createDirection`, `createDirection3D`, `createGraphMatching`, `createAnalogy`, `createBinary`, `createSyllogismFredo`, `createSyllogismCanyon` (+ `createSyllogismAll`). Type selection — `createRandomQuestion`; progression — `checkQuestion`.
- The "Canyon" generator: `generatePolysyllogism` + the solver `sylIsConsistent`/`sylEntails` in `src/app/syllogimous/utils/syllogism.utils.ts`. The solver (closure of inclusions and disjointnesses with existential import) is a good basis; move it into the engine.
- Texts: `src/app/syllogimous/utils/russian.utils.ts`; helpers: `utils/question.utils.ts`; name pools: `constants/question.constants.ts` (`NOUNS` — 1497 words, `getStrings()` — Latin CVC, `getEmojis()`).
- Item model: `models/question.models.ts` (`Question.isValid: boolean`, `userAnswer?: boolean`); settings: `models/settings.models.ts`, `constants/settings.constants.ts`.
- Progression: `services/progress-and-performance.service.ts` — "training units" of 10 items, premise count ±1 at 90% / 50%; tiers by score ±10 unlock types via `TIERS_MATRIX` (`constants/game.constants.ts`); inversions at tier > 5, meta-relations at tier > 6.
- UI: `pages/game` (display modes 0/1/2, timers 0/1/2), `pages/feedback` (only "Correct/Incorrect"), `pages/stats/*`, `pages/history`, `pages/playground-mode`, `pages/settings`, `pages/tutorial/*`.
- Consumers of the answer fields (`isValid`, `userAnswer`) that must be moved to a shared helper: `pages/feedback/feedback.component.html`, `pages/history/history.component.html`, `pages/start/start.component.ts`, `pages/stats/accuracy-stats/accuracy-stats.component.ts`, `pages/stats/error-analysis/error-analysis.component.ts`, `pages/stats/time-based-stats/time-based-stats.component.ts`, `services/stats.service.ts`, `services/stats-export.service.ts`, `pages/game/game.component.ts` (the adaptive timer uses `premises.length`, `negations`, `metaRelations`).

### 2.2 Why the old generators cannot be "tweaked"

Structurally, all chain-based types produce a **simple chain** of premises, and the conclusion for "Same/Opposite" is always about the endpoints of this chain. False conclusions are built by a different process than true ones, so they have different surface statistics. Patches will not fix this — a single pipeline is needed: "first the target answer and the cue profile, then construction, then verification by the solver".

### 2.3 v4.1 audit (reproduced by the scripts in `audit-baseline/`)

Bots see only the rendered text. Chance with two options is 50%.

| Type | Loophole | Accuracy without integration | Cause |
| --- | --- | --- | --- |
| Same/opposite | Parity of the number of "opposite" across all premises | 100% (66–74% with meta-relations) | Premises are always a simple chain; the conclusion is about its endpoints |
| Number/time comparison | Each word's "win count" | 100% (2–3 premises), 85% (5), 66% (12) | Always a chain; endpoints visible locally |
| Syllogisms "Canyon" | Conclusion quantifier: "All…" valid in 1–8%, "Some… not" in 72–76% | 74–80% from the quantifier alone; atmosphere effect 70–78% | Invalid conclusions are built differently from valid ones |
| Syllogisms "Fredo" | Same | 62–70% | 2 premises + noise |
| Linear and circular order | The instruction line lists items **in their true order** | 100% without reading the premises | `formatArrangementInstruction(words, …)` receives the array in position order |
| 2D directions | "In the adjacent cell" in the conclusion is always true | 100% on 19–31% of items; bot 59–70% | When corrupting the conclusion, `adjacent = false` |
| 2D directions + inversions | Red diagonal when one axis is inverted — **the text is ambiguous** (bug) | 58% of items; exact text-based solver 82–87% | `formatDirectionRelationship` colors the whole diagonal |
| 3D directions | Step larger than the grid → always "false"; "same point" → always "true" | 0% / 100% valid in subgroups | The "+1 step" distortion leaves the bounds |
| Graph comparison | Compare vertex degrees | 97–100% (without meta-relations) | The distortion almost always changes degrees |
| Analogies on order | "Same" with 5+ premises is almost always false | 11–31% valid vs 70–88% | No balancing |
| Logical connectives | XOR/XNOR are more often true | 59–60% | Weak balancing |

### 2.4 Why answer balancing alone is not enough (verified by a prototype)

A prototype for ordering with "greater" and "between" premises: answer-class balancing alone left the "win count" bot at 66–79% against 33% chance. Selecting from a candidate pool with a "deficit" cost overcorrected in the opposite direction (21–28% — also a cue: "do the opposite"). Only this worked: **choose the pair (target answer, desired bot opinion) in advance, independently of each other, then construct premises with constructive lures that realize both, and verify with the solver**. Result: bots at 28–38% against 33% chance, generation p50 0.2–3 ms, p95 7–32 ms (Node, unoptimized). See `audit-baseline/proto-constructive-order.ts`.

---

## 3. Phase 0 — cleanup and infrastructure

### 3.1 Remove the experimental module completely

- Folder `src/app/syllogimous/experimental/` — delete entirely.
- `src/app/app.module.ts` — remove the `experimental` route.
- `src/app/syllogimous/pages/start/start.component.html` — remove the «Экспериментальная тренировка» (Experimental training) button (`routerLink="/experimental"`).
- `src/app/syllogimous/services/legacy-question-generator.adapter.ts` — remove the mention of the experimental mode from the comment (in phase 2 the adapter is deleted entirely).
- `tools/validate-experimental-russian.cjs`, `tools/run-cue-audit.cjs`, `tools/benchmark-generation.cjs` — delete. Keep `tools/finalize-pages.cjs`.
- `tsconfig.audit.json`, `tsconfig.worker.json` — delete; in `angular.json` remove `"webWorkerTsConfig": "tsconfig.worker.json"`.
- `package.json` — delete the scripts `test:core`, `validate:experimental-ru`, `build:audit-core`, `audit:cues`, `benchmark:generation`; rewrite the `validate` script as `npm run test:engine && npm test && npm run build:verify`.
- `reports/` — delete old reports (`cue-audit.json`, `generation-benchmark.json`); keep the folder for new ones.
- `docs/EXPERIMENTAL_REASONING_ARCHITECTURE.md`, `docs/SOURCE_AUDIT_COMPARISON.md`, `docs/STUDY_PROTOCOL_TEMPLATE.md` — delete.
- Do not touch the built bundles in `docs/` (GitHub Pages) yet, so the site does not break; stale hashed files (`721.*`, `722.*`, `12.*`, `syllogimous-generation.*`, old `main.*`/`runtime.*`/`styles.*`) are removed during the rebuild in phase 8.
- One-time cleanup on the user's side: on app start, if `localStorage['SYL_V5_CLEANUP_DONE']` is absent, call `indexedDB.deleteDatabase('syllogimous-experimental')` (in try/catch) and set the flag.
- README and MODIFICATIONS.md: remove the description of the experimental mode (full update in phase 8).
- Check: `grep -ri "experimental" src tools package.json angular.json` finds nothing except this IndexedDB cleanup.

### 3.2 Engine tests with Vitest

- `npm i -D vitest@^1.6.0` (do not touch Karma). Vitest 1.x requires Node ≥ 18; if `node -v` shows 16 — install `vitest@^0.34` and record it in the deviations.
- `vitest.config.ts` in the root: `include: ['src/app/syllogimous/engine/**/*.test.ts']`, `environment: 'node'`. Engine tests are named `*.test.ts` so that Karma (`*.spec.ts`) does not pick them up.
- `vitest.audit.config.ts`: `include: ['src/app/syllogimous/engine/audit/**/*.audit.ts']`, `testTimeout: 600000`.
- Scripts: `"test:engine": "vitest run"`, `"audit": "vitest run --config vitest.audit.config.ts"`.
- Do not touch `tsconfig.app.json` (only what is imported from `main.ts` ends up in the build).

### 3.3 Baseline

- Put `audit-baseline/` in the root, install `esbuild` as a devDependency, run `node audit-baseline/build.mjs audit-baseline/legacy-cue-audit.ts audit-baseline/out/legacy.cjs && node audit-baseline/out/legacy.cjs > reports/legacy-v4.1-audit.txt` (and likewise `legacy-extra-audit.ts`). The numbers must match table 2.3 (±3 pp). If not — tell the user before continuing.
- Create `docs/V5_NOTES.md` with the sections «Базовая линия» (Baseline), «Отступления» (Deviations), «Результаты аудита по фазам» (Audit results by phase).

### 3.4 Engine skeleton

```
src/app/syllogimous/engine/
  core/        rng.ts, types.ts, combinatorics.ts, support.ts, metrics.ts,
               fingerprint.ts, names.ts, presentation.ts
  families/    groups.ts, order.ts, syllogism.ts (+ categorical.ts), linear.ts,
               circular.ts, direction.ts (+ dcs.ts), graph.ts, analogy.ts, binary.ts
               (phase 5: conditional.ts, hierarchy.ts, perspective.ts)
  render/ru/   common.ts + one file per family
  explain/     explain.ts, counter-models.ts
  difficulty/  ladder.ts, staircase.ts, scheduler.ts
  audit/       bots.ts, learned-bot.ts, features.ts, families.audit.ts
  modes/       builder/, mapping/, fluency/      (phases 3, 4, 6)
  probes/      lst.ts, series.ts, graph-visual.ts (phase 7)
  generate.ts  — generation pipeline
  index.ts     — public engine API
```

RNG — a port of the proven xmur3 + sfc32 pair with three independent streams (`semantic`, `presentation`, `scheduler`), so that changing presentation does not change the logical item:

```ts
export class Rng {
  private next: () => number;
  constructor(private readonly seedLabel: string) { const h = xmur3(seedLabel); this.next = sfc32(h(), h(), h(), h()); }
  float(): number { return this.next(); }
  int(n: number): number { return Math.floor(this.next() * n); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[this.int(a.length)]; }
  shuffle<T>(a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  fork(label: string): Rng { return new Rng(`${this.seedLabel}:${label}`); }
}
export const streams = (seed: string) => ({ semantic: new Rng(seed + ':sem'), presentation: new Rng(seed + ':pres'), scheduler: new Rng(seed + ':sch') });
```

**Phase 0 acceptance:** the app builds and works as before (without the experimental button); `npm run test:engine` passes (RNG determinism test); the baseline audit is saved in `reports/`.

---

## 4. Phase 1 — engine core and generator redesign

Split into sub-phases: **1A** — core + audit + families `groups`, `orderNum`, `orderTime`, `linear`; **1B** — `circular`, `dir2d`, `dir3dSpace`, `dir3dTime`, `syllogism`; **1C** — `graph`, `analogy`, `binary`. After 1A you may do phase 2 (integration): families not yet ported are simply disabled in the v5 game — **do not substitute the old generators for them**, they leak.

### 4.1 Types (`engine/core/types.ts`)

```ts
export type FamilyId =
  | 'groups' | 'orderNum' | 'orderTime' | 'syllogism' | 'linear' | 'circular'
  | 'dir2d' | 'dir3dSpace' | 'dir3dTime' | 'graph' | 'analogy' | 'binary'
  | 'groups3' | 'conditional' | 'hierarchy' | 'perspective';        // last 4 — phase 5

export type Answer = 'entailed' | 'contradicted' | 'undetermined';  // «Следует» / «Противоречит» / «Неизвестно»
export type AnswerFormat = 'ternary' | 'binary' | 'choice';
export type LureType = 'none' | 'reversal' | 'possible' | 'nearMiss' | 'surface';

export interface Entity { id: string; name: string }                // id: 'e0'…'e9'
export interface Premise { kind: string; args: string[]; params?: Record<string, number | string | boolean>; inverted?: boolean }
export interface Query   { kind: string; args: string[]; params?: Record<string, number | string | boolean> }

export interface ItemMetrics {
  entities: number; premises: number;
  support: number | null;        // σ — size of the minimal support; null for 'undetermined'
  supportIdx: number[];          // indices of support premises (canonical order)
  width: number;                 // number of entities in support ∪ conclusion
  arityMax: number;              // max arity of support premises (2, 3, 4)
  convergent: boolean;           // support is not a simple chain between the conclusion entities
  nonLocal: boolean;             // conclusion does not follow from premises touching the conclusion entities
  modelsLog2: number;            // log2 of the number of models of all premises (capped)
  distractors: number; attachedDistractors: number;
  negations: number; metas: number; discontinuity: number;   // 0..1
  relaxations: string[];         // which constraints were relaxed during generation
}

export interface Item {
  engineVersion: 'v5.0';
  family: FamilyId; level: number; seed: string;
  entities: Entity[]; premises: Premise[]; query: Query;
  answer: Answer; format: AnswerFormat;
  options?: { id: string; label: string }[]; correctOptionId?: string;  // for 'choice'
  lure: LureType;
  metrics: ItemMetrics;
  displayOrder: number[];                      // permutation of premises for display
  render: { instructions: string[]; notes: string[]; premises: string[]; conclusion: string | string[] };  // HTML
  explanation: Explanation;
  fingerprint: string;
}

export interface Explanation {
  supportDisplayIdx: number[];   // which displayed premises to highlight
  model?: string;                // RU: a model where the answer is evident
  altModel?: string;             // RU: a second model (for 'undetermined' — where the conclusion differs)
  lureNote?: string;             // RU: one line about the lure
  tipId?: StrategyTipId;
}
```

### 4.2 Family interface (`engine/families/*`)

```ts
export interface FamilyPlugin<W> {
  id: FamilyId;
  formats: AnswerFormat[];
  limits: { minEntities: number; maxEntities: number };
  supportDomain: 'restricted' | 'full';   // whether a premise subset can be solved on its own entities only (see 4.4)
  sampleWorld(rng: Rng, p: LevelParams): W;
  buildPremises(rng: Rng, w: W, p: LevelParams, plan: Plan): Premise[];   // constructively, honoring the cue profile
  candidateQueries(premises: Premise[], entityIds: string[], p: LevelParams): Query[];
  classify(premises: Premise[], q: Query, entityIds: string[]): Answer;    // exact
  preferredModel(premises: Premise[], entityIds: string[]): W;              // the "first model that comes to mind"
  holds(q: Query, w: W): boolean;
  describe(w: W, names: Record<string, string>): string;                    // compact model in Russian
  render(d: DraftItem, rng: Rng): Item['render'];
  bots: Bot[];                                                               // small strategies specific to this family
  features(d: DraftItem): Record<string, number>;                             // for the learned bot
}
export interface Plan { target: Answer; cue: Record<string, string>; lure: LureType }
```

Define the auxiliary types yourself by meaning: `LevelParams` (output of the ladder in 4.6), `DraftItem` (`Item` without `render`, `explanation`, `fingerprint`), `Bot` (`{ id: string; predict(d: DraftItem): Answer | string | null }`, `null` = abstained, counted as a guess), `StrategyTipId` (card numbers from Appendix A).

Solvers by default are **exhaustive search with pruning** (small n). The permutation enumerator must check each premise at the moment its last argument is assigned (as in the prototype), otherwise it is slow.

### 4.3 Generation pipeline (`engine/generate.ts`)

```text
generate(spec: { family, level, seed, format, plan, prevNames? }):
  p     = ladder(family, level ± jitter)                 // 4.6
  rngs  = streams(seed)
  for attempt in 1..MAX_ATTEMPTS (60):
    w        = plugin.sampleWorld(rngs.semantic, p)
    premises = plugin.buildPremises(rngs.semantic, w, p, plan)      // builds lures for plan.cue
    for q in shuffle(plugin.candidateQueries(premises, ids, p)):
      if statedDirectly(q, premises): continue                       // same pair/triple and same relation type
      a = plugin.classify(premises, q, ids);       if a ≠ plan.target: continue
      if a ≠ 'undetermined':
        S = minimalSupport(plugin, premises, q, a, p.sigmaMax)       // 4.4
        if !S or |S| < p.sigmaMin: continue
        if p.requireNonLocal and myopic(premises, q) ≠ 'undetermined': continue
        if p.requireConvergent and not convergent(S, q): continue
      if lureOf(q, premises, a) ≠ plan.lure and attempt < MAX/2: continue
      if not botsMatch(plan.cue, premises, q) and attempt < MAX*0.75: continue
      return finalize(...)          // metrics, display order, render, explanation, fingerprint
  fallback: relax in order [cue → lure → requireConvergent → sigma ±1]; record in metrics.relaxations
  if still not found: retry with seed + ':r1' … ':r5'; then throw (this is a generator bug; tests must catch it)
```

- **The target answer is never relaxed** — otherwise class balance breaks.
- **The `choice` format** («Кто третий по величине?» "Who is third largest?", «Кто стоит k-м слева?» "Who stands k-th from the left?"): options are all names + «Нельзя определить» ("Cannot be determined"); the target answer is `entailed` (exactly one entity is correct in all models) or `undetermined` (the correct option is «Нельзя определить») in a 3:1 ratio.

- **`plan` is set by the scheduler** (4.8), not by the generator: the target answer is drawn from a shuffled "bag" {E, C, U}×4 per family, the cue profile from an **independent** bag of desired bot opinions for that family. This independence is exactly what makes the bot's opinion uninformative (see 2.4).
- **`buildPremises` constructs lures constructively** rather than hoping selection finds them. Example for ordering (verified): choose the conclusion pair, then add premises true in the world that touch the conclusion entities so that the "win count" points to the desired bot opinion; check with the solver that the answer, σ, and non-locality are preserved. Lures for each family are described in section 5.
- **`statedDirectly`** — the conclusion may not coincide in entity set and relation type with any premise (including the reverse wording).
- **`finalize`**: display order (4.7), inversions, names, render, explanation (4.9), `fingerprint`.

### 4.4 Minimal support, non-locality, convergence (`engine/core/support.ts`)

- **σ** — the smallest subset of premises S from which the answer follows (`entailed`: S ⊨ q; `contradicted`: S ⊨ ¬q). Search by sizes 1…σmax with early exit; keep the found S for the explanation.
- Speed-up: consider only premises in the connected component of the conclusion entities in the premise hypergraph.
- `supportDomain: 'restricted'` — a subset is solved on its own entities only. Correct for relative relations (greater/less/between, same/opposite, quantifiers, coordinate differences, Boolean rules). For positional worlds (row, circle), "restricted" means an injection of the subset's entities into the **full** set of positions 1…n (the remaining entities can always be seated in free positions) — this is also exact. For hierarchy (direct containment is global) — `'full'`.
- **Non-locality**: `myopic(P, q)` = `classify` on the premises mentioning at least one conclusion entity. An item is non-local if `myopic` = `undetermined` while the full answer is not.
- **Convergence**: S is NOT a simple chain q₀–x₁–…–q₁ of binary premises. In other words, convergence holds if S contains a premise of arity ≥ 3, or an entity of degree ≥ 3, or |S| exceeds the length of the shortest path between the conclusion entities.

### 4.5 Metrics (`engine/core/metrics.ts`)

Fill `ItemMetrics`. `modelsLog2` — by enumeration (capped at 2¹⁶). `distractors` — premises outside S; `attachedDistractors` — those of them sharing an entity with S. `discontinuity` — the share of adjacent (in display order) premise pairs with no shared entity.

### 4.6 Default difficulty ladder (`engine/difficulty/ladder.ts`)

Level L is a real number 1…20. Before each item `L' = L + U(−1, +0.5)` (variability). Parameters are functions of L' (each family clamps them by its `limits` and allowed values):

| Parameter | Formula / values |
| --- | --- |
| `n` (entities) | `clamp(3 + floor((L+1)/3), min, max)` → L1: 3, L2: 4, L5: 5, L8: 6, L11: 7, L14: 8 |
| `sigmaMin` | L<3 → 2; L<10 → 3; L<15 → 4; otherwise 5 |
| `sigmaMax` | `sigmaMin + (L<3 ? 0 : 1)`, no more than the family allows |
| `requireNonLocal` | L ≥ 4 |
| `pTernary` (share of arity-3 premises) | `clamp(0.05·(L−2), 0, 0.5)` |
| `pConvergent` (share of items where convergence is required) | `clamp(0.1·(L−1), 0, 0.8)` |
| `distractors` | L<3 → 0; L<6 → 1; L<10 → 2; otherwise 3 |
| `lureMix` | L<2: only `none`; L<3: +`reversal`; L<5: +`possible`; L<8: +`nearMiss`; otherwise +`surface` |
| `order` | L<6: random; L<10: discontinuous with p = 0.5; otherwise discontinuous 0.7 + adversarial 0.3 |
| `negationRate` | if inversions are enabled: L<7 → 0, otherwise `min(0.3, 0.05·(L−6))` |
| `metaRate` | if meta-relations are enabled: L<10 → 0, otherwise `min(0.3, 0.05·(L−9))` |
| `confusableNames` | L<8 → 0, otherwise `min(0.5, 0.1·(L−7))` |
| `carryOverNames` | L<10 → 0, otherwise `min(0.3, 0.1·(L−9))` |

Key point: **no parameter grows alone** — the ladder raises different dimensions in turn. The numbers are starting values; keep them in one config so the user can edit them.

### 4.7 Presentation (`engine/core/presentation.ts`, `engine/core/names.ts`)

**Premise order:**
- `random` — a random permutation;
- `discontinuous` — greedy: the next premise shares no entities with the previous one, while possible;
- `adversarial` — support premises spread apart (first/middle/last), with distractors between them.

**Names.** The new default pool is **Cyrillic CVC pseudo-words** (like the nonsense syllables in SMART: a rule, not a familiar word). Consonants `БВГДЖЗКЛМНПРСТФХЦЧШ`, vowels `АЕИОУЫЭЮЯ`. Exclude: (a) spelling-rule violations (ЖЫ, ШЫ, ЧЯ, ЩЯ, ЧЮ, ЖЯ, ШЯ, ЖЮ, ШЮ, ГЫ, КЫ, ХЫ, ЦЮ, ЦЯ); (b) real words and abbreviations — file `names.blocklist.ts` (compile as complete a list of three-letter Russian words as possible, including vulgar and obscene roots); (c) pairs differing only in Е/Э or И/Ы, in `distinct` mode. The old pools (`NOUNS`, Latin CVC, emoji) remain as options.

Name modes:
- `distinct` — different first letters within an item;
- `confusable` — pairs with a shared first letter or a one-letter difference (ВОЛ/ВАЛ, ДЕК/ДЕМ);
- `carryOver` — 1–2 names from the previous item in **new roles** (trains disengaging from old bindings); the Angular layer passes `prevNames`.

**Inversions** (a red word = the opposite meaning, as now, CSS class `is-negated`). Only for relations with an explicit antonym pair (больше↔меньше more↔less, раньше↔позже earlier↔later, левее↔правее left↔right, севернее↔южнее north↔south, восточнее↔западнее east↔west, выше↔ниже above↔below, равен↔противоположен same↔opposite, «в одной группе»↔«в разных группах» same group↔different groups, «Все»↔«Ни один» All↔None, etc.). Never for «рядом» (next to), «напротив» (opposite seat), «между» (between). **Fix the 2D bug:** if only one axis of a diagonal is inverted, render it as two components («на 1 шаг <red>южнее</red>, на 1 шаг восточнее» "1 step <red>south</red>, 1 step east"), with only the inverted one in red.

### 4.8 Scheduler inside the engine (`engine/difficulty/scheduler.ts`)

Pure functions over serializable state (stored by the Angular layer):
- target-answer bags per family: shuffled {E, C, U}×4 (for the binary format {E, C}×6);
- desired-bot-opinion bags per family — **independent** of the answer bag;
- lure-type bags according to `lureMix`, **compatible with the target answer**: Follows — {none, surface}; Contradicts — {none, reversal, nearMiss, surface}; Unknown — {none, possible, surface}. The share of `surface` must be equal across all three classes, otherwise the mere co-occurrence of the conclusion words in one premise becomes a cue;
- format: from settings (ternary or binary); families supporting `choice` get up to 20% choice items; the `binary` family is always in binary format;
- family selection: weights `w_f = 1 + 0.5·(L_max − L_f)/max(1, L_max − L_min)`; 0 for the family of the previous item (if ≥ 2 are enabled), ×0.5 if it was two items back;
- a fingerprint window of 50 items: on a match — up to 3 regenerations with a new seed. Fingerprint = family + multiset of premise kinds + canonicalized degree sequence of the premise graph + conclusion kind + answer.

### 4.9 Explanation (`engine/explain/*`)

- `supportDisplayIdx` — S translated into display order.
- `entailed`/`contradicted`: one model (if the answer is uniquely determined — the only one) + highlighting of S.
- `undetermined`: **two** models — one where the conclusion holds and one where it does not.
- Lure type → `lureNote` (Russian UI text): `possible` — «Это верно в одном из возможных миров, но не во всех» ("This is true in one of the possible worlds, but not in all"); `reversal` — «Направление отношения перепутано» ("The direction of the relation is reversed"); `nearMiss` — «Отношение то, но величина (шаг, расстояние) другая» ("The relation is right, but the magnitude (step, distance) differs"); `surface` — «Эти слова стояли рядом в посылке, но связь между ними другая» ("These words appeared together in a premise, but the relation between them is different").
- Models — in Russian, compact, format per family (section 5).

### 4.10 Bots and audit (`engine/audit/*`)

**General bots** (see only the `Item` without the `answer` field):
- `prior` — majority class by (conclusion kind, polarity, inversion), trained on the training part of the sample;
- `myopic` — an exact solver on only the premises touching the conclusion entities;
- `oneModel` — builds `preferredModel` and answers `entailed` if the conclusion holds in it, otherwise `contradicted`; never says "Unknown". **This is not a loophole** (it integrates all premises), so it is excluded from the gates, but reported: among `undetermined` items, the share where it says `entailed` must be 40–60% (half of the "unknowns" are "possible but not necessary" traps);
- `degree` — whichever conclusion entity has more mentions is "greater/further left/…";
- `learned` — multinomial logistic regression (softmax, L2) on `features()` + general features: number of premises of each kind, number of inversions and meta-relations, conclusion kind and polarity, degrees of the conclusion entities, whether they co-occurred in one premise, positions of their first mention, whether they are leaves. Trained on 2·`AUDIT_N` items, tested on `AUDIT_N` other items, at levels 6 and 14.

Sample size is set by the environment variable `AUDIT_N` (default 1,500; for quick checks during development — 300). Target for a full run — 10–15 minutes; if it takes longer than 20 minutes, profile the generator rather than reducing `AUDIT_N`.

**Family-specific bots** — in section 5.

**Gates** (`families.audit.ts`, for each family at levels 2, 6, 10, 14, and 18 where the family supports them, N = `AUDIT_N`; computed on the ternary format; the binary format is a separate run for balance only):

| Check | Threshold |
| --- | --- |
| Class balance | ternary: each class 30–36.7%; binary: 47–53% |
| Each heuristic bot (except `oneModel`) | ≤ majority-class share + 5 pp |
| `myopic` at levels ≥ 4 | ≤ chance + 5 pp |
| `learned` | ≤ chance + 7 pp |
| Relaxations | ≤ 10% of items |
| Generation time (Node) | p95 ≤ 40 ms for regular-game families |
| `choice` format | `degree` and "first mentioned" bots ≤ chance + 7 pp; share of «Нельзя определить» 25% ± 3 pp |

Report — `reports/cue-audit-v5.md` (a table like 2.3, but "before/after") and `reports/cue-audit-v5.json`. A failed gate = a failed phase; fix the generator (lures, stratification), not the threshold.

### 4.11 Correctness tests (`*.test.ts`)

For each family and levels {1, 4, 8, 12, 16}, 300 items each with fixed seeds:
1. Re-classification by the solver matches `answer`; premises are consistent.
2. σ within the target range (or a relaxation is recorded).
3. No premise states the conclusion directly.
4. Render: no `undefined`, `<span>` tags balanced, no Latin characters in visible text except names from the Latin pool.
5. Determinism: same seed → identical item JSON.
6. **Independent oracle** for small sizes (a separate, maximally simple brute-force implementation): `groups` (2ⁿ), `syllogism` (enumeration of Venn-diagram region occupancy for ≤ 4 terms), `dir2d/3d` (enumeration of coordinates in a 0…4 box for n ≤ 4), `graph` (permutations), hand-written fixtures for circle semantics and "between".

---

## 5. Phase 1 families

For each: world → premises → queries → solver → lures and cue control → family bots → model format in the explanation. Texts live in `render/ru/<family>.ts`; templates keep names in the nominative case wherever possible («A больше, чем B»; «A и B стоят рядом»; «Из A, B и C посередине стоит B»). With pseudo-words case endings are invisible; with words from `NOUNS` this noticeably reduces grammatical errors.

### 5.1 `groups` — «Равенство и противоположность» (Same and Opposite; EnumQuestionType.Distinction)

- **World:** `color[e] ∈ {0,1}`, `color[e0] = 0` (symmetry).
- **Premises:** `same(a,b)` «A равен B» (A is the same as B); `opp(a,b)` «A противоположен B» (A is opposite to B); `meta(a,b,c,d, same|opp)` «Отношение A к B такое же, как отношение C к D» / «…противоположно отношению C к D» (the relation of A to B is the same as / opposite to that of C to D) — constraint `(x_a⊕x_b) = (x_c⊕x_d)` or `≠`; arity 4, appears according to `metaRate`.
- **Queries:** `same(a,b)` / `opp(a,b)`; the displayed conclusion word is chosen **independently** of the answer.
- **Topology:** random spanning tree + 0–2 consistent extra edges (cycles) + meta-constraints. The conclusion is never "the endpoints of the only chain". At levels ≥ 4 the premise graph is connected for determined answers; a distractor component exists in both determined and undetermined items, so that "is there a second component" is not a cue.
- **Solver:** enumeration of 2ⁿ⁻¹ (n ≤ 10).
- **Cue control (constructively):** the `parity` bot (parity of all effective "opposite", accounting for inversions) is steered to the desired opinion by adding true `opp`/`same` in branches outside the support; the `degree` bot — via distractors touching the conclusion entities.
- **Family bots:** `parity`, `degree`, `endpoint` (if both conclusion entities are leaves, answers by parity).
- **Model:** «Одна сторона: ВОЛ, ДЕК · Другая сторона: ЗУМ, ПАЙ» (One side: … · Other side: …).

### 5.2 `orderNum` / `orderTime` — «Сравнение чисел» / «Порядок во времени» (Number Comparison / Temporal Order)

- **World:** positions 1…n (rank; greater/later = higher).
- **Premises:** `gt(a,b)` — «A больше, чем B» or, for the same edge, «B меньше, чем A» (time: «позже/раньше» later/earlier); `between(m; a,b)` — unordered «По величине M — между A и B» / «M произошло между A и B» (two models: A<M<B or B<M<A); time only: `succ(a,b)` «A произошло сразу после B» (A happened immediately after B; L ≥ 5), `gap(a,b,k)` «Между A и B произошло ровно k событий» (exactly k events happened between A and B; L ≥ 8); `extreme(a)` «A — самый большой» / «A произошло первым» (A is the largest / A happened first; L ≥ 8, rare).
- **Queries:** `gt`/`lt` (any wording), `between` (L ≥ 6); `choice` format «Кто третий по величине?» (Who is third largest?; L ≥ 3, up to 20% of items, options — all names + «Нельзя определить»).
- **Solver:** permutations with pruning (n ≤ 8); for `supportDomain: 'restricted'` — ranks only among the subset's entities, except `succ/gap/extreme` (with these — injection into the full set of positions).
- **Lures:** `reversal` — the reverse of the necessary relation; `possible` — undetermined but true in the preferred model (entities placed in order of first mention, free slots filled "as you read"); `nearMiss` — for `between`: the wrong middle; `surface` — the pair co-occurred in one `between` premise, but `gt` is asked.
- **Cue control:** as in the prototype — add true comparisons touching the conclusion entities until the `netScore` bot gives the desired opinion; then verify answer, σ, and non-locality.
- **Family bots:** `netScore` ("win count"), `degree`, `subject` (who is the grammatical subject more often).
- **Model:** «ДЕК < ВОЛ < ЗУМ < ПАЙ» (time: «ДЕК → ВОЛ → ЗУМ → ПАЙ, от раннего к позднему» — from earliest to latest).

### 5.3 `syllogism` — «Силлогизмы» (Syllogisms; replaces "Canyon" and "Fredo")

- **Semantics:** classical syllogistics, all named categories are non-empty (existential import), as now. State this explicitly in the lesson.
- **Premises:** `all`, `no`, `some`, `some_not` (the current Russian forms are fine). Inversion — **per premise independently** with probability `negationRate` (currently one flag for the whole item, which is itself a cue).
- **Queries:** any ordered pair of terms × 4 quantifiers, except those stated directly (accounting for the symmetry of `no` and `some`).
- **Classification:** `entailed` — `entails(P, q)`; `contradicted` — `entails(P, ¬q)`; otherwise `undetermined`. Solver — port of `sylIsConsistent`/`sylEntails`; oracle in tests — enumeration of Venn-diagram regions for ≤ 4 terms.
- **Stratification (key):** cells = answer (3) × conclusion quantifier (4) × whether the conclusion agrees with the premises' "atmosphere" (2) × whether the conclusion's subject is the subject of some premise (2). The scheduler picks a cell uniformly among reachable ones; counters are kept per family. This kills the prior "All → false" (currently 74–80%).
- **Construction:** a core chain of length σ from the `SYL_TRUE_CONCLUSIONS` table (for `entailed` it derives q, for `contradicted` ¬q, for `undetermined` it contains one invalid link); distractors are attached to the core terms, and their quantifiers are chosen to produce the required "atmosphere". Verify: consistency, class, exact σ ("no shorter proof" — by the general support search, not by paths).
- **Delete the "Fredo" generator**, remove the generator choice from settings (ignore the `SYL_SYLLOGISM_GENERATOR` key). Classic two-premise syllogisms = levels 1–2 of the new generator.
- **Family bots:** `atmosphere` (Woodworth–Sells), `quantifierPrior`, `matching` (conclusion quantifier matches the quantifier of a premise sharing a term → "follows"), `conversion` (illicit conversion "all A are B" ⇒ "all B are A", "some A are not B" ⇒ "some B are not A", then the solver), `figural` (term order).
- **Explanation:** support + for `undetermined` a counterexample built from "witness objects": one witness per term, per each `some`/`some_not`, and for ¬q; memberships — upward closure along inclusions, exclusions — along disjointnesses; the model is checked by direct substitution, on failure only the support is shown. Text: «Возможен мир: объект 1 — ВОЛ и ДЕК, не ЗУМ; объект 2 — ДЕК и ЗУМ» (A possible world: object 1 is ВОЛ and ДЕК, not ЗУМ; object 2 is ДЕК and ЗУМ).

### 5.4 `linear` — «Линейный порядок» (Linear Order)

- **World:** positions 1…n left to right (from the observer's viewpoint).
- **Premises:** `left` «A стоит левее, чем B» (A is to the left of B); `immLeft` «A стоит сразу слева от B» (immediately left of); `adj` «A и B стоят рядом» (next to each other); `notAdj` «A и B стоят не рядом» (L ≥ 4); `between` «Из A, B и C посередине стоит B» (of A, B and C, B is in the middle; not necessarily adjacent); `dist` «A и B разделяют ровно k человек» (exactly k people between A and B; L ≥ 5); `steps` «A стоит на k позиций левее, чем B»; `end`/`notEnd` «A стоит с краю / не с краю» (at an end / not at an end; L ≥ 6); `pos` «A стоит k-м слева» (k-th from the left; only L ≤ 9, rare).
- **Queries:** the same kinds except `pos`; `choice` format «Кто стоит k-м слева?».
- **Leak fix:** the instruction «Участники: …» (Participants: …) lists the names **in alphabetical order** with the note «(порядок в списке — алфавитный)» (list order is alphabetical). Stop filling the `question.rule` field with the order.
- **Lures:** `reversal` (side), `nearMiss` (k ± 1 in `steps`/`dist`), `possible`, `surface`.
- **Family bots:** `instructionOrder` (reads the order from the instruction — must be at chance), `relationTypePrior`, `stepMagnitude` (conclusion k vs the maximum k in the premises), `degree`.
- **Model:** «[ДЕК] [ВОЛ] [ЗУМ] [ПАЙ]» left to right.

### 5.5 `circular` — «Круговой порядок» (Circular Order)

- **World:** n seats at a round table, everyone faces the center. Convention in the instruction text: «„Слева от A“ — с точки зрения A, сидящего лицом к центру» ("Left of A" — from the viewpoint of A, who faces the center). Technically: seats are numbered clockwise (top view), the left neighbor = the next seat clockwise.
- **Premises:** `immLeft`/`immRight`; `adj`, `notAdj`; `opposite` «A сидит напротив B» (A sits opposite B; n even); `gap` «Между A и B по короткой дуге ровно k человек» (exactly k people between A and B along the shorter arc); `between` «B сидит между A и C» (= A and C are both neighbors of B).
- **Solver:** e0 fixed at seat 0, enumerate the rest ((n−1)! ≤ 5040).
- **Instruction leak** — fix the same way as in 5.4 (alphabetical).
- **Family bots:** `instructionOrder` (cyclic), `relationTypePrior`, `degree`.
- **Model:** «По часовой: ДЕК → ВОЛ → ЗУМ → ПАЙ → (ДЕК)» (Clockwise: …).

### 5.6 `dir2d` — «Направления 2D» (2D Directions)

- **World:** integer coordinates (x — east, y — north); coinciding cells are allowed unless stated otherwise.
- **Premises:** exact — «A на 2 шага севернее и на 1 шаг восточнее, чем B» (A is 2 steps north and 1 step east of B), «A в соседней клетке к северо-востоку от B» (A is in the adjacent cell to the northeast of B; |dx|, |dy| ≤ 1); qualitative — «A севернее, чем B» (north of; yA > yB, any x), «A северо-восточнее, чем B» (northeast of; both axes), «A строго севернее, чем B» (strictly north of; yA > yB, xA = xB), «A и B на одной вертикали / горизонтали» (on the same vertical / horizontal).
- **Note in the item** (instead of the current «Направления точные…»): «„Строго севернее“ — на той же вертикали. „Севернее“ — выше по карте, по горизонтали где угодно» ("Strictly north" — on the same vertical. "North" — higher on the map, anywhere horizontally).
- **Solver:** per axis — a difference-constraint system (`dcs.ts`): variables are coordinates, constraints `x_a − x_b ≤ c` (equalities as two inequalities, strict ones via ±1); Floyd–Warshall gives each pair a range `[lo, hi]` (±∞ possible). A single-axis query is a set of allowed differences: follows if `[lo, hi] ⊆ allowed`; contradicts if the intersection is empty; otherwise unknown. A two-axis query is a conjunction: follows if both follow; contradicts if at least one contradicts; otherwise unknown (axes are independent).
- **Fixes:** (1) the phrase «в соседней клетке» (in the adjacent cell) and step magnitudes are distributed identically across all answer classes (stratification by phrase type and step-magnitude bucket); (2) false and undetermined conclusions draw step magnitudes from the same distribution as true ones; (3) diagonal rendering under partial inversion — see 4.7.
- **Family bots:** `adjacencyPhrase` ("adjacent cell" → follows), `stepMagnitude` (conclusion step larger than the maximum in the premises → contradicts), `axisCount`.
- **Model:** a mini-map (CSS grid in the explanation); for "unknown" — two maps.

### 5.7 `dir3dSpace` / `dir3dTime` — «Направления 3D» / «Пространство и время» (3D Directions / Space and Time)

Same as 5.6 plus a third axis: space — «выше/ниже на k уровней» (k levels above/below), «на одном уровне» (on the same level); time — «позже/раньше на k часов» (k hours later/earlier), «одновременно» (simultaneously). The same solver on three axes. Fix the cues: falsity no longer arises from going outside the grid, and "same point" no longer automatically means "true".

### 5.8 `graph` — «Сравнение графов» (Graph Comparison, v2)

Two subtypes, alternating:
- **`iso` (binary):** «Проверь, одинаково ли устроены две сети» (Check whether the two networks are structured the same way). Positives — renaming + permutation + reverse wordings in the second network («B получает от A» "B receives from A" = A → B). **Negatives — degree-preserving rewiring:** pick two edges of the same type `u1→v1`, `u2→v2` with four distinct endpoints, replace them with `u1→v2`, `u2→v1` without duplicates; 1–3 times; require non-isomorphism (exact check) while the multiset of signatures (in, out, mutual) and the edge count of each type match.
- **`map` (choice):** «Найди во второй сети участника с той же ролью, что X в первой» (Find the participant in the second network with the same role as X in the first). The image of X is unique under all isomorphisms (enumerate isomorphisms by search with signature-based pruning). From L ≥ 6 the target is "indirect": its degree signature is shared by at least one other vertex.
- **World:** directed graph, n = 4…8, edges n−1…⌊1.8n⌋; from L ≥ 6 a "↔" type is added.
- **Remove meta-relations in graphs.**
- **Family bots and thresholds:** `iso`: `degreeSequence`, `edgeTypeCount` ≤ 55%; `map`: `signature` (a random vertex with the same signature) ≤ 1/(average class size) + 5 pp, at L ≥ 6 average class size ≥ 2; `firstMention` (the vertex with the same first-mention index) ≤ 1/n + 5 pp.
- **Model:** a correspondence table «A ↔ K, B ↔ M, …».

### 5.9 `analogy` — «Аналогии» (Analogies)

- **Base world** — one of the enabled: `groups`, `orderNum`, `orderTime`, `linear`, `circular`, `dir2d`.
- **Query:** «Отношение A к B такое же, как отношение C к D?» (Is the relation of A to B the same as that of C to D?) with an explicit definition of "the same" for the base: groups — same/different side; order — sign; row — side **and** distance; circle — clockwise distance; map — displacement vector.
- **Neither pair is stated directly**; from L ≥ 4 each requires σ ≥ 2. If at least one pair is undetermined such that the comparison is undetermined — the answer is "unknown".
- **Wording** («такое же» same / «отличается» different) is chosen independently of the answer; stratification by (base × wording × answer).
- **Family bots:** `wordingPrior` (by base and wording), `cooccurrence`.
- **Model:** the base-world model with the pairs highlighted.

### 5.10 `binary` — «Логические связки» (Logical Connectives)

- Two sub-items from the engine (from different families when possible), each with a determined answer, at level `max(1, L − 3)`; names do not overlap; premises shuffled together; instructions merged.
- Connective — from the enabled ones; the result by truth table. Stratification by (connective × result × sub-answer combination TT/TF/FT/FF) — uniform over reachable cells. This removes the XOR/XNOR skew (59–60% now).
- Format — **binary only** («Верно/Неверно» True/False).
- **Family bots:** `operatorPrior`, `firstOnly` (evaluates only the first statement).

**Phase 1 acceptance (each sub-phase):** correctness tests 4.11 green for the ported families; `npm run audit` passes all gates in 4.10; `docs/V5_NOTES.md` contains a "before/after" table for each ported family ("before" taken from `reports/legacy-v4.1-audit.txt`).

---

## 6. Phase 2 — integrating the engine into the game

### 6.1 `EngineService` (`src/app/syllogimous/services/engine.service.ts`)

- Stores in `localStorage`: `SYL_V5_SETTINGS`, `SYL_V5_LEVELS` (per family: `{ level, count, last20: ('ok'|'err'|'timeout')[] }`), `SYL_V5_SCHEDULER` (bags, fingerprint window), `SYL_V5_LEVEL_HISTORY` (daily snapshot of levels). Add all keys to `LS_PROPS`.
- `next(): Item` — selects family, plan, level, and seed (`${sessionSeed}:${counter}`), generates, and **immediately prepares the next one** (via `setTimeout(…, 0)`) so there is no delay.
- `submit(item, response, rtMs)` — updates the staircase, bags, history.

### 6.2 Item model and compatibility

- Add optional v5 fields to the `Question` class: `engineVersion`, `family`, `format`, `correct` (answer or option id), `userChoice`, `level`, `seed`, `metrics`, `lure`, `explanation`, `options`. For display, fill the old fields: `premises`, `conclusion`, `instructions`, `notes`, `type` (mapping FamilyId → `EnumQuestionType`), `negations`, `metaRelations`. For the binary format, additionally `isValid`/`userAnswer`.
- New file `utils/answer.utils.ts`: `isCorrect(q): boolean | undefined` (v5 — `userChoice === correct`; old records — `userAnswer === isValid`; unanswered — `undefined`) and `isTimeout(q)`. Move **all** places listed in 2.1 onto them (history, start, stats, export, feedback page).
- Old history (without `engineVersion`) must still display and count in statistics.

### 6.3 `GameService`

- `play()`/`createRandomQuestion()` → via `EngineService`. `checkQuestion(choice?: string)`.
- Replace the training units (`ProgressAndPerformanceService.getTrainingUnit` and the 90/50 thresholds) with a staircase: after a correct answer `L += s`, after an error or timeout `L −= s·p/(1−p)`; p = 0.75 (3 options), 0.80 (2 options), 0.70 (choice among ≥ 4); s = 1.0 for the first 15 items of a family, then 0.5; L ∈ [1, 20].
- Remove the "More/fewer premises" modal; notify with a toast only when the integer part of a family's level has changed by 2 or more since the last notification. Keep the tier-change modal.
- Migration: a family's initial level = `clamp(premises − 1, 1, 10)` from the old `SYL_TRAINING_UNIT:<type>`, otherwise 1.
- Keep tiers and score (±10); extend `TIERS_MATRIX` for the new types (phase 5 — unlocked at tier 6–7).
- Once all families are ported (after 1C), delete the old `create*` methods, `legacy-question-generator.adapter.ts`, `utils/syllogism.utils.ts` (the solver is already in the engine), and whatever is unused in `question.utils.ts`. Rewrite `services/game.localization.spec.ts` for the engine: keep the name-pool tests, delete the old generator tests.

### 6.4 Item screen (`pages/game`)

- `answer-buttons` component: ternary — fixed order «Следует» (green) · «Неизвестно» (gray) · «Противоречит» (red), keys `1/2/3` and `←/↓/→`; binary — «Верно/Неверно» (side still random); choice — chips with names (+ «Нельзя определить», if present).
- Response time is measured from item display to answer; the explanation and pauses are not included.
- Keep display modes 0/1/2 and timers. Adaptive timer (type 2): `T = clamp(median RT of the last 10 items of the family at level ±2 × (1 + 0.15·(σ − σ̄)) + 2·negations, 15, 180)` seconds.

### 6.5 Result screen (`pages/feedback`) — explanation

- Verdict and the correct answer in words.
- Explanation panel (setting: always / errors only / never; default — errors only): list of premises with the support highlighted (class `is-support`), the model (or two models for "unknown") in compact form, a line about the lure, a link to the strategy card.
- `Enter`/`Space` — next item.

### 6.6 Settings

New card «Тренировка» (Training): answer format (3 options / 2 options); target accuracy (70–85%, step 5; sets p for three options, for two options p + 0.05 is used, for choice — p − 0.05); staircase step (0.25 / 0.5 / 1); explanation; name pool (Cyrillic pseudo-words / Latin / words / emoji); inversions on/off; meta-relations on/off; name mode (by level / always distinct). Remove: «Размер серии» (unit size), promotion/demotion thresholds, «Генератор силлогизмов» (syllogism generator). Keep everything else (display mode, timer, accessibility, time goals).

### 6.7 Playground mode (`pages/playground-mode`)

Per family: enabled + **fixed level 1–20** instead of premise count; global parameters as in settings; staircase disabled, levels in the regular game do not change.

### 6.8 Statistics

The old pages work through `isCorrect`. Add: family levels over time (lines); accuracy by answer class (Follows / Contradicts / Unknown — low accuracy on "Unknown" means single-model reasoning); errors by lure type; response time by σ.

### 6.9 Strategies and lessons

- New page «Стратегии» (Strategies) with the cards from Appendix A; hints in the explanation link to it.
- Wire any new screen (here and in phases 3, 4, 6, 7) the same way as existing ones: a value in `EnumScreens` (`constants/game.constants.ts`), a route in `syllogimous.module.ts`, a Russian label in the screen map in `utils/russian.utils.ts`, an entry point from the start page.
- Update the lessons: what the three answers mean (with an "unknown" example), "strictly" and "somewhere" in directions, the "left" convention at the round table, existential import in syllogisms, the new premise kinds, alphabetical order in the participant list.
- On the start page, a short honest line: «Уровень в тренажёре — не IQ» (Trainer level is not IQ).

**Phase 2 acceptance:** game, playground, statistics, and history work on old and new data; unit tests: (a) staircase — a simulated learner with `P(correct | L) = chance + (1 − chance)/(1 + e^(L−θ))` converges to 75% ± 3% within 300 items; (b) scheduler — no two items of the same family in a row, distribution matches weights; (c) migration of old keys; (d) `isCorrect` on old and new records. `npm test` and `npm run build:verify` green.

---

## 7. Phase 3 — new mode «Конструктор» (Constructor)

**Why.** The answer is not a button but a constructed model: it cannot be guessed and integration cannot be bypassed. Difficulty is set by how many clues must be held simultaneously to make the next deduction (relational complexity theory) and by whether hypotheses with backtracking are required. The format is close to LSAT logic games (grouping and ordering under complex rules) — an intensive course on such tasks was accompanied by gains in visuospatial reasoning and strengthened fronto-parietal connectivity (quasi-experiment, no randomization).

### 7.1 Worlds

| Type | Size | Number of worlds (for enumeration) |
| --- | --- | --- |
| `line` — a row | n = 4…7 | up to 5,040 |
| `circle` — a round table | n = 5…7 | up to 720 |
| `groups` — 2–3 named groups with declared sizes | n = 5…8 | hundreds |
| `lineAttr` — row + color (2–3 colors, each used) | n = 4…5 | up to ≈ 18,000 |
| `grid` — 3×3 grid, 5 participants, empty cells | n = 5 | 15,120 |

### 7.2 Clues

- Binary: left of, immediately left of, next to, not next to, at an end, not at an end, k-th from the left (low levels only), in the same group, in different groups, color, not this color, in the same row/column, above, left in the row.
- Ternary: «Из A, B и C посередине — B» (of A, B and C, B is in the middle); «A ближе к B, чем к C» (A is closer to B than to C); «A и B по разные стороны от C» (A and B are on different sides of C); «Рядом с A сидит ровно один из B и C» (exactly one of B and C sits next to A).
- Conditional: «Если A в группе Альфа, то B — в группе Бета» (if A is in group Alpha, B is in group Beta); «Если A стоит с краю, то B стоит рядом с C» (if A is at an end, B is next to C).
- Quantitative: «Между A и B ровно k человек» (exactly k people between A and B); «В группе Альфа ровно двое из A, B, C» (exactly two of A, B, C are in group Alpha); «Синих ровно двое» (exactly two are blue).

### 7.3 Generation

1. Enumerate all worlds of the chosen type once (cache) and randomly pick the true world W.
2. Build a pool of clues true in W (all templates over entity tuples; conditionals — sampled).
3. **Bitsets:** for each clue — a bitset of the worlds where it is true (`Uint32Array`). Intersection is bitwise AND, which makes the subsequent search cheap.
4. Greedily add the clue maximizing `log2(|M| / |M ∧ c|) × type_weight(c, L)` (random choice among the top three) until one world remains.
5. Minimize: remove any clue without which the solution remains unique.
6. Add redundant true distractor clues according to level.
7. **Deduction trace:** facts are "entity → position / group / color". While not all facts are known: find the smallest k and a subset of k clues which, together with the already known facts, fixes a new fact; record the step. If there is none up to `kMax` — a hypothesis step (case analysis needed), `caseSplit = true`. Metrics: `entryK` (k of the first step), `maxK`, number of steps, `caseSplit`, shares of ternary and conditional clues.
8. Accept if the metrics are within the level target, otherwise a new attempt (≤ 30), then relaxation with recording.

| Level | World | Clues | Metric target |
| --- | --- | --- | --- |
| 1–3 | line 4–5 | binary only | maxK ≤ 2, no hypotheses |
| 4–6 | line 5–6 | ≥ 1 ternary | maxK 2–3, from L5 entryK ≥ 2 |
| 7–10 | line 6–7, circle, groups | + conditional, 1 distractor | maxK 3 |
| 11–14 | lineAttr, grid | 1–2 distractors | maxK 3–4, entryK ≥ 2 |
| 15–20 | any | all types | one hypothesis allowed, maxK 4 |

### 7.4 Item variants

- `build` (70%) — place everyone.
- `mustBe` (15%) — which of 4 statements must be true (exactly one).
- `count` (15%) — how many arrangements satisfy the clues: 1 / 2 / 3 / 4+ (the clue set deliberately leaves the required number).

### 7.5 Interface

A board matching the world type (row cells, seats at a table, group columns, grid), participant chips, "tap a chip → tap a cell" (convenient on a phone), «Отменить» (Undo), «Сбросить» (Reset), «Проверить» (Check). The first check reports only **how many** are placed correctly; the second gives the full explanation: wrong placements, violated clues, the step-by-step deduction trace («Шаг 1. Подсказки 2 и 5: ВОЛ может стоять только третьим» — "Step 1. Clues 2 and 5: ВОЛ can only be third").

### 7.6 Staircase and performance

Solved on the first check — success; on the second — the level does not change; not solved — error. A separate staircase for the mode, target 70%. Generate the next puzzle while the explanation is shown; if in the browser p95 > 300 ms — move generation to a Web Worker (`ng generate web-worker`), otherwise keep it on the main thread.

**Phase 3 acceptance:** tests — uniqueness of the solution, minimality (every clue is needed, except declared distractors), consistency of the deduction trace, metrics within level targets; the "clues one at a time" bot (filters domains by each clue separately, then guesses) solves no more than 10% of puzzles at levels ≥ 5; generation p95 ≤ 400 ms (Node).

---

## 8. Phase 4 — new mode «Отображение структур» (Structure Mapping)

**Why.** This is the level of "relations between relational networks" (MDML, level 5), which v4.1 lacks entirely. The task of finding role correspondence between two graphs is one of the strongest simple indicators of Gf (loading .75 on Gf, nearly as high as reasoning tests themselves; r ≈ .61 with Raven), and comparing structures with different "coverage" yields schema abstraction.

### 8.1 Item kinds

- `map` (60%): two systems with different vocabulary and names; «Кто во второй системе играет роль X?» (Who in the second system plays the role of X?) — choice among all participants of the second system.
- `iso3` (20%): three systems; «Какая из систем 2 и 3 устроена так же, как система 1?» (Which of systems 2 and 3 is structured like system 1?) — exactly one is isomorphic, the other is a lure with the same degree set (rewiring from 5.8).
- `anchor` (20%): a graph with non-trivial symmetry; one correspondence is given («X соответствует K» — X corresponds to K), which breaks the symmetry; «Кому соответствует Y?» (Whom does Y correspond to?).

### 8.2 Systems and vocabulary

Directed graphs, n = 4…8, edges n−1…⌊1.8n⌋; from L ≥ 8 — two relation types. Vocabulary (pairs with reverse wordings): «пишет письма» / «получает письма от» (writes letters to / receives letters from); «обучает» / «учится у» (teaches / learns from); «охотится на» / «служит добычей для» (hunts / is prey for); «передаёт сигнал» / «получает сигнал от» (sends a signal to / receives a signal from); «руководит» / «подчиняется» (manages / reports to); symmetric — «дружит с» (is friends with), «соседствует с» (neighbors), «работает вместе с» (works with). The second system uses different vocabulary (from L ≥ 4 — often the reverse wording), different names, and its own random statement order. From L ≥ 12 the correspondence of relation types is permuted (the first relation of the second system corresponds to the second of the first) — it must be inferred from the structure.

### 8.3 Correctness and difficulty

- The target's image is unique under all isomorphisms (including bijections of relation types); for `anchor` — unique given the anchor correspondence.
- Staircase: n, edges, share of "indirect" targets (degree signature not unique), reverse wordings, two types, type permutation, similar names. Target 70%.
- Bots at chance: `signature`, `firstMention`, `wordPosition`, `degreeSequence` (for `iso3`).

### 8.4 Explanation and interface

A correspondence table + highlighting of the links that distinguish the target from its "double". Systems as side-by-side cards (stacked on a phone). Text only: the visual version with drawn graphs is a transfer probe in phase 7 and must not be trained.

**Phase 4 acceptance:** tests of uniqueness and correctness of correspondences (oracle — permutation enumeration), bot gates, a separate staircase for the mode.

---

## 9. Phase 5 — new frames

RFT identifies relation families that v4.1 lacks: hierarchy, condition/cause, deictic ("I–you", "here–there"). Each is a new engine family following contract 4.2, with tests 4.11, gates 4.10, a lesson, and a new value in `EnumQuestionType`. Unlocked at tier 6–7.

### 9.1 `conditional` — «Условия» (Conditions)

- **World:** Boolean values of n = 3…7 "lamps": «Лампа ВОЛ горит / не горит» (Lamp ВОЛ is on / off).
- **Premises:** «Если горит A, то горит B» (if A is on, B is on; and variants with «не горит» in any part); «A горит, только если горит B» (A is on only if B is on ≡ if A then B); «Горит A или B (возможно, обе)» (A or B is on, possibly both); «Горит ровно одна из A и B» (exactly one of A and B is on); «A и B не горят одновременно» (A and B are not both on); «A горит тогда и только тогда, когда горит B» (A is on if and only if B is on; L ≥ 6); facts «A горит» / «A не горит».
- **Queries:** a literal («C горит») and a conditional statement («Если B горит, то D не горит»).
- **Solver:** enumeration of 2ⁿ.
- **Lures:** affirming the consequent (from "if A then B" and "B" — "A"), denying the antecedent, reversed "only if", `possible`.
- **Family bots:** `matching` (the literal is the consequent of a rule whose antecedent is a true fact → "follows"), `polarity` (by the count of «не»).
- **Model:** «Горят: A, C · Не горят: B, D» (On: … · Off: …).

### 9.2 `hierarchy` — «Иерархия» (Hierarchy)

- **World:** a forest "part → immediate whole" over n ≤ 6 entities; each part has at most one immediate whole.
- **Premises:** «A — часть B» (A is part of B, at any depth); «A непосредственно входит в B» (A is directly part of B; L ≥ 4); «A — не часть B»; «A и B непосредственно входят в одно и то же целое» (A and B are direct parts of the same whole); «A ни во что не входит» (A is part of nothing).
- **Key non-local inference:** if A is part of B and A is part of C, then B is part of C or C is part of B. The generator must regularly require exactly such inferences.
- **Queries:** «A — часть B» / «A — не часть B».
- **Solver:** enumeration of parent arrays, discarding cycles; `supportDomain: 'full'`.
- **Model:** an indented tree.

### 9.3 `perspective` — «Точка зрения» (Perspective)

- **World:** n = 3…6 people in a row (positions left to right from your viewpoint), each facing you or with their back to you.
- **Premises:** «Для A справа стоит B» (for A, B is on the right; if A has their back to you, that is your "right"; if A faces you — your "left"); «A и B смотрят в одну сторону / в разные стороны» (A and B face the same / different directions); «A стоит лицом к тебе» (A faces you); «Для тебя A левее, чем B» (for you, A is left of B). No pronouns, so as not to depend on the gender of names.
- **Queries:** a relation from the viewpoint of any participant or yours, facing direction.
- **Solver:** n! · 2ⁿ.
- **Family bots:** `egocentric` (reads every "for X" as "for you") — must be at chance; `word`.
- **Model:** «[ВОЛ ↑] [ДЕК ↓] [ЗУМ ↑]» (↑ — back to you, ↓ — facing you).

### 9.4 `groups3` — «Три группы» (Three Groups)

Like `groups`, but with three groups: «A и B в одной группе» (same group) / «A и B в разных группах» (different groups). "Different groups" is not transitive, so "unknown" arises naturally in a connected graph (A≠B, B≠C ⇒ A vs C unknown). Solver — 3ⁿ with symmetry breaking.

---

## 10. Phase 6 — «Беглость» (Fluency) mode

**Why.** Automate basic inferences (mutual and combinatorial entailment) and the flexibility of contextual control, to free resources for deep integration. Honestly: the speed of such inferences is trainable, but transfer to Gf is not proven. Share of training — 10–15%.

- Blocks of 30 items, binary answer only, σ = 2, 2–3 premises, determined answers; families alternate on every item.
- Per-family deadline D, start at 7 s, bounds 1.5–15 s: correct within the deadline → `D ×= 0.97`; error or timeout → `D ×= 1.19` (equilibrium ≈ 85% correct).
- Scoring — the "signed residual time" rule: per item `S = (2x − 1)·(D − t)/D` (x = 1 if correct, t — time). Fast errors are penalized; guessing does not pay.
- **Contextual-control blocks** (every third): relation words are replaced by arbitrary pseudo-words (e.g., «ВУЛ» = more, «ТЭК» = less; new pairs per block), with a 10-second legend before the block and on holding `L`. Frame color is the context: blue — normal meaning, orange — meanings swapped; the color changes on each item with probability 0.3.
- Feedback — only a brief color flash; a summary at the end of the block; separate statistics (deadline per family, accuracy, points).

---

## 11. Phase 7 — «Контроль переноса» (Transfer Check) and analytics

**Why.** Far transfer, if it exists, goes through near transfer. Formats that are **never trained** are needed to see real transfer rather than skill growth inside the trainer.

- Section «Контроль переноса», reminder every 14 days. Session about 15 minutes, **no feedback**, separate storage `SYL_V5_PROBES`, does not affect levels.
- Probes (alternate forms by seed `probe:<date>`, difficulty balanced across sessions):
  1. **4×4 Latin square**, 10 items: choose the shape for the "?" cell from 4. An item's relational complexity = how many rows and columns with visible cells must be considered jointly to determine the cell (1 / 2 / 3) — compute by enumerating subsets of lines.
  2. **Number series**, 8 items: arithmetic and geometric progressions, two interleaved progressions, second differences, "Fibonacci-like"; the answer is a number.
  3. **Visual graph mapping**, 8 items: two drawn (SVG) graphs with random layout, one- and two-way arrows; click the vertex in the second graph corresponding to the highlighted one in the first. Difficulty: 3–6 edges, crossings, indirect targets.
- Results screen: a chart per probe over time + a manual log of external tests (name, date, score, note).
- Explanatory text: «Рост здесь — ближний перенос. Если его нет 4–6 недель, роста Gf ждать не стоит — меняй смесь режимов» ("Growth here is near transfer. If there is none for 4–6 weeks, don't expect Gf growth — change the mode mix").

---

## 12. Phase 8 — daily plan, documentation, build

- **«Тренировка дня» (Today's training):** one button on the start page launches a planned session (default 30 minutes): regular game 50% → «Конструктор» 25% → «Отображение структур» 15% → «Беглость» 10%. Duration and shares — in settings. Time goals (day/week) are counted from this.
- README: what v5 is, the modes, a link to the scientific basis, an honest caveat, the commands `test:engine`, `audit`, `build:verify`, `prep-deploy:prod`.
- MODIFICATIONS.md: attribution to 4skinSkywalker, CC BY-NC 3.0, list of v5 changes (experimental mode removed, new engine, modes).
- `docs/V5_NOTES.md`: final "before/after" audit table, deviations.
- Build: delete stale hashed files from `docs/`, `npm run prep-deploy:prod`, check `404.html`.
- Phone check: no generation lag, answer buttons ≥ 44 px, keyboard operation, contrast; answer buttons labeled with text, not only color.

---

## Appendix A. Strategy cards and hints

The card texts in the UI are in Russian; translate these faithfully into Russian when implementing.

1. **One model.** Assemble all premises into a single picture (row, map, groups) instead of holding them as separate facts.
2. **Start with the most connecting premise** — the one that involves more participants or three at once.
3. **Look for a counterexample.** Before answering "Follows", try to build a world where the conclusion is false.
4. **"Unknown" is a full-fledged answer:** if you found two worlds with different answers.
5. **Separate what matters:** find the premises that connect the conclusion words through other words; set the rest aside.
6. **Let go of the previous item:** names recur in new roles.
7. **Red word — recode it immediately** into its opposite before building the model.

Hints in the explanation by lure type: `possible` → cards 3–4; `reversal` → «Проговори направление: кто левее, кто больше» ("Say the direction aloud: who is further left, who is bigger"); `nearMiss` → «Отношение верное, проверь величину» ("The relation is right, check the magnitude"); `surface` → card 5; an error on an item with `carryOver` → card 6; an error with inversions → card 7.

## Appendix B. What not to do

- Do not introduce speed points or streaks in deep modes (they push toward heuristics; speed only in «Беглость»).
- Do not group items of the same type into runs.
- Do not make premise count the only difficulty lever.
- Do not show anything in instructions or lists that correlates with the answer (order, length, "special" words).
- Do not raise a gate threshold to make the audit pass: fix the generator.
- Do not promise intelligence gains in the UI and do not show "IQ".

## Appendix C. Metrics glossary

| Metric | Meaning |
| --- | --- |
| σ (support) | Minimal number of premises from which the answer follows (inference depth) |
| Width | Number of entities in the support and conclusion (binding load) |
| Arity | 2 — binary relation, 3 — "between", 4 — meta-relation |
| Convergence | The support is not a simple chain: branches converge, there are ternary premises |
| Non-locality | The answer does not follow from the premises touching the conclusion words |
| log2 models | How indeterminate the premises leave the world |
| Distractors | Extra premises; "attached" — sharing words with the support |
| Discontinuity | Share of adjacent premises with no shared words |
