"use strict";

// Static supplement to the generated-copy and catalog specs. This deliberately
// inspects visible template text, not CSS classes or developer identifiers.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "../src/app/syllogimous/experimental/ui");
const allowlist = new Set(["Syllogimous", "JSON", "RI", "Gf", "p50", "p95", "A", "B", "C", "D", "P", "Q", "ID"]);
const failures = [];
let templateCount = 0;

function checkTemplate(template, filename) {
    templateCount += 1;
    const withoutComments = template.replace(/<!--[\s\S]*?-->/g, "");
    const visibleAttributes = Array.from(withoutComments.matchAll(/\b(?:aria-label|title|placeholder|alt)\s*=\s*(["'])(.*?)\1/g)).map(match => match[2]);
    const text = [withoutComments.replace(/<[^>]*>/g, " "), ...visibleAttributes].join(" ")
        .replace(/{{[\s\S]*?}}/g, " ")
        .replace(/&(?:[a-z]+|#\d+);/gi, " ");
    for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9-]*/g)) {
        if (!allowlist.has(match[0])) failures.push({ filename: path.relative(process.cwd(), filename), token: match[0] });
    }
}

for (const filename of fs.readdirSync(root).map(name => path.join(root, name))) {
    if (filename.endsWith(".html")) checkTemplate(fs.readFileSync(filename, "utf8"), filename);
    if (!filename.endsWith(".ts") || filename.endsWith(".spec.ts")) continue;
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === "template" &&
            (ts.isNoSubstitutionTemplateLiteral(node.initializer) || ts.isStringLiteral(node.initializer))) {
            checkTemplate(node.initializer.text, filename);
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
}

if (failures.length) {
    process.stderr.write(JSON.stringify({ status: "failed", templateCount, failures }, null, 2) + "\n");
    process.exitCode = 1;
} else {
    process.stdout.write(JSON.stringify({ status: "passed", templateCount, scope: "static visible template text; dynamic copy is covered by Jasmine specs" }, null, 2) + "\n");
}
