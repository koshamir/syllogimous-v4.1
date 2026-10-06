import {
    AtomicQuery,
    DomainSpec,
    EntitySpec,
    GenerationRequest,
    InferenceClassification,
    IntervalPremise,
    IntervalWorld,
    OrderPremise,
    PositionWorld,
    RationalPremise,
    RationalValue,
    ReasoningFamily,
    ReasoningItem,
    TransformationPremise,
    TransformOperator,
    TransformWorld,
} from "../models/semantic.models";
import { DEFAULT_SEMANTICS_VERSION } from "../models/versions";
import { structuralFingerprint } from "../certificates/canonical";
import { classifyBoundedOrder } from "../solvers/bounded-order-solver";
import { classifyBoundedIntervals } from "../solvers/bounded-interval-solver";
import { classifyProportional } from "../solvers/proportional-solver";
import { classifyTransformation } from "../solvers/transformation-solver";
import { evaluateTransformationChain } from "../semantics/transformations";
import { GenerationControl } from "./generator-utils";
import { generateOrderItem } from "./order-generator";
import { generateProportionalItem } from "./proportional-generator";
import { generateTemporalIntervalItem } from "./temporal-interval-generator";
import { generateTransformationItem } from "./transformation-generator";

type Level = 1 | 2 | 3 | 4 | 5;
type Partition = GenerationRequest["partition"];
type PositionDomain = Extract<DomainSpec, { kind: "boundedPositions" }>;
type IntervalDomain = Extract<DomainSpec, { kind: "boundedIntervals" }>;
type RationalDomain = Extract<DomainSpec, { kind: "exactRationals" }>;
type TransformationDomain = Extract<DomainSpec, { kind: "boundedTransformations" }>;
type OrderQuery = Extract<AtomicQuery, { kind: "order" }>;
type IntervalQuery = Extract<AtomicQuery, { kind: "interval" }>;
type RationalQuery = Extract<AtomicQuery, { kind: "rational" }>;
type TransformationQuery = Extract<AtomicQuery, { kind: "transformationResult" }>;

const STATIC_CONTROL: GenerationControl = { now: () => 700, isCancelled: () => false };
const PARTITIONS: readonly Partition[] = ["training", "development", "assessment"];
const LEVELS: readonly Level[] = [1, 2, 3, 4, 5];

function request(family: ReasoningFamily, seed: string, level: Level, partition: Partition): GenerationRequest {
    const transformMinimum = level === 1 ? 1 : level <= 3 ? 2 : level === 4 ? 3 : 4;
    return {
        requestId: `${family}-${seed}`,
        seed,
        family,
        partition,
        semanticsVersion: DEFAULT_SEMANTICS_VERSION,
        maxAttempts: 30,
        wallTimeBudgetMs: 2_000,
        target: {
            level,
            primaryDimension: family === "transformations" ? "transformComposition" : "supportSize",
            displayedPremises: {
                min: family === "transformations" ? transformMinimum : family === "proportional" ? 3 : 1,
                max: 6,
            },
            responseFormat: "threeWayInference",
            memoryVisibility: "visible",
            distractorCount: 0,
            timePressure: "none",
        },
    };
}

function expectDeterministicReplay(
    first: ReasoningItem,
    replay: ReasoningItem,
): void {
    expect(replay.seed).toBe(first.seed);
    expect(replay.id).toBe(first.id);
    expect(replay.structuralFingerprint).toBe(first.structuralFingerprint);
    expect(replay.structureFamily).toBe(first.structureFamily);
    expect(replay.domain).toEqual(first.domain);
    expect(replay.entities).toEqual(first.entities);
    expect(replay.premises).toEqual(first.premises);
    expect(replay.query).toEqual(first.query);
    expect(replay.responseSpec).toEqual(first.responseSpec);
    expect(replay.semanticCertificate).toEqual(first.semanticCertificate);
    expect(replay.measuredComplexity).toEqual(first.measuredComplexity);
    expect(replay.presentation).toEqual(first.presentation);
    expect(replay.provenance.semanticSeed).toBe(first.provenance.semanticSeed);
    expect(replay.provenance.presentationSeed).toBe(first.provenance.presentationSeed);
    expect(replay.provenance.schedulerSeed).toBe(first.provenance.schedulerSeed);
}

