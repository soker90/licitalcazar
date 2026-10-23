import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    isolate: false,
    // .audit-work is a generated scratch worktree, not part of the project test suite.
    exclude: [...configDefaults.exclude, '**/.audit-work/**'],
  },
});
