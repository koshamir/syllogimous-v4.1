import { Inject, Injectable, InjectionToken, OnDestroy } from "@angular/core";
import { DOCUMENT } from "@angular/common";
import { PauseReason, PauseSpan } from "../persistence/experimental-records";

export interface MonotonicClock {
    now(): number;
}

export const MONOTONIC_CLOCK = new InjectionToken<MonotonicClock>("MONOTONIC_CLOCK", {
    providedIn: "root",
    factory: () => ({ now: () => performance.now() }),
});

export interface ActiveTimerSnapshot {
    activeDurationMs: number;
    running: boolean;
    pauseReasons: PauseReason[];
    pauses: PauseSpan[];
}

/** Pure monotonic timer. Wall-clock timestamps never participate in duration. */
export class ActiveTimer {
    private accumulatedMs = 0;
    private activeSinceMs: number | null = null;
    private readonly reasons = new Map<PauseReason, number>();
    private spans: PauseSpan[] = [];

    reset(nowMs: number, initialReason: PauseReason = "itemNotReady"): void {
        this.accumulatedMs = 0;
        this.activeSinceMs = null;
        this.reasons.clear();
        this.spans = [];
        this.reasons.set(initialReason, nowMs);
    }

    ready(nowMs: number): void {
        this.resume("itemNotReady", nowMs);
        this.resume("generation", nowMs);
        this.startIfPossible(nowMs);
    }

    pause(reason: PauseReason, nowMs: number): void {
        if (this.reasons.has(reason)) return;
        this.captureActive(nowMs);
        this.reasons.set(reason, nowMs);
    }

    resume(reason: PauseReason, nowMs: number): void {
        const startedAt = this.reasons.get(reason);
        if (startedAt === undefined) return;
        this.reasons.delete(reason);
        this.spans.push({
            reason,
            startedAtMonotonicMs: startedAt,
            endedAtMonotonicMs: nowMs,
            durationMs: Math.max(0, nowMs - startedAt),
        });
        this.startIfPossible(nowMs);
    }

    elapsed(nowMs: number): number {
        return Math.max(0, this.accumulatedMs + (this.activeSinceMs === null ? 0 : nowMs - this.activeSinceMs));
    }

    snapshot(nowMs: number): ActiveTimerSnapshot {
        return {
            activeDurationMs: this.elapsed(nowMs),
            running: this.activeSinceMs !== null,
            pauseReasons: [...this.reasons.keys()],
            pauses: this.spans.map(span => ({ ...span })),
        };
    }

    private captureActive(nowMs: number): void {
        if (this.activeSinceMs === null) return;
        this.accumulatedMs += Math.max(0, nowMs - this.activeSinceMs);
        this.activeSinceMs = null;
    }

    private startIfPossible(nowMs: number): void {
        if (this.reasons.size === 0 && this.activeSinceMs === null) this.activeSinceMs = nowMs;
    }
}

/** Browser lifecycle adapter. Hidden documents are always paused. */
@Injectable()
export class ActiveTimerService implements OnDestroy {
    private readonly timer = new ActiveTimer();
    private readonly visibilityListener = () => this.applyVisibility();

    constructor(
        @Inject(DOCUMENT) private readonly document: Document,
        @Inject(MONOTONIC_CLOCK) private readonly clock: MonotonicClock,
    ) {
        this.timer.reset(this.clock.now());
        this.document.addEventListener("visibilitychange", this.visibilityListener);
        this.applyVisibility();
    }

    beginGeneration(): void {
        const now = this.clock.now();
        this.timer.reset(now, "generation");
        if (this.document.hidden) this.timer.pause("documentHidden", now);
    }

    itemVisible(): void { this.timer.ready(this.clock.now()); }
    pause(reason: PauseReason): void { this.timer.pause(reason, this.clock.now()); }
    resume(reason: PauseReason): void { this.timer.resume(reason, this.clock.now()); }
    snapshot(): ActiveTimerSnapshot { return this.timer.snapshot(this.clock.now()); }

    ngOnDestroy(): void {
        this.document.removeEventListener("visibilitychange", this.visibilityListener);
    }

    private applyVisibility(): void {
        if (this.document.hidden) this.pause("documentHidden");
        else this.resume("documentHidden");
    }
}
