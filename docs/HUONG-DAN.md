# Zoo Garden Control – Hướng dẫn sử dụng

Dành cho người không cần biết lập trình. Zoo Garden Control là app Windows chạy ngầm: nó cho nhiều nhân vật (acc) tự chơi game Zoo Garden theo lịch, quay mỗi lượt chơi thành một video dài khoảng 60 phút, và viết sẵn tiêu đề + mô tả + chương (chapter) để bạn đăng lên YouTube.

Tải bản cài ở trang Releases: <https://github.com/mrtippi/cute_game/releases> (file `ZooGardenControl-Setup-<phiên bản>.exe`).

## Cần làm gì nhanh nhất

1. Cài app (mục 2) và chọn thư mục dữ liệu ở lần mở đầu (mục 3).
2. Trang **Tài khoản** → **＋ Tạo acc mới** (mục 4).
3. Trang **Lịch chạy** → chọn giờ, ngày, số clip → **Lưu lịch** (mục 5). Hoặc bấm **Chạy ngay** ở trang Tài khoản để chạy luôn.
4. Để máy bật. Video nằm trong `<thư mục dữ liệu>\accounts\<tên acc>\videos` (mục 8).

## 1. Máy cần gì

| | Tối thiểu | Nên có |
|---|---|---|
| Hệ điều hành | Windows 10 hoặc 11, 64-bit | |
| Card đồ hoạ | Không bắt buộc | NVIDIA có NVENC (GTX 10xx trở lên): quay bằng card, nhẹ CPU, file nhỏ |
| CPU | 6 luồng trở lên cho 1 acc | Càng nhiều luồng càng chạy được nhiều acc (mỗi acc cần khoảng 5,5 luồng CPU) |
| RAM | 8 GB | 16 GB trở lên. Khi đo sức máy, app yêu cầu còn trống ít nhất 3 GB |
| Ổ đĩa | 1 GB cho app + chỗ chứa video | 100 GB trống trở lên (app cảnh báo khi ổ dữ liệu dưới 100 GB) |
| Mạng | Chỉ cần để tải app và cập nhật | |

Các con số CPU/RAM ở cột "Tối thiểu" và "Nên có" là khuyến nghị thực tế, không phải giới hạn cứng của app. Số chính xác cho máy bạn: trang **Phần cứng** → **Đo sức máy** (mục 7).

Không có card NVIDIA (hoặc NVENC không dùng được): app tự quay bằng CPU. Vẫn chạy được nhưng CPU nặng hơn, file video thường lớn hơn, nên máy chạy được ít acc hơn. Trang Phần cứng hiện "❌ quay bằng CPU" trong trường hợp này.

App đã kèm sẵn trình duyệt (Chromium) và ffmpeg; bạn không cần cài Chrome hay ffmpeg riêng.

**Dung lượng video**: quay bằng card NVIDIA khoảng **1 GB mỗi giờ**, nên một acc chạy 10 clip × 60 phút ≈ **10 GB mỗi ngày**. 3 acc chạy 30 ngày ≈ 900 GB. Hãy chọn ổ còn nhiều chỗ, và đăng xong thì chuyển video sang ổ ngoài hoặc xoá.

## 2. Cài đặt

1. Tải `ZooGardenControl-Setup-<phiên bản>.exe` (khoảng 300 MB) ở trang Releases.
2. Bấm đúp để cài. Cài cho riêng người dùng hiện tại, không cần quyền quản trị. Có thể chọn thư mục cài; app tạo biểu tượng ở Desktop và Start Menu.
3. Windows có thể hiện cảnh báo (xem mục 14, "Windows chặn file cài"). Bản cài chưa được ký số nên cảnh báo này là bình thường.
4. Cài xong, app tự mở.

App cần khoảng 1 GB trên ổ cài.

## 3. Lần mở đầu: chọn thư mục dữ liệu

Lần đầu app hiện cửa sổ **"Chào mừng! Thiết lập lần đầu"**, và không đóng được cho đến khi bạn bấm **Bắt đầu**.

