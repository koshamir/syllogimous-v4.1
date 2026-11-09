# Cue audit v5 (2026-11-09, AUDIT_N = 1500)

Боты видят только отрисованное задание. Тернарный формат: шанс 33,3 %. Инверсии и мета-отношения включены (значения по умолчанию).

## До / после

| Семейство | До (v4.1, шанс 50 %) | После: лучший эвристический бот | После: learned (L6 / L14) | Гейты |
| --- | --- | --- | --- | --- |
| groups | чётность «противоположен»: 100% (67–76% с мета-отношениями) | kindPrior 35.9 % (L10) | 33.3 / 38.2 % | пройдены |
| orderNum | «счёт побед»: 100% / 86% / 65% (2–3 / 5 / 12 посылок) | degreeGeneral 35.3 % (L2) | 38 / 38.3 % | пройдены |
| orderTime | «счёт побед»: 100% / 84% / 67% (2–3 / 5 / 12 посылок) | netScore 37 % (L10) | 34.7 / 39.2 % | пройдены |
| linear | порядок в строке инструкции: 100% без чтения посылок | degreeGeneral 35.3 % (L10) | 35.6 / 35.8 % | пройдены |
| circular | порядок в строке инструкции: 100% без чтения посылок | prior 33.6 % (L6) | 34.5 / 34.9 % | пройдены |
| dir2d | «в соседней клетке» всегда верно (100% на 18–29%), бот 63–69%; с инверсиями диагональ неоднозначна (58%) | prior 34.8 % (L2) | 35.1 / 34.9 % | пройдены |
| dir3dSpace | шаг больше сетки → всегда «неверно» (0%), «та же точка» → всегда «верно» (100%) | degreeGeneral 34.7 % (L6) | 35 / 35.1 % | пройдены |
| dir3dTime | шаг больше сетки → всегда «неверно» (0%), «то же место и время» → всегда «верно» (100%) | degreeGeneral 35.9 % (L18) | 34.4 / 34.8 % | пройдены |
| syllogism | «Каньон»: квантор вывода 69–79%, атмосфера 71–77%; «Фредо»: 63–71% | matching 34.6 % (L2) | 35.4 / 32.3 % | пройдены |
| analogy | «такое же» при 5+ посылках почти всегда неверно (11–31% верных против 70–88%) | kindPrior 34.4 % (L10) | 31.3 / 34.7 % | пройдены |
| groups3 | — | degree 35.6 % (L6) | 33.1 / 34.7 % | пройдены |
| conditional | — | polarity 34.9 % (L6) | 37 / 35.3 % | пройдены |
| hierarchy | — | prior 34.9 % (L18) | 30.7 / 35.2 % | пройдены |
| perspective | — | prior 34.9 % (L14) | 33 / 34.2 % | пройдены |
| graph | сравнение степеней вершин: 97–100% | iso: degreeSequence ≤ 50 %, map: signature ≤ 100 % | 50.9 % (макс.) | пройдены |
| binary | XOR / XNOR чаще верны: 59–60% | operatorPrior ≤ 52.1 % (шанс 50 %) | 51.5 % (макс.) | пройдены |

## По уровням

