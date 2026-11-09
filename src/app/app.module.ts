import { LOCALE_ID, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeRu from '@angular/common/locales/ru';
import { AppComponent } from './app.component';
import { SharedModule } from './shared/shared.module';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
    {
        path: '',
        loadChildren: () => import('./syllogimous/syllogimous.module').then(m => m.SyllogimousModule)
    },
];

registerLocaleData(localeRu);

@NgModule({
    declarations: [
        AppComponent
    ],
    imports: [
        BrowserModule,
        SharedModule,
        RouterModule.forRoot(routes)
    ],
    providers: [
        { provide: LOCALE_ID, useValue: 'ru-RU' }
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
