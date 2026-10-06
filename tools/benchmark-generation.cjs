"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const REGISTRY_FILE = path.join(
    PROJECT_ROOT,
    "dist",
    "audit-core",
    "reasoning-core",
    "generators",
    "generator-registry.js",
);
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, "reports", "generation-benchmark.json");
const DEFAULT_SEMANTICS_VERSION = "ri-explicit-nonempty/1.0.0";
const CONFIG = Object.freeze({
    configVersion: "generation-benchmark/1.0.0",
    seedPrefix: "generation-benchmark-v1",
    warmupItemsPerFamily: 5,
    measuredItemsPerFamily: 100,
    maxAttemptsPerItem: 16,
    wallTimeBudgetMs: 250,
    displayedPremises: Object.freeze({ min: 1, max: 7 }),
});

function monotonicMilliseconds() {
    return Number(process.hrtime.bigint()) / 1_000_000;
}

function percentile(values, probability) {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.max(0, Math.ceil(sorted.length * probability) - 1)];
}

function round(value, digits = 4) {
    if (value === null) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function primaryDimension(family) {
    if (family === "transformations") return "transformComposition";
    if (family === "coupledFrames") return "crossFrameBridges";
    if (family === "contextScope") return "scopeDepth";
    if (family === "order" || family === "temporalIntervals") return "liveFrontier";
    if (family === "hierarchy" || family === "analogy") return "bindingInterference";
    return "branching";
}

function request(family, index, warmup) {
    const level = index % 5 + 1;
    const seed = `${CONFIG.seedPrefix}:${warmup ? "warmup" : "measured"}:${family}:${String(index).padStart(4, "0")}`;
    return {
        requestId: `benchmark:${family}:${index}:${warmup ? "warmup" : "measured"}`,
        seed,
        family,
        partition: index % 3 === 0 ? "training" : index % 3 === 1 ? "development" : "assessment",
        target: {
            level,
            primaryDimension: primaryDimension(family),
            displayedPremises: { ...CONFIG.displayedPremises },
            responseFormat: "threeWayInference",
            memoryVisibility: "visible",
            distractorCount: 0,
            timePressure: "none",
        },
        semanticsVersion: DEFAULT_SEMANTICS_VERSION,
        maxAttempts: CONFIG.maxAttemptsPerItem,
        wallTimeBudgetMs: CONFIG.wallTimeBudgetMs,
    };
}

function runOne(generateReasoningItem, itemRequest) {
    const startedAt = monotonicMilliseconds();
    const result = generateReasoningItem(itemRequest, {
        now: monotonicMilliseconds,
        isCancelled: () => false,
    });
    return { result, elapsedMs: monotonicMilliseconds() - startedAt };
}

function summarize(records) {
    const latencies = records.map(record => record.elapsedMs);
    const failuresByCode = {};
    records.filter(record => !record.result.ok).forEach(record => {
        failuresByCode[record.result.code] = (failuresByCode[record.result.code] || 0) + 1;
    });
    const timeouts = failuresByCode.timeout || 0;
    const successes = records.length - Object.values(failuresByCode).reduce((sum, count) => sum + count, 0);
    return {
        attempted: records.length,
        succeeded: successes,
        failed: records.length - successes,
        failureCodes: failuresByCode,
        timeoutCount: timeouts,
        timeoutRate: records.length ? timeouts / records.length : 0,
        latencyMs: {
            p50: round(percentile(latencies, 0.5)),
            p95: round(percentile(latencies, 0.95)),
            minimum: latencies.length ? round(Math.min(...latencies)) : null,
            maximum: latencies.length ? round(Math.max(...latencies)) : null,
            method: "nearest-rank; synchronous wall duration measured with process.hrtime.bigint",
        },
    };
}

function outputPathFromArguments() {
    const outputIndex = process.argv.indexOf("--output");
    if (outputIndex < 0) return DEFAULT_OUTPUT;
    const supplied = process.argv[outputIndex + 1];
    if (!supplied) throw new Error("`--output` requires a file path.");
    return path.resolve(PROJECT_ROOT, supplied);
}

function main() {
    if (!fs.existsSync(REGISTRY_FILE)) {
        throw new Error("Audit core is not compiled. Run `npm run build:audit-core` first.");
    }
    const { CORE_REASONING_FAMILIES, generateReasoningItem } = require(REGISTRY_FILE);
    const allRecords = [];
    const byFamily = {};
    for (const family of CORE_REASONING_FAMILIES) {
        for (let index = 0; index < CONFIG.warmupItemsPerFamily; index++) {
            runOne(generateReasoningItem, request(family, index, true));
        }
        const records = [];
        for (let index = 0; index < CONFIG.measuredItemsPerFamily; index++) {
            records.push(runOne(generateReasoningItem, request(family, index, false)));
        }
        byFamily[family] = summarize(records);
        allRecords.push(...records);
    }
    const overall = summarize(allRecords);
    const cpus = os.cpus();
    const qualityGate = {
        noGenerationFailures: overall.failed === 0,
        timeoutRateAtMostOnePercent: overall.timeoutRate <= 0.01,
    };
    qualityGate.passed = qualityGate.noGenerationFailures && qualityGate.timeoutRateAtMostOnePercent;
    const report = {
        reportType: "syllogimous-generation-benchmark",
        reportSchemaVersion: 1,
        generatedAt: new Date().toISOString(),
        config: {
            ...CONFIG,
            families: CORE_REASONING_FAMILIES,
            totalMeasuredItems: CONFIG.measuredItemsPerFamily * CORE_REASONING_FAMILIES.length,
            profile: {
                name: "local-single-thread-node",
                runtime: process.version,
                platform: process.platform,
                architecture: process.arch,
                operatingSystem: `${os.type()} ${os.release()}`,
                processorModel: cpus[0] ? cpus[0].model : "unknown",
                logicalProcessorCount: cpus.length,
                totalMemoryBytes: os.totalmem(),
                noteRu: "Это измерение текущего компьютера в Node.js, а не подтверждённый профиль телефона; отдельная проверка на представительном мобильном устройстве остаётся обязательной.",
            },
        },
        results: { overall, byFamily },
        qualityGate,
        interpretationRu: "Время включает синхронную генерацию и проверку одного задания, но не отрисовку интерфейса. Оно не измеряет когнитивную или нейронную способность.",
    };
    const outputFile = outputPathFromArguments();
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
        output: path.relative(PROJECT_ROOT, outputFile),
        attempted: overall.attempted,
        succeeded: overall.succeeded,
        failed: overall.failed,
        timeoutRate: overall.timeoutRate,
        p50Ms: overall.latencyMs.p50,
        p95Ms: overall.latencyMs.p95,
        qualityGatePassed: qualityGate.passed,
    }, null, 2)}\n`);
    if (!qualityGate.passed) process.exitCode = 2;
}

try {
    main();
} catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
}
