import { NOUNS, EnumQuestionType, getEmojis, getStrings } from "../constants/question.constants";
import { LS_HISTORY, LS_TRAINING_UNIT } from "../constants/local-storage.constants";
import { FAMILY_TYPE, LS_V5_LEVELS, LS_V5_PREMISES } from "../constants/v5.constants";
import { Question } from "../models/question.models";
import { questionTypeLabel } from "../utils/russian.utils";
import { correctLabel, isCorrect, isTimeout, userLabel } from "../utils/answer.utils";
import { EngineService } from "./engine.service";
import { ENGINE_FAMILIES, FamilyId, NamePool } from "../engine";

const subjectsOf = (html: string) => [...html.matchAll(/<span class="subject">(.*?)<\/span>/g)].map(m => m[1]);

describe("v5 items in the Angular layer", () => {
    beforeEach(() => localStorage.clear());

    function rendered(engine: EngineService, family: FamilyId) {
        const item = engine.next({ enabled: [family] });
        const conc = Array.isArray(item.render.conclusion) ? item.render.conclusion : [item.render.conclusion];
        return { item, html: [...item.render.instructions, ...item.render.notes, ...item.render.premises, ...conc] };
    }

    for (const pool of ["cyrillic", "words", "latin", "emoji"] as NamePool[]) {
        it(`renders every ported family with the ${pool} name pool`, () => {
            const engine = new EngineService();
            engine.saveSettings({ namePool: pool });
            for (const family of ENGINE_FAMILIES) {
                const { item, html } = rendered(engine, family);
                expect(item.family).toBe(family);
                for (const h of html) {
                    expect(h).not.toContain("undefined");
                    expect((h.match(/<span\b/g) || []).length).withContext(h).toBe((h.match(/<\/span>/g) || []).length);
                }
                const names = html.flatMap(subjectsOf);
                expect(names.length).toBeGreaterThan(1);
                if (pool === "words") expect(names.every(n => NOUNS.includes(n))).withContext(family).toBeTrue();
                if (pool === "latin") expect(names.every(n => /^[A-Z]{3}$/.test(n))).withContext(family).toBeTrue();
                if (pool === "emoji") expect(names.every(n => getEmojis().includes(n))).withContext(family).toBeTrue();
                if (pool === "cyrillic") {
                    expect(names.every(n => /^[А-ЯЁ]{3}$/.test(n))).withContext(family).toBeTrue();
                    const visible = html.join(" ").replace(/<[^>]+>/g, " ");
                    expect(visible).not.toMatch(/[A-Za-z]/);
                }
            }
        });
    }
});

describe("migration of old keys", () => {
    beforeEach(() => localStorage.clear());

    it("starts a family from its old premise count, a v5.0 level, or the family minimum", () => {
        localStorage.setItem(LS_TRAINING_UNIT + EnumQuestionType.ComparisonNumerical, JSON.stringify({ premises: 6, right: 3, timeout: 0, wrong: 1 }));
        localStorage.setItem(LS_TRAINING_UNIT + EnumQuestionType.Syllogism, JSON.stringify({ premises: 19, right: 0, timeout: 0, wrong: 0 }));
        localStorage.setItem(LS_V5_LEVELS, JSON.stringify({ linear: { level: 12, count: 30, last20: [] } }));
        const engine = new EngineService();
        expect(engine.premisesOf("orderNum")).toBe(6);
        expect(engine.premisesOf("syllogism")).toBe(6);
        expect(engine.premisesOf("linear")).toBe(4);
        expect(engine.premisesOf("groups")).toBe(2);
        // stored once: later changes to the old key no longer matter
        localStorage.setItem(LS_TRAINING_UNIT + EnumQuestionType.ComparisonNumerical, JSON.stringify({ premises: 2 }));
        expect(engine.premisesOf("orderNum")).toBe(6);
        expect(JSON.parse(localStorage.getItem(LS_V5_PREMISES)!)["orderNum"].level).toBe(6);
    });

    it("keeps old history records loadable", () => {
        const old = new Question(EnumQuestionType.ComparisonNumerical);
        old.premises = ["<span class=\"subject\">A</span> больше, чем <span class=\"subject\">B</span>"];
        old.isValid = true;
        old.userAnswer = false;
        localStorage.setItem(LS_HISTORY, JSON.stringify([old]));
        const loaded = JSON.parse(localStorage.getItem(LS_HISTORY)!)[0] as Question;
        expect(loaded.type).toBe("Comparison Numerical");
        expect(questionTypeLabel(loaded.type)).toBe("Сравнение чисел");
        expect(isCorrect(loaded)).toBeFalse();
    });

    it("maps every family to a question type and back", () => {
        for (const f of Object.keys(FAMILY_TYPE) as FamilyId[]) expect(questionTypeLabel(FAMILY_TYPE[f])).not.toBe(FAMILY_TYPE[f]);
    });
});

