import { Component } from "@angular/core";
import { EXPERIMENTAL_COPY_RU } from "./experimental-copy";

@Component({
    selector: "app-experimental-shell",
    templateUrl: "./experimental-shell.component.html",
    styleUrls: ["./experimental-shell.component.css"],
})
export class ExperimentalShellComponent {
    readonly copy = EXPERIMENTAL_COPY_RU;
}
