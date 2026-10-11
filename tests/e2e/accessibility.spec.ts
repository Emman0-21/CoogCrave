import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { DEMO, signInThroughForm } from "./support/accounts";

/**
 * Automated accessibility check (axe, WCAG 2.1 A and AA rules) on the main pages for each role, at
 * phone and desktop widths. Automated checks catch roughly a third of real problems; they don't replace
 * keyboard and screen-reader testing, but they stop regressions in contrast, labels, and structure.
 */
async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`);
  expect(summary, `${label} has accessibility violations`).toEqual([]);
}

test("public pages", async ({ page }) => {
  for (const path of ["/", "/restaurants", "/restaurants/the-burger-joint", "/sign-in", "/sign-up"]) {
    await page.goto(path);
    await expectNoViolations(page, path);
  }
});

test("signed-in pages for students, couriers, and admins", async ({ page }, testInfo) => {
  // Sign-in is limited to 10 per account per 15 minutes, and the other journeys use these accounts too.
  // So this runs once (desktop project) and checks each page at phone and desktop widths itself.
  test.skip(testInfo.project.name.startsWith("mobile"), "covers both widths in the desktop run");
  test.setTimeout(120_000);
  const visit = async (email: string, paths: string[]) => {
    await page.context().clearCookies();
    await page.goto(`/sign-in?next=${encodeURIComponent(paths[0]!)}`);
    await signInThroughForm(page, email, DEMO.password);
    await expect(page).toHaveURL(new RegExp(`${paths[0]!.replace(/\//g, "\\/")}$`));
    for (const path of paths) {
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expectNoViolations(page, `${path} as ${email} at ${width}px`);
      }
    }
  };
  await visit(DEMO.customer, ["/orders", "/cart", "/notifications", "/profile"]);
  await visit(DEMO.courier, ["/courier", "/courier/history"]);
  await visit(DEMO.admin, [
    "/admin",
    "/admin/orders",
    "/admin/kitchen",
    "/admin/restaurants",
    "/admin/restaurants/the-taco-stand",
    "/admin/couriers",
    "/admin/users",
    "/admin/activity",
  ]);
});
