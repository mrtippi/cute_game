# Zoo Garden Control – ghi chú cho người phát triển

Ứng dụng Windows (Electron) chạy ngầm ở khay hệ thống: quản lý acc, hẹn giờ cho bot chơi và quay, đo sức máy. **Hướng dẫn cho người dùng: [../docs/HUONG-DAN.md](../docs/HUONG-DAN.md).** File này chỉ nói về phát triển và phát hành.

Dự án chỉ dùng nội bộ (chủ dự án). Nhánh mặc định `main` là game gốc (upstream); mọi việc của fork nằm trên nhánh **`story`**, và **tag phát hành phải trỏ vào commit của nhánh `story`**.

## Cấu trúc

- `main.cjs`: tiến trình chính (cửa sổ, khay, tự khởi động, cập nhật bằng electron-updater, thiết lập thư mục dữ liệu lần đầu).
- `backend.mjs`: lịch, hàng chờ, watchdog, chạy `bot/director.mjs` cho từng acc, server game, đo sức máy.
- `ui/`: giao diện 5 trang (`index.html`, `app.js`, `style.css`); `preload.cjs` là cầu nối.
- `scripts/stage.mjs`: gom game + bot + thư viện chạy + Chromium + ffmpeg vào `build/zg` và `vendor/` cho bộ cài.

## Biến môi trường

Khi đóng gói (`app.isPackaged`), `main.cjs` tự đặt hết; khi chạy từ mã nguồn thì đặt tay khi cần.

| Biến | Ý nghĩa | Mặc định khi chạy từ mã nguồn |
|---|---|---|
| `ZG_ROOT` | Thư mục chứa `bot/`, `server/`, `src/`, `dist/` | Thư mục cha của `desktop/` (repo) |
| `ZG_DATA` | Thư mục dữ liệu (`accounts/`, `server/`, `groups/`, `control.json`, `hardware.json`) | `D:/autogame/bot-data` (máy của chủ dự án; đặt biến này nếu dùng máy khác) |
| `ZG_ACCOUNTS` | Thư mục acc | `<ZG_DATA>/accounts` |
| `FFMPEG` | Đường dẫn `ffmpeg.exe` (cần 6.1.x để NVENC chạy với driver NVIDIA dưới 570) | `D:/autogame/tools/ffmpeg6/bin/ffmpeg.exe`, rồi `C:/ffmpeg/ffmpeg.exe` |
| `PLAYWRIGHT_BROWSERS_PATH` | Nơi có Chromium của Playwright | Cache mặc định của Playwright |
| `ZG_BROWSER` | `bundled` = dùng Chromium kèm theo; bỏ trống = dùng Google Chrome cài trên máy | bỏ trống |
| `ZG_NODE` | Node chạy bot/server (đóng gói: chính Electron kèm `ELECTRON_RUN_AS_NODE`) | `D:/autogame/tools/node24/node.exe` nếu có, không thì `node` |
| `ZG_REQUIRE_LOGIN` | Server game bắt đăng nhập; `0` = cho chơi offline | App tự đặt `1` khi bật server |
| `ZG_NO_AUTOSTART` | Đặt giá trị bất kỳ để không đăng ký khởi động cùng Windows (khi test) | |

Server do app bật nằm ở `http://127.0.0.1:8787/`, dữ liệu ở `<ZG_DATA>/server` (`DATA_DIR`).

**Server dev.** `bot/dev.mjs open` và `bot/patch-profile.mjs` làm việc với save offline, nên cần server chạy với `ZG_REQUIRE_LOGIN=0` (server mặc định bắt đăng nhập). Ví dụ, từ thư mục gốc repo (Git Bash):

```sh
ZG_REQUIRE_LOGIN=0 DATA_DIR=/tmp/zg-dev node server/server.mjs
```

## Chạy từ mã nguồn

```sh
# 1. Game (một lần, và mỗi khi đổi mã game)
npm install            # thư mục gốc repo, Node 24
npm run build          # tạo dist/

# 2. Bot và trình duyệt Playwright
cd bot && npm install
npx playwright install chromium

# 3. App
cd ../desktop && npm install
npm start              # hoặc nhấp đúp start.cmd
```

Chạy từ mã nguồn thì app không tự cập nhật (trạng thái "dev").

## Đóng gói và phát hành

Cả hai lệnh đều chạy `npm run stage` trước (build game, copy vào `build/zg`, tải Chromium và ffmpeg 6.1.1 vào `vendor/`) rồi gọi electron-builder. Kết quả nằm ở `release/`: `ZooGardenControl-Setup-<version>.exe`, `.blockmap` và `latest.yml`.

| Lệnh | Việc làm |
|---|---|
| `npm run dist` | Chỉ đóng gói, **không** đăng (`--publish never`). Dùng để thử bộ cài |
| `npm run release` | Đóng gói và **đăng lên GitHub Releases** `mrtippi/cute_game` (`--publish always`) |

Quy trình phát hành:

1. Trên nhánh `story`, tăng `version` trong `desktop/package.json` (ví dụ `0.1.1`) và commit.
2. **Tạo GitHub release trước** (tag trỏ vào commit `story` vừa commit), rồi mới chạy `npm run release`. Lần trước electron-builder tự tạo release cùng lúc nên bị đua và tải `latest.yml`/blockmap thất bại.
   ```sh
   git push origin story
   gh release create v0.1.1 --repo mrtippi/cute_game --target story --title "v0.1.1" --notes "..."
   cd desktop && npm run release
   ```
   `--target story` làm tag `v0.1.1` trỏ vào đầu nhánh `story` (nhớ push nhánh trước). Khi release đã có, electron-builder chỉ tải thêm file.
3. Kiểm tra release có đủ ba file: `.exe`, `.exe.blockmap`, `latest.yml`.
4. Kiểm tra `sha512` trong `latest.yml` khớp với file `.exe` đã đăng (đây là SHA-512 mã hoá base64; app cập nhật từ chối nếu lệch):
   ```sh
   node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha512').update(f.readFileSync('release/ZooGardenControl-Setup-0.1.1.exe')).digest('base64'))"
   ```
   So kết quả với dòng `sha512:` trong `latest.yml` (nên so với bản tải về từ release).
5. Bộ cài **chưa ký số**: Windows SmartScreen sẽ cảnh báo (đã nêu trong hướng dẫn).

`build/`, `vendor/`, `release/`, `node_modules/` nằm trong `.gitignore`. Phần mềm bên thứ ba đi kèm: [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Cách app chạy bot

Với mỗi acc, app chạy đúng lệnh như chạy tay:

```
node bot/director.mjs run --account <acc> --date <ngày> --clips N --minutes M --record --headless --pause 10 (--mute|--sound) [--mix JSON] [--group G --members a,b]
```

Watchdog: nhật ký clip im 6 phút thì kill và chạy lại; acc thoát bất thường được chạy lại tối đa 3 lần. Cấu hình app (thư mục dữ liệu đã chọn) ở `%APPDATA%\zoo-garden-control\config.json`.
