import { Component, OnInit } from "@angular/core";
import { ImportMode, ImportPreview } from "../persistence/experimental-records";
import { ExperimentalRepository } from "../persistence/experimental-repository";

@Component({
    selector: "app-experimental-data",
    template: `
        <section class="experimental-panel" aria-labelledby="data-title">
            <h2 id="data-title">Данные и конфиденциальность</h2>
            <p class="notice">Все записи остаются в браузере на этом устройстве. Фоновая аналитика, синхронизация и автоматическая отправка отсутствуют.</p>
            <p>Хранилище: <strong>{{ backendLabel }}</strong>. Резервная копия прежних локальных настроек: <strong>{{ backupLabel }}</strong>.</p>
            <p class="muted">Старые ответы копируются как исходные строки и не переводятся в новую семантику. Импортированные сертификаты помечаются как внешние и непроверенные.</p>
            <div class="action-row">
                <button type="button" class="primary-action" (click)="exportData()">Экспортировать JSON</button>
                <label class="secondary-action file-label" for="import-file">Выбрать JSON для импорта</label>
                <input id="import-file" class="visually-hidden" type="file" accept="application/json,.json" (change)="onFileSelected($event)">
            </div>
            <p class="muted">Обычный экспорт не содержит ключей ответов защищённой оценки. Клиентское приложение не может криптографически скрыть материалы от владельца устройства.</p>
            <p role="status" aria-live="polite">{{ status }}</p>
            <label *ngIf="backupLabel === 'создана'"><input type="checkbox" [(ngModel)]="restoreConfirmed"> Разрешить восстановление точных прежних строк из резервной копии</label>
            <div *ngIf="backupLabel === 'создана'" class="action-row"><button type="button" class="secondary-action" [disabled]="!restoreConfirmed" (click)="restoreLegacy()">Восстановить прежние локальные строки</button></div>
        </section>

        <section *ngIf="preview" class="experimental-panel" aria-labelledby="preview-title">
            <h2 id="preview-title">Предварительный просмотр импорта</h2>
            <p>{{ preview.summaryRu }}</p>
            <p>Размер: {{ preview.byteLength }} байт. Ответы оценки без ключей: {{ preview.assessmentAnswersRemoved }}.</p>
            <fieldset>
                <legend>Как применить записи</legend>
                <label><input type="radio" name="importMode" value="merge" [(ngModel)]="importMode"> Объединить с локальными данными</label>
                <label><input type="radio" name="importMode" value="replace" [(ngModel)]="importMode"> Заменить данные экспериментального режима</label>
            </fieldset>
            <label *ngIf="importMode === 'replace'"><input type="checkbox" [(ngModel)]="replaceConfirmed"> Я понимаю, что текущие экспериментальные записи будут заменены</label>
            <div class="action-row">
                <button type="button" class="primary-action" [disabled]="importMode === 'replace' && !replaceConfirmed" (click)="applyImport()">Применить импорт</button>
                <button type="button" class="secondary-action" (click)="cancelImport()">Отмена</button>
            </div>
        </section>

        <section class="experimental-panel" aria-labelledby="delete-title">
            <h2 id="delete-title">Удаление</h2>
            <p>Удаляются только записи экспериментального режима. История обычной игры и её локальные ключи не изменяются.</p>
            <label><input type="checkbox" [(ngModel)]="deleteConfirmed"> Я хочу удалить экспериментальные сессии, ответы, оценки освоения и предъявления</label>
            <div class="action-row"><button type="button" class="danger-action" [disabled]="!deleteConfirmed" (click)="deleteData()">Удалить данные экспериментального режима</button></div>
        </section>
    `,
    styles: [`.file-label { display: inline-flex; align-items: center; cursor: pointer; } fieldset label { display: block; margin: .45rem 0; }`],
})
export class ExperimentalDataComponent implements OnInit {
    backendLabel = "проверяется";
    backupLabel = "проверяется";
    status = "";
    preview?: ImportPreview;
    importMode: ImportMode = "merge";
    replaceConfirmed = false;
    deleteConfirmed = false;
    restoreConfirmed = false;

    constructor(private readonly repository: ExperimentalRepository) {}

    async ngOnInit(): Promise<void> {
        await this.repository.initialize();
        this.backendLabel = this.repository.backend === "indexeddb" ? "локальная база браузера" : "временная память браузера";
        this.backupLabel = (await this.repository.getLegacyBackup()) ? "создана" : "нет исходных данных";
    }

    async exportData(): Promise<void> {
        const bundle = await this.repository.createExportBundle();
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `syllogimous-experimental-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        this.status = "Экспорт подготовлен по вашему запросу.";
    }

    async onFileSelected(event: Event): Promise<void> {
        this.preview = undefined;
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            this.status = "Файл превышает допустимый размер 2 МБ.";
            input.value = "";
            return;
        }
        try {
            this.preview = this.repository.previewImport(await file.text());
            this.status = "Файл проверен. Выберите способ импорта.";
        } catch (error: unknown) {
            this.status = error instanceof Error ? error.message : "Не удалось проверить файл.";
        } finally {
            input.value = "";
        }
    }

    async applyImport(): Promise<void> {
        if (!this.preview || (this.importMode === "replace" && !this.replaceConfirmed)) return;
        await this.repository.importPreview(this.preview, this.importMode);
        this.status = this.importMode === "merge" ? "Записи объединены." : "Экспериментальные записи заменены.";
        this.cancelImport();
    }

    cancelImport(): void {
        this.preview = undefined;
        this.replaceConfirmed = false;
        this.importMode = "merge";
    }

    async deleteData(): Promise<void> {
        if (!this.deleteConfirmed) return;
        await this.repository.deleteExperimentalData();
        this.deleteConfirmed = false;
        this.status = "Данные экспериментального режима удалены. Данные обычной игры сохранены.";
    }

    async restoreLegacy(): Promise<void> {
        if (!this.restoreConfirmed) return;
        const count = await this.repository.restoreLegacyBackup();
        this.restoreConfirmed = false;
        this.status = `Восстановлено прежних локальных значений: ${count}.`;
    }
}
