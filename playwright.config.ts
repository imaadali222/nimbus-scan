import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3115",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: [
    {
      command: "API_PORT=4115 npm run prisma:push -w @cspm/api -- --skip-generate && API_PORT=4115 npm run dev -w @cspm/api",
      url: "http://localhost:4115/health",
      timeout: 180_000,
      reuseExistingServer: false
    },
    {
      command: "npm exec -- next dev -p 3115",
      cwd: "apps/web",
      url: "http://localhost:3115/login",
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4115"
      }
    }
  ]
});
