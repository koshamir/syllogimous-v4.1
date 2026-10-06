import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { UserReasoningResponse } from "../reasoning-core/models/response.models";
import {
    CategoricalWorld,
    EntitySpec,
    InferenceClassification,
    IntervalWorld,
    MappingWorld,
    MembershipWorld,
    PositionWorld,
    PropositionWorld,
    ReasoningItem,
    ScopeWorld,
    ScopeFrameSpec,
    ContextScopeWorld,
    SemanticWorld,
    TransformWorld,
} from "../reasoning-core/models/semantic.models";
import { CLASSIFICATION_LABEL_RU, semanticOperatorLabelRu } from "../reasoning-core/rendering/ru-catalog";
import { renderPremiseRu } from "../reasoning-core/rendering/russian-renderer";

interface CategoricalDraftRow { id: string; classes: Record<string, boolean>; }
interface IntervalDraft { id: string; start: number; end: number; }

@Component({
    selector: "app-experimental-response-controls",
    templateUrl: "./response-controls.component.html",
    styleUrls: ["./response-controls.component.css"],
})
export class ResponseControlsComponent implements OnChanges {
    @Input() item!: ReasoningItem;
    @Input() disabled = false;
    @Output() responseChange = new EventEmitter<UserReasoningResponse | null>();

