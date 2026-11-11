# Cue audit v5.1 (2026-11-11, AUDIT_N = 1500)

Уровень задания — число посылок. Гейты v5.1: посылок ровно столько, сколько задано; в задании с определённым ответом каждая посылка необходима (без любой из них ответ не выводится); классы ответов сбалансированы; боты, не читающие посылки (prior, kindPrior), — на уровне мажоритарного класса. Боты, читающие часть посылок (счёт упоминаний и «побед», посылки рядом с выводом, обучаемый бот), только в отчёте: лишних посылок, которыми их раньше сбивали, больше нет. Шанс — 33,3 %. Красные слова и мета-отношения включены.

## Сводка

| Семейство | Было в v4.1 (шанс 50 %) | Посылок | Каждая посылка нужна | Гейты |
| --- | --- | --- | --- | --- |
| groups | чётность «противоположен»: 100% (67–76% с мета-отношениями) | 2–8 | 100 % | пройдены |
| orderNum | «счёт побед»: 100% / 86% / 65% (2–3 / 5 / 12 посылок) | 2–8 | 100 % | пройдены |
| orderTime | «счёт побед»: 100% / 84% / 67% (2–3 / 5 / 12 посылок) | 2–8 | 100 % | пройдены |
| linear | порядок в строке инструкции: 100% без чтения посылок | 2–7 | 100 % | пройдены |
| dir2d | «в соседней клетке» всегда верно (100% на 18–29%), бот 63–69%; с инверсиями диагональ неоднозначна (58%) | 2–6 | 100 % | пройдены |
| dir3dSpace | шаг больше сетки → всегда «неверно» (0%), «та же точка» → всегда «верно» (100%) | 2–6 | 100 % | пройдены |
| dir3dTime | шаг больше сетки → всегда «неверно» (0%), «то же место и время» → всегда «верно» (100%) | 2–6 | 100 % | пройдены |
| syllogism | «Каньон»: квантор вывода 69–79%, атмосфера 71–77%; «Фредо»: 63–71% | 2–6 | 100 % | пройдены |
| circular | порядок в строке инструкции: 100% без чтения посылок | 2–5 | 100 % | пройдены |
| analogy | «такое же» при 5+ посылках почти всегда неверно (11–31% верных против 70–88%) | 3–8 | 100 % | пройдены |
| groups3 | — | 2–7 | 100 % | пройдены |
| conditional | — | 2–6 | 100 % | пройдены |
| hierarchy | — | 2–5 | 100 % | пройдены |
| perspective | — | 2–6 | 100 % | пройдены |
| graph | сравнение степеней вершин: 97–100% | 5–8 | — | пройдены |
| binary | XOR / XNOR чаще верны: 59–60% | 4–12 | — | пройдены |

## По числу посылок

