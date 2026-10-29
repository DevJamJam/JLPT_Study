import { defineConfig } from '@playwright/test';

// Actual PostgreSQL + PostgREST, isolated CI database only. No browser required.
export default defineConfig({ testDir: './tests/integration', workers: 1, reporter: 'list' });
