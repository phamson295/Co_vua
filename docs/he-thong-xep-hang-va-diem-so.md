# Tài liệu thiết kế: 5 hệ thống chấm điểm và xếp hạng cho game cờ vua

Tài liệu này phân tích đúng 5 hệ thống để tích hợp vào game cờ vua đa nền tảng (online: PvP, giải đấu; offline: đấu Bot, giải thế cờ):

1. Elo
2. Glicko và Glicko-2
3. Điểm kinh nghiệm (EXP) và Cấp độ
4. Điểm giải đấu (Swiss và Arena)
5. Điểm thành tựu (Achievements) và Puzzle Rating

Mỗi hệ thống được phân tích theo ba trục: **cơ chế toán học/logic**, **môi trường áp dụng tối ưu**, **tác động đến tâm lý giữ chân người chơi**, kèm gợi ý tích hợp vào dự án hiện tại (engine cờ dùng chung cho trình duyệt và máy chủ, máy chủ Node có WebSocket, tài khoản người dùng).

Các công thức và ví dụ số trong tài liệu đã được tính lại bằng mã trước khi đưa vào (trừ phần "mã giả" được ghi rõ). Những nhận định về tâm lý là nguyên lý thiết kế chung, không phải số liệu đo trên chính game này; cần đo bằng dữ liệu thật sau khi ra mắt.

---

## 0. Bức tranh chung

### 0.1. Nguyên tắc cốt lõi: mỗi thang điểm một mục đích, không trộn

| Thang điểm | Đo cái gì | Có rớt không | Môi trường | Dùng để |
|---|---|---|---|---|
| Elo / Glicko-2 (PvP) | Kỹ năng đối đầu với người | Có | Online | Ghép trận cân sức, bảng xếp hạng |
| Elo (Bot) | Kỹ năng so với các cấp Bot | Có | Offline | Cấp bậc Bot, mục tiêu luyện tập |
| EXP / Cấp độ | Mức độ gắn bó | **Không** | Cả hai | Mở khóa phần thưởng, giữ chân |
| Điểm giải đấu | Thành tích trong một giải | Reset mỗi giải | Online (là chính) | Sự kiện, mùa giải |
| Puzzle Rating | Kỹ năng chiến thuật | Có | Cả hai | Đo tiến bộ không cần đối thủ |
| Điểm thành tựu | Hoàn thành mục tiêu | **Không** | Cả hai | Mốc ăn mừng, sưu tầm |

Lý do tách riêng: mỗi thang có ý nghĩa thống kê và tâm lý khác nhau. Trộn EXP (luôn tăng) vào Elo (zero-sum) làm Elo mất khả năng ghép trận cân sức; trộn Bot với người làm bảng xếp hạng online không còn đáng tin.

### 0.2. Thứ tự triển khai gợi ý

1. Elo/Glicko-2 PvP và Bot rating (nền tảng ghép trận và cấp bậc).
2. EXP và Cấp độ (rẻ, tác động giữ chân lớn, không cần dữ liệu phức tạp).
3. Puzzle Rating (cần kho bài tập).
4. Thành tựu (cần hệ thống sự kiện).
5. Giải đấu (cần lobby, đồng hồ, ghép vòng, nặng nhất về kỹ thuật).

### 0.3. Nguyên tắc kỹ thuật chung

- **Máy chủ quyết định điểm online.** Trình duyệt chỉ gửi nước đi; máy chủ (đã có engine kiểm tra luật) tính kết quả và cập nhật điểm. Không bao giờ nhận rating từ client.
- **Offline là "tin cậy cục bộ".** Điểm offline lưu trên máy, dễ bị sửa; vì vậy điểm offline không được vào bảng xếp hạng online.
- **Mỗi ván có `game_id` và kết quả được ghi một lần** (idempotent), để tránh cộng điểm hai lần khi gửi lại.

---

## 1. Hệ thống xếp hạng Elo

### 1.1. Cơ chế toán học

Mỗi người chơi có một số rating `R`. Trước ván, tính **điểm kỳ vọng** của A khi gặp B:

```
E_A = 1 / (1 + 10^((R_B − R_A) / 400))
```

Sau ván, cập nhật theo kết quả thực tế `S` (thắng = 1, hòa = 0,5, thua = 0):

```
R_A' = R_A + K · (S_A − E_A)
```

**Ý nghĩa của hằng số 400:** chênh 400 điểm tương ứng xác suất thắng kỳ vọng khoảng 91%. Bảng đã tính:

| Chênh lệch rating | Xác suất kỳ vọng của bên mạnh hơn |
|---|---|
| 0 | 50,0% |
| 100 | 64,0% |
| 200 | 76,0% |
| 400 | 90,9% |
| 800 | 99,0% |

**Ví dụ.** A (1500) gặp B (1700), `K = 20`. `E_A = 0,2403`.
- A thắng: `+15,19` điểm. A hòa: `+5,19`. A thua: `−4,81`.
- Phía B (1700) tương ứng: thắng `+4,81`, thua `−15,19`.

Thắng người mạnh hơn được thưởng nhiều, thua người yếu hơn bị phạt nhiều. Tổng điểm hai bên giữ nguyên (**zero-sum**), nên toàn hệ thống là một "bể điểm" kín.

**Hệ số K (độ nhạy).** K lớn thì rating đổi nhanh nhưng nhiễu; K nhỏ thì ổn định nhưng chậm hội tụ. Cách phổ biến (đơn giản hóa từ quy ước của FIDE):

| Nhóm | Gợi ý K | Lý do |
|---|---|---|
| Người mới (dưới ~30 ván) | 40 | Cần hội tụ nhanh về đúng trình |
| Người chơi thường | 20 | Cân bằng |
| Rating cao (từ ~2400) | 10 | Ổn định ở nhóm đầu bảng |

**Mã tham khảo (JavaScript):**

```js
const expected = (ra, rb) => 1 / (1 + 10 ** ((rb - ra) / 400));
const kFactor = (games, rating) => (games < 30 ? 40 : rating >= 2400 ? 10 : 20);

function updateElo(a, b, scoreA) {
  const ea = expected(a.rating, b.rating);
  const eb = 1 - ea;
  return {
    a: a.rating + kFactor(a.games, a.rating) * (scoreA - ea),
    b: b.rating + kFactor(b.games, b.rating) * ((1 - scoreA) - eb),
  };
}
```

