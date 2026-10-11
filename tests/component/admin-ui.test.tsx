import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminNav } from "@/components/features/admin/admin-nav";
import { DemoReset } from "@/components/features/admin/demo-reset";
import { AcceptingOrdersSwitch, MenuItemEditor, parseDollars } from "@/components/features/admin/menu-editor";
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

describe("menu editing (essentials)", () => {
  const fries = { id: "item-1", name: "Fries", priceCents: 349, isAvailable: true };

  it("reads prices the way people type them", () => {
    expect(parseDollars("4")).toBe(400);
    expect(parseDollars("4.5")).toBe(450);
    expect(parseDollars("$4.99")).toBe(499);
    expect(parseDollars("0.05")).toBe(5);
    for (const bad of ["", "abc", "4.999", "-1", "1,000", "1000"]) expect(parseDollars(bad)).toBeNull();
  });

  it("changes a price in cents, then reloads the page data", async () => {
    const user = userEvent.setup();
    render(<MenuItemEditor item={fries} />);
    const field = screen.getByLabelText("Price for Fries");
    expect(field).toHaveValue("3.49");
    await user.clear(field);
    await user.type(field, "3.99");
    respond(200, { ...fries, priceCents: 399 });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(sent()).toEqual({
      url: "/api/v1/admin/menu-items/item-1",
      method: "PATCH",
      body: { priceCents: 399 },
    });
    expect(await screen.findByText("Now $3.99.")).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("refuses a price it can't read or over $100, without sending anything", async () => {
    const user = userEvent.setup();
    render(<MenuItemEditor item={fries} />);
    const field = screen.getByLabelText("Price for Fries");
    for (const bad of ["three", "150"]) {
      await user.clear(field);
      await user.type(field, bad);
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Enter a price from $0.00 to $100.00");
      expect(field).toHaveAttribute("aria-invalid", "true");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks an item sold out and back", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MenuItemEditor item={fries} />);
    respond(200, { ...fries, isAvailable: false });
    await user.click(screen.getByRole("button", { name: "Mark Fries sold out" }));
    expect(sent().body).toEqual({ isAvailable: false });

    rerender(<MenuItemEditor item={{ ...fries, isAvailable: false }} />);
    expect(screen.getByText("Sold out")).toBeInTheDocument();
    respond(200, fries);
    await user.click(screen.getByRole("button", { name: "Put Fries back on the menu" }));
    expect(sent(1).body).toEqual({ isAvailable: true });
  });

  it("shows the saved price after the page reloads its data", () => {
    const { rerender } = render(<MenuItemEditor item={fries} />);
    rerender(<MenuItemEditor item={{ ...fries, priceCents: 425 }} />);
    expect(screen.getByLabelText("Price for Fries")).toHaveValue("4.25");
  });

  it("stops and starts orders for a restaurant", async () => {
    const user = userEvent.setup();
    render(<AcceptingOrdersSwitch restaurantId="r1" restaurantName="The Burger Joint" isAcceptingOrders />);
    expect(screen.getByText("Taking orders")).toBeInTheDocument();
    respond(200, { id: "r1", isAcceptingOrders: false });
    await user.click(screen.getByRole("button", { name: "Stop taking orders at The Burger Joint" }));
    expect(sent()).toEqual({
      url: "/api/v1/admin/restaurants/r1",
      method: "PATCH",
      body: { isAcceptingOrders: false },
    });
    expect(router.refresh).toHaveBeenCalled();
  });
});
