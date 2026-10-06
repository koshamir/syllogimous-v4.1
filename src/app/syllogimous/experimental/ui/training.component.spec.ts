import { ActiveTimerService } from "../training/active-timer";
import { ExperimentalRepository } from "../persistence/experimental-repository";
import { TransparentSchedulerService } from "../training/transparent-scheduler";
import { generateReasoningItem } from "../reasoning-core/generators/generator-registry";
import { GenerationFacade } from "./generation-facade";
import { ExperimentalTrainingComponent } from "./training.component";
import { GenerationRequest, GenerationResult } from "../reasoning-core/models/semantic.models";

describe("experimental training lifecycle", () => {
    let now: number;
    let repository: ExperimentalRepository;
    let component: ExperimentalTrainingComponent;
    let timer: ActiveTimerService;
    let generator: GenerationFacade;
    beforeEach(() => {
        now = 0;
        repository = new ExperimentalRepository(null, null, () => 100);
        timer = new ActiveTimerService(document, { now: () => now });
        generator = { generate: async request => generateReasoningItem(request), cancel: () => {}, supportedFamilies: () => ["categorical"] };
        component = new ExperimentalTrainingComponent(repository, new TransparentSchedulerService(repository), timer, generator);
    });
    afterEach(() => { component.ngOnDestroy(); timer.ngOnDestroy(); });

    it("counts each answer once and excludes feedback and generation from persisted session time", async () => {
        await component.ngOnInit();
        now = 1_000;
        component.setResponse({ kind: "threeWayInference", classification: component.item!.semanticCertificate.classification! });
        await component.submit();
        expect(component.activeSessionMs).toBe(1_000);
        expect((await repository.listSessions())[0].activeDurationMs).toBe(1_000);
        now = 9_000;
        await component.finish();
        expect(component.activeSessionMs).toBe(1_000);
        expect(timer.snapshot().running).toBeFalse();
    });

    it("rejects submission during a manual pause", async () => {
        await component.ngOnInit();
        component.setResponse({ kind: "threeWayInference", classification: "entailed" });
        component.togglePause();
        await component.submit();
        expect(await repository.listTrials()).toEqual([]);
    });
    it("uses only one same-target prefetched follow-up before selecting afresh", async () => {
        const requests: GenerationRequest[] = [];
        generator.generate = async request => { requests.push(request); return generateReasoningItem(request); };
        await component.ngOnInit();
        component.setResponse({ kind: "threeWayInference", classification: component.item!.semanticCertificate.classification! });
        await component.submit();
        await Promise.resolve();
        expect(requests.length).toBe(2);
        await component.nextItem();
        expect(requests.length).toBe(2);
        expect(component.scheduled!.explanationRu).toContain("одно повторное");
        component.setResponse({ kind: "threeWayInference", classification: component.item!.semanticCertificate.classification! });
        await component.submit();
        expect(requests.length).toBe(2);
        await component.nextItem();
        expect(requests.length).toBe(3);
    });

    it("does not render a retired worker result after the session is finished", async () => {
        let resolveRequest!: (result: GenerationResult) => void;
        let pendingRequest!: GenerationRequest;
        generator.generate = request => { pendingRequest = request; return new Promise(resolve => { resolveRequest = resolve; }); };
        const startup = component.ngOnInit();
        for (let turn = 0; turn < 10 && !resolveRequest; turn++) await new Promise<void>(resolve => setTimeout(resolve, 0));
        expect(resolveRequest).toBeDefined();
        await component.finish();
        resolveRequest(generateReasoningItem(pendingRequest));
        await startup;
        expect(component.state).toBe("finished");
        expect(timer.snapshot().running).toBeFalse();
    });

    it("records a timed-out item as unscored and does not update mastery", async () => {
        await repository.initialize();
        await repository.saveSettings({ ...(await repository.getSettings()), timePressure: "limited", timeLimitSeconds: 15 });
        await component.ngOnInit();
        now = 15_100;
        const refreshable = component as unknown as { refreshElapsed(): void };
        refreshable.refreshElapsed();
        expect(component.state).toBe("timedOut");
        expect(await repository.listTrials()).toEqual([]);
        expect(await repository.listMastery()).toEqual([]);
        await component.finish();
        expect((await repository.listSessions())[0].timedOutItemIds).toEqual([component.item!.id]);
    });
});
