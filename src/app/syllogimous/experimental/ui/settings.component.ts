import { Component, OnInit } from "@angular/core";
import { ExperimentalSettingsRecord } from "../persistence/experimental-records";
import { ExperimentalRepository } from "../persistence/experimental-repository";

@Component({
    selector: "app-experimental-settings",
    template: `
        <section class="experimental-panel" aria-labelledby="settings-title">
            <h2 id="settings-title">Настройки исследования</h2>
            <p>Параметры нагрузки не подменяют структурную сложность. Время, память и отвлекающие условия настраиваются отдельно.</p>
            <form *ngIf="settings" (ngSubmit)="save()">
                <div class="form-row"><label for="target-min">Нижняя граница ожидаемой точности, %</label><input id="target-min" type="number" name="targetMin" min="50" max="95" [(ngModel)]="targetMinPercent"></div>
                <div class="form-row"><label for="target-max">Верхняя граница ожидаемой точности, %</label><input id="target-max" type="number" name="targetMax" min="55" max="99" [(ngModel)]="targetMaxPercent"><p class="muted">Исходная полоса 70–85 % — экспериментальная эвристика продуктивной трудности.</p></div>
                <div class="form-row"><label for="memory">Видимость посылок</label><select id="memory" name="memory" [(ngModel)]="settings.memoryVisibility"><option value="visible">Все посылки видимы</option><option value="sequential">Посылки показываются по очереди</option><option value="memoryLoaded">Вариант с нагрузкой на память</option></select></div>
                <div class="form-row"><label for="distractors">Отвлекающих посылок</label><input id="distractors" type="number" name="distractors" min="0" max="8" [(ngModel)]="settings.distractorCount"></div>
                <div class="form-row"><label for="pressure">Режим времени</label><select id="pressure" name="pressure" [(ngModel)]="settings.timePressure"><option value="none">Без учёта скорости</option><option value="measured">Измерять без ограничения</option><option value="limited">Ограничение времени</option></select></div>
                <div *ngIf="settings.timePressure === 'limited'" class="form-row"><label for="time-limit">Лимит активного решения одного задания, секунд</label><input id="time-limit" type="number" name="timeLimit" min="15" max="600" [(ngModel)]="settings.timeLimitSeconds"><p class="muted">По умолчанию 90 секунд. Истечение лимита не считается ошибкой и не изменяет оценку освоения; задание остаётся неоценённым.</p></div>
                <div class="form-row"><label><input type="checkbox" name="scaffolds" [(ngModel)]="settings.scaffoldsEnabled"> Разрешить схемы, подписи ролей и рабочее поле во время обучения</label></div>
                <fieldset class="form-row"><legend>Расписание независимой оценки</legend>
                    <label><input type="checkbox" name="baseline" [(ngModel)]="settings.assessmentSchedule.baselineEnabled"> Провести исходную оценку</label>
                    <label for="post-delay">Оценка после обучения через, дней</label><input id="post-delay" type="number" name="postDelay" min="0" max="365" [(ngModel)]="settings.assessmentSchedule.postTrainingDelayDays">
                    <label for="delayed-delay">Отсроченная оценка через, дней</label><input id="delayed-delay" type="number" name="delayedDelay" min="1" max="730" [(ngModel)]="settings.assessmentSchedule.delayedDelayDays">
                </fieldset>
                <div class="action-row"><button class="primary-action" type="submit">Сохранить настройки</button><span role="status" aria-live="polite">{{ status }}</span></div>
            </form>
        </section>
    `,
})
export class ExperimentalSettingsComponent implements OnInit {
    settings?: ExperimentalSettingsRecord;
    targetMinPercent = 70;
    targetMaxPercent = 85;
    status = "";

    constructor(private readonly repository: ExperimentalRepository) {}

    async ngOnInit(): Promise<void> {
        this.settings = await this.repository.getSettings();
        this.settings.timeLimitSeconds ??= 90;
        this.targetMinPercent = Math.round(this.settings.targetAccuracyMin * 100);
        this.targetMaxPercent = Math.round(this.settings.targetAccuracyMax * 100);
    }

    async save(): Promise<void> {
        if (!this.settings) return;
        if (this.targetMinPercent < 50 || this.targetMaxPercent > 99 || this.targetMinPercent >= this.targetMaxPercent) {
            this.status = "Проверьте границы: нижняя должна быть меньше верхней.";
            return;
        }
        await this.repository.saveSettings({
            ...this.settings,
            targetAccuracyMin: this.targetMinPercent / 100,
            targetAccuracyMax: this.targetMaxPercent / 100,
            assessmentSchedule: { ...this.settings.assessmentSchedule },
            updatedAt: Date.now(),
        });
        this.status = "Настройки сохранены локально.";
    }
}
