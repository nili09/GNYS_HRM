import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Map @hrms/shared → shared/src so tests work even before npm install
      // creates the workspace symlink.
      "@hrms/shared": resolve(__dirname, "../shared/src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/tests/**/*.test.js"],
    testTimeout: 15000,
    // forks (not threads): native addons like better-sqlite3 are not
    // thread-safe across vitest worker threads.
    pool: "forks",
  },
});
