import { Component } from '@angular/core';
import { loadColorBlindnessMode } from './syllogimous/pages/settings/settings.component';

const V5_CLEANUP_FLAG = 'SYL_V5_CLEANUP_DONE';

/** One-time removal of the IndexedDB database left by the deleted v4.1 experimental mode. */
function cleanupRemovedExperimentalStorage(): void {
  try {
    if (localStorage.getItem(V5_CLEANUP_FLAG)) {
      return;
    }
    try {
      indexedDB.deleteDatabase('syllogimous-experimental');
    } catch {
      // IndexedDB may be unavailable (private mode, old browsers) — nothing to clean.
    }
    localStorage.setItem(V5_CLEANUP_FLAG, '1');
  } catch {
    // localStorage unavailable — skip silently.
  }
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {

  title = 'Syllogimous — тренажёр логики';

  constructor() {
    loadColorBlindnessMode();
    cleanupRemovedExperimentalStorage();

    const cwarn = console.warn;
    window.console.warn = (...args) => {
      if (typeof args[0] === "string" && args[0].includes("It looks like you're using the disabled attribute")) {
        return;
      }
      cwarn(...args);
    }
  }
}
