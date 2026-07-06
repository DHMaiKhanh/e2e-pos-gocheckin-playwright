import { type Page, expect } from '@playwright/test';
import { Timeouts } from '@configs/constants/timeouts';
import { GoBookingModal } from '@components/booking/GoBookingModal';

/**
 * "New Appointment" popup inside the Go Booking mini-app (cross-origin iframe).
 * Encapsulates: pick/create customer → choose service → toggle flags → Book.
 * See docs/flows/create-appointment.flow.md §5–§6.
 *
 * Shared iframe primitives (frame/offset/clickTopmost/textShown/…) live on
 * {@link GoBookingModal}; this class adds the New-Appointment-specific actions.
 */
export class NewAppointmentModal extends GoBookingModal {
  constructor(page: Page) {
    super(page);
  }

  async waitOpen(): Promise<void> {
    await expect
      .poll(() => this.textShown('New Appointment'), { timeout: Timeouts.MEDIUM })
      .toBe(true);
  }

  /** Whether the New Appointment popup is still on screen (submit not accepted). */
  isOpen(): Promise<boolean> {
    return this.textShown('New Appointment');
  }

  /**
   * Picks a customer by exact name (scroll-aware, so any of the ~50 scanned
   * customers works, not only the ones visible at the top). See customers.ts.
   */
  async selectCustomer(name: string): Promise<void> {
    this.logger.info(`Select customer: ${name}`);
    await this.clickCustomerCard({ name });
  }

  /**
   * Picks ANY customer from the live list — the point of this method is that the
   * flow is NOT tied to a single hard-coded customer. Provide `name` to select a
   * specific one, or `index` to select the Nth live card; the default is index 1
   * (the second card) so the default run deliberately does not pick the first
   * customer. Returns the chosen name (for the caller's assertions).
   */
  async selectAnyCustomer(opts: { name?: string; index?: number } = {}): Promise<string> {
    if (opts.name) {
      await this.clickCustomerCard({ name: opts.name });
      return opts.name;
    }
    const chosen = await this.clickCustomerCard({ index: opts.index ?? 1 });
    this.logger.info(`Selected customer dynamically: ${chosen}`);
    return chosen;
  }

  /**
   * Convenience: select `preferred` when given, otherwise pick any customer
   * dynamically from the live list. Always returns the name actually selected.
   */
  async pickCustomer(preferred?: string): Promise<string> {
    return preferred ? this.selectAnyCustomer({ name: preferred }) : this.selectAnyCustomer();
  }

