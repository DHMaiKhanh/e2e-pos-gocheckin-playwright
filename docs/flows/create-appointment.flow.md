# Luồng: Tạo Appointment (Go Booking) — GoCheckin POS

> File này ghi lại chi tiết luồng nghiệp vụ đã **quét bằng Playwright MCP** trên
> app thật, để làm nguồn (context) cho AI sinh code test. Cùng bộ với
> [login.flow.md](login.flow.md). Mỗi khi đi một luồng mới, tạo thêm một file
> `docs/flows/<tên-luồng>.flow.md` theo đúng mẫu này.

| Thông tin | Giá trị |
| --- | --- |
| Ngày quét | 2026-07-02 |
| URL POS | `https://pos.gocheckin.net/mini-app/app_code` |
| App con | **Go Booking** — iframe `https://go-booking.gocheckin.net/` (cross-origin) |
| Page title | `GoPos` |
| Framework FE | POS: Vue 3; Go Booking: Vue 3 + **FullCalendar** (timegrid theo cột nhân viên) |
| Tài khoản quét | ID cửa hàng `100004` (Fastboy Nails / "Nail Salon Demo") · user `admin` · pass `123456` · passcode `8888` |
| Người/công cụ quét | Playwright MCP (`browser_navigate`, `browser_run_code_unsafe` + `frameLocator`, `browser_take_screenshot`) |
| Đã tạo thật để verify | Appointment `#755` — Kevin V · Deluxe pedicure with gel · 10:15 AM · Hugo · Requested+Highlight (ngày Jul 2, 2026) |

> ### ⚠️ Quy ước ngày quét (áp dụng mọi lần quét flow này)
> **Luôn quét ngày = (ngày "Today" của app) − 1 ngày.** Tại thời điểm quét, app hiển thị
> "Today" = *Wed, Jul 1, 2026* → ngày quét chuẩn là **Tue, Jun 30, 2026**. Điều hướng về
> ngày trước bằng nút **`<`** cạnh cụm ngày (hoặc bấm `Today` rồi `<` một lần).
> Ngày hôm qua thường **đầy lịch thật** nên tốt cho test đọc/hiển thị/lọc (xem mục 11).
> Trường "Ngày quét" trong bảng trên là ngày thực chạy script (`2026-07-02`).

---

## 1. Tóm tắt luồng

Tạo appointment nằm trong **mini-app Go Booking**, sau nhiều cổng đăng nhập/passcode:

```
/login (ID cửa hàng 100004)
  └─ /login/confirm (Username=admin / Password=123456) → FULL POS /check-out
       └─ menu Apps (lưới góc trái) → "Go Booking"
            └─ numpad "Enter Passcode" 8888 → OK           (passcode #1, trong POS)
                 └─ /mini-app/app_code + iframe go-booking
                      └─ modal "Passcode" 8888 → Accept     (passcode #2, trong iframe)
                           └─ Lịch Go Booking (Day view)
                                ├─ (A) nút "New +" → chọn "New Appointment"
                                └─ (B) CLICK Ô TRẮNG TRƠN trên lưới → popup pre-fill giờ+staff
                                     └─ New Appointment: chọn/tạo khách → Service → Book
                                          └─ block CONFIRMED trên lịch
                                               └─ click block → passcode 8888 (xem SĐT)
                                                    → sửa cờ (Requested/Highlight...) → Save
                                                         → "Send message?" (Don't Send / Send)
```

---

## 2. Cổng truy cập (các lớp passcode) — QUAN TRỌNG

