import { type Page, expect } from '@playwright/test';
import { Timeouts } from '@configs/constants/timeouts';
import { GoBookingModal } from '@components/booking/GoBookingModal';

/**
 * Appointment detail / edit screen (`Appointment_#<id>`) inside the Go Booking
 * mini-app, reached by opening a CONFIRMED block on the calendar and clearing
 * passcode #3 ("View customer phone number"). See flow doc §6.
 *
 * Layout: status (CONFIRMED), `Copy`, `Message Detail`, `Appointment Note >`,
 * `Appointment History >`, the same `Requested`/`Highlight`/… flags as the New
 * Appointment form, and a footer action button. When no edit is pending the
 * footer reads `Done`; toggling a flag switches it to `Save`. Saving prompts a
 * "send a message?" confirmation → `Don't Send` (no SMS) / `Send`.
 *
 * Shared iframe primitives come from {@link GoBookingModal}.
 */
export class AppointmentDetailModal extends GoBookingModal {
  constructor(page: Page) {
    super(page);
  }

  /** Ready once the detail screen's status/history text is on screen. */
  async waitOpen(): Promise<void> {
    await expect
      .poll(() => this.textContains(/Appointment_#|Appointment History|Message Detail/), {
        timeout: Timeouts.LONG,
      })
      .toBe(true);
  }

  /** Reads the appointment status (e.g. "CONFIRMED") if shown. */
  getStatus(): Promise<string | null> {
    return this.frame()
      .evaluate(() => {
        const shown = (el: Element): boolean => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
        };
        const el = [...document.querySelectorAll('*')].find(
          (e) =>
            e.children.length === 0 &&
            shown(e) &&
            /^(CONFIRMED|SCHEDULE|DONE|CHECKIN|CANCELLED)$/i.test(
              (e.textContent ?? '').replace(/\s+/g, ' ').trim(),
            ),
        );
        return el ? (el.textContent ?? '').trim() : null;
      })
      .catch(() => null);
  }

  async setRequested(): Promise<void> {
    await this.clickTopmost('Requested', { exact: true });
  }

  async setHighlight(): Promise<void> {
    await this.clickTopmost('Highlight', { exact: true });
  }

  /**
   * §6 — persists a pending edit. Clicks `Save` (the footer button, which reads
   * `Done` until a flag changes), then declines the "send a message?" prompt via
   * `Don't Send` so no real SMS goes out. Resolves once the confirmation dialog
   * is gone. Pass `notify: true` to press `Send` instead (default: don't send).
   */
  async save(opts: { notify?: boolean } = {}): Promise<void> {
    this.logger.info(`Save appointment (notify=${opts.notify ?? false})`);
    const sendPrompt = () => this.textContains(/send a message|notifying about this change/i);
    await this.clickTopmost('Save', { exact: true });
    // Confirmation: "Do you want to send a message to <customer> ...".
    await this.waitUntil(sendPrompt, true, Timeouts.MEDIUM);
    await this.clickTopmost(opts.notify ? 'Send' : "Don't Send").catch(() => undefined);
    // Settle: the confirmation dialog closes after the choice.
    await this.waitUntil(sendPrompt, false, Timeouts.MEDIUM);
  }

  /**
   * Whether the given flag currently reads as enabled on the detail screen.
   * Flags are custom divs (not native checkboxes); this is a best-effort read of
   * an `active`/`checked`/`selected` marker class near the flag label, used to
   * confirm a toggle stuck after Save.
   */
  isFlagEnabled(label: string): Promise<boolean> {
    return this.frame()
      .evaluate((needle) => {
        const shown = (el: Element): boolean => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
        };
        const norm = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();
        const label = [...document.querySelectorAll('*')].find(
          (e) => shown(e) && e.children.length === 0 && norm(e.textContent) === needle,
        );
        if (!label) return false;
        let row: Element = label;
        for (let i = 0; i < 4 && row.parentElement; i += 1) row = row.parentElement;
        return /active|checked|selected|on\b|is-checked/i.test(row.className || '');
      }, label)
      .catch(() => false);
  }

  /** Closes the detail screen via its ✕ / Back control (best-effort). */
  async close(): Promise<void> {
    await this.clickTopmost('Back').catch(() => undefined);
  }
}
