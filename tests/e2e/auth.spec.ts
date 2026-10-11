import { expect, test } from "@playwright/test";

import {
  DEMO,
  linkFromLatestEmail,
  NEW_PASSWORD,
  signInThroughForm,
  uniqueStudentEmail,
} from "./support/accounts";

test.describe("accounts (PRD AUTH-1…8)", () => {
  test("a student registers, confirms their email, signs in, edits their profile, and signs out", async ({
    page,
  }) => {
    const email = uniqueStudentEmail("journey");

    // Register.
    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill("Alex Rivera");
    await page.getByLabel("UH email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/check-email/);
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // Confirm through the emailed link.
    await page.goto(await linkFromLatestEmail(email, "Verify your CoogCrave email"));
    await expect(page).toHaveURL(/\/sign-in\?verified=1/);
    await expect(page.getByRole("status")).toContainText("Email confirmed");

    // Sign in: lands on the profile, header shows the first name.
    await signInThroughForm(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Alex: your account" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // Edit delivery details; they persist across a reload.
    const save = page.getByRole("button", { name: "Save changes" });
    await expect(save).toBeDisabled();
    await page.getByLabel("Name couriers see").fill("Alex R.");
    await page.getByLabel("Usual drop-off building").selectOption({ label: "Agnes Arnold Hall" });
    await save.click();
    await expect(page.getByRole("status")).toHaveText(/Changes saved\./);
    await page.reload();
    await expect(page.getByLabel("Name couriers see")).toHaveValue("Alex R.");
    await expect(page.getByLabel("Usual drop-off building").locator("option:checked")).toHaveText(
      "Agnes Arnold Hall",
    );

    // Sign out; the profile is protected again.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fprofile/);
  });

  test("signed-out visitors are sent to sign in, then returned to where they were going", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fprofile/);
    await signInThroughForm(page, DEMO.customer, DEMO.password);
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByText(DEMO.customer)).toBeVisible();
  });

  test("a wrong password is refused without revealing whether the account exists", async ({ page }) => {
    await page.goto("/sign-in");
    await signInThroughForm(page, DEMO.customer, "definitely-not-the-password");
    // Scoped to <main>: Next.js keeps its own role="alert" route announcer elsewhere on the page.
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      /That email and password don't match an account\./,
    );
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("a forgotten password can be reset through the emailed link", async ({ page, request, baseURL }) => {
    const email = uniqueStudentEmail("reset");
    // Set up a confirmed account through the API (the registration UI is covered above).
    const signUp = await request.post("/api/auth/sign-up/email", {
      data: { name: "Jordan Lee", email, password: NEW_PASSWORD, callbackURL: "/sign-in?verified=1" },
      headers: { origin: baseURL! },
    });
    expect(signUp.ok()).toBe(true);
    await page.goto(await linkFromLatestEmail(email, "Verify your CoogCrave email"));

    await page.goto("/forgot-password");
    await page.getByLabel("UH email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("a reset link is on its way");

    await page.goto(await linkFromLatestEmail(email, "Reset your CoogCrave password"));
    await expect(page).toHaveURL(/\/reset-password\?token=/);
    const replacement = "quiet-meadow-lantern-58";
    await page.getByLabel("New password").fill(replacement);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("status")).toContainText("Password saved");

    await page.getByRole("link", { name: "Sign in", exact: true }).last().click();
    await signInThroughForm(page, email, replacement);
    await expect(page).toHaveURL(/\/profile$/);
  });
});

test.describe("role isolation in the browser", () => {
  test("students can't open the admin area: it doesn't exist for them", async ({ page }) => {
    await page.goto("/sign-in");
    await signInThroughForm(page, DEMO.customer, DEMO.password);
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  });

  test("admins see the activity log", async ({ page }) => {
    await page.goto("/sign-in?next=%2Fadmin%2Factivity");
    await signInThroughForm(page, DEMO.admin, DEMO.password);
    await expect(page).toHaveURL(/\/admin\/activity$/);
    await expect(page.getByRole("heading", { name: "Activity log" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Administrative actions, newest first" })).toBeVisible();
  });
});
