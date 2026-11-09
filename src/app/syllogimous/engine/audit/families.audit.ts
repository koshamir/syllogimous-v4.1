// `npm run audit` — cue audit with gates (spec §4.10). Sample size: AUDIT_N (default 1500).
// Writes reports/cue-audit-v5.md and reports/cue-audit-v5.json.

import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FamilyId } from '../core/types';
import { pluginFor } from '../generate';
import {
    AUDIT_LEVELS, BinaryReport, ChoiceReport, DirectReport, Gate, LEARNED_LEVELS, LevelReport, auditBinary, auditBinaryFamily, auditChoice,
    auditGraphIso, auditGraphMap, auditLevel, runBatch,
} from './run';

const N = Number(process.env['AUDIT_N'] ?? 1500);
const ALL: FamilyId[] = (process.env['AUDIT_FAMILIES']?.split(',') as FamilyId[] | undefined)
    ?? ['groups', 'orderNum', 'orderTime', 'linear', 'circular', 'dir2d', 'dir3dSpace', 'dir3dTime', 'syllogism', 'analogy', 'graph', 'binary'];
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
    it.each(AUDIT_LEVELS)('level %i', level => {
        const test = runBatch(family, level, 'ternary', N, 'test');
        const train = runBatch(family, level, 'ternary', LEARNED_LEVELS.includes(level) ? 2 * N : N, 'train');
        const r = auditLevel(family, level, N, train, test);
        levels.push(r);
        expect(failed(r.gates).map(g => `${g.name}=${g.value} (${g.limit})`)).toEqual([]);
    });
    if (CHOICE_FAMILIES.has(family)) {
        it.each(LEARNED_LEVELS)('choice format, level %i', level => {
            const r = auditChoice(family, level, runBatch(family, level, 'choice', Math.round(N / 2), 'choice'));
            choices.push(r);
            expect(failed(r.gates).map(g => `${g.name}=${g.value} (${g.limit})`)).toEqual([]);
        });
    }
    it.each(LEARNED_LEVELS)('binary format balance, level %i', level => {
        const r = auditBinary(family, level, runBatch(family, level, 'binary', Math.round(N / 2), 'binary'));
        binaries.push(r);
        expect(failed(r.gates).map(g => `${g.name}=${g.value} (${g.limit})`)).toEqual([]);
    });
});

if (ALL.includes('graph')) {
    describe('cue audit: graph', () => {
        it.each(AUDIT_LEVELS)('iso, level %i', level => {
            const r = auditGraphIso(level, runBatch('graph', level, 'binary', N, 'train'), runBatch('graph', level, 'binary', N, 'test'));
            directs.push(r);
            expect(failed(r.gates).map(g => `${g.name}=${g.value} (${g.limit})`)).toEqual([]);
        });
        it.each(AUDIT_LEVELS)('map, level %i', level => {
            const r = auditGraphMap(level, runBatch('graph', level, 'choice', N, 'test'));
            directs.push(r);
            expect(failed(r.gates).map(g => `${g.name}=${g.value} (${g.limit})`)).toEqual([]);
        });
    });
}