1. Ô **Thư mục dữ liệu** đã điền sẵn một thư mục `ZooGardenData` trên ổ còn nhiều chỗ trống nhất của máy. Muốn đổi thì bấm **Chọn…**.
2. Xem bảng thông số máy (CPU, RAM, card đồ hoạ, NVENC, trình duyệt) và các cảnh báo nếu có.
3. Bấm **Bắt đầu**. App khởi động lại, đó là bình thường.

Trong thư mục này app lưu mọi thứ của bạn:

| Đường dẫn (trong thư mục dữ liệu) | Nội dung |
|---|---|
| `accounts\<tên acc>\videos\` | Video `.mp4` và file chương `.txt`, `.json` |
| `accounts\<tên acc>\preview.jpg` | Ảnh xem trước, cập nhật khi acc đang chạy |
| `accounts\<tên acc>\days\<ngày>\` | Save, nhật ký (`director.log`), kế hoạch ngày |
| `accounts\_deleted\` | Acc đã xoá (lấy lại được) |
| `server\` | Dữ liệu của server game trên máy này (tài khoản + tiến độ online) |
| `groups\` | File trao đổi giữa các acc cùng nhóm |
| `control.json` | Lịch chạy và cài đặt |
| `hardware.json` | Kết quả đo sức máy |

Đổi thư mục sau này: **Cài đặt → Thư mục dữ liệu → Đổi thư mục…**. Lưu ý: app **không chuyển** dữ liệu cũ sang thư mục mới (acc, video, lịch sẽ không còn thấy). Muốn giữ thì tự copy thư mục cũ sang chỗ mới trước, đóng app hẳn (mục 11), rồi mới đổi.

## 4. Tạo acc

Mỗi acc là một nhân vật tự chơi, có thư mục và tiến độ riêng.

1. Trang **Tài khoản** → **＋ Tạo acc mới**.
2. Điền:

| Ô | Ý nghĩa |
|---|---|
| **Tên thư mục** | Tên không dấu để phân biệt acc và đặt tên file video. 2–24 ký tự: chữ cái a–z, số, `-` hoặc `_`. Ví dụ `sakura`. **Không đổi được** sau khi tạo. |
| **Tên nhân vật (tiếng Nhật)** | Tên hiện trong game và trong tiêu đề video. Ví dụ `さくら`. Bắt buộc. Sửa lại được. |
| **Màu nhân vật** | Chọn một ô màu. |
| **Tính cách chơi** | Các thanh trượt 0,5–3 cho từng chủ đề (Câu cá, Săn quái, Đánh boss, Du hành vũ trụ…). Số càng cao thì chủ đề đó càng hay xuất hiện khi lịch để chế độ **Tự động**. Để mặc định 1 nếu không quan tâm. |
| **Giờ chạy hằng ngày / Số clip mỗi ngày** | Lịch ban đầu (mặc định 08:00 và 10 clip). Chỉnh sau ở trang Lịch chạy. |
| **Bật lịch chạy ngay** | Bỏ dấu tick nếu chưa muốn acc tự chạy. |

3. Bấm **Tạo acc**. Cửa sổ chuyển sang các bước "đang liên kết online" (mục 12). Chờ vài phút hoặc đóng cửa sổ; acc vẫn tiếp tục.

Các nút trong bảng Tài khoản:

| Nút | Làm gì |
|---|---|
| **Chạy ngay** / **Dừng** | Bắt đầu một ngày chơi ngay lúc này / dừng acc |
| **Sửa** | Đổi tên nhân vật, màu, tính cách chơi |
| **Chơi online** | Chỉ hiện khi acc chưa liên kết (mục 12) |
| **Video** | Mở thư mục video của acc |
| **Lưu trữ** | Tắt lịch và cất acc sang mục "Đã lưu trữ". Bấm **Khôi phục** để dùng lại |
| **Xoá** | Chỉ có ở acc đã lưu trữ. Thư mục acc được chuyển vào `accounts\_deleted\`, có thể lấy lại bằng cách chép ra. Không xoá được acc đang chạy |

## 5. Lịch chạy

Trang **Lịch chạy** có **một dòng cho mỗi acc**, tức mỗi acc có một khung giờ chạy mỗi ngày.

| Cột | Ý nghĩa |
|---|---|
| **Bật** | Bật/tắt tự chạy theo lịch |
| **Nhóm** | A–D hoặc trống (mục 6) |
| **Giờ bắt đầu** | Giờ 24 giờ, bước 5 phút |
| **Ngày** | T2…T7, CN: những ngày trong tuần được chạy |
| **Kịch bản** | Nút chọn kịch bản (xem dưới). Mặc định "🎲 Tự động" |
| **Số clip** | 1–20 clip mỗi ngày |
| **Xong khoảng** | Giờ dự kiến xong cả ngày; có chữ "(hôm sau)" nếu qua nửa đêm |
| **Lần cuối** | Ngày acc chạy gần nhất |

**Tính giờ xong**: mỗi clip dài đúng số phút đặt ở Cài đặt (mặc định 60) cộng khoảng 3 phút mở game và chuyển clip. Ví dụ 10 clip × (60 + 3) phút ≈ 10,5 giờ; bắt đầu 08:00 thì xong khoảng 18:30.

Nhớ bấm **Lưu lịch** sau khi sửa. Các điểm cần biết:

- App chạy ngầm ở khay hệ thống và kiểm tra lịch mỗi phút. Máy phải bật và app phải đang chạy.
- Nếu app mở muộn hơn giờ hẹn (ví dụ máy bật lúc 10:00 mà lịch là 08:00) thì acc chạy bù ngay trong ngày đó, mỗi ngày chỉ một lần.
- Cùng một lúc app chỉ khởi động một acc mỗi 30 giây để các cửa sổ không nạp cùng lúc.
- Nút **▶ Chạy ngay các acc đã bật lịch** (trang Tổng quan, hoặc menu khay) chạy ngay mà không chờ giờ.
- Phía trên bảng có dòng xanh "Lịch hôm nay vừa sức máy" hoặc dòng cảnh báo vàng nếu có lúc nhiều acc chạy trùng giờ hơn sức máy (xem mục 7).

### Chọn kịch bản

Bấm nút ở cột **Kịch bản**. Mỗi kịch bản có 4 mức: **Tắt / Ít / Vừa / Nhiều** (trọng số 0 / 1 / 2 / 3). Mỗi clip trong ngày là đúng một kịch bản, chia theo tỉ lệ các mức bạn chọn, và không bao giờ lặp liền nhau nếu còn kịch bản khác. Cửa sổ có dòng tóm tắt, ví dụ "10 clip/ngày ≈ ...". Kịch bản chưa mở (chưa đủ cấp) được bỏ qua. Không chọn gì hoặc bấm **Về Tự động**: ngày tự động, clip đầu là Trang trại, clip cuối là Thư giãn, ở giữa trộn các kịch bản đã mở (theo "Tính cách chơi" của acc), mỗi kịch bản tối đa 2 lần.

Dòng tiêu đề tiếng Nhật ở cột 3 sẽ xuất hiện trong tiêu đề video YouTube (mục 8).

| Kịch bản (trong app) | Tiêu đề tiếng Nhật | Khi nào mở |
|---|---|---|
| 🌾 Trang trại – kinh tế | 朝の畑仕事と村の注文 | Luôn mở |
| 📋 Làm nhiệm vụ | 今日のクエストを片づけよう | Luôn mở |
| ⚔️ Train cày cấp | モンスター狩りと討伐依頼 | Luôn mở |
| 📖 Cốt truyện | 物語を進めよう | Luôn mở |
| 🎣 Câu cá – sưu tầm | のんびり釣りタイム | Luôn mở |
| 🌙 Thư giãn | 夕暮れの村でひと休み | Luôn mở |
| 🚀 Khám phá vũ trụ | 星の海へ ― 惑星めぐり | Từ cấp 4 |
| 🤖 Trợ thủ & bạn bè | なかまとお手伝いロボ | Từ cấp 6 |
| 🏡 Xây làng & trang trí | 村づくりと模様替え | Từ cấp 8 |
| 👑 Săn boss | ボス討伐に挑戦！ | Từ cấp 10 |
| 🔨 Nâng trang bị | 鍛冶と装備づくり | Từ cấp 15 |
| 🗿 Đánh Titan | タイタン決戦 | Từ cấp 45 |
| 🌋 Sự kiện hành tinh | 惑星イベント探検 | Khi acc đã tới Hành tinh Dung nham hoặc Đồ chơi |
| 👥 Chơi cùng nhau | 仲間といっしょに冒険 | Khi acc ở trong một nhóm chơi online |

Acc mới ở cấp thấp nên ban đầu chỉ có các kịch bản "Luôn mở". Bot tự xử lý việc gấp (hồi máu, nhận thưởng) trong mọi kịch bản.

## 6. Nhóm A–D và clip "Chơi cùng nhau"

Các acc cùng nhóm chơi **cùng nhau** trong game.

- Chỉ acc đã bật **Chơi online** (mục 12) mới chọn được nhóm; nếu chưa thì ô Nhóm bị mờ và ghi "cần bật Chơi online".
- Có 4 nhóm: A, B, C, D.
- **Trưởng nhóm** là acc đứng đầu theo thứ tự chữ cái của tên thư mục. Các acc còn lại **theo trưởng nhóm**: giờ bắt đầu, ngày, số clip và kịch bản của họ bị mờ và lấy theo trưởng nhóm khi bấm **Lưu lịch** (app báo lại cho bạn ai đã đổi theo ai).
- Cả nhóm luôn **bắt đầu cùng nhau** (cách nhau vài giây) và chờ lượt như một khối.
- Cả nhóm cùng một kế hoạch ngày, nên clip "Chơi cùng nhau" của mọi người trùng số thứ tự clip.

Trong một clip 👥 **Chơi cùng nhau**, các acc:

1. Gặp nhau trong "party" riêng của trưởng nhóm, ở cổng làng (chỗ nhìn thấy nhau, ngoài khu vườn riêng).
2. Cùng đánh những boss mà cả nhóm hạ được, và chia nhau đồ rơi ra.
3. Sang thăm vườn của nhau (có thể bị lấy mất một cây chín, và chó giữ nhà có thể cắn), hoặc đón bạn vào vườn mình.
4. Có khi cả nhóm cùng bay sang một hành tinh.
5. Nhắn vài câu chat tiếng Nhật (chào, rủ đánh boss, cảm ơn, tạm biệt), không dồn dập.

Nếu một thành viên không tới trong khoảng 4 phút, những người còn lại tự chơi một mình tiếp. Kịch bản này chỉ mở khi ngày chơi có nhóm, nên acc chơi một mình không bao giờ có clip này. Cấp để mở các kịch bản khác của nhóm tính theo acc thấp cấp nhất.

Nếu nhóm đông hơn số acc máy chạy nổi, nhóm vẫn chạy đủ cả nhóm nhưng chỉ khi không còn acc nào khác đang chạy, và máy sẽ quá tải. Trang Lịch chạy báo cảnh báo vàng; nên bớt acc khỏi nhóm.

## 7. Máy chạy được bao nhiêu acc và hàng chờ

**Sức máy** là số acc chạy cùng lúc. App lấy theo thứ tự: số bạn đặt ở **Cài đặt → Số acc chạy cùng lúc tối đa** (nếu khác 0), rồi kết quả **Đo sức máy**, rồi ước tính theo số luồng CPU.

Khi số acc đến giờ nhiều hơn sức máy:

- Acc vượt quá **không bị bỏ**: nó vào **hàng chờ** và tự chạy khi có acc khác chạy xong. Nhật ký ở trang Tổng quan ghi "⏸ Đủ N acc đang chạy, … chờ lượt".
- Trang Lịch chạy hiện "Đang chờ lượt: …". Thanh bên trái hiện "Đang chạy 2/2 acc · chờ 1".
- Acc chờ sẽ xong muộn hơn dự kiến. Muốn tránh thì giãn giờ bắt đầu của các acc.

**Đo sức máy** (trang **Phần cứng**):

1. Dừng mọi acc đang chạy.
2. Bấm **Đo sức máy (5–12 phút)** và để máy yên. App chạy thử 1, 2, 3… tối đa 5 acc ngầm vừa chơi vừa quay, mỗi bước khoảng 2 phút.
3. Dừng ở bước đầu tiên vượt ngưỡng: CPU trên 85%, card đồ hoạ trên 90%, RAM trống dưới 3 GB, dưới 26 khung hình/giây, hoặc hết số luồng NVENC của driver (3 luồng trước driver 530, 5 đến 550, 8 từ 551).
4. Kết quả "máy này chạy được N acc" được lưu và dùng cho các lần sau.

Phép đo tạo vài acc thử tên `bench-0`, `bench-1`… trong thư mục `benchmark` (không ảnh hưởng acc của bạn). Nên đo lại khi đổi phần cứng hoặc driver.

## 8. Xem trực tiếp, video và đăng YouTube

### Xem trực tiếp

Trang **Tổng quan** hiện mỗi acc đang chạy thành một thẻ: ảnh màn hình (cập nhật vài giây một lần), clip số mấy trên tổng số, tiêu đề clip, việc bot đang làm (ví dụ "Câu cá"), thời gian clip đã chạy.

- **Cỡ ô: Nhỏ / Vừa / Lớn** (góc phải trên). Nhỏ xếp được 4–5 game một hàng. App nhớ lựa chọn này.
- **Dừng**: dừng acc đó.
- **Hiện cửa sổ / Ẩn cửa sổ**: bật cửa sổ game thật để xem trực tiếp. Có hiệu lực từ **clip sau**.
- Dưới cùng là "Hoạt động gần đây" (bắt đầu, dừng, chờ lượt, lỗi…).

Thanh bên trái luôn hiện CPU, RAM, card đồ hoạ, NVENC, số acc đang chạy/tối đa, và ổ đĩa còn trống.

### Video nằm ở đâu

```
<thư mục dữ liệu>\accounts\<tên acc>\videos\
    sakura_2026-10-03-c01.mp4    video clip 1 của ngày
    sakura_2026-10-03-c01.txt    tiêu đề + mô tả + chương, dán thẳng lên YouTube
    sakura_2026-10-03-c01.json   cùng nội dung dạng dữ liệu
