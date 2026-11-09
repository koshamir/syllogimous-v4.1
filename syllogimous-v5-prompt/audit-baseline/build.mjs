// Bundles an audit script together with the Syllogimous sources, replacing Angular
// packages with tiny stubs so the legacy generators run in plain Node.
// Usage (from the repository root):
//   node audit-baseline/build.mjs audit-baseline/legacy-cue-audit.ts audit-baseline/out/legacy.cjs
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const stub = (p) => path.join(here, "stubs", p);
const [entry = path.join(here, "legacy-cue-audit.ts"), outfile = path.join(here, "out", "legacy.cjs")] = process.argv.slice(2);

await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile,
  alias: {
    "@angular/core": stub("angular-core.js"),
    "@angular/router": stub("generic.js"),
    "@angular/forms": stub("generic.js"),
    "@ng-bootstrap/ng-bootstrap": stub("generic.js"),
    "rxjs": stub("generic.js"),
  },
  tsconfig: path.join(here, "..", "tsconfig.json"),
  logLevel: "error",
});
console.log("built", outfile);