| Семейство | L | E / C / U, % | prior | kindPrior | degree | myopic | семейные боты | learned | oneModel «Следует» среди U | ослабления | p50 / p95, мс | провалы |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| groups | 2 | 33.3 / 33.3 / 33.3 | 33.1 | 34.5 | 31.9 | 100 | parity 33.7, degree 34, endpoint 33.9 | — | 0 | 0 | 0.1 / 0.2 | — |
| groups | 6 | 33.3 / 33.3 / 33.3 | 33.5 | 34.3 | 32.6 | 33.3 | parity 35.3, degree 32.6, endpoint 35.2 | 33.3 | 50 | 0 | 0.1 / 0.2 | — |
| groups | 10 | 33.3 / 33.3 / 33.3 | 34.5 | 35.9 | 30.8 | 33.3 | parity 33.5, degree 35.5, endpoint 34.2 | — | 48.8 | 0 | 0.1 / 0.4 | — |
| groups | 14 | 33.3 / 33.3 / 33.3 | 31.8 | 33.3 | 33.1 | 33.3 | parity 31.9, degree 32.8, endpoint 33.5 | 38.2 | 52 | 0.1 | 0.3 / 1.0 | — |
| groups | 18 | 33.3 / 33.3 / 33.3 | 33.9 | 33.9 | 33.2 | 33.3 | parity 33.4, degree 33, endpoint 33.4 | — | 48.6 | 0.7 | 0.4 / 1.9 | — |
| orderNum | 2 | 33.3 / 33.3 / 33.3 | 33.9 | 33.3 | 35.3 | 100 | netScore 34.2, degree 35.3, subject 34.6 | — | 3.8 | 5.7 | 0.2 / 1.4 | — |
| orderNum | 6 | 33.3 / 33.3 / 33.3 | 33.1 | 33.3 | 33.1 | 33.3 | netScore 33.3, degree 33.1, subject 33.1 | 38 | 50 | 0 | 0.5 / 1.4 | — |
| orderNum | 10 | 33.3 / 33.3 / 33.3 | 35.1 | 33.3 | 31.5 | 33.3 | netScore 32.6, degree 31.5, subject 32.4 | — | 51.4 | 0 | 0.7 / 2.8 | — |
| orderNum | 14 | 33.3 / 33.3 / 33.3 | 35.3 | 33.9 | 33.8 | 33.3 | netScore 34.5, degree 33.9, subject 32.2 | 38.3 | 49.2 | 0 | 1.1 / 3.6 | — |
| orderNum | 18 | 33.3 / 33.3 / 33.3 | 35.3 | 33.6 | 33.6 | 33.3 | netScore 32, degree 33.4, subject 32 | — | 50 | 0 | 1.6 / 4.4 | — |
| orderTime | 2 | 33.3 / 33.3 / 33.3 | 32.3 | 33.3 | 35 | 100 | netScore 32.7, degree 35, subject 33.5 | — | 4.2 | 7.3 | 0.2 / 1.8 | — |
| orderTime | 6 | 33.3 / 33.3 / 33.3 | 32.7 | 33.3 | 32.3 | 33.3 | netScore 32.1, degree 32.3, subject 31.4 | 34.7 | 50 | 0 | 0.4 / 1.1 | — |
| orderTime | 10 | 33.3 / 33.3 / 33.3 | 33.2 | 33.3 | 32.7 | 33.3 | netScore 37, degree 32.7, subject 33.1 | — | 49.2 | 0 | 0.5 / 2.2 | — |
| orderTime | 14 | 33.3 / 33.3 / 33.3 | 33.5 | 33.6 | 32.1 | 33.3 | netScore 32, degree 32.3, subject 32.1 | 39.2 | 51.6 | 0.3 | 0.9 / 3.1 | — |
| orderTime | 18 | 33.3 / 33.3 / 33.3 | 32.6 | 31.8 | 30.9 | 33.3 | netScore 32.6, degree 31.7, subject 31.8 | — | 52.2 | 0.1 | 1.4 / 4.7 | — |
| linear | 2 | 33.3 / 33.3 / 33.3 | 34.1 | 33.3 | 33.5 | 100 | netScore 33.5, degree 33.5, instructionOrder 31.9, stepMagnitude 33.3 | — | 2.4 | 5.8 | 0.2 / 1.9 | — |
| linear | 6 | 33.3 / 33.3 / 33.3 | 33.2 | 33.3 | 32.7 | 33.3 | netScore 33.6, degree 32.7, instructionOrder 34.2, stepMagnitude 33.3 | 35.6 | 50 | 0 | 0.6 / 2.3 | — |
| linear | 10 | 33.3 / 33.3 / 33.3 | 34.3 | 33.3 | 35.3 | 33.3 | netScore 31.2, degree 35.3, instructionOrder 34.2, stepMagnitude 33.3 | — | 49.6 | 0 | 1.0 / 10.7 | — |
| linear | 14 | 33.3 / 33.3 / 33.3 | 34.7 | 32.5 | 32.7 | 33.3 | netScore 32.4, degree 33.6, instructionOrder 31.7, stepMagnitude 33.3 | 35.8 | 47.4 | 0.4 | 2.5 / 19.5 | — |
| linear | 18 | 33.3 / 33.3 / 33.3 | 33.7 | 33.7 | 33.7 | 33.3 | netScore 32.6, degree 33.2, instructionOrder 32.7, stepMagnitude 33.3 | — | 50 | 0.1 | 6.0 / 33.0 | — |
| circular | 2 | 33.3 / 33.3 / 33.3 | 33.5 | 33.3 | 33.3 | 100 | instructionOrder 32.7, degree 33.3 | — | 0.8 | 0.3 | 0.2 / 0.7 | — |
| circular | 6 | 33.3 / 33.3 / 33.3 | 33.6 | 33.3 | 33.3 | 33.3 | instructionOrder 33.1, degree 33.3 | 34.5 | 50.2 | 0.4 | 0.2 / 1.0 | — |
| circular | 10 | 33.3 / 33.3 / 33.3 | 31.5 | 33.3 | 33.3 | 33.3 | instructionOrder 33, degree 33.3 | — | 51.4 | 0.7 | 0.3 / 1.4 | — |
| circular | 14 | 33.3 / 33.3 / 33.3 | 31.1 | 33.3 | 33.3 | 33.3 | instructionOrder 32.3, degree 33.3 | 34.9 | 50.8 | 1.7 | 0.3 / 1.6 | — |
| circular | 18 | 33.3 / 33.3 / 33.3 | 32.8 | 33.3 | 33.3 | 33.3 | instructionOrder 33, degree 33.4 | — | 49 | 1.6 | 0.3 / 1.4 | — |
| dir2d | 2 | 33.3 / 33.3 / 33.3 | 34.8 | 32.3 | 31.7 | 100 | adjacencyPhrase 33.3, stepMagnitude 33.8, axisCount 33.1, netScore 34.5 | — | 0 | 0 | 0.1 / 0.3 | — |
| dir2d | 6 | 33.3 / 33.3 / 33.3 | 34.1 | 33.6 | 32.1 | 33.3 | adjacencyPhrase 32.3, stepMagnitude 33.1, axisCount 34.3, netScore 34 | 35.1 | 50.2 | 0 | 0.2 / 0.4 | — |
| dir2d | 10 | 33.3 / 33.3 / 33.3 | 31.8 | 32.1 | 34.2 | 33.3 | adjacencyPhrase 33.8, stepMagnitude 33.9, axisCount 33.6, netScore 32.6 | — | 54 | 3.6 | 0.2 / 1.0 | — |
| dir2d | 14 | 33.3 / 33.3 / 33.3 | 31.7 | 31.4 | 34.3 | 33.3 | adjacencyPhrase 33.5, stepMagnitude 33.7, axisCount 34.2, netScore 31.4 | 34.9 | 54.8 | 3.4 | 0.3 / 1.2 | — |
| dir2d | 18 | 33.3 / 33.3 / 33.3 | 29.7 | 34.8 | 31.9 | 33.3 | adjacencyPhrase 33.4, stepMagnitude 33, axisCount 31.3, netScore 33.9 | — | 53.6 | 3.3 | 0.4 / 1.5 | — |
| dir3dSpace | 2 | 33.3 / 33.3 / 33.3 | 33.7 | 31.9 | 32.5 | 100 | adjacencyPhrase 33.3, stepMagnitude 33.4, axisCount 34.3, netScore 33.9 | — | 0 | 0 | 0.1 / 0.4 | — |
| dir3dSpace | 6 | 33.3 / 33.3 / 33.3 | 34.3 | 33.6 | 34.7 | 33.3 | adjacencyPhrase 33.3, stepMagnitude 33.5, axisCount 33.4, netScore 33 | 35 | 49.8 | 0 | 0.2 / 0.6 | — |
| dir3dSpace | 10 | 33.3 / 33.3 / 33.3 | 33.4 | 34.4 | 34.4 | 33.3 | adjacencyPhrase 33.3, stepMagnitude 33.2, axisCount 34.4, netScore 33.7 | — | 54.4 | 5.5 | 0.3 / 1.4 | — |
| dir3dSpace | 14 | 33.3 / 33.3 / 33.3 | 32.4 | 32.1 | 33.4 | 33.3 | adjacencyPhrase 33.3, stepMagnitude 33, axisCount 30.5, netScore 33.4 | 35.1 | 55 | 6 | 0.4 / 1.7 | — |
| dir3dSpace | 18 | 33.3 / 33.3 / 33.3 | 31.7 | 34.1 | 33.4 | 33.3 | adjacencyPhrase 33.3, stepMagnitude 32.7, axisCount 32.5, netScore 33.4 | — | 53.6 | 4.6 | 0.6 / 2.4 | — |
| dir3dTime | 2 | 33.3 / 33.3 / 33.3 | 33.4 | 33.3 | 33.5 | 100 | adjacencyPhrase 33.3, stepMagnitude 32.2, axisCount 31, netScore 33.5 | — | 0 | 0 | 0.1 / 0.4 | — |
| dir3dTime | 6 | 33.3 / 33.3 / 33.3 | 33.3 | 35.1 | 32.5 | 33.3 | adjacencyPhrase 33.3, stepMagnitude 32.3, axisCount 31.5, netScore 33 | 34.4 | 50 | 0 | 0.2 / 0.5 | — |
| dir3dTime | 10 | 33.3 / 33.3 / 33.3 | 33.9 | 32.7 | 33.3 | 33.3 | adjacencyPhrase 33.3, stepMagnitude 33.6, axisCount 32.5, netScore 34.5 | — | 50 | 6.3 | 0.3 / 1.5 | — |
| dir3dTime | 14 | 33.3 / 33.3 / 33.3 | 33.2 | 33.3 | 33.7 | 33.3 | adjacencyPhrase 33.3, stepMagnitude 33.8, axisCount 33.9, netScore 33 | 34.8 | 54.4 | 5.9 | 0.4 / 1.7 | — |
| dir3dTime | 18 | 33.3 / 33.3 / 33.3 | 35.4 | 34.1 | 35.9 | 33.3 | adjacencyPhrase 33.3, stepMagnitude 34, axisCount 33, netScore 32.1 | — | 53.6 | 6.4 | 0.5 / 2.4 | — |
| syllogism | 2 | 33.3 / 33.3 / 33.3 | 31 | 31.7 | 32.9 | 100 | atmosphere 32.1, matching 34.6, figural 32.9, conversion 66.7 | — | 51 | 6.3 | 0.6 / 1.3 | — |
| syllogism | 6 | 33.3 / 33.3 / 33.3 | 32.6 | 32.6 | 32.4 | 33.3 | atmosphere 29.9, matching 32.8, figural 33.2, conversion 66.7 | 35.4 | 51 | 0 | 1.4 / 2.8 | — |
| syllogism | 10 | 33.3 / 33.3 / 33.3 | 31.9 | 32.1 | 34.1 | 33.3 | atmosphere 34.1, matching 32.9, figural 32.5, conversion 64.7 | — | 50.2 | 3.7 | 1.8 / 4.0 | — |
| syllogism | 14 | 33.3 / 33.3 / 33.3 | 32.7 | 31.7 | 32.1 | 33.3 | atmosphere 33.8, matching 32.9, figural 32.9, conversion 64.1 | 32.3 | 49.6 | 4.6 | 2.8 / 4.8 | — |
| syllogism | 18 | 33.3 / 33.3 / 33.3 | 33.8 | 33.2 | 32.7 | 33.3 | atmosphere 30.8, matching 33.4, figural 33.2, conversion 65 | — | 49.4 | 4.2 | 3.6 / 5.2 | — |
| analogy | 2 | 33.3 / 33.3 / 33.3 | 30.6 | 31.7 | 33.3 | 100 | cooccurrence 33.3, chainLength 61.3 | — | 51.2 | 0 | 0.1 / 0.5 | — |
| analogy | 6 | 33.3 / 33.3 / 33.3 | 33.1 | 32.3 | 33.3 | 33.3 | cooccurrence 33.3, chainLength 60.2 | 31.3 | 54 | 0 | 0.3 / 2.3 | — |
| analogy | 10 | 33.3 / 33.3 / 33.3 | 34.3 | 34.4 | 33.3 | 33.3 | cooccurrence 33.3, chainLength 58.7 | — | 49.6 | 0 | 0.7 / 9.2 | — |
| analogy | 14 | 33.3 / 33.3 / 33.3 | 33.9 | 33.5 | 33.3 | 33.3 | cooccurrence 33.3, chainLength 60.5 | 34.7 | 48.2 | 0 | 1.5 / 17.7 | — |
| analogy | 18 | 33.3 / 33.3 / 33.3 | 33.9 | 32.9 | 33.3 | 33.3 | cooccurrence 33.3, chainLength 59.8 | — | 50 | 0 | 1.7 / 9.5 | — |
| groups3 | 2 | 33.3 / 33.3 / 33.3 | 32.7 | 32.7 | 33.3 | 100 | twoGroups 33.5, degree 33.5 | — | 48.6 | 0 | 0.1 / 0.1 | — |
| groups3 | 6 | 33.3 / 33.3 / 33.3 | 34.3 | 34 | 33.3 | 33.3 | twoGroups 34.1, degree 35.6 | 33.1 | 46.2 | 0 | 0.1 / 0.1 | — |
| groups3 | 10 | 33.3 / 33.3 / 33.3 | 34.5 | 33.7 | 33.3 | 33.3 | twoGroups 31.7, degree 32.9 | — | 49 | 0 | 0.1 / 0.6 | — |
| groups3 | 14 | 33.3 / 33.3 / 33.3 | 34.4 | 34.1 | 33.3 | 33.3 | twoGroups 32.8, degree 31.8 | 34.7 | 46.2 | 0 | 0.2 / 0.3 | — |
| groups3 | 18 | 33.3 / 33.3 / 33.3 | 34.1 | 34.3 | 33.3 | 33.3 | twoGroups 33.3, degree 32.9 | — | 48 | 0 | 0.2 / 0.3 | — |
| conditional | 2 | 33.3 / 33.3 / 33.3 | 33.3 | 33.3 | 33.3 | 33.3 | matching 33.3, polarity 33.6 | — | 0.2 | 0.1 | 0.1 / 0.3 | — |
| conditional | 6 | 33.3 / 33.3 / 33.3 | 33.3 | 33.3 | 33.3 | 33.3 | matching 33.3, polarity 34.9 | 37 | 49.8 | 0 | 0.1 / 0.3 | — |
| conditional | 10 | 33.3 / 33.3 / 33.3 | 33.3 | 33.3 | 33.3 | 33.3 | matching 33.3, polarity 32.9 | — | 50 | 0 | 0.2 / 0.5 | — |
| conditional | 14 | 33.3 / 33.3 / 33.3 | 33.3 | 33.3 | 33.3 | 33.3 | matching 33.3, polarity 34.3 | 35.3 | 50 | 0 | 0.2 / 0.4 | — |
| conditional | 18 | 33.3 / 33.3 / 33.3 | 33.3 | 33.3 | 33.3 | 33.3 | matching 33.3, polarity 33.7 | — | 50 | 0 | 0.2 / 0.4 | — |
| hierarchy | 2 | 33.3 / 33.3 / 33.3 | 34.2 | 33.9 | 33.3 | 100 | chainOnly 66.7, wordOrder 33.1 | — | 0 | 0 | 0.1 / 0.6 | — |
| hierarchy | 6 | 33.3 / 33.3 / 33.3 | 33.2 | 33.6 | 33.3 | 33.3 | chainOnly 66.7, wordOrder 34.4 | 30.7 | 50 | 0 | 0.2 / 0.6 | — |
| hierarchy | 10 | 33.3 / 33.3 / 33.3 | 34.3 | 33.9 | 33.3 | 33.3 | chainOnly 66.7, wordOrder 32.7 | — | 49.8 | 0 | 0.2 / 0.5 | — |
| hierarchy | 14 | 33.3 / 33.3 / 33.3 | 33.3 | 32.4 | 33.3 | 33.3 | chainOnly 66.7, wordOrder 34.3 | 35.2 | 50 | 0 | 0.2 / 0.5 | — |
| hierarchy | 18 | 33.3 / 33.3 / 33.3 | 34.9 | 32.8 | 33.3 | 33.3 | chainOnly 66.7, wordOrder 31.5 | — | 50 | 0 | 0.2 / 0.5 | — |
| perspective | 2 | 33.3 / 33.3 / 33.3 | 32.9 | 32.9 | 32.7 | 65.8 | egocentric 31.8, word 32.3 | — | 0 | 0 | 0.2 / 0.4 | — |
| perspective | 6 | 33.3 / 33.3 / 33.3 | 33.5 | 33.1 | 32 | 33.3 | egocentric 33.7, word 32.2 | 33 | 50 | 0 | 0.7 / 2.2 | — |
| perspective | 10 | 33.3 / 33.3 / 33.3 | 31.6 | 33.7 | 31.4 | 33.3 | egocentric 33.1, word 34.5 | — | 50.2 | 0 | 3.1 / 12.4 | — |
| perspective | 14 | 33.3 / 33.3 / 33.3 | 34.9 | 32.5 | 33.4 | 33.3 | egocentric 34, word 33.1 | 34.2 | 49.8 | 0 | 3.0 / 11.5 | — |
| perspective | 18 | 33.3 / 33.3 / 33.3 | 33.1 | 33.9 | 33.3 | 33.3 | egocentric 32.5, word 34.7 | — | 49.8 | 0 | 3.0 / 11.7 | — |