```

Tên file là `<tên acc>_<ngày>-c<số clip>`. Cách nhanh nhất để mở: trang Tài khoản → nút **Video**, hoặc menu khay → **Mở thư mục dữ liệu**. Ảnh xem trước nằm ở `accounts\<tên acc>\preview.jpg`.

Video là HEVC (H.265), 1920×1080, 30 khung hình/giây. Nếu máy phát không mở được, dùng VLC hoặc trình duyệt; YouTube nhận bình thường. Khi quay bằng CPU thì video là H.264.

### File chương (.txt)

Mỗi video có file `.txt` cùng tên, dòng đầu là **tiêu đề**, phía dưới là **mô tả** có dạng:

```
Zoo Garden を自動プレイでのんびり遊ぶシリーズ。さくらの3日目・2本目です。
この回：Lv.12 → Lv.13 ・ ボス討伐 1回 ・ 訪れた星：...

▼ チャプター
0:00 畑と村のお仕事
12:40 モンスター狩り・Lv.13にアップ
...
#ZooGarden #自動プレイ #ゲーム #のんびりゲーム
```

Chương được tạo tự động từ những việc bot làm (làm vườn, săn quái, đánh boss, bay sang hành tinh, câu cá…), chương đầu ở 0:00, mỗi chương dài ít nhất 2 phút và tối đa 15 chương mỗi giờ; có ghi điểm nổi bật (hạ boss, lên cấp, cứu bạn, tới hành tinh mới). YouTube chỉ hiện chương khi có ít nhất 3 chương; clip quá ngắn gọn có thể có ít hơn.

### Tiêu đề video

Dạng: `【Zoo Garden 自動プレイ】<tên nhân vật> <số ngày>日目 #<số clip> <biểu tượng><tiêu đề kịch bản>（Lv.<cấp>）`

