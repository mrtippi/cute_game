// Gathers what the installer carries (run by `npm run dist` / `npm run release` before electron-builder):
//   build/zg/      the built game (dist), its server, the game sources the server and bot import (src), the bot,
//                  and the runtime libraries (three, ws, pg, playwright) installed fresh, production only;
//   vendor/        the Chromium Playwright drives (fixed version) and ffmpeg 6.1 (NVENC with older NVIDIA drivers).
// Large binaries are downloaded here, never committed (desktop/.gitignore).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), '..'), REPO = join(DESKTOP, '..'), ZG = join(DESKTOP, 'build', 'zg'), VENDOR = join(DESKTOP, 'vendor');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm', npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (cmd, args, cwd, env = {}) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });
const step = text => console.log(`\n▶ ${text}`);

// 1. The game build (vite) — rebuilt so the installer always carries the current game.
step('Build the game'); run(npm, ['run', 'build'], REPO);

// 2. build/zg: game, server, sources, bot (without its node_modules and local data).
step('Copy game, server and bot');
rmSync(ZG, { recursive: true, force: true }); mkdirSync(ZG, { recursive: true });
for (const dir of ['dist', 'server', 'src']) cpSync(join(REPO, dir), join(ZG, dir), { recursive: true });
cpSync(join(REPO, 'bot'), join(ZG, 'bot'), { recursive: true, filter: p => !/[\\/]bot[\\/](node_modules|.*\.log|dev\.mjs|patch-profile\.mjs)(?:[\\/]|$)/.test(p) });
const root = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')), bot = JSON.parse(readFileSync(join(REPO, 'bot', 'package.json'), 'utf8'));
const deps = { three: root.dependencies.three, ws: root.dependencies.ws, pg: root.dependencies.pg, playwright: bot.dependencies.playwright };
writeFileSync(join(ZG, 'package.json'), JSON.stringify({ name: 'zoo-garden-runtime', private: true, type: 'module', dependencies: deps }, null, 1));
step('Install runtime libraries ' + JSON.stringify(deps));
run(npm, ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], ZG);

// 3. vendor/ms-playwright: the Chromium matching this Playwright (no headless shell: the bot uses the new headless).
step('Chromium for Playwright');
const browsers = join(VENDOR, 'ms-playwright');
run(npx, ['playwright', 'install', 'chromium', '--no-shell'], join(REPO, 'bot'), { PLAYWRIGHT_BROWSERS_PATH: browsers });
for (const name of existsSync(browsers) ? readdirSync(browsers) : []) if (!name.startsWith('chromium-')) rmSync(join(browsers, name), { recursive: true, force: true });

// 4. vendor/ffmpeg/ffmpeg.exe: ffmpeg 6.1.1 (Gyan essentials); 7+ needs NVIDIA driver 570 for NVENC.
step('ffmpeg 6.1');
const ffmpeg = join(VENDOR, 'ffmpeg', 'ffmpeg.exe');
if (!existsSync(ffmpeg) || !existsSync(join(dirname(ffmpeg), 'LICENSE.txt'))) {
  mkdirSync(dirname(ffmpeg), { recursive: true });
  const zip = join(VENDOR, 'ffmpeg.zip'), tmp = join(VENDOR, 'ffmpeg-tmp');
  const response = await fetch('https://github.com/GyanD/codexffmpeg/releases/download/6.1.1/ffmpeg-6.1.1-essentials_build.zip');
  if (!response.ok) throw new Error('ffmpeg download failed: ' + response.status);
  await pipeline(response.body, createWriteStream(zip));
  // Windows' own unzip (a Git Bash tar on PATH would read "D:" as a remote host).
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force`], { stdio: 'inherit' });
  cpSync(join(tmp, 'ffmpeg-6.1.1-essentials_build', 'bin', 'ffmpeg.exe'), ffmpeg);
  // This build is GPL: its licence and the source pointer travel with the binary.
  for (const name of ['LICENSE', 'README.txt']) { const from = join(tmp, 'ffmpeg-6.1.1-essentials_build', name); if (existsSync(from)) cpSync(from, join(dirname(ffmpeg), name === 'LICENSE' ? 'LICENSE.txt' : name)); }
  writeFileSync(join(dirname(ffmpeg), 'SOURCE.txt'), 'ffmpeg 6.1.1 essentials build by Gyan Doshi (GPL v3).\nBinary: https://github.com/GyanD/codexffmpeg/releases/tag/6.1.1\nSource: https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz\n');
  rmSync(zip, { force: true }); rmSync(tmp, { recursive: true, force: true });
}
console.log('\n✔ staged: build/zg, vendor/ms-playwright, vendor/ffmpeg');
