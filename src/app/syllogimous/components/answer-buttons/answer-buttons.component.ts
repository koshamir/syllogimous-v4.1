import { Component, EventEmitter, HostListener, Input, OnChanges, Output } from '@angular/core';
import { Question } from '../../models/question.models';

interface AnswerButton { id: string; label: string; css: string; key: string }

/**
 * Answer buttons (spec §6.4): ternary — fixed order «Следует» · «Неизвестно» · «Противоречит» (keys 1/2/3 and ←/↓/→);
 * binary — «Верно / Неверно» (side random); choice — chips with names (+ «Нельзя определить»).
 */
@Component({
    selector: 'app-answer-buttons',
    templateUrl: './answer-buttons.component.html',
    styleUrls: ['./answer-buttons.component.css']
})
export class AnswerButtonsComponent implements OnChanges {
    @Input() question!: Question;
    @Output() answer = new EventEmitter<string>();

    buttons: AnswerButton[] = [];

    ngOnChanges() {
        const q = this.question;
        if (q.format === 'choice') {
            this.buttons = (q.options ?? []).map((o, i) => ({
                id: o.id, label: o.label, css: o.id === 'none' ? 'btn-outline-secondary' : 'btn-outline-primary', key: i < 9 ? String(i + 1) : '',
            }));
        } else if (q.format === 'binary' || !q.format) {
            const t = { id: 'true', label: 'Верно', css: 'btn-success', key: '' };
            const f = { id: 'false', label: 'Неверно', css: 'btn-danger', key: '' };
            this.buttons = Math.random() < 0.5 ? [t, f] : [f, t];
            this.buttons[0].key = '1';
            this.buttons[1].key = '2';
        } else {
            this.buttons = [
                { id: 'entailed', label: 'Следует', css: 'btn-success', key: '1' },
                { id: 'undetermined', label: 'Неизвестно', css: 'btn-secondary', key: '2' },
                { id: 'contradicted', label: 'Противоречит', css: 'btn-danger', key: '3' },
            ];
        }
    }

    get isChoice() {
        return this.question.format === 'choice';
    }

    @HostListener('document:keydown', ['$event'])
    onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.tagName === 'INPUT') return;
        const arrows: Record<string, number> = this.question.format === 'binary' || !this.question.format
            ? { ArrowLeft: 0, ArrowRight: 1 }
            : this.isChoice ? {} : { ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 };
        let b: AnswerButton | undefined;
        if (e.key in arrows) b = this.buttons[arrows[e.key]];
        else b = this.buttons.find(x => x.key && x.key === e.key);
        if (b) {
            e.preventDefault();
            this.answer.emit(b.id);
        }
    }
}
