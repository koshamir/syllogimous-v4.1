/// <reference types="@angular/localize" />

import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';


platformBrowserDynamic().bootstrapModule(AppModule)
  .then(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (window.location.protocol !== 'https:' || isLocalhost) {
      return;
    }

    window.addEventListener('load', () => {
      const serviceWorkerUrl = new URL('service-worker.js', document.baseURI);

      navigator.serviceWorker
        .register(serviceWorkerUrl.toString())
        .catch(err => console.warn('Service worker registration failed:', err));
    });
  })
  .catch(err => console.error(err));