| Семейство | Посылок | E / C / U, % | ровно N | все нужны | prior | kindPrior | частичные боты (отчёт) | learned (отчёт) | ослабления | p50 / p95, мс | провалы |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| groups | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.9 | 35 | degreeGeneral 33.3, myopic 100, parity 66.7, degree 32.8, endpoint 66.7, oneModel 66.7 | — | 0 | 0.1 / 0.2 | — |
| groups | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 35.7 | 33.7 | degreeGeneral 33.3, myopic 33.3, parity 56.1, degree 33.9, endpoint 56.1, oneModel 66.7 | 89.4 | 0 | 0.1 / 0.2 | — |
| groups | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.6 | 33 | degreeGeneral 33.3, myopic 33.3, parity 57.1, degree 33.7, endpoint 57.1, oneModel 66.7 | — | 0 | 0.1 / 0.2 | — |
| groups | 6 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.7 | 34.8 | degreeGeneral 33.3, myopic 33.3, parity 58, degree 32.2, endpoint 58, oneModel 66.7 | 91.3 | 0 | 0.1 / 0.4 | — |
| groups | 8 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.6 | 33.4 | degreeGeneral 33.3, myopic 33.3, parity 56.4, degree 32.9, endpoint 56.4, oneModel 66.7 | — | 0 | 0.2 / 0.6 | — |
| orderNum | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.6 | 33.3 | degreeGeneral 33.3, myopic 100, netScore 100, degree 33.3, subject 32.8, oneModel 66.7 | — | 0 | 0.1 / 0.2 | — |
| orderNum | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.7 | 33.3 | degreeGeneral 33.3, myopic 33.3, netScore 62.7, degree 33.3, subject 32.9, oneModel 66.7 | 62.7 | 0 | 0.1 / 0.2 | — |
| orderNum | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.3 | 33.3 | degreeGeneral 33.3, myopic 33.3, netScore 65.4, degree 33.3, subject 32.7, oneModel 66.7 | — | 0 | 0.1 / 0.3 | — |
| orderNum | 6 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.9 | 35 | degreeGeneral 31.7, myopic 33.9, netScore 55.7, degree 32.3, subject 31.7, oneModel 66.7 | 55.5 | 0 | 0.3 / 1.0 | — |
| orderNum | 8 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.5 | 34 | degreeGeneral 35.1, myopic 33.3, netScore 54.1, degree 34.1, subject 33.9, oneModel 66.7 | — | 0 | 1.8 / 7.2 | — |
| orderTime | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.5 | 33.3 | degreeGeneral 33.3, myopic 100, netScore 100, degree 33.3, subject 33, oneModel 66.7 | — | 0.1 | 0.1 / 0.3 | — |
| orderTime | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.9 | 33.3 | degreeGeneral 33.3, myopic 33.3, netScore 63.8, degree 33.3, subject 33.5, oneModel 66.7 | 64.3 | 0 | 0.1 / 0.3 | — |
| orderTime | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.7 | 33.3 | degreeGeneral 33.3, myopic 33.3, netScore 64.5, degree 33.3, subject 33.7, oneModel 66.7 | — | 0 | 0.1 / 0.3 | — |
| orderTime | 6 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.7 | 33.6 | degreeGeneral 33.6, myopic 34.4, netScore 54.3, degree 33.2, subject 33.4, oneModel 66.7 | 53.6 | 0 | 0.3 / 1.1 | — |
| orderTime | 8 | 33.3 / 33.3 / 33.3 | 100 | 100 | 35.4 | 34.9 | degreeGeneral 32.1, myopic 33.3, netScore 55.8, degree 32.4, subject 32.8, oneModel 66.7 | — | 0 | 1.4 / 5.5 | — |
| linear | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.6 | 33.3 | degreeGeneral 33.3, myopic 100, netScore 100, degree 33.3, instructionOrder 32.2, stepMagnitude 33.3, oneModel 66.7 | — | 0.3 | 0.1 / 0.5 | — |
| linear | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.6 | 33.3 | degreeGeneral 33.3, myopic 33.3, netScore 62.3, degree 33.3, instructionOrder 33.6, stepMagnitude 33.3, oneModel 66.7 | 62.1 | 0 | 0.1 / 0.4 | — |
| linear | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.3 | 33.3 | degreeGeneral 33.3, myopic 33.3, netScore 65.9, degree 33.3, instructionOrder 32.2, stepMagnitude 33.3, oneModel 66.7 | — | 0 | 0.1 / 0.5 | — |
| linear | 6 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.1 | 33.7 | degreeGeneral 33.7, myopic 34.7, netScore 55.2, degree 33.5, instructionOrder 33.2, stepMagnitude 33.3, oneModel 66.7 | 58.1 | 0 | 0.4 / 1.5 | — |
| linear | 7 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.6 | 33.9 | degreeGeneral 33.2, myopic 33.3, netScore 55.5, degree 33.5, instructionOrder 32.2, stepMagnitude 33.3, oneModel 66.7 | — | 0 | 0.7 / 2.9 | — |
| dir2d | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 36.1 | 34.6 | degreeGeneral 33.3, myopic 100, adjacencyPhrase 33, stepMagnitude 32.4, axisCount 33.8, netScore 67.4, oneModel 66.7 | — | 0.2 | 0.1 / 0.2 | — |
| dir2d | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33 | 33.1 | degreeGeneral 31.4, myopic 38.5, adjacencyPhrase 32.8, stepMagnitude 33.1, axisCount 32.8, netScore 63, oneModel 66.7 | 66 | 0.1 | 0.1 / 0.2 | — |
| dir2d | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.6 | 33.3 | degreeGeneral 33.3, myopic 33.3, adjacencyPhrase 34.4, stepMagnitude 35, axisCount 33.5, netScore 57.2, oneModel 66.7 | — | 0.2 | 0.1 / 0.4 | — |
| dir2d | 6 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.4 | 33.6 | degreeGeneral 33.3, myopic 33.3, adjacencyPhrase 32.3, stepMagnitude 32.6, axisCount 34.3, netScore 56.6, oneModel 66.7 | 56.9 | 2 | 0.1 / 1.0 | — |
| dir3dSpace | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.2 | 34.7 | degreeGeneral 33.3, myopic 100, adjacencyPhrase 33.3, stepMagnitude 32.6, axisCount 32.3, netScore 73.2, oneModel 66.7 | — | 0.1 | 0.1 / 0.2 | — |
| dir3dSpace | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.3 | 33.5 | degreeGeneral 29.8, myopic 38.9, adjacencyPhrase 33.3, stepMagnitude 33.8, axisCount 34.3, netScore 67, oneModel 66.7 | 66.7 | 0.1 | 0.1 / 0.3 | — |
| dir3dSpace | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 35.5 | 33.3 | degreeGeneral 33.3, myopic 33.3, adjacencyPhrase 33.3, stepMagnitude 32.1, axisCount 33.3, netScore 60.8, oneModel 66.7 | — | 0.2 | 0.1 / 0.5 | — |
| dir3dSpace | 6 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.8 | 33.6 | degreeGeneral 33.3, myopic 33.3, adjacencyPhrase 33.3, stepMagnitude 33.2, axisCount 33.4, netScore 57.2, oneModel 66.7 | 58.3 | 2.3 | 0.2 / 1.6 | — |
| dir3dTime | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.5 | 32.9 | degreeGeneral 33.3, myopic 100, adjacencyPhrase 33.3, stepMagnitude 32.9, axisCount 35.1, netScore 72.9, oneModel 66.7 | — | 0.1 | 0.1 / 0.2 | — |
| dir3dTime | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.7 | 32.4 | degreeGeneral 31.1, myopic 38.9, adjacencyPhrase 33.3, stepMagnitude 32.9, axisCount 33.4, netScore 65.9, oneModel 66.7 | 67.8 | 0.1 | 0.1 / 0.3 | — |
| dir3dTime | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.5 | 33.5 | degreeGeneral 33.3, myopic 33.3, adjacencyPhrase 33.3, stepMagnitude 32.8, axisCount 34.3, netScore 59, oneModel 66.7 | — | 0.3 | 0.1 / 0.6 | — |
| dir3dTime | 6 | 33.3 / 33.3 / 33.3 | 100 | 100 | 35.1 | 35.1 | degreeGeneral 33.3, myopic 33.3, adjacencyPhrase 33.3, stepMagnitude 32.6, axisCount 31.5, netScore 59.7, oneModel 66.7 | 59.8 | 3.5 | 0.2 / 1.8 | — |
| syllogism | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.1 | 33.6 | degreeGeneral 33.3, myopic 100, atmosphere 58.3, matching 50.1, figural 32.1, conversion 66.7, oneModel 66.7 | — | 0 | 0.1 / 0.1 | — |
| syllogism | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.9 | 33.7 | degreeGeneral 33.3, myopic 33.3, atmosphere 58.6, matching 44.3, figural 34.3, conversion 66.7, oneModel 66.7 | 68.1 | 0 | 0.1 / 0.1 | — |
| syllogism | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.2 | 33.9 | degreeGeneral 33.3, myopic 33.3, atmosphere 57.7, matching 41.1, figural 32.7, conversion 66.7, oneModel 66.7 | — | 0 | 0.2 / 0.2 | — |
| syllogism | 6 | 33.3 / 33.3 / 33.3 | 100 | 100 | 31.5 | 30.8 | degreeGeneral 33.3, myopic 33.3, atmosphere 58.5, matching 37.9, figural 32.8, conversion 66.7, oneModel 66.7 | 65.8 | 0 | 0.5 / 0.7 | — |
| circular | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.4 | 30.7 | degreeGeneral 33.3, myopic 100, instructionOrder 31.3, degree 33.3, oneModel 66.7 | — | 2.3 | 0.1 / 0.5 | — |
| circular | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.6 | 32 | degreeGeneral 33.3, myopic 33.3, instructionOrder 34.5, degree 33.3, oneModel 66.7 | 60.5 | 0.9 | 0.2 / 0.5 | — |
| circular | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.9 | 34 | degreeGeneral 33.3, myopic 33.3, instructionOrder 33.9, degree 33.3, oneModel 66.7 | — | 2.1 | 0.2 / 0.9 | — |
| circular | 5 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.8 | 35 | degreeGeneral 33.3, myopic 33.3, instructionOrder 33.1, degree 33.3, oneModel 66.7 | 54.3 | 2.8 | 0.4 / 1.4 | — |
| analogy | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.2 | 33.2 | degreeGeneral 33.3, myopic 100, cooccurrence 33.3, chainLength 38.4, oneModel 66.7 | 54.7 | 0 | 0.1 / 0.4 | — |
| analogy | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.3 | 33.9 | degreeGeneral 33.3, myopic 57.6, cooccurrence 31.7, chainLength 40, oneModel 66.7 | — | 0 | 0.1 / 0.5 | — |
| analogy | 6 | 33.3 / 33.3 / 33.3 | 100 | 100 | 31.2 | 32.3 | degreeGeneral 33.3, myopic 33.3, cooccurrence 33.3, chainLength 40.9, oneModel 66.7 | 52.5 | 0 | 0.3 / 1.5 | — |
| analogy | 8 | 33.3 / 33.3 / 33.3 | 100 | 100 | 35.3 | 35.2 | degreeGeneral 33.3, myopic 33.3, cooccurrence 33.3, chainLength 41.7, oneModel 66.7 | — | 0 | 1.0 / 9.1 | — |
| groups3 | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.2 | 32.7 | degreeGeneral 33.3, myopic 100, twoGroups 66.7, degree 33.5, oneModel 66.7 | — | 0 | 0.1 / 0.1 | — |
| groups3 | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.2 | 33.4 | degreeGeneral 33.3, myopic 33.3, twoGroups 66.7, degree 33.4, oneModel 66.7 | 66.6 | 0 | 0.1 / 0.1 | — |
| groups3 | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.5 | 34.2 | degreeGeneral 33.3, myopic 33.3, twoGroups 66.7, degree 33.5, oneModel 66.7 | — | 0 | 0.1 / 0.2 | — |
| groups3 | 6 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.9 | 34 | degreeGeneral 33.3, myopic 33.3, twoGroups 48.2, degree 35.6, oneModel 66.7 | 66.7 | 0 | 0.2 / 0.2 | — |
| groups3 | 7 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.1 | 33.9 | degreeGeneral 33.3, myopic 33.3, twoGroups 49.1, degree 32.8, oneModel 66.7 | — | 0 | 0.2 / 0.3 | — |
| conditional | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.3 | 33.3 | degreeGeneral 33.3, myopic 33.3, matching 43.3, polarity 62, oneModel 66.7 | — | 0 | 0.1 / 0.1 | — |
| conditional | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.3 | 33.3 | degreeGeneral 33.3, myopic 33.3, matching 33.3, polarity 56, oneModel 66.7 | 33.5 | 0 | 0.1 / 0.1 | — |
| conditional | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.3 | 33.3 | degreeGeneral 33.3, myopic 33.3, matching 33.3, polarity 52.1, oneModel 66.7 | — | 0 | 0.1 / 0.1 | — |
| conditional | 6 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.3 | 33.3 | degreeGeneral 33.3, myopic 33.3, matching 33.3, polarity 44.3, oneModel 66.7 | 32.5 | 0 | 0.2 / 0.2 | — |
| hierarchy | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.2 | 33.9 | degreeGeneral 33.3, myopic 100, chainOnly 63.7, wordOrder 63.7, oneModel 66.7 | — | 0 | 0.1 / 0.2 | — |
| hierarchy | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.3 | 34.2 | degreeGeneral 33.3, myopic 33.3, chainOnly 62.9, wordOrder 64, oneModel 66.7 | 41.1 | 0 | 0.1 / 0.2 | — |
| hierarchy | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.3 | 35.1 | degreeGeneral 33.3, myopic 33.3, chainOnly 63.2, wordOrder 64.5, oneModel 66.7 | — | 0 | 0.1 / 0.3 | — |
| hierarchy | 5 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.9 | 33.2 | degreeGeneral 33.3, myopic 33.3, chainOnly 64.2, wordOrder 65.5, oneModel 66.7 | 38.6 | 0 | 0.3 / 1.0 | — |
| perspective | 2 | 33.3 / 33.3 / 33.3 | 100 | 100 | 30.7 | 33.3 | degreeGeneral 66.2, myopic 100, egocentric 34.2, word 32.6, oneModel 66.7 | — | 0 | 0.1 / 0.1 | — |
| perspective | 3 | 33.3 / 33.3 / 33.3 | 100 | 100 | 33.7 | 33.2 | degreeGeneral 18.3, myopic 79.7, egocentric 51.5, word 34.1, oneModel 66.7 | 56.9 | 0.5 | 0.1 / 0.2 | — |
| perspective | 4 | 33.3 / 33.3 / 33.3 | 100 | 100 | 32.1 | 33.1 | degreeGeneral 37.7, myopic 55.7, egocentric 42.5, word 32.7, oneModel 66.7 | — | 0 | 0.1 / 0.3 | — |
| perspective | 6 | 33.3 / 33.3 / 33.3 | 100 | 100 | 34.7 | 32.4 | degreeGeneral 35.5, myopic 33.3, egocentric 40.9, word 33.8, oneModel 66.7 | 44.9 | 0 | 0.2 / 0.7 | — |