Ví dụ: `【Zoo Garden 自動プレイ】さくら 3日目 #2 🎣のんびり釣りタイム（Lv.12）`

"Số ngày" là ngày thứ mấy của series của acc đó.

### Cách đăng lên YouTube

App **không tự đăng**. Bạn đăng tay (hoặc dùng công cụ riêng của bạn):

1. Mở YouTube Studio → **Tạo → Tải video lên**, chọn file `.mp4`.
2. Mở file `.txt` cùng tên bằng Notepad. Dòng đầu chép vào ô **Tiêu đề**.
3. Phần còn lại (từ dòng "Zoo Garden を…" đến hết hashtag) chép vào ô **Mô tả**. Giữ nguyên các dòng giờ `0:00 ...` để YouTube tạo chương.
4. Đặt ảnh bìa, chế độ hiển thị, rồi đăng.

Mô tả có thể dài; tiêu đề YouTube tối đa 100 ký tự, tiêu đề do app tạo ngắn hơn mức đó.

## 9. Âm thanh

Mặc định bot **tắt tiếng** (không ồn máy, video không có tiếng game). Bật ở một trong hai chỗ:

- **Cài đặt → Âm thanh của bot** (nhớ bấm **Lưu**).
- Menu khay → **Âm thanh của bot** (tick).

