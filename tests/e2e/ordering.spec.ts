import { expect, test } from "@playwright/test";

import { createConfirmedStudent, DEMO, NEW_PASSWORD, signInThroughForm } from "./support/accounts";

/**
 * Journey J1 up to PLACED (DEVELOPMENT_PLAN Phase 4 exit criterion): browse → menu → cart → checkout →
 * confirmation → history → cancel. Each test uses its own new account, so the mobile and desktop runs
 * never share a cart.
 */
test.describe("ordering (PRD CAT, CART, ORD, TRK)", () => {
  test("a student orders from a campus restaurant, tracks it, and cancels it", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createConfirmedStudent(request, baseURL!, "order");

    // Browse without signing in; every restaurant is labeled as sample data.
    await page.goto("/restaurants");
    await expect(page.getByRole("heading", { name: "Eat on campus", level: 1 })).toBeVisible();
    await page.getByLabel("Search restaurants and dishes").fill("cheeseburger");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=cheeseburger/);
    const result = page.getByRole("link", { name: /The Burger Joint/ });
    await expect(result).toContainText("Sample menu, not affiliated");
    await result.click();

    // Ordering needs an account: sign in and come back to the menu.
    await page.getByRole("link", { name: "Sign in to order" }).first().click();
    await signInThroughForm(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/restaurants\/the-burger-joint$/);

    // A required choice is enforced before anything is sent.
    await page.getByRole("button", { name: "Add Milkshake" }).click();
    const shake = page.getByRole("dialog", { name: "Milkshake" });
    await shake.getByRole("button", { name: /Add to cart/ }).click();
    await expect(shake.getByText("Choose a flavor.")).toBeVisible();
    await shake.getByRole("button", { name: "Cancel" }).click();

    // Two double cheeseburgers with bacon: $20.98, the PRD's worked example.
    await page.getByRole("button", { name: "Add Double cheeseburger" }).click();
    const burger = page.getByRole("dialog", { name: "Double cheeseburger" });
    await burger.getByRole("checkbox", { name: /Bacon/ }).check();
    await burger.getByRole("button", { name: "One more" }).click();
    await burger.getByRole("button", { name: "Add to cart, $20.98" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Added 2 to your cart." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cart, 2 items" })).toBeVisible();

    await page.getByRole("link", { name: "Cart, 2 items" }).click();
    await expect(page.getByText("$20.98").first()).toBeVisible();
    await page.getByRole("link", { name: "Go to checkout" }).click();

    // Checkout: demo payment, server-computed totals.
    await expect(page.getByText("Demo checkout. No real payment is taken.")).toBeVisible();
    await page.getByLabel("Drop-off building").selectOption({ label: "M.D. Anderson Memorial Library" });
    await page.getByLabel("Instructions for your courier (optional)").fill("By the bike racks");
    await page.getByRole("radio", { name: "$3.00" }).check({ force: true });
    const placeButton = page.getByRole("button", { name: "Place order, $29.34" });
    await expect(placeButton).toBeEnabled();
    // Double-click: the Idempotency-Key makes it one order.
    await placeButton.dblclick();

    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}\?placed=1$/);
    await expect(page.getByText("Order placed. We'll keep this page up to date")).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("status")
        .filter({ hasText: /^Order placed$/ }),
    ).toBeVisible();
    await expect(page.getByText("By the bike racks")).toBeVisible();
    await expect(page.getByText("$29.34").first()).toBeVisible();
    const orderUrl = new URL(page.url()).pathname;

    await page.getByRole("link", { name: "Your orders" }).click();
    const inProgress = page.getByRole("list", { name: "In progress" });
    await expect(inProgress.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Cart, empty" })).toBeVisible();

    // Cancel while the restaurant hasn't confirmed.
    await page.goto(orderUrl);
    await page.getByRole("button", { name: "Cancel order" }).click();
    await page.getByRole("button", { name: "Yes, cancel order" }).click();
    await expect(page.getByText("This order was cancelled. No payment was taken.")).toBeVisible();
    await page.goto("/orders");
    await expect(page.getByRole("list", { name: "Past orders" }).getByRole("listitem")).toHaveCount(1);
  });

  test("an order page is a 404 for anyone but the customer who placed it (THREAT_MODEL T-01)", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createConfirmedStudent(request, baseURL!, "owner");
    await page.goto("/sign-in?next=%2Frestaurants%2Fthe-burger-joint");
    await signInThroughForm(page, email, NEW_PASSWORD);
    await page.getByRole("button", { name: "Add Fries" }).click();
    await page.getByRole("dialog", { name: "Fries" }).getByRole("button", { name: "One more" }).click();
    await page
      .getByRole("dialog", { name: "Fries" })
      .getByRole("button", { name: /Add to cart/ })
      .click();
    // Wait for the cart to update before leaving the page.
    await expect(page.getByRole("status").filter({ hasText: "Added 2 to your cart." })).toBeVisible();
    await page.goto("/checkout");
    await page.getByLabel("Drop-off building").selectOption({ label: "Agnes Arnold Hall" });
    await page.getByRole("button", { name: /^Place order, \$/ }).click();
    await expect(page).toHaveURL(/\/orders\//);
    const orderUrl = new URL(page.url()).pathname;

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/sign-in");
    // Another student (the demo courier; each demo account has a sign-in budget the suites share).
    await signInThroughForm(page, DEMO.courier, DEMO.password);
    await expect(page).toHaveURL(/\/profile$/);
    const response = await page.goto(orderUrl);
    expect(response?.status()).toBe(404);
  });
});
