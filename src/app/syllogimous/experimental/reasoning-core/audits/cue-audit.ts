import {
    InferenceClassification,
    PremiseNode,
    ReasoningItem,
} from "../models/semantic.models";
import { renderPremiseRu, renderQueryRu } from "../rendering/russian-renderer";
import { SeededRandom } from "../generators/seeded-random";

export type AuditSplit = "training" | "development" | "test";

export interface AuditSample {
    item: ReasoningItem;
    label: InferenceClassification;
    split: AuditSplit;
    previousLabel?: InferenceClassification;
    schedulerBucket: "review" | "focus" | "transfer";
}

export type CueFeatureSet =
    | "conclusionOperator"
    | "premiseOperatorCounts"
    | "entityFrequenciesAndPositions"
    | "surfaceLengthAndTokens"
    | "localGraphInvariants"
    | "singlePremise"
    | "twoPremises"
    | "previousLabelsAndScheduler";

export const CUE_FEATURE_SETS: readonly CueFeatureSet[] = [
    "conclusionOperator",
    "premiseOperatorCounts",
    "entityFrequenciesAndPositions",
    "surfaceLengthAndTokens",
    "localGraphInvariants",
    "singlePremise",
    "twoPremises",
    "previousLabelsAndScheduler",
];

export interface PredictorReport {
    featureSet: CueFeatureSet;
    accuracy: number;
    balancedAccuracy: number;
    confidenceInterval95: [number, number];
    bonferroniConfidenceInterval95: [number, number];
    sampleSize: number;
    uncoveredFeaturePatterns: number;
}

export interface SplitSummary {
    sampleSize: number;
    structureFamilies: string[];
    baseRates: Record<InferenceClassification, number>;
}

export interface CueAuditReport {
    configVersion: string;
    labels: InferenceClassification[];
    threshold: {
        balancedBaseline: number;
        maximumExcess: number;
        engineeringThreshold: number;
        interpretationRu: string;
    };
    splits: Record<AuditSplit, SplitSummary>;
    developmentPredictors: PredictorReport[];
    finalHeldOutPredictors: PredictorReport[];
    selectedOnDevelopment: CueFeatureSet;
    finalSelectedPredictor: PredictorReport;
    multipleSearches: number;
    negativeControl: {
        shuffledLabelBalancedAccuracy: number;
        confidenceInterval95: [number, number];
        passed: boolean;
    };
    leakyControl: {
        detectedBalancedAccuracy: number;
        detected: boolean;
    };
    conditionalDistributions: Array<{
        structureFamily: string;
        sampleSize: number;
        rates: Record<InferenceClassification, number>;
    }>;
    disposition: "eligible" | "cueLimited" | "insufficientSample";
    limitationsRu: string[];
}

const LABELS: readonly InferenceClassification[] = ["entailed", "refuted", "underdetermined"];

function premiseOperator(premise: PremiseNode): string {
    switch (premise.kind) {
        case "categorical": return `${premise.kind}:${premise.quantifier}`;
        case "order": return `${premise.kind}:${premise.relation}`;
        case "containment": return `${premise.kind}:${premise.relation}`;
        case "conditional": return premise.kind;
        case "interval": return `${premise.kind}:${premise.relation}`;
        case "rational": return `${premise.kind}:${premise.relation}`;
        case "graphEdge": return `${premise.kind}:${premise.relationLabel}:${premise.graphId}`;
        case "mappingPair": return premise.kind;
        case "transformation": return `${premise.kind}:${premise.operator}`;
        case "scopedRelation": return `${premise.kind}:${premise.subjectQuantifier}:${premise.objectQuantifier}`;
        case "booleanConstraint": return `${premise.kind}:${premise.operator}`;
        case "propositionValue": return premise.kind;
        case "bridge": return `${premise.kind}:${premise.bridgeType}`;
    }
}

function queryOperator(item: ReasoningItem): string {
    const query = item.query;
    if (query.kind === "logicalNot") return `not:${query.operand.kind}`;
    if (query.kind === "boolean") return `boolean:${query.operator}:${query.operands.map(operand => operand.kind).sort().join("+")}`;
    if (query.kind === "categorical") return `categorical:${query.quantifier}`;
    if (query.kind === "order") return `order:${query.relation}`;
    if (query.kind === "containment") return `containment:${query.relation}`;
    if (query.kind === "interval") return `interval:${query.relation}`;
    if (query.kind === "rational") return `rational:${query.relation}`;
    return query.kind;
}

