import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { IDynamicField } from 'src/app/shared/components/dynamic-form/dynamic-form.component';
import { GameService } from 'src/app/syllogimous/services/game.service';
import { EnumScreens, ORDERED_QUESTION_TYPES } from '../../constants/game.constants';
import { BINARY_OP_LABELS, LS_V5_PG_SETTINGS, PlaygroundV5, TYPE_FAMILY } from '../../constants/v5.constants';
import { questionTypeLabel } from '../../utils/russian.utils';
import { BINARY_OPS, BinaryOp, ENGINE_FAMILIES, FamilyId, PREMISE_RANGE } from '../../engine';

/** Free mode: per family — enabled + a fixed number of premises; the staircase is off. */
@Component({
    selector: 'app-playground-Mode',
    templateUrl: './playground-mode.component.html',
    styleUrls: ['./playground-mode.component.css']
})
export class PlaygroundModeComponent {
    EnumScreens = EnumScreens;
    fields: IDynamicField[] = [];
    formData: any = {};
    validationError: string | null = null;
    families: FamilyId[] = ORDERED_QUESTION_TYPES.map(t => TYPE_FAMILY[t]).filter(f => ENGINE_FAMILIES.includes(f));

    constructor(
        public router: Router,
        private modalService: NgbModal,
        private game: GameService,
    ) {
        const pg = this.load();
        this.fields.push(
            { type: 'checkbox', label: 'Два варианта ответа (Верно / Неверно)', field: 'binaryFormat', value: pg.format === 'binary' },
            { type: 'checkbox', label: 'Красные слова (читать наоборот)', field: 'negations', value: pg.negations },
            { type: 'checkbox', label: 'Мета-отношения («A к B — как C к D»)', field: 'metas', value: pg.metas },
        );
        let first = true;
        for (const f of this.families) {
            const [lo, hi] = PREMISE_RANGE[f];
            const st = pg.families[f] ?? { enabled: true, level: lo + 1 };
            const s = { enabled: st.enabled, level: Math.max(lo, Math.min(hi, Math.round(st.level))) };
            this.fields.push(
                { filler: first ? '<div class="pt-3"></div>' : '<div></div>', field: '', label: '' },
                { field: f, label: questionTypeLabel(this.game.typeOf(f)), type: 'checkbox', value: s.enabled },
                { field: f + ':level', label: 'Посылок', type: 'range', value: s.level, min: lo, max: hi, step: 1 },
            );
            first = false;
        }
        this.fields.push({ filler: '<div class="pt-3 small text-muted">Логические связки</div>', field: '', label: '' });
        for (const op of BINARY_OPS) this.fields.push({ type: 'checkbox', label: BINARY_OP_LABELS[op], field: 'op:' + op, value: pg.ops[op] });
    }

    load(): PlaygroundV5 {
        const def: PlaygroundV5 = {
            families: {},
            ops: Object.fromEntries(BINARY_OPS.map(o => [o, true])) as Record<BinaryOp, boolean>,
            negations: true,
            metas: true,
            format: 'ternary',
        };
        try {
            const raw = localStorage.getItem(LS_V5_PG_SETTINGS);
            return raw ? { ...def, ...JSON.parse(raw) } : def;
        } catch {
            return def;
        }
    }

    async play(content: any) {
        const pg: PlaygroundV5 = {
            families: {},
            ops: {} as Record<BinaryOp, boolean>,
            negations: !!this.formData['negations'],
            metas: !!this.formData['metas'],
            format: this.formData['binaryFormat'] ? 'binary' : 'ternary',
        };
        for (const f of this.families) pg.families[f] = { enabled: !!this.formData[f], level: Number(this.formData[f + ':level']) || PREMISE_RANGE[f][0] };
        for (const op of BINARY_OPS) pg.ops[op] = !!this.formData['op:' + op];

        const enabled = this.families.filter(f => pg.families[f]?.enabled);
        this.validationError = !enabled.length ? 'Выбери хотя бы один тип заданий'
            : pg.families.binary?.enabled && !BINARY_OPS.some(o => pg.ops[o]) ? 'Выбери хотя бы одну логическую связку'
                : null;
        if (this.validationError) {
            await this.modalService.open(content, { centered: true }).result.catch(() => undefined);
            return;
        }
        localStorage.setItem(LS_V5_PG_SETTINGS, JSON.stringify(pg));
        this.game.playgroundSettings = pg;
        this.game.play();
    }
}