Áp dụng từ clip kế tiếp của mỗi acc, không đổi clip đang chạy.

## 10. Cài đặt

| Mục | Ý nghĩa |
|---|---|
| Tự khởi động cùng Windows | Mặc định bật; app mở ngầm ở khay khi bạn đăng nhập Windows |
| Âm thanh của bot | Xem mục 9 |
| Số acc chạy cùng lúc tối đa | 0 = theo kết quả đo; tối đa 8 |
| Số clip mỗi ngày | Mặc định cho acc mới (1–20) |
| Độ dài mỗi clip (phút) | Mặc định 60 (1–180). Video dài/ngắn hơn thì dung lượng và giờ xong đổi theo |
| Thư mục dữ liệu | Mở thư mục hoặc đổi (mục 3) |
| Phiên bản và cập nhật | Mục 13 |

Nhớ bấm **Lưu**. Cài đặt áp dụng cho các lần chạy sau.

## 11. Khay hệ thống: chạy ngầm và thoát

Đóng cửa sổ (nút X) **không tắt app**: app thu xuống khay hệ thống (góc phải thanh tác vụ, có thể nằm sau mũi tên ^) và lịch vẫn chạy. Bấm vào biểu tượng để mở lại cửa sổ. Mở app lần nữa khi nó đang chạy ngầm cũng chỉ hiện lại cửa sổ đó.