**Điểm yếu cần biết:**
- **Không có độ bất định.** Người mới và người đã chơi 1.000 ván đều chỉ là một con số; người nghỉ lâu quay lại vẫn giữ rating cũ dù trình đã đổi. Đây là lý do cần Glicko (mục 2).
- **Lạm phát/giảm phát** khi dân số vào ra không đều (người giỏi rời đi mang điểm đi, người mới vào mang điểm vào).
- **Bị thao túng:** cố tình thua để hạ rating rồi đấu người yếu (sandbagging), hoặc hai tài khoản đổi điểm cho nhau. Cần phát hiện bất thường và giới hạn ghép trận lặp.
- **Phải tách thang theo thể thức** (bullet/blitz/rapid) vì kỹ năng ở từng nhịp khác nhau.

### 1.2. Áp dụng cho ghép trận online

- Ghép người có rating gần nhau để xác suất thắng gần 50% (ván cân sức là ván hấp dẫn nhất).
- **Cửa sổ ghép mở rộng theo thời gian chờ**, ví dụ `δ = 50 + 10·t` (điểm, `t` là giây chờ), tối đa 300. Hàng chờ ít người thì mở rộng nhanh hơn để không bắt chờ quá lâu.
- Không ghép lại cùng một đối thủ liên tiếp để hạn chế thao túng và nhàm chán.
- Phòng riêng mời bạn (đã có trong dự án) **không tính rating** hoặc tính rating thấp (K nhỏ) để tránh gian lận điểm giữa bạn bè.

### 1.3. Áp dụng cho cấp bậc Bot offline

Bot có độ mạnh cố định, nên có thể gán cho mỗi cấp một **Elo cố định**. Người chơi có `bot_rating` riêng, cập nhật bằng công thức Elo **một phía** (Elo của Bot không đổi):

```
bot_rating' = bot_rating + K · (S − E(bot_rating, bot_elo[level]))
```

Cách làm này cho người chơi một thước đo tiến bộ không cần mạng:
- Hiển thị: "Bạn đang ở mức ngang Bot cấp 7".
- Gợi ý cấp Bot tiếp theo để thử sức (Bot có Elo cao hơn khoảng 50 đến 100 điểm).

**Hiệu chuẩn Elo cho 12 cấp Bot của dự án.** Không nên đoán. Cách đo: cho hai cấp liền kề đấu nhiều ván (đổi màu, mở đầu ngẫu nhiên vài nước đầu vì Bot các cấp cao là tất định), gọi `p` là tỷ lệ điểm của cấp cao hơn thì chênh lệch Elo là:

```
ΔElo = −400 · log10(1/p − 1)
```

**Số liệu đo thực tế trên các cấp Bot hiện có (cấp 1 đến 10)** (cấp liền kề đấu 8 ván, đổi màu, mở đầu ngẫu nhiên 4 nước; cấp 11 và 12 chưa đo vì mỗi nước nghĩ tới 4 đến 6 giây nên quá chậm):

| Cặp cấp | Điểm của cấp cao hơn | Chênh Elo ước lượng | Cộng dồn từ cấp 1 (cấp 1 = 0) |
|---|---|---|---|
| 1 → 2 | 5/8 | +89 | 89 |
| 2 → 3 | 4,5/8 | +44 | 132 |
| 3 → 4 | 3,5/8 | −44 | 89 |
| 4 → 5 | 6,5/8 | +255 | 343 |
| 5 → 6 | 4,5/8 | +44 | 387 |
| 6 → 7 | 7,5/8 | +470 | 858 |
| 7 → 8 | 4/8 | 0 | 858 |
| 8 → 9 | 5/8 | +89 | 946 |
| 9 → 10 | 6/8 | +191 | 1.137 |

**Cách đọc số liệu này (rất quan trọng):**
- **Mẫu quá nhỏ.** Với 8 ván mỗi cặp, sai số của tỷ lệ điểm khoảng ±0,18, tương đương **sai số cỡ ±120 Elo cho mỗi cặp** (cặp 3 → 4 cho kết quả âm chỉ vì ngẫu nhiên). Đừng dùng từng dòng riêng lẻ làm Elo của Bot.
- Số đáng tin hơn là **xu hướng chung:** từ cấp 1 đến cấp 10, độ chênh cộng dồn khoảng **1.100 Elo, trung bình khoảng 125 Elo mỗi cấp**; bước nhảy lớn nhất rơi vào chỗ Bot bắt đầu tính nhiều nước hơn (cấp 6 → 7 là lúc độ sâu tìm kiếm tăng từ 2 lên 3).
- Cách dùng trước mắt: gán Elo nội bộ cho cấp `n` là `E1 + 125·(n − 1)` với `E1` là mốc neo tự chọn (ví dụ 600), rồi **đo lại với vài trăm ván mỗi cặp** trước khi công bố con số cho người chơi.
- Muốn biết cấp Bot tương ứng bao nhiêu Elo của người thật thì phải cho người chơi thật đấu với Bot, không suy ra được từ các ván giữa Bot với nhau.


**Lưu ý quan trọng:**
- Elo của Bot là **thang nội bộ**, không tương đương Elo FIDE hay Elo của người chơi online. Cần có một mốc neo (ví dụ cho Bot cấp 1 một giá trị tùy chọn) rồi cộng dồn chênh lệch đo được; muốn gắn với trình người thật thì phải cho người chơi thật đấu với Bot rồi hiệu chỉnh.
- Bot có nhiễu ngẫu nhiên ở các cấp thấp nên mức chênh đo được có sai số lớn; cần nhiều ván hơn (hàng trăm) để số liệu ổn định.
- Nên giữ `bot_rating` (offline, lưu cục bộ) **tách khỏi** rating PvP (online, nằm trên máy chủ).

### 1.4. Môi trường áp dụng tối ưu

| Môi trường | Vai trò |
|---|---|
| Online | **Chính.** Ghép trận chuẩn, bảng xếp hạng (nên kết hợp Glicko-2, mục 2) |
| Offline | **Phụ.** Cấp bậc Bot và thước đo tiến bộ cá nhân, không vào bảng xếp hạng chung |

### 1.5. Tác động đến tâm lý giữ chân

**Mặt tích cực:**
- Một con số dễ hiểu, dễ so sánh, tạo **mục tiêu rõ ràng** (qua mốc 1000, 1500, 2000) và bản sắc ("mình là người 1600").
- Ghép trận cân sức tạo cảm giác công bằng, ván nào cũng "đáng chơi".

**Mặt rủi ro:**
- **Né tránh thua lỗ (loss aversion):** mất điểm đau hơn được điểm, nên chuỗi thua dễ dẫn đến "tilt" rồi bỏ game.
- **Đến mức bão hòa (plateau):** hệ thống zero-sum khiến tăng hạng ngày càng chậm, người chơi giải trí dễ thấy bế tắc và rời đi.
- **Áp lực với người mới:** thấy mình ở dưới thấp ngay từ đầu gây ngại.

