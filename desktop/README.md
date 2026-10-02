# Zoo Garden – Bảng điều khiển (desktop app)

App Windows chạy ngầm ở khay hệ thống: quản lý acc, hẹn giờ cho các acc chơi và quay, đo sức máy.

## Chạy
1. Lần đầu: `npm install` trong thư mục `desktop/` (tải Electron), và `npm run build` trong `cute_game/` (bản game).
2. Mở app: nhấp đúp `start.cmd`. Lần mở đầu tiên app tự đăng ký **khởi động cùng Windows**; tắt được ở trang Cài đặt.
3. Đóng cửa sổ thì app vẫn chạy ngầm ở khay. Thoát hẳn: chuột phải biểu tượng khay → “Thoát”.

## Các trang
- **Tổng quan**: các acc đang chơi, ảnh màn hình cập nhật vài giây một lần, clip số mấy, việc đang làm; nút Dừng và “Hiện cửa sổ” (áp dụng từ clip sau).
- **Tài khoản**: tạo acc mới (tên thư mục, tên tiếng Nhật, màu, tính cách chơi), sửa, lưu trữ, xoá (chuyển vào `accounts/_deleted`).
- **Lịch chạy**: mỗi acc bật/tắt, giờ bắt đầu, ngày trong tuần, số clip. Acc đến giờ khi máy đã đủ tải thì chờ lượt.
- **Phần cứng**: thông số máy và “Đo sức máy” (chạy thử 1, 2, 3… acc ngầm vừa chơi vừa quay, dừng ở bước vượt ngưỡng).
- **Cài đặt**: tự khởi động cùng Windows, số acc tối đa, số clip mặc định, độ dài clip.

## Dữ liệu
`D:/autogame/bot-data/` (đổi bằng biến môi trường `ZG_DATA`): `accounts/<acc>/` (save, ngày chơi, video `.mp4` + `.txt`/`.json` chương YouTube),
`control.json` (lịch, cài đặt), `hardware.json` (kết quả đo).

## Cách app chạy bot
App gọi đúng các script của bot như khi chạy tay: `bot/director.mjs run --account <acc> --record --headless …` cho mỗi acc,
bằng Node 24 portable (`D:/autogame/tools/node24`). Watchdog: clip im lặng 6 phút thì khởi động lại; acc dừng bất thường được chạy lại tối đa 3 lần.
