// Zoo Garden control app: lives in the system tray, starts with Windows (hidden), opens the dashboard on a click.
// Closing the window only hides it; the schedule and the running accounts keep going until "Thoát" in the tray menu.
// Installed (Setup.exe) it brings everything it needs: the game and bot (resources/zg), Electron's own Node, a bundled
// Chromium and ffmpeg (resources/vendor); it updates itself from the GitHub releases of the fork (electron-updater).
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

let win = null, tray = null, backend = null, quitting = false;
const hidden = process.argv.includes('--hidden');

// Vietnamese app locale: 24-hour time inputs and Vietnamese dates.
app.commandLine.appendSwitch('lang', 'vi');
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());

// ---- where things are ----------------------------------------------------------------------------------------
const CONFIG = () => path.join(app.getPath('userData'), 'config.json');
const readConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG(), 'utf8')); } catch { return {}; } };
const writeConfig = c => { fs.mkdirSync(path.dirname(CONFIG()), { recursive: true }); fs.writeFileSync(CONFIG(), JSON.stringify(c, null, 1)); };
/** A data folder on the fixed drive with the most free space (videos take about 10 GB per account per day). */
function suggestedDataDir() {
  let best = { dir: path.join(app.getPath('documents'), 'ZooGardenData'), free: 0 };
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    try { const s = fs.statfsSync(`${letter}:\\`), free = s.bavail * s.bsize; if (free > best.free) best = { dir: `${letter}:\\ZooGardenData`, free }; } catch { /* no such drive */ }
  }
  return best.dir;
}
const config = readConfig();
const dataDir = config.dataDir ?? (app.isPackaged ? null : 'D:/autogame/bot-data');
if (app.isPackaged) {
  const res = process.resourcesPath;
  Object.assign(process.env, {
    ZG_ROOT: path.join(res, 'zg'), ZG_NODE: process.execPath, ZG_BROWSER: 'bundled',
    PLAYWRIGHT_BROWSERS_PATH: path.join(res, 'vendor', 'ms-playwright'), FFMPEG: path.join(res, 'vendor', 'ffmpeg', 'ffmpeg.exe'),
  });
}
// Until the first-run setup picks a folder the app works in the suggested one (nothing is written there before setup).
process.env.ZG_DATA = dataDir ?? suggestedDataDir();
process.env.ZG_ACCOUNTS ??= path.join(process.env.ZG_DATA, 'accounts');

function showWindow() {
  if (!win) {
    win = new BrowserWindow({ width: 1280, height: 860, minWidth: 980, minHeight: 640, title: 'Zoo Garden – Bảng điều khiển', icon: path.join(__dirname, 'icon.png'), backgroundColor: '#f6f2ea',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, 'ui', 'index.html'));
    win.on('close', event => { if (!quitting) { event.preventDefault(); win.hide(); } });
  }
  win.show(); win.focus();
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Mở bảng điều khiển', click: showWindow },
    { type: 'separator' },
    { label: 'Chạy ngay tất cả acc theo lịch', click: async () => { const ids = Object.entries(backend.control().schedule).filter(([, e]) => e.enabled).map(([id]) => id); await backend.startNow(ids); } },
    { label: 'Dừng tất cả', click: () => backend.stopAll() },
    { label: 'Âm thanh của bot', type: 'checkbox', checked: !!backend.control().settings.sound, click: item => { backend.setSettings({ sound: item.checked }); } },
    { label: 'Mở thư mục dữ liệu', click: () => shell.openPath(backend.DATA) },
    { type: 'separator' },
    { label: 'Thoát (dừng mọi acc)', click: () => quit() },
  ]);
}
async function quit() { quitting = true; await backend.stopAll(); backend.stopServer(); app.quit(); }

