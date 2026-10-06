# Source comparison and legacy findings

The supplied workspace is an archive, without a `.git` directory. Therefore a local commit or clean/dirty Git status cannot be asserted. The upstream HEAD inspected during this implementation was `e48d4367094f4ab86894e60bf46c90c7c8e5c805`, the specified audited snapshot. The initial read-only comparison covered 241 upstream blobs: none were missing and 72 workspace files differed, predominantly the existing Russian localization. Those pre-existing translations were preserved; this is a local, reviewable modification, not a published commit.

No repository `AGENTS.md` was found. Baseline Angular 15.2 / TypeScript 4.9 tooling was retained. No paid service, model, API answer oracle, framework upgrade, deployment or merge was introduced.

| Finding | Current-source evidence and interpretation | New-mode handling |
| --- | --- | --- |
| Canyon is categorical only | `GameService` dispatches separate family generators; `sylGenerate` is its categorical utility, not a universal engine. | Pure ten-family registry; explicit legacy adapter. |
| Premise count mixes chain and distractors | `syllogism.utils.ts` constructs chain premises and then distractor premises. | Target and measured vectors distinguish displayed/atomic constraints, support and nuisance demands. |
| Shorter proofs inspect paths | Legacy categorical path search does not enumerate all premise subsets or human strategies. This is a target-demand limitation, not evidence of incorrect answers. | Exact subset supports for tractable sets; unavailable claims remain unavailable. |
| Named classes exist | Legacy categorical reasoning uses existential import. | Preserved legacy contract; explicit, versioned nonempty/empty-class alternatives in the new mode. |
| Quantifier cues | Historical percentages are not embedded as product facts. | Reproducible fixed-seed CLI, separate fitting/development/final test splits, controls and uncertainty. |
| Retry paths | Legacy `sylGenerate` contains `while (true)` and some family retry paths are not globally bounded. | New path has bounded attempts, deadlines, worker watchdogs, cancellation and typed recoverable errors. Legacy behavior is not silently changed. |
| Binary independent parts | Legacy Binary combines base-family results with fixed internal Boolean operators, including short-circuit semantics. Fixed internal expressions are not automatically an exploitable injection. | Kept as legacy composition; new coupled tasks require a bridge in every exact minimal support. |
| Analogy already relational | Legacy analogy compares relations. | Extended with explicit source/target structures, role mappings and missing-edge validation. |
| Distinction parity | Its two-category opposition supports parity; arbitrary inequality does not. | Separate binary-opposition contract and three-value inequality fixture. |
| Graph local invariants | Some legacy negative mutations change local degree signatures. This is a plausible cue, not proof that every negative is locally solvable. | Degree-matched nonisomorphic negatives and exact mapping validation; cue quarantine. |
| Old question record | Old `Question` is presentation/Boolean oriented, without the new provenance/AST/witness/certificate contract. | Separate typed versioned `ReasoningItem`; no reinterpretation of old history. |
| Progression/nuisance | Legacy progression principally varies premises; settings can vary presentation, button locations and timing. | Stable controls, separately configured memory/distractors/deadline, documented mastery heuristic. |

Baseline checks actually executed before implementation: 23 existing tests passed; optimized production build passed (21.7 seconds). Existing CommonJS, selector, autoprefixer and bundle-budget warnings were recorded. Node 24 is outside Angular 15's officially supported runtime range; compatibility was tested in this environment but a supported Node CI run remains advisable.

Original attribution: Syllogimous V4 by 4skinSkywalker, **CC BY-NC 3.0**. See `README.md` and `MODIFICATIONS.md`. These changes retain the attribution and noncommercial restriction.
