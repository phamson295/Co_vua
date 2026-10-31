# Cờ vua (web)

Game cờ vua chạy trên trình duyệt, dùng được trên điện thoại và máy tính, với 3 chế độ:

- **Chơi với máy**: 12 cấp độ, chọn cầm Trắng/Đen/ngẫu nhiên, có đồng hồ, **gợi ý nước đi**, hoàn tác (khi không tính giờ) và **Elo luyện tập** (lưu trên máy, kèm gợi ý cấp độ vừa sức).
- **Hai người, một máy**: có đồng hồ thi đấu. Chọn cách ngồi: **Đối diện** (mặc định: bàn cờ đứng yên, quân Đen cùng thanh tên và đồng hồ bên Đen quay ngược về phía người cầm Đen), **Xoay bàn theo lượt**, hoặc **Cùng một phía**.
- **Chơi online**: tạo phòng, mời bạn bè bằng liên kết hoặc mã 5 ký tự. Máy chủ kiểm tra từng nước đi và giữ đồng hồ. Có **xin hòa, tái đấu (đổi màu quân), chat nhanh**, **tự nối lại** khi mất mạng hoặc tải lại trang (giữ ván 60 giây; quá thời gian thì xử thua), và **xếp hạng Glicko-2** khi cả hai đã đăng nhập.

Luật đầy đủ: nhập thành, bắt tốt qua đường, phong cấp, chiếu, chiếu hết, hết nước đi (hòa), lặp lại thế cờ 3 lần (hòa), luật 50 nước (hòa), không đủ quân để chiếu hết (hòa). Hết giờ thì thua, trừ khi bên còn lại không đủ quân để chiếu hết (khi đó hòa).

**Thể thức thời gian:** Không giới hạn, 1 phút, 3+2, 5 phút, 10 phút, 15+10, 30 phút (số sau dấu `+` là giây cộng thêm sau mỗi nước).

**Trong ván:** đồng hồ hai bên, rating, quân đã ăn và chênh lệch quân, danh sách nước đi theo ký hiệu chuẩn (`Nf3`, `O-O`, `Qh4#`), **xem lại từng nước** (nút ◀ ▶ hoặc phím mũi tên), lật bàn, sao chép PGN. Ván với máy và ván hai người được **lưu tự động**, đóng trang rồi mở lại vẫn chơi tiếp được từ menu.

## Điểm số và xếp hạng

Hiện thực hóa một phần [tài liệu thiết kế](docs/he-thong-xep-hang-va-diem-so.md):

| Hệ thống | Áp dụng | Cách tính |
|---|---|---|
| Rating Glicko-2 | Ván online, cả hai đã đăng nhập, phòng bật "Tính điểm" | Ba nhóm theo thời gian: Siêu chớp (dưới 3 phút ước tính), Cờ chớp (dưới 8 phút), Cờ nhanh. Khởi điểm 1500, dấu `?` khi chưa đủ ván. RD tăng dần khi nghỉ chơi |
| Bảng xếp hạng | Từng nhóm thời gian | Xếp theo `rating − 2·RD` để người mới may mắn không vượt lên đầu |
| EXP và cấp độ | Người có tài khoản | Ván online: 20 + thắng 20 / hòa 10. Ván với máy: (10 + thắng 20 / hòa 10) × hệ số theo cấp máy, tối đa 300 EXP/ngày. Ván dưới 6 nước mỗi bên không được EXP. Cấp `L` cần `100·L^0,9` EXP, tối đa cấp 50 |
| Elo luyện tập | Ván với máy, lưu trên máy người chơi | Elo một phía với Elo nội bộ của máy (cấp `n` ≈ `600 + 125·(n−1)`). Ván có dùng gợi ý hoặc hoàn tác không được tính |

Ván online bị bỏ trước khi cả hai bên đi nước nào thì không tính điểm. Người bỏ ván giữa chừng bị xử thua và không được EXP.

## Giao diện

Mở **Giao diện** (biểu tượng bánh răng ở góc trên, hoặc trong menu) để tùy chỉnh. Thiết lập được lưu trên trình duyệt.

- **Kiểu quân cờ**: Cổ điển và Hiện đại (quân vector có hình dạng khác nhau), Ký tự, Chữ cái.
- **Bàn cờ**: Gỗ, Xanh lá, Xanh dương, Đá cẩm thạch, Ban đêm.
- **2D / 3D**: 2D phẳng có hoạt ảnh trượt quân. 3D là bàn cờ dựng thật bằng Three.js, có chất liệu, bóng đổ, kéo để xoay góc nhìn, chụm hai ngón để phóng to thu nhỏ, và nút "Đặt lại góc nhìn". Kiểu quân Cổ điển/Hiện đại cũng áp dụng cho quân 3D.
- **Màu giao diện**: Tự động theo hệ thống, Sáng, Tối.
- Âm thanh, gợi ý ô có thể đi, tọa độ trên bàn 2D, cách ngồi khi chơi hai người.

## Tài khoản

