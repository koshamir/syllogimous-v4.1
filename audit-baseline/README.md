# audit-baseline

Скрипты, которыми измерены «лазейки» генераторов Syllogimous v4.1, и прототип метода v5.
Положи папку в корень репозитория.

```bash
npm i -D esbuild
node audit-baseline/build.mjs audit-baseline/legacy-cue-audit.ts audit-baseline/out/legacy.cjs
N=1200 node audit-baseline/out/legacy.cjs > reports/legacy-v4.1-audit.txt

node audit-baseline/build.mjs audit-baseline/legacy-extra-audit.ts audit-baseline/out/extra.cjs
node audit-baseline/out/extra.cjs >> reports/legacy-v4.1-audit.txt

node audit-baseline/build.mjs audit-baseline/proto-constructive-order.ts audit-baseline/out/proto.cjs
node audit-baseline/out/proto.cjs
```

- `legacy-cue-audit.ts` — генерирует задания старыми методами `GameService` и проверяет «ботов», которые видят только текст на экране (подсчёт слов, приоры по формулировке, порядок в инструкции, степени вершин).
- `legacy-extra-audit.ts` — неоднозначность диагоналей при инверсиях, подсказки в 3D, приоры связок, форма графа посылок.
- `proto-constructive-order.ts` — прототип генерации «целевой ответ × желаемое мнение бота → конструктивные приманки → проверка решателем» для семейства порядка (посылки «больше» и «между», три варианта ответа).
- `results-v4.1.txt` — результаты на момент передачи (числа могут отличаться на 1–3 п.п. из-за случайности).

Скрипты работают только со старым кодом (v4.1). После фазы 1 их заменяет `npm run audit`.