if (ALL.includes('binary')) {
    describe('cue audit: binary', () => {
        it.each(AUDIT_LEVELS)('level %i', level => {
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
    writeFileSync(join(dir, 'cue-audit-v5.json'), JSON.stringify({ engineVersion: 'v5.0', date, N, levels, choices, binaries, directs }, null, 2));

    const L: string[] = [];
    L.push(`# Cue audit v5 (${date}, AUDIT_N = ${N})`, '');
    L.push('Боты видят только отрисованное задание. Тернарный формат: шанс 33,3 %. Инверсии и мета-отношения включены (значения по умолчанию).', '');
    L.push('## До / после', '');
    L.push('| Семейство | До (v4.1, шанс 50 %) | После: лучший эвристический бот | После: learned (L6 / L14) | Гейты |');
    L.push('| --- | --- | --- | --- | --- |');
    for (const f of FAMILIES) {
        const rs = levels.filter(r => r.family === f);
        if (!rs.length) continue;
        let best = { id: '', v: 0, level: 0 };
        const ungated = new Set(pluginFor(f).bots.filter(b => b.gated === false).map(b => b.id));
        for (const r of rs) for (const [id, v] of Object.entries(r.bots)) {
            if (id === 'oneModel' || ungated.has(id) || (id === 'myopic' && r.level < 4)) continue;
            if (v > best.v) best = { id, v, level: r.level };
        }
        const learned = rs.filter(r => r.learned !== undefined).map(r => `${r.learned}`).join(' / ');
        const ok = rs.every(r => failed(r.gates).length === 0)
            && choices.filter(c => c.family === f).every(c => failed(c.gates).length === 0)
            && binaries.filter(b => b.family === f).every(b => failed(b.gates).length === 0);
        L.push(`| ${f} | ${LEGACY[f] ?? '—'} | ${best.id} ${best.v} % (L${best.level}) | ${learned} % | ${ok ? 'пройдены' : '**провал**'} |`);
    }
    for (const f of ['graph', 'binary'] as FamilyId[]) {
        const rs = directs.filter(r => r.family === f);
        if (!rs.length) continue;
        const ok = rs.every(r => failed(r.gates).length === 0);
        const best = f === 'graph'
            ? `iso: degreeSequence ≤ ${Math.max(...rs.filter(r => r.sub === 'iso').map(r => r.values['degreeSequence']))} %, map: signature ≤ ${Math.max(...rs.filter(r => r.sub === 'map').map(r => r.values['signature']))} %`
            : `operatorPrior ≤ ${Math.max(...rs.map(r => r.values['operatorPrior']))} % (шанс 50 %)`;
        const learned = rs.filter(r => r.values['learned'] !== undefined).map(r => r.values['learned']);
        L.push(`| ${f} | ${LEGACY[f] ?? '—'} | ${best} | ${learned.length ? Math.max(...learned) + ' % (макс.)' : '—'} | ${ok ? 'пройдены' : '**провал**'} |`);
    }
    L.push('', '## По уровням', '');
    L.push('| Семейство | L | E / C / U, % | prior | kindPrior | degree | myopic | семейные боты | learned | oneModel «Следует» среди U | ослабления | p50 / p95, мс | провалы |');
    L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of levels) {
        const fam = Object.entries(r.bots).filter(([id]) => !['prior', 'kindPrior', 'degreeGeneral', 'myopic', 'oneModel'].includes(id)).map(([id, v]) => `${id} ${v}`).join(', ');
        const fails = failed(r.gates).map(g => `${g.name} ${g.value}`).join('; ') || '—';
        L.push(`| ${r.family} | ${r.level} | ${r.classes.entailed} / ${r.classes.contradicted} / ${r.classes.undetermined} | ${r.bots['prior']} | ${r.bots['kindPrior']} | ${r.bots['degreeGeneral']} | ${r.bots['myopic']} | ${fam} | ${r.learned ?? '—'} | ${r.oneModelEonU} | ${r.relaxations} | ${r.p50.toFixed(1)} / ${r.p95.toFixed(1)} | ${fails} |`);
    }
    L.push('', 'Пороги: каждый эвристический бот ≤ доля мажоритарного класса + 5 п.п.; myopic (L ≥ 4) ≤ 38,3 %; learned ≤ 40,3 %; классы 30–36,7 %; ослабления ≤ 10 %; p95 ≤ 40 мс; oneModel «Следует» среди «Неизвестно» 40–60 % (L ≥ 3). На L2 myopic не ограничен: нелокальность требуется с L4.', '');
    L.push('## Формат выбора («Кто k-й…?»)', '');
    L.push('| Семейство | L | шанс, % | «Нельзя определить», % | бот degree, % | бот firstMention, % | ослабления, % |');
    L.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const c of choices) L.push(`| ${c.family} | ${c.level} | ${c.chance} | ${c.none} | ${c.degree} | ${c.firstMention} | ${c.relaxations} |`);
    L.push('', '## Бинарный формат (только баланс)', '');
    L.push('| Семейство | L | «Верно», % |');
    L.push('| --- | --- | --- |');
    for (const b of binaries) L.push(`| ${b.family} | ${b.level} | ${b.entailed} |`);
    if (directs.length) {
        L.push('', '## Сравнение графов и логические связки (собственные гейты §5.8, §5.10)', '');
        L.push('| Семейство | Подтип | L | значения | только в отчёте | p50 / p95, мс | провалы |');
        L.push('| --- | --- | --- | --- | --- | --- | --- |');
        for (const r of directs) {
            const vals = Object.entries(r.values).map(([k, v]) => `${k} ${v}`).join(', ');
            const rep = Object.entries(r.reported).map(([k, v]) => `${k} ${v}`).join(', ') || '—';
            const fails = failed(r.gates).map(g => `${g.name} ${g.value}`).join('; ') || '—';
            L.push(`| ${r.family} | ${r.sub} | ${r.level} | ${vals} | ${rep} | ${r.p50.toFixed(1)} / ${r.p95.toFixed(1)} | ${fails} |`);
        }
        L.push('', 'Пороги: iso — баланс 47–53 %, degreeSequence и edgeTypeCount ≤ 55 %, learned ≤ 57 %; map — signature ≤ 1/(средний размер класса) + 5 п.п., с L6 средний класс ≥ 2, firstMention ≤ ср.(1/n) + 5 п.п.; связки — баланс 47–53 %, operatorPrior ≤ 55 %, learned ≤ 57 %. jointDegree (iso) и firstOnly (связки) — стратегии с частичным решением, только в отчёте.', '');
    }
    writeFileSync(join(dir, 'cue-audit-v5.md'), L.join('\n') + '\n');
});
