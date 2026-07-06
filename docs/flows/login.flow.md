# Luồng: Đăng nhập (Login) — GoCheckin POS

> File này ghi lại chi tiết luồng nghiệp vụ đã **quét bằng Playwright MCP** trên
> app thật, để làm nguồn (context) cho AI sinh code test. Mỗi khi đi một luồng
> mới, tạo thêm một file `docs/flows/<tên-luồng>.flow.md` theo đúng mẫu này.

| Thông tin | Giá trị |
| --- | --- |
| Ngày quét | 2026-07-02 |
| URL | `https://pos.gocheckin.net/login` |
| Page title | `GoPos` |
| Framework FE | Vue 3 (thuộc tính `data-v-*`, class Tailwind) |
| Người/công cụ quét | Playwright MCP (`browser_navigate` + `browser_snapshot` + `browser_evaluate`) |

---

## 1. Tóm tắt luồng

Đăng nhập GoPOS **bằng một mã ID dạng số** (KHÔNG có username/password). Người dùng
nhập ID vào ô "ID" (có thể gõ bằng bàn phím vật lý hoặc **bàn phím số ảo** trên màn
hình cảm ứng POS), rồi bấm **Log In**. Sau khi đăng nhập thành công, app có thể hiện
modal **"Choose POS version"** để chọn `LITE POS` / `FULL POS` rồi bấm **Confirm**.

```
/login
  └─ nhập ID (ô "ID"  |  hoặc bàn phím số ảo #numPad → OK)
       └─ bấm "Log In"
            ├─ (nếu ID sai)  → ở lại /login + toast lỗi
            └─ (nếu ID đúng) → có thể hiện modal "Choose POS version"
                                  └─ chọn LITE/FULL POS → "Confirm" → vào app
```

---

## 2. Element thật (đã xác minh trên DOM)

### Form đăng nhập (card "Welcome back")

| Vai trò | Selector đề xuất (ưu tiên trên xuống) | Chi tiết DOM |
| --- | --- | --- |
| Ô nhập ID | `page.locator('input[name="id"]')` · `getByPlaceholder('ID')` | `<input name="id" placeholder="ID" class="... input">`, không có `type` (mặc định text) |
| Nút đăng nhập | `getByRole('button', { name: 'Log In' })` | `<button type="submit" class="btn btn-success h-[64px] ...">Log In</button>` |
| Tiêu đề card | `getByText('Welcome back')` | `<p>Welcome back</p>` |
| Phụ đề | `getByText('Please login to your account')` | |

### Bàn phím số ảo (numpad)

Container: `#numPad` (mặc định ẩn: `opacity-0 pointer-events-none`, hiện khi tương tác).
Mỗi phím là `<div numpadid="...">`:

| Phím | `numpadid` | Selector |
| --- | --- | --- |
| 1–9 | `1`…`9` | `#numPad [numpadid="7"]` |
| 0 | `0` | `#numPad [numpadid="0"]` |
| 00 | `12` | `#numPad [numpadid="12"]` |
| Del (xóa 1 ký tự) | `10` | `#numPad [numpadid="10"]` |
| Clear (xóa hết) | `11` | `#numPad [numpadid="11"]` |
| OK (xác nhận) | `13` | `#numPad [numpadid="13"]` |

> Lưu ý: với mã ID có số `0` đứng đầu, PHẢI gõ bằng numpad (hoặc `fill` cả chuỗi),
> vì `<input type="number">` sẽ nuốt số 0 — nhưng ở đây input là text nên `fill` an toàn.

### Checkbox & modal liên quan

| Vai trò | Ghi chú |
| --- | --- |
| "Remember in 30mins" | checkbox trong numpad-modal — giữ phiên 30 phút |
| Modal "Choose POS version" | có 2 lựa chọn text `LITE POS`, `FULL POS` + button `Confirm` |

> Trên trang login còn nhiều modal khác được render sẵn nhưng **ẩn** (Batch Close,
> Check Giftcard, POS/PAX transaction list, toast "Success!!"…). Đừng nhắm vào chúng
> ở luồng login — luôn scope selector vào card "Welcome back" / `#numPad`.

---

## 3. Các bước thao tác (step-by-step)

1. `goto('/login')` → chờ `input[name="id"]` visible.
2. Nhập ID:
   - Cách A (nhanh): `idInput.fill('<ID>')`.
   - Cách B (mô phỏng POS cảm ứng): click từng phím `#numPad [numpadid="<digit>"]` rồi `OK`.
3. Bấm **Log In**.
4. Nếu hiện modal "Choose POS version": chọn `FULL POS`/`LITE POS` → bấm **Confirm**.
5. Chờ URL rời khỏi `/login` = đăng nhập thành công.

---

## 4. Trường hợp kiểm thử (test cases gợi ý)

| # | Mô tả | Kỳ vọng |
| --- | --- | --- |
| TC01 | ID hợp lệ | Rời `/login`, vào app (qua modal chọn version nếu có) |
| TC02 | ID sai | Ở lại `/login`, hiện toast/thông báo lỗi |
| TC03 | ID rỗng, bấm Log In | Ở lại `/login` (nút có thể disabled hoặc báo lỗi) |
| TC04 | Nhập bằng numpad + OK | Giá trị hiển thị đúng, login được |
| TC05 | Tích "Remember in 30mins" | Không hỏi lại passcode trong 30 phút (cần verify) |

---

## 5. Cần xác minh thêm (chưa quét được — cần tài khoản thật)

- [ ] Thông báo lỗi chính xác khi ID sai (text/màu/vị trí) → cập nhật `errorMessages.ts`.
- [ ] Sau login: URL đích là gì? (`/` hay `/dashboard`…) → cập nhật `urls.ts` + `DashboardPage`.
- [ ] Modal "Choose POS version" luôn hiện hay chỉ lần đầu?
- [ ] Selector đăng xuất (logout) trong app.

---

## 6. Prompt mẫu cho AI gen code

> "Dựa trên `docs/flows/login.flow.md`, sinh/cập nhật page object
> `src/pages/auth/LoginPage.ts` extends `BasePage`: ô `input[name="id"]`, nút
> `Log In`, hỗ trợ nhập bằng `#numPad` (map `numpadid`), xử lý modal
> `Choose POS version`. Kèm test `tests/e2e/auth/login.e2e.spec.ts` cho TC01–TC03.
> Dùng locator theo role/placeholder, chờ theo tín hiệu URL/element, không sleep cứng."
