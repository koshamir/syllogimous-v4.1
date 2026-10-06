import { Component, OnInit } from "@angular/core";
import { MasteryRecord } from "../persistence/experimental-records";
import { ExperimentalRepository } from "../persistence/experimental-repository";
import { FAMILY_LABEL_RU } from "../reasoning-core/rendering/ru-catalog";
import { ReasoningFamily } from "../reasoning-core/models/semantic.models";
import { masteryMean, masteryUncertainty } from "../training/transparent-scheduler";
import { DEFAULT_SEMANTICS_VERSION, EMPTY_CLASS_SEMANTICS_VERSION } from "../reasoning-core/models/versions";

interface ProgressSummary {
    answered: number;
    correct: number;
    accuracy: number | null;
    activeDurationMs: number;
}

@Component({
    selector: "app-experimental-progress",
    template: `
        <section class="experimental-panel" aria-labelledby="progress-title">
            <h2 id="progress-title">Ход обучения и независимая оценка</h2>
            <p>Показатели разделены: практика на знакомых генераторах не считается доказательством общего переноса.</p>
            <p *ngIf="unverifiedCount" class="notice">Внешних непроверенных ответов: {{ unverifiedCount }}. Они не включены в точность локально проверенных результатов.</p>
            <div class="tile-grid">
                <article class="tile"><h3>Тренировочные задания</h3><p>Ответов: <strong>{{ training.answered }}</strong></p><p>Точность: <strong>{{ accuracyText(training) }}</strong></p><p>Активное решение: <strong>{{ durationText(training.activeDurationMs) }}</strong></p></article>
                <article class="tile"><h3>Зарезервированные задания</h3><p>Ответов: <strong>{{ assessment.answered }}</strong></p><p>Точность: <strong>{{ accuracyText(assessment) }}</strong></p><p>Активное решение: <strong>{{ durationText(assessment.activeDurationMs) }}</strong></p></article>
            </div>
            <p class="notice">Здесь нет баллов интеллекта, процентилей или показателя «общей способности». Личное изменение до и после занятий само по себе не доказывает причинный эффект.</p>
        </section>
        <section class="experimental-panel" aria-labelledby="mastery-title">
            <h2 id="mastery-title">Прозрачные оценки освоения</h2>
            <p class="muted">Оценка — регуляризованная доля успешных ответов с неопределённостью. Это не биологический параметр.</p>
            <div class="table-responsive" *ngIf="mastery.length; else noMastery">
                <table class="table"><thead><tr><th scope="col">Направление</th><th scope="col">Семантика</th><th scope="col">Источник</th><th scope="col">Измерение</th><th scope="col">Оценка</th><th scope="col">Неопределённость</th><th scope="col">Наблюдений</th></tr></thead>
                    <tbody><tr *ngFor="let record of mastery"><th scope="row">{{ familyLabel(record.family) }}</th><td>{{ semanticsLabel(record) }}</td><td>{{ record.sourceTrust === 'local' ? 'локальный' : 'внешний, не проверен' }}</td><td>{{ dimensionLabel(record.primaryDimension) }}</td><td>{{ percent(masteryMean(record)) }}</td><td>± {{ percent(masteryUncertainty(record)) }}</td><td>{{ record.observations }}</td></tr></tbody>
                </table>
            </div>
            <ng-template #noMastery><p>После первых тренировочных ответов здесь появятся оценки.</p></ng-template>
        </section>
    `,
})
export class ExperimentalProgressComponent implements OnInit {
    training: ProgressSummary = { answered: 0, correct: 0, accuracy: null, activeDurationMs: 0 };
    assessment: ProgressSummary = { answered: 0, correct: 0, accuracy: null, activeDurationMs: 0 };
    mastery: MasteryRecord[] = [];
    unverifiedCount = 0;
    readonly masteryMean = masteryMean;
    readonly masteryUncertainty = masteryUncertainty;

    constructor(private readonly repository: ExperimentalRepository) {}

    async ngOnInit(): Promise<void> {
        const [trials, mastery] = await Promise.all([this.repository.listTrials(), this.repository.listMastery()]);
        this.mastery = mastery.sort((a, b) => a.family.localeCompare(b.family));
        this.unverifiedCount = trials.filter(trial => trial.certificateTrust !== "locallyVerified").length;
        for (const partition of ["training", "assessment"] as const) {
            const selected = trials.filter(trial => trial.partition === partition && trial.certificateTrust === "locallyVerified");
            const scored = selected.filter(trial => trial.correct !== undefined);
            const summary: ProgressSummary = {
                answered: selected.length,
                correct: scored.filter(trial => trial.correct).length,
                accuracy: scored.length ? scored.filter(trial => trial.correct).length / scored.length : null,
                activeDurationMs: selected.reduce((sum, trial) => sum + trial.activeDurationMs, 0),
            };
            if (partition === "training") this.training = summary;
            else this.assessment = summary;
        }
    }

    familyLabel(family: ReasoningFamily): string { return FAMILY_LABEL_RU[family]; }
    semanticsLabel(record: MasteryRecord): string { return record.semanticsVersion === DEFAULT_SEMANTICS_VERSION ? "все классы непусты" : record.semanticsVersion === EMPTY_CLASS_SEMANTICS_VERSION ? "пустые классы допустимы" : "историческая, не определена"; }
    dimensionLabel(dimension: MasteryRecord["primaryDimension"]): string {
        const labels: Record<MasteryRecord["primaryDimension"], string> = {
            supportSize: "размер опоры", branching: "ветвление", scopeDepth: "глубина области действия",
            bindingInterference: "пересечение ролей", liveFrontier: "активный фронт",
            transformComposition: "композиция преобразований", crossFrameBridges: "связи между системами",
        };
        return labels[dimension];
    }
    percent(value: number): string { return `${Math.round(value * 100)} %`; }
    accuracyText(summary: ProgressSummary): string { return summary.accuracy === null ? "пока нет данных" : this.percent(summary.accuracy); }
    durationText(milliseconds: number): string {
        const minutes = Math.floor(milliseconds / 60_000);
        const seconds = Math.floor((milliseconds % 60_000) / 1_000);
        return `${minutes} мин ${seconds} с`;
    }
}
