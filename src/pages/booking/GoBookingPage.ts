import { type FrameLocator, type Locator, expect } from '@playwright/test';
import { Timeouts } from '@configs/constants/timeouts';
import { env } from '@configs/env/loadEnv';
import { BasePage } from '@pages/BasePage';
import { Urls } from '@constants/urls';
import { GO_BOOKING_IFRAME } from '@data/static/booking';
import { NewAppointmentModal } from '@components/booking/NewAppointmentModal';
import { AppointmentDetailModal } from '@components/booking/AppointmentDetailModal';

/**
 * Go Booking calendar (mini-app rendered in a cross-origin iframe).
 *
 * Encapsulates the full journey documented in
 * docs/flows/create-appointment.flow.md:
 *   store login (2-step) → Apps → Go Booking → passcode #1 (POS numpad) →
 *   passcode #2 (iframe) → day view → create appointment.
 *
 * The calendar lives in `iframe[src*="go-booking"]`, so element access goes
 * through `frameLocator`. The POS numpad ("Enter Passcode") is a custom
 * on-screen keyboard with hidden template duplicates, so it is driven by
 * clicking the single *visible* key.
 */
export class GoBookingPage extends BasePage {
  protected readonly path = Urls.LOGIN;

  private get frame(): FrameLocator {
    return this.page.frameLocator(GO_BOOKING_IFRAME);
  }

  private get newButton(): Locator {
    return this.frame.getByRole('button', { name: /^New/ }).first();
  }

  private get todayButton(): Locator {
    return this.frame.getByRole('button', { name: 'Today', exact: true }).filter({ visible: true });
  }

  /** Prev-day arrow (`<`). The next arrow is the same button rotated 180°. */
  private get prevDayButton(): Locator {
    return this.frame
      .locator('button.arrow-btn:not(.rotate-\\[180deg\\])')
      .filter({ visible: true })
      .first();
  }

  private get nextDayButton(): Locator {
    return this.frame
      .locator('button.arrow-btn.rotate-\\[180deg\\]')
      .filter({ visible: true })
      .first();
  }

  /** The login page is ready once the store-ID field is visible. */
  async waitForReady(): Promise<void> {
    await expect(this.page.locator('input[name="id"]')).toBeVisible({ timeout: Timeouts.MEDIUM });
  }

  // ---- Full journey ------------------------------------------------------

  /** goto login → store login → open Go Booking → calendar ready. */
  async bootstrap(): Promise<void> {
    await this.goto();
    await this.loginToStore();
    await this.openGoBooking();
  }

  /** 2-step store login: store ID, then staff username/password. §1–§2. */
  async loginToStore(): Promise<void> {
    const { id, username, password } = env.STORE;
    this.logger.info(`Store login (id=${id}, user=${username})`);

    await this.page.locator('input[name="id"]').fill(id);
    await this.loginSubmit();
    await this.page.waitForURL(/login\/confirm/, { timeout: Timeouts.NAVIGATION });

    await this.page.getByPlaceholder('Username').fill(username);
    await this.page.getByPlaceholder('Password').fill(password);
    await this.loginSubmit();

    await this.handleChoosePosVersion();
    await this.page.waitForURL(/check-out/, { timeout: Timeouts.NAVIGATION });
  }

  private async loginSubmit(): Promise<void> {
    await this.page
      .getByRole('button', { name: /log\s*in/i })
      .filter({ visible: true })
      .first()
      .click();
  }

  /**
   * Some logins show a "Choose POS version" modal — pick FULL POS + Confirm.
   * Best-effort: the check-out page pre-renders hidden modal templates, so this
   * is guarded by short-timeout clicks and never fails the login (most logins
   * go straight to /check-out with no modal).
   */
  private async handleChoosePosVersion(): Promise<void> {
    try {
      const fullPos = this.page
        .getByText('FULL POS', { exact: true })
        .filter({ visible: true })
        .first();
      await fullPos.waitFor({ state: 'visible', timeout: Timeouts.SHORT });
      await fullPos.click({ timeout: Timeouts.SHORT });
      await this.page
        .getByRole('button', { name: 'Confirm' })
        .filter({ visible: true })
        .first()
        .click({ timeout: Timeouts.SHORT });
    } catch {
      // No actionable version modal — proceed straight to check-out.
    }
  }

