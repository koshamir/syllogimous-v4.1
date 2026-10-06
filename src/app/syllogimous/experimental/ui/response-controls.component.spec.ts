import { SimpleChange } from "@angular/core";
import { generateReasoningItem } from "../reasoning-core/generators/generator-registry";
import { DEFAULT_SEMANTICS_VERSION } from "../reasoning-core/models/versions";
import { ResponseControlsComponent } from "./response-controls.component";

describe("constructive response controls", () => {
    it("keeps witness IDs unique after removing and adding rows", () => {
        const result = generateReasoningItem({ requestId: "controls", seed: "controls", family: "categorical", partition: "training", semanticsVersion: DEFAULT_SEMANTICS_VERSION, maxAttempts: 32, wallTimeBudgetMs: 1_000, target: { level: 1, primaryDimension: "supportSize", displayedPremises: { min: 1, max: 6 }, responseFormat: "constructSatisfyingModel", memoryVisibility: "visible", distractorCount: 0, timePressure: "none" } });
        expect(result.ok).toBeTrue();
        if (!result.ok) return;
        const controls = new ResponseControlsComponent();
        controls.item = result.item;
        controls.ngOnChanges({ item: new SimpleChange(undefined, result.item, true) });
        controls.addWitness(); controls.addWitness(); controls.removeWitness(1); controls.addWitness();
        expect(new Set(controls.categoricalRows.map(row => row.id)).size).toBe(controls.categoricalRows.length);
    });
});
