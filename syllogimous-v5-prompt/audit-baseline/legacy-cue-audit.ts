// Surface-cue audit of the legacy Syllogimous generators.
// Every "bot" below sees only what the player sees (rendered premise/conclusion HTML,
// instructions), never hidden technical fields. If a bot that does NOT integrate the
// premises scores well above 50%, the generator leaks a shortcut.
import "./stubs/localstorage.js";
import { GameService } from "../src/app/syllogimous/services/game.service";
import { ProgressAndPerformanceService } from "../src/app/syllogimous/services/progress-and-performance.service";
import { Settings } from "../src/app/syllogimous/models/settings.models";
import { EnumQuestionType } from "../src/app/syllogimous/constants/question.constants";
import { LS_SYLLOGISM_GENERATOR } from "../src/app/syllogimous/constants/local-storage.constants";

const origLog = console.log;
console.log = () => {};
const game = new GameService({} as any, {} as any, new ProgressAndPerformanceService(), {} as any);
game.logger.setLevel("error");
game.logger.setVerbose(false);
console.error = () => {};

// ---------- surface parsing ----------
const SUBJ = /<span class="subject">(.*?)<\/span>/g;
const subjects = (h: string) => [...h.matchAll(SUBJ)].map(m => m[1]);
const red = (h: string) => [...h.matchAll(/<span class="is-negated">(.*?)<\/span>/g)].map(m => m[1]);
const isRed = (h: string, word: string) => red(h).some(w => w.includes(word));
const asArr = (c: string | string[]) => (Array.isArray(c) ? c : [c]);

type Acc = { n: number; ok: number; abstain: number };
const acc = (): Acc => ({ n: 0, ok: 0, abstain: 0 });
function score(a: Acc, pred: boolean | null, truth: boolean) {
    a.n++;
    if (pred === null) { a.abstain++; if (Math.random() < 0.5 === truth) a.ok++; return; } // coin flip on abstain
    if (pred === truth) a.ok++;
}
const pct = (a: Acc) => (a.n ? (100 * a.ok / a.n).toFixed(1) + "%" : "-");

function settingsWith(neg: boolean, meta: boolean) {
    const s = new Settings();
    s.enabled.negation = neg;
    s.enabled.meta = meta;
    s.enabled.meaningfulWords = false; // 3-letter pseudowords: unambiguous parsing
    s.enabled.useEmojis = false;
    return s;
}

// ---------- Distinction ----------
function parseDistinction(h: string) {
    const [a, b, c, d] = subjects(h);
    if (h.startsWith("Отношение")) {
        const shownSame = h.includes("такое же");
        const r = isRed(h, "такое же") || isRed(h, "противоположно");
        return { meta: true, a, b, c, d, same: shownSame !== r };
    }
    const shownSame = h.includes("равен");
    const r = isRed(h, "равен") || isRed(h, "противоположен");
    return { meta: false, a, b, same: shownSame !== r };
}

// ---------- Comparison ----------
function parseComparison(h: string) {
    const [a, b, c, d] = subjects(h);
    if (h.startsWith("Отношение")) {
        const shownSame = h.includes("такое же");
        const r = isRed(h, "такое же") || isRed(h, "противоположно");
        return { meta: true, a, b, c, d, same: shownSame !== r, gt: false };
    }
    const shownGt = h.includes("больше") || h.includes("позже");
    const r = red(h).length > 0;
    return { meta: false, a, b, gt: shownGt !== r, same: false };
}

// ---------- Syllogism ----------
type K = "all" | "no" | "some" | "some_not";
function parseSyl(h: string): [string, K, string] {
    const [a, b] = subjects(h);
    const t = h.replace(/<span class="subject">.*?<\/span>/g, "S");
    let k: K;
    if (t.includes("Некоторые")) {
        const neg = /не относ/.test(t.replace(/<[^>]+>/g, ""));
        k = neg ? "some_not" : "some";
        if (red(h).length) k = k === "some" ? "some_not" : "some";
    } else if (t.includes("Ни один")) {
        k = "no";
        if (red(h).length) k = "all";
    } else {
        k = "all";
        if (red(h).length) k = "no";
    }
    return [a, k, b];
}

