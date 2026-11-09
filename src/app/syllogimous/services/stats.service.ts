import { Injectable } from "@angular/core";
import { GameService } from "./game.service";
import { jsonCopy } from "src/app/utils/json";
import { TypeBasedStats } from "../models/stats.models";
import { EnumQuestionType } from "../constants/question.constants";
import { isCorrect, isTimeout } from "../utils/answer.utils";

@Injectable({
    providedIn: "root"
})
export class StatsService {
    constructor(
        public game: GameService
    ) { }

    calcStats = (timerType?: "0" | "1" | "2") => {
        const questions = this.game.questions.filter(q => q.playgroundMode === this.game.isPlayground);
        const types = Object.values(EnumQuestionType).filter(qt => Object.values(EnumQuestionType).includes(qt));
        const typeBasedStats = new TypeBasedStats();

        for (let type of types) {
            const tbs = typeBasedStats[type];
            const questionsByType = questions.filter(q =>
                q.type === type && (timerType == null || q.timerTypeOnAnswer === timerType)
            );
            
            tbs.type = type;
            tbs.completed = questionsByType.length;
            tbs.accuracy = questionsByType.filter(q => isCorrect(q) === true).length / (questionsByType.length || 1);

            for (const q of questionsByType) {
                const ps = ((q.premises.length < 6) ? String(q.premises.length) : "6+") as "2" | "3" | "4" | "5" | "6+";
    
                const dt = q.answeredAt - q.createdAt;
    
                tbs.stats[ps].sum += dt;
                tbs.stats[ps].count++;

                if (isTimeout(q)) {
                    tbs.stats[ps].timeout++;
                } else if (isCorrect(q) === true) {
                    tbs.stats[ps].correct++;
                } else {
                    tbs.stats[ps].incorrect++;
                }
    
                if (!isTimeout(q)) {
                    if (tbs.stats[ps].fastest === 0 || dt < tbs.stats[ps].fastest) {
                        tbs.stats[ps].fastest = dt;
                    }
                    if (tbs.stats[ps].slowest === 0 || dt > tbs.stats[ps].slowest) {
                        tbs.stats[ps].slowest = dt;
                    }
                }

                // Calculate last 10 questions stats
                if (tbs.stats[ps].last10Count < 10) {
                    tbs.stats[ps].last10Sum += dt;
                    tbs.stats[ps].last10Count++;

                    if (isTimeout(q)) {
                        tbs.stats[ps].last10Timeout++;
                    } else if (isCorrect(q) === true) {
                        tbs.stats[ps].last10Correct++;
                    } else {
                        tbs.stats[ps].last10Incorrect++;
                    }
        
                    if (!isTimeout(q)) {
                        if (tbs.stats[ps].last10Fastest === 0 || dt < tbs.stats[ps].last10Fastest) {
                            tbs.stats[ps].last10Fastest = dt;
                        }
                        if (tbs.stats[ps].last10Slowest === 0 || dt > tbs.stats[ps].last10Slowest) {
                            tbs.stats[ps].last10Slowest = dt;
                        }
                    }
                }
            };
        }

        return { types, questions, typeBasedStats: jsonCopy(typeBasedStats) as TypeBasedStats};
    }
}