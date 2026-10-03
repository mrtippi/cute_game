# Third-party notices

**Use of this build:** this fork (branch `story`) and its Windows installer `ZooGardenControl-Setup-<version>.exe` are for the owner's private, internal use only. They are not distributed to the public.

## Base game

The game is based on [buicongnguyen/cute_game](https://github.com/buicongnguyen/cute_game) by **buicongnguyen** (Zoo Garden). The upstream repository has **no licence file**, so it grants no open-source licence; this fork is used on the basis of the upstream author's permission. The fork's additions (Japanese locale, the story 星灯りの村, titles and nameplates, local online server with login, co-op, auto-play bot, desktop control app) are layered on top of that work.

## Software bundled in the installer

Versions are those installed in this repo at the time of writing; the installer contains the exact versions it was built with.

| Software | Version | Licence | Used for |
|---|---|---|---|
| [three.js](https://threejs.org/) (`three`) | 0.180.0 | MIT | Game rendering |
| [ws](https://github.com/websockets/ws) | 8.22.0 | MIT | Game server WebSockets |
| [node-postgres](https://node-postgres.com/) (`pg`) | 8.23.1 | MIT | Game server database driver (the local build uses the file store, but the package is included) |
| [Playwright](https://playwright.dev/) (`playwright`, `playwright-core`) | 1.63.0 | Apache-2.0 | The bot drives the browser |
| [Chromium](https://www.chromium.org/) (the build Playwright 1.63 installs, `chromium-1243`) | as shipped by Playwright | BSD-style, plus the licences of its many bundled components; the full list ships as `LICENSES.chromium.html` | Headless browser for the bot |
| [Electron](https://www.electronjs.org/) (`electron`) | 44.5.1 | MIT (it embeds Chromium and Node.js under their own licences; see `LICENSE` and `LICENSES.chromium.html` in the app folder) | Control app runtime; its Node also runs the bot and server |
| [electron-updater](https://www.electron.build/auto-update) | 6.8.9 | MIT | Self-update from GitHub Releases |
| [electron-builder](https://www.electron.build/) | 26.15.3 | MIT | Builds the installer (build tool) |
| [ffmpeg](https://ffmpeg.org/) 6.1.1 "essentials" build by Gyan Doshi | 6.1.1 | **GPL-3.0** | Encodes the recorded video |
| [Nunito](https://fonts.google.com/specimen/Nunito), via `@fontsource-variable/nunito` | 5.3.0 | SIL Open Font License 1.1 | Game font |
| [M PLUS Rounded 1c](https://fonts.google.com/specimen/M+PLUS+Rounded+1c), via `@fontsource/m-plus-rounded-1c` | 5.3.0 | SIL Open Font License 1.1 | Game font (Japanese) |

Build-only tools (TypeScript, Vite, esbuild, PGlite for tests) are not shipped in the installer.

### ffmpeg (GPL-3.0)

The installer carries `ffmpeg.exe` unmodified, as a separate program the app starts as its own process (the app does not link to it). Its licence text (`LICENSE.txt`), `README.txt` and `SOURCE.txt` are staged next to it in `resources/vendor/ffmpeg/`.

- Binary: <https://github.com/GyanD/codexffmpeg/releases/tag/6.1.1> (`ffmpeg-6.1.1-essentials_build.zip`)
- Corresponding source: <https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz>
- Licence: GNU General Public License version 3, <https://www.gnu.org/licenses/gpl-3.0.html>

### Fonts (SIL OFL 1.1)

Nunito and M PLUS Rounded 1c are licensed under the SIL Open Font License 1.1 (<https://openfontlicense.org/>). They are bundled unmodified through the `@fontsource` packages, which carry the licence files.

### Licence texts

The MIT and Apache-2.0 texts accompany each package in `node_modules/<package>/LICENSE`. For Electron and Chromium they ship in the installed app folder (`LICENSE`, `LICENSES.chromium.html`).
