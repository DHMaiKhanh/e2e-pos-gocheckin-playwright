# Test Cases & Automation — Tạo Appointment (Go Booking)

> Tài liệu tổng hợp **các luồng chạy** và **test case** đã sinh cho luồng tạo
> appointment, dựa trên [docs/flows/create-appointment.flow.md](../flows/create-appointment.flow.md).
> Nguồn quét bằng Playwright MCP trên app thật (tenant demo `100004` — Nail Salon Demo).

| Thông tin | Giá trị |
| --- | --- |
| Ngày tạo | 2026-07-02 |
| Framework | Playwright `@playwright/test` ^1.48 (POM + fixtures + path aliases) |
| Spec | `tests/e2e/booking/create-appointment.e2e.spec.ts` |
| Tài khoản | `STORE_ID=100004` · `admin` / `123456` · passcode `8888` (env, mặc định demo) |

---

## 1. Câu lệnh chạy

```powershell
# PowerShell — chạy spec tạo appointment
npm run test:e2e -- tests/e2e/booking/create-appointment.e2e.spec.ts --project=chromium --no-deps

# Xem trình duyệt chạy trực tiếp
npm run test:e2e -- tests/e2e/booking/create-appointment.e2e.spec.ts --project=chromium --no-deps --headed

# Chế độ UI (tua từng bước)
npm run test:e2e -- tests/e2e/booking/create-appointment.e2e.spec.ts --project=chromium --no-deps --ui

# Báo cáo sau khi chạy
npx playwright show-report
```

- `--no-deps`: bỏ qua project `auth.setup` (spec tự đăng nhập 2 bước bên trong).
- Credentials/passcode lấy từ `configs/env/.env.local`.

---

## 2. Các file đã sinh / thay đổi

