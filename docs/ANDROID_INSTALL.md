# Android / PWA

This branch turns Syllogimous into an installable Android-friendly Progressive Web App without changing the training logic.

## One-time GitHub setup

1. Merge the mobile PWA pull request into `main`.
2. Open the repository on GitHub.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, select **GitHub Actions** as the source.
5. Open **Actions** and run **Deploy Syllogimous to GitHub Pages** once if the first deployment did not start automatically.

The production build uses the repository path:

`/syllogimous-v4.1/`

## Install on Android

1. Open the deployed GitHub Pages site in Chrome.
2. Wait for the first page load to finish.
3. Open the Chrome menu.
4. Choose **Install app** or **Add to Home screen**.
5. Launch **Syllogimous** from the Android home screen.

The installed version opens in its own standalone window without the normal browser address bar.

## Offline use

After an online visit, the service worker caches the app shell and same-origin resources as they are used. Previously loaded parts of the app can then continue to work without a network connection.

If a new version is deployed, reopen the app online so the browser can refresh the cached application files.

## Mobile UI changes

- full-screen dynamic Android viewport
- safe-area support for devices with display cutouts
- larger touch targets
- responsive start-screen actions
- responsive answer buttons
- narrower typography for training tasks
- improved settings sliders
- better experimental-training layout on small screens
