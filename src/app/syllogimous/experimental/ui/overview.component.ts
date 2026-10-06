import { Component } from "@angular/core";
import { FAMILY_LABEL_RU } from "../reasoning-core/rendering/ru-catalog";
import { EXPERIMENTAL_COPY_RU } from "./experimental-copy";

@Component({
    selector: "app-experimental-overview",
    template: `
        <section class="experimental-panel" aria-labelledby="overview-title">
            <h2 id="overview-title">Что исследует этот режим</h2>
            <p class="lead-copy">{{ copy.evidence }}</p>
            <p class="notice"><strong>Конфиденциальность.</strong> {{ copy.privacy }} {{ copy.offline }}</p>
            <div class="tile-grid" aria-label="Различия между показателями">
                <article class="tile"><h3>{{ copy.trainedLearning }}</h3><p>{{ copy.trainedLearningDescription }}</p></article>
                <article class="tile"><h3>{{ copy.structuralTransfer }}</h3><p>{{ copy.structuralTransferDescription }}</p></article>
                <article class="tile"><h3>{{ copy.generalIntegration }}</h3><p>{{ copy.generalIntegrationDescription }}</p></article>
                <article class="tile"><h3>{{ copy.fluidIntelligence }}</h3><p>{{ copy.fluidIntelligenceDescription }}</p></article>
            </div>
            <div class="action-row"><a class="primary-action action-link" routerLink="setup">{{ copy.startSetup }}</a></div>
        </section>
        <section class="experimental-panel" aria-labelledby="families-title">
            <h2 id="families-title">Направления практики</h2>
            <ul class="family-list"><li *ngFor="let label of familyLabels">{{ label }}</li></ul>
            <p class="notice">Основной пул высокой интеграции пока пуст. Все десять направлений ограничены поверхностными подсказками по результатам аудита и исключены из такого пула, но сохранены для экспериментальной практики. Их результаты не доказывают перенос или отсутствие всех подсказок.</p>
            <p class="muted">Сложность описывается несколькими признаками структуры. Количество посылок, память, отвлекающие условия и ограничение времени учитываются раздельно.</p>
        </section>
    `,
    styles: [`.family-list { columns: 2; padding-left: 1.25rem; } .family-list li { break-inside: avoid; margin-bottom: .45rem; } @media (max-width: 600px) { .family-list { columns: 1; } }`],
})
export class OverviewComponent {
    readonly copy = EXPERIMENTAL_COPY_RU;
    readonly familyLabels = Object.values(FAMILY_LABEL_RU);
}
