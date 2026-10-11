import { type Browser, expect, type Page, test } from "@playwright/test";

import { createConfirmedStudent, DEMO, NEW_PASSWORD, signInThroughForm } from "./support/accounts";

async function signedInPage(browser: Browser, email: string, password: string, next: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await signInThroughForm(page, email, password);
  await expect(page).toHaveURL(new RegExp(`${next.replace(/\//g, "\\/")}$`));
  return page;
}

/**
 * Journey J3 (admin operates the platform), the parts built in Phase 6a: approve a courier who applied,
 * open an order's full record and cancel it with a reason, suspend an account and lift it again, and
 * find each of those in the activity log. Every account here is new, so runs don't affect each other.
 */
test("approve a courier, cancel an order from its record, suspend an account (J3)", async ({
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(90_000);

  // A student applies to deliver.
  const applicantEmail = await createConfirmedStudent(request, baseURL!, "j3applicant");
  const applicant = await signedInPage(browser, applicantEmail, NEW_PASSWORD, "/courier");
  await applicant.getByText("By bike").click();
  await applicant.getByLabel("I agree to the courier guidelines.").check();
  await applicant.getByRole("button", { name: "Apply to deliver" }).click();
  await expect(applicant.getByText("Application received.")).toBeVisible();

  // The admin approves them from the review queue.
  const admin = await signedInPage(browser, DEMO.admin, DEMO.password, "/admin");
  await expect(admin.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  await admin
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: /^Couriers \d+ waiting$/ })
    .click();
  await expect(admin).toHaveURL(/\/admin\/couriers$/);
  const row = admin
    .getByRole("list", { name: "Couriers" })
    .getByRole("listitem")
    .filter({ hasText: applicantEmail });
  await row.getByRole("button", { name: /^Approve/ }).click();
  await row.getByLabel(/Note to the courier/).fill("Welcome aboard");
  await row.getByRole("button", { name: "Approve courier" }).click();
  await expect(row).toHaveCount(0);

  await applicant.reload();
  await expect(applicant.getByRole("button", { name: "Go online" })).toBeVisible();

  // A customer orders; the admin opens the record and cancels it.
  const customerEmail = await createConfirmedStudent(request, baseURL!, "j3customer");
  const customer = await signedInPage(browser, customerEmail, NEW_PASSWORD, "/restaurants/the-burger-joint");
  await customer.getByRole("button", { name: "Add Fries" }).click();
  const fries = customer.getByRole("dialog", { name: "Fries" });
  await fries.getByRole("button", { name: "One more" }).click();
  await fries.getByRole("button", { name: /Add to cart/ }).click();
  await expect(customer.getByRole("status").filter({ hasText: "Added 2 to your cart." })).toBeVisible();
  await customer.goto("/checkout");
  await customer.getByLabel("Drop-off building").selectOption({ label: "M.D. Anderson Memorial Library" });
  await customer.getByRole("button", { name: /^Place order, \$/ }).click();
  await expect(customer).toHaveURL(/\/orders\/[0-9a-f-]{36}/);
  const orderNumber = (await customer.getByRole("heading", { level: 1 }).textContent())!
    .replace("Order ", "")
    .trim();

  await admin.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Orders" }).click();
  await admin.getByLabel("Order number, customer name, or email").fill(orderNumber);
  await admin.getByRole("button", { name: "Search" }).click();
  await admin.getByRole("link", { name: orderNumber }).click();
  await expect(admin.getByRole("heading", { name: `Order ${orderNumber}` })).toBeVisible();
  await expect(admin.getByText(customerEmail)).toBeVisible();
  const history = admin.getByRole("region", { name: "History" });
  await expect(history).toContainText("New");
  await expect(history).toContainText("by customer (Riley Nguyen)");

  await admin.getByRole("button", { name: "Cancel order" }).click();
  await admin.getByLabel("Reason").fill("Duplicate order, customer asked us to cancel");
  await admin.getByRole("button", { name: "Cancel order" }).click();
  await expect(history).toContainText("Cancelled");
  await expect(history).toContainText("“Duplicate order, customer asked us to cancel”");
  await expect(admin.getByText("This order is finished. Nothing to change.")).toBeVisible();

  await customer.reload();
  await expect(customer.getByText("This order was cancelled. No payment was taken.")).toBeVisible();

  // The admin suspends the applicant, who is signed out at once, then lifts it.
  await admin.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Users" }).click();
  await admin.getByLabel("Name or email").fill(applicantEmail);
  await admin.getByRole("button", { name: "Search" }).click();
  const user = admin
    .getByRole("list", { name: "Users" })
    .getByRole("listitem")
    .filter({ hasText: applicantEmail });
  await user.getByRole("button", { name: /^Suspend/ }).click();
  await user.getByLabel("Reason").fill("Testing suspension");
  await user.getByRole("button", { name: "Suspend account" }).click();
  await expect(user).toContainText("Suspended");

  // Their session is gone, so they're back at sign-in, and signing in again is refused.
  await applicant.goto("/courier");
  await expect(applicant).toHaveURL(/\/sign-in/);
  await signInThroughForm(applicant, applicantEmail, NEW_PASSWORD);
  await expect(applicant.getByText("This account is suspended.", { exact: false })).toBeVisible();

  await user.getByRole("button", { name: /^Lift suspension/ }).click();
  await user.getByLabel("Reason").fill("Done testing");
  await user.getByRole("button", { name: "Lift suspension" }).click();
  await expect(user.getByRole("button", { name: /^Suspend/ })).toBeVisible();

  // Each action is in the activity log.
  await admin.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Activity" }).click();
  const log = admin.getByRole("table", { name: "Administrative actions, newest first" });
  for (const action of ["user.unsuspend", "user.suspend", "order.admin_cancelled", "courier.approve"]) {
    await expect(log.getByRole("cell", { name: action }).first()).toBeVisible();
  }
});

/**
 * Menu editing, essentials (PRD ADM-5): an admin marks an item sold out and the menu shows it at once;
 * then puts it back. Phone and desktop runs edit different items, so parallel runs don't collide.
 */
test("an admin marks an item sold out and back, and customers see it", async ({
  browser,
  page,
}, testInfo) => {
  const itemName = testInfo.project.name.startsWith("mobile")
    ? "Bean and cheese burrito"
    : "Egg and potato breakfast taco";
  const admin = await signedInPage(browser, DEMO.admin, DEMO.password, "/admin/restaurants");
  await admin.getByRole("link", { name: "Edit menu for The Taco Stand" }).click();
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("The Taco Stand");
  await admin.getByRole("button", { name: `Mark ${itemName} sold out` }).click();
  await expect(admin.getByText("Marked sold out.")).toBeVisible();

  // Anyone browsing sees it straight away.
  await page.goto("/restaurants/the-taco-stand");
  const row = page.getByRole("listitem").filter({ hasText: itemName });
  await expect(row).toContainText("Sold out today");

  await admin.getByRole("button", { name: `Put ${itemName} back on the menu` }).click();
  await expect(admin.getByText("Back on the menu.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: itemName })).not.toContainText("Sold out today");
});