// ---- self-update: GitHub releases of the fork; installs when no account is playing (or when the app quits) -------
const update = { status: 'idle', version: null, progress: 0, error: null };
function setupUpdates() {
  if (!app.isPackaged) { update.status = 'dev'; return; }
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => { update.status = 'checking'; });
  autoUpdater.on('update-not-available', () => { update.status = 'latest'; });
  autoUpdater.on('update-available', info => { update.status = 'downloading'; update.version = info.version; });
  autoUpdater.on('download-progress', p => { update.progress = Math.round(p.percent); });
  autoUpdater.on('update-downloaded', info => {
    update.status = 'ready'; update.version = info.version;
    tray?.displayBalloon?.({ title: 'Zoo Garden', content: `Bản mới ${info.version} đã tải xong. Sẽ cài khi không có acc nào đang chơi.` });
  });
  autoUpdater.on('error', e => { update.status = 'error'; update.error = String(e?.message ?? e).slice(0, 200); });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check(); setInterval(check, 6 * 3600 * 1000);
  // A downloaded update installs itself in a quiet moment: no account playing, nothing waiting.
  setInterval(() => { if (update.status === 'ready' && !backend.live().length && !backend.waiting().length) installUpdate(); }, 60000);
}
async function installUpdate() {
  if (update.status !== 'ready') return false;
  quitting = true; await backend.stopAll(); backend.stopServer();
  require('electron-updater').autoUpdater.quitAndInstall(true, true);
  return true;
}

app.whenReady().then(async () => {
  backend = await import(pathToFileURL(path.join(__dirname, 'backend.mjs')).href);
  // Start with Windows, quietly in the tray (setting "Tự khởi động cùng Windows"). Unpackaged (electron.exe + this
  // folder) the login item must name the app folder too. ZG_NO_AUTOSTART: test runs.
  const applyAutostart = on => { if (process.env.ZG_NO_AUTOSTART) return; app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: app.isPackaged ? ['--hidden'] : [path.resolve(__dirname), '--hidden'] }); };
  if (dataDir) applyAutostart(backend.control().settings.autostart);

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Zoo Garden – bot đang chạy ngầm');
  tray.setContextMenu(trayMenu());
  tray.on('click', showWindow);
  setInterval(() => { const n = backend.live().length; tray.setToolTip(n ? `Zoo Garden – ${n} acc đang chơi` : 'Zoo Garden – chờ lịch'); }, 10000);

  // The UI calls the backend by name: api.call('accounts'), api.call('start', id)…
  const allowed = new Set(['control', 'setSettings', 'setSchedule', 'hardware', 'capacity', 'estimate', 'accounts', 'colors', 'themes', 'newAccount', 'editAccount', 'removeAccount', 'start', 'stop', 'stopAll', 'startNow', 'live', 'messages', 'waves', 'load', 'quickCheck', 'benchmark', 'benchmarkState', 'waiting', 'ensureServer']);
  ipcMain.handle('call', async (_event, name, ...args) => {
    if (!allowed.has(name)) throw new Error('unknown call ' + name);
    const result = await backend[name](...args);
    if (name === 'setSettings' && args[0] && 'autostart' in args[0]) applyAutostart(!!args[0].autostart);
    return result;
  });
  ipcMain.handle('open', (_event, target) => shell.openPath(target));
  // App-level calls: version, first-run setup of the data folder, updates.
  ipcMain.handle('app', async (_event, name, ...args) => {
    if (name === 'info') return { version: app.getVersion(), packaged: app.isPackaged, dataDir: process.env.ZG_DATA, needsSetup: !dataDir, update };
    if (name === 'chooseFolder') { const r = await dialog.showOpenDialog(win, { title: 'Chọn thư mục lưu dữ liệu và video', defaultPath: args[0] || process.env.ZG_DATA, properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0]; }
    if (name === 'setDataDir') {
      const dir = String(args[0] || ''); if (!dir) throw new Error('Chưa chọn thư mục.');
      fs.mkdirSync(path.join(dir, 'accounts'), { recursive: true });
      writeConfig({ ...readConfig(), dataDir: dir });
      // Restart in the chosen folder (autostart registers then).
      quitting = true; await backend.stopAll(); backend.stopServer(); app.relaunch(); app.exit(0); return true;
    }
    if (name === 'checkUpdate') { if (app.isPackaged) await require('electron-updater').autoUpdater.checkForUpdates().catch(e => { update.status = 'error'; update.error = String(e.message); }); return update; }
    if (name === 'installUpdate') { if (backend.live().length) throw new Error('Đang có acc chơi: bản mới sẽ tự cài khi các acc nghỉ.'); return installUpdate(); }
    throw new Error('unknown app call ' + name);
  });

  setupUpdates();
  if (!hidden || !dataDir) showWindow();
});
app.on('window-all-closed', event => event.preventDefault?.());
