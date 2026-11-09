// Constructive cue control: choose (answer, desired shallow-bot prediction) first, then build
// premises so that both hold; verify with the exact solver. Validates the spec's core claim.
type Ans = "true" | "false" | "unknown";
function xmur3(str: string) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; }; }
function sfc32(a: number, b: number, c: number, d: number) { return () => { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return (t >>> 0) / 4294967296; }; }
class Rng { next: () => number; constructor(seed: string) { const s = xmur3(seed); this.next = sfc32(s(), s(), s(), s()); }
  int(n: number) { return Math.floor(this.next() * n); } pick<T>(a: T[]) { return a[this.int(a.length)]; }
  shuffle<T>(a: T[]) { for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; } }
type Premise = { kind: "gt"; a: number; b: number } | { kind: "between"; mid: number; x: number; y: number };
const ents = (p: Premise) => (p.kind === "gt" ? [p.a, p.b] : [p.mid, p.x, p.y]);
const holds = (p: Premise, r: number[]) => p.kind === "gt" ? r[p.a] > r[p.b] : (r[p.x] < r[p.mid] && r[p.mid] < r[p.y]) || (r[p.y] < r[p.mid] && r[p.mid] < r[p.x]);
function models(premises: Premise[], entities: number[], cap = 1e6): number[][] {
  const out: number[][] = []; const n = entities.length; const rank: number[] = []; const used = new Array(n).fill(false);
  const pos = new Map(entities.map((e, i) => [e, i])); const byLast = new Map<number, Premise[]>();
  for (const p of premises) { const last = Math.max(...ents(p).map(e => pos.get(e)!)); (byLast.get(last) || byLast.set(last, []).get(last)!).push(p); }
  const rec = (i: number) => { if (out.length >= cap) return; if (i === n) { out.push(rank.slice()); return; }
    for (let v = 0; v < n; v++) { if (used[v]) continue; used[v] = true; rank[entities[i]] = v; if ((byLast.get(i) || []).every(p => holds(p, rank))) rec(i + 1); used[v] = false; } };
  rec(0); return out;
}
function classify(premises: Premise[], q: { a: number; b: number }, entities: number[]): Ans { let t = 0, f = 0; for (const r of models(premises, entities)) (r[q.a] > r[q.b] ? t++ : f++); return f === 0 ? "true" : t === 0 ? "false" : "unknown"; }
function minimalSupport(premises: Premise[], q: { a: number; b: number }, target: Ans, kMax: number): number {
  const idx = premises.map((_, i) => i);
  const subsets = (k: number, start = 0, acc: number[] = [], res: number[][] = []) => { if (acc.length === k) { res.push(acc.slice()); return res; } for (let i = start; i < idx.length; i++) { acc.push(i); subsets(k, i + 1, acc, res); acc.pop(); } return res; };
  for (let k = 1; k <= kMax; k++) for (const s of subsets(k)) { const sub = s.map(i => premises[i]); const es = [...new Set([...sub.flatMap(ents), q.a, q.b])]; if (classify(sub, q, es) === target) return k; }
  return Infinity;
}
function netScoreBot(premises: Premise[], q: { a: number; b: number }): Ans { const s: Record<number, number> = {}; for (const p of premises) if (p.kind === "gt") { s[p.a] = (s[p.a] || 0) + 1; s[p.b] = (s[p.b] || 0) - 1; } const d = (s[q.a] || 0) - (s[q.b] || 0); return d > 0 ? "true" : d < 0 ? "false" : "unknown"; }
function degreeBot(premises: Premise[], q: { a: number; b: number }): Ans { // "the more-mentioned term is bigger"
  const s: Record<number, number> = {}; for (const p of premises) for (const e of ents(p)) s[e] = (s[e] || 0) + 1; const d = (s[q.a] || 0) - (s[q.b] || 0); return d > 0 ? "true" : d < 0 ? "false" : "unknown"; }
function myopicBot(premises: Premise[], q: { a: number; b: number }): Ans { const sub = premises.filter(p => ents(p).includes(q.a) || ents(p).includes(q.b)); return classify(sub, q, [...new Set([...sub.flatMap(ents), q.a, q.b])]); }

