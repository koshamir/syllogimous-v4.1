"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BUILD_ROOT = path.join(PROJECT_ROOT, "dist", "audit-core", "reasoning-core");
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, "reports", "cue-audit.json");
const DEFAULT_SEMANTICS_VERSION = "ri-explicit-nonempty/1.0.0";

const CONFIG = Object.freeze({
    configVersion: "cue-audit-cli/1.1.0",
    splitSeeds: Object.freeze({
        training: "cue-audit-v1-training",
        development: "cue-audit-v1-development",
        test: "cue-audit-v1-final-held-out",
    }),
    splitSizesPerFamily: Object.freeze({ training: 900, development: 600, test: 600 }),
    generatorPartitions: Object.freeze({ training: "training", development: "development", test: "assessment" }),
    minimumHeldOut: 600,
    maxAttemptsPerItem: 64,
    wallTimeBudgetMs: 2_000,
    displayedPremises: Object.freeze({ min: 1, max: 7 }),
    responseFormat: "threeWayInference",
});

function loadAuditModules() {
    const registryFile = path.join(BUILD_ROOT, "generators", "generator-registry.js");
    const auditFile = path.join(BUILD_ROOT, "audits", "cue-audit.js");
    if (!fs.existsSync(registryFile) || !fs.existsSync(auditFile)) {
        throw new Error("Audit core is not compiled. Run `npm run build:audit-core` first.");
    }
    return {
        ...require(registryFile),
        ...require(auditFile),
        ...require(path.join(BUILD_ROOT, "certificates", "item-verifier.js")),
    };
}

function monotonicMilliseconds() {
    return Number(process.hrtime.bigint()) / 1_000_000;
}

function percentile(values, probability) {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(probability * sorted.length) - 1);
    return sorted[index];
}

