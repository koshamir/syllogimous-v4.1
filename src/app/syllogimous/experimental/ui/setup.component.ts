import { Component, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { DEFAULT_SEMANTICS_VERSION, EMPTY_CLASS_SEMANTICS_VERSION } from "../reasoning-core/models/versions";
import { ExperimentalSettingsRecord } from "../persistence/experimental-records";
import { ExperimentalRepository } from "../persistence/experimental-repository";
import { EXPERIMENTAL_COPY_RU } from "./experimental-copy";
import { verifiedCategoricalTutorialExamples } from "../training/tutorial-examples";
import { CLASSIFICATION_LABEL_RU } from "../reasoning-core/rendering/ru-catalog";
import { InferenceClassification } from "../reasoning-core/models/semantic.models";

@Component({
    selector: "app-experimental-setup",
    template: `
        <section class="experimental-panel" aria-labelledby="setup-title">
            <h2 id="setup-title">{{ copy.setup }}</h2>
            <p>Выберите понятные начальные условия. Их можно изменить позже; разные версии семантики ведут раздельную историю освоения.</p>
            <form *ngIf="settings" (ngSubmit)="save()">
                <div class="form-row">
                    <label for="session-duration">Продолжительность сессии</label>
                    <select id="session-duration" name="sessionDuration" [(ngModel)]="settings.sessionMinutes">
                        <option [ngValue]="10">10 минут</option><option [ngValue]="20">20 минут</option>
                        <option [ngValue]="30">30 минут</option><option [ngValue]="35">35 минут</option>
                    </select>
                    <p class="muted">Рекомендуемые 25–35 минут — настраиваемая исследовательская эвристика, а не доказанный оптимум.</p>
                </div>
                <fieldset class="form-row">
                    <legend>{{ copy.semanticsHeading }}</legend>
                    <label><input type="radio" name="semantics" [value]="nonemptyVersion" [(ngModel)]="settings.semanticsVersion"> {{ copy.nonemptySemantics }}</label>
                    <label><input type="radio" name="semantics" [value]="emptyVersion" [(ngModel)]="settings.semanticsVersion"> {{ copy.emptySemantics }}</label>
                    <p class="notice">{{ copy.semanticsTutorial }}</p>
                    <details class="tutorial-examples">
                        <summary>Показать проверенные примеры</summary>
                        <article *ngFor="let example of tutorialExamples">
                            <h3>{{ example.titleRu }}</h3><p class="muted">{{ example.semanticsRu }}</p>
                            <ol><li *ngFor="let premise of example.premiseTextsRu">{{ premise }}</li></ol>
                            <p><strong>Вывод:</strong> {{ example.queryTextRu }}</p>
                            <p><strong>Статус:</strong> {{ classificationLabel(example.classification) }}. {{ example.explanationRu }}</p>
                        </article>
                    </details>
                    <label><input type="checkbox" name="understood" [(ngModel)]="understood"> {{ copy.comprehension }}</label>
                    <fieldset><legend>Короткая проверка понимания</legend><p>Единственная посылка: каждый объект класса «A» относится к классу «B». Вывод: существует объект, относящийся и к «A», и к «B». Каков статус при выбранном выше правиле существования классов?</p><label *ngFor="let value of classifications"><input type="radio" name="comprehensionAnswer" [value]="value" [(ngModel)]="comprehensionAnswer"> {{ classificationLabel(value) }}</label><p class="muted">Здесь учитываются оба названных класса и непустая область объектов. При изменении правила проверьте ответ заново.</p></fieldset>
                </fieldset>
                <div class="action-row">
                    <button class="primary-action" type="submit" [disabled]="!understood || !comprehensionAnswer || saving">{{ copy.saveAndStart }}</button>
                    <span role="status" aria-live="polite">{{ status }}</span>
                </div>
            </form>
            <p *ngIf="!settings" role="status">Загружаем локальные настройки…</p>
        </section>
    `,
})
export class SetupComponent implements OnInit {
    readonly copy = EXPERIMENTAL_COPY_RU;
    readonly nonemptyVersion = DEFAULT_SEMANTICS_VERSION;
    readonly emptyVersion = EMPTY_CLASS_SEMANTICS_VERSION;
    readonly tutorialExamples = verifiedCategoricalTutorialExamples();
    settings?: ExperimentalSettingsRecord;
    understood = false;
    saving = false;
    status = "";
    readonly classifications: InferenceClassification[] = ["entailed", "refuted", "underdetermined"];
    comprehensionAnswer?: InferenceClassification;

    constructor(private readonly repository: ExperimentalRepository, private readonly router: Router) {}

    async ngOnInit(): Promise<void> {
        await this.repository.initialize();
        this.settings = await this.repository.getSettings();
    }

    async save(): Promise<void> {
        if (!this.settings || !this.understood) return;
        const expected = this.settings.semanticsVersion === this.nonemptyVersion ? "entailed" : "underdetermined";
        if (this.comprehensionAnswer !== expected) {
            this.status = "Пересмотрите правило существования классов и проверенные примеры: выбранный статус не соответствует этой семантике.";
            return;
        }
        this.saving = true;
        await this.repository.saveSettings({ ...this.settings, updatedAt: Date.now() });
        this.status = "Настройки сохранены.";
        this.saving = false;
        await this.router.navigate(["/experimental/training"]);
    }

    classificationLabel(value: InferenceClassification): string { return CLASSIFICATION_LABEL_RU[value]; }
}