Пороги: каждый эвристический бот ≤ доля мажоритарного класса + 5 п.п.; myopic (L ≥ 4) ≤ 38,3 %; learned ≤ 40,3 %; классы 30–36,7 %; ослабления ≤ 10 %; p95 ≤ 40 мс; oneModel «Следует» среди «Неизвестно» 40–60 % (L ≥ 3). На L2 myopic не ограничен: нелокальность требуется с L4.

## Формат выбора («Кто k-й…?»)

| Семейство | L | шанс, % | «Нельзя определить», % | бот degree, % | бот firstMention, % | ослабления, % |
| --- | --- | --- | --- | --- | --- | --- |
| orderNum | 6 | 16.7 | 24.9 | 12 | 14.4 | 0 |
| orderNum | 14 | 12.1 | 24.8 | 8.8 | 8.4 | 0 |
| orderTime | 6 | 16.7 | 24.9 | 10.9 | 12.1 | 0 |
| orderTime | 14 | 12 | 25.1 | 8.4 | 8.8 | 0 |
| linear | 6 | 16.7 | 24.8 | 12.7 | 10.7 | 0 |
| linear | 14 | 12.1 | 25.2 | 7.6 | 7.7 | 0 |

## Бинарный формат (только баланс)

| Семейство | L | «Верно», % |
| --- | --- | --- |
| groups | 6 | 50 |
| groups | 14 | 49.9 |
| orderNum | 6 | 49.9 |
| orderNum | 14 | 50 |
| orderTime | 6 | 49.9 |
| orderTime | 14 | 49.9 |
| linear | 6 | 49.9 |
| linear | 14 | 50 |
| circular | 6 | 49.9 |
| circular | 14 | 49.9 |
| dir2d | 6 | 50.1 |
| dir2d | 14 | 50.1 |
| dir3dSpace | 6 | 50 |
| dir3dSpace | 14 | 50.1 |
| dir3dTime | 6 | 50 |
| dir3dTime | 14 | 49.9 |
| syllogism | 6 | 50.3 |
| syllogism | 14 | 49.9 |
| analogy | 6 | 50 |
| analogy | 14 | 50 |
| groups3 | 6 | 50 |
| groups3 | 14 | 50 |
| conditional | 6 | 50 |
| conditional | 14 | 50 |
| hierarchy | 6 | 50 |
| hierarchy | 14 | 50 |
| perspective | 6 | 49.9 |
| perspective | 14 | 50 |

## Сравнение графов и логические связки (собственные гейты §5.8, §5.10)

| Семейство | Подтип | L | значения | только в отчёте | p50 / p95, мс | провалы |
| --- | --- | --- | --- | --- | --- | --- |
| graph | iso | 2 | balance 50, degreeSequence 50, edgeTypeCount 50, learned 50 | jointDegree 100 | 0.1 / 0.4 | — |
| graph | iso | 6 | balance 50, degreeSequence 50, edgeTypeCount 50, learned 50.9 | jointDegree 92.5 | 0.1 / 0.3 | — |
| graph | iso | 10 | balance 50, degreeSequence 50, edgeTypeCount 50, learned 48.9 | jointDegree 53.5 | 0.2 / 0.4 | — |
| graph | iso | 14 | balance 50, degreeSequence 50, edgeTypeCount 50, learned 50.1 | jointDegree 50 | 0.1 / 0.3 | — |
| graph | iso | 18 | balance 50, degreeSequence 50, edgeTypeCount 50, learned 49.3 | jointDegree 50 | 0.1 / 0.3 | — |
| graph | map | 2 | signature 100, firstMention 24.9, meanClass 1, chance 25 | — | 0.0 / 0.0 | — |
| graph | map | 6 | signature 50, firstMention 20.5, meanClass 2, chance 20 | — | 0.0 / 0.1 | — |
| graph | map | 10 | signature 50, firstMention 14.5, meanClass 2, chance 16.7 | — | 0.1 / 0.1 | — |
| graph | map | 14 | signature 50, firstMention 14.9, meanClass 2, chance 13.7 | — | 0.1 / 0.1 | — |
| graph | map | 18 | signature 50, firstMention 11.7, meanClass 2, chance 12.5 | — | 0.1 / 0.1 | — |
| binary | binary | 2 | balance 50, operatorPrior 48.7, learned 49.7, relaxations 0 | firstOnly 64.9 | 0.3 / 1.1 | — |
| binary | binary | 6 | balance 50, operatorPrior 49.6, learned 50.6, relaxations 0.1 | firstOnly 65.9 | 0.4 / 2.5 | — |
| binary | binary | 10 | balance 50, operatorPrior 52.1, learned 51.5, relaxations 0 | firstOnly 68.6 | 0.8 / 3.1 | — |
| binary | binary | 14 | balance 50, operatorPrior 48.9, learned 48.5, relaxations 0.1 | firstOnly 67.1 | 2.2 / 12.8 | — |
| binary | binary | 18 | balance 50, operatorPrior 50.4, learned 51.1, relaxations 0 | firstOnly 65.7 | 2.7 / 15.0 | — |

Пороги: iso — баланс 47–53 %, degreeSequence и edgeTypeCount ≤ 55 %, learned ≤ 57 %; map — signature ≤ 1/(средний размер класса) + 5 п.п., с L6 средний класс ≥ 2, firstMention ≤ ср.(1/n) + 5 п.п.; связки — баланс 47–53 %, operatorPrior ≤ 55 %, learned ≤ 57 %. jointDegree (iso) и firstOnly (связки) — стратегии с частичным решением, только в отчёте.

