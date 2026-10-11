import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordForm } from "@/components/features/auth/password-reset-forms";
import { SignInForm } from "@/components/features/auth/sign-in-form";
import { SignUpForm } from "@/components/features/auth/sign-up-form";
import { ProfileForm } from "@/components/features/profile/profile-form";
import { PasswordField, TextField } from "@/components/ui/field";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  Object.values(router).forEach((fn) => fn.mockReset());
});
afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers }));
}

describe("form fields (accessibility)", () => {
  it("associates label, hint, and error with the input", () => {
    render(
      <TextField id="email" label="UH email" hint="Ends in uh.edu" error="Enter a valid email address." />,
    );
    const input = screen.getByLabelText("UH email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Ends in uh.edu Enter a valid email address.");
  });

  it("lets people reveal the password they typed", async () => {
    const user = userEvent.setup();
    render(<PasswordField id="pw" label="Password" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("SignUpForm", () => {
  it("validates in the browser before sending anything", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Use at least 10 characters.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Full name")).toHaveFocus();
  });

  it("puts server errors on the field they belong to", async () => {
    const user = userEvent.setup();
    respond(400, {
      code: "EMAIL_DOMAIN_NOT_ALLOWED",
      message: "Sign up with your University of Houston email (uh.edu).",
    });
    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Full name"), "Alex Rivera");
    await user.type(screen.getByLabelText("UH email"), "alex@gmail.com");
    await user.type(screen.getByLabelText("Password"), "violet-harbor-cactus-91");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(
      await screen.findByText("Sign up with your University of Houston email (uh.edu)."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("UH email")).toHaveAttribute("aria-invalid", "true");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("sends JSON with a same-site callback and goes to the check-email page", async () => {
    const user = userEvent.setup();
    respond(200, { token: null, user: {} });
    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Full name"), "Alex Rivera");
    await user.type(screen.getByLabelText("UH email"), "Alex@CougarNet.uh.edu");
    await user.type(screen.getByLabelText("Password"), "violet-harbor-cactus-91");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await vi.waitFor(() => expect(router.push).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/sign-up/email");
    expect(JSON.parse(init!.body as string)).toEqual({
      name: "Alex Rivera",
      email: "Alex@CougarNet.uh.edu",
      password: "violet-harbor-cactus-91",
      callbackURL: "/sign-in?verified=1",
    });
    expect(router.push).toHaveBeenCalledWith("/check-email?email=alex%40cougarnet.uh.edu");
  });
});

describe("SignInForm", () => {
  async function submit(email = "alex@uh.edu", password = "whatever-password") {
    const user = userEvent.setup();
    render(<SignInForm next="/profile" />);
    await user.type(screen.getByLabelText("UH email"), email);
    await user.type(screen.getByLabelText("Password"), password);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("goes to the requested page after signing in", async () => {
    respond(200, { token: "t", user: {} });
    await submit();
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/profile"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("explains a wrong email or password without saying which", async () => {
    respond(401, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" });
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email and password don't match an account.",
    );
  });

  it("tells unverified users a new link was sent", async () => {
    respond(403, { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" });
    await submit();
    expect(await screen.findByRole("status")).toHaveTextContent("We just sent a new link");
  });

  it("shows how long to wait when rate limited", async () => {
    respond(
      429,
      { error: { code: "RATE_LIMITED", message: "Too many requests." } },
      { "retry-after": "600" },
    );
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 10 minutes.");
  });

  it("reports network failures plainly", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach CoogCrave.");
  });
});

describe("ResetPasswordForm", () => {
  it("shows the server's strength feedback on the password field", async () => {
    const user = userEvent.setup();
    respond(400, { code: "PASSWORD_TOO_WEAK", message: "This password is too easy to guess." });
    render(<ResetPasswordForm token="tok_12345678" />);
    await user.type(screen.getByLabelText("New password"), "password1234");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText("This password is too easy to guess.")).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      token: "tok_12345678",
      newPassword: "password1234",
    });
  });

  it("offers a new link when the token is spent", async () => {
    const user = userEvent.setup();
    respond(400, { code: "INVALID_TOKEN", message: "Invalid token" });
    render(<ResetPasswordForm token="tok_12345678" />);
    await user.type(screen.getByLabelText("New password"), "violet-harbor-cactus-91");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("expired or was already used");
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});

describe("ProfileForm", () => {
  const locations = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "MD Anderson Library",
      shortName: "Library",
      description: null,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Agnes Arnold Hall",
      shortName: "AAH",
      description: null,
    },
  ];

  it("saves only when something changed, and sends nulls for cleared fields", async () => {
    const user = userEvent.setup();
    render(<ProfileForm displayName="AR" defaultLocationId={locations[0]!.id} locations={locations} />);
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    await user.clear(screen.getByLabelText("Name couriers see"));
    await user.selectOptions(screen.getByLabelText("Usual drop-off building"), "");
    respond(200, { profile: { displayName: null, defaultLocationId: null } });
    await user.click(save);
    expect(await screen.findByRole("status")).toHaveTextContent("Changes saved.");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/me");
    expect(init!.method).toBe("PATCH");
    expect(JSON.parse(init!.body as string)).toEqual({ displayName: null, defaultLocationId: null });
  });

  it("shows an invalid building on the building field", async () => {
    const user = userEvent.setup();
    render(<ProfileForm displayName={null} defaultLocationId={null} locations={locations} />);
    await user.selectOptions(screen.getByLabelText("Usual drop-off building"), locations[1]!.id);
    respond(422, {
      error: { code: "INVALID_LOCATION", message: "Choose a delivery building from the list." },
    });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Choose a delivery building from the list.")).toBeInTheDocument();
    expect(screen.getByLabelText("Usual drop-off building")).toHaveAttribute("aria-invalid", "true");
  });
});
