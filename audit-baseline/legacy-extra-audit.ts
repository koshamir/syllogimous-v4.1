import "./stubs/localstorage.js";
import { GameService } from "../src/app/syllogimous/services/game.service";
import { ProgressAndPerformanceService } from "../src/app/syllogimous/services/progress-and-performance.service";
import { Settings } from "../src/app/syllogimous/models/settings.models";
import { EnumQuestionType } from "../src/app/syllogimous/constants/question.constants";
const origLog = console.log; console.log = () => {}; console.error = () => {};
const game = new GameService({} as any, {} as any, new ProgressAndPerformanceService(), {} as any);
game.logger.setLevel("error");
const N = 1500; const out: string[] = [];
function S(neg: boolean, meta: boolean) { const s = new Settings(); s.enabled.negation = neg; s.enabled.meta = meta; s.enabled.meaningfulWords = false; return s; }
// 1) Direction2D: how often is an adjacent diagonal premise/conclusion rendered with ambiguous (partial) inversion?
game.playgroundSettings = S(true, false);
let amb = 0, tot = 0;
for (let k = 0; k < N; k++) {
  const q = game.getCreateFn(EnumQuestionType.Direction, 4)();
  tot++;
  const all = [...q.premises, q.conclusion as string];
  if (all.some(h => /в соседней клетке <span class="is-negated">к (северо|юго)-/.test(h))) amb++;
}
out.push(`Direction2D (negation on, n=4): items containing a red diagonal 'в соседней клетке' phrase (only one axis actually inverted in ~2/3 of them): ${(100*amb/tot).toFixed(1)}%`);
// 2) Direction3D priors
for (const type of [EnumQuestionType.Direction3DSpatial, EnumQuestionType.Direction3DTemporal]) {
  for (const n of [2, 4, 7]) {
    game.playgroundSettings = S(false, false);
    const pr: Record<string,[number,number]> = {};
    for (let k = 0; k < N; k++) {
      const q = game.getCreateFn(type, n)();
      const t = (q.conclusion as string).replace(/<[^>]+>/g, "");
      const steps = [...t.matchAll(/на (\d+)/g)].map(m => +m[1]);
      const key = `parts=${steps.length}/max=${Math.max(0,...steps)}`;
      pr[key] = pr[key] || [0,0]; pr[key][+q.isValid]++;
    }
    const top = Object.entries(pr).sort((a,b)=>(b[1][0]+b[1][1])-(a[1][0]+a[1][1])).slice(0,8).map(([k,[f,t]])=>`${k}:${(100*t/(t+f)).toFixed(0)}%v(n=${t+f})`).join(" ");
    out.push(`${type} n=${n}: ${top}`);
  }
}
// 3) Binary: operator priors
game.playgroundSettings = S(false, false);
const opPr: Record<string,[number,number]> = {};
for (let k = 0; k < 600; k++) {
  const q = game.getCreateFn(EnumQuestionType.Binary, 4)();
  const t = (q.conclusion as string);
  const op = t.includes("Верны оба") ? "and" : t.includes("Не оба") ? "nand" : t.includes("возможно оба") ? "or" : t.includes("Неверны оба") ? "nor" : t.includes("только одно") ? "xor" : "xnor";
  opPr[op] = opPr[op] || [0,0]; opPr[op][+q.isValid]++;
}
out.push("Binary n=4 operator priors: " + Object.entries(opPr).map(([k,[f,t]])=>`${k}:${(100*t/(t+f)).toFixed(0)}%v(n=${t+f})`).join(" "));
// 4) Structural shape: degree of each term across premises (Comparison/Distinction) -> always a path?
for (const type of [EnumQuestionType.Distinction, EnumQuestionType.ComparisonNumerical]) {
  let paths = 0, endToEnd = 0;
  for (let k = 0; k < 500; k++) {
    const q = game.getCreateFn(type, 6)();
    const deg: Record<string, number> = {};
    for (const p of q.premises) for (const s of [...p.matchAll(/<span class="subject">(.*?)<\/span>/g)].map(m=>m[1])) deg[s] = (deg[s]||0)+1;
    const ends = Object.entries(deg).filter(([,d]) => d === 1).map(([s]) => s);
    if (Object.values(deg).every(d => d <= 2) && ends.length === 2) paths++;
    const cs = [...(q.conclusion as string).matchAll(/<span class="subject">(.*?)<\/span>/g)].map(m=>m[1]);
    if (cs.every(s => ends.includes(s))) endToEnd++;
  }
  out.push(`${type} n=6: premise graph is a simple path in ${(100*paths/500).toFixed(0)}% of items; conclusion joins the two path ends in ${(100*endToEnd/500).toFixed(0)}%`);
}
console.log = origLog; console.log(out.join("\n"));
