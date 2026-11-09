import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EnumScreens } from '../../constants/game.constants';
import { STRATEGY_CARDS } from '../../constants/v5.constants';

/** «Стратегии» (spec §6.9, Appendix A). */
@Component({
    selector: 'app-strategies',
    templateUrl: './strategies.component.html',
})
export class StrategiesComponent {
    EnumScreens = EnumScreens;
    cards = STRATEGY_CARDS;
    focus?: string;

    constructor(public router: Router, route: ActivatedRoute) {
        route.fragment.subscribe(f => {
            this.focus = f ?? undefined;
            if (f) setTimeout(() => document.getElementById(f)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        });
    }
}