- **Passcode #1:** numpad trong POS ("Enter Passcode"), phím theo `numpadid`
  (đã map ở [login.flow.md](login.flow.md#2-element-thật)), bấm **OK**. Nhập `8888`.
- **Passcode #2:** modal trong **iframe** go-booking,
  `input[placeholder="Passcode"]` (type=password) + nút **Accept**. Nhập `8888`.
- **Passcode #3 (khi mở/sửa 1 appointment):** modal "Passcode" —
  *Apply to features: View customer phone number*. Nhập `8888` + **Accept** mới
  vào được màn chi tiết/sửa.
- Cả 3 đều có tùy chọn giữ phiên **"Remember in 30mins" / "accessed within 30 minutes"**.

> **Lưu ý test:** Go Booking là **iframe cross-origin** → phải thao tác qua
> `page.frameLocator('iframe[src*="go-booking"]')` (Playwright xuyên iframe được)
> hoặc `page.frames().find(f => f.url().includes('go-booking'))` để `evaluate`.
> `page.evaluate` ở frame cha **KHÔNG** chạm được DOM của iframe.

---

## 3. Màn lịch Go Booking (element thật)

- **Header:** `Staff (All)`, `Status (3)`, cụm ngày `< Today [📅] Wed, Jul 1, 2026 >`,
  nút **`New ⊕`**, `View by Day ▾`, ⚙ (settings).
- **Thanh tóm tắt:** `x Confirmed / x Schedules / x Done / x Checkin / x Total`.
- **Lưới FullCalendar:** cột đầu là mốc giờ (12:00 AM … theo 15'); mỗi cột là 1 nhân viên.
  - Ô bookable = `div.slot-cell` trong `td.fc-timegrid-slot-lane` (nền **trắng/xanh nhạt**).
  - **Vùng gạch chéo (sọc) = ngoài giờ làm / không nhận** → click vào KHÔNG mở popup.

### 3.1. Danh sách staff (quét bằng MCP từ cột day-view) — có thể chọn BẤT KỲ

| # | Staff (cột lịch) | Ghi chú |
| --- | --- | --- |
| 0 | `Unassigned` | Cột ảo — click ô không pre-fill staff thật → chỉ ra **draft**, KHÔNG confirmed. Đừng dùng để tạo. |
| 1 | `Hugo` | |
| 2 | `Linda` | |
| 3 | `Annie` | |
| 4 | `Vincent` | |
| 5 | `Ryan` | |
| 6 | `Val` | |
| 7 | `Evon` | |
| 8 | `Bob` | |
| 9 | `Mai` | |
| 10 | `Tony` | |
| 11 | `Wendy` | |
| 12 | `Jackie` | |
| 13 | `Andy` | |

> Đã lưu vào `src/data/static/booking.ts` → hằng **`STAFF`** (13 staff, không gồm Unassigned).
> Test/`DEFAULT_APPOINTMENT.staff` chọn **1 staff bất kỳ** trong danh sách này (mặc định `Linda`,
> cố ý KHÔNG phải Hugo để chứng minh chọn được staff khác).
> Header của staff đã có lịch sẽ hiện kèm **badge số** (vd `Hugo 1`) → khi tìm cột phải match theo **prefix tên**.
- Nút cuộn giờ **▲▼**; nút **+** nổi góc dưới phải (tạo nhanh).

---

## 4. Hai cách tạo appointment

### (A) Nút "New +"
`New ⊕` → menu (`New Appointment` / `Block Time Settings` / `Waiting list` / `Today`)
→ chọn **New Appointment** → mở form (mục 5), **không** pre-fill giờ/staff.

### (B) Click ô trắng trơn trên lưới  ← cách chính
- ⚠️ **CHỈ tạo ở ô NỀN TRẮNG TRƠN (bookable). KHÔNG click vào vùng Ô SỌC (gạch chéo).**
  Ô sọc = ngoài giờ làm / cửa hàng đóng → **click vào KHÔNG mở popup** (dateClick không bắn).
- ⚠️ **Tránh ngày nghỉ.** Vd **Chủ nhật KHÔNG ai đi làm** → cả lưới bị **sọc hết** → không tạo
  được ô nào. Chọn **ngày làm việc (weekday)**, vd hôm nay `Jul 2` (thứ 5).
- Click **1 ô `slot-cell` nền trắng** dưới cột của 1 nhân viên → mở popup **New Appointment**
  đã **pre-fill**: `Start time` = giờ của ô, `Staff` = nhân viên cột đó, `Duration` = `1h 0m`.
- Trên ngày đã kín/đang lỗi, click ô có thể chỉ tạo block nháp mà popup **không bật**.
- Thao tác Playwright ổn định: `page.mouse.click(x, y)` vào **toạ độ** ô trắng
  (không dùng selector element vì FullCalendar cần pointer thật; click bằng toạ độ mới
  kích hoạt `dateClick`).
- Code (`GoBookingPage.openNewAppointmentAtFreeSlot(staff)`) **tự tìm ô trắng đầu tiên**:
  click thử các ô trống trong cột staff (bỏ qua ô sọc/ô đã có lịch vì chúng không mở popup),
  cuộn nếu cần → không cần cố định giờ.

---

## 5. Form "New Appointment" (element thật)

**Cột trái — khách hàng:**
- `input[placeholder="Search Name/Phone ..."]` — tìm khách.
- Nút **`+ Create new client`**.
- Danh sách khách (card: avatar + tên + SĐT ẩn `(***) ***-xxxx`). Chọn 1 card → hiện hồ sơ
  (số liệu `Appointment` / `Spent` / `Point` / `Visit` + tab `Checkin` / `Order` / `Appointment`)
  + nút **✕** bỏ chọn.
- **Create new client:** `input[placeholder="Customer phone"]` (**Phone number*** — bắt buộc)
  + `input[placeholder="Customer name"]` (Full Name). Ghi chú: *"(*) is required..."*.

### 5.1. Danh sách khách hàng (đã quét MCP) — chọn BẤT KỲ, không chỉ Kevin V

> **Cấu trúc DOM card:** mỗi card gồm **2 leaf** xen kẽ `[avatar-initials, tên]` (SĐT KHÔNG là
> leaf text riêng — đọc qua `card.innerText`). List nằm trong scroller **cột trái** =
> `div` scrollable có chứa nút "+ Create new client" (class quét được:
> `grow w-full overflow-auto`; **tìm bằng vị trí + chứa "Create new client", KHÔNG fallback
> `document.body`** — nếu không có form mở sẽ quét nhầm cả trang). Card ngoài viewport phải
> `scrollIntoView` trước khi click.
>
> **⚠️ List mặc định ≠ toàn bộ khách.** List mặc định chỉ hiện **~50 khách gần đây**. Gõ vào ô
> **`Search Name/Phone …`** sẽ **query cả DB khách trên server** (đã verify MCP: search "Melanie"
> ra rất nhiều khách ngoài 50). ⇒ Chọn theo **tên** thì **luôn search trước** rồi click card khớp.

- **Đã quét `50` khách** (list mặc định, chưa search) ngày 2026-07-02 → lưu
  **`src/data/static/customers.ts`** (`CUSTOMERS`: `{ name, initials, phoneLast4 }`,
  `CUSTOMER_NAMES`, `SELECTABLE_CUSTOMERS` — tên đầy đủ & duy nhất, `pickCustomerName(seed)`).
- Vài khách tiêu biểu (SĐT chỉ lộ 4 số cuối): `Kevin V` (3972), `Annie Khuu` (1946),
  `Anna Khuu` (8476), `Sharon Lombardo` (9474), `Sandra Cummings` (6200), `Brittany Haefner` (9218),
  `Lori Cupp` (7959), `Amy Elkins` (5450), `Rochelle Stachel` (6136), `Nicole Daugherty` (6856),
  `Elvira Vela` (4065), `Kris Jackson` (7199), `Krystle Colangelo` (1924), `Diane Michel` (5769),
  `Sandy Yakovich` (5015), `Lauren Quallich` (6127), `Barbara Mecca` (5188), `Ellie Kairys` (2383),
  `Maria Cindy Fisher` (8328), `Melanie D Temoshenka` (3583)… (danh sách đầy đủ 50 trong `customers.ts`).
- ⚠️ Có **tên trùng** (2× `Amanda`, 2× `Stephanie`) và **placeholder** (`No name`, `H`, `viet`)
  → chọn theo tên chính xác sẽ **nhập nhằng**. `SELECTABLE_CUSTOMERS` đã lọc bỏ các case này;
  chọn động thì dùng theo **index** trên list live.
- **Cách chọn (code):**
  - `NewAppointmentModal.pickCustomer(name?)` — có `name` → **search theo tên** rồi click card
    khớp (đến được BẤT KỲ khách trong DB, kể cả ngoài 50); **không** có → chọn **động** card
    bất kỳ từ list live (mặc định card thứ 2 để KHÔNG mặc định là Kevin V).
  - `selectCustomer(name)` — gõ vào ô Search → click card khớp (exact, hoặc kết quả top).
  - `selectAnyCustomer({name?|index?})` / `listCustomers()` — chọn theo index trên list hiện có
    / đọc tên đang hiển thị; `scrollIntoView` trước khi click.
  - `DEFAULT_APPOINTMENT.customer` mặc định `undefined` (⇒ chọn động). Đặt 1 tên (trong
    `CUSTOMER_NAMES` hoặc bất kỳ khách nào tồn tại) để ép chọn khách cụ thể qua search.

**Cột phải — chi tiết lịch:**
- Dải chọn ngày (sun … sat, ngày đang chọn tô xanh).
- **`Start time`**, **`Staff`** (mặc định "Any Staffs", có nút ✕ xoá), **`Duration`**,
  **`Service`** (bấm mở modal chọn), **`+ Add More (Basic)` ⚙**.
- Checkbox: **`Requested`** · **`Highlight`** (kèm cờ 🚩) · **`No-show`** · **`Repeat`**
  (là **div tùy biến**, không phải `<input type=checkbox>` chuẩn).
- **Footer:** `Back` / **`Book`**.

**Modal "Edit service"** (khi bấm ô Service):
- Ô `Search …` + nút `filter ▾`.
- Các nhóm dịch vụ (vd `Customize`, `MANICURE & PEDICURE`); mỗi service = avatar + tên +
  thời lượng + giá (vd *Deluxe pedicure with gel — 55' — $80*).
- Service không phục vụ nhân viên đang chọn ghi **"Service unavailable for &lt;Staff&gt;"**.
- Chọn service → đóng modal, **`Duration` tự cập nhật theo thời lượng service**
  (vd Deluxe pedicure with gel → `0h 55m`), ô Service hiển thị `<tên> - $<giá>`.

> **QUAN TRỌNG — service phụ thuộc staff:** cùng một service có thể *available* cho staff này
> nhưng *unavailable* cho staff khác (vd `Deluxe pedicure with gel` OK cho Hugo, KHÔNG cho Annie).
> Vì vậy khi cho phép chọn **staff bất kỳ**, KHÔNG hard-code 1 service. Cách làm: thử lần lượt
> danh sách candidate, chọn **service đầu tiên available** cho staff đang chọn (search từng tên →
> nếu dòng không ghi "unavailable" → chọn).
>
> Đã lưu `src/data/static/booking.ts` → **`SERVICE_CANDIDATES`**. Các service đã quét (từ modal
> Edit service): `Deluxe pedicure with gel` ($80,55'), `Gel pedicure with callus removed!` ($60,40'),
> `Regular Manicure`, `French Tip` ($5), `Nail Art` ($5), `Extra-Long Extension` ($5),
> `Specialty Shape` ($5), `Pink fill (ombre)` ($40), `Full Set/Gel` ($50), `Full Set` ($35),
> `Fill/Gel` ($40), `Fill` ($30), `Ombre'` ($65), `Ombre' Fill` ($65), `Full set dip` ($55)…
> (nhóm: `Customize`, `MANICURE & PEDICURE`, `ACRYLIC` — nhóm có thể **thu gọn**, nên **luôn dùng
> ô Search** để hiện service trước khi click).

---

## 6. Sau khi Book / Sửa

- Bấm **Book** → tạo ngay block **CONFIRMED** trên lịch (tên khách + SĐT ẩn + service +
  khung giờ), tăng `Total` / `Confirmed`, và tăng số `Appointment` của khách.
- Mở lại block đã tạo → qua **passcode #3** → màn **`Appointment_#<id>`**
  (status `CONFIRMED`, nút `Copy`, `Message Detail`, `Appointment Note >`,
  `Appointment History > Booked at <thời gian>`).
- Sửa cờ (Requested / Highlight …) → nút đổi từ `Done` thành **`Save`** → bấm **Save**
  → hiện **Confirmation: "Do you want to send a message to &lt;khách&gt; notifying about this change?"**
  → **`Don't Send`** (không gửi SMS) hoặc **`Send`**.

---

## 7. Cần lưu ý khi viết test (đã quan sát thật)

- Console iframe có lỗi auth khi state xấu:
  `401 gap-api.gocheckin.net/.../app-admin?tenant_name=100004`,
  `Failed to make GAP HTTP request: invalid credentials`,
  `TypeError: Cannot read properties of undefined (reading 'onError'/'onSuccess')`.
  → Chọn **ngày trống** + đảm bảo passcode đúng để form mở ổn định.
- Nút close (×) modal, checkbox, service item là **div tùy biến** (không phải input/button
  chuẩn) → ưu tiên click theo **toạ độ** hoặc `getByText` / `getByRole` trong `frameLocator`.
  Chú ý nhiều phần tử trùng text bị **ẩn** trong DOM (template) → lọc phần tử **thật sự hiển thị**
  (kiểm tra `display`/`visibility`/`opacity` theo cây cha) trước khi click.
- SĐT khách luôn **mask** `(***) ***-xxxx` cho tới khi qua passcode xem SĐT.

---

## 8. Trường hợp kiểm thử (test cases gợi ý)

| # | Mô tả | Kỳ vọng |
| --- | --- | --- |
| TC01 | Click ô trắng (ngày trống) dưới cột Hugo | Popup New Appointment pre-fill đúng giờ + Staff=Hugo |
| TC02 | Chọn khách có sẵn + service hợp lệ → Book | Block CONFIRMED xuất hiện, `Total` +1, `Duration` = thời lượng service |
| TC03 | + Create new client, để trống Phone number* | Chặn submit / báo bắt buộc |
| TC04 | Chọn service "unavailable for &lt;Staff&gt;" | Không đặt được / có cảnh báo |
| TC05 | Mở appointment → tick Requested+Highlight → Save → Don't Send | Cờ được lưu, không gửi tin |
| TC06 | Nhập sai passcode ở 1 trong 3 cổng | Không vào được bước sau |

---

## 9. Cần xác minh thêm (chưa quét kỹ)

- [ ] Text/validation chính xác khi thiếu Phone number* ở "Create new client".
- [ ] Hành vi khi chọn service "unavailable for &lt;Staff&gt;" (chặn cứng hay chỉ cảnh báo?).
- [ ] Nội dung `+ Add More (Basic)` ⚙ (thêm nhiều service/staff cho 1 lịch?).
- [ ] `Block Time Settings` và `Waiting list` (2 mục còn lại của menu New).
- [ ] Luồng `Send` thật (gửi SMS/Email/Voice) — mục này chỉ quét tới dialog, chưa gửi.

---

## 10. Prompt mẫu cho AI gen code

> "Dựa trên `docs/flows/create-appointment.flow.md`, sinh page object
> `GoBookingPage` / `NewAppointmentModal` extends `BasePage`: xử lý iframe
> `iframe[src*="go-booking"]`, 3 cổng passcode (`8888`), tạo appointment bằng
> click `slot-cell` (theo toạ độ) và bằng nút `New`, chọn khách / `+ Create new client`,
> chọn Service (modal Edit service), tick Requested/Highlight, `Book`, và xử lý dialog
> `Don't Send / Send`. Kèm test `tests/e2e/booking/create-appointment.e2e.spec.ts` cho
> TC01–TC06. Dùng `frameLocator`, chờ theo element/URL, không sleep cứng."

---

## 11. Quan sát ngày quá khứ (Tue, Jun 30, 2026 — ngày quét chuẩn = hôm nay − 1)

Điều hướng về ngày trước hôm nay (nút `<`) cho thấy **ngày quá khứ đầy dữ liệu thật** —
rất phù hợp để test **đọc / hiển thị / lọc lịch** (khác ngày Jul 2 trống dùng để test *tạo*).

- **Tổng quan:** `21 Confirmed / 0 Schedules / 0 Done / 0 Checkin / 21 Total`.
  → Lịch quá khứ vẫn giữ status **Confirmed** (không tự chuyển Done).
- **Cột nhân viên có số đếm lịch:** `Unassigned = 12` (gom nhiều lịch chưa gán), `Hugo = 3`,
  còn lại (Annie, Vincent, Ryan, Evon, Bob, Wendy) = 1.
- **Block lịch:** hiển thị tên khách + SĐT ẩn `(***) ***-xxxx` + service (vd `Regular Manicure`,
  `Deluxe pedicure with gel`) + khung giờ (vd `10:00 AM - 10:40 AM`, `10:15 AM - 10:55 AM`);
  mỗi block có 2 badge nhỏ **`R`** (hồng) và **`N`** ở góc dưới.
- **Không bị gạch sọc** (khác vùng "đã qua giờ" của *hôm nay*) → block vẫn click/mở được
  (qua passcode #3 như mục 6).

### Test case bổ sung (đọc/hiển thị — chạy trên ngày hôm qua)
| # | Mô tả | Kỳ vọng |
| --- | --- | --- |
| TC07 | Mở ngày hôm qua (Today − 1) | Thanh tóm tắt hiện đúng số `Confirmed`/`Total` (>0) |
| TC08 | Kiểm cột `Unassigned` | Có badge số đếm = số lịch chưa gán |
| TC09 | Đọc 1 block bất kỳ | Có tên khách (SĐT mask), service, khung giờ, badge R/N |
| TC10 | Lọc `Status` / `Staff (All)` | Danh sách block cập nhật theo bộ lọc |