**Cách giảm rủi ro:**
- Chế độ giải trí **không xếp hạng** (đã có phòng riêng và Bot).
- Dùng **rating tạm** cho người mới (dấu `?` hoặc rating ẩn trong các ván đầu).
- **Mùa giải** kèm reset mềm (kéo rating về gần trung bình một phần) để người chơi có điểm khởi đầu mới.
- Các **bậc hạng** (Đồng/Bạc/Vàng...) chia con đường dài thành những bước nhỏ, cho nhiều khoảnh khắc "lên hạng".

### 1.6. Gợi ý tích hợp

```
ratings(user_id, pool, rating, games, updated_at)    -- pool: 'pvp_blitz', 'pvp_rapid', 'bot'...
games(game_id, white_id, black_id, result, ended_at)  -- máy chủ ghi, ghi một lần
```

Máy chủ hiện đã biết khi ván kết thúc (chiếu hết, hòa, đầu hàng) và đã gắn tài khoản với từng bên. Nơi thêm việc cập nhật rating là hàm ghi kết quả ván online (hiện chỉ cộng thống kê thắng/thua/hòa).

---

## 2. Hệ thống Glicko và Glicko-2

### 2.1. Vấn đề Glicko giải quyết: độ bất định

Elo coi mọi rating đều chắc chắn như nhau. Thực tế, rating của người mới hoặc người nghỉ lâu **kém tin cậy** hơn. Glicko thêm một đại lượng thứ hai: **RD (Rating Deviation - độ lệch xếp hạng)**, có thể hiểu là độ rộng của "vùng mờ" quanh rating. Người có rating 1500 và RD 50 gần như chắc chắn ở mức 1500; người có RD 350 chỉ là "đâu đó từ 800 đến 2200".

Quy ước mặc định (Glickman): rating khởi điểm 1500, RD khởi điểm 350 (RD tối đa).

### 2.2. Glicko (phiên bản 1)

Đặt `q = ln(10) / 400`. Với mỗi đối thủ `j` (rating `r_j`, độ lệch `RD_j`):

```
g(RD) = 1 / sqrt(1 + 3·q²·RD² / π²)
E(r, r_j, RD_j) = 1 / (1 + 10^(−g(RD_j)·(r − r_j) / 400))
d² = 1 / ( q² · Σ g(RD_j)² · E · (1 − E) )

r'  = r + q / (1/RD² + 1/d²) · Σ g(RD_j) · (s_j − E)
RD' = sqrt( 1 / (1/RD² + 1/d²) )
```

Hai điểm mấu chốt:
- `g(RD_j)` làm **nhỏ đi ảnh hưởng của đối thủ có rating bất định**: thắng một đối thủ chưa rõ trình ít giá trị hơn thắng đối thủ đã được xác lập.
- Biên độ thay đổi `q / (1/RD² + 1/d²)` **lớn khi RD của chính mình lớn**: người mới nhảy rating nhanh, người đã ổn định nhích chậm.

**RD tăng theo thời gian không chơi.** Trước mỗi kỳ cập nhật:

```
RD = min( sqrt(RD² + c²·t), 350 )
c  = sqrt( (350² − RD_thường²) / t_tối_đa )
```

Ví dụ: nếu một người có RD thường là 50 và muốn sau 100 kỳ nghỉ thì RD quay về 350, thì `c = 34,64`. Một kỳ nghỉ làm RD từ 50 lên 60,8; sau 30 kỳ là 196,2.

**Ví dụ (đã tính):** người chơi `r = 1500, RD = 200`, kỳ này có ba ván:

| Đối thủ | Rating | RD | Kết quả |
|---|---|---|---|
| 1 | 1400 | 30 | Thắng |
| 2 | 1550 | 100 | Thua |
| 3 | 1700 | 300 | Thua |

Kết quả: `r' = 1464,11`, `RD' = 151,40` (khớp ví dụ tham chiếu trong tài liệu của Glickman). Rating giảm nhẹ, RD giảm vì có thêm thông tin.

### 2.3. Glicko-2: thêm độ biến động σ

Glicko-2 thêm tham số **σ (volatility)**: mức độ rating của người chơi *dao động bất thường*. Người chơi có kỹ năng ổn định có σ nhỏ; người có phong độ thất thường hoặc đang tiến bộ rất nhanh có σ lớn, khiến RD tăng nhanh hơn sau mỗi kỳ.

Quy trình (rút gọn, `τ` là hằng số hệ thống, thường chọn trong khoảng 0,3 đến 1,2; `τ` nhỏ làm σ ít biến động hơn; σ khởi điểm thường là 0,06):

1. Đổi thang: `μ = (r − 1500) / 173,7178`, `φ = RD / 173,7178`.
2. Tính `v` (phương sai ước lượng từ kết quả các ván) và `Δ` (cải thiện ước lượng).
3. Giải phương trình để tìm `σ'` mới (thuật toán lặp kiểu Illinois).
4. Tính `φ* = sqrt(φ² + σ'²)` (tăng bất định theo thời gian).
5. Cập nhật `φ' = 1 / sqrt(1/φ*² + 1/v)` và `μ' = μ + φ'² · Σ g(φ_j)·(s_j − E)`.
6. Đổi ngược: `r' = 173,7178·μ' + 1500`, `RD' = 173,7178·φ'`.

**Mã tham khảo (JavaScript, đã chạy với ví dụ ở dưới):**

```js
function glicko2(rating, rd, sigma, games, tau = 0.5) {
  const S = 173.7178;
  const mu = (rating - 1500) / S, phi = rd / S;
  const g = (p) => 1 / Math.sqrt(1 + (3 * p * p) / (Math.PI * Math.PI));
  const E = (m, mj, pj) => 1 / (1 + Math.exp(-g(pj) * (m - mj)));
  const opp = games.map(([r, d, s]) => ({ mj: (r - 1500) / S, pj: d / S, s })); // [rating, rd, kết quả]

  let v = 0, delta = 0;
  for (const o of opp) {
    const e = E(mu, o.mj, o.pj);
    v += g(o.pj) ** 2 * e * (1 - e);
    delta += g(o.pj) * (o.s - e);
  }
  v = 1 / v;
  delta *= v;

  const a = Math.log(sigma * sigma);
  const f = (x) =>
    (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) / (2 * (phi * phi + v + Math.exp(x)) ** 2) -
    (x - a) / (tau * tau);
  let A = a, B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * tau) < 0) k++; B = a - k * tau; }
  let fA = f(A), fB = f(B);
  while (Math.abs(B - A) > 1e-6) {
    const C = A + ((A - B) * fA) / (fB - fA), fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const sigmaNew = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  let muNew = mu;
  for (const o of opp) muNew += phiNew * phiNew * g(o.pj) * (o.s - E(mu, o.mj, o.pj));
  return { rating: S * muNew + 1500, rd: S * phiNew, sigma: sigmaNew };
}
```

