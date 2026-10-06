import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule, Routes } from "@angular/router";
import { AssessmentSessionService } from "../assessment/assessment-session.service";
import { createExperimentalRepository, ExperimentalRepository } from "../persistence/experimental-repository";
import { ActiveTimerService } from "../training/active-timer";
import { TransparentSchedulerService } from "../training/transparent-scheduler";
import { ExperimentalAssessmentComponent } from "./assessment.component";
import { ExperimentalDataComponent } from "./data.component";
import { ExperimentalShellComponent } from "./experimental-shell.component";
import { createGenerationFacade, GENERATION_FACADE } from "./generation-facade";
import { OverviewComponent } from "./overview.component";
import { ExperimentalProgressComponent } from "./progress.component";
import { ResponseControlsComponent } from "./response-controls.component";
import { ExperimentalSettingsComponent } from "./settings.component";
import { SetupComponent } from "./setup.component";
import { ExperimentalTrainingComponent } from "./training.component";

const routes: Routes = [{
    path: "",
    component: ExperimentalShellComponent,
    children: [
        { path: "", component: OverviewComponent, pathMatch: "full" },
        { path: "setup", component: SetupComponent },
        { path: "training", component: ExperimentalTrainingComponent },
        { path: "assessment", component: ExperimentalAssessmentComponent },
        { path: "progress", component: ExperimentalProgressComponent },
        { path: "settings", component: ExperimentalSettingsComponent },
        { path: "data", component: ExperimentalDataComponent },
        { path: "**", redirectTo: "" },
    ],
}];

@NgModule({
    declarations: [
        ExperimentalShellComponent,
        OverviewComponent,
        SetupComponent,
        ExperimentalTrainingComponent,
        ExperimentalAssessmentComponent,
        ExperimentalProgressComponent,
        ExperimentalSettingsComponent,
        ExperimentalDataComponent,
        ResponseControlsComponent,
    ],
    imports: [CommonModule, FormsModule, RouterModule.forChild(routes)],
    providers: [
        { provide: ExperimentalRepository, useFactory: createExperimentalRepository },
        { provide: GENERATION_FACADE, useFactory: createGenerationFacade },
        ActiveTimerService,
        TransparentSchedulerService,
        AssessmentSessionService,
    ],
})
export class ExperimentalModule {}
