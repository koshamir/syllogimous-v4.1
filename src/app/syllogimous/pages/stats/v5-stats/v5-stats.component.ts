import { Component } from '@angular/core';
import { GameService } from 'src/app/syllogimous/services/game.service';
import { EngineService } from 'src/app/syllogimous/services/engine.service';
import { ANSWER_LABELS, FAMILY_TYPE, LURE_LABELS } from 'src/app/syllogimous/constants/v5.constants';
import { isCorrect, isTimeout, isV5, responseTime } from 'src/app/syllogimous/utils/answer.utils';
import { questionTypeLabel } from 'src/app/syllogimous/utils/russian.utils';
import { Answer, FamilyId, LureType } from 'src/app/syllogimous/engine';

interface Row { label: string; n: number; ok: number; acc: number }
interface Line { family: FamilyId; label: string; color: string; points: string; dots: { x: number; y: number }[]; last: number }

const COLORS = ['#2a6fdb', '#d9480f', '#2b8a3e', '#862e9c', '#c92a2a', '#1098ad', '#e67700', '#5c940d', '#364fc7', '#a61e4d', '#087f5b', '#495057', '#9c36b5', '#0b7285', '#e8590c', '#5f3dc4'];

/** v5 statistics (spec §6.8): family levels over time, accuracy by answer class, errors by lure, RT by σ. */
@Component({
    selector: 'app-v5-stats',
    templateUrl: './v5-stats.component.html',
})
export class V5StatsComponent {
    byClass: Row[] = [];
    byLure: Row[] = [];
    bySigma: { sigma: string; n: number; meanRt: number }[] = [];
    lines: Line[] = [];
    dates: string[] = [];
    width = 320;
    height = 160;
    hasV5 = false;

    constructor(game: GameService, engine: EngineService) {
        const qs = game.questions.filter(q => isV5(q) && !q.playgroundMode);
        this.hasV5 = qs.length > 0;

        const row = (label: string, xs: typeof qs): Row => {
            const ok = xs.filter(q => isCorrect(q) === true).length;
            return { label, n: xs.length, ok, acc: xs.length ? Math.round((100 * ok) / xs.length) : 0 };
        };
        const ternary = qs.filter(q => q.format === 'ternary');
        this.byClass = (['entailed', 'contradicted', 'undetermined'] as Answer[]).map(a => row(ANSWER_LABELS[a], ternary.filter(q => q.answerClass === a)));
        this.byLure = (['none', 'reversal', 'possible', 'nearMiss', 'surface'] as LureType[])
            .map(l => row(LURE_LABELS[l], qs.filter(q => q.lure === l))).filter(r => r.n > 0);

        const sig = new Map<string, number[]>();
        for (const q of qs) {
            if (isTimeout(q) || isCorrect(q) !== true) continue;
            const s = q.metrics?.support;
            const key = s === null || s === undefined ? '—' : s >= 7 ? '7+' : String(s);
            sig.set(key, [...(sig.get(key) ?? []), responseTime(q) / 1000]);
        }
        this.bySigma = [...sig.entries()]
            .sort((a, b) => (a[0] === '—' ? 1 : b[0] === '—' ? -1 : a[0].localeCompare(b[0], 'ru', { numeric: true })))
            .map(([sigma, xs]) => ({ sigma, n: xs.length, meanRt: Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10 }));

        const hist = engine.levelHistory;
        this.dates = Object.keys(hist).sort().slice(-60);
        const fams = [...new Set(this.dates.flatMap(d => Object.keys(hist[d])))] as FamilyId[];
        const played = new Set(qs.map(q => q.family));
        const X = (i: number) => (this.dates.length <= 1 ? this.width / 2 : 24 + (i * (this.width - 32)) / (this.dates.length - 1));
        const Y = (L: number) => this.y(L);
        this.lines = fams.filter(f => played.has(f)).map((f, k) => {
            const dots = this.dates.map((d, i) => (hist[d][f] !== undefined ? { x: X(i), y: Y(hist[d][f]!) } : null)).filter((p): p is { x: number; y: number } => !!p);
            const pts = dots.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
            const lastDate = [...this.dates].reverse().find(d => hist[d][f] !== undefined)!;
            return { family: f, label: questionTypeLabel(FAMILY_TYPE[f]), color: COLORS[k % COLORS.length], points: pts.join(' '), dots, last: Math.floor(hist[lastDate][f]!) };
        });
    }

    y(L: number) {
        return 8 + ((14 - Math.min(14, Math.max(2, L))) * (this.height - 24)) / 12;
    }
}
