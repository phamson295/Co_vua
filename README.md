# Cờ vua (web)

Game cờ vua chạy trên trình duyệt, dùng được trên điện thoại và máy tính, với 3 chế độ:

- **Hai người trên cùng một máy**: hai người chơi lần lượt trên một điện thoại. Bàn cờ tự xoay theo lượt để người ngồi đối diện nhìn đúng quân của mình (có thể tắt).
- **Chơi với máy**: 12 cấp độ, từ "Mới tập" đến "Chuyên gia". Bạn chọn cầm quân Trắng, Đen hoặc ngẫu nhiên.
- **Chơi online**: tạo phòng, gửi mã 5 ký tự cho bạn, bạn vào phòng bằng mã đó. Máy chủ kiểm tra từng nước đi.

Luật đầy đủ: nhập thành, bắt tốt qua đường, phong cấp, chiếu, chiếu hết, hết nước đi (hòa), lặp lại thế cờ 3 lần (hòa), luật 50 nước (hòa), không đủ quân để chiếu hết (hòa).

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
server.js                  Máy chủ: phục vụ giao diện, ghép phòng và chuyển nước đi (WebSocket /ws)
public/
  index.html               Giao diện
  css/style.css
  js/engine.js             Luật cờ (dùng chung cho trình duyệt và máy chủ)
  js/ai.js                 Máy chơi: alpha-beta, quiescence, 12 cấp độ
  js/ai-worker.js          Chạy việc tính nước của máy ở luồng riêng (không làm đơ giao diện)
  js/app.js                Điều khiển giao diện
tests/
  engine.test.js           Kiểm thử luật bằng perft (đếm nước đi chuẩn) và các trường hợp kết thúc ván
  ai.test.js               Kiểm thử máy: nước hợp lệ, chiếu hết, thời gian suy nghĩ
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

- Chơi online: không có tính năng nối lại khi tải lại trang hoặc mất mạng. Ván đang chơi sẽ kết thúc nếu một bên rời đi.
- Máy chủ giữ phòng trong bộ nhớ, nên khởi động lại máy chủ sẽ mất hết phòng đang chờ và ván đang chơi.
- Chưa có chức năng đề nghị hòa, chat, đồng hồ đếm giờ hay lưu ván.
- Ô cờ không có ký hiệu tọa độ trên bàn; danh sách nước đi dùng dạng `e2-e4`.
