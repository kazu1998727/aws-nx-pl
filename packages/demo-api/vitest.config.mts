import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/demo-api',
  test: {
    passWithNoTests: true,
    name: '@aws-nx-pl/demo-api',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory:
        '../../dist/packages/demo-api/test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