function expectCompleteInferenceWitnesses(item: ReasoningItem): void {
    const positive = item.semanticCertificate.queryWitness;
    const negative = item.semanticCertificate.negatedQueryWitness;
    switch (item.semanticCertificate.classification) {
        case "entailed":
            expect(positive).toBeDefined();
            expect(negative).toBeUndefined();
            break;
        case "refuted":
            expect(positive).toBeUndefined();
            expect(negative).toBeDefined();
            break;
        case "underdetermined":
            expect(positive).toBeDefined();
            expect(negative).toBeDefined();
            break;
        default:
            fail("Generated ordinary item has no classification");
    }
}

function classification(values: readonly boolean[]): InferenceClassification {
    if (!values.length) throw new Error("The independent oracle found no admissible worlds");
    return values.every(Boolean) ? "entailed" : values.every(value => !value) ? "refuted" : "underdetermined";
}

interface LocalPositionWorld {
    values: Readonly<Record<string, number>>;
}

function localOrderHolds(
    atom: Pick<OrderPremise, "relation" | "args" | "displacement"> | OrderQuery,
    values: Readonly<Record<string, number>>,
    domain: PositionDomain,
): boolean {
    const at = (index: number): number => values[atom.args[index]];
    switch (atom.relation) {
        case "strictLess":
        case "leftOf": return at(0) < at(1);
        case "lessOrEqual": return at(0) <= at(1);
        case "equal": return at(0) === at(1);
        case "between": return at(1) < at(0) && at(0) < at(2);
        case "rightOf": return at(0) > at(1);
        case "adjacent": {
            const distance = Math.abs(at(0) - at(1));
            return distance === 1 || (domain.cyclic && distance === domain.size - 1);
        }
        case "exactDisplacement": return at(1) - at(0) === atom.displacement;
        case "cyclicClockwise": return (at(1) - at(0) + domain.size) % domain.size === (atom.displacement ?? 1);
    }
}

function localPositionWorlds(
    entityIds: readonly string[],
    premises: readonly OrderPremise[],
    domain: PositionDomain,
): LocalPositionWorld[] {
    const worlds: LocalPositionWorld[] = [];
    const values = new Array<number>(entityIds.length).fill(0);
    const visit = (index: number): void => {
        if (index === entityIds.length) {
            const record: Record<string, number> = {};
            entityIds.forEach((id, entityIndex) => record[id] = values[entityIndex]);
            if (premises.every(premise => localOrderHolds(premise, record, domain))) {
                worlds.push({ values: record });
            }
            return;
        }
        for (let value = 0; value < domain.size; value++) {
            if (!domain.allowCoincidence && values.slice(0, index).includes(value)) continue;
            values[index] = value;
            visit(index + 1);
        }
    };
    visit(0);
    return worlds;
}

function localOrderClassification(
    entityIds: readonly string[],
    premises: readonly OrderPremise[],
    query: OrderQuery,
    domain: PositionDomain,
): { classification: InferenceClassification; modelCount: number } {
    const worlds = localPositionWorlds(entityIds, premises, domain);
    return {
        classification: classification(worlds.map(world => localOrderHolds(query, world.values, domain))),
        modelCount: worlds.length,
    };
}

function expectValidPositionWitness(
    world: PositionWorld,
    entityIds: readonly string[],
    premises: readonly OrderPremise[],
    query: OrderQuery,
    domain: PositionDomain,
    expectedQueryValue: boolean,
): void {
    const values: Record<string, number> = {};
    world.positions.forEach(entry => values[entry.entityId] = entry.value);
    expect(Object.keys(values).sort()).toEqual([...entityIds].sort());
    expect(Object.values(values).every(value => Number.isSafeInteger(value) && value >= 0 && value < domain.size)).toBeTrue();
    if (!domain.allowCoincidence) expect(new Set(Object.values(values)).size).toBe(entityIds.length);
    expect(premises.every(premise => localOrderHolds(premise, values, domain))).toBeTrue();
    expect(localOrderHolds(query, values, domain)).toBe(expectedQueryValue);
}

