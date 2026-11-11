# Modification notice

The original Syllogimous V4 project is attributed to **4skinSkywalker** and is distributed under the
Attribution-NonCommercial 3.0 Unported license (CC BY-NC 3.0): <https://creativecommons.org/licenses/by-nc/3.0/>.
This modified version keeps that license and its noncommercial restriction.

## v5 changes (November 2026)

- **Experimental mode removed** (and its IndexedDB data is deleted once on the user's side); the old question
  generators were replaced as well.
- **New engine** (`src/app/syllogimous/engine/`): pure TypeScript, deterministic by seed, exact solvers
  cross-checked by brute force; constructive generation of "answer × cue profile"; minimal support, non-locality
  and convergence; an automated cue audit with gates (`npm run audit`, report in `reports/cue-audit-v5.md`).
- **Three answers** («Следует / Неизвестно / Противоречит»), explanations after the answer, strategy cards.
- **Staircase** per family instead of premise-count training units; tiers and score kept; interleaving and a
  fingerprint window in the scheduler.
- **16 families** — the 12 v4.1 types rebuilt on the engine plus «Три группы», «Условия», «Иерархия»,
  «Точка зрения».
- **Modes**: «Конструктор», «Отображение структур», «Беглость», «Контроль переноса», «Тренировка дня».
- **Data compatibility**: old history, score and settings keep loading; a family's first v5 level is migrated
  from the old training unit.
- Russian UI throughout; the default names are Cyrillic pseudo-words (the old pools remain as options).

## v5.1 changes (November 2026)

- **Difficulty is the number of premises** (per task type, automatic or set by hand); the 1–20 level scale is gone.
- **Every premise is necessary**: distractors, pendants and balancing premises were removed from all 16 task
  types; the exact solver verifies it for every generated item.
- **Short wording** of premises and instructions; default names are meaningless three-letter Latin strings.
- The audit gates changed accordingly (exact premise count, necessity of every premise, class balance); bots that
  read only a part of the premises are reported, not gated — see `docs/V5_NOTES.md`, section «v5.1».

These modifications are not represented as proof that the software increases intelligence, fluid intelligence, or
neural capacity. The trainer level is not IQ.