  /**
   * Reads the customer names currently shown in the New Appointment list (live).
   * This is the default ~50-customer list, or the filtered results after a
   * search. Verified via Playwright MCP: cards are alternating leaves
   * [avatar-initials, name] inside the left-column scroller.
   */
  listCustomers(): Promise<string[]> {
    return this.frame()
      .evaluate(() => {
        const norm = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();
        // The customer-list scroller is the LEFT-column scrollable div that holds
        // the "+ Create new client" button. Never fall back to document.body — a
        // wrong scroller would surface unrelated app text as "customers".
        const findScroller = (): Element | null => {
          const cands = [...document.querySelectorAll<HTMLElement>('div')].filter((el) => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return (
              r.width > 150 &&
              r.width < 620 &&
              r.left < 560 &&
              el.scrollHeight > el.clientHeight + 20 &&
              /auto|scroll/.test(s.overflowY) &&
              /create new client/i.test(el.textContent ?? '')
            );
          });
          cands.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return ra.width * ra.height - rb.width * rb.height; // innermost first
          });
          return cands[0] ?? null;
        };
        const scroller = findScroller();
        if (!scroller) return [] as string[];
        const leaves = [...scroller.querySelectorAll('*')].filter(
          (e) => e.children.length === 0 && norm(e.textContent).length > 0,
        );
        const cardLeaves = leaves.filter((e) => !/create new client/i.test(e.textContent ?? ''));
        const names: string[] = [];
        for (let i = 1; i < cardLeaves.length; i += 2) {
          const n = norm(cardLeaves[i].textContent);
          if (n) names.push(n);
        }
        return names;
      })
      .catch(() => [] as string[]);
  }

  /**
   * Clicks a customer card selected by exact `name` or by `index`.
   *
   * Name mode filters via the customer Search box first: the default list only
   * shows ~50 recent customers, but search queries the FULL customer database
   * (verified via MCP), so this reliably reaches any customer by name; the exact
   * match is preferred, else the top result. Index mode picks the Nth card from
   * the currently-shown list. Either way the card is scrolled into view, clicked
   * at its centre, and the profile card confirms the selection.
   * Returns the selected customer's name.
   */
  private async clickCustomerCard(target: { name?: string; index?: number }): Promise<string> {
    if (target.name) {
      await this.fillInputByPlaceholder('Search Name/Phone', target.name).catch(() => undefined);
      await this.page.waitForTimeout(Timeouts.DEBOUNCE);
    }
    const offset = await this.iframeOffset();
    const picked = await this.frame().evaluate(
      ({ name, index }) => {
        const norm = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();
        const findScroller = (): Element | null => {
          const cands = [...document.querySelectorAll<HTMLElement>('div')].filter((el) => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return (
              r.width > 150 &&
              r.width < 620 &&
              r.left < 560 &&
              el.scrollHeight > el.clientHeight + 20 &&
              /auto|scroll/.test(s.overflowY) &&
              /create new client/i.test(el.textContent ?? '')
            );
          });
          cands.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return ra.width * ra.height - rb.width * rb.height;
          });
          return cands[0] ?? null;
        };
        const scroller = findScroller();
        if (!scroller) return null;
        const leaves = [...scroller.querySelectorAll('*')].filter(
          (e) => e.children.length === 0 && norm(e.textContent).length > 0,
        );
        const cardLeaves = leaves.filter((e) => !/create new client/i.test(e.textContent ?? ''));
        const cards: { nm: string; card: Element }[] = [];
        for (let i = 0; i + 1 < cardLeaves.length; i += 2) {
          const nm = norm(cardLeaves[i + 1].textContent);
          let card: Element = cardLeaves[i + 1];
          for (let k = 0; k < 5 && card.parentElement; k += 1) {
            const r = card.getBoundingClientRect();
            if (r.height > 50 && r.height < 140) break;
            card = card.parentElement;
          }
          cards.push({ nm, card });
        }
        if (cards.length === 0) return null;
        let chosen: { nm: string; card: Element } | undefined;
        if (name != null) {
          // Prefer the exact match; otherwise the top (best) search result.
          chosen = cards.find((c) => c.nm === name) ?? cards[0];
        } else {
          const n = cards.length;
          const idx = index == null ? 0 : ((index % n) + n) % n;
          chosen = cards[idx];
        }
        if (!chosen) return null;
        chosen.card.scrollIntoView({ block: 'center' });
        const r = chosen.card.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, name: chosen.nm };
      },
      { name: target.name ?? null, index: target.index ?? null },
    );
    if (!picked) {
      throw new Error(
        `Customer not found: ${target.name ?? `index ${target.index}`} (New Appointment list)`,
      );
    }
    await this.page.mouse.click(offset.x + picked.x, offset.y + picked.y);
    // Profile card (Appointment/Spent/Point/Visit) confirms the selection.
    await expect
      .poll(() => this.textContains(/\bVisit\b/), { timeout: Timeouts.MEDIUM })
      .toBe(true);
    return picked.name;
  }

  /**
   * §5 — opens "+ Create new client" and fills the mini-form. Phone number is
   * marked required ("(*) is required"); pass an empty `phone` to exercise the
   * required-field guard (TC03). Leaves the form filled — the caller decides
   * whether to Book. Returns nothing; use {@link requiredPhoneError}/{@link isOpen}
   * to assert the outcome.
   */
  async createNewClient(name: string, phone: string): Promise<void> {
    this.logger.info(`Create new client: name="${name}" phone="${phone || '(empty)'}"`);
    await this.clickTopmost('Create new client');
    // The mini-form's phone/name inputs render after the panel switches.
    await expect
      .poll(() => this.placeholderPresent('Customer phone'), { timeout: Timeouts.MEDIUM })
      .toBe(true);
    if (phone !== '') await this.fillInputByPlaceholder('Customer phone', phone);
    await this.fillInputByPlaceholder('Customer name', name);
  }

  /** True while a "Customer phone" input is on screen (create-client sub-form open). */
  private placeholderPresent(placeholder: string): Promise<boolean> {
    return this.frame()
      .evaluate((ph) => {
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
        return [...document.querySelectorAll<HTMLInputElement>('input')].some(
          (i) => shown(i) && (i.placeholder ?? '').trim().startsWith(ph),
        );
      }, placeholder)
      .catch(() => false);
  }

  /**
   * Whether a required-phone validation message is on screen (TC03). The exact
   * copy is unverified (flow §9), so this matches a few likely phrasings; the
   * primary TC03 signal remains "the appointment was not created".
   */
  requiredPhoneError(): Promise<boolean> {
    return this.textContains(/phone.*(required|is required)|required.*phone|\(\*\).*required/i);
  }

  /**
   * Reads the value shown in the modal's "Staff" field (used by TC01 to prove a
   * slot-click pre-filled a real staff rather than leaving "Any Staffs"). Reads
   * the text sibling/row next to the "Staff" label. Null if it can't be read.
   */
  getPrefilledStaff(): Promise<string | null> {
    return this.frame()
      .evaluate(() => {
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
        const label = [...document.querySelectorAll('*')].find(
          (e) => shown(e) && e.children.length === 0 && norm(e.textContent) === 'Staff',
        );
        if (!label) return null;
        // Climb to the labelled row and read the value leaf that is not "Staff".
        let row: Element = label;
        for (let i = 0; i < 4 && row.parentElement; i += 1) row = row.parentElement;
        const lb = label.getBoundingClientRect();
        const value = [...row.querySelectorAll('*')]
          .filter((e) => shown(e) && e.children.length === 0)
          .map((e) => ({ el: e, t: norm(e.textContent) }))
          .find(
            ({ el, t }) =>
              t.length > 0 && t !== 'Staff' && el.getBoundingClientRect().top - lb.top < 60,
          );
        return value ? value.t : null;
      })
      .catch(() => null);
  }

  /**
   * Opens the "Edit service" modal (clicking just below the "Service" label,
   * whose field is a custom box), filters via its Search box (categories may be
   * collapsed), then picks the service by name.
   */
  async chooseService(name: string): Promise<void> {
    this.logger.info(`Choose service: ${name}`);
    await this.openServicePicker();
    await this.filterService(name);
    await this.page.waitForTimeout(Timeouts.DEBOUNCE);
    await this.clickServiceRow(name);
    // Selecting closes the Edit-service modal — detect via its Search box going
    // away (more reliable than the duplicated "Edit service" title text).
    await expect.poll(() => this.editServiceOpen(), { timeout: Timeouts.MEDIUM }).toBe(false);
    await this.page.waitForTimeout(Timeouts.ANIMATION);
  }

  /**
   * §5 / TC04 — selects a SPECIFIC service by name and reports whether it is
   * available for the currently-selected staff. Services are staff-specific
   * ("Service unavailable/not available for <staff>"): picking one a staff does
   * not offer surfaces a warning and blocks a confirmed booking. Returns
   * `{ available }` so the caller can assert either outcome.
   */
  async chooseServiceExpectingAvailability(name: string): Promise<{ available: boolean }> {
    this.logger.info(`Choose specific service (availability probe): ${name}`);
    await this.openServicePicker();
    await this.filterService(name);
    await this.page.waitForTimeout(Timeouts.DEBOUNCE);
    if (!(await this.serviceExists(name))) {
      throw new Error(`Service "${name}" not offered by this shop`);
    }
    await this.clickServiceRow(name);
    await expect.poll(() => this.editServiceOpen(), { timeout: Timeouts.MEDIUM }).toBe(false);
    await this.page.waitForTimeout(Timeouts.ANIMATION);
    const available = !(await this.serviceWarning());
    this.logger.info(`Service "${name}" available for staff: ${available}`);
    return { available };
  }

  /**
   * Picks the FIRST candidate service that is available for the current staff.
   * Services are staff-specific ("Service unavailable for <staff>"), so this
   * lets any staff be booked without a hard-coded staff→service mapping.
   * Returns the chosen service name.
   */
  async chooseAvailableService(candidates: readonly string[]): Promise<string> {
    this.logger.info(`Choose first available service from ${candidates.length} candidates`);
    for (const name of candidates) {
      await this.openServicePicker();
      await this.filterService(name);
      await this.page.waitForTimeout(Timeouts.DEBOUNCE);
      if (!(await this.serviceExists(name))) continue; // not offered by this shop
      await this.clickServiceRow(name);
      await expect.poll(() => this.editServiceOpen(), { timeout: Timeouts.MEDIUM }).toBe(false);
      await this.page.waitForTimeout(Timeouts.ANIMATION);
      // The form authoritatively flags per-staff availability AFTER selection
      // ("This Service is not available for <staff>") — the search list does not.
      if (!(await this.serviceWarning())) {
        this.logger.info(`Selected service: ${name}`);
        return name;
      }
      this.logger.info(`"${name}" unavailable for this staff — trying next`);
    }
    throw new Error('No available service found for the selected staff');
  }

  /**
   * Picks the first service that is AVAILABLE for the current staff by browsing
   * the "Edit service" list (unsearched) — the browse list annotates per-staff
   * availability ("Service unavailable for <staff>"), so this works for ANY
   * staff without knowing their service menu. Scrolls the list to find one.
   */
  async pickFirstAvailableService(): Promise<string> {
    await this.openServicePicker();
    const offset = await this.iframeOffset();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const found = await this.frame().evaluate(() => {
        const onScreen = (el: Element): boolean => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            s.visibility !== 'hidden' &&
            s.opacity !== '0' &&
            r.left >= 0 &&
            r.top >= 120 &&
            r.top < window.innerHeight - 20
          );
        };
        // Service rows carry a price like "$80.00". Climb to the row (width>300).
        const priceEls = [...document.querySelectorAll('*')].filter(
          (e) =>
            e.children.length === 0 &&
            /^\$[\d,.]+$/.test((e.textContent ?? '').trim()) &&
            onScreen(e),
        );
        for (const price of priceEls) {
          let row: Element = price;
          for (let i = 0; i < 6 && row.parentElement; i += 1) {
            if (row.getBoundingClientRect().width > 300) break;
            row = row.parentElement;
          }
          const txt = (row.textContent ?? '').replace(/\s+/g, ' ');
          if (/unavailable/i.test(txt)) continue; // not offered by this staff
          const r = row.getBoundingClientRect();
          const cx = r.x + 40; // left area (avatar/name), avoids the price hit-target
          const cy = r.y + r.height / 2;
          const top = document.elementFromPoint(cx, cy);
          if (top && (row === top || row.contains(top))) {
            const name = txt
              .replace(/\$[\d,.]+.*$/, '')
              .replace(/\b\d+'\b/g, '')
              .trim();
            return { x: cx, y: cy, name };
          }
        }
        return null;
      });

      if (found) {
        await this.page.mouse.click(offset.x + found.x, offset.y + found.y);
        await expect.poll(() => this.editServiceOpen(), { timeout: Timeouts.MEDIUM }).toBe(false);
        await this.page.waitForTimeout(Timeouts.ANIMATION);
        if (!(await this.serviceWarning())) {
          this.logger.info(`Selected service: ${found.name || '(unnamed)'}`);
          return found.name || 'service';
        }
        await this.openServicePicker(); // unexpected warning — reopen and keep scanning
      }
      // Reveal more of the list (scroll within the modal body).
      await this.page.mouse.move(offset.x + 420, offset.y + 460);
      await this.page.mouse.wheel(0, 350);
      await this.page.waitForTimeout(Timeouts.ANIMATION);
    }
    throw new Error('No available service found for the selected staff (browse)');
  }

  /** Opens the "Edit service" modal if it is not already open. */
  private async openServicePicker(): Promise<void> {
    if (await this.editServiceOpen()) return;
    const label = await this.locateTopmost('Service', true);
    if (!label) throw new Error('Service field not found');
    await this.page.mouse.click(label.x + label.w / 2, label.y + label.h + 24);
    await expect
      .poll(() => this.textShown('Edit service'), { timeout: Timeouts.MEDIUM })
      .toBe(true);
  }

  /** Whether the filtered "Edit service" list currently shows a row for `name`. */
  private serviceExists(name: string): Promise<boolean> {
    return this.frame()
      .evaluate((needle) => {
        const shown = (el: Element): boolean => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            s.visibility !== 'hidden' &&
            s.opacity !== '0' &&
            r.top >= 0 &&
            r.top < window.innerHeight
          );
        };
        const norm = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();
        return [...document.querySelectorAll('*')].some(
          (e) => shown(e) && e.children.length === 0 && norm(e.textContent).includes(needle),
        );
      }, name)
      .catch(() => false);
  }

  /** Whether the form shows an on-screen "service not available for <staff>" warning. */
  private serviceWarning(): Promise<boolean> {
    return this.textContains(/(not available|unavailable) for/i);
  }

  /**
   * Clicks a service ROW (not just its text). Climbs from the name leaf to the
   * clickable (cursor:pointer) row and clicks its center — clicking the raw
   * text node does not register a selection.
   */
  private async clickServiceRow(name: string): Promise<void> {
    const offset = await this.iframeOffset();
    const point = await this.frame().evaluate((needle) => {
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
      const leaves = [...document.querySelectorAll('*')].filter(
        (e) => shown(e) && e.children.length === 0 && norm(e.textContent).includes(needle),
      );
      for (const leaf of leaves) {
        let row: Element = leaf;
        for (let i = 0; i < 6 && row.parentElement; i += 1) {
          if (getComputedStyle(row).cursor === 'pointer') break;
          row = row.parentElement;
        }
        const r = row.getBoundingClientRect();
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        // Only accept the row that is actually on top (not under a backdrop).
        const top = document.elementFromPoint(cx, cy);
        if (top && (row === top || row.contains(top))) return { x: cx, y: cy };
      }
      return null;
    }, name);
    if (!point) throw new Error(`Service row not found (on top): ${name}`);
    await this.page.mouse.click(offset.x + point.x, offset.y + point.y);
  }

  /** True while the "Edit service" modal's own Search box is on screen. */
  private editServiceOpen(): Promise<boolean> {
    return this.frame()
      .evaluate(() => {
        const input = [...document.querySelectorAll<HTMLInputElement>('input')].find((i) => {
          const s = getComputedStyle(i);
          const r = i.getBoundingClientRect();
          const ph = (i.placeholder ?? '').trim();
          return (
            r.width > 0 &&
            r.height > 0 &&
            s.visibility !== 'hidden' &&
            s.opacity !== '0' &&
            r.top >= 0 &&
            r.top < window.innerHeight &&
            ph.startsWith('Search') &&
            ph.length < 12
          );
        });
        return !!input;
      })
      .catch(() => false);
  }

  /** Types into the "Edit service" search box to filter the (collapsible) list. */
  private async filterService(text: string): Promise<void> {
    const offset = await this.iframeOffset();
    const rect = await this.frame().evaluate(() => {
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
      const input = [...document.querySelectorAll<HTMLInputElement>('input')].find((i) => {
        const ph = (i.placeholder ?? '').trim();
        return shown(i) && ph.startsWith('Search') && ph.length < 12; // "Search ..." only
      });
      if (!input) return null;
      input.focus();
      const r = input.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (!rect) throw new Error('Edit-service search box not found');
    await this.page.mouse.click(offset.x + rect.x + rect.w / 2, offset.y + rect.y + rect.h / 2);
    await this.page.keyboard.press('Control+A'); // clear any previous query
    await this.page.keyboard.type(text, { delay: 50 });
  }

  async setRequested(): Promise<void> {
    await this.clickTopmost('Requested', { exact: true });
  }

  async setHighlight(): Promise<void> {
    await this.clickTopmost('Highlight', { exact: true });
  }

  /**
   * Submits the appointment. Success signal = the modal closes (opacity-aware).
   * If the service is not available for the staff, Book stays "Loading…" and
   * the modal never closes — the caller's calendar assertion then fails.
   */
  async book(): Promise<void> {
    this.logger.info('Book appointment');
    await this.clickTopmost('Book', { exact: true });
    // Some flows prompt to notify the customer — decline so no real SMS is sent.
    await this.clickTopmost('Don').catch(() => undefined);
    // Best-effort wait for the modal to close (the caller asserts the result).
    for (let i = 0; i < 30; i += 1) {
      if (!(await this.textShown('New Appointment'))) break;
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * Clicks Book WITHOUT waiting for success — used by negative tests (e.g. TC03)
   * that expect the submit to be blocked and the modal to stay open. Declines
   * any notify prompt to be safe. Returns after a short settle.
   */
  async tryBook(): Promise<void> {
    this.logger.info('Attempt Book (expecting it may be blocked)');
    await this.clickTopmost('Book', { exact: true });
    await this.clickTopmost('Don').catch(() => undefined);
    await this.page.waitForTimeout(Timeouts.DEBOUNCE);
  }
}
