import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminNav } from "@/components/features/admin/admin-nav";
import { DemoReset } from "@/components/features/admin/demo-reset";
import { ReasonAction } from "@/components/features/admin/reason-action";
import { StatusBadge } from "@/components/features/admin/status-badge";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
let pathname = "/admin";
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => pathname }));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  Object.values(router).forEach((fn) => fn.mockReset());
});
afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
const sent = (n = 0) => ({
  url: String(fetchMock.mock.calls[n]![0]),
  method: fetchMock.mock.calls[n]![1]?.method,
  body: JSON.parse(String(fetchMock.mock.calls[n]![1]?.body)) as unknown,
});

const suspendProps = {
  label: "Suspend",
  accessibleLabel: "Suspend Sam Lee",
  submitLabel: "Suspend account",
  reasonLabel: "Reason",
  reasonRequired: true,
  maxLength: 300,
  method: "PATCH" as const,
  url: "/api/v1/admin/users/u1",
  body: { suspended: true },
  reasonField: "reason",
  doneText: "Suspended.",
};

describe("actions that need a reason", () => {
  it("asks for the reason first, sends it with the body, then reloads the page data", async () => {
    const user = userEvent.setup();
    render(<ReasonAction {...suspendProps} />);
    await user.click(screen.getByRole("button", { name: "Suspend Sam Lee" }));
    const submit = screen.getByRole("button", { name: "Suspend account" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Reason"), "  Fake orders  ");
    respond(200, {});
    await user.click(submit);
    expect(sent()).toEqual({
      url: "/api/v1/admin/users/u1",
      method: "PATCH",
      body: { suspended: true, reason: "Fake orders" },
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Suspended.");
  });

  it("leaves an optional note out when it's empty", async () => {
    const user = userEvent.setup();
    render(
      <ReasonAction
        {...suspendProps}
        label="Approve"
        accessibleLabel={undefined}
        submitLabel="Approve courier"
        reasonLabel="Note to the courier"
        reasonRequired={false}
        method="POST"
        url="/api/v1/admin/couriers/c1/decision"
        body={{ decision: "APPROVE" }}
        reasonField="note"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByText("(optional)")).toBeInTheDocument();
    respond(200, {});
    await user.click(screen.getByRole("button", { name: "Approve courier" }));
    expect(sent().body).toEqual({ decision: "APPROVE" });
  });

  it("shows the server's explanation and refreshes when someone else changed it first", async () => {
    const user = userEvent.setup();
    render(<ReasonAction {...suspendProps} />);
    await user.click(screen.getByRole("button", { name: "Suspend Sam Lee" }));
    await user.type(screen.getByLabelText("Reason"), "Late");
    respond(409, { error: { code: "INVALID_TRANSITION", message: "That change isn't possible right now." } });
    await user.click(screen.getByRole("button", { name: "Suspend account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That change isn't possible right now.");
    expect(router.refresh).toHaveBeenCalled();
    // The form stays open with the typed reason, so nothing is lost.
    expect(screen.getByLabelText("Reason")).toHaveValue("Late");
  });

  it("closes without sending anything", async () => {
    const user = userEvent.setup();
    render(<ReasonAction {...suspendProps} />);
    await user.click(screen.getByRole("button", { name: "Suspend Sam Lee" }));
    await user.click(screen.getByRole("button", { name: "Never mind" }));
    expect(screen.getByRole("button", { name: "Suspend Sam Lee" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("demo reset", () => {
  it("only enables the button for the exact phrase, then reports what was removed", async () => {
    const user = userEvent.setup();
    render(<DemoReset />);
    const button = screen.getByRole("button", { name: "Reset demo data" });
    await user.type(screen.getByLabelText("Type RESET DEMO DATA to confirm"), "reset demo data");
    expect(button).toBeDisabled();
    await user.clear(screen.getByLabelText("Type RESET DEMO DATA to confirm"));
    await user.type(screen.getByLabelText("Type RESET DEMO DATA to confirm"), "RESET DEMO DATA");
    respond(200, {
      resetAt: "2026-10-14T19:00:00.000Z",
      removed: { orders: 3, carts: 1, notifications: 9 },
      fixtures: { restaurants: 11, accounts: 4 },
    });
    await user.click(button);
    expect(sent().body).toEqual({ confirm: "RESET DEMO DATA" });
    expect(await screen.findByText(/Removed 3 orders and 1 cart/)).toBeInTheDocument();
  });
});

describe("admin navigation and status", () => {
  it("marks the current section and shows how many applications are waiting", () => {
    pathname = "/admin/orders/abc";
    render(<AdminNav pendingApplications={2} />);
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /^Couriers 2\s?waiting$/ })).toBeInTheDocument();
  });

  it("names the status in words, not only color", () => {
    render(<StatusBadge status="DELIVERY_FAILED" />);
    expect(screen.getByText("Delivery failed")).toBeInTheDocument();
  });
});
