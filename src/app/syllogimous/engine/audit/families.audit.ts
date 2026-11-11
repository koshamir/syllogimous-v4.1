// `npm run audit` — cue audit with gates (spec §4.10). Sample size: AUDIT_N (default 1500).
// Writes reports/cue-audit-v5.md and reports/cue-audit-v5.json.

import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_VERSION, FamilyId } from '../core/types';
import { ENGINE_FAMILIES } from '../generate';
import {
    BinaryReport, ChoiceReport, DirectReport, Gate, LevelReport, auditBinary, auditBinaryFamily, auditChoice,
    auditGraphIso, auditGraphMap, auditLevel, auditLevelsFor, learnedLevelsFor, runBatch,
} from './run';

const N = Number(process.env['AUDIT_N'] ?? 1500);
const ALL: FamilyId[] = (process.env['AUDIT_FAMILIES']?.split(',') as FamilyId[] | undefined) ?? ENGINE_FAMILIES;
/** Ternary families (gates of §4.10); graph and binary have their own gates (§5.8, §5.10). */
const FAMILIES = ALL.filter(f => f !== 'graph' && f !== 'binary');
const CHOICE_FAMILIES = new Set<FamilyId>(['orderNum', 'orderTime', 'linear']);

/** "Before" (v4.1) — strongest loophole per family from reports/legacy-v4.1-audit.txt (chance 50%, two options). */
const LEGACY: Partial<Record<FamilyId, string>> = {
    groups: 'чётность «противоположен»: 100% (67–76% с мета-отношениями)',
    orderNum: '«счёт побед»: 100% / 86% / 65% (2–3 / 5 / 12 посылок)',
    orderTime: '«счёт побед»: 100% / 84% / 67% (2–3 / 5 / 12 посылок)',
    linear: 'порядок в строке инструкции: 100% без чтения посылок',
    circular: 'порядок в строке инструкции: 100% без чтения посылок',
    dir2d: '«в соседней клетке» всегда верно (100% на 18–29%), бот 63–69%; с инверсиями диагональ неоднозначна (58%)',
    dir3dSpace: 'шаг больше сетки → всегда «неверно» (0%), «та же точка» → всегда «верно» (100%)',
    dir3dTime: 'шаг больше сетки → всегда «неверно» (0%), «то же место и время» → всегда «верно» (100%)',
    syllogism: '«Каньон»: квантор вывода 69–79%, атмосфера 71–77%; «Фредо»: 63–71%',
    analogy: '«такое же» при 5+ посылках почти всегда неверно (11–31% верных против 70–88%)',
    graph: 'сравнение степеней вершин: 97–100%',
    binary: 'XOR / XNOR чаще верны: 59–60%',
};

const levels: LevelReport[] = [];
const directs: DirectReport[] = [];
const choices: ChoiceReport[] = [];
const binaries: BinaryReport[] = [];

const failed = (gs: Gate[]) => gs.filter(g => !g.pass);

describe.each(FAMILIES)('cue audit: %s', family => {
    const learnedAt = learnedLevelsFor(family);
    it.each(auditLevelsFor(family))('%i premises', level => {
        const test = runBatch(family, level, 'ternary', N, 'test');
        const train = runBatch(family, level, 'ternary', learnedAt.includes(level) ? 2 * N : N, 'train');
        const r = auditLevel(family, level, N, train, test);
        levels.push(r);
        expect(failed(r.gates).map(g => `${g.name}=${g.value} (${g.limit})`)).toEqual([]);
    });
    if (CHOICE_FAMILIES.has(family)) {
        it.each([4, 6])('choice format, %i premises', level => {
            const r = auditChoice(family, level, runBatch(family, level, 'choice', Math.round(N / 2), 'choice'));
            choices.push(r);
            expect(failed(r.gates.filter(g => g.name.includes('Нельзя'))).map(g => `${g.name}=${g.value} (${g.limit})`)).toEqual([]);
        });
    }
    it.each(learnedAt)('binary format balance, %i premises', level => {
        const r = auditBinary(family, level, runBatch(family, level, 'binary', Math.round(N / 2), 'binary'));
        binaries.push(r);
        expect(failed(r.gates).map(g => `${g.name}=${g.value} (${g.limit})`)).toEqual([]);
    });
});

if (ALL.includes('graph')) {
    describe('cue audit: graph', () => {
        it.each(auditLevelsFor('graph'))('iso, %i links', level => {
            const r = auditGraphIso(level, runBatch('graph', level, 'binary', N, 'train'), runBatch('graph', level, 'binary', N, 'test'));
            directs.push(r);
            expect(failed(r.gates).map(g => `${g.name}=${g.value} (${g.limit})`)).toEqual([]);
        });
        it.each(auditLevelsFor('graph'))('map, %i links', level => {
            const r = auditGraphMap(level, runBatch('graph', level, 'choice', N, 'test'));
            directs.push(r);
            expect(failed(r.gates).map(g => `${g.name}=${g.value} (${g.limit})`)).toEqual([]);
        });
    });
}

if (ALL.includes('binary')) {
    describe('cue audit: binary', () => {
        it.each(auditLevelsFor('binary'))('%i premises', level => {
            const r = auditBinaryFamily(level, runBatch('binary', level, 'binary', N, 'train'), runBatch('binary', level, 'binary', N, 'test'));
            directs.push(r);
            expect(failed(r.gates).map(g => `${g.name}=${g.value} (${g.limit})`)).toEqual([]);
        });
    });
}

