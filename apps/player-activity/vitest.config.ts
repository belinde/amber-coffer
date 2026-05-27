import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    globals: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/**/*.component.test.{ts,tsx}'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          include: ['src/**/*.component.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
});