  /** Apps menu → Go Booking → both passcodes → calendar. §2. */
  async openGoBooking(): Promise<void> {
    this.logger.info('Open Go Booking');
    // After login the check-out page shows a full-screen loading overlay that
    // intercepts clicks — wait for it to clear before opening the Apps menu.
    await this.waitLoadingOverlayGone();
    // Top-left apps grid (Tailwind arbitrary width class w-[70px]).
    await this.page.locator('div.w-\\[70px\\].cursor-pointer').first().click();
    await this.page.getByText('Go Booking', { exact: true }).click();

    // Passcode #1 — POS "Enter Passcode" numpad.
    await this.typePosPasscode(env.STORE.passcode);
    await this.page.waitForURL(/mini-app/, { timeout: Timeouts.NAVIGATION });

    // Passcode #2 — inside the iframe. enterIframePasscode polls for the field
    // (the cross-origin iframe can take a while to render its modal).
    await this.passIframePasscode(env.STORE.passcode);

    await this.waitCalendarReady();
  }

  /**
   * Enters a passcode into the iframe's "Passcode" modal and confirms with
   * Accept. Shared by passcode #2 (opening Go Booking) and passcode #3 (opening
   * an appointment's detail — "View customer phone number"). See flow doc §2.
   */
  private async passIframePasscode(code: string): Promise<void> {
    await this.enterIframePasscode(code);
    const accept = this.frame.getByRole('button', { name: 'Accept' }).filter({ visible: true });
    await expect(accept).toBeEnabled({ timeout: Timeouts.MEDIUM });
    await accept.click();
  }

  /** Waits for the app's full-screen loading overlay to disappear. */
  private async waitLoadingOverlayGone(): Promise<void> {
    await this.page
      .locator('.loading-layout')
      .first()
      .waitFor({ state: 'hidden', timeout: Timeouts.LONG })
      .catch(() => undefined);
  }

  private async waitCalendarReady(): Promise<void> {
    await this.newButton.waitFor({ state: 'visible', timeout: Timeouts.LONG });
  }

