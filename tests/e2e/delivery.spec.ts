import { type Browser, expect, type Page, test } from "@playwright/test";

import {
  approveCourier,
  createConfirmedStudent,
  DEMO,
  NEW_PASSWORD,
  signInThroughForm,
} from "./support/accounts";

async function signedInPage(browser: Browser, email: string, password: string, next = "/"): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await signInThroughForm(page, email, password);
  await expect(page).toHaveURL(new RegExp(`${next.replace(/\//g, "\\/")}$`));
  return page;
}

/**
 * Journeys J2 (courier delivers) and J4 (the hackathon demo): a student orders, an admin plays the
 * restaurant in the Kitchen Console, another student delivers it, and the customer watches it arrive.
 * Each run uses its own customer, courier, and drop-off building, so phone and desktop runs don't collide.
 */
test("order → kitchen → courier → delivered, seen from all three sides (J2, J4)", async ({
  browser,
  request,
  baseURL,
}, testInfo) => {
  test.setTimeout(90_000);
  const building = testInfo.project.name.startsWith("mobile") ? "Agnes Arnold Hall" : "Melcher Hall";

  // Customer orders.
  const customerEmail = await createConfirmedStudent(request, baseURL!, "j4customer");
  const customer = await signedInPage(browser, customerEmail, NEW_PASSWORD, "/restaurants/the-burger-joint");
  await customer.getByRole("button", { name: "Add Fries" }).click();
  const fries = customer.getByRole("dialog", { name: "Fries" });
  await fries.getByRole("button", { name: "One more" }).click();
  await fries.getByRole("button", { name: /Add to cart/ }).click();
  await expect(customer.getByRole("status").filter({ hasText: "Added 2 to your cart." })).toBeVisible();
  await customer.goto("/checkout");
  await customer.getByLabel("Drop-off building").selectOption({ label: building });
  await customer.getByLabel("Instructions for your courier (optional)").fill("Blue backpack, by the stairs");
  await customer.getByRole("button", { name: /^Place order, \$/ }).click();
  await expect(customer).toHaveURL(/\/orders\/[0-9a-f-]{36}/);
  const orderNumber = (await customer.getByRole("heading", { level: 1 }).textContent())!
    .replace("Order ", "")
    .trim();

  // The admin plays the kitchen.
  const kitchen = await signedInPage(browser, DEMO.admin, DEMO.password, "/admin/kitchen");
  await expect(kitchen.getByText("Simulated restaurant.")).toBeVisible();
  const ticket = kitchen.getByRole("article", { name: `Order ${orderNumber}` });
  await ticket.getByRole("button", { name: "Confirm" }).click();
  await expect(kitchen.getByText(`Order ${orderNumber} confirmed.`)).toBeVisible();
  await kitchen
    .getByRole("article", { name: `Order ${orderNumber}` })
    .getByRole("button", { name: "Mark ready" })
    .click();
  await expect(kitchen.getByText(`Order ${orderNumber} marked ready.`)).toBeVisible();
  await expect(
    kitchen
      .getByRole("region", { name: /Waiting for a courier/ })
      .getByRole("article", { name: `Order ${orderNumber}` }),
  ).toBeVisible();

  // A student courier (approved directly: the approval screen is Phase 6) picks it up and delivers.
  const courierEmail = await createConfirmedStudent(request, baseURL!, "j2courier");
  await approveCourier(courierEmail);
  const courier = await signedInPage(browser, courierEmail, NEW_PASSWORD, "/courier");
  await courier.getByRole("button", { name: "Go online" }).click();
  await expect(courier.getByText("You're online")).toBeVisible();
  const offer = courier.getByRole("listitem").filter({ hasText: building });
  await expect(offer).toContainText("The Burger Joint");
  await expect(offer).toContainText("(simulated)");
  // Offers carry no customer details (THREAT_MODEL T-05).
  await expect(offer).not.toContainText("Riley");
  await expect(offer).not.toContainText("Blue backpack");
  await offer.getByRole("button", { name: /^Accept/ }).click();

  const delivery = courier.getByRole("region", { name: `Your delivery: ${orderNumber}` });
  await expect(delivery).toBeVisible();
  await expect(delivery).toContainText("Riley N.");
  await expect(delivery).toContainText("Blue backpack, by the stairs");
  await courier.getByRole("button", { name: "I picked it up" }).click();
  await expect(courier.getByText("Bring it to the customer at the building entrance.")).toBeVisible();

  // The customer's page catches up on its own (polling), and shows who's bringing it.
  await expect(
    customer
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: /^On its way to you$/ }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(customer.getByText(/^Riley, by bike$/)).toBeVisible();

  await courier.getByRole("button", { name: "Delivered" }).click();
  await expect(courier.getByRole("heading", { name: "Deliveries ready now" })).toBeVisible();
  await expect(
    customer
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: /^Delivered$/ }),
  ).toBeVisible({
    timeout: 15_000,
  });

  // Simulated earnings: delivery fee $2.49 + $2.00 default tip.
  await courier.goto("/courier/history");
  await expect(courier.getByText("No payouts.")).toBeVisible();
  await expect(courier.getByRole("list", { name: "History" }).getByRole("listitem")).toHaveCount(1);
  await expect(courier.getByRole("list", { name: "History" })).toContainText("$4.49");
});

test("students without an approved courier profile can apply, but can't open courier-only pages", async ({
  page,
  request,
  baseURL,
}) => {
  const email = await createConfirmedStudent(request, baseURL!, "applicant");
  await page.goto("/sign-in?next=%2Fcourier");
  await signInThroughForm(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/courier$/);
  await page.getByRole("button", { name: "Apply to deliver" }).click();
  await expect(page.getByText("Choose how you'll get around campus.")).toBeVisible();
  await page.getByText("By scooter").click();
  await page.getByLabel("I agree to the courier guidelines.").check();
  await page.getByRole("button", { name: "Apply to deliver" }).click();
  await expect(page.getByText("Application received.")).toBeVisible();
  const response = await page.goto("/courier/history");
  expect(response?.status()).toBe(404);
  const kitchen = await page.goto("/admin/kitchen");
  expect(kitchen?.status()).toBe(404);
});
