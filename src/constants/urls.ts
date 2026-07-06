/**
 * Route paths for the GoCheckin POS portal, relative to `baseURL`.
 * Confirm/extend these against the running app before adding deep flows.
 */
export const Urls = {
  LOGIN: '/login',
  /** Step 2 of the store login (username/password after the store ID). */
  LOGIN_CONFIRM: '/login/confirm',
  DASHBOARD: '/',
  CHECK_IN: '/check-in',
  /** FULL POS order screen — landing page after a successful store login. */
  CHECK_OUT: '/check-out',
  /** Host route for mini-apps (e.g. Go Booking) rendered in an iframe. */
  MINI_APP: '/mini-app/app_code',
  ORDERS: '/orders',
  REPORTS: '/reports',
  SETTINGS: '/settings',
} as const;