function renameOrderPremise(premise: OrderPremise, names: ReadonlyMap<string, string>): OrderPremise {
    return { ...premise, args: premise.args.map(id => names.get(id)!) };
}

function renameOrderQuery(query: OrderQuery, names: ReadonlyMap<string, string>): OrderQuery {
    return { ...query, args: query.args.map(id => names.get(id)!) };
}

interface LocalIntervalWorld {
    values: Readonly<Record<string, { start: number; end: number }>>;
}

function localIntervalHolds(
    atom: Pick<IntervalPremise, "relation" | "left" | "right"> | IntervalQuery,
    values: Readonly<Record<string, { start: number; end: number }>>,
): boolean {
    const left = values[atom.left];
    const right = values[atom.right];
    switch (atom.relation) {
        case "before": return left.end < right.start;
        case "after": return left.start > right.end;
        case "overlaps": return left.start < right.start && right.start < left.end && left.end < right.end;
        case "during": return right.start < left.start && left.end < right.end;
        case "starts": return left.start === right.start && left.end < right.end;
        case "finishes": return right.start < left.start && left.end === right.end;
        case "equals": return left.start === right.start && left.end === right.end;
    }
}

function localIntervalWorlds(
    entityIds: readonly string[],
    premises: readonly IntervalPremise[],
    domain: IntervalDomain,
): LocalIntervalWorld[] {
    const choices: Array<{ start: number; end: number }> = [];
    for (let start = domain.endpointMin; start < domain.endpointMax; start++) {
        for (let end = start + 1; end <= domain.endpointMax; end++) choices.push({ start, end });
    }
    const selected = new Array<{ start: number; end: number }>(entityIds.length);
    const worlds: LocalIntervalWorld[] = [];
    const visit = (index: number): void => {
        if (index === entityIds.length) {
            const values: Record<string, { start: number; end: number }> = {};
            entityIds.forEach((id, entityIndex) => values[id] = selected[entityIndex]);
            if (premises.every(premise => localIntervalHolds(premise, values))) worlds.push({ values });
            return;
        }
        for (const choice of choices) {
            selected[index] = choice;
            visit(index + 1);
        }
    };
    visit(0);
    return worlds;
}

function localIntervalClassification(
    entityIds: readonly string[],
    premises: readonly IntervalPremise[],
    query: IntervalQuery,
    domain: IntervalDomain,
): { classification: InferenceClassification; modelCount: number } {
    const worlds = localIntervalWorlds(entityIds, premises, domain);
    return {
        classification: classification(worlds.map(world => localIntervalHolds(query, world.values))),
        modelCount: worlds.length,
    };
}

function expectValidIntervalWitness(
    world: IntervalWorld,
    entityIds: readonly string[],
    premises: readonly IntervalPremise[],
    query: IntervalQuery,
    domain: IntervalDomain,
    expectedQueryValue: boolean,
): void {
    const values: Record<string, { start: number; end: number }> = {};
    world.intervals.forEach(entry => values[entry.entityId] = { start: entry.start, end: entry.end });
    expect(Object.keys(values).sort()).toEqual([...entityIds].sort());
    expect(Object.values(values).every(value => Number.isSafeInteger(value.start)
        && Number.isSafeInteger(value.end)
        && value.start >= domain.endpointMin
        && value.end <= domain.endpointMax
        && value.start < value.end)).toBeTrue();
    expect(premises.every(premise => localIntervalHolds(premise, values))).toBeTrue();
    expect(localIntervalHolds(query, values)).toBe(expectedQueryValue);
}

function renameIntervalPremise(premise: IntervalPremise, names: ReadonlyMap<string, string>): IntervalPremise {
    return { ...premise, left: names.get(premise.left)!, right: names.get(premise.right)! };
}

function renameIntervalQuery(query: IntervalQuery, names: ReadonlyMap<string, string>): IntervalQuery {
    return { ...query, left: names.get(query.left)!, right: names.get(query.right)! };
}

interface BigFraction {
    numerator: bigint;
    denominator: bigint;
}