    readonly classifications: InferenceClassification[] = ["entailed", "refuted", "underdetermined"];
    selectedClassification?: InferenceClassification;
    selectedPremiseId = "";
    selectedRelation = "";
    proofSelection: Record<string, boolean> = {};
    mappingTargets: Record<string, string> = {};
    categoricalRows: CategoricalDraftRow[] = [];
    positionValues: Record<string, number> = {};
    intervalValues: IntervalDraft[] = [];
    propositionValues: Record<string, boolean> = {};
    membershipValues: Record<string, boolean> = {};
    scopeValues: Record<string, boolean> = {};
    transformFinal: [number, number] = [0, 0];
    private nextWitnessId = 2;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes["item"]) this.reset();
    }

    classificationLabel(value: InferenceClassification): string { return CLASSIFICATION_LABEL_RU[value]; }
    relationLabel(value: string): string {
        const translated = semanticOperatorLabelRu(value);
        return translated === "неизвестная связь" ? value : translated;
    }
    entityLabel(id: string): string { return this.item.entities.find(entity => entity.id === id)?.label ?? id; }
    premiseLabel(id: string): string {
        const premise = this.item.premises.find(candidate => candidate.id === id);
        return premise ? renderPremiseRu(premise, this.item.entities) : id;
    }

    chooseClassification(value: InferenceClassification): void {
        this.selectedClassification = value;
        const kind = this.item.responseSpec.kind;
        this.responseChange.emit(kind === "threeWayInference"
            ? { kind, classification: value }
            : kind === "updateAfterPremiseChange" ? { kind, classification: value } : null);
    }

    choosePremise(): void {
        const kind = this.item.responseSpec.kind;
        this.responseChange.emit(kind === "identifyNecessaryPremise" && this.selectedPremiseId
            ? { kind, premiseId: this.selectedPremiseId }
            : null);
    }

    chooseRelation(): void {
        this.responseChange.emit(this.item.responseSpec.kind === "identifyMissingRelation" && this.selectedRelation
            ? { kind: "identifyMissingRelation", relation: this.selectedRelation }
            : null);
    }

    toggleProof(): void {
        if (this.item.responseSpec.kind !== "repairProof") return;
        const premiseIds = this.item.responseSpec.candidatePremiseIds.filter(id => this.proofSelection[id]);
        this.responseChange.emit(premiseIds.length ? { kind: "repairProof", premiseIds } : null);
    }

    updateMapping(): void {
        if (this.item.responseSpec.kind !== "completeMapping") return;
        const pairs = this.item.responseSpec.sourceIds.map(source => ({ source, target: this.mappingTargets[source] ?? "" }));
        this.responseChange.emit(pairs.every(pair => pair.target) ? { kind: "completeMapping", pairs } : null);
    }

    addWitness(): void {
        this.categoricalRows.push({ id: `w${this.nextWitnessId++}`, classes: {} });
        this.updateWorld();
    }

    removeWitness(index: number): void {
        if (this.categoricalRows.length <= 1) return;
        this.categoricalRows.splice(index, 1);
        this.updateWorld();
    }

    setCategorical(row: CategoricalDraftRow, classId: string, event: Event): void {
        row.classes[classId] = (event.target as HTMLInputElement).checked;
        this.updateWorld();
    }

    setMembership(objectId: string, classId: string, event: Event): void {
        this.membershipValues[`${objectId}\u0000${classId}`] = (event.target as HTMLInputElement).checked;
        this.updateWorld();
    }

    setScope(personId: string, objectId: string, event: Event): void {
        this.scopeValues[`${personId}\u0000${objectId}`] = (event.target as HTMLInputElement).checked;
        this.updateWorld();
    }
    get scopeFrames(): readonly ScopeFrameSpec[] { return this.item.domain.kind === "boundedContexts" ? this.item.domain.frames ?? [] : []; }
    scopeFrameKey(frame: ScopeFrameSpec, subject: string, object: string): string { return `${frame.contextId}\u0000${frame.relation}\u0000${subject}\u0000${object}`; }
    setScopeFrame(frame: ScopeFrameSpec, subject: string, object: string, event: Event): void {
        this.scopeValues[this.scopeFrameKey(frame, subject, object)] = (event.target as HTMLInputElement).checked;
        this.updateWorld();
    }
    scopeRelationLabel(frame: ScopeFrameSpec): string { return frame.relation === "reads" ? "читает" : frame.relation === "sees" ? "видит" : frame.relation === "signalsTo" ? "передаёт сигнал" : "предшествует"; }

    updateWorld(): void {
        const world = this.buildWorld();
        const kind = this.item.responseSpec.kind;
        this.responseChange.emit(world && (kind === "constructSatisfyingModel" || kind === "constructCounterexample")
            ? { kind, world }
            : null);
    }

    get editableIds(): string[] {
        const spec = this.item.responseSpec;
        return spec.kind === "constructSatisfyingModel" || spec.kind === "constructCounterexample" ? spec.editableEntityIds : [];
    }

    get classEntities(): EntitySpec[] { return this.item.entities.filter(entity => entity.sort === "class"); }
    get objectEntities(): EntitySpec[] { return this.item.entities.filter(entity => entity.sort === "object" || entity.sort === "person"); }
    get personEntities(): EntitySpec[] { return this.item.entities.filter(entity => entity.sort === "person"); }
    get scopeObjectEntities(): EntitySpec[] { return this.item.entities.filter(entity => entity.sort === "object"); }
    get intervalEntities(): EntitySpec[] { return this.item.entities.filter(entity => entity.sort === "interval"); }
    get positionEntities(): EntitySpec[] { return this.item.entities.filter(entity => entity.sort === "position" || entity.sort === "object"); }

    get propositionIds(): string[] {
        const ids = new Set<string>();
        for (const premise of this.item.premises) {
            if (premise.kind === "propositionValue") ids.add(premise.propositionId);
            if (premise.kind === "booleanConstraint") premise.propositionIds.forEach(id => ids.add(id));
        }
        if (this.item.query.kind === "proposition") ids.add(this.item.query.propositionId);
        return [...ids].sort();
    }

    get mappingSourceIds(): string[] {
        if (this.item.domain.kind === "boundedStructuralMapping") return this.item.domain.sourceIds;
        return this.item.entities.filter(entity => entity.features?.["frame"] === "source").map(entity => entity.id);
    }

    get mappingTargetIds(): string[] {
        if (this.item.domain.kind === "boundedStructuralMapping") return this.item.domain.targetIds;
        return this.item.entities.filter(entity => entity.features?.["frame"] === "target").map(entity => entity.id);
    }

    private reset(): void {
        this.selectedClassification = undefined;
        this.selectedPremiseId = "";
        this.selectedRelation = "";
        this.proofSelection = {};
        this.mappingTargets = {};
        this.categoricalRows = [{ id: "w1", classes: {} }];
        this.nextWitnessId = 2;
        this.positionValues = Object.fromEntries(this.positionEntities.map(entity => [entity.id, 0]));
        this.intervalValues = this.intervalEntities.map(entity => ({ id: entity.id, start: 0, end: 1 }));
        this.propositionValues = Object.fromEntries(this.propositionIds.map(id => [id, false]));
        this.membershipValues = {};
        this.scopeValues = {};
        this.transformFinal = [0, 0];
        this.responseChange.emit(null);
        if (this.item.responseSpec.kind === "constructSatisfyingModel" || this.item.responseSpec.kind === "constructCounterexample") {
            this.updateWorld();
        }
    }

    private buildWorld(): SemanticWorld | null {
        const domain = this.item.domain;
        if (domain.kind === "categoricalUnary") {
            const world: CategoricalWorld = { kind: "categoricalWorld", witnesses: this.categoricalRows.map(row => ({ id: row.id, classes: this.classEntities.filter(entity => row.classes[entity.id]).map(entity => entity.id) })) };
            return world;
        }
        if (domain.kind === "boundedPositions") {
            const world: PositionWorld = { kind: "positionWorld", positions: this.positionEntities.map(entity => ({ entityId: entity.id, value: Number(this.positionValues[entity.id]) })) };
            return world;
        }
        if (domain.kind === "boundedIntervals") {
            const world: IntervalWorld = { kind: "intervalWorld", intervals: this.intervalValues.map(interval => ({ entityId: interval.id, start: Number(interval.start), end: Number(interval.end) })) };
            return world;
        }
        if (domain.kind === "boundedContexts") {
            if (this.scopeFrames.length) {
                const world: ContextScopeWorld = { kind: "contextScopeWorld", frames: this.scopeFrames.map(frame => ({ ...frame,
                    relationPairs: frame.subjectIds.flatMap(subject => frame.objectIds.filter(object => this.scopeValues[this.scopeFrameKey(frame, subject, object)]).map(object => [subject, object] as [string, string])),
                })) };
                return world;
            }
            const people = this.personEntities.map(entity => entity.id);
            const objects = this.scopeObjectEntities.map(entity => entity.id);
            const world: ScopeWorld = {
                kind: "scopeWorld", contextId: domain.contextIds[0] ?? "context", people, objects,
                relationPairs: people.flatMap(person => objects.filter(object => this.scopeValues[`${person}\u0000${object}`]).map(object => [person, object] as [string, string])),
            };
            return world;
        }
        if (domain.kind === "boundedGraph" || domain.kind === "boundedStructuralMapping") {
            const world: MappingWorld = { kind: "mappingWorld", pairs: this.mappingSourceIds.filter(source => this.mappingTargets[source]).map(source => ({ source, target: this.mappingTargets[source] })) };
            return world;
        }
        if (domain.kind === "boundedTransformations") {
            const initialPoint: [number, number] = this.item.query.kind === "transformationResult" ? this.item.query.initialPoint : [0, 0];
            const world: TransformWorld = { kind: "transformWorld", initialPoint, finalPoint: [Number(this.transformFinal[0]), Number(this.transformFinal[1])] };
            return world;
        }
        if (domain.kind === "composite" || domain.kind === "boundedMembership") {
            const memberships = this.objectEntities.flatMap(object => this.classEntities
                .filter(classEntity => this.membershipValues[`${object.id}\u0000${classEntity.id}`])
                .map(classEntity => ({ objectId: object.id, classId: classEntity.id })));
            const world: MembershipWorld = { kind: "membershipWorld", memberships };
            return world;
        }
        if (this.propositionIds.length) {
            const world: PropositionWorld = { kind: "propositionWorld", values: this.propositionIds.map(propositionId => ({ propositionId, value: !!this.propositionValues[propositionId] })) };
            return world;
        }
        return null;
    }
}