**Ví dụ (cùng ba ván ở mục 2.2, `τ = 0,5`):** `r' = 1464,05`, `RD' = 151,52`, `σ' = 0,0600`, khớp với ví dụ tham chiếu của Glickman (làm tròn khác nhau ở chữ số thập phân cuối).

**Người mới và người cũ cùng một ván (đã tính, cùng rating 1500):**

| Trường hợp | Trước ván | Sau ván |
|---|---|---|
| Người mới (RD 350) **thắng** người cũ (RD 50) | 1500 | **1675**, RD 248 |
| Người cũ (RD 50) **thua** người mới (RD 350) | 1500 | **1495**, RD 51 |

Người mới nhảy vọt vì hệ thống đang "học" về họ rất nhanh, còn người đã ổn định gần như không bị ảnh hưởng. Đây chính là điều Elo với K cố định làm không được.

### 2.4. Chu kỳ xếp hạng (rating period) trong game online

Glicko gốc thiết kế cho việc gom nhiều ván vào một kỳ. Game online thường **cập nhật sau từng ván** (coi mỗi ván là một kỳ) và **cộng RD theo thời gian đã trôi** khi người chơi quay lại:

```
n = số_đơn_vị_thời_gian_nghỉ        (ví dụ: mỗi ngày là một đơn vị)
phi = min( sqrt(phi² + n·sigma²), phi_khởi_điểm )
```

Khi người chơi có ván mới, áp dụng bước này rồi chạy `glicko2()`. Nhờ vậy người nghỉ lâu quay lại sẽ có RD lớn, rating hiệu chỉnh nhanh về đúng trình mà **không bị trừ điểm vì vắng mặt**.

### 2.5. Cách dùng RD trong sản phẩm

| Ứng dụng | Cách làm |
|---|---|
| Hiển thị | Gắn dấu `?` khi RD còn lớn (ngưỡng khoảng 110 là mốc thường dùng); hoặc hiển thị `1500 ± 2·RD` (khoảng tin cậy khoảng 95%) |
| Bảng xếp hạng | Chỉ xếp người có RD đủ nhỏ, hoặc xếp theo **cận dưới `r − 2·RD`** để một người mới may mắn thắng vài ván không thể vượt lên đầu bảng |
| Ghép trận | Mở rộng cửa sổ ghép theo RD; cho người RD lớn gặp đối thủ RD nhỏ để lấy thông tin nhanh |
| Người nghỉ lâu | RD tự tăng, rating không bị phạt |
| Bot offline | Bot cố định nên coi RD của Bot nhỏ; chỉ người chơi được cập nhật |

### 2.6. So sánh nhanh

| Tiêu chí | Elo | Glicko | Glicko-2 |
|---|---|---|---|
| Đại lượng theo dõi | Rating | Rating, RD | Rating, RD, σ |
| Xử lý người mới | Cần K lớn thủ công | Tự động qua RD | Tự động qua RD |
| Xử lý người nghỉ lâu | Không | Có (RD tăng) | Có (RD tăng, phụ thuộc σ) |
| Độ phức tạp cài đặt | Rất thấp | Thấp | Trung bình (cần giải phương trình lặp) |
| Phù hợp | Nguyên mẫu, Bot offline | Online cơ bản | **Online chính thức** |

Khuyến nghị: dùng **Glicko-2 cho PvP online**, **Elo một phía cho cấp bậc Bot offline** (đơn giản, đủ dùng vì Bot cố định).

### 2.7. Tác động đến tâm lý giữ chân

- **Người mới:** rating biến động mạnh trong những ván đầu (như ví dụ nhảy 175 điểm) tạo cảm giác tiến bộ nhanh, và hệ thống tìm ra đúng trình sớm hơn nên ít ván bị "đè bẹp" hay quá dễ. Ván đầu tiên có chất lượng tốt là yếu tố giữ chân quan trọng nhất.
- **Người quay lại sau thời gian dài:** "không bị phạt vì vắng mặt" tạo cảm giác được chào đón. Có thể kèm thông điệp "đang hiệu chỉnh lại trình độ của bạn".
- **Người chơi dày dạn:** rating ổn định, phản ánh đúng thực lực, giúp tin vào bảng xếp hạng.
- **Rủi ro:** biến động lớn có thể khiến người mới cảm giác "số liệu ngẫu nhiên". Giải thích minh bạch (hiển thị dấu `?` hoặc `±`) giúp giảm hiểu nhầm. Hệ thống phức tạp hơn nên khó giải thích cho người chơi giải trí: chỉ hiển thị một con số, giấu RD và σ trừ khi người dùng mở chi tiết.

### 2.8. Gợi ý tích hợp

Thêm các cột vào bảng rating: `rd`, `volatility`, `last_played_at`. Hàm `glicko2()` ở trên dùng được ngay trên máy chủ Node mà không cần thư viện ngoài.

---

## 3. Hệ thống Điểm kinh nghiệm (EXP) và Cấp độ

### 3.1. Cơ chế: điểm tích lũy, không bao giờ giảm

EXP đo **mức độ gắn bó**, không đo kỹ năng. Mỗi hành động có ích cho game (hoàn thành ván, giải bài, làm nhiệm vụ) cộng EXP; EXP chỉ tăng, nên cấp độ không bao giờ rớt.

**Đường cong cấp độ.** Cần `need(L)` EXP để lên từ cấp `L` lên `L+1`:

```
need(L) = a · L^p        (làm tròn)
EXP_tích_lũy_để_đạt_cấp_L = Σ need(k), k = 1..L−1
```

Tham số `p` quyết định "độ dốc". Với 150 EXP mỗi ngày (ví dụ 3 ván thắng và một nhiệm vụ ngày), đã tính:

| Đường cong | Cấp 10 | Cấp 30 | Cấp 50 |
|---|---|---|---|
| `100·L^1,5` (dốc) | ~74 ngày | ~1.260 ngày | ~4.600 ngày |
| `100·L^0,9` (**khuyến nghị**) | ~25 ngày | ~218 ngày | ~582 ngày |
| `100·L^1,0` (tuyến tính) | ~30 ngày | ~290 ngày | ~817 ngày |

Đường cong dốc quá khiến cấp cao thành "không thể đạt", người chơi nản. Với khuyến nghị `a = 100, p = 0,9`: cấp 10 cần tích lũy 3.780 EXP, cấp 30 cần 32.640, cấp 50 cần 87.285. Mục tiêu thiết kế: **người chơi đều đặn lên cấp 10 trong vài tuần, cấp 30 trong khoảng nửa năm.** Nên đặt trần cấp (ví dụ 50), sau đó chuyển sang các "bậc sao" hoặc danh hiệu thay vì cấp mới.

