import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { EnumScreens } from '../../constants/game.constants';
import { FormControl } from '@angular/forms';
import { DEFAULT_DAILY_GOAL, DEFAULT_WEEKLY_GOAL } from '../../services/progress-and-performance.service';
import { LS_COLOR_BLINDNESS_MODE, LS_DAILY_GOAL, LS_WEEKLY_GOAL } from '../../constants/local-storage.constants';
import { GameService } from '../../services/game.service';
import { EngineService } from '../../services/engine.service';
import { NAME_POOL_LABELS, V5Settings } from '../../constants/v5.constants';
import { DailyPlanService, PLAN_LABELS, PLAN_SEGMENTS, PlanSegment } from '../../services/daily-plan.service';
import { Subscription } from 'rxjs';

export const loadColorBlindnessMode = () => {
    const blindnessModeColor = localStorage.getItem(LS_COLOR_BLINDNESS_MODE);
    if (blindnessModeColor) {
        const [, value] = blindnessModeColor.split(";");
        document.documentElement.style.setProperty('--negated-color', value);
    }
};

@Component({
    selector: 'app-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.css']
})
export class SettingsComponent {
    Math = Math;
    EnumScreens = EnumScreens;

    dailyProgressMinutes = new FormControl(DEFAULT_DAILY_GOAL);
    weeklyProgressMinutes = new FormControl(DEFAULT_WEEKLY_GOAL);

    // «Тренировка» (spec §6.6)
    formatChoices = [
        { text: '3 варианта: Следует / Неизвестно / Противоречит', value: 'ternary' },
        { text: '2 варианта: Верно / Неверно', value: 'binary' },
    ];
    stepChoices = [{ text: '0,25', value: 0.25 }, { text: '0,5', value: 0.5 }, { text: '1', value: 1 }];
    explanationChoices = [
        { text: 'Только после ошибок', value: 'errors' },
        { text: 'Всегда', value: 'always' },
        { text: 'Никогда', value: 'never' },
    ];
    poolChoices = Object.entries(NAME_POOL_LABELS).map(([value, text]) => ({ text, value }));
    nameModeChoices = [
        { text: 'По уровню (похожие и повторяющиеся имена)', value: 'byLevel' },
        { text: 'Всегда разные', value: 'distinct' },
    ];

    format: FormControl;
    targetAccuracy: FormControl;
    step: FormControl;
    explanation: FormControl;
    namePool: FormControl;
    nameMode: FormControl;
    negations: FormControl;
    metas: FormControl;

    // «Тренировка дня»
    PLAN_SEGMENTS = PLAN_SEGMENTS;
    PLAN_LABELS = PLAN_LABELS;
    planMinutes: FormControl;
    planShares: Record<PlanSegment, FormControl>;

    colorBlindnessChoices = [
        { text: "Нет", value: "rgb(128, 0, 0)" },
        { text: "Протанопия", value: "rgb(73, 71, 0)", },
        { text: "Дейтеранопия", value: "rgb(80, 90, 0)" },
        { text: "Тританопия", value: "rgb(122, 0, 0)" },
        { text: "Ахроматопсия", value: "rgb(38, 38, 38)" }
    ];
    colorBlindnessMode = new FormControl(this.colorBlindnessChoices[0].value, { nonNullable: true });

    subscriptions: Subscription[] = [];

    constructor(
        public router: Router,
        public game: GameService,
        engine: EngineService,
        plan: DailyPlanService,
    ) {
        const ps = plan.settings;
        this.planMinutes = new FormControl(ps.minutes);
        this.planShares = Object.fromEntries(PLAN_SEGMENTS.map(k => [k, new FormControl(ps.shares[k])])) as Record<PlanSegment, FormControl>;
        const savePlan = () => plan.saveSettings({
            minutes: Number(this.planMinutes.value),
            shares: Object.fromEntries(PLAN_SEGMENTS.map(k => [k, Number(this.planShares[k].value)])) as Record<PlanSegment, number>,
        });
        this.subscriptions.push(this.planMinutes.valueChanges.subscribe(savePlan));
        for (const k of PLAN_SEGMENTS) this.subscriptions.push(this.planShares[k].valueChanges.subscribe(savePlan));

        const daily = localStorage.getItem(LS_DAILY_GOAL);
        this.dailyProgressMinutes.setValue(Number(daily) || DEFAULT_DAILY_GOAL);
        this.subscriptions.push(this.dailyProgressMinutes.valueChanges.subscribe(v => localStorage.setItem(LS_DAILY_GOAL, String(v))));

        const weekly = localStorage.getItem(LS_WEEKLY_GOAL);
        this.weeklyProgressMinutes.setValue(Number(weekly) || DEFAULT_WEEKLY_GOAL);
        this.subscriptions.push(this.weeklyProgressMinutes.valueChanges.subscribe(v => localStorage.setItem(LS_WEEKLY_GOAL, String(v))));

        const s = engine.settings;
        const bind = <K extends keyof V5Settings>(key: K, initial: unknown, conv: (v: any) => V5Settings[K]) => {
            const c = new FormControl<any>(initial);
            this.subscriptions.push(c.valueChanges.subscribe(v => engine.saveSettings({ [key]: conv(v) } as Partial<V5Settings>)));
            return c;
        };
        this.format = bind('format', s.format, v => v);
        this.targetAccuracy = bind('targetAccuracy', Math.round(s.targetAccuracy * 100), v => Number(v) / 100);
        this.step = bind('step', s.step, v => Number(v) as V5Settings['step']);
        this.explanation = bind('explanation', s.explanation, v => v);
        this.namePool = bind('namePool', s.namePool, v => v);
        this.nameMode = bind('nameMode', s.nameMode, v => v);
        this.negations = bind('negations', s.negations, v => !!v);
        this.metas = bind('metas', s.metas, v => !!v);

        const colorBlindnessMode = localStorage.getItem(LS_COLOR_BLINDNESS_MODE);
        if (colorBlindnessMode) this.colorBlindnessMode.setValue(colorBlindnessMode.split(";")[1]);
        this.subscriptions.push(this.colorBlindnessMode.valueChanges.subscribe(value => {
            const text = this.colorBlindnessChoices.find(choice => choice.value === value)?.text;
            localStorage.setItem(LS_COLOR_BLINDNESS_MODE, text + ";" + value);
            loadColorBlindnessMode();
        }));
    }

    ngOnDestroy() {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }
}