describe("isCorrect on old and new records", () => {
    it("v4.1 records: userAnswer vs isValid", () => {
        const q = new Question(EnumQuestionType.Distinction);
        q.isValid = true;
        expect(isCorrect(q)).toBeUndefined();
        expect(isTimeout(q)).toBeTrue();
        q.userAnswer = true;
        expect(isCorrect(q)).toBeTrue();
        expect(correctLabel(q)).toBe("Верно");
        q.userAnswer = false;
        expect(isCorrect(q)).toBeFalse();
        expect(userLabel(q)).toBe("Неверно");
    });

    it("v5 records: userChoice vs correct (ternary, binary, choice)", () => {
        const q = new Question(EnumQuestionType.LinearArrangement);
        q.engineVersion = "v5.0";
        q.format = "ternary";
        q.correct = "undetermined";
        expect(isCorrect(q)).toBeUndefined();
        expect(isTimeout(q)).toBeTrue();
        q.userChoice = "entailed";
        expect(isCorrect(q)).toBeFalse();
        expect(correctLabel(q)).toBe("Неизвестно");
        expect(userLabel(q)).toBe("Следует");
        q.userChoice = "undetermined";
        expect(isCorrect(q)).toBeTrue();

        const b = new Question(EnumQuestionType.Binary);
        b.engineVersion = "v5.0";
        b.format = "binary";
        b.correct = "false";
        b.userChoice = "false";
        expect(isCorrect(b)).toBeTrue();
        expect(correctLabel(b)).toBe("Неверно");

        const c = new Question(EnumQuestionType.ComparisonNumerical);
        c.engineVersion = "v5.0";
        c.format = "choice";
        c.options = [{ id: "e0", label: "ВОЛ" }, { id: "none", label: "Нельзя определить" }];
        c.correct = "none";
        c.userChoice = "e0";
        expect(isCorrect(c)).toBeFalse();
        expect(correctLabel(c)).toBe("Нельзя определить");
        expect(userLabel(c)).toBe("ВОЛ");
    });
});

describe("Russian symbol pools", () => {
    it("contains exactly 1497 unique clean nouns", () => {
        expect(NOUNS.length).toBe(1497);
        const normalized = NOUNS.map(value => value.normalize("NFC").toLocaleLowerCase("ru-RU"));
        expect(new Set(normalized).size).toBe(1497);
        for (const noun of NOUNS) {
            expect(noun).toBe(noun.trim());
            expect(noun).toBe(noun.normalize("NFC"));
            expect(noun).not.toContain(",");
            expect(noun).not.toMatch(/[A-Za-z]/);
            expect(noun).not.toMatch(/[\u0000-\u001f\u007f]/);
        }
    });

    it("keeps the original unique three-letter pseudowords", () => {
        const values = getStrings();
        expect(values.length).toBe(320);
        expect(new Set(values).size).toBe(values.length);
        expect(values.every(value => /^[QRSTVWXZ][AEIOU][QRSTVWXZ]$/.test(value))).toBeTrue();
    });

    it("keeps the emoji pool intact", () => {
        const values = getEmojis();
        expect(values.length).toBe(848);
        expect(values[0]).toBe(String.fromCodePoint(0x1F600));
        expect(values[values.length - 1]).toBe(String.fromCodePoint(0x1F5FF));
    });
});
