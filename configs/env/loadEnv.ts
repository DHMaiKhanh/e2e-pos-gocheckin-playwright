import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

export type EnvName = 'local' | 'stage' | 'prod';

export interface Credentials {
  username: string;
  password: string;
}

/**
 * Store-scoped login for the GoCheckin POS (2-step): a numeric store `id`
 * (tenant) followed by staff `username`/`password`. `passcode` unlocks the
 * Go Booking mini-app (and appointment PII). Demo defaults let the booking
 * suite run out-of-the-box against the "Nail Salon Demo" tenant.
 */
export interface StoreCredentials {
  id: string;
  username: string;
  password: string;
  passcode: string;
}

export interface AppEnv {
  ENV: EnvName;
  HEADLESS: boolean;
  SLOW_MO: number;

  /** Portal web app under test (UI). */
  BASE_URL: string;
  /** REST API base for the api project + service layer. */
  API_BASE_URL: string;

  API_TIMEOUT: number;

  /** Role-based seed accounts used by the auth setup project. */
  CASHIER: Credentials;
  ADMIN: Credentials;

  /** Store-scoped login used by the Go Booking / appointment flows. */
  STORE: StoreCredentials;

  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

const toBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const toInt = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Loads environment-specific .env file from configs/env/.
 * Priority:
 *   1. Real OS env vars (CI/CD secret store) — never overridden
 *   2. configs/env/.env.<ENV>
 *   3. configs/env/.env.example (defaults)
 */
export const loadEnv = (): AppEnv => {
  const envName = (process.env.ENV ?? 'local') as EnvName;
  const envDir = path.resolve(__dirname);

  for (const file of [`.env.${envName}`, '.env.example']) {
    const full = path.join(envDir, file);
    if (fs.existsSync(full)) {
      dotenv.config({ path: full, override: false });
    }
  }

  const baseUrl = process.env.BASE_URL ?? 'https://pos.gocheckin.net';

  return {
    ENV: envName,
    HEADLESS: toBool(process.env.HEADLESS, true),
    SLOW_MO: toInt(process.env.SLOW_MO, 0),

    BASE_URL: baseUrl,
    API_BASE_URL: process.env.API_BASE_URL ?? 'https://api.gocheckin.net',

    API_TIMEOUT: toInt(process.env.API_TIMEOUT, 30000),

    CASHIER: {
      username: process.env.CASHIER_USER ?? '',
      password: process.env.CASHIER_PASS ?? '',
    },
    ADMIN: {
      username: process.env.ADMIN_USER ?? '',
      password: process.env.ADMIN_PASS ?? '',
    },

    STORE: {
      id: process.env.STORE_ID ?? '100004',
      username: process.env.STORE_USER ?? 'admin',
      password: process.env.STORE_PASS ?? '123456',
      passcode: process.env.GO_BOOKING_PASSCODE ?? '8888',
    },

    LOG_LEVEL: (process.env.LOG_LEVEL as AppEnv['LOG_LEVEL']) ?? 'info',
  };
};

export const env: AppEnv = loadEnv();