```js
const need = (level) => Math.round(100 * level ** 0.9);

// Cấp độ từ tổng EXP: đi lần lượt (cấp tối đa nhỏ nên rẻ) hoặc dùng bảng tính sẵn.
function levelFromXp(xp, maxLevel = 50) {
  let level = 1, remaining = xp;
  while (level < maxLevel && remaining >= need(level)) remaining -= need(level++);
  return { level, intoLevel: remaining, toNext: level < maxLevel ? need(level) - remaining : 0 };
}
```

**Nguồn EXP đề xuất (điểm khởi đầu để cân chỉnh):**

| Hành động | EXP | Ghi chú |
|---|---|---|
| Hoàn thành một ván online | 20 | Không tính ván bỏ giữa chừng |
| Thắng (cộng thêm) / hòa | +20 / +10 | |
| Hoàn thành một ván với Bot | 10 × hệ số cấp Bot | Hệ số `0,3 + 0,7·cấp/12`: chơi Bot cấp 1 chỉ được khoảng 3 EXP, chống cày Bot dễ |
| Giải một bài puzzle | 5 | Có trần mỗi ngày |
| Nhiệm vụ ngày | 50 | Ví dụ "thắng 1 ván", "giải 5 bài" |
| Chuỗi ngày chơi liên tiếp | +10 × min(số ngày, 7) | Thưởng thói quen có trần |
| Ván thắng đầu tiên trong ngày | ×2 | Kéo người chơi quay lại mỗi ngày |
| Mở thành tựu | Theo thành tựu | Liên kết mục 5 |

**Chống lạm dụng:**
- Không cho EXP với ván quá ngắn (dưới khoảng 6 nước), ván đầu hàng ngay, hoặc bỏ cuộc.
- **Trần EXP mỗi ngày** cho nguồn dễ cày (ví dụ Bot tối đa 300 EXP/ngày); sau trần thì giảm dần chứ không cắt đột ngột.
- Online: máy chủ quyết định và ghi nhận. Offline: EXP do client tự cộng, chấp nhận rủi ro người dùng tự sửa vì không ảnh hưởng xếp hạng; khi đồng bộ lên máy chủ thì giới hạn mức nhận mỗi ngày.

**Phần thưởng mở khóa** (nên là phần **thẩm mỹ và tiện ích nhỏ**, không chặn tính năng cốt lõi như chơi Bot cấp cao). Ví dụ gắn với giao diện đã có của dự án:

| Cấp | Phần thưởng |
|---|---|
| 2 | Bàn cờ Xanh lá |
| 3 | Bộ quân Hiện đại |
| 5 | Bàn cờ Xanh dương, khung ảnh đại diện |
| 8 | Bàn cờ Đá cẩm thạch |
| 10 | Bàn cờ Ban đêm, danh hiệu "Kỳ thủ" |
| 15 | Hiệu ứng chiếu hết đặc biệt |
| 20 trở lên | Danh hiệu, khung, hiệu ứng 3D tùy chọn |

### 3.2. Môi trường áp dụng tối ưu

**Cả online và offline**, vai trò khác nhau: EXP là **"đồng tiền chung"** liên kết mọi chế độ. Đặc biệt giá trị với **chế độ offline và người chơi giải trí**, vì không bị áp lực xếp hạng và không phụ thuộc có đối thủ hay không.

### 3.3. Tác động đến tâm lý giữ chân

**Cơ chế tâm lý chính (nguyên lý thiết kế chung, cần kiểm nghiệm bằng dữ liệu thật):**
- **Cảm giác năng lực (competence):** luôn có một thanh tiến độ đang nhích về phía trước, kể cả khi thua. Đây là lý do EXP giữ chân người chơi giải trí tốt hơn xếp hạng thuần túy.
- **Hiệu ứng gần đích (goal gradient):** càng gần mốc lên cấp càng muốn chơi thêm một ván ("còn 40 EXP nữa").
- **Phần thưởng có thời điểm bất ngờ:** mở khóa theo mốc cấp tạo khoảnh khắc ăn mừng.
- **Thói quen hằng ngày:** chuỗi ngày chơi và nhiệm vụ ngày tạo lý do mở game mỗi ngày.
- **Tự chủ:** người chơi tự chọn đường kiếm EXP (online, Bot, puzzle).

**Rủi ro:**
- **Cày vô nghĩa:** EXP quá dễ khiến người chơi "chơi để lấy điểm" chứ không vì thích cờ.
- **Thiết kế thao túng:** chuỗi ngày bị phạt nặng khi đứt, thông báo gây áp lực (FOMO). Dùng **"đóng băng chuỗi" (streak freeze)** hoặc chuỗi mềm (tính theo tuần), và không phạt khi nghỉ.
- **Phần thưởng ngoài lấn át động lực nội tại** (overjustification effect): nếu quá nhiều thưởng gắn với việc chơi, người chơi có thể ngừng chơi khi hết thưởng.

### 3.4. Gợi ý tích hợp

```
profiles(user_id, xp_total, daily_xp_date, daily_xp_by_source JSON, streak_days, last_active_date)
xp_events(event_id UNIQUE, user_id, source, amount, created_at)   -- event_id chống cộng trùng
```

Máy chủ đã có điểm "ván online kết thúc" để cộng EXP; phía offline cộng cục bộ rồi đồng bộ khi có mạng (gửi tổng hợp theo ngày, máy chủ áp trần).

---

## 4. Điểm giải đấu: thể thức Thụy Sĩ (Swiss) và Arena

### 4.1. Swiss

**Mục tiêu:** xác định người xếp trên trong một giải với số vòng cố định, **mọi người chơi hết các vòng** (không loại trực tiếp) và mỗi vòng gặp đối thủ có thành tích gần nhau.

**Chấm điểm:** thắng 1, hòa 0,5, thua 0. **Số vòng tối thiểu** để có thể phân định người thắng duy nhất: `R ≥ ⌈log₂ N⌉`. Đã tính:

| Số người (N) | 8 | 16 | 32 | 64 | 100 | 200 |
|---|---|---|---|---|---|---|
| Số vòng tối thiểu | 3 | 4 | 5 | 6 | 7 | 8 |

**Ghép cặp mỗi vòng (nguyên tắc của hệ Dutch, mã giả, chưa chạy thử):**

```
1. Sắp xếp người chơi theo (điểm giảm dần, rating giảm dần).
2. Chia thành các nhóm cùng điểm.
3. Trong mỗi nhóm: nửa trên ghép với nửa dưới (hạng 1 gặp hạng k/2+1, ...).
4. Ràng buộc bắt buộc: không gặp lại người đã gặp; chênh lệch số ván cầm Trắng và Đen không quá 2.
5. Nếu nhóm lẻ người: đẩy một người xuống nhóm điểm thấp hơn (floater).
6. Nếu không ghép được: quay lui (backtracking) và thử cách chia khác.
7. Số người lẻ: người xếp thấp nhất chưa từng nghỉ được "bye" (được 1 điểm, mỗi người tối đa một lần).
```

