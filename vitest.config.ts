import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // `node` is the default because most tests here talk to Prisma, which
    // misbehaves under jsdom. Component tests opt in per-file with a
    // `// @vitest-environment jsdom` docblock on line 1.
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
    // Several test files (`db/seed.test.ts`, `auth/session.test.ts`,
    // `db/queries/products.test.ts`) are integration tests that share one
    // live database and call `seed()` in `beforeAll`. Running test files in
    // parallel (Vitest's default) lets one file's `seed()` re-write rows
    // that another file is mid-mutation on (e.g. toggling a product's
    // `active` flag), which is a real race, not a hypothetical one. Force
    // everything to run sequentially instead.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