Пороги: классы 30–36,7 %; «ровно N» и «все нужны» = 100 %; prior и kindPrior ≤ доля мажоритарного класса + 5 п.п.; ослабления ≤ 10 %; p95 ≤ 40 мс.

## Формат выбора («Кто k-й…?»)

| Семейство | Посылок | шанс, % | «Нельзя определить», % | бот degree, % | бот firstMention, % | ослабления, % |
| --- | --- | --- | --- | --- | --- | --- |
| orderNum | 4 | 16.7 | 24.9 | 14 | 12.8 | 0 |
| orderNum | 6 | 12.5 | 24.9 | 9.1 | 9.7 | 0 |
| orderTime | 4 | 16.7 | 25.1 | 11.9 | 13.2 | 0 |
| orderTime | 6 | 12.5 | 24.9 | 8.4 | 9.7 | 0 |
| linear | 4 | 16.7 | 24.8 | 11.2 | 9.9 | 0 |
| linear | 6 | 12.5 | 24.8 | 9.6 | 7.3 | 0 |

## Бинарный формат (только баланс)

| Семейство | Посылок | «Верно», % |
| --- | --- | --- |
| groups | 3 | 50 |
| groups | 6 | 50 |
| orderNum | 3 | 49.9 |
| orderNum | 6 | 49.7 |
| orderTime | 3 | 50.1 |
| orderTime | 6 | 49.9 |
| linear | 3 | 49.9 |
| linear | 6 | 49.9 |
| dir2d | 3 | 50 |
| dir2d | 6 | 50.1 |
| dir3dSpace | 3 | 50 |
| dir3dSpace | 6 | 50 |
| dir3dTime | 3 | 50 |
| dir3dTime | 6 | 50 |
| syllogism | 3 | 50.1 |
| syllogism | 6 | 50 |
| circular | 3 | 49.9 |
| circular | 5 | 50.1 |
| analogy | 3 | 50 |
| analogy | 6 | 50 |
| groups3 | 3 | 50 |
| groups3 | 6 | 50 |
| conditional | 3 | 50 |
| conditional | 6 | 50 |
| hierarchy | 3 | 50.1 |
| hierarchy | 5 | 49.9 |
| perspective | 3 | 50.1 |
| perspective | 6 | 49.9 |