Không bắt buộc đăng nhập: khách vẫn chơi được mọi chế độ. Có bốn cách vào:

| Cách | Cần gì | Ghi chú |
|---|---|---|
| **Chơi không đăng ký** | Không cần gì | Chơi online với tên `Khách-xxxx`, không có thống kê |
| **Chơi nhanh** (tài khoản nhanh) | Chỉ một biệt danh | Dùng được ngay; gắn email sau để đăng nhập lại trên thiết bị khác |
| **Email** | Tên hiển thị, email, mật khẩu (từ 8 ký tự) | Mật khẩu băm bằng scrypt |
| **Google / Facebook** | Quản trị viên cấu hình khóa OAuth | Nút tự bật khi có đủ khóa |

Người đã đăng nhập dùng tên của mình khi chơi online (đối thủ thấy tên đó), có rating, EXP, cấp độ và thống kê (ván, thắng, thua, hòa) trong hồ sơ.

### Cấu hình đăng nhập mạng xã hội

Tạo ứng dụng OAuth trong [Google Cloud Console](https://console.cloud.google.com/apis/credentials) và [Meta for Developers](https://developers.facebook.com/), thêm địa chỉ chuyển hướng (redirect URI):

- Google: `https://TÊN-MIỀN/api/auth/google/callback`
- Facebook: `https://TÊN-MIỀN/api/auth/facebook/callback`

Sau đó đặt biến môi trường trên máy chủ:

| Biến | Ý nghĩa |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Bật nút "Tiếp tục với Google" |
| `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | Bật nút "Tiếp tục với Facebook" |
| `PUBLIC_URL` | Địa chỉ công khai của trang (ví dụ `https://co-vua.onrender.com`), dùng tạo redirect URI. Trên Render tự lấy từ `RENDER_EXTERNAL_URL` |
| `SESSION_SECRET` | Khóa ký phiên đăng nhập. Nếu bỏ trống, máy chủ tự sinh và lưu trong thư mục dữ liệu |
| `DATA_DIR` | Thư mục lưu dữ liệu người dùng (mặc định `./data`) |
| `TRUST_PROXY` | Đặt `1` khi chạy sau proxy (tự bật trên Render) để nhận đúng địa chỉ IP và HTTPS |

Mỗi tài khoản mạng xã hội là một tài khoản riêng, không tự gộp với tài khoản email trùng địa chỉ (vì email của tài khoản thường chưa được xác minh, gộp tự động sẽ cho phép chiếm tài khoản).

### Bảo mật đã làm

- Mật khẩu băm bằng scrypt có muối riêng; so sánh thời gian cố định; không bao giờ trả mật khẩu băm về trình duyệt.
- Phiên đăng nhập là cookie `HttpOnly`, `SameSite=Lax` (thêm `Secure` khi chạy HTTPS), có chữ ký HMAC và hạn 90 ngày.
- Giới hạn số lần thử đăng nhập/đăng ký theo IP và theo email; thông báo lỗi không tiết lộ email có tồn tại hay không.
- Kiểm tra `Origin` với các yêu cầu ghi dữ liệu; OAuth dùng tham số `state` chống giả mạo yêu cầu.

### Giới hạn của phần tài khoản

- **Dữ liệu lưu trong một file JSON.** Trên gói miễn phí của Render, ổ đĩa là tạm thời nên **tài khoản sẽ mất sau mỗi lần deploy hoặc khởi động lại**. Muốn lưu lâu dài cần gắn ổ đĩa bền vững (đặt `DATA_DIR` vào đó) hoặc đổi `server/store.js` sang cơ sở dữ liệu thật (ví dụ PostgreSQL). Cách này cũng chỉ phù hợp một máy chủ duy nhất.
- Chưa xác minh email và chưa có chức năng quên mật khẩu (cần dịch vụ gửi email như SMTP hoặc Resend).
- Đăng nhập Google/Facebook chưa được thử với khóa thật (đã kiểm thử luồng OAuth với máy chủ giả lập). Chưa có Zalo, Apple.
- Chưa có xóa tài khoản và đổi tên hiển thị.

## Tài liệu thiết kế

- [Hệ thống chấm điểm và xếp hạng](docs/he-thong-xep-hang-va-diem-so.md): phân tích Elo, Glicko/Glicko-2, EXP và Cấp độ, Điểm giải đấu (Swiss, Arena), Thành tựu và Puzzle Rating, kèm mã tham khảo và gợi ý tích hợp.

## Chạy thử

Yêu cầu: Node.js 18 trở lên.

```bash
npm install
npm start
```

Mở `http://localhost:3000` (đổi cổng bằng biến môi trường `PORT`). Để chơi online với người khác, họ cần truy cập được địa chỉ máy chạy server.

Chạy kiểm thử:

```bash
npm test
```

## Cấu trúc

```
server.js                  Máy chủ: phục vụ giao diện, API (/api) và WebSocket (/ws)
server/
  auth.js                  Đăng ký, đăng nhập, tài khoản nhanh, OAuth, phiên đăng nhập, bảng xếp hạng, EXP
  game-server.js           Phòng online: đồng hồ, xin hòa, tái đấu, chat nhanh, nối lại, rating và EXP khi hết ván
  store.js                 Lưu người dùng, rating, EXP vào file JSON
public/
  index.html               Giao diện
  css/style.css
  js/engine.js             Luật cờ, ký hiệu SAN/PGN (dùng chung cho trình duyệt và máy chủ)
  js/shared.js             Thể thức thời gian, đồng hồ, câu chat nhanh (dùng chung)
  js/rating.js             Glicko-2, Elo luyện tập, EXP và cấp độ (dùng chung)
  js/ai.js                 Máy chơi: alpha-beta, quiescence, 12 cấp độ
  js/ai-worker.js          Chạy việc tính nước của máy ở luồng riêng (không làm đơ giao diện)
  js/app.js                Điều khiển giao diện: ván cờ, đồng hồ, xem lại, gợi ý, lưu ván, online
  js/pieces.js             Quân cờ vector (SVG) cho bàn 2D
  js/board3d.js            Bàn cờ 3D bằng Three.js (chỉ nạp khi chọn 3D)
  js/sound.js              Âm thanh tạo bằng Web Audio
  js/account.js            Giao diện đăng nhập, đăng ký, chơi nhanh, hồ sơ
  vendor/                  Three.js 0.160.0 và OrbitControls (giấy phép MIT: THREE-LICENSE.txt)
tests/
  engine.test.js           Kiểm thử luật bằng perft (đếm nước đi chuẩn), ký hiệu SAN và các trường hợp kết thúc ván
  ai.test.js               Kiểm thử máy: nước hợp lệ, chiếu hết, thời gian suy nghĩ
  auth.test.js             Kiểm thử tài khoản, OAuth (máy chủ giả lập), tên người chơi và thống kê online
  online.test.js           Kiểm thử online: đồng hồ, hết giờ, xin hòa, tái đấu, nối lại, bỏ ván, xếp hạng, EXP, chat
  shared.test.js           Kiểm thử đồng hồ, Glicko-2, Elo luyện tập, EXP
```

## Các cấp độ máy

| Cấp | Tên | Độ sâu tính | Thời gian tối đa | Độ ngẫu nhiên |
|---|---|---|---|---|
| 1 | Mới tập | 1 | 1 giây | rất lớn (hay đi sai) |
| 2 | Nhập môn | 1 | 1 giây | lớn |
| 3–6 | Sơ cấp → Trung cấp 1 | 2 | 1–1,5 giây | giảm dần |
| 7–9 | Trung cấp 2 → Khá | 3 | 2–2,5 giây | nhỏ |
| 10 | Giỏi | 4 | 3 giây | không |
| 11 | Rất giỏi | 5 | 4 giây | không |
| 12 | Chuyên gia | 6 | 6 giây | không |

Độ ngẫu nhiên cộng vào điểm của mỗi nước, nên các cấp thấp thỉnh thoảng đi nước kém. Cấp 12 mạnh hơn người chơi phổ thông nhưng **không** bằng các máy cờ chuyên dụng như Stockfish. Thời gian thực tế phụ thuộc vào tốc độ máy.

## Deploy lên Render

1. Đăng nhập [render.com](https://render.com), chọn **New → Blueprint**, rồi chọn repo `phamson295/Co_vua` và nhánh `ccr-28d99950-0jq5lv`.
2. Render đọc file `render.yaml`, tự chạy `npm install` và `npm start`. Cổng được Render cấp qua biến `PORT`.
3. Khi xong, Render cấp một địa chỉ dạng `https://co-vua.onrender.com`. Mở địa chỉ này trên điện thoại. Kết nối online dùng `wss://` tự động.

Gói miễn phí của Render sẽ tạm ngủ sau một thời gian không có truy cập, lần mở đầu có thể chậm vài chục giây. Phòng online đang chờ cũng sẽ mất khi server khởi động lại.

## Giới hạn hiện tại

- Máy chủ giữ phòng trong bộ nhớ, nên khởi động lại máy chủ (kể cả khi Render deploy lại) sẽ mất các ván online đang diễn ra.
- Chưa có ghép trận ngẫu nhiên theo rating (hiện chỉ chơi bằng phòng mời), chưa có giải đấu, thành tựu và giải đố trong tài liệu thiết kế.
- Chat chỉ có câu soạn sẵn (không gõ tự do), để không phải kiểm duyệt nội dung.
- Elo luyện tập lưu trên từng thiết bị, chưa đồng bộ giữa các máy.
- Chế độ 3D cần trình duyệt hỗ trợ WebGL; nếu không, ứng dụng tự quay về 2D. Quân 3D là hình khối dựng bằng hình học, chưa phải mô hình chạm khắc chi tiết.
- Chưa kiểm thử trên nhiều loại điện thoại thật; hiệu năng 3D phụ thuộc cấu hình máy.
