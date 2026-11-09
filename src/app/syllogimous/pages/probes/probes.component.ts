import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { EnumScreens } from '../../constants/game.constants';
import { ProbeSession, generateProbeSession } from '../../engine/probes/session';
import { SHAPES } from '../../engine/probes/lst';
import { GEdge } from '../../engine/families/graph';

export const LS_V5_PROBES = 'SYL_V5_PROBES';

export interface ProbeResult { date: string; lst: number; series: number; graph: number; ms: number }
export interface ExternalTest { name: string; date: string; score: string; note: string }
interface ProbesState { sessions: ProbeResult[]; external: ExternalTest[] }

export function loadProbes(): ProbesState {
    try {
        const raw = localStorage.getItem(LS_V5_PROBES);
        const s = raw ? JSON.parse(raw) : {};
        return { sessions: s.sessions ?? [], external: s.external ?? [] };
    } catch {
        return { sessions: [], external: [] };
    }
}

type Step = { kind: 'lst' | 'series' | 'graph'; i: number };

/** «Контроль переноса» (spec §11): untrained formats, no feedback, separate storage, levels untouched. */
@Component({
    selector: 'app-probes',
    templateUrl: './probes.component.html',
    styleUrls: ['./probes.component.css'],
})
export class ProbesComponent {
    EnumScreens = EnumScreens;
    SHAPES = SHAPES;
    phase: 'home' | 'run' | 'done' = 'home';
    state = loadProbes();
    session?: ProbeSession;
    steps: Step[] = [];
    k = 0;
    answers: (number | null)[] = [];
    seriesInput = '';
    startedAt = 0;
    last?: ProbeResult;
    ext: ExternalTest = { name: '', date: new Date().toISOString().slice(0, 10), score: '', note: '' };

    constructor(public router: Router) { }

    get step() {
        return this.steps[this.k];
    }

    get daysAgo(): number | null {
        const s = this.state.sessions[this.state.sessions.length - 1];
        return s ? Math.round((Date.now() - Date.parse(s.date)) / 86400000) : null;
    }

    start() {
        const today = new Date().toISOString().slice(0, 10);
        this.session = generateProbeSession(today + ':' + this.state.sessions.length);
        this.steps = [
            ...this.session.lst.map((_, i) => ({ kind: 'lst' as const, i })),
            ...this.session.series.map((_, i) => ({ kind: 'series' as const, i })),
            ...this.session.graph.map((_, i) => ({ kind: 'graph' as const, i })),
        ];
        this.k = 0;
        this.answers = [];
        this.seriesInput = '';
        this.startedAt = Date.now();
        this.phase = 'run';
    }

    answer(v: number | null) {
        this.answers.push(v);
        this.seriesInput = '';
        this.k++;
        if (this.k >= this.steps.length) this.finish();
    }

    submitSeries() {
        const v = Number(this.seriesInput.replace(',', '.').trim());
        this.answer(this.seriesInput.trim() === '' || Number.isNaN(v) ? null : v);
    }

    private finish() {
        const s = this.session!;
        const score = (kind: Step['kind']) => {
            let ok = 0;
            let n = 0;
            this.steps.forEach((st, j) => {
                if (st.kind !== kind) return;
                n++;
                const truth = kind === 'lst' ? s.lst[st.i].answer : kind === 'series' ? s.series[st.i].answer : s.graph[st.i].answer;
                if (this.answers[j] === truth) ok++;
            });
            return Math.round((1000 * ok) / Math.max(1, n)) / 10;
        };
        this.last = { date: new Date().toISOString().slice(0, 10), lst: score('lst'), series: score('series'), graph: score('graph'), ms: Date.now() - this.startedAt };
        this.state.sessions.push(this.last);
        this.save();
        this.phase = 'done';
    }

    save() {
        localStorage.setItem(LS_V5_PROBES, JSON.stringify(this.state));
    }

    addExternal() {
        if (!this.ext.name.trim()) return;
        this.state.external.push({ ...this.ext });
        this.save();
        this.ext = { name: '', date: new Date().toISOString().slice(0, 10), score: '', note: '' };
    }

    removeExternal(i: number) {
        this.state.external.splice(i, 1);
        this.save();
    }

    // ---------------------------------------------------------------- drawing helpers

    arrow(e: GEdge, pts: { x: number; y: number }[]) {
        const a = pts[e.u];
        const b = pts[e.v];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const r = 6.5;
        return { x1: a.x + (dx / len) * r, y1: a.y + (dy / len) * r, x2: b.x - (dx / len) * r, y2: b.y - (dy / len) * r };
    }

    line(kind: 'lst' | 'series' | 'graph'): string {
        const xs = this.state.sessions;
        if (!xs.length) return '';
        return xs.map((s, i) => `${xs.length === 1 ? 150 : 10 + (i * 280) / (xs.length - 1)},${110 - s[kind]}`).join(' ');
    }
}