**Tie-break (khi bằng điểm)**, phổ biến nhất:

| Tiêu chí | Công thức | Ý nghĩa |
|---|---|---|
| Buchholz | Tổng điểm của tất cả đối thủ đã gặp | Đối thủ mạnh thì bạn xếp trên |
| Buchholz cắt 1 | Buchholz bỏ điểm đối thủ thấp nhất | Giảm ảnh hưởng một đối thủ bỏ giải |
| Sonneborn-Berger | Tổng điểm đối thủ bạn thắng + một nửa điểm đối thủ bạn hòa | Thưởng chiến thắng trước người mạnh |
| Tiến triển (progressive) | Tổng điểm tích lũy sau từng vòng | Thưởng người khởi đầu tốt |
| Đối đầu trực tiếp | Kết quả giữa những người bằng điểm | Công bằng khi chỉ vài người bằng |

```js
// Buchholz: results là mảng ván của một người: { opponentId, score } ; scoreOf(id) là điểm hiện tại của đối thủ
const buchholz = (results, scoreOf) => results.reduce((sum, r) => sum + scoreOf(r.opponentId), 0);
```

**Performance rating (tùy chọn):** `TPR = rating_trung_bình_đối_thủ + dp(p)` với `p` là tỷ lệ điểm; `dp` suy ra từ công thức Elo (đã tính: `p = 75%` ứng với `+191`, `p = 70%` ứng với `+147`).

**Quan hệ với Elo/Glicko:** ván giải đấu vẫn có thể cập nhật rating PvP (tùy chính sách), còn **điểm giải đấu là một thang riêng, bắt đầu từ 0 mỗi giải**.

### 4.2. Arena (chuỗi thắng liên tiếp)

**Cách hoạt động:** giải chạy trong **một khoảng thời gian cố định** (ví dụ 60 phút). Người chơi **vào và ra tự do**; khi rảnh thì được ghép ngay với người rảnh gần điểm nhất (ghép liên tục, không có "vòng"). Xếp hạng theo tổng điểm khi hết giờ.

**Chấm điểm (mô hình phổ biến, như ở một số nền tảng cờ trực tuyến):**
- Thắng 2, hòa 1, thua 0.
- **Chuỗi thắng:** sau **2 ván thắng liên tiếp**, các ván tiếp theo **tính gấp đôi** (thắng 4, hòa 2) cho đến khi bạn không thắng một ván.
- Tùy chọn **Berserk:** tự giảm một nửa thời gian để đổi lấy +1 điểm nếu thắng.
- **Chống thông đồng:** ván hòa quá ngắn (dưới khoảng 10 nước) không được điểm; không ghép lại cùng một đối thủ liên tiếp nhiều lần.

Các thông số cụ thể (ngưỡng nước đi, điều kiện Berserk) nên tự chốt và thử nghiệm, vì chúng ảnh hưởng đến cân bằng.

**Ví dụ (đã tính bằng mã):**

| Chuỗi kết quả | Điểm từng ván | Tổng |
|---|---|---|
| W W W D L W W W W | 2, 2, 4, 2, 0, 2, 2, 4, 4 | **22** |
| W D W D W D W D W (không có chuỗi thắng) | 2, 1, 2, 1, 2, 1, 2, 1, 2 | **14** |
| W ×9 (thắng liền) | 2, 2, 4, 4, 4, 4, 4, 4, 4 | **32** |

Chuỗi thắng làm điểm tăng gần gấp đôi so với không có luật nhân đôi (32 so với 18 khi thắng liền 9 ván), nên chuỗi thắng có sức hút lớn; hòa hoặc thua sẽ cắt chuỗi.

```js
function arenaPoints(results /* mảng 'W' | 'D' | 'L' */, berserkWinIndexes = []) {
  let streak = 0, total = 0;
  const points = results.map((result, i) => {
    let p = result === 'W' ? 2 : result === 'D' ? 1 : 0;
    if (streak >= 2 && result !== 'L') p *= 2;
    if (result === 'W' && berserkWinIndexes.includes(i)) p += 1;
    streak = result === 'W' ? streak + 1 : 0;
    total += p;
    return p;
  });
  return { points, total };
}
```

### 4.3. So sánh Swiss và Arena

| Tiêu chí | Swiss | Arena |
|---|---|---|
| Thời lượng | Theo số vòng (có thể kéo dài nhiều giờ) | Cố định, vào ra tự do |
| Công bằng | Rất cao (ai cũng chơi đủ vòng, gặp đối thủ gần trình) | Thấp hơn (ai chơi nhiều ván hơn có lợi thế) |
| Cam kết người chơi | Cao (phải có mặt đủ các vòng) | Thấp |
| Độ phức tạp kỹ thuật | Cao (ghép vòng, đồng bộ, xử lý vắng mặt) | Trung bình (ghép liên tục theo hàng chờ) |
| Cảm xúc | Căng thẳng ổn định | Hưng phấn theo chuỗi thắng |

### 4.4. Môi trường áp dụng tối ưu

- **Online:** chủ yếu, vì cần nhiều người cùng lúc. Arena cần đủ người trong hàng chờ để ghép nhanh; Swiss cần lobby, đồng hồ, xử lý vắng mặt (xử thua sau một khoảng chờ).
- **Offline:** có thể làm **"giải đấu với Bot"** cục bộ (ví dụ 5 vòng Swiss gặp các cấp Bot tăng dần, hoặc vòng tròn với một nhóm Bot). Điểm giải đấu này chỉ lưu cục bộ, không vào bảng xếp hạng online.

### 4.5. Tác động đến tâm lý giữ chân

- **Sự kiện có thời hạn** tạo khoảnh khắc và thói quen định kỳ (giải 20:00 mỗi tối, giải cuối tuần): người chơi có lý do quay lại đúng giờ.
- **Chuỗi thắng của Arena** tạo trạng thái "đang nóng" (momentum) rất hưng phấn; giao diện nên thể hiện (hiệu ứng chuỗi) để tăng cảm giác.
- **Cạnh tranh xã hội và bảng xếp hạng theo giải** cho nhiều cơ hội "thắng" hơn một bảng xếp hạng toàn thời gian: ai cũng có thể đứng đầu một giải.
- **Rủi ro:** áp lực thời gian, kiệt sức (burnout) khi cố leo bảng, người yếu bị "vùi" bởi người mạnh, ván hòa bị lợi dụng. Giải pháp: **chia giải theo nhóm rating** (ví dụ "dưới 1200"), **thưởng tham dự** (EXP, mục 3), điểm giải đấu quy đổi thành **điểm mùa giải** cộng dồn thay vì chỉ ai đứng đầu mới có thưởng.

