import { expect, test, type Page } from "@playwright/test";

const randomSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

function slugifyLikeApi(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function signUpViaUi(page: Page, tenantName: string) {
  const suffix = randomSuffix();
  const email = `e2e-${suffix}@example.com`;
  await page.goto("/signup");
  await page.getByPlaceholder("owner@example.com").fill(email);
  await page.getByPlaceholder("Password").fill("StrongPass123!");
  await page.getByPlaceholder("Acme Corp").fill(tenantName);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator(".scopeBanner")).toBeVisible();
  return { email, tenantName };
}

test("redirect protected routes and keep KB public", async ({ page, request }) => {
  await page.goto("/integrations");
  await expect(page).toHaveURL(/\/login\?next=%2Fintegrations/);
  await expect(page.getByRole("link", { name: "Integrations" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Knowledge Base" })).toBeVisible();

  await page.goto("/v1/kb");
  await expect(page.getByRole("heading", { name: "Integration setup guides" })).toBeVisible();

  const proxyTenants = await request.get("/api/proxy/tenants");
  expect(proxyTenants.status()).toBe(401);
  expect(proxyTenants.headers()["x-request-id"]).toBeTruthy();
  await expect(await proxyTenants.json()).toMatchObject({
    error: "Not authenticated",
    requestId: expect.any(String)
  });

  const publicLogin = await request.post("/api/public/auth/login", {
    data: { email: `missing-${randomSuffix()}@example.com`, password: "wrong-password" }
  });
  expect(publicLogin.status()).toBe(401);
  expect(publicLogin.headers()["x-request-id"]).toBeTruthy();
});

test("show global logout action and enforce logout", async ({ page }) => {
  const tenantName = `Acme Ops ${randomSuffix()} !!!`;
  const expectedSlug = slugifyLikeApi(tenantName);

  await signUpViaUi(page, tenantName);
  await page.goto("/");

  const scopeBanner = page.locator(".scopeBanner");
  await expect(scopeBanner).toContainText(tenantName);
  await expect(scopeBanner).toContainText(expectedSlug);

  await expect(page.getByRole("link", { name: "Logout" })).toBeVisible();

  await page.goto("/login");
  await expect(page).not.toHaveURL(/\/login/);

  await page.getByRole("link", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "Logged out" })).toBeVisible();

  await page.goto("/integrations");
  await expect(page).toHaveURL(/\/login\?next=%2Fintegrations/);
});

test("show invalid credentials error on login failure", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("owner@example.com").fill(`missing-${randomSuffix()}@example.com`);
  await page.getByPlaceholder("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Invalid credentials")).toBeVisible();
});

test("create sub-customer without entering slug", async ({ page }) => {
  await signUpViaUi(page, `Root Tenant ${randomSuffix()}`);
  await page.goto("/settings");

  const customerName = `Finance Ops ${randomSuffix()} ***`;
  const expectedSlug = slugifyLikeApi(customerName);
  const subCustomerSection = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: "MSP sub-customers" })
  });

  await subCustomerSection.getByPlaceholder("Customer name").fill(customerName);
  await subCustomerSection.getByRole("button", { name: "Create sub-customer" }).click();
  await expect(subCustomerSection).toContainText(`(${expectedSlug})`);
});
