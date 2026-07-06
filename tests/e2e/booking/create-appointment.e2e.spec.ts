import { test, expect } from '@fixtures/index';
import { Tag } from '@/types/testTags';
import {
  DEFAULT_APPOINTMENT,
  NEW_CLIENT_MISSING_PHONE,
  UNAVAILABLE_SERVICE_CASE,
} from '@data/static/booking';

// Full journey does its own 2-step store login, so start unauthenticated.
test.use({ storageState: { cookies: [], origins: [] } });

// Each case runs the long multi-gate journey: 2-step login + 2 passcodes + grid.
const JOURNEY_TIMEOUT = 360_000;

test.describe(`Booking — create appointment ${Tag.REGRESSION} ${Tag.UI}`, () => {
  test('TC-A01/TC02 — books via an empty slot; picks ANY customer, not just Kevin V', async ({
    goBookingPage,
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT);
    const appt = DEFAULT_APPOINTMENT;

    await goBookingPage.bootstrap();
    await goBookingPage.goToDayOffset(appt.dayOffset);
    const totalBefore = await goBookingPage.getTotalCount();

    // Slot-click pre-fills a real staff (needed for a *confirmed* booking; the
    // "New" button leaves staff "Any Staffs" → only a draft).
    const modal = await goBookingPage.openNewAppointmentAtFreeSlot(appt.staff);

    // Customer is chosen dynamically from the live list (appt.customer is
    // undefined by default) — the flow is no longer tied to "Kevin V".
    const customer = await modal.pickCustomer(appt.customer);
    await modal.pickFirstAvailableService();
    if (appt.requested) await modal.setRequested();
    if (appt.highlight) await modal.setHighlight();
    await modal.book(); // resolves only once the modal closes (booking succeeded)

    await goBookingPage.expectAppointmentVisible(customer);
    expect(await goBookingPage.getTotalCount()).toBeGreaterThan(totalBefore);
  });

  test('TC01 — clicking an empty slot pre-fills a real staff (not "Any Staffs")', async ({
    goBookingPage,
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT);
    const appt = DEFAULT_APPOINTMENT;

    await goBookingPage.bootstrap();
    await goBookingPage.goToDayOffset(appt.dayOffset);

    // Opening via a slot must produce a popup pre-filled with the column's staff.
    // (No customer/service chosen and no Book → nothing is created.)
    const modal = await goBookingPage.openNewAppointmentAtFreeSlot(appt.staff);
    expect(await modal.isOpen()).toBe(true);

    const staffField = await modal.getPrefilledStaff();
    expect(staffField, 'Staff field should be readable').not.toBeNull();
    // A slot-click pre-fills a concrete staff — the opposite of the "New" button.
    expect(staffField?.toLowerCase()).not.toContain('any staff');
  });

  test('TC03 — creating a client without a phone number blocks booking', async ({
    goBookingPage,
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT);
    const appt = DEFAULT_APPOINTMENT;

    await goBookingPage.bootstrap();
    await goBookingPage.goToDayOffset(appt.dayOffset);
    const totalBefore = await goBookingPage.getTotalCount();

    const modal = await goBookingPage.openNewAppointmentAtFreeSlot(appt.staff);
    await modal.createNewClient(NEW_CLIENT_MISSING_PHONE.name, NEW_CLIENT_MISSING_PHONE.phone);
    await modal.pickFirstAvailableService().catch(() => undefined); // service is optional here
    await modal.tryBook();

    // Phone is required: the submit must NOT succeed. Primary signal = the modal
    // stays open and the day's Total does not grow; a required-field message (if
    // shown — exact copy unverified per flow §9) reinforces it.
    expect(await modal.isOpen(), 'New Appointment modal should stay open').toBe(true);
    expect(await goBookingPage.getTotalCount()).toBe(totalBefore);
  });

  test('TC04 — a service unavailable for the staff cannot be booked', async ({ goBookingPage }) => {
    test.setTimeout(JOURNEY_TIMEOUT);

    await goBookingPage.bootstrap();
    await goBookingPage.goToDayOffset(DEFAULT_APPOINTMENT.dayOffset);

    // Open under a staff that does NOT offer the chosen service.
    const modal = await goBookingPage.openNewAppointmentAtFreeSlot(UNAVAILABLE_SERVICE_CASE.staff);
    const { available } = await modal.chooseServiceExpectingAvailability(
      UNAVAILABLE_SERVICE_CASE.service,
    );
    expect(available, `"${UNAVAILABLE_SERVICE_CASE.service}" should be unavailable`).toBe(false);
  });

  test("TC05 — open a booked appointment, toggle flags, Save, Don't Send", async ({
    goBookingPage,
  }) => {
    test.setTimeout(JOURNEY_TIMEOUT);
    const appt = DEFAULT_APPOINTMENT;

    await goBookingPage.bootstrap();
    await goBookingPage.goToDayOffset(appt.dayOffset);

    // Create an appointment to edit (dynamic customer).
    const modal = await goBookingPage.openNewAppointmentAtFreeSlot(appt.staff);
    const customer = await modal.pickCustomer(appt.customer);
    await modal.pickFirstAvailableService();
    await modal.book();
    await goBookingPage.expectAppointmentVisible(customer);

    // Re-open it (passcode #3), flip a flag, Save, and decline the SMS prompt.
    const detail = await goBookingPage.openAppointmentDetail(customer);
    expect((await detail.getStatus())?.toUpperCase()).toContain('CONFIRMED');
    await detail.setHighlight();
    await detail.save({ notify: false }); // "Don't Send" — no real SMS

    // Saving closed the confirmation dialog without error → change persisted.
    expect(await detail.getStatus()).not.toBeNull();
  });
});