function round(value, digits = 4) {
    if (value === null) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function primaryDimension(family) {
    switch (family) {
        case "categorical": return "branching";
        case "order": return "liveFrontier";
        case "hierarchy": return "bindingInterference";
        case "analogy": return "bindingInterference";
        case "coupledFrames": return "crossFrameBridges";
        case "proportional": return "supportSize";
        case "temporalIntervals": return "liveFrontier";
        case "contextScope": return "scopeDepth";
        case "graphStructure": return "branching";
        case "transformations": return "transformComposition";
        default: throw new Error(`Unknown reasoning family: ${family}`);
    }
}

function generationRequest(family, split, index) {
    const seed = `${CONFIG.splitSeeds[split]}:${family}:${String(index).padStart(5, "0")}`;
    return {
        requestId: `audit:${split}:${family}:${index}`,
        seed,
        family,
        partition: CONFIG.generatorPartitions[split],
        target: {
            level: index % 5 + 1,
            primaryDimension: primaryDimension(family),
            displayedPremises: { ...CONFIG.displayedPremises },
            responseFormat: CONFIG.responseFormat,
            memoryVisibility: "visible",
            distractorCount: 0,
            timePressure: "none",
        },
        semanticsVersion: DEFAULT_SEMANTICS_VERSION,
        maxAttempts: CONFIG.maxAttemptsPerItem,
        wallTimeBudgetMs: CONFIG.wallTimeBudgetMs,
    };
}

function schedulerBucket(family, split, sampleIndex) {
    // Independent seeded metadata stream; never alternate or balance answers.
    const input = `${CONFIG.splitSeeds[split]}:scheduler:${family}:${sampleIndex}`;
    let hash = 2166136261;
    for (let index = 0; index < input.length; index++) {
        hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b);
    hash ^= hash >>> 13;
    return ["review", "focus", "transfer"][(hash >>> 0) % 3];
}

function generationSummary(requested, samples, latencies, failures) {
    const failuresByCode = {};
    failures.forEach(failure => failuresByCode[failure.code] = (failuresByCode[failure.code] || 0) + 1);
    const timeoutCount = failuresByCode.timeout || 0;
    return {
        requested,
        generated: samples.length,
        failed: failures.length,
        failureCodes: failuresByCode,
        timeoutCount,
        timeoutRate: requested ? timeoutCount / requested : 0,
        latencyMs: {
            p50: round(percentile(latencies, 0.5)),
            p95: round(percentile(latencies, 0.95)),
            maximum: latencies.length ? round(Math.max(...latencies)) : null,
            method: "nearest-rank over all completed generation calls",
        },
    };
}

function generateFamilySamples(generateReasoningItem, verifyReasoningItem, family, familyIndex) {
    const samples = [];
    const latencies = [];
    const failures = [];
    const splitSummaries = {};
    for (const split of ["training", "development", "test"]) {
        const splitSamples = [];
        const splitLatencies = [];
        const splitFailures = [];
        let previousLabel;
        const requested = CONFIG.splitSizesPerFamily[split];
        for (let index = 0; index < requested; index++) {
            const itemRequest = generationRequest(family, split, index);
            const startedAt = monotonicMilliseconds();
            const result = generateReasoningItem(itemRequest, {
                now: monotonicMilliseconds,
                isCancelled: () => false,
            });
            const elapsedMs = monotonicMilliseconds() - startedAt;
            latencies.push(elapsedMs);
            splitLatencies.push(elapsedMs);
            if (!result.ok) {
                const failure = { split, index, seed: itemRequest.seed, code: result.code, messageRu: result.messageRu };
                failures.push(failure);
                splitFailures.push(failure);
                continue;
            }
            const label = result.item.semanticCertificate.classification;
            const verified = verifyReasoningItem(result.item);
            if (!verified.valid || verified.semanticRecheck.status !== "exact") {
                const failure = {
                    split, index, seed: itemRequest.seed, code: "certificateValidationFailed",
                    issues: verified.issues, semanticRecheckStatus: verified.semanticRecheck.status,
                };
                failures.push(failure);
                splitFailures.push(failure);
                continue;
            }
            if (!label) {
                const failure = {
                    split,
                    index,
                    seed: itemRequest.seed,
                    code: "missingClassification",
                    messageRu: "Сертификат обычного задания не содержит классификацию.",
                };
                failures.push(failure);
                splitFailures.push(failure);
                continue;
            }
            const sample = {
                item: result.item,
                label,
                split,
                previousLabel,
                schedulerBucket: schedulerBucket(family, split, index),
            };
            previousLabel = label;
            samples.push(sample);
            splitSamples.push(sample);
        }
        splitSummaries[split] = generationSummary(requested, splitSamples, splitLatencies, splitFailures);
    }
    return {
        samples,
        failures,
        summary: {
            ...generationSummary(
                Object.values(CONFIG.splitSizesPerFamily).reduce((sum, count) => sum + count, 0),
                samples,
                latencies,
                failures,
            ),
            splits: splitSummaries,
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
    const { CORE_REASONING_FAMILIES, generateReasoningItem, verifyReasoningItem, runCueAudit } = loadAuditModules();
    const pooledSamples = [];
    const byFamily = {};
    const generationByFamily = {};
    const failures = [];

    CORE_REASONING_FAMILIES.forEach((family, familyIndex) => {
        const generated = generateFamilySamples(generateReasoningItem, verifyReasoningItem, family, familyIndex);
        generationByFamily[family] = generated.summary;
        failures.push(...generated.failures.map(failure => ({ family, ...failure })));
        pooledSamples.push(...generated.samples);
        try {
            byFamily[family] = runCueAudit(generated.samples, CONFIG.minimumHeldOut);
        } catch (error) {
            byFamily[family] = { error: error instanceof Error ? error.message : String(error) };
        }
    });

    const pooledAudit = runCueAudit(pooledSamples, CONFIG.minimumHeldOut);
    const requestedPerFamily = Object.values(CONFIG.splitSizesPerFamily).reduce((sum, count) => sum + count, 0);
    const totalRequested = requestedPerFamily * CORE_REASONING_FAMILIES.length;
    const totalTimeouts = failures.filter(failure => failure.code === "timeout").length;
    const executionChecks = {
        generationComplete: failures.length === 0,
        negativeControlPassed: pooledAudit.negativeControl.passed,
        leakyControlDetected: pooledAudit.leakyControl.detected,
    };
    executionChecks.passed = executionChecks.generationComplete
        && executionChecks.negativeControlPassed
        && executionChecks.leakyControlDetected;
    const familyEntries = Object.entries(byFamily).filter(([, audit]) => !audit.error);
    const eligibility = {
        pooledDisposition: pooledAudit.disposition,
        pooledThresholdPassed: pooledAudit.disposition === "eligible",
        eligibleFamilies: familyEntries.filter(([, audit]) => audit.disposition === "eligible").map(([family]) => family),
        cueLimitedFamilies: familyEntries.filter(([, audit]) => audit.disposition === "cueLimited").map(([family]) => family),
        insufficientSampleFamilies: familyEntries.filter(([, audit]) => audit.disposition === "insufficientSample").map(([family]) => family),
        interpretationRu: "Семейство со статусом cueLimited нельзя включать в основной высокоинтеграционный пул до переработки; это инженерный фильтр, а не научное доказательство отсутствия подсказок.",
    };

    const report = {
        reportType: "syllogimous-cue-audit",
        reportSchemaVersion: 1,
        generatedAt: new Date().toISOString(),
        config: {
            ...CONFIG,
            families: CORE_REASONING_FAMILIES,
            requestedItemsPerFamily: requestedPerFamily,
            totalRequested,
            seedPolicy: "Fixed split seed prefixes plus family and zero-padded item index; no answer alternation is imposed.",
            certificatePolicy: "Every accepted item is re-solved from its public AST; claimed exact supports, necessity deletion tests and supplied witness polarities are rechecked. This is not an independent-oracle claim.",
            partitionPolicy: "The final held-out split uses the assessment grammar partition, not merely unseen seeds.",
        },
        generation: {
            requested: totalRequested,
            generated: pooledSamples.length,
            failed: failures.length,
            timeoutCount: totalTimeouts,
            timeoutRate: totalRequested ? totalTimeouts / totalRequested : 0,
            byFamily: generationByFamily,
            failures,
        },
        audits: { byFamily, pooled: pooledAudit },
        executionChecks,
        eligibility,
        limitationsRu: [
            "Это инженерная проверка перечисленных поверхностных признаков, а не доказательство отсутствия всех возможных подсказок.",
            "Успех или неуспех предиктора не является оценкой общего интеллекта, переноса или нейронной способности.",
            "Задания создаются локально; отчёт не отправляется автоматически.",
        ],
    };

    const outputFile = outputPathFromArguments();
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
        output: path.relative(PROJECT_ROOT, outputFile),
        requested: report.generation.requested,
        generated: report.generation.generated,
        failed: report.generation.failed,
        timeoutRate: report.generation.timeoutRate,
        pooledDisposition: pooledAudit.disposition,
        selectedFeatureSet: pooledAudit.selectedOnDevelopment,
        finalBalancedAccuracy: pooledAudit.finalSelectedPredictor.balancedAccuracy,
        negativeControlPassed: executionChecks.negativeControlPassed,
        leakyControlDetected: executionChecks.leakyControlDetected,
        executionChecksPassed: executionChecks.passed,
        eligibleFamilies: eligibility.eligibleFamilies,
        cueLimitedFamilies: eligibility.cueLimitedFamilies,
    }, null, 2)}\n`);
    if (!executionChecks.passed) process.exitCode = 2;
}

try {
    main();
} catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
}
