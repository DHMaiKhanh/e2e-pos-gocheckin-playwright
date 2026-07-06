import { type Frame, type Page } from '@playwright/test';
import { Logger } from '@utils/logger';

/**
 * Shared base for modals rendered inside the Go Booking mini-app (cross-origin
 * iframe `iframe[src*="go-booking"]`). See docs/flows/create-appointment.flow.md.
 *
 * Go Booking renders stacked/duplicate modal instances plus hidden opacity:0
 * template copies, so Playwright's `.first()`/visible-filter can resolve to a
 * background copy that a foreground backdrop covers. Every read/click therefore
 * goes through the frame DOM with an opacity-aware `shown` check and an
 * `elementFromPoint` hit-test (`clickTopmost`) so only the element genuinely on
 * top is used. Sub-classes (NewAppointmentModal, AppointmentDetailModal) build
 * their higher-level actions on top of these primitives.
 */
export abstract class GoBookingModal {
  protected readonly logger = Logger.child({ module: this.constructor.name });

  constructor(protected readonly page: Page) {}

  /** The go-booking iframe as a Frame handle (for opacity-aware DOM reads). */
  protected frame(): Frame {
    const frame = this.page.frames().find((f) => f.url().includes('go-booking'));
    if (!frame) throw new Error('go-booking iframe not found');
    return frame;
  }

  /** Page-space top-left of the iframe, to convert frame coords → page coords. */
  protected iframeOffset(): Promise<{ x: number; y: number }> {
    return this.page.evaluate(() => {
      const el = document.querySelector('iframe[src*="go-booking"]');
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y };
    });
  }

  /**
   * Page-coordinate rect of the matching element that is actually on top
   * (elementFromPoint hit-test at its own center), skipping background copies
   * that a foreground modal backdrop covers. Null if none is clickable.
   */
  protected async locateTopmost(
    text: string,
    exact: boolean,
  ): Promise<{ x: number; y: number; w: number; h: number } | null> {
    const offset = await this.iframeOffset();
    const inner = await this.frame().evaluate(
      ({ text, exact }) => {
        const shown = (el: Element): boolean => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            s.visibility !== 'hidden' &&
            s.opacity !== '0' &&
            r.left >= 0 &&
            r.top >= 0 &&
            r.left < window.innerWidth &&
            r.top < window.innerHeight
          );
        };
        const norm = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();
        const candidates = [...document.querySelectorAll('*')].filter(
          (e) =>
            shown(e) &&
            e.children.length <= 3 &&
            (exact ? norm(e.textContent) === text : norm(e.textContent).includes(text)),
        );
        for (const el of candidates) {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          if (top && (top === el || el.contains(top) || top.contains(el))) {
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          }
        }
        return null;
      },
      { text, exact },
    );
    if (!inner) return null;
    return { x: offset.x + inner.x, y: offset.y + inner.y, w: inner.w, h: inner.h };
  }

  /** Clicks the center of the on-top element matching text (retries while it renders). */
  protected async clickTopmost(text: string, opts: { exact?: boolean } = {}): Promise<void> {
    let box: Awaited<ReturnType<typeof this.locateTopmost>> = null;
    for (let attempt = 0; attempt < 20 && !box; attempt += 1) {
      box = await this.locateTopmost(text, opts.exact ?? false);
      if (!box) await this.page.waitForTimeout(500);
    }
    if (!box) throw new Error(`No clickable element for "${text}" in Go Booking modal`);
    await this.page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  }

  /**
   * Best-effort wait until `predicate` returns the desired boolean, polling at a
   * fixed cadence up to `timeoutMs`. Unlike `expect.poll` this never throws —
   * use it for optional/soft settles inside actions (assertions belong in the
   * spec, not the page object). Returns whether the desired state was reached.
   */
  protected async waitUntil(
    predicate: () => Promise<boolean>,
    desired: boolean,
    timeoutMs = 15_000,
  ): Promise<boolean> {
    const step = 300;
    for (let elapsed = 0; elapsed <= timeoutMs; elapsed += step) {
      if ((await predicate()) === desired) return true;
      await this.page.waitForTimeout(step);
    }
    return false;
  }

  /** Opacity-aware existence check for exact text inside the iframe (for waits). */
  protected textShown(text: string): Promise<boolean> {
    return this.frame()
      .evaluate((needle) => {
        const shown = (el: Element): boolean => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
        };
        return [...document.querySelectorAll('*')].some(
          (e) => shown(e) && (e.textContent ?? '').replace(/\s+/g, ' ').trim() === needle,
        );
      }, text)
      .catch(() => false);
  }

  /**
   * Opacity-aware substring check for text on screen inside the iframe. Unlike
   * `textShown` this matches partial content (e.g. a warning sentence) and is
   * viewport-bounded so off-screen opacity:1 template copies don't count.
   */
  protected textContains(needle: string | RegExp): Promise<boolean> {
    const source = typeof needle === 'string' ? needle : needle.source;
    const flags = typeof needle === 'string' ? 'i' : needle.flags;
    return this.frame()
      .evaluate(
        ({ source, flags, isRegex }) => {
          const re = isRegex ? new RegExp(source, flags) : null;
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
              r.top < window.innerHeight
            );
          };
          return [...document.querySelectorAll('*')].some((e) => {
            const t = (e.textContent ?? '').replace(/\s+/g, ' ');
            return onScreen(e) && (re ? re.test(t) : t.includes(source));
          });
        },
        { source, flags, isRegex: typeof needle !== 'string' },
      )
      .catch(() => false);
  }

  /**
   * Fills a visible `<input>` (matched by placeholder prefix) inside the iframe.
   * Clicks it at page coordinates to focus (custom Vue inputs need a real
   * pointer), clears any prior value, then types with real key events.
   */
  protected async fillInputByPlaceholder(placeholder: string, value: string): Promise<void> {
    const offset = await this.iframeOffset();
    const rect = await this.frame().evaluate((ph) => {
      const shown = (el: Element): boolean => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          s.visibility !== 'hidden' &&
          s.opacity !== '0' &&
          r.left >= 0 &&
          r.top >= 0 &&
          r.left < window.innerWidth &&
          r.top < window.innerHeight
        );
      };
      const input = [...document.querySelectorAll<HTMLInputElement>('input')].find(
        (i) => shown(i) && (i.placeholder ?? '').trim().startsWith(ph),
      );
      if (!input) return null;
      input.focus();
      const r = input.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, placeholder);
    if (!rect) throw new Error(`Input not found for placeholder "${placeholder}"`);
    await this.page.mouse.click(offset.x + rect.x + rect.w / 2, offset.y + rect.y + rect.h / 2);
    await this.page.keyboard.press('Control+A');
    if (value === '') {
      await this.page.keyboard.press('Delete');
    } else {
      await this.page.keyboard.type(value, { delay: 50 });
    }
  }
}
