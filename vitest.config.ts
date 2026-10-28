import { defineConfig } from 'vitest/config';

process.loadEnvFile?.('.env');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'packages/domain/src/**/*.ts',
        'packages/application/src/**/*.ts',
        'packages/infra/src/**/*.ts',
      ],
      exclude: [
        'packages/application/src/test-doubles/**',
        'packages/infra/src/cli/**',
        '**/*.d.ts',
      ],
      thresholds: {
        'packages/domain/**': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        'packages/application/**': {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        'packages/infra/**': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        'packages/infra/src/network/ssrf-agent.ts': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
    projects: [
      {
        test: {
          name: 'domain',
          root: './packages/domain',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'application',
          root: './packages/application',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'contracts',
          root: './packages/contracts',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'infra',
          root: './packages/infra',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          fileParallelism: false,
        },
      },
      {
        test: {
          name: 'worker',
          root: './apps/worker',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          root: './apps/web',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'test-helpers',
          environment: 'node',
          include: ['tests/helpers/**/*.test.ts', 'tests/*.test.ts'],
          exclude: ['tests/integration/**', 'tests/fixtures/**'],
        },
      },
    ],
  },
});
