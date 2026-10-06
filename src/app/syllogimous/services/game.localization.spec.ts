import { NOUNS, EnumQuestionType, getEmojis, getStrings } from "../constants/question.constants";
import { LS_PG_SETTINGS, LS_SYLLOGISM_GENERATOR } from "../constants/local-storage.constants";
import { Settings } from "../models/settings.models";
import { Question } from "../models/question.models";
import { extractSubjects } from "../utils/question.utils";
import { questionTypeLabel } from "../utils/russian.utils";
import { ProgressAndPerformanceService } from "./progress-and-performance.service";
import { GameService } from "./game.service";

describe("Russian question generation", () => {
    let game: GameService;

    beforeEach(() => {
        localStorage.clear();
        game = new GameService(
            {} as any,
            {} as any,
            new ProgressAndPerformanceService(),
            {} as any,
        );
        game.logger.setLevel("error");
        game.logger.setVerbose(false);
    });

    function allRenderedText(question: Question): string[] {
        return [
            ...(question.instructions || []),
            ...(question.notes || []),
            ...question.premises,
            ...(Array.isArray(question.conclusion) ? question.conclusion : [question.conclusion]),
        ];
    }

    function assertHealthyQuestion(question: Question, mode: "words" | "strings" | "emoji") {
        const rendered = allRenderedText(question);
        expect(question.premises.length).toBeGreaterThan(0);
        expect(rendered.every(Boolean)).toBeTrue();
        for (const html of rendered) {
            expect(html).not.toContain("undefined");
            expect((html.match(/<span\b/g) || []).length)
                .withContext(html)
                .toBe((html.match(/<\/span>/g) || []).length);
            const visible = html.replace(/<[^>]+>/g, " ");
            expect(visible).not.toMatch(/\b(?:is|same|opposite|before|after|more|less|north|south|east|west|left|right|steps?|level|hour|true|false|premises?|conclusion|relationship)\b/i);
        }

        const subjects = rendered.flatMap(extractSubjects);
        expect(subjects.length).toBeGreaterThan(1);
        if (mode === "words") {
            expect(subjects.every(value => NOUNS.includes(value))).toBeTrue();
        } else if (mode === "strings") {
            expect(subjects.every(value => /^[QRSTVWXZ][AEIOU][QRSTVWXZ]$/.test(value))).toBeTrue();
        } else {
            expect(subjects.every(value => getEmojis().includes(value))).toBeTrue();
        }
    }

    for (const mode of ["words", "strings", "emoji"] as const) {
        it(`generates all 12 types with ${mode}`, () => {
            const settings = new Settings();
            settings.enabled.meaningfulWords = mode === "words";
            settings.enabled.useEmojis = mode === "emoji";
            settings.enabled.negation = true;
            settings.enabled.meta = true;
            game.playgroundSettings = settings;

            for (const type of Object.values(EnumQuestionType)) {
                const count = type === EnumQuestionType.Binary ? 4 : type === EnumQuestionType.Analogy ? 3 : 2;
                for (let sample = 0; sample < 5; sample++) {
                    const question = game.getCreateFn(type, count)();
                    expect(question.type).toBe(type);
                    expect(question.premises.length).toBe(count);
                    assertHealthyQuestion(question, mode);
                }
            }
        });
    }

    it("generates Russian syllogisms with both generators", () => {
        const settings = new Settings();
        settings.enabled.negation = true;
        game.playgroundSettings = settings;

        for (const generator of ["fredo", "canyon"]) {
            localStorage.setItem(LS_SYLLOGISM_GENERATOR, generator);
            for (let sample = 0; sample < 4; sample++) {
                const question = game.createSyllogism(4);
                expect(question.premises.length).toBe(4);
                assertHealthyQuestion(question, "words");
            }
        }
    });

    it("loads settings saved with English internal keys", () => {
        const oldSettings = new Settings();
        oldSettings.enabled.meaningfulWords = false;
        oldSettings.enabled.negation = false;
        oldSettings.question[EnumQuestionType.ComparisonNumerical].enabled = false;
        oldSettings.question[EnumQuestionType.Direction3DTemporal].setNumOfPremises(7);

        localStorage.setItem(LS_PG_SETTINGS, JSON.stringify(oldSettings));
        const loaded = new Settings(JSON.parse(localStorage.getItem(LS_PG_SETTINGS)!));

        expect(loaded.enabled.meaningfulWords).toBeFalse();
        expect(loaded.enabled.negation).toBeFalse();
        expect(loaded.question[EnumQuestionType.ComparisonNumerical].enabled).toBeFalse();
        expect(loaded.question[EnumQuestionType.Direction3DTemporal].getNumOfPremises()).toBe(7);
        expect(Object.keys(loaded.question)).toContain("Direction3D Temporal");
    });

    it("keeps imported question JSON with English internal values compatible", () => {
        const oldQuestion = new Question(EnumQuestionType.ComparisonNumerical);
        oldQuestion.premises = ["<span class=\"subject\">A</span> is more than <span class=\"subject\">B</span>"];
        oldQuestion.conclusion = "<span class=\"subject\">A</span> is more than <span class=\"subject\">B</span>";
        oldQuestion.isValid = true;

        const loaded = JSON.parse(JSON.stringify(oldQuestion)) as Question;

        expect(loaded.type).toBe("Comparison Numerical");
        expect(loaded.premises).toEqual(oldQuestion.premises);
        expect(loaded.conclusion).toBe(oldQuestion.conclusion);
        expect(questionTypeLabel(loaded.type)).toBe("Сравнение чисел");
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
