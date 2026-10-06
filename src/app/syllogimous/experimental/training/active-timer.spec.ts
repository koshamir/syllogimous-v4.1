import { ActiveTimer } from "./active-timer";

describe("ActiveTimer", () => {
    it("counts only visible, ready solving time across overlapping pause reasons", () => {
        const timer = new ActiveTimer();
        timer.reset(0, "generation");
        timer.ready(100);
        timer.pause("documentHidden", 350);
        timer.pause("tutorial", 400);
        timer.resume("documentHidden", 700);
        timer.resume("tutorial", 900);
        expect(timer.elapsed(1_100)).toBe(450);
        expect(timer.snapshot(1_100).pauses.map(pause => pause.reason)).toEqual(["generation", "documentHidden", "tutorial"]);
    });

    it("is idempotent for duplicate pause and resume events", () => {
        const timer = new ActiveTimer();
        timer.reset(0);
        timer.ready(10);
        timer.pause("manual", 20);
        timer.pause("manual", 30);
        timer.resume("manual", 50);
        timer.resume("manual", 60);
        expect(timer.elapsed(70)).toBe(30);
        expect(timer.snapshot(70).pauses.filter(pause => pause.reason === "manual").length).toBe(1);
    });

    it("never derives duration from wall-clock timestamps", () => {
        const timer = new ActiveTimer();
        timer.reset(10_000);
        timer.ready(10_010);
        expect(timer.elapsed(10_035)).toBe(25);
    });
});