// constructive generator
function build(rng: Rng, n: number, m: number, target: Ans, wantNet: Ans, sMin: number, sMax: number, pBetween: number) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const world = rng.shuffle([...Array(n).keys()]); // world[e] = rank (0 = smallest)
    const byRank = [...Array(n).keys()].sort((u, v) => world[u] - world[v]);
    const premises: Premise[] = []; const keys = new Set<string>();
    const add = (p: Premise) => { const k = p.kind === "gt" ? `g${Math.min(p.a, p.b)}-${Math.max(p.a, p.b)}` : `b${p.mid}`; if (keys.has(k)) return false; keys.add(k); premises.push(p); return true; };
    const gt = (u: number, v: number): Premise => world[u] > world[v] ? { kind: "gt", a: u, b: v } : { kind: "gt", a: v, b: u };
    // 1) random connected skeleton (tree, occasionally ternary "between")
    const perm = rng.shuffle([...Array(n).keys()]);
    for (let i = 1; i < n; i++) {
      const e = perm[i];
      if (i >= 2 && rng.next() < pBetween) { const [x, y] = rng.shuffle(perm.slice(0, i)).slice(0, 2); const tr = [e, x, y].sort((u, v) => world[u] - world[v]); if (add({ kind: "between", mid: tr[1], x: tr[0], y: tr[2] })) continue; }
      add(gt(e, perm[rng.int(i)]));
    }
    // 2) decoys around candidate query pairs are added later; pick query pair consistent with target among non-adjacent pairs
    const all = [...Array(n).keys()];
    const together = (u: number, v: number) => premises.some(p => ents(p).includes(u) && ents(p).includes(v));
    const pairs = rng.shuffle(all.flatMap(a => all.filter(b => b !== a && !together(a, b)).map(b => ({ a, b }))));
    for (const q of pairs.slice(0, 6)) {
      const base = premises.slice(); const baseKeys = new Set(keys);
      // 3) steer net-score toward wantNet with decoy comparisons touching query entities (true in world)
      const desiredSign = wantNet === "true" ? 1 : wantNet === "false" ? -1 : 0;
      let guard = 0;
      while (premises.length < m && guard++ < 20) {
        const d = netScoreBot(premises, q) === "true" ? 1 : netScoreBot(premises, q) === "false" ? -1 : 0;
        if (d === desiredSign && premises.length >= m - 1) break;
        // choose an entity and partner to move the difference toward the desired sign
        const moveUp = d < desiredSign; // need net(a)-net(b) larger
        const who = rng.next() < 0.5 ? q.a : q.b; // touch a (raise/lower) or b
        const raise = (who === q.a) === moveUp; // raising net(who) means who wins a comparison
        const partners = all.filter(x => x !== q.a && x !== q.b && !together(who, x) && (raise ? world[x] < world[who] : world[x] > world[who]));
        if (!partners.length) continue;
        add(gt(who, rng.pick(partners)));
      }
      while (premises.length < m) { const [u, v] = rng.shuffle(all.filter(x => x !== q.a && x !== q.b)).slice(0, 2); if (u === undefined || v === undefined) break; add(gt(u, v)); if (premises.length >= m) break; }
      if (premises.length === m && netScoreBot(premises, q) === wantNet) {
        const ans = classify(premises, q, all);
        if (ans === target) {
          if (ans === "unknown") return { premises, q, ans, support: NaN };
          const s = minimalSupport(premises, q, ans, sMax);
          if (s >= sMin && s <= sMax && (s < 3 || myopicBot(premises, q) === "unknown")) return { premises, q, ans, support: s };
        }
      }
      premises.length = 0; premises.push(...base); keys.clear(); baseKeys.forEach(k => keys.add(k));
    }
  }
  return null;
}

const rng = new Rng("proto-v5-constructive");
const out: string[] = [];
for (const [n, m, sMin, sMax, pB] of [[5, 5, 2, 3, 0.3], [6, 7, 3, 4, 0.4], [7, 8, 3, 5, 0.5]] as [number, number, number, number, number][]) {
  const N = 300; let made = 0; const acc = { net: 0, deg: 0, myo: 0 }; const times: number[] = []; const fails: Record<string, number> = {};
  for (let k = 0; k < N; k++) {
    const target = (["true", "false", "unknown"] as Ans[])[k % 3];
    const wantNet = (["true", "false", "unknown"] as Ans[])[Math.floor(k / 3) % 3]; // independent of target by design
    const t = performance.now();
    const it = build(rng, n, m, target, wantNet, sMin, sMax, pB);
    times.push(performance.now() - t);
    if (!it) { fails[`${target}/${wantNet}`] = (fails[`${target}/${wantNet}`] || 0) + 1; continue; }
    made++;
    if (netScoreBot(it.premises, it.q) === it.ans) acc.net++;
    if (degreeBot(it.premises, it.q) === it.ans) acc.deg++;
    if (myopicBot(it.premises, it.q) === it.ans) acc.myo++;
  }
  times.sort((a, b) => a - b);
  out.push(`n=${n} m=${m} σ∈[${sMin},${sMax}]: made ${made}/${N} p50=${times[N >> 1].toFixed(1)}ms p95=${times[Math.floor(N * .95)].toFixed(1)}ms | net-score=${(100 * acc.net / made).toFixed(0)}% degree=${(100 * acc.deg / made).toFixed(0)}% myopic=${(100 * acc.myo / made).toFixed(0)}% (chance 33%) | infeasible cells: ${JSON.stringify(fails)}`);
}
console.log(out.join("\n"));