// ---------- Arrangement ----------
function parseInstructionOrder(instr: string) {
    return subjects(instr);
}
function arrangementTruth(pos: Record<string, number>, n: number, linear: boolean, h: string): boolean | null {
    const [a, b] = subjects(h);
    const i = pos[a], j = pos[b];
    if (i === undefined || j === undefined) return null;
    const text = h.replace(/<[^>]+>/g, "");
    const r = red(h).length > 0;
    const flip = (w: string) => (r ? ({ "слева": "справа", "справа": "слева", "левее": "правее", "правее": "левее" } as any)[w] || w : w);
    const stepsM = text.match(/на (\d+) позици/);
    const steps = stepsM ? +stepsM[1] : null;
    if (linear) {
        if (text.includes("сразу")) {
            const w = flip(text.includes("слева") ? "слева" : "справа");
            return w === "слева" ? i + 1 === j : i - 1 === j;
        }
        if (text.includes("рядом")) return Math.abs(i - j) === 1;
        const w = flip(text.includes("левее") ? "левее" : "правее");
        if (steps !== null) return w === "левее" ? (i < j && j - i === steps) : (i > j && i - j === steps);
        return w === "левее" ? i < j : i > j;
    } else {
        const cw = (j - i + n) % n; // distance going "left" per generator convention (i+1)
        const ccw = (n - cw) % n;
        const dist = Math.min(cw, ccw);
        const half = n / 2;
        if (text.includes("напротив")) return n % 2 === 0 && cw === half;
        if (text.includes("сразу")) {
            const w = flip(text.includes("слева") ? "слева" : "справа");
            return w === "слева" ? cw === 1 : ccw === 1;
        }
        if (text.includes("рядом")) return dist === 1;
        const w = flip(text.includes("левее") ? "левее" : "правее");
        const isLeft = cw < half && cw !== 0;
        const isRight = cw > half;
        if (steps !== null) return (w === "левее" ? (isLeft || cw === half) : (isRight || cw === half)) && dist === steps;
        return w === "левее" ? isLeft : isRight;
    }
}

// ---------- Direction 2D ----------
const DIRV: Record<string, [number, number]> = { "севере": [0, 1], "юге": [0, -1], "востоке": [1, 0], "западе": [-1, 0] };
function parseDir2D(h: string) {
    const [a, b] = subjects(h);
    const text = h.replace(/<[^>]+>/g, "");
    const r = (w: string) => isRed(h, w);
    let dx = 0, dy = 0;
    const flipDir = (d: string) => ({ "севере": "юге", "юге": "севере", "востоке": "западе", "западе": "востоке" } as any)[d];
    if (text.includes("в соседней клетке")) {
        const m = text.match(/к (северо-востоку|северо-западу|юго-востоку|юго-западу|северу|югу|востоку|западу)/)!;
        const map: Record<string, [number, number]> = { "северо-востоку": [1, 1], "северо-западу": [-1, 1], "юго-востоку": [1, -1], "юго-западу": [-1, -1], "северу": [0, 1], "югу": [0, -1], "востоку": [1, 0], "западу": [-1, 0] };
        let v = map[m[1]];
        if (red(h).length) v = [-v[0], -v[1]];
        return { a, b, dx: v[0], dy: v[1], adjacent: true, maxStep: 1 };
    }
    let maxStep = 0;
    for (const m of text.matchAll(/на (\d+) шаг\S* к (северу|югу|востоку|западу)/g)) {
        const n = +m[1];
        maxStep = Math.max(maxStep, n);
        const dirWord = ({ "северу": "севере", "югу": "юге", "востоку": "востоке", "западу": "западе" } as any)[m[2]];
        const isR = r("к " + m[2]);
        const d = isR ? flipDir(dirWord) : dirWord;
        dx += DIRV[d][0] * n; dy += DIRV[d][1] * n;
    }
    return { a, b, dx, dy, adjacent: false, maxStep };
}