function bigFraction(value: RationalValue): BigFraction {
    if (!Number.isSafeInteger(value.numerator) || !Number.isSafeInteger(value.denominator) || value.denominator === 0) {
        throw new Error("Invalid generated rational");
    }
    const sign = value.denominator < 0 ? -1n : 1n;
    return { numerator: BigInt(value.numerator) * sign, denominator: BigInt(value.denominator) * sign };
}

function compareFractions(left: BigFraction, right: BigFraction): -1 | 0 | 1 {
    const delta = left.numerator * right.denominator - right.numerator * left.denominator;
    return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

function localRationalHolds(atom: RationalPremise | RationalQuery, domain: RationalDomain): boolean {
    if (atom.units !== domain.units) return false;
    const left = bigFraction(atom.left);
    const right = bigFraction(atom.right);
    switch (atom.relation) {
        case "ratioEqual": return compareFractions(left, right) === 0;
        case "ratioLess": return compareFractions(left, right) < 0;
        case "ratioGreater": return compareFractions(left, right) > 0;
        case "scaledBy": {
            if (!atom.result) return false;
            const result = bigFraction(atom.result);
            return left.numerator * right.numerator * result.denominator
                === result.numerator * left.denominator * right.denominator;
        }
    }
}

interface LocalTransformedPoint {
    point: [number, number];
    width: number;
    height: number;
}

function localTransform(input: LocalTransformedPoint, operator: TransformOperator): LocalTransformedPoint {
    const [x, y] = input.point;
    switch (operator) {
        case "rotate90": return { point: [input.height - 1 - y, x], width: input.height, height: input.width };
        case "rotate180": return { point: [input.width - 1 - x, input.height - 1 - y], width: input.width, height: input.height };
        case "rotate270": return { point: [y, input.width - 1 - x], width: input.height, height: input.width };
        case "reflectHorizontal": return { point: [x, input.height - 1 - y], width: input.width, height: input.height };
        case "reflectVertical": return { point: [input.width - 1 - x, y], width: input.width, height: input.height };
    }
}

function localTransformationResult(
    initialPoint: readonly [number, number],
    operators: readonly TransformOperator[],
    domain: TransformationDomain,
): LocalTransformedPoint {
    return operators.reduce(
        (state, operator) => localTransform(state, operator),
        { point: [...initialPoint] as [number, number], width: domain.width, height: domain.height },
    );
}

function samePoint(left: readonly [number, number], right: readonly [number, number]): boolean {
    return left[0] === right[0] && left[1] === right[1];
}

function expectValidTransformWitness(
    world: TransformWorld,
    query: TransformationQuery,
    domain: TransformationDomain,
    expectedQueryValue: boolean,
): void {
    const local = localTransformationResult(query.initialPoint, query.operators, domain);
    expect(world.initialPoint).toEqual(query.initialPoint);
    expect(world.finalPoint).toEqual(local.point);
    expect(samePoint(local.point, query.expectedPoint)).toBe(expectedQueryValue);
}

function renamedEntities(entities: readonly EntitySpec[], names: ReadonlyMap<string, string>): EntitySpec[] {
    return entities.map(entity => ({ ...entity, id: names.get(entity.id)! }));
}

describe("B / order generator properties", () => {
    it("replays boundary levels and validates every stored witness and exact support", () => {
        for (let index = 0; index < 30; index++) {
            const level = LEVELS[index % LEVELS.length];
            const partition = PARTITIONS[index % PARTITIONS.length];
            const generationRequest = request("order", `property-order-${index}`, level, partition);
            const generated = generateOrderItem(generationRequest, STATIC_CONTROL);
            const replay = generateOrderItem(generationRequest, STATIC_CONTROL);
            expect(generated.ok).withContext(`order seed ${index}`).toBeTrue();
            expect(replay.ok).withContext(`order replay ${index}`).toBeTrue();
            if (!generated.ok || !replay.ok) continue;
            expectDeterministicReplay(generated.item, replay.item);
            const item = generated.item;
            const ids = item.entities.map(entity => entity.id);
            const premises = item.premises as OrderPremise[];
            const query = item.query as OrderQuery;
            const domain = item.domain as PositionDomain;
            const local = localOrderClassification(ids, premises, query, domain);
            expect(local.classification).toBe(item.semanticCertificate.classification!);
            expect(local.modelCount).toBe(item.measuredComplexity.admissibleModelCount!);
            expectCompleteInferenceWitnesses(item);
            if (item.semanticCertificate.queryWitness) {
                expectValidPositionWitness(item.semanticCertificate.queryWitness as PositionWorld, ids, premises, query, domain, true);
            }
            if (item.semanticCertificate.negatedQueryWitness) {
                expectValidPositionWitness(item.semanticCertificate.negatedQueryWitness as PositionWorld, ids, premises, query, domain, false);
            }
            for (const support of item.semanticCertificate.supports) {
                const subset = premises.filter(premise => support.premiseIds.includes(premise.id));
                expect(localOrderClassification(ids, subset, query, domain).classification).toBe(local.classification);
                for (const premiseId of support.premiseIds) {
                    const reduced = subset.filter(premise => premise.id !== premiseId);
                    expect(localOrderClassification(ids, reduced, query, domain).classification).not.toBe(local.classification);
                }
            }
        }
    });

    it("preserves classification and fingerprint under renaming and premise permutation", () => {
        const generated = generateOrderItem(request("order", "rename-order", 5, "assessment"), STATIC_CONTROL);
        expect(generated.ok).toBeTrue();
        if (!generated.ok) return;
        const item = generated.item;
        const domain = item.domain as PositionDomain;
        const query = item.query as OrderQuery;
        const premises = item.premises as OrderPremise[];
        const names = new Map(item.entities.map((entity, index) => [entity.id, `renamed-position-${index}`]));
        const renamed = renamedEntities(item.entities, names);
        const renamedPremises = premises.map(premise => renameOrderPremise(premise, names)).reverse();
        const renamedQuery = renameOrderQuery(query, names);
        const solved = classifyBoundedOrder(renamed.map(entity => entity.id), renamedPremises, renamedQuery, domain);
        expect(solved.ok).toBeTrue();
        if (solved.ok) expect(solved.classification).toBe(item.semanticCertificate.classification!);
        expect(structuralFingerprint(renamed, renamedPremises, renamedQuery, domain)).toBe(item.structuralFingerprint);
    });

    it("matches a test-local exhaustive oracle across all five levels and partitions", () => {
        let enumeratedWorlds = 0;
        for (const partition of PARTITIONS) {
            for (const level of LEVELS) {
                const generated = generateOrderItem(request("order", `exhaustive-order-${partition}-${level}`, level, partition), STATIC_CONTROL);
                expect(generated.ok).toBeTrue();
                if (!generated.ok) continue;
                const item = generated.item;
                const ids = item.entities.map(entity => entity.id);
                const premises = item.premises as OrderPremise[];
                const query = item.query as OrderQuery;
                const domain = item.domain as PositionDomain;
                const local = localOrderClassification(ids, premises, query, domain);
                enumeratedWorlds += local.modelCount;
                const production = classifyBoundedOrder(ids, premises, query, domain);
                expect(production.ok).toBeTrue();
                if (production.ok) {
                    expect(production.classification).toBe(local.classification);
                    expect(production.modelCount).toBe(local.modelCount);
                }
            }
        }
        expect(enumeratedWorlds).toBeGreaterThan(0);
    });
});

describe("F / proportional generator properties", () => {
    it("replays boundary levels and validates every exact premise and outcome", () => {
        for (let index = 0; index < 30; index++) {
            const level = LEVELS[index % LEVELS.length];
            const partition = PARTITIONS[index % PARTITIONS.length];
            const generationRequest = request("proportional", `property-ratio-${index}`, level, partition);
            const generated = generateProportionalItem(generationRequest, STATIC_CONTROL);
            const replay = generateProportionalItem(generationRequest, STATIC_CONTROL);
            expect(generated.ok).withContext(`ratio seed ${index}`).toBeTrue();
            expect(replay.ok).withContext(`ratio replay ${index}`).toBeTrue();
            if (!generated.ok || !replay.ok) continue;
            expectDeterministicReplay(generated.item, replay.item);
            const item = generated.item;
            const domain = item.domain as RationalDomain;
            const premises = item.premises as RationalPremise[];
            const query = item.query as RationalQuery;
            expect(premises.every(premise => localRationalHolds(premise, domain))).toBeTrue();
            const expected = localRationalHolds(query, domain) ? "entailed" : "refuted";
            expect(item.semanticCertificate.classification).toBe(expected);
            expect(item.semanticCertificate.queryWitness).toBeUndefined();
            expect(item.semanticCertificate.negatedQueryWitness).toBeUndefined();
        }
    });

    it("preserves exact classification under entity renaming and premise permutation", () => {
        const generated = generateProportionalItem(request("proportional", "rename-ratio", 5, "assessment"), STATIC_CONTROL);
        expect(generated.ok).toBeTrue();
        if (!generated.ok) return;
        const item = generated.item;
        const premises = [...item.premises].reverse() as RationalPremise[];
        const query = item.query as RationalQuery;
        const domain = item.domain as RationalDomain;
        const names = new Map(item.entities.map((entity, index) => [entity.id, `renamed-number-${index}`]));
        const renamed = renamedEntities(item.entities, names);
        const solved = classifyProportional(premises, query, domain);
        expect(solved.ok).toBeTrue();
        if (solved.ok) expect(solved.classification).toBe(item.semanticCertificate.classification!);
        expect(structuralFingerprint(renamed, premises, query, domain)).toBe(item.structuralFingerprint);
    });

    it("matches a bigint reference calculation for every relation emitted at every boundary", () => {
        const seen = new Set<RationalQuery["relation"]>();
        let checkedAtoms = 0;
        for (const partition of PARTITIONS) {
            for (const level of LEVELS) {
                for (let variant = 0; variant < 4; variant++) {
                    const generated = generateProportionalItem(
                        request("proportional", `exact-ratio-${partition}-${level}-${variant}`, level, partition),
                        STATIC_CONTROL,
                    );
                    expect(generated.ok).toBeTrue();
                    if (!generated.ok) continue;
                    const item = generated.item;
                    const domain = item.domain as RationalDomain;
                    const premises = item.premises as RationalPremise[];
                    const query = item.query as RationalQuery;
                    premises.forEach(atom => {
                        expect(localRationalHolds(atom, domain)).toBeTrue();
                        seen.add(atom.relation);
                        checkedAtoms++;
                    });
                    seen.add(query.relation);
                    checkedAtoms++;
                    const production = classifyProportional(premises, query, domain);
                    expect(production.ok).toBeTrue();
                    if (production.ok) {
                        expect(production.classification).toBe(localRationalHolds(query, domain) ? "entailed" : "refuted");
                    }
                }
            }
        }
        expect(checkedAtoms).toBe(240);
        expect(seen.has("ratioEqual")).toBeTrue();
        expect(seen.has("ratioLess") || seen.has("ratioGreater")).toBeTrue();
        expect(seen.has("scaledBy")).toBeTrue();
    });
});

describe("G / temporal interval generator properties", () => {
    it("replays boundary levels and validates every stored model and countermodel", () => {
        for (let index = 0; index < 30; index++) {
            const level = LEVELS[index % LEVELS.length];
            const partition = PARTITIONS[index % PARTITIONS.length];
            const generationRequest = request("temporalIntervals", `property-interval-${index}`, level, partition);
            const generated = generateTemporalIntervalItem(generationRequest, STATIC_CONTROL);
            const replay = generateTemporalIntervalItem(generationRequest, STATIC_CONTROL);
            expect(generated.ok).withContext(`interval seed ${index}`).toBeTrue();
            expect(replay.ok).withContext(`interval replay ${index}`).toBeTrue();
            if (!generated.ok || !replay.ok) continue;
            expectDeterministicReplay(generated.item, replay.item);
            const item = generated.item;
            const ids = item.entities.map(entity => entity.id);
            const premises = item.premises as IntervalPremise[];
            const query = item.query as IntervalQuery;
            const domain = item.domain as IntervalDomain;
            const local = localIntervalClassification(ids, premises, query, domain);
            expect(local.classification).toBe(item.semanticCertificate.classification!);
            expect(local.modelCount).toBe(item.measuredComplexity.admissibleModelCount!);
            expectCompleteInferenceWitnesses(item);
            if (item.semanticCertificate.queryWitness) {
                expectValidIntervalWitness(item.semanticCertificate.queryWitness as IntervalWorld, ids, premises, query, domain, true);
            }
            if (item.semanticCertificate.negatedQueryWitness) {
                expectValidIntervalWitness(item.semanticCertificate.negatedQueryWitness as IntervalWorld, ids, premises, query, domain, false);
            }
            for (const support of item.semanticCertificate.supports) {
                const subset = premises.filter(premise => support.premiseIds.includes(premise.id));
                expect(localIntervalClassification(ids, subset, query, domain).classification).toBe(local.classification);
                for (const premiseId of support.premiseIds) {
                    const reduced = subset.filter(premise => premise.id !== premiseId);
                    expect(localIntervalClassification(ids, reduced, query, domain).classification).not.toBe(local.classification);
                }
            }
        }
    });

    it("preserves classification and fingerprint under renaming and premise permutation", () => {
        const generated = generateTemporalIntervalItem(request("temporalIntervals", "rename-interval", 5, "assessment"), STATIC_CONTROL);
        expect(generated.ok).toBeTrue();
        if (!generated.ok) return;
        const item = generated.item;
        const domain = item.domain as IntervalDomain;
        const query = item.query as IntervalQuery;
        const premises = item.premises as IntervalPremise[];
        const names = new Map(item.entities.map((entity, index) => [entity.id, `renamed-interval-${index}`]));
        const renamed = renamedEntities(item.entities, names);
        const renamedPremises = premises.map(premise => renameIntervalPremise(premise, names)).reverse();
        const renamedQuery = renameIntervalQuery(query, names);
        const solved = classifyBoundedIntervals(renamed.map(entity => entity.id), renamedPremises, renamedQuery, domain);
        expect(solved.ok).toBeTrue();
        if (solved.ok) expect(solved.classification).toBe(item.semanticCertificate.classification!);
        expect(structuralFingerprint(renamed, renamedPremises, renamedQuery, domain)).toBe(item.structuralFingerprint);
    });

    it("matches a test-local endpoint enumeration across all five levels and partitions", () => {
        let enumeratedWorlds = 0;
        for (const partition of PARTITIONS) {
            for (const level of LEVELS) {
                const generated = generateTemporalIntervalItem(
                    request("temporalIntervals", `exhaustive-interval-${partition}-${level}`, level, partition),
                    STATIC_CONTROL,
                );
                expect(generated.ok).toBeTrue();
                if (!generated.ok) continue;
                const item = generated.item;
                const ids = item.entities.map(entity => entity.id);
                const premises = item.premises as IntervalPremise[];
                const query = item.query as IntervalQuery;
                const domain = item.domain as IntervalDomain;
                const local = localIntervalClassification(ids, premises, query, domain);
                enumeratedWorlds += local.modelCount;
                const production = classifyBoundedIntervals(ids, premises, query, domain);
                expect(production.ok).toBeTrue();
                if (production.ok) {
                    expect(production.classification).toBe(local.classification);
                    expect(production.modelCount).toBe(local.modelCount);
                }
            }
        }
        expect(enumeratedWorlds).toBeGreaterThan(0);
    });
});

describe("constructive witness contracts for B and G", () => {
    it("always supplies the polarity required by satisfying-model and counterexample formats", () => {
        for (const family of ["order", "temporalIntervals"] as const) {
            for (const responseFormat of ["constructSatisfyingModel", "constructCounterexample"] as const) {
                for (let index = 0; index < 20; index++) {
                    const generationRequest = request(family, `constructive-${family}-${responseFormat}-${index}`, 3, "training");
                    generationRequest.target.responseFormat = responseFormat;
                    const generated = family === "order"
                        ? generateOrderItem(generationRequest, STATIC_CONTROL)
                        : generateTemporalIntervalItem(generationRequest, STATIC_CONTROL);
                    expect(generated.ok).withContext(`${family}:${responseFormat}:${index}`).toBeTrue();
                    if (!generated.ok) continue;
                    if (responseFormat === "constructSatisfyingModel") {
                        expect(generated.item.semanticCertificate.queryWitness).toBeDefined();
                    } else {
                        expect(generated.item.semanticCertificate.negatedQueryWitness).toBeDefined();
                    }
                }
            }
        }
    });
});

describe("J / transformation generator properties", () => {
    it("replays boundary levels and validates every exact world or countermodel", () => {
        for (let index = 0; index < 30; index++) {
            const level = LEVELS[index % LEVELS.length];
            const partition = PARTITIONS[index % PARTITIONS.length];
            const generationRequest = request("transformations", `property-transform-${index}`, level, partition);
            const generated = generateTransformationItem(generationRequest, STATIC_CONTROL);
            const replay = generateTransformationItem(generationRequest, STATIC_CONTROL);
            expect(generated.ok).withContext(`transform seed ${index}`).toBeTrue();
            expect(replay.ok).withContext(`transform replay ${index}`).toBeTrue();
            if (!generated.ok || !replay.ok) continue;
            expectDeterministicReplay(generated.item, replay.item);
            const item = generated.item;
            const query = item.query as TransformationQuery;
            const domain = item.domain as TransformationDomain;
            const expected = localTransformationResult(query.initialPoint, query.operators, domain);
            const queryHolds = samePoint(expected.point, query.expectedPoint);
            expect(item.semanticCertificate.classification).toBe(queryHolds ? "entailed" : "refuted");
            expectCompleteInferenceWitnesses(item);
            const witness = (item.semanticCertificate.queryWitness
                ?? item.semanticCertificate.negatedQueryWitness) as TransformWorld;
            expectValidTransformWitness(witness, query, domain, queryHolds);
        }
    });

    it("preserves a chain under state renaming and premise permutation", () => {
        const generated = generateTransformationItem(request("transformations", "rename-transform", 5, "assessment"), STATIC_CONTROL);
        expect(generated.ok).toBeTrue();
        if (!generated.ok) return;
        const item = generated.item;
        const query = item.query as TransformationQuery;
        const domain = item.domain as TransformationDomain;
        const premises = item.premises as TransformationPremise[];
        const names = new Map(item.entities.map((entity, index) => [entity.id, `renamed-state-${index}`]));
        const renamed = renamedEntities(item.entities, names);
        const renamedPremises = premises.map(premise => ({
            ...premise,
            inputState: names.get(premise.inputState)!,
            outputState: names.get(premise.outputState)!,
        })).reverse();
        const chain = evaluateTransformationChain(renamedPremises, names.get("s0")!, query.initialPoint, domain);
        expect(chain.ok).toBeTrue();
        if (chain.ok) {
            expect(chain.world.finalPoint).toEqual(localTransformationResult(query.initialPoint, query.operators, domain).point);
        }
        expect(structuralFingerprint(renamed, renamedPremises, query, domain)).toBe(item.structuralFingerprint);
    });

    it("matches an independent coordinate oracle at every grid point for all boundaries", () => {
        let checkedPoints = 0;
        let foundOrderSensitive = false;
        for (const partition of PARTITIONS) {
            for (const level of LEVELS) {
                const generated = generateTransformationItem(
                    request("transformations", `exhaustive-transform-${partition}-${level}`, level, partition),
                    STATIC_CONTROL,
                );
                expect(generated.ok).toBeTrue();
                if (!generated.ok) continue;
                const item = generated.item;
                const query = item.query as TransformationQuery;
                const domain = item.domain as TransformationDomain;
                for (let x = 0; x < domain.width; x++) {
                    for (let y = 0; y < domain.height; y++) {
                        const local = localTransformationResult([x, y], query.operators, domain);
                        const production = classifyTransformation({ ...query, initialPoint: [x, y], expectedPoint: local.point }, domain);
                        expect(production.ok).toBeTrue();
                        if (production.ok) {
                            expect(production.classification).toBe("entailed");
                            expect(production.queryWorld.finalPoint).toEqual(local.point);
                        }
                        const reversed = localTransformationResult([x, y], [...query.operators].reverse(), domain);
                        if (!samePoint(local.point, reversed.point)) foundOrderSensitive = true;
                        checkedPoints++;
                    }
                }
            }
        }
        expect(checkedPoints).toBe(135);
        expect(foundOrderSensitive).toBeTrue();
    });
});