Chuột phải vào biểu tượng khay:

| Mục | Làm gì |
|---|---|
| Mở bảng điều khiển | Hiện cửa sổ |
| Chạy ngay tất cả acc theo lịch | Chạy mọi acc đã bật lịch, không chờ giờ |
| Dừng tất cả | Dừng mọi acc |
| Âm thanh của bot | Bật/tắt tiếng |
| Mở thư mục dữ liệu | Mở thư mục ở mục 3 |
| Thoát (dừng mọi acc) | Tắt hẳn app, dừng mọi acc và server game |

Máy sleep hoặc tắt thì không có acc nào chạy. Nên đặt Windows "không bao giờ sleep khi cắm điện".

## 12. Online và đăng nhập

Game này **bắt buộc đăng nhập**, nên mọi acc đều chơi "online". Điều này **không** có nghĩa là chơi trên internet:

- Server game chạy ngay trên **máy của bạn** (địa chỉ `http://127.0.0.1:8787/`), do app tự bật khi cần và tắt khi bạn **Thoát**.
- Tài khoản và tiến độ nằm trong `<thư mục dữ liệu>\server\`. **Không có gì được tải lên mạng.** Người khác không vào được server này.
- Mật khẩu của mỗi acc do app tạo ngẫu nhiên, lưu trong `account.json` của acc, chỉ dùng cho server trên máy này. Đừng gửi cả thư mục dữ liệu cho người khác.

**Acc mới** tự liên kết ngay khi tạo (bạn thấy các bước chạy trong cửa sổ). **Acc chưa liên kết** (ví dụ lần liên kết trước lỗi) sẽ tự liên kết trước lần chạy đầu. Hoặc bấm nút **Chơi online (server trên máy này)** ở trang Tài khoản và làm theo cửa sổ **Liên kết và chơi online**. Cần dừng acc trước khi liên kết.

Khi liên kết, save offline hiện có (cấp, đồ, tiến độ) được chuyển lên server của máy này. Save offline cũ vẫn giữ làm bản dự phòng nhưng acc không quay lại chơi offline được.

Mỗi clip, acc ở trong một "party" riêng nên người chơi lạ (nếu có) không lạc vào video.

## 13. Cập nhật và gỡ cài đặt

### Cập nhật

- App tự tìm bản mới trên trang Releases (mrtippi/cute_game) lúc mở và mỗi 6 giờ, tải ngầm.
- Tải xong, app báo ở khay và **tự cài khi không có acc nào đang chơi hay chờ**; nếu bạn thoát app thì bản mới cũng được cài lúc đó.
- Muốn làm tay: **Cài đặt → Phiên bản và cập nhật → Kiểm tra cập nhật**; khi báo đã tải xong thì có nút **Cài bản mới ngay** (từ chối nếu đang có acc chạy).
- Dữ liệu của bạn không bị đụng tới khi cập nhật.

### Gỡ cài đặt

1. Thoát hẳn app (menu khay → Thoát).
2. Windows **Cài đặt → Ứng dụng** → "Zoo Garden Control" → Gỡ cài đặt.

**Được giữ lại**: toàn bộ **thư mục dữ liệu** (acc, save, video, server, lịch) vì nó nằm ngoài thư mục cài, cùng file cấu hình nhỏ ghi nhớ thư mục đó (`%APPDATA%\zoo-garden-control\config.json`). Cài lại bản mới thì app nhận lại thư mục cũ. Muốn xoá sạch, tự xoá thư mục dữ liệu và thư mục `%APPDATA%\zoo-garden-control`.

## 14. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| **Windows chặn file cài** ("Windows protected your PC" / SmartScreen) hoặc antivirus cảnh báo | Bản cài chưa được ký số của nhà phát hành nên Windows chưa quen. Chỉ tải từ trang Releases chính thức rồi chọn **More info → Run anyway**. Nếu antivirus xoá file thì thêm ngoại lệ cho thư mục cài và thư mục dữ liệu. Có thể kiểm tra file với `latest.yml` trong cùng bản Release (mã sha512) |
| **"Server game không khởi động được"** hoặc acc không vào được game | Server dùng cổng cố định **8787**. Nếu chương trình khác (hoặc một bản game khác bạn đang chạy) đang giữ cổng này thì app không bật được server của mình. Mở Command Prompt gõ `netstat -ano \| findstr :8787` để xem tiến trình giữ cổng (số cuối dòng là PID; tra tên trong Task Manager → Details), tắt nó rồi thử lại. Nếu không phải do chương trình khác, thử **Thoát** hẳn app rồi mở lại |
| Trang Phần cứng báo **"NVENC không dùng được: video sẽ nén bằng CPU"** | Máy không có card NVIDIA, hoặc driver quá cũ/lỗi. App tự dùng CPU để quay nên vẫn chạy được nhưng nặng và chậm hơn. Muốn dùng card: cài driver NVIDIA mới nhất rồi bấm **Kiểm tra lại**. Card đời cũ hơn GTX 10xx không có NVENC HEVC |
| Báo **"Ổ dữ liệu chỉ còn N GB"** | Xoá hoặc chuyển video đã đăng đi; hoặc đổi thư mục dữ liệu sang ổ khác (mục 3) |
| Acc "đứng im", ảnh xem trước không đổi | App có **người gác (watchdog)**: nếu nhật ký của clip im lặng quá **6 phút**, app tự tắt và chạy lại acc từ clip đó. Acc dừng bất thường cũng được chạy lại, **tối đa 3 lần**; nhật ký trang Tổng quan ghi "⚠ … đứng im …, khởi động lại" hoặc "dừng bất thường, chạy lại (1/3)". Nếu vẫn lặp lại, bấm **Dừng** rồi **Chạy ngay**. Xem file `accounts\<acc>\days\<ngày>\director.log` để biết nguyên nhân |
| Liên kết online báo lỗi | Dừng acc đó, bấm **Chơi online** thử lại. Nếu vẫn lỗi, kiểm tra cổng 8787 như trên |
| Nhóm báo "máy chỉ chạy được N acc" | Bớt acc khỏi nhóm hoặc tăng sức máy (mục 7) |
| Muốn xem acc đang làm gì | Tổng quan → **Hiện cửa sổ** (từ clip sau), hoặc đọc file `director.log` |
| Cửa sổ app biến mất | App vẫn chạy ở khay hệ thống; bấm vào biểu tượng |

## 15. Hỏi nhanh

**App có tự đăng video lên YouTube không?**
Không. App chỉ quay video và viết sẵn tiêu đề/mô tả/chương; bạn tự đăng (mục 8).

**Tôi cần mở game bằng trình duyệt không?**
Không. Bot dùng trình duyệt đi kèm app, chạy ngầm không có cửa sổ (trừ khi bạn bấm **Hiện cửa sổ**).

**Có gửi dữ liệu của tôi lên mạng không?**
Không. Server game, tài khoản, save và video đều ở trên máy bạn. App chỉ kết nối mạng để kiểm tra bản cập nhật trên GitHub.

**Tôi dùng máy tính hằng ngày, có chạy cùng được không?**
Được, nhưng bot dùng khá nhiều CPU/card. Đặt "Số acc chạy cùng lúc tối đa" thấp hơn, hoặc hẹn giờ vào lúc bạn không dùng máy.

**Một ngày quay được bao nhiêu video?**
Mặc định 10 clip × 60 phút cho mỗi acc, chỉnh được từ 1–20 clip và 1–180 phút. Thời gian thực mỗi clip tốn thêm khoảng 3 phút.

**Video dài bao nhiêu?**
Đúng số phút đặt ở Cài đặt (mặc định 60).

**Tôi muốn acc chỉ câu cá?**
Lịch chạy → nút Kịch bản của acc → chọn "Câu cá – sưu tầm" mức **Nhiều**, các kịch bản khác để **Tắt** → Lưu.

**Tôi xoá nhầm acc?**
Vào `<thư mục dữ liệu>\accounts\_deleted\`, chép thư mục `<tên acc>-<số>` về `accounts\` và đổi tên lại thành `<tên acc>`. Mở lại app.

**Tắt máy giữa chừng thì sao?**
Clip đang quay dở bị mất; save của acc vẫn còn. Khi bật máy và mở app, acc đến giờ sẽ chạy bù trong ngày (mục 5). Ngày chơi không tự hoàn lại clip đã mất.

**Nhân vật tên tiếng Nhật, app tiếng Việt, video tiếng Nhật?**
Đúng: giao diện app là tiếng Việt, còn game, tên nhân vật, tiêu đề, mô tả và chương của video đều là tiếng Nhật.

---
Tài liệu này dùng cho nội bộ (chủ dự án). Khi gặp lỗi, giữ lại file `director.log` của acc liên quan để dò nguyên nhân.