### 4.6. Gợi ý tích hợp

```
tournaments(id, type 'swiss'|'arena', starts_at, rounds_or_duration, time_control, status)
tournament_players(tournament_id, user_id, score, tiebreaks JSON, withdrawn)
pairings(tournament_id, round, white_id, black_id, result)
season_points(user_id, season_id, points)    -- Σ điểm giải đấu × trọng số
```

Cơ chế phòng hai người (WebSocket) hiện có dùng lại được cho từng ván trong giải: giải đấu chỉ cần thêm lớp **lobby, ghép cặp, tính điểm** bên trên.

---

## 5. Điểm thành tựu (Achievements) và Giải đố (Puzzle Rating)

### 5.1. Puzzle Rating

**Ý tưởng:** coi mỗi bài tập là một "đối thủ" có rating. Người giải đúng ngay lần đầu coi như **thắng** (`S = 1`), sai hoặc xem gợi ý coi như **thua** (`S = 0`). Rating người giải được cập nhật bằng Elo (hoặc Glicko-2 nếu muốn có RD cho cả người và bài).

**Ví dụ (đã tính):** người 1500 gặp bài 1700, `K = 24`: giải đúng **+18,2**, giải sai **−5,8**. Giải được bài khó thì thưởng nhiều, sai bài dễ thì phạt nhiều.

**Rating của bài cũng được cập nhật** (cộng hưởng ngược lại): bài mà nhiều người giỏi sai thì rating bài tăng, nên rating bài hội tụ theo độ khó thực tế thay vì độ khó "nhìn bằng mắt".
- **Online:** cập nhật cả người và bài trên máy chủ.
- **Offline ("giải thế cờ"):** bài có rating cố định lấy từ bộ dữ liệu, chỉ cập nhật người; lưu cục bộ.

**Chọn bài theo "vùng dòng chảy" (flow).** Mục tiêu thường chọn là người giải đúng khoảng 60 đến 75% số bài: đủ thử thách mà không nản. Từ tỷ lệ này suy ra rating bài nên chọn thấp hơn rating người giải (đã tính):

| Tỷ lệ đúng mong muốn | Rating bài nên thấp hơn người giải |
|---|---|
| 60% | ~70 điểm |
| 65% | ~108 điểm |
| 70% | ~147 điểm |
| 75% | ~191 điểm |
| 80% | ~241 điểm |

**Kiểm tra bài giải đúng.** Chuỗi nước của lời giải cần khớp với từng nước của bộ dữ liệu; riêng các thế chiếu hết có thể có nhiều lời giải cùng chiếu hết trong một nước, nên dùng engine cờ của dự án (`legalMoves`, `Game.status()`) để chấp nhận mọi nước chiếu hết hợp lệ thay vì khớp chuỗi cứng.

**Nguồn bài tập:** tự biên soạn, hoặc dùng bộ dữ liệu puzzle mở (ví dụ cơ sở dữ liệu puzzle của Lichess, công bố theo giấy phép CC0 tại thời điểm viết; cần kiểm tra lại điều khoản trước khi dùng). Định dạng gợi ý: FEN của thế cờ ban đầu, chuỗi nước giải (dạng UCI), rating, danh sách chủ đề.

**Mở rộng:** rating theo chủ đề (ghim, nĩa, chiếu hết trong 2 nước...) để vẽ **biểu đồ kỹ năng chiến thuật**, cho thấy điểm mạnh yếu; chế độ chuỗi (đúng liên tiếp đến khi sai) và đua thời gian dùng điểm riêng (điểm cao nhất), không trộn vào Puzzle Rating.

### 5.2. Điểm thành tựu (Achievements)

**Cấu trúc:**
- **Loại:** đếm số lần (thắng 100 ván), cột mốc (đạt rating 1500), chuỗi (thắng 5 ván liền), sưu tầm (thử cả 5 bàn cờ), ẩn (bất ngờ), theo mùa.
- **Bậc:** Đồng, Bạc, Vàng, Bạch kim (các bậc cùng một thành tựu có ngưỡng tăng dần).
- **Điểm thành tựu:** mỗi thành tựu có điểm theo độ khó/độ hiếm (ví dụ 10/25/50/100), cộng dồn thành một tổng **không bao giờ giảm**.
- **Huy hiệu mốc đặc biệt:** gắn với các thang khác (rating PvP đạt 1500, Puzzle Rating đạt 2000, cấp độ 30, vô địch một giải).

**Ví dụ thành tựu bám sát tính năng đang có:**

| Thành tựu | Điều kiện | Dữ liệu từ đâu |
|---|---|---|
| Nhập thành | Nhập thành lần đầu | `move.castle` |
| Bắt tốt qua đường | Dùng en passant | `move.ep` |
| Phong cấp bằng Mã | Phong cấp thành Mã (underpromotion) | `move.promo === 'N'` |
| Chiếu hết bằng Mã | Kết thúc ván bằng nước Mã | SAN bắt đầu bằng `N` và có `#` |
| Hạ Bot cấp 12 | Thắng Bot cấp 12 | Kết quả ván Bot |
| Thắng không mất quân | Thắng mà không bị ăn quân nào | `move.captured` theo bên |
| Ván cờ ngắn | Chiếu hết trong 20 nước | Số nước của ván |
| Chiến thắng ngược dòng | Thắng sau khi kém từ 5 điểm quân trở lên | Giá trị quân từ lịch sử nước đi |
| Nhà sưu tầm | Thử đủ các bàn cờ | Thiết lập giao diện |
| Người chơi ba chiều | Chơi một ván ở chế độ 3D | Thiết lập giao diện |
| Chuỗi 7 ngày | Chơi 7 ngày liên tiếp | Hồ sơ hoạt động |
| Giải đố 100 | Giải 100 bài puzzle | Sự kiện puzzle |

Engine hiện đã lưu cho mỗi nước đi các trường `castle`, `ep`, `promo`, `captured`, `san`, nên nhiều thành tựu cờ chỉ cần đọc lịch sử nước đi của ván vừa kết thúc.

**Kiến trúc đề xuất (event-driven):**

```
Sự kiện: game_finished, move_made, puzzle_solved, rating_changed, daily_login...
   → bộ đánh giá thành tựu: so với điều kiện khai báo (JSON) của từng thành tựu
   → cập nhật user_achievements(progress, unlocked_at) — idempotent, mở khóa một lần
   → phát sự kiện "achievement_unlocked" để hiện thông báo, cộng EXP (mục 3)
achievements(id, category, tier, points, hidden, criteria JSON)
user_achievements(user_id, achievement_id, progress, unlocked_at)
```

