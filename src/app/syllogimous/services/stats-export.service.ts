import { Injectable } from '@angular/core';
import { GameService } from './game.service';
import { questionTypeLabel } from '../utils/russian.utils';
import { correctLabel, isCorrect, isTimeout, userLabel } from '../utils/answer.utils';
import { ANSWER_LABELS, LURE_LABELS } from '../constants/v5.constants';

const csv = (s: string) => '"' + s.replace(/<[^>]+>/g, '').replace(/"/g, '""') + '"';

@Injectable({
    providedIn: 'root'
})
export class StatsExportService {
    constructor(
        private game: GameService
    ) {}

    private formatDateTime(timestamp: number): string {
        return new Date(timestamp).toLocaleDateString("ru-RU") + " " + new Date(timestamp).toLocaleTimeString("ru-RU");
    }

    private getTimerSetting(timerTypeOnAnswer: string): string {
        switch(timerTypeOnAnswer) {
            case "0": return "Без таймера";
            case "1": return "Свой таймер";
            case "2": return "Адаптивный таймер";
            default: return "Неизвестно";
        }
    }

    exportStats() {
        const questions = [...this.game.questions]
            .sort((a, b) => a.createdAt - b.createdAt);
            
        // Create CSV header
        let csvContent = "\uFEFF" + [
            "Номер",
            "Дата и время",
            "Режим",
            "Тип задания",
            "Количество посылок",
            "Время ответа (секунды)",
            "Правильный ответ",
            "Ответ пользователя",
            "Результат",
            "Таймер",
            "Очки",
            "Есть инверсия",
            "Есть метаотношения",
            "Количество инверсий",
            "Количество метаотношений",
            "Уровень (v5)",
            "Формат",
            "Класс ответа",
            "Ловушка",
            "σ"
        ].join(",") + "\n";

        let lastArcadeScore = 0;
        
        // Add data rows
        questions.forEach((q, index) => {
            const timeTaken = (q.answeredAt - q.createdAt) / 1000;
            if (!q.playgroundMode) {
                lastArcadeScore = q.userScore;
            }
            const row = [
                index + 1,
                this.formatDateTime(q.createdAt),
                q.playgroundMode ? 'Свободный' : 'Обычный',
                questionTypeLabel(q.type),
                q.premises.length,
                timeTaken.toFixed(1),
                csv(correctLabel(q)),
                isTimeout(q) ? '- - -' : csv(userLabel(q)),
                isTimeout(q) ? 'Время вышло' : (isCorrect(q) ? 'Правильно' : 'Неправильно'),
                this.getTimerSetting(q.timerTypeOnAnswer),
                q.playgroundMode ? lastArcadeScore : q.userScore,
                q.negations > 0 ? 'Да' : 'Нет',
                q.metaRelations > 0 ? 'Да' : 'Нет',
                q.negations || 0,
                q.metaRelations || 0,
                q.level ?? '',
                q.format ?? 'binary',
                q.answerClass ? ANSWER_LABELS[q.answerClass] : '',
                q.lure ? LURE_LABELS[q.lure] : '',
                q.metrics?.support ?? ''
            ];
            csvContent += row.join(',') + '\n';
        });

        // Convert to blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `syllogimous_история_${new Date().toLocaleDateString("sv")}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}