function entityFrequencyKey(item: ReasoningItem): string {
    const ids = item.entities.map(entity => entity.id);
    const serialized = item.premises.map(premise => JSON.stringify(premise));
    return ids.map(id => {
        const positions = serialized.map((value, index) => value.includes(`"${id}"`) ? index : -1).filter(index => index >= 0);
        return `${positions.length}:${positions.join(".")}`;
    }).sort().join("|");
}

function surfaceKey(item: ReasoningItem): string {
    const text = [...item.premises.map(premise => renderPremiseRu(premise, item.entities)), renderQueryRu(item.query, item.entities)].join(" ");
    const normalized = text.toLocaleLowerCase("ru-RU").replace(/[\d\p{P}\p{S}]+/gu, " ").trim();
    const tokens = normalized.split(/\s+/).filter(Boolean);
    // Used only by the deliberately leaky positive-control copy. Keeping the
    // marker visible to the same shallow extractor verifies the audit can
    // detect a known surface leak instead of merely producing plausible logs.
    const deliberateLeak = tokens.find(token => token.startsWith("контрольнаяметка"));
    if (deliberateLeak) return `deliberate-leak:${deliberateLeak}`;
    const shortTokenHistogram = [...new Set(tokens)].sort().slice(0, 12);
    return `${text.length}:${tokens.length}:${shortTokenHistogram.join(".")}`;
}

function graphInvariantKey(item: ReasoningItem): string {
    const edges = item.premises.filter((premise): premise is Extract<PremiseNode, { kind: "graphEdge" }> => premise.kind === "graphEdge");
    if (!edges.length) return "none";
    const degree = new Map<string, { input: number; output: number; labels: string[] }>();
    for (const edge of edges) {
        const from = degree.get(edge.from) ?? { input: 0, output: 0, labels: [] };
        const to = degree.get(edge.to) ?? { input: 0, output: 0, labels: [] };
        from.output++;
        from.labels.push(edge.relationLabel);
        to.input++;
        to.labels.push(edge.relationLabel);
        degree.set(edge.from, from);
        degree.set(edge.to, to);
    }
    return [...degree.values()].map(value => `${value.input}:${value.output}:${value.labels.sort().join(".")}`).sort().join("|");
}

export function cueFeature(sample: AuditSample, set: CueFeatureSet): string {
    const item = sample.item;
    switch (set) {
        case "conclusionOperator": return queryOperator(item);
        case "premiseOperatorCounts": {
            const counts = new Map<string, number>();
            item.premises.forEach(premise => {
                const operator = premiseOperator(premise);
                counts.set(operator, (counts.get(operator) ?? 0) + 1);
            });
            return [...counts].map(([operator, count]) => `${operator}=${count}`).sort().join("|");
        }
        case "entityFrequenciesAndPositions": return entityFrequencyKey(item);
        case "surfaceLengthAndTokens": return surfaceKey(item);
        case "localGraphInvariants": return graphInvariantKey(item);
        case "singlePremise": return item.premises[0] ? premiseOperator(item.premises[0]) : "none";
        case "twoPremises": return item.premises.slice(0, 2).map(premiseOperator).sort().join("|");
        case "previousLabelsAndScheduler": return `${sample.previousLabel ?? "none"}:${sample.schedulerBucket}`;
    }
}

function majorityLabel(
    samples: readonly AuditSample[],
    labels: readonly InferenceClassification[],
): InferenceClassification {
    const counts = new Map(labels.map(label => [label, 0]));
    samples.forEach(sample => counts.set(sample.label, counts.get(sample.label)! + 1));
    return [...labels].sort((left, right) => counts.get(right)! - counts.get(left)! || left.localeCompare(right))[0];
}

function trainLookup(
    samples: readonly AuditSample[],
    set: CueFeatureSet,
    labels: readonly InferenceClassification[],
): {
    lookup: Map<string, InferenceClassification>;
    fallback: InferenceClassification;
} {
    const buckets = new Map<string, AuditSample[]>();
    samples.forEach(sample => {
        const key = cueFeature(sample, set);
        buckets.set(key, [...(buckets.get(key) ?? []), sample]);
    });
    return {
        lookup: new Map([...buckets].map(([key, bucket]) => [key, majorityLabel(bucket, labels)])),
        fallback: majorityLabel(samples, labels),
    };
}