- **Online:** máy chủ đánh giá (có lịch sử ván) nên đáng tin.
- **Offline:** đánh giá cục bộ, đồng bộ khi có mạng bằng cách **hợp nhất**: tiến độ lấy giá trị lớn hơn, thời điểm mở khóa lấy sớm hơn. Thành tựu liên quan xếp hạng online nên là **"chỉ online"** để tránh gian lận.

### 5.3. Môi trường áp dụng tối ưu

| Hệ thống | Online | Offline |
|---|---|---|
| Puzzle Rating | Cập nhật cả người và bài, có bảng xếp hạng bài tập | Giải thế cờ cục bộ, rating bài cố định |
| Thành tựu | Máy chủ đánh giá, huy hiệu hiển thị cho người khác | Đánh giá cục bộ, đồng bộ sau |

Cả hai **phù hợp cho cả online và offline**, và là cầu nối giúp người chơi offline vẫn có cảm giác tiến bộ.

### 5.4. Tác động đến tâm lý giữ chân

**Puzzle Rating:**
- Là thước đo **tiến bộ cá nhân không cần đối thủ**, nên không có áp lực thắng thua xã hội, phù hợp người ngại đối đầu hoặc muốn luyện tập.
- Người chơi **thấy mình giỏi lên** khi rating tăng đều, và biết cụ thể mình yếu chủ đề nào (biểu đồ kỹ năng).
- Chọn bài đúng vùng dòng chảy giúp đạt trạng thái "đắm chìm" (flow) mà không chán hoặc nản.
- Bài tập hằng ngày (một bài mỗi ngày) tạo thói quen nhẹ nhàng.

**Thành tựu:**
- **Tâm lý sưu tầm và hoàn thành (completionism):** danh sách có ô trống thôi thúc lấp đầy.
- **Hiệu ứng gần đích:** thanh tiến độ "7/10 thành tựu nhóm" thôi thúc hoàn tất.
- **Độ hiếm hiển thị** (ví dụ "chỉ 3% người chơi đạt được") tạo niềm tự hào và nội dung để khoe.
- **Thành tựu ẩn** mang lại bất ngờ tích cực khi mở.
- **Mốc ăn mừng:** huy hiệu tại các mốc rating là khoảnh khắc đáng nhớ nên đi kèm hiệu ứng.

**Rủi ro:**
- **Thưởng ngoài làm giảm hứng thú nội tại** (overjustification): nếu thành tựu ép chơi theo cách nhàm chán (ví dụ cày 500 ván Bot cấp 1), người chơi sẽ chơi vì huy hiệu chứ không vì cờ.
- **Thành tựu bỏ lỡ không làm lại được** (missable) gây bực bội, nên tránh hoặc cho cơ hội thứ hai.
- **Quá nhiều thành tựu nhỏ** làm mất giá trị của chúng; ưu tiên ít mà có ý nghĩa, mỗi thành tựu gắn với một kỹ năng hay một khoảnh khắc đáng nhớ.

---

## Tóm tắt 5 hệ thống

- **Elo:** `R' = R + K·(S − E)` với `E = 1/(1+10^((R_B−R_A)/400))`, hệ zero-sum, chênh 400 điểm tương ứng xác suất thắng ~91%. Dùng cho **ghép trận online** (chính) và **cấp bậc Bot offline** (Elo cố định cho từng cấp Bot, chỉ cập nhật người chơi, hiệu chuẩn bằng đối đầu giữa các cấp). Điểm yếu: không có độ bất định, dễ lạm phát, thao túng. Tâm lý: mục tiêu rõ ràng nhưng mất điểm gây "tilt" và bão hòa; giảm bằng rating tạm, mùa giải, bậc hạng và chế độ không xếp hạng.
- **Glicko / Glicko-2:** thêm **RD** (độ bất định, mặc định 350, tăng khi nghỉ chơi) và ở Glicko-2 thêm **σ** (độ biến động). Người mới hội tụ rất nhanh (ví dụ nhảy 1500 lên 1675), người đã ổn định gần như không đổi, người nghỉ lâu quay lại không bị trừ điểm. Dùng cho **PvP online chính thức**; bảng xếp hạng nên xếp theo cận dưới `r − 2·RD`. Tâm lý: onboarding tốt cho người mới, chào đón người quay lại; rủi ro là phức tạp, nên chỉ hiển thị một con số kèm dấu `?`.
- **EXP và Cấp độ:** điểm **tích lũy, không rớt**, đo mức gắn bó chứ không đo kỹ năng; cấp theo `need(L) = 100·L^0,9` (cấp 10 sau ~25 ngày, cấp 30 sau ~7 tháng ở 150 EXP/ngày). Dùng **cho cả online và offline**, mở khóa phần thưởng thẩm mỹ (bàn cờ, bộ quân, danh hiệu). Tâm lý: cảm giác tiến bộ liên tục, thói quen hằng ngày; cần chống cày (trần ngày, hệ số theo cấp Bot) và tránh thiết kế thao túng (có streak freeze, không phạt).
- **Điểm giải đấu:** **Swiss** (thắng 1/hòa 0,5/thua 0, số vòng ≥ ⌈log₂N⌉, ghép theo nhóm điểm, tie-break Buchholz/Sonneborn-Berger) công bằng nhưng cần cam kết; **Arena** (2/1/0, thắng liên tiếp 2 ván thì tính gấp đôi, thời lượng cố định, vào ra tự do) hưng phấn nhưng thiên về người chơi nhiều. Chủ yếu **online** (offline chỉ giải đấu với Bot cục bộ); điểm giải đấu là thang riêng, reset mỗi giải, cộng vào điểm mùa giải. Tâm lý: sự kiện định kỳ tạo thói quen và khoảnh khắc đỉnh; cần chia giải theo nhóm rating và thưởng tham dự để người yếu không nản.
- **Thành tựu và Puzzle Rating:** **Puzzle Rating** coi bài tập là đối thủ có rating (đúng = thắng, sai = thua), chọn bài thấp hơn người giải ~100 đến 150 điểm để đạt tỷ lệ đúng 65 đến 70%; đo kỹ năng chiến thuật không cần đối thủ. **Thành tựu** (đếm, mốc, chuỗi, sưu tầm, ẩn; bậc Đồng đến Bạch kim; điểm cộng dồn, không giảm) hoạt động theo sự kiện, đánh giá phía máy chủ khi online và hợp nhất khi đồng bộ offline. Dùng cho **cả hai môi trường**; tâm lý: tiến bộ cá nhân ít áp lực, tính sưu tầm và hiệu ứng gần đích; tránh thành tựu ép cày làm mất động lực nội tại.
