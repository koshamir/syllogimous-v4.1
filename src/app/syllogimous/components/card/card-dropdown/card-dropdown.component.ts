import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { LS_HISTORY, LS_PROPS } from 'src/app/syllogimous/constants/local-storage.constants';
import { EnumScreens } from 'src/app/syllogimous/constants/game.constants';
import { GameService } from 'src/app/syllogimous/services/game.service';
import { downloadFile } from 'src/app/utils/file';

@Component({
    selector: 'app-card-dropdown',
    templateUrl: './card-dropdown.component.html',
    styleUrls: ['./card-dropdown.component.scss']
})
export class CardDropdownComponent {
    EnumScreens = EnumScreens;

    constructor(
        public game: GameService,
        public router: Router,
        private modalService: NgbModal,
    ) { }

    ngAfterViewInit() {
        this.toggleDarkmode(true);
    }

    async resetGame(content: any) {
        await this.modalService.open(content, { centered: true }).result;

        for (const lsProp of LS_PROPS) {
            localStorage.removeItem(lsProp);
        }

        location.reload();
    }

    toggleDarkmode(initial = false) {
        if (!initial) {
            localStorage.setItem("darkmode", JSON.stringify(!this.getDarkmode()));
        }
        if (this.getDarkmode()) {
            document.querySelector("html")?.setAttribute("darkmode", "");
        } else {
            document.querySelector("html")?.removeAttribute("darkmode");
        }
    }

    getDarkmode() {
        return JSON.parse(localStorage.getItem("darkmode") || "false");
    }

    isSafari() {
        return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    }

    createFileInput() {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".json";
        fileInput.style.display = "none";
        return fileInput;
    }

    async import() {
        let importJson: string | null = null;

        if (this.isSafari()) {
            importJson = prompt("Вставьте JSON сюда");
            if (!importJson || typeof importJson !== "string") {
                return alert("JSON отсутствует или повреждён");
            }
        } else {
            importJson = await new Promise(resolve => {
                const fileInput = this.createFileInput();
                fileInput.onchange = async (evt: any) => {
                    const file = evt.target.files[0];
                    if (!file) {
                        return alert("JSON-файл не выбран");
                    }
        
                    resolve(await new Promise(resolve => {
                        const reader = new FileReader();
        
                        reader.onload = (e) => {
                            const importJson = e.target?.result;
                            if (!importJson || typeof importJson !== "string") {
                                return alert("Некорректный JSON-файл");
                            }
        
                            resolve(importJson);
                        };
        
                        reader.readAsText(file);
                    }));
                };
                fileInput.click();
            });
        }

        if (!importJson || typeof importJson !== "string") {
            return alert("Некорректный JSON-файл");
        }

        const confirmation = confirm("Импорт заменит все текущие настройки. Продолжить?");
        if (!confirmation) {
            return;
        }

        try {
            const data = JSON.parse(importJson);
            for (const [key, value] of Object.entries(data)) {
                if (key === LS_HISTORY) {
                    const parsed = JSON.parse(value as string).slice(0, 1000);
                    localStorage.setItem(key, JSON.stringify(parsed));
                } else {
                    localStorage.setItem(key, value as string);
                }
            }
        } catch {
            return alert("JSON отсутствует или повреждён");
        }

        setTimeout(() => {
            alert("Импорт завершён");
            window.location.reload();
        }, 400);
    }

    export() {
        const exportJson: Record<string, string> = {};
        for (const lsProp of LS_PROPS) {
            const propVal = localStorage.getItem(lsProp)
            if (propVal) {
                exportJson[lsProp] = propVal;
            }
        }

        downloadFile(
            new Blob([JSON.stringify(exportJson)], { type: "text/plain" }),
            `syllogimous-export_${new Date().toLocaleDateString("sv")}.json`
        );

        setTimeout(() => alert("Экспорт завершён"), 400);
    }
}