afterAll(() => {
    const dir = join(process.cwd(), 'reports');
    mkdirSync(dir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    writeFileSync(join(dir, 'cue-audit-v5.json'), JSON.stringify({ engineVersion: ENGINE_VERSION, date, N, levels, choices, binaries, directs }, null, 2));

    const L: string[] = [];
    L.push(`# Cue audit ${ENGINE_VERSION} (${date}, AUDIT_N = ${N})`, '');
    L.push('Уровень задания — число посылок. Гейты v5.1: посылок ровно столько, сколько задано; в задании с определённым ответом '
        + 'каждая посылка необходима (без любой из них ответ не выводится); классы ответов сбалансированы; боты, не читающие посылки '
        + '(prior, kindPrior), — на уровне мажоритарного класса. Боты, читающие часть посылок (счёт упоминаний и «побед», посылки рядом '
        + 'с выводом, обучаемый бот), только в отчёте: лишних посылок, которыми их раньше сбивали, больше нет. Шанс — 33,3 %. '
        + 'Красные слова и мета-отношения включены.', '');
    L.push('## Сводка', '');
    L.push('| Семейство | Было в v4.1 (шанс 50 %) | Посылок | Каждая посылка нужна | Гейты |');
    L.push('| --- | --- | --- | --- | --- |');
    for (const f of FAMILIES) {
        const rs = levels.filter(r => r.family === f);
        if (!rs.length) continue;
        const ok = rs.every(r => failed(r.gates).length === 0)
            && binaries.filter(b => b.family === f).every(b => failed(b.gates).length === 0);
        const range = `${Math.min(...rs.map(r => r.level))}–${Math.max(...rs.map(r => r.level))}`;
        L.push(`| ${f} | ${LEGACY[f] ?? '—'} | ${range} | ${Math.min(...rs.map(r => r.necessary))} % | ${ok ? 'пройдены' : '**провал**'} |`);
    }
    for (const f of ['graph', 'binary'] as FamilyId[]) {
        const rs = directs.filter(r => r.family === f);
        if (!rs.length) continue;
        const ok = rs.every(r => failed(r.gates).length === 0);
        L.push(`| ${f} | ${LEGACY[f] ?? '—'} | ${Math.min(...rs.map(r => r.level))}–${Math.max(...rs.map(r => r.level))} | — | ${ok ? 'пройдены' : '**провал**'} |`);
    }
    L.push('', '## По числу посылок', '');
    L.push('| Семейство | Посылок | E / C / U, % | ровно N | все нужны | prior | kindPrior | частичные боты (отчёт) | learned (отчёт) | ослабления | p50 / p95, мс | провалы |');
    L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of levels) {
        const fam = Object.entries(r.bots).filter(([id]) => !['prior', 'kindPrior'].includes(id)).map(([id, v]) => `${id} ${v}`).join(', ');
        const fails = failed(r.gates).map(g => `${g.name} ${g.value}`).join('; ') || '—';
        L.push(`| ${r.family} | ${r.level} | ${r.classes.entailed} / ${r.classes.contradicted} / ${r.classes.undetermined} | ${r.exact} | ${r.necessary} | ${r.bots['prior']} | ${r.bots['kindPrior']} | ${fam} | ${r.learned ?? '—'} | ${r.relaxations} | ${r.p50.toFixed(1)} / ${r.p95.toFixed(1)} | ${fails} |`);
    }
    L.push('', 'Пороги: классы 30–36,7 %; «ровно N» и «все нужны» = 100 %; prior и kindPrior ≤ доля мажоритарного класса + 5 п.п.; ослабления ≤ 10 %; p95 ≤ 40 мс.', '');
    L.push('## Формат выбора («Кто k-й…?»)', '');
    L.push('| Семейство | Посылок | шанс, % | «Нельзя определить», % | бот degree, % | бот firstMention, % | ослабления, % |');
    L.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const c of choices) L.push(`| ${c.family} | ${c.level} | ${c.chance} | ${c.none} | ${c.degree} | ${c.firstMention} | ${c.relaxations} |`);
    L.push('', '## Бинарный формат (только баланс)', '');
    L.push('| Семейство | Посылок | «Верно», % |');
    L.push('| --- | --- | --- |');
    for (const b of binaries) L.push(`| ${b.family} | ${b.level} | ${b.entailed} |`);
    if (directs.length) {
        L.push('', '## Сравнение графов и логические связки', '');
        L.push('| Семейство | Подтип | Посылок | значения | только в отчёте | p50 / p95, мс | провалы |');
        L.push('| --- | --- | --- | --- | --- | --- | --- |');
        for (const r of directs) {
            const vals = Object.entries(r.values).map(([k, v]) => `${k} ${v}`).join(', ');
            const rep = Object.entries(r.reported).map(([k, v]) => `${k} ${v}`).join(', ') || '—';
            const fails = failed(r.gates).map(g => `${g.name} ${g.value}`).join('; ') || '—';
            L.push(`| ${r.family} | ${r.sub} | ${r.level} | ${vals} | ${rep} | ${r.p50.toFixed(1)} / ${r.p95.toFixed(1)} | ${fails} |`);
        }
        L.push('', 'Пороги: iso — баланс 47–53 %, degreeSequence и edgeTypeCount ≤ 55 %, learned ≤ 57 %; map — signature ≤ 1/(средний размер класса) + 5 п.п., firstMention ≤ ср.(1/n) + 5 п.п.; связки — баланс 47–53 %, operatorPrior ≤ 55 %, learned ≤ 57 %.', '');
    }
    writeFileSync(join(dir, 'cue-audit-v5.md'), L.join('\n') + '\n');
});
