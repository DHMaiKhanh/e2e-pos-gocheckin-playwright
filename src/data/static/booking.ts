/**
 * Static data for the Go Booking appointment flows.
 * See docs/flows/create-appointment.flow.md for the scanned source of truth.
 */

// Re-export the scanned customer catalogue so callers can pick any known
// customer (or use the dynamic picker) from one place. See customers.ts.
export {
  CUSTOMERS,
  CUSTOMER_NAMES,
  SELECTABLE_CUSTOMERS,
  pickCustomerName,
  type Customer,
} from '@data/static/customers';

/** CSS selector for the cross-origin Go Booking mini-app iframe. */
export const GO_BOOKING_IFRAME = 'iframe[src*="go-booking"]';

/**
 * Bookable staff — the day-view calendar columns (scanned via Playwright MCP
 * from the Go Booking day view). The virtual "Unassigned" column is excluded
 * because it does not pre-fill a real staff (so it yields an unconfirmed draft).
 * A test may pick ANY of these; the service picker adapts (services are
 * staff-specific — see SERVICE_CANDIDATES).
 */
export const STAFF = [
  'Hugo',
  'Linda',
  'Annie',
  'Vincent',
  'Ryan',
  'Val',
  'Evon',
  'Bob',
  'Mai',
  'Tony',
  'Wendy',
  'Jackie',
  'Andy',
] as const;

export type Staff = (typeof STAFF)[number];

/**
 * Candidate services tried in order when booking. Availability is per-staff
 * ("Service unavailable for <staff>"), so the flow picks the first candidate
 * that is available for the chosen staff. This lets ANY staff be booked without
 * hard-coding a staff→service mapping. Names scanned from the "Edit service" modal.
 */
export const SERVICE_CANDIDATES = [
  'Deluxe pedicure with gel',
  'Gel pedicure with callus removed',
  'Regular Manicure',
  'French Tip',
  'Nail Art',
  'Extra-Long Extension',
  'Specialty Shape',
  'Full Set',
  'Full Set/Gel',
  'Fill',
  'Fill/Gel',
  'Pink fill (ombre)',
  'Ombre',
  'Full set dip',
] as const;

/**
 * A staff + service pair that is known to be UNAVAILABLE for that staff (TC04).
 * Scanned: `Deluxe pedicure with gel` is offered by Hugo but NOT by Annie, so
 * selecting it under Annie's column surfaces "Service (un)available for Annie".
 * See flow doc §5.
 */
export const UNAVAILABLE_SERVICE_CASE = {
  staff: 'Annie',
  service: 'Deluxe pedicure with gel',
} as const;

/**
 * A brand-new client with an intentionally EMPTY phone number (TC03). Phone is
 * marked required ("(*) is required"), so submitting must be blocked. The name
 * is prefixed so any accidental creation is easy to spot in the demo tenant.
 */
export const NEW_CLIENT_MISSING_PHONE = {
  name: 'QA DoNotBook NoPhone',
  phone: '',
} as const;

/** Shape of the input used to create an appointment. */
export interface AppointmentInput {
  /**
   * Days to move from the calendar's "Today" before creating. A future day
   * (>= 1) has free, un-striped slots so clicking an empty cell opens the
   * New Appointment popup reliably. See flow doc §4B.
   */
  dayOffset: number;
  /** Staff column to book under — any value from STAFF (exact header label). */
  staff: Staff;
  /** A time-gutter label currently visible on the grid (e.g. "12:00 PM"). */
  timeLabel: string;
  /**
   * Existing customer to book for. Any name from CUSTOMER_NAMES (customers.ts)
   * works. Leave `undefined` to pick ANY customer dynamically from the live
   * list at run time (see NewAppointmentModal.pickCustomer) — the flow is no
   * longer tied to a single hard-coded customer like "Kevin V".
   */
  customer?: string;
  /** Tick the "Requested" flag. */
  requested: boolean;
  /** Tick the "Highlight" flag. */
  highlight: boolean;
}

/**
 * A sensible "any appointment" default against the Nail Salon Demo tenant.
 * Staff is deliberately NOT Hugo to prove any staff works; the service is
 * chosen from SERVICE_CANDIDATES based on what the staff actually offers.
 */
export const DEFAULT_APPOINTMENT: AppointmentInput = {
  // Book on today (a working weekday). Do NOT use weekends/closed days — e.g.
  // Sunday nobody works, so the whole grid is striped ("closed") and no slot is
  // bookable. `openNewAppointmentAtFreeSlot` finds the first WHITE (bookable)
  // cell, skipping striped ones, so the exact time isn't hard-coded.
  dayOffset: 0,
  // Any value from STAFF works, BUT the staff must have services assigned. In
  // the demo tenant only some staff do (e.g. Hugo); others (e.g. Linda) show
  // "Service unavailable" for every service and cannot be booked.
  staff: 'Hugo',
  // Only used by the legacy fixed-slot helper openNewAppointmentViaSlot().
  timeLabel: '12:00 PM',
  // `undefined` → the spec picks ANY customer dynamically from the live list
  // (not just "Kevin V"). Set to any name from CUSTOMER_NAMES to force a
  // specific one, e.g. customer: 'Annie Khuu'.
  customer: undefined,
  requested: true,
  highlight: true,
};