| File | Vai trò |
| --- | --- |
| `src/pages/booking/GoBookingPage.ts` | POM: login 2 bước → Apps → Go Booking → 2 passcode → điều hướng ngày → mở form tạo qua **ô trống** hoặc nút **New**; đọc `Total`/`Confirmed`; assert block; **mở lịch đã tạo** (passcode #3) → `openAppointmentDetail`. |
| `src/components/booking/GoBookingModal.ts` | **Base** dùng chung cho các modal trong iframe: `frame`/`iframeOffset`/`clickTopmost`/`textShown`/`textContains`/`fillInputByPlaceholder`/`waitUntil` (opacity-aware + hit-test). |
| `src/components/booking/NewAppointmentModal.ts` | Component form New Appointment: **chọn khách động** (`pickCustomer`/`selectAnyCustomer`/`listCustomers`, scroll-into-view) → `+ Create new client` → chọn service (modal Edit service, có filter / probe available theo staff) → tick Requested/Highlight → **Book**/`tryBook`. |
| `src/components/booking/AppointmentDetailModal.ts` | Component màn `Appointment_#<id>`: đọc `status`, tick cờ, **`Save` → `Don't Send`** (không gửi SMS). |
| `src/data/static/customers.ts` | **50 khách đã quét MCP** (`CUSTOMERS`, `CUSTOMER_NAMES`, `SELECTABLE_CUSTOMERS`, `pickCustomerName`). |
| `src/data/static/booking.ts` | `AppointmentInput` (customer **optional**) + `DEFAULT_APPOINTMENT` + `SERVICE_CANDIDATES` + `UNAVAILABLE_SERVICE_CASE` + `NEW_CLIENT_MISSING_PHONE` + `GO_BOOKING_IFRAME`; re-export customers. |
| `tests/e2e/booking/create-appointment.e2e.spec.ts` | Spec E2E: TC-A01/TC02 + TC01, TC03, TC04, TC05. |
| `configs/env/loadEnv.ts` | Thêm `StoreCredentials` (`STORE` + passcode) vào env schema. |
| `configs/env/.env.example`, `.env.local` | Thêm `STORE_ID/USER/PASS`, `GO_BOOKING_PASSCODE`. |
| `src/constants/urls.ts` | Thêm `LOGIN_CONFIRM`, `CHECK_OUT`, `MINI_APP`. |
| `src/fixtures/pages.fixture.ts` | Thêm fixture `goBookingPage`. |
| `src/pages/index.ts` | Export `GoBookingPage`. |

---

## 3. Luồng chạy end-to-end (map với code)

```
bootstrap()                              GoBookingPage
 ├─ goto(/login)                         → waitForReady: input[name="id"] visible
 ├─ loginToStore()                       (2 bước)
 │   ├─ fill input[name="id"] = 100004 → "Log In"  → /login/confirm
 │   ├─ fill Username=admin, Password=123456 → "Log In"
 │   ├─ handleChoosePosVersion()          (best-effort: FULL POS + Confirm nếu có)
 │   └─ chờ URL /check-out                (FULL POS)
 └─ openGoBooking()
     ├─ click lưới Apps (div.w-[70px])   → click "Go Booking"
     ├─ typePosPasscode(8888)            passcode #1 — numpad POS (click phím visible + OK)
     ├─ chờ URL /mini-app
     ├─ enterIframePasscode(8888)        passcode #2 — iframe (tìm input thật opacity-aware, click toạ độ, gõ, verify) → "Accept"
     └─ waitCalendarReady()              chờ nút "New" trong iframe

goToDayOffset(+1)                        về Today → next-day (button.arrow-btn.rotate-[180deg])
openNewAppointmentViaSlot(staff, time)   click ô trống (tính toạ độ cột nhân viên × hàng giờ, opacity-aware, poll chờ grid render)
   └─ NewAppointmentModal.waitOpen()

NewAppointmentModal:
 ├─ pickCustomer(appt.customer?)         KHÁCH ĐỘNG: có tên → chọn đúng; không → chọn card bất kỳ từ list live
 │                                       (selectAnyCustomer/listCustomers, scroll-into-view; trả về tên đã chọn)
 ├─ pickFirstAvailableService()          duyệt Edit service → chọn service ĐẦU TIÊN available cho staff (né "unavailable")
 ├─ setRequested() / setHighlight()      tick checkbox theo nhãn
 └─ book()                               "Book" → (nếu hỏi) "Don't Send" → chờ modal đóng (opacity-aware)

Assert:
 ├─ expectAppointmentVisible(customer)   block chứa tên khách (đã chọn) + "confirmed" (opacity-aware)
 └─ getTotalCount() > totalBefore        pill "<n> Total" tăng

openAppointmentDetail(customer)          click block trên lịch → passcode #3 (nếu hỏi) → AppointmentDetailModal
   └─ setHighlight() → save({notify:false})   tick cờ → "Save" → "Don't Send" (không gửi SMS)
```

---

## 4. Test cases

### 4.1. Đã tự động hoá (trong spec hiện tại)

| # | Test | Bước | Kỳ vọng |
| --- | --- | --- | --- |
| **TC-A01/TC02** | Tạo appointment qua ô trống ngày rảnh — **khách bất kỳ** | bootstrap → dayOffset → click ô trống (Hugo) → **`pickCustomer()` chọn khách động** → `pickFirstAvailableService` → tick Requested+Highlight → Book | Block **confirmed** (đúng tên khách đã chọn) hiện trên lịch; `Total` +1 |
| **TC01** | Click ô trống → popup pre-fill staff thật | bootstrap → dayOffset → `openNewAppointmentAtFreeSlot(staff)` → đọc field `Staff` | Popup mở; `Staff` KHÁC "Any Staffs" (đã pre-fill staff cột) — **không** Book (không tạo dữ liệu) |
| **TC03** | Create new client thiếu Phone number* | mở form → `createNewClient(name, "")` → `tryBook` | Modal **vẫn mở** (chặn submit); `Total` không đổi |
| **TC04** | Service unavailable cho staff | mở form dưới `Annie` → `chooseServiceExpectingAvailability("Deluxe pedicure with gel")` | Trả về `available=false` (có cảnh báo unavailable) |
| **TC05** | Mở lịch đã tạo → sửa cờ → Save → Don't Send | tạo lịch (khách động) → `openAppointmentDetail(customer)` (passcode #3) → `setHighlight` → `save({notify:false})` | `status`=CONFIRMED; Save đóng dialog "send a message?" bằng **Don't Send** (không gửi SMS) |

> Dữ liệu lấy từ `DEFAULT_APPOINTMENT` (`src/data/static/booking.ts`). **`customer` mặc định `undefined`
> ⇒ chọn khách ĐỘNG từ list live** (không cố định Kevin V). Đặt 1 tên trong `CUSTOMER_NAMES`
> (`customers.ts`, 50 khách đã quét) để ép 1 khách cụ thể. Đổi `staff`/`dayOffset`/cờ tương tự.

### 4.2. Test case thiết kế còn lại (chưa tự động hoá)

| # | Mô tả | Kỳ vọng |
| --- | --- | --- |
| TC06 | Nhập sai passcode ở 1 trong 3 cổng | Không vào được bước sau |
| TC07 | Mở ngày hôm qua (Today − 1) | Thanh tóm tắt hiện đúng số `Confirmed`/`Total` (>0) — đã có `getConfirmedCount()` hỗ trợ |
| TC08 | Kiểm cột `Unassigned` (ngày hôm qua) | Có badge số đếm = số lịch chưa gán |
| TC09 | Đọc 1 block bất kỳ | Có tên khách (SĐT mask), service, khung giờ, badge R/N |
| TC10 | Lọc `Status` / `Staff (All)` | Danh sách block cập nhật theo bộ lọc |

---

## 5. Kỹ thuật xử lý đặc thù (đã áp dụng trong code)

- **Iframe cross-origin** `go-booking.gocheckin.net`: click qua `page.frameLocator(...)`; đọc trạng thái qua `page.frames().find(...).evaluate(...)`.
- **Template ẩn `opacity:0`**: Playwright `filter({ visible: true })` KHÔNG loại opacity:0 → dùng kiểm tra **opacity-aware** qua Frame DOM cho: nhập passcode #2, tìm ô trống, chờ modal mở/đóng, đọc `Total`, assert block.
- **Numpad POS**: click phím **đang hiển thị** theo text (một phím một lần) rồi `OK`.
- **Điều hướng ngày**: nút `button.arrow-btn` (prev) và `button.arrow-btn.rotate-[180deg]` (next).
- **Header "Hugo 1"**: match nhân viên theo **prefix** (header có badge số khi đã có lịch).
- **Gutter giờ**: chỉ giờ tròn có "AM/PM" (`12:00 PM`); mốc 15' chỉ hiện `12:15`.
- **Không gửi SMS thật**: sau Book/Save chọn **Don't Send**.
- **Khách hàng ĐỘNG**: card khách = 2 leaf xen kẽ `[avatar, tên]`, list không virtual-scroll
  (`div.grow.w-full.overflow-auto`) → đọc tên qua leaf lẻ; chọn khách sâu trong list phải
  `scrollIntoView` trước khi click toạ độ. 50 khách đã quét → `customers.ts`.

---

## 6. Trạng thái & lưu ý

✅ **Code type-check + lint sạch.** TC-A01/TC02 (tạo appointment confirmed thật) đã PASS end-to-end
trước đó; nay **khách hàng chọn động** (mặc định card thứ 2, không cố định Kevin V) + bổ sung
TC01/TC03/TC04/TC05. Các TC mới cần chạy trên tenant demo để tinh chỉnh selector (đặc biệt
validation Phone number* — flow §9 — và màn `Appointment_#` của TC05).

Các kỹ thuật đã áp dụng để vượt qua đặc thù app (xem §5): chờ `loading-layout`, poll passcode #2 tới 30s, poll grid render, **click opacity-aware + hit-test `elementFromPoint`** để né bản modal template ẩn/nền, chọn service qua Search + click đúng hàng trên cùng, **base `GoBookingModal`** dùng chung cho New Appointment & Appointment detail.

⚠️ **Lưu ý khi chạy lại nhiều lần trên cùng tenant demo:**
1. Mỗi lần PASS sẽ **đặt thật** 1 lịch cho **Hugo tại `timeLabel`** (mặc định `12:00 PM`) trên ngày `Today+1`. Chạy lại **cùng ngày** → ô đó **đã trùng** → click ô trống có thể mở lịch cũ thay vì form mới → fail.
   - Cách né: đổi `staff`/`timeLabel`/`dayOffset` trong `src/data/static/booking.ts` giữa các lần chạy, hoặc để sang ngày mới.
2. **Chỉ dùng method B (click ô trống)** để có lịch *confirmed* — nút "New" để Staff = "Any Staffs" chỉ tạo **draft** (không confirmed).

### Đề xuất nâng cấp để chạy lặp thoải mái (chưa làm)
- **Chọn ô trống động**: quét cột + giờ thực sự rảnh thay vì cố định `Hugo 12:00`.
- **Teardown**: sau test huỷ (Cancel) appointment vừa tạo để không tích luỹ.
- Dùng **tenant/ngày riêng cho test**.