// ---------- Graph ----------
function parseEdge(h: string): [string, string, string] | null {
    if (h.startsWith("Отношение")) return null;
    const [a, b] = subjects(h);
    let arrow = h.includes("ведёт к") ? "→" : h.includes("идёт от") ? "←" : "↔";
    if (red(h).length && arrow !== "↔") arrow = arrow === "→" ? "←" : "→";
    return [a, arrow, b];
}
function degSeq(edges: [string, string, string][]) {
    const g: Record<string, { i: number; o: number }> = {};
    const add = (x: string) => (g[x] = g[x] || { i: 0, o: 0 });
    for (const [a, r, b] of edges) {
        add(a); add(b);
        if (r === "→") { g[a].o++; g[b].i++; } else if (r === "←") { g[b].o++; g[a].i++; } else { g[a].o++; g[a].i++; g[b].o++; g[b].i++; }
    }
    return Object.values(g).map(x => `${x.i},${x.o}`).sort().join("|");
}

// ---------- run ----------
const N = Number(process.env.N || 1500);
const out: string[] = [];
const log = (s: string) => out.push(s);

function gen(type: EnumQuestionType, n: number) {
    return game.getCreateFn(type, n)();
}

for (const [neg, meta] of [[false, false], [true, false], [true, true]] as [boolean, boolean][]) {
    game.playgroundSettings = settingsWith(neg, meta);
    log(`\n=== negation=${neg} meta=${meta} ===`);

    // Distinction
    for (const n of [2, 4, 6, 10]) {
        const base = acc(), parity = acc();
        let valid = 0, fails = 0;
        for (let k = 0; k < N; k++) {
            let q; try { q = gen(EnumQuestionType.Distinction, n); } catch { fails++; continue; }
            valid += +q.isValid;
            score(base, true, q.isValid);
            const ps = q.premises.map(parseDistinction);
            const concl = parseDistinction(q.conclusion as string);
            const opp = ps.filter(p => !p.meta && !p.same).length;
            const pred = (opp % 2 === 1) === !concl.same;
            score(parity, pred, q.isValid);
        }
        log(`Distinction n=${n}: P(valid)=${(100 * valid / N).toFixed(1)}%  bot[count 'противоположен' parity, no chaining]=${pct(parity)}  fails=${fails}`);
    }

    // Comparison
    for (const type of [EnumQuestionType.ComparisonNumerical, EnumQuestionType.ComparisonChronological]) {
        for (const n of [2, 3, 5, 8, 12]) {
            const net = acc(), solver = acc(); let fails = 0;
            for (let k = 0; k < N; k++) {
                let q; try { q = gen(type, n); } catch { fails++; continue; }
                const ps = q.premises.map(parseComparison);
                const c = parseComparison(q.conclusion as string);
                // net-score heuristic: +1 when shown as bigger/later, -1 when smaller/earlier; ignore meta premises
                const s: Record<string, number> = {};
                for (const p of ps) if (!p.meta) { s[p.a] = (s[p.a] || 0) + (p.gt ? 1 : -1); s[p.b] = (s[p.b] || 0) + (p.gt ? -1 : 1); }
                const da = s[c.a] || 0, db = s[c.b] || 0;
                score(net, da === db ? null : (c.gt ? da > db : da < db), q.isValid);
                // reference solver on non-meta premises (reachability)
                const adj: Record<string, string[]> = {};
                for (const p of ps) if (!p.meta) { const [big, small] = p.gt ? [p.a, p.b] : [p.b, p.a]; (adj[big] = adj[big] || []).push(small); }
                const reach = (x: string, y: string) => { const st = [x], seen = new Set<string>(); while (st.length) { const u = st.pop()!; if (u === y) return true; if (seen.has(u)) continue; seen.add(u); for (const v of adj[u] || []) st.push(v); } return false; };
                const aBig = reach(c.a, c.b), bBig = reach(c.b, c.a);
                score(solver, aBig || bBig ? (c.gt ? aBig : bBig) : null, q.isValid);
            }
            log(`${type} n=${n}: bot[net-score of each term, no chaining]=${pct(net)} (abstain ${(100 * net.abstain / Math.max(1, net.n)).toFixed(0)}%)  ref-solver(non-meta)=${pct(solver)} fails=${fails}`);
        }
    }

    // Syllogism (both generators)
    for (const g of ["canyon", "fredo"]) {
        localStorage.setItem(LS_SYLLOGISM_GENERATOR, g);
        for (const n of [2, 3, 4, 6, 8]) {
            const byKind: Record<string, { v: number; t: number }> = {};
            const atm = acc(), prior = acc(); let fails = 0;
            const samples: { k: K; truth: boolean; atmos: boolean }[] = [];
            for (let k = 0; k < N; k++) {
                let q; try { q = gen(EnumQuestionType.Syllogism, n); } catch { fails++; continue; }
                const ps = q.premises.map(parseSyl);
                const c = parseSyl(q.conclusion as string);
                byKind[c[1]] = byKind[c[1]] || { v: 0, t: 0 };
                byKind[c[1]].t++; byKind[c[1]].v += +q.isValid;
                // atmosphere heuristic (Woodworth & Sells): any negative premise -> negative concl; any particular -> particular
                const anyNeg = ps.some(p => p[1] === "no" || p[1] === "some_not");
                const anyPart = ps.some(p => p[1] === "some" || p[1] === "some_not");
                const expected: K = anyNeg ? (anyPart ? "some_not" : "no") : (anyPart ? "some" : "all");
                score(atm, c[1] === expected, q.isValid);
                samples.push({ k: c[1], truth: q.isValid, atmos: c[1] === expected });
            }
            // "prior" bot: predict the majority class for this conclusion quantifier (learned on first half, tested on second)
            const half = Math.floor(samples.length / 2);
            const tr: Record<string, [number, number]> = {};
            for (const s of samples.slice(0, half)) { tr[s.k] = tr[s.k] || [0, 0]; tr[s.k][+s.truth]++; }
            for (const s of samples.slice(half)) { const t = tr[s.k]; score(prior, t ? t[1] >= t[0] : null, s.truth); }
            const kinds = Object.entries(byKind).map(([k, x]) => `${k}:${(100 * x.v / x.t).toFixed(0)}%valid(n=${x.t})`).join(" ");
            log(`Syllogism[${g}] n=${n}: bot[atmosphere]=${pct(atm)} bot[quantifier-prior, held-out]=${pct(prior)} | ${kinds} fails=${fails}`);
        }
    }

    // Arrangements: does the instruction leak the order?
    for (const type of [EnumQuestionType.LinearArrangement, EnumQuestionType.CircularArrangement]) {
        for (const n of [2, 3, 5, 8]) {
            const leak = acc(); let fails = 0; const relPrior: Record<string, [number, number]> = {};
            for (let k = 0; k < N; k++) {
                let q; try { q = gen(type, n); } catch { fails++; continue; }
                const order = parseInstructionOrder(q.instructions![0]);
                const pos: Record<string, number> = {}; order.forEach((s, i) => (pos[s] = i));
                const t = arrangementTruth(pos, order.length, type === EnumQuestionType.LinearArrangement, q.conclusion as string);
                score(leak, t, q.isValid);
                const text = (q.conclusion as string).replace(/<[^>]+>/g, "");
                const rel = text.includes("рядом") ? "рядом" : text.includes("напротив") ? "напротив" : text.includes("сразу") ? "сразу" : /на \d+ позици/.test(text) ? "N позиций" : "левее/правее";
                relPrior[rel] = relPrior[rel] || [0, 0]; relPrior[rel][+q.isValid]++;
            }
            const rp = Object.entries(relPrior).map(([k, [f, t]]) => `${k}:${(100 * t / (t + f)).toFixed(0)}%valid(n=${t + f})`).join(" ");
            log(`${type} n=${n}: bot[read order from instruction line, ignore premises]=${pct(leak)} | ${rp} fails=${fails}`);
        }
    }

    // Direction 2D
    for (const n of [2, 3, 5, 8]) {
        const adjBot = acc(), stepBot = acc(), solver = acc(); let adjN = 0, adjValid = 0, fails = 0;
        for (let k = 0; k < N; k++) {
            let q; try { q = gen(EnumQuestionType.Direction, n); } catch { fails++; continue; }
            const ps = q.premises.map(parseDir2D);
            const c = parseDir2D(q.conclusion as string);
            if (c.adjacent) { adjN++; adjValid += +q.isValid; }
            score(adjBot, c.adjacent ? true : null, q.isValid);
            const maxPrem = Math.max(...ps.map(p => p.maxStep));
            score(stepBot, c.adjacent ? true : (c.maxStep > maxPrem ? false : null), q.isValid);
            // reference solver: BFS coordinates
            const pos: Record<string, [number, number]> = {}; pos[ps[0].a] = [0, 0];
            let changed = true;
            while (changed) { changed = false; for (const p of ps) { if (pos[p.b] && !pos[p.a]) { pos[p.a] = [pos[p.b][0] + p.dx, pos[p.b][1] + p.dy]; changed = true; } else if (pos[p.a] && !pos[p.b]) { pos[p.b] = [pos[p.a][0] - p.dx, pos[p.a][1] - p.dy]; changed = true; } } }
            const A = pos[c.a], B = pos[c.b];
            score(solver, A && B ? (A[0] - B[0] === c.dx && A[1] - B[1] === c.dy) : null, q.isValid);
        }
        log(`Direction2D n=${n}: P(valid | 'в соседней клетке')=${adjN ? (100 * adjValid / adjN).toFixed(0) : "-"}% (in ${(100 * adjN / N).toFixed(0)}% of items)  bot[adjacent→valid, step>max premise step→invalid, else guess]=${pct(stepBot)}  ref-solver=${pct(solver)} fails=${fails}`);
    }

    // Graph matching
    for (const n of [2, 3, 5, 8]) {
        const bidir = acc(), deg = acc(); let fails = 0;
        for (let k = 0; k < N; k++) {
            let q; try { q = gen(EnumQuestionType.GraphMatching, n); } catch { fails++; continue; }
            const pe = q.premises.map(parseEdge), ce = asArr(q.conclusion).map(parseEdge);
            const anyMeta = pe.includes(null) || ce.includes(null);
            const cnt = (es: any[]) => es.filter(e => e && e[1] === "↔").length;
            score(bidir, anyMeta ? null : cnt(pe) === cnt(ce), q.isValid);
            score(deg, anyMeta ? null : degSeq(pe as any) === degSeq(ce as any), q.isValid);
        }
        log(`GraphMatching n=${n}: bot[count of 'связан с' equal ⇒ same]=${pct(bidir)}  bot[degree sequence only]=${pct(deg)} fails=${fails}`);
    }

    // Analogy prior
    for (const n of [3, 5, 8]) {
        const pr: Record<string, [number, number]> = {}; let fails = 0;
        for (let k = 0; k < N; k++) {
            let q; try { q = gen(EnumQuestionType.Analogy, n); } catch { fails++; continue; }
            const h = q.conclusion as string;
            const shownSame = h.includes("такое же");
            const negated = h.includes("analogy-conclusion is-negated");
            const same = shownSame !== negated;
            const fam = q.premises.some(p => p.includes("равен") || p.includes("противоположен")) ? "distinction"
                : q.premises.some(p => /больше|меньше|позже|раньше/.test(p)) ? "comparison"
                : q.premises.some(p => /позици|сразу|рядом|напротив|левее|правее/.test(p)) ? "arrangement" : "direction";
            const key = `${fam}/${same ? "same" : "diff"}`;
            pr[key] = pr[key] || [0, 0]; pr[key][+q.isValid]++;
        }
        log(`Analogy n=${n}: ` + Object.entries(pr).sort().map(([k, [f, t]]) => `${k}:${(100 * t / (t + f)).toFixed(0)}%valid(n=${t + f})`).join(" ") + ` fails=${fails}`);
    }
}

console.log = origLog;
console.log(out.join("\n"));
