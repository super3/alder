import { defineConfig } from 'vitest/config'

// A zone west of UTC with DST, so date code that leans on UTC or steps in
// 24-hour chunks fails in tests the way it would for real users.
process.env.TZ = 'America/New_York'

// Unit tests for the frontend's pure logic. The modules under coverage hold
// the sign conventions, date math and grouping every screen depends on, so
// they're held to the same 100% bar as the server.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/plaidMapping.ts', 'src/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
})