## Сравнение графов и логические связки

| Семейство | Подтип | Посылок | значения | только в отчёте | p50 / p95, мс | провалы |
| --- | --- | --- | --- | --- | --- | --- |
| graph | iso | 5 | balance 50, degreeSequence 50, edgeTypeCount 50, learned 53.5 | jointDegree 100 | 0.1 / 0.4 | — |
| graph | iso | 6 | balance 50, degreeSequence 50, edgeTypeCount 50, learned 51.5 | jointDegree 97.7 | 0.1 / 0.3 | — |
| graph | iso | 7 | balance 50, degreeSequence 50, edgeTypeCount 50, learned 49.4 | jointDegree 94.1 | 0.1 / 0.2 | — |
| graph | iso | 8 | balance 50, degreeSequence 50, edgeTypeCount 50, learned 52.2 | jointDegree 89.5 | 0.1 / 0.2 | — |
| graph | map | 5 | signature 87.9, firstMention 18.7, meanClass 1.24, chance 18.4 | — | 0.0 / 0.1 | — |
| graph | map | 6 | signature 88.5, firstMention 18.6, meanClass 1.23, chance 18.4 | — | 0.0 / 0.0 | — |
| graph | map | 7 | signature 84.3, firstMention 15.5, meanClass 1.31, chance 15.5 | — | 0.0 / 0.1 | — |
| graph | map | 8 | signature 81.1, firstMention 13.5, meanClass 1.38, chance 13.3 | — | 0.0 / 0.1 | — |
| binary | binary | 4 | balance 50, operatorPrior 49.3, learned 48.3, relaxations 0 | firstOnly 66.5 | 0.2 / 0.3 | — |
| binary | binary | 6 | balance 50, operatorPrior 49.6, learned 50.4, relaxations 0 | firstOnly 65.9 | 0.2 / 0.4 | — |
| binary | binary | 8 | balance 50, operatorPrior 50.7, learned 48.5, relaxations 0 | firstOnly 66.1 | 0.3 / 0.7 | — |
| binary | binary | 12 | balance 50, operatorPrior 49.1, learned 48.6, relaxations 0 | firstOnly 67.6 | 0.6 / 1.5 | — |

Пороги: iso — баланс 47–53 %, degreeSequence и edgeTypeCount ≤ 55 %, learned ≤ 57 %; map — signature ≤ 1/(средний размер класса) + 5 п.п., firstMention ≤ ср.(1/n) + 5 п.п.; связки — баланс 47–53 %, operatorPrior ≤ 55 %, learned ≤ 57 %.

