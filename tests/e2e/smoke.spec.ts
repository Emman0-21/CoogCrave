import { expect, test } from "@playwright/test";

test.describe("app shell smoke test", () => {
  test("home page renders under the strict CSP with no violations or console errors", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(error.message));
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`);
      });
    });

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-security-policy"]).toContain("'strict-dynamic'");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Cravings delivered. By Coogs, for Coogs.",
    );
    await expect(page.getByRole("contentinfo")).toContainText(
      "not affiliated with or endorsed by the University of Houston",
    );
    await expect(page.getByRole("list", { name: "Order progress" })).toBeVisible();

    // Self-hosted fonts loaded (no third-party font requests are allowed by the CSP).
    await page.evaluate(() => document.fonts.ready);
    const fontFamily = await page
      .getByRole("heading", { level: 1 })
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toContain("archivo");

    expect(problems).toEqual([]);
  });

  test("the first Tab press reaches the skip link", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });

  test("unknown pages show the not-found screen", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  });

  test("health endpoint reports the database as reachable", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", db: "ok" });
    expect(response.headers()["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
  });
});
