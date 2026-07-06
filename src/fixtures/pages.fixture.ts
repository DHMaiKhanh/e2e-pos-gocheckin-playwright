import { test as base } from '@playwright/test';
import { LoginPage } from '@pages/auth/LoginPage';
import { DashboardPage } from '@pages/dashboard/DashboardPage';
import { GoBookingPage } from '@pages/booking/GoBookingPage';

export interface PagesFixture {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  goBookingPage: GoBookingPage;
}

export const pagesFixture = base.extend<PagesFixture>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  goBookingPage: async ({ page }, use) => {
    await use(new GoBookingPage(page));
  },
});
