import { Component } from '@angular/core';
import { ORDERED_QUESTION_TYPES, ORDERED_TIERS, TIERS_MATRIX } from '../../constants/game.constants';
import { GameService } from '../../services/game.service';
import { questionTypeLabel, tierLabel } from '../../utils/russian.utils';

@Component({
    selector: 'app-tiers-matrix',
    templateUrl: './tiers-matrix.component.html',
    styleUrls: ['./tiers-matrix.component.scss']
})
export class TiersMatrixComponent {
    TIERS_MATRIX = TIERS_MATRIX;
    entriesOfMatrix = Object.entries(TIERS_MATRIX);
    userTierIdx = 0;

    tier = "Нажмите на ячейку";
    questionType = "Нажмите на ячейку";
    cellSelI = -1;
    cellSelJ = -1;

    constructor(private game: GameService) {
        this.userTierIdx = Math.max(0, ORDERED_TIERS.findIndex(t => t === game.tier));
    }

    showDetails(i: number, j: number) {
        this.cellSelI = i;
        this.cellSelJ = j;
        this.tier = tierLabel(ORDERED_TIERS.find((_, _i) => _i === i) || "");
        this.questionType = questionTypeLabel(ORDERED_QUESTION_TYPES.find((_, _j) => _j === j) || "");
    }
}