function wilson(successes: number, total: number, z: number): [number, number] {
    if (!total) return [0, 1];
    const proportion = successes / total;
    const denominator = 1 + z * z / total;
    const centre = (proportion + z * z / (2 * total)) / denominator;
    const margin = z * Math.sqrt((proportion * (1 - proportion) + z * z / (4 * total)) / total) / denominator;
    return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

function evaluatePredictor(
    training: readonly AuditSample[],
    testing: readonly AuditSample[],
    set: CueFeatureSet,
    searches: number,
    labels: readonly InferenceClassification[],
): PredictorReport {
    const model = trainLookup(training, set, labels);
    let correct = 0;
    let uncovered = 0;
    const perClass = new Map(labels.map(label => [label, { correct: 0, total: 0 }]));
    for (const sample of testing) {
        const key = cueFeature(sample, set);
        const found = model.lookup.get(key);
        if (!found) uncovered++;
        const predicted = found ?? model.fallback;
        const counts = perClass.get(sample.label)!;
        counts.total++;
        if (predicted === sample.label) {
            correct++;
            counts.correct++;
        }
    }
    const recalls = labels.map(label => {
        const counts = perClass.get(label)!;
        return counts.total ? counts.correct / counts.total : 0;
    });
    const balancedAccuracy = recalls.reduce((sum, value) => sum + value, 0) / recalls.length;
    const adjustedAlpha = 0.05 / Math.max(1, searches);
    const bonferroniZ = inverseNormalCdf(1 - adjustedAlpha / 2);
    const balancedInterval = (z: number): [number, number] => {
        const intervals = labels.map(label => {
            const counts = perClass.get(label)!;
            return wilson(counts.correct, counts.total, z);
        });
        return [
            intervals.reduce((sum, interval) => sum + interval[0], 0) / intervals.length,
            intervals.reduce((sum, interval) => sum + interval[1], 0) / intervals.length,
        ];
    };
    return {
        featureSet: set,
        accuracy: testing.length ? correct / testing.length : 0,
        balancedAccuracy,
        confidenceInterval95: balancedInterval(1.96),
        bonferroniConfidenceInterval95: balancedInterval(bonferroniZ),
        sampleSize: testing.length,
        uncoveredFeaturePatterns: uncovered,
    };
}

// Acklam-style inverse-normal approximation is unnecessary at audit precision;
// binary search over the normal CDF keeps this dependency-free and deterministic.
function inverseNormalCdf(probability: number): number {
    let low = -8;
    let high = 8;
    for (let iteration = 0; iteration < 80; iteration++) {
        const middle = (low + high) / 2;
        if (normalCdf(middle) < probability) low = middle; else high = middle;
    }
    return (low + high) / 2;
}

function normalCdf(value: number): number {
    const sign = value < 0 ? -1 : 1;
    const x = Math.abs(value) / Math.sqrt(2);
    const t = 1 / (1 + 0.3275911 * x);
    const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
    return 0.5 * (1 + erf);
}

function summary(samples: readonly AuditSample[]): SplitSummary {
    const counts = new Map(LABELS.map(label => [label, 0]));
    samples.forEach(sample => counts.set(sample.label, counts.get(sample.label)! + 1));
    return {
        sampleSize: samples.length,
        structureFamilies: [...new Set(samples.map(sample => sample.item.structureFamily))].sort(),
        baseRates: Object.fromEntries(LABELS.map(label => [label, samples.length ? counts.get(label)! / samples.length : 0])) as Record<InferenceClassification, number>,
    };
}

function relabel(samples: readonly AuditSample[], seed: string): AuditSample[] {
    const rng = new SeededRandom(seed);
    const labels = rng.shuffle(samples.map(sample => sample.label));
    return samples.map((sample, index) => ({ ...sample, label: labels[index] }));
}

function leakSurface(samples: readonly AuditSample[]): AuditSample[] {
    return samples.map(sample => {
        const marker = sample.label === "entailed"
            ? "контрольнаяметкаальфа"
            : sample.label === "refuted"
                ? "контрольнаяметкабета"
                : "контрольнаяметкагамма";
        const fakeEntity: ReasoningItem = {
            ...sample.item,
            entities: sample.item.entities.map(entity => ({ ...entity, label: `${entity.label} ${marker}` })),
        };
        return { ...sample, item: fakeEntity };
    });
}

export function runCueAudit(samples: readonly AuditSample[], minimumHeldOut = 600): CueAuditReport {
    const training = samples.filter(sample => sample.split === "training");
    const development = samples.filter(sample => sample.split === "development");
    const test = samples.filter(sample => sample.split === "test");
    if (!training.length || !development.length || !test.length) {
        throw new Error("Cue audit requires nonempty training, development and final test splits");
    }
    const activeLabels = LABELS.filter(label => samples.some(sample => sample.label === label));
    if (!activeLabels.length) throw new Error("Cue audit requires at least one answer label");
    const searches = CUE_FEATURE_SETS.length;
    const developmentPredictors = CUE_FEATURE_SETS.map(set =>
        evaluatePredictor(training, development, set, searches, activeLabels));
    const selectedOnDevelopment = [...developmentPredictors].sort((left, right) => right.balancedAccuracy - left.balancedAccuracy)[0].featureSet;
    const finalHeldOutPredictors = CUE_FEATURE_SETS.map(set =>
        evaluatePredictor([...training, ...development], test, set, searches, activeLabels));
    const finalSelectedPredictor = finalHeldOutPredictors.find(report => report.featureSet === selectedOnDevelopment)!;
    const shuffledTraining = relabel(training, "negative-control-training");
    const shuffledTest = relabel(test, "negative-control-test");
    const shuffled = evaluatePredictor(shuffledTraining, shuffledTest, selectedOnDevelopment, searches, activeLabels);
    const leakyTraining = leakSurface(training);
    const leakyTest = leakSurface(test);
    const leaky = evaluatePredictor(leakyTraining, leakyTest, "surfaceLengthAndTokens", searches, activeLabels);
    const balancedBaseline = 1 / activeLabels.length;
    const engineeringThreshold = Math.min(1, balancedBaseline + 0.05);
    const minimumPerLabel = Math.max(30, Math.floor(minimumHeldOut / (activeLabels.length * 2)));
    const adequate = test.length >= minimumHeldOut
        && activeLabels.every(label => test.filter(sample => sample.label === label).length >= minimumPerLabel)
        && activeLabels.every(label => training.some(sample => sample.label === label))
        && activeLabels.every(label => development.some(sample => sample.label === label));
    const dominantRate = Math.max(...activeLabels.map(label => test.filter(sample => sample.label === label).length / test.length));
    const disposition = !adequate
        ? "insufficientSample"
        : activeLabels.length < 2 || dominantRate > 0.8
            ? "cueLimited"
            : finalSelectedPredictor.bonferroniConfidenceInterval95[1] <= engineeringThreshold
                ? "eligible"
                : "cueLimited";
    const conditionalDistributions = [...new Set(test.map(sample => sample.item.structureFamily))].sort().map(structureFamily => {
        const familySamples = test.filter(sample => sample.item.structureFamily === structureFamily);
        return {
            structureFamily,
            sampleSize: familySamples.length,
            rates: Object.fromEntries(LABELS.map(label => [label, familySamples.filter(sample => sample.label === label).length / familySamples.length])) as Record<InferenceClassification, number>,
        };
    });
    return {
        configVersion: "cue-audit/1.0.0",
        labels: [...activeLabels],
        threshold: {
            balancedBaseline,
            maximumExcess: 0.05,
            engineeringThreshold,
            interpretationRu: "Порог — инженерный фильтр поверхностных подсказок, а не доказательство их отсутствия и не научная оценка переноса.",
        },
        splits: { training: summary(training), development: summary(development), test: summary(test) },
        developmentPredictors,
        finalHeldOutPredictors,
        selectedOnDevelopment,
        finalSelectedPredictor,
        multipleSearches: searches,
        negativeControl: {
            shuffledLabelBalancedAccuracy: shuffled.balancedAccuracy,
            confidenceInterval95: shuffled.confidenceInterval95,
            passed: shuffled.confidenceInterval95[0] <= balancedBaseline
                && shuffled.confidenceInterval95[1] >= balancedBaseline,
        },
        leakyControl: {
            detectedBalancedAccuracy: leaky.balancedAccuracy,
            detected: leaky.balancedAccuracy >= 0.8,
        },
        conditionalDistributions,
        disposition,
        limitationsRu: [
            "Проверены только перечисленные неглубокие признаки и модели поиска по точному совпадению.",
            "Успешный аудит не исключает стратегию, которую набор предикторов не представляет.",
            "Полезные алгоритмы порядка, чётности и координат оцениваются отдельно и сами по себе не считаются дефектом.",
        ],
    };
}
