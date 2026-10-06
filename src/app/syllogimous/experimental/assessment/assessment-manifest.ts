import { ComplexityTarget, ReasoningFamily } from "../reasoning-core/models/semantic.models";
import { AssessmentPhase } from "../persistence/experimental-records";

export interface AssessmentBlockManifest {
    id: string;
    titleRu: string;
    originalGrammarId: string;
    family: ReasoningFamily;
    itemCount: number;
    target: ComplexityTarget;
}

export interface AssessmentBatteryManifest {
    id: string;
    version: string;
    locale: "ru";
    titleRu: string;
    instructionsRu: string;
    unnormed: true;
    feedbackDuringTest: false;
    protectedFromTraining: true;
    phases: AssessmentPhase[];
    blocks: AssessmentBlockManifest[];
}

const common = {
    memoryVisibility: "visible" as const,
    distractorCount: 0,
    timePressure: "measured" as const,
};

/**
 * Original, unnormed tasks. Grammar IDs are reserved and must never be routed
 * into training. The manifest version is frozen into every assessment session.
 */
export const ASSESSMENT_BATTERY_V1: AssessmentBatteryManifest = {
    id: "syl-ri-original-battery",
    version: "assessment-manifest-1.1.0",
    locale: "ru",
    titleRu: "Независимая оценка переноса",
    instructionsRu: "Работайте самостоятельно. Во время блока правильность и разбор не показываются. Можно сделать перерыв только между блоками.",
    unnormed: true,
    feedbackDuringTest: false,
    protectedFromTraining: true,
    phases: ["baseline", "postTraining", "delayed"],
    blocks: [
        {
            id: "reserved-categorical-branch",
            titleRu: "Новые категориальные структуры",
            originalGrammarId: "assessment/categorical/reserved-mixed-witness-v1",
            family: "categorical",
            itemCount: 3,
            target: { ...common, level: 3, primaryDimension: "branching", displayedPremises: { min: 4, max: 6 }, responseFormat: "threeWayInference" },
        },
        {
            id: "reserved-order-diamond",
            titleRu: "Частичный порядок с развилкой",
            originalGrammarId: "assessment/order/reserved-double-fork-v1",
            family: "order",
            itemCount: 3,
            target: { ...common, level: 3, primaryDimension: "branching", displayedPremises: { min: 4, max: 4 }, responseFormat: "constructCounterexample" },
        },
    ],
};

export function assessmentItemCount(manifest: AssessmentBatteryManifest): number {
    return manifest.blocks.reduce((sum, block) => sum + block.itemCount, 0);
}

export function assessmentBlockAt(manifest: AssessmentBatteryManifest, itemIndex: number): AssessmentBlockManifest | undefined {
    let offset = 0;
    for (const block of manifest.blocks) {
        if (itemIndex >= offset && itemIndex < offset + block.itemCount) return block;
        offset += block.itemCount;
    }
    return undefined;
}