  /**
   * Types the passcode into the genuinely-visible field inside the iframe.
   * Finds the real input via the frame DOM (opacity/visibility aware, unlike
   * Playwright's visible filter), clicks it at page coordinates (iframe offset
   * + inner rect) to focus, types, and verifies the value stuck — retrying.
   */
  private async enterIframePasscode(code: string): Promise<void> {
    // Re-resolve the frame each time — the iframe may reload while loading.
    const findRect = async () => {
      const frame = this.page.frames().find((f) => f.url().includes('go-booking'));
      if (!frame) return null;
      return frame
        .evaluate(() => {
          const shown = (el: Element): boolean => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
          };
          const input = [
            ...document.querySelectorAll<HTMLInputElement>('input[placeholder="Passcode"]'),
          ].find(shown);
          if (!input) return null;
          const r = input.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, value: input.value };
        })
        .catch(() => null);
    };
    const iframeOffset = () =>
      this.page.evaluate(() => {
        const el = document.querySelector('iframe[src*="go-booking"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y };
      });

    // Wait (up to LONG) for the passcode modal to actually render.
    let rect: Awaited<ReturnType<typeof findRect>> = null;
    await expect
      .poll(
        async () => {
          rect = await findRect();
          return rect !== null;
        },
        { timeout: Timeouts.LONG },
      )
      .toBe(true);

    // Type & verify, retrying (real key events so the Vue v-model enables Accept).
    for (let attempt = 0; attempt < 6; attempt += 1) {
      rect = await findRect();
      const offset = await iframeOffset();
      if (rect && offset) {
        await this.page.mouse.click(offset.x + rect.x + rect.w / 2, offset.y + rect.y + rect.h / 2);
        await this.page.keyboard.press('Control+A');
        await this.page.keyboard.type(code, { delay: 100 });
        const after = await findRect();
        if (after?.value === code) return;
      }
      await this.page.waitForTimeout(500);
    }
    throw new Error('Failed to enter Go Booking passcode');
  }

  /** Types a numeric passcode on the visible POS numpad, then presses OK. */
  private async typePosPasscode(code: string): Promise<void> {
    for (const digit of code) {
      await this.clickVisibleKey(digit, 200);
      await this.page.waitForTimeout(120);
    }
    await this.clickVisibleKey('OK');
  }

  /** Clicks the single visible on-screen key whose text equals `label`. */
  private async clickVisibleKey(label: string, maxWidth?: number): Promise<void> {
    await this.page.evaluate(
      ({ text, width }) => {
        const visible = (el: Element): boolean => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return (
            r.width > 0 &&
            r.height > 0 &&
            s.opacity !== '0' &&
            s.visibility !== 'hidden' &&
            s.pointerEvents !== 'none'
          );
        };
        const key = [...document.querySelectorAll('button,div,span')]
          .filter(
            (el) =>
              el.textContent?.trim() === text &&
              visible(el) &&
              (width === undefined || el.getBoundingClientRect().width < width),
          )
          .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
        if (!key) throw new Error(`Numpad key not found: ${text}`);
        (key as HTMLElement).click();
      },
      { text: label, width: maxWidth },
    );
  }

  // ---- Calendar navigation & reads --------------------------------------

  /** Moves the day view by `days` relative to Today (uses the </> arrows). §11. */
  async goToDayOffset(days: number): Promise<void> {
    await this.todayButton.click();
    await this.waitCalendarReady();
    if (days === 0) return;
    const arrow = days > 0 ? this.nextDayButton : this.prevDayButton;
    for (let i = 0; i < Math.abs(days); i += 1) {
      await arrow.click();
      await this.page.waitForTimeout(Timeouts.DEBOUNCE);
    }
  }

  /**
   * Navigates to a bookable working day: resets to Today, then skips weekends
   * (Sat/Sun — nobody works, the whole grid is "closed"/striped) by advancing
   * to the next weekday. Returns the weekday landed on.
   */
  async goToBookableWeekday(): Promise<string> {
    await this.todayButton.click();
    await this.waitCalendarReady();
    for (let i = 0; i < 7; i += 1) {
      const weekday = await this.currentWeekday();
      if (weekday && !['sat', 'sun'].includes(weekday.toLowerCase())) {
        this.logger.info(`Booking day: ${weekday}`);
        return weekday;
      }
      this.logger.info(`${weekday ?? '?'} is a non-working day — skipping to next`);
      await this.nextDayButton.click();
      await this.page.waitForTimeout(Timeouts.DEBOUNCE);
    }
    throw new Error('Could not find a working weekday within 7 days');
  }

  /** Reads the weekday (Sun..Sat) from the calendar's current date header. */
  private currentWeekday(): Promise<string | null> {
    return this.frameDoc()
      .evaluate(() => {
        const shown = (el: Element): boolean => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
        };
        const re = /(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,?\s+\w+\s+\d{1,2},?\s+20\d\d/;
        const el = [...document.querySelectorAll('*')].find(
          (e) =>
            e.children.length <= 6 &&
            shown(e) &&
            re.test((e.textContent ?? '').replace(/\s+/g, ' ')),
        );
        const m = (el?.textContent ?? '').replace(/\s+/g, ' ').match(re);
        return m ? m[1] : null;
      })
      .catch(() => null);
  }

  /** The go-booking iframe as a Frame handle (for opacity-aware DOM reads). */
  private frameDoc() {
    const frame = this.page.frames().find((f) => f.url().includes('go-booking'));
    if (!frame) throw new Error('go-booking iframe not found');
    return frame;
  }

  /** Reads the on-screen "<n> Total" summary pill (viewport-bounded to skip hidden copies). */
  getTotalCount(): Promise<number> {
    return this.summaryCount('Total');
  }

  /** Reads the on-screen "<n> Confirmed" summary pill. §11 / TC07. */
  getConfirmedCount(): Promise<number> {
    return this.summaryCount('Confirmed');
  }

  /**
   * Reads a "<n> <label>" pill from the summary bar (`Confirmed`/`Total`/…).
   * Viewport-bounded: the DOM keeps off-screen opacity:1 template pills, so only
   * the pill actually on the summary bar is accepted.
   */
  private summaryCount(label: string): Promise<number> {
    return this.frameDoc().evaluate((lbl) => {
      const onScreen = (el: Element): boolean => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          s.visibility !== 'hidden' &&
          s.opacity !== '0' &&
          r.left >= 0 &&
          r.top >= 0 &&
          r.right <= window.innerWidth &&
          r.bottom <= window.innerHeight
        );
      };
      const re = new RegExp(`^\\d+\\s+${lbl}$`);
      const pill = [...document.querySelectorAll('*')].find(
        (e) => onScreen(e) && re.test((e.textContent ?? '').replace(/\s+/g, ' ').trim()),
      );
      const match = pill?.textContent?.match(/(\d+)/);
      return match ? Number.parseInt(match[1], 10) : 0;
    }, label);
  }

  // ---- Create appointment -----------------------------------------------

  /**
   * §4B — click an empty (white) slot under a staff column at a visible time.
   * Coordinates are computed from live bounding boxes (resolution-independent).
   * Returns the opened New Appointment modal.
   */
  async openNewAppointmentViaSlot(staff: string, timeLabel: string): Promise<NewAppointmentModal> {
    const frame = this.frameDoc();
    const offset = await this.page.evaluate(() => {
      const el = document.querySelector('iframe[src*="go-booking"]');
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y };
    });

    // Locate the slot via the frame DOM: staff column header X (a header may read
    // "Hugo 1" once it has appointments, so match by prefix) and the time-gutter
    // row Y. Opacity-aware so hidden template copies are ignored. Polled because
    // the FullCalendar grid re-renders (briefly empty) after day navigation.
    const findSlot = () =>
      frame.evaluate(
        ({ staffName, time }) => {
          const shown = (el: Element): boolean => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
          };
          const els = [...document.querySelectorAll('*')];
          const header = els.find((e) => {
            const t = (e.textContent ?? '').trim();
            return (
              shown(e) &&
              e.getBoundingClientRect().top < 360 &&
              e.children.length <= 2 &&
              (t === staffName || t.startsWith(`${staffName} `))
            );
          });
          const timeEl = els.find(
            (e) =>
              shown(e) &&
              e.getBoundingClientRect().left < 130 &&
              (e.textContent ?? '').trim() === time,
          );
          if (!header || !timeEl) return null;
          const h = header.getBoundingClientRect();
          const t = timeEl.getBoundingClientRect();
          return { x: h.x + h.width / 2, y: t.y + t.height + 8 };
        },
        { staffName: staff, time: timeLabel },
      );

    let coords: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 20 && !coords; attempt += 1) {
      coords = await findSlot();
      if (!coords) await this.page.waitForTimeout(500);
    }
    if (!coords) throw new Error(`Empty slot not found (${staff} @ ${timeLabel})`);

    await this.page.mouse.click(offset.x + coords.x, offset.y + coords.y);

    const modal = new NewAppointmentModal(this.page);
    await modal.waitOpen();
    return modal;
  }

  /**
   * §4B (robust) — open a New Appointment on the FIRST genuinely-bookable empty
   * slot in the staff's column. Clicks candidate empty cells (skipping ones
   * covered by an event) top-to-bottom, scrolling the grid, until the popup
   * opens. Striped "closed" cells simply don't open it, so they're skipped.
   * This avoids depending on a fixed visible time or a free fixed slot.
   */
  async openNewAppointmentAtFreeSlot(staff: string): Promise<NewAppointmentModal> {
    const frame = this.frameDoc();
    const offset = await this.page.evaluate(() => {
      const el = document.querySelector('iframe[src*="go-booking"]');
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y };
    });

    const candidateCells = () =>
      frame.evaluate((staffName) => {
        const shown = (el: Element): boolean => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
        };
        const header = [...document.querySelectorAll('*')].find((e) => {
          const t = (e.textContent ?? '').trim();
          return (
            shown(e) &&
            e.getBoundingClientRect().top < 360 &&
            e.children.length <= 2 &&
            (t === staffName || t.startsWith(`${staffName} `))
          );
        });
        if (!header) return [];
        const hb = header.getBoundingClientRect();
        const colX = hb.x + hb.width / 2;
        const cells = [
          ...document.querySelectorAll('div.slot-cell, td.fc-timegrid-slot-lane'),
        ].filter((c) => {
          const r = c.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            Math.abs(r.x + r.width / 2 - colX) < 45 &&
            r.top > 345 &&
            r.bottom < window.innerHeight - 8
          );
        });
        const pts: { x: number; y: number }[] = [];
        for (const c of cells) {
          const r = c.getBoundingClientRect();
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          // Skip cells covered by an event overlay (occupied): the topmost element
          // must be the cell itself or within it.
          const top = document.elementFromPoint(cx, cy);
          if (top && (c === top || c.contains(top) || top.contains(c))) pts.push({ x: cx, y: cy });
        }
        pts.sort((a, b) => a.y - b.y);
        return pts;
      }, staff);

    for (let scroll = 0; scroll < 5; scroll += 1) {
      const points = await candidateCells();
      for (const p of points) {
        await this.page.mouse.click(offset.x + p.x, offset.y + p.y);
        await this.page.waitForTimeout(Timeouts.DEBOUNCE);
        if (await this.newAppointmentOpen()) {
          const modal = new NewAppointmentModal(this.page);
          await modal.waitOpen();
          return modal;
        }
      }
      // Reveal more time rows.
      await this.page.mouse.move(offset.x + 300, offset.y + 420);
      await this.page.mouse.wheel(0, 320);
      await this.page.waitForTimeout(Timeouts.ANIMATION);
    }
    throw new Error(`No free bookable slot found for staff "${staff}"`);
  }

  /** Opacity-aware check that the New Appointment popup is open. */
  private newAppointmentOpen(): Promise<boolean> {
    return this.frameDoc()
      .evaluate(() => {
        const shown = (el: Element): boolean => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
        };
        return [...document.querySelectorAll('*')].some(
          (e) =>
            e.children.length === 0 &&
            (e.textContent ?? '').trim() === 'New Appointment' &&
            shown(e),
        );
      })
      .catch(() => false);
  }

  /** §4A — open the form via the "New" button (no time/staff pre-fill). */
  async openNewAppointmentViaButton(): Promise<NewAppointmentModal> {
    await this.newButton.click();
    await this.frame
      .getByText('New Appointment', { exact: true })
      .filter({ visible: true })
      .first()
      .click();

    const modal = new NewAppointmentModal(this.page);
    await modal.waitOpen();
    return modal;
  }

  /**
   * Asserts a booked block for `customer` shows on the calendar. §6.
   * Opacity-aware, and requires the "confirmed" status text so it matches the
   * calendar block — not a leftover success toast that only names the customer.
   */
  async expectAppointmentVisible(customer: string): Promise<void> {
    const frame = this.frameDoc();
    await expect
      .poll(
        () =>
          frame.evaluate((name) => {
            const shown = (el: Element): boolean => {
              const s = getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
            };
            return [...document.querySelectorAll('*')].some((e) => {
              const text = e.textContent ?? '';
              return shown(e) && text.includes(name) && /confirmed/i.test(text);
            });
          }, customer),
        { timeout: Timeouts.MEDIUM },
      )
      .toBe(true);
  }

  // ---- Open / edit an existing appointment (§6, TC05) --------------------

  /**
   * §6 — opens the CONFIRMED block for `customer` on the calendar, clears
   * passcode #3 ("View customer phone number") when prompted, and returns the
   * appointment detail screen ready to edit. The passcode may be skipped if the
   * session was unlocked within the last 30 minutes.
   */
  async openAppointmentDetail(customer: string): Promise<AppointmentDetailModal> {
    this.logger.info(`Open appointment detail: ${customer}`);
    await this.clickCalendarBlock(customer);
    if (await this.iframePasscodePrompted()) {
      await this.passIframePasscode(env.STORE.passcode);
    }
    const detail = new AppointmentDetailModal(this.page);
    await detail.waitOpen();
    return detail;
  }

  /** Clicks the calendar block whose subtree names `customer` (opacity-aware, hit-tested). */
  private async clickCalendarBlock(customer: string): Promise<void> {
    const offset = await this.page.evaluate(() => {
      const el = document.querySelector('iframe[src*="go-booking"]');
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y };
    });
    const point = await this.frameDoc().evaluate((name) => {
      const shown = (el: Element): boolean => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          s.visibility !== 'hidden' &&
          s.opacity !== '0' &&
          r.top > 300 && // inside the grid, below the header rows
          r.top < window.innerHeight
        );
      };
      // Leaf that shows the customer name, then climb to the event block.
      const leaf = [...document.querySelectorAll('*')].find(
        (e) => shown(e) && e.children.length === 0 && (e.textContent ?? '').includes(name),
      );
      if (!leaf) return null;
      let block: Element = leaf;
      for (let i = 0; i < 5 && block.parentElement; i += 1) {
        const r = block.getBoundingClientRect();
        if (r.height > 24 && r.width > 60) break; // reached the event block box
        block = block.parentElement;
      }
      const r = block.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      if (top && (block === top || block.contains(top) || top.contains(block))) {
        return { x: cx, y: cy };
      }
      return { x: cx, y: cy }; // fall back to the block centre even if overlapped
    }, customer);
    if (!point) throw new Error(`Calendar block not found for "${customer}"`);
    await this.page.mouse.click(offset.x + point.x, offset.y + point.y);
  }

  /** Short poll for the iframe "Passcode" field (passcode #3 may be skipped within 30 min). */
  private async iframePasscodePrompted(): Promise<boolean> {
    const check = () => {
      const frame = this.page.frames().find((f) => f.url().includes('go-booking'));
      if (!frame) return Promise.resolve(false);
      return frame
        .evaluate(() => {
          const shown = (el: Element): boolean => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
          };
          return [
            ...document.querySelectorAll<HTMLInputElement>('input[placeholder="Passcode"]'),
          ].some(shown);
        })
        .catch(() => false);
    };
    for (let i = 0; i < 8; i += 1) {
      if (await check()) return true;
      await this.page.waitForTimeout(400);
    }
    return false;
  }
}
