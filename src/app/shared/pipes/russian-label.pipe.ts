import { Pipe, PipeTransform } from "@angular/core";
import { uiLabel } from "src/app/syllogimous/utils/russian.utils";

@Pipe({
    name: "ruLabel"
})
export class RussianLabelPipe implements PipeTransform {
    transform(value: unknown): string {
        return uiLabel(value);
    }
}
