import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CourierApplyForm } from "@/components/features/courier/apply-form";
import { CourierDashboard } from "@/components/features/courier/courier-dashboard";
import { KitchenBoard } from "@/components/features/kitchen/kitchen-board";
import type { CourierOrderView, KitchenOrderView, OfferView } from "@/shared/schemas/delivery";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  Object.values(router).forEach((fn) => fn.mockReset());
});
afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(status === 204 ? null : JSON.stringify(body), { status }));
}
const call = (n: number) => ({
  url: String(fetchMock.mock.calls[n]![0]),
  method: fetchMock.mock.calls[n]![1]?.method,
  body: JSON.parse(String(fetchMock.mock.calls[n]![1]?.body ?? "null")) as unknown,
});

const offer: OfferView = {
  orderId: "order-1",
  restaurantName: "The Burger Joint",
  pickupLocation: "RAD Center",
  dropLocation: "Agnes Arnold Hall",
  itemCount: 2,
  readySince: "2026-10-14T19:00:00.000Z",
  estimatedPayoutCents: 549,
  payoutIsSimulated: true,
};

const active: CourierOrderView = {
  viewer: "COURIER",
  id: "order-1",
  orderNumber: "CC-7K3Q9A",
  status: "ASSIGNED",
  version: 3,
  restaurant: {
    name: "The Burger Joint",
    pickupLocation: "RAD Center",
    pickupNotes: "Shelf by the register",
  },
  items: [{ name: "Fries", quantity: 2, options: [], specialInstructions: null }],
  deliveryLocation: { name: "Agnes Arnold Hall" },
  deliveryInstructions: "East doors",
  customerName: "Alex R.",
  timeline: [],
  assignment: { assignedAt: "2026-10-14T19:05:00.000Z", pickedUpAt: null, endedAt: null, endReason: null },
  payoutCents: 549,
  payoutIsSimulated: true,
  allowedTransitions: [
    { toStatus: "READY_FOR_PICKUP", reasonRequired: true },
    { toStatus: "PICKED_UP", reasonRequired: false },
  ],
};

describe("courier dashboard", () => {
  it("shows offers with the simulated payout and accepts one", async () => {
    const user = userEvent.setup();
    render(<CourierDashboard isOnline active={null} offers={[offer]} timeZone="America/Chicago" />);
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("You'd earn $5.49 (simulated).");
    respond(200, active);
    await user.click(within(row).getByRole("button", { name: "Accept delivery from The Burger Joint" }));
    expect(call(0)).toMatchObject({
      url: "/api/v1/orders/order-1/transitions",
      body: { toStatus: "ASSIGNED" },
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("explains when another courier was faster and reloads the list", async () => {
    const user = userEvent.setup();
    render(<CourierDashboard isOnline active={null} offers={[offer]} timeZone="America/Chicago" />);
    respond(409, {
      error: { code: "OFFER_UNAVAILABLE", message: "Another courier just took this delivery." },
    });
    respond(200, { data: [] });
    await user.click(screen.getByRole("button", { name: /^Accept/ }));
    expect(await screen.findByText("Another courier just took this delivery.")).toBeInTheDocument();
    expect(await screen.findByText(/Nothing ready right now/)).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("skips an offer", async () => {
    const user = userEvent.setup();
    render(<CourierDashboard isOnline active={null} offers={[offer]} timeZone="America/Chicago" />);
    respond(204, null);
    await user.click(screen.getByRole("button", { name: "Skip delivery from The Burger Joint" }));
    expect(call(0)).toMatchObject({ url: "/api/v1/courier/offers/order-1/decline", method: "POST" });
    expect(await screen.findByText(/Nothing ready right now/)).toBeInTheDocument();
  });

  it("keeps a skipped offer and says why when skipping fails", async () => {
    const user = userEvent.setup();
    render(<CourierDashboard isOnline active={null} offers={[offer]} timeZone="America/Chicago" />);
    respond(503, { error: { code: "SERVICE_UNAVAILABLE", message: "Try again in a moment." } });
    await user.click(screen.getByRole("button", { name: "Skip delivery from The Burger Joint" }));
    expect(await screen.findByText("Try again in a moment.")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("The Burger Joint");
  });

  it("reloads the page when polling finds the courier went offline elsewhere", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<CourierDashboard isOnline active={null} offers={[offer]} timeZone="America/Chicago" />);
      respond(403, { error: { code: "COURIER_OFFLINE", message: "Go online to see deliveries." } });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(call(0).url).toBe("/api/v1/courier/offers");
      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the current delivery with only the allowed moves, and asks for a reason to give it back", async () => {
    const user = userEvent.setup();
    render(<CourierDashboard isOnline active={active} offers={[]} timeZone="America/Chicago" />);
    const panel = screen.getByRole("region", { name: "Your delivery: CC-7K3Q9A" });
    expect(panel).toHaveTextContent("Alex R. at Agnes Arnold Hall");
    expect(panel).toHaveTextContent("East doors");
    expect(within(panel).queryByRole("button", { name: "Delivered" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Couldn't deliver" })).toBeNull();

    await user.click(within(panel).getByRole("button", { name: "Give it back" }));
    const submit = within(panel).getByRole("button", { name: "Give it back" });
    expect(submit).toBeDisabled();
    await user.type(within(panel).getByLabelText("Why are you giving it back?"), "Class ran late");
    respond(200, { ...active, status: "READY_FOR_PICKUP", allowedTransitions: [] });
    await user.click(submit);
    expect(call(0).body).toEqual({
      toStatus: "READY_FOR_PICKUP",
      expectedVersion: 3,
      reason: "Class ran late",
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("goes online", async () => {
    const user = userEvent.setup();
    render(<CourierDashboard isOnline={false} active={null} offers={[]} timeZone="America/Chicago" />);
    expect(screen.getByText(/Go online to see deliveries/)).toBeInTheDocument();
    respond(200, { isOnline: true, onlineSince: "2026-10-14T19:00:00.000Z" });
    await user.click(screen.getByRole("button", { name: "Go online" }));
    expect(call(0)).toMatchObject({
      url: "/api/v1/courier/availability",
      method: "PUT",
      body: { online: true },
    });
  });
});

describe("courier application", () => {
  it("requires a way of getting around and agreement to the guidelines", async () => {
    const user = userEvent.setup();
    render(<CourierApplyForm />);
    await user.click(screen.getByRole("button", { name: "Apply to deliver" }));
    expect(screen.getByText("Choose how you'll get around campus.")).toBeInTheDocument();
    await user.click(screen.getByText("By bike"));
    await user.click(screen.getByRole("button", { name: "Apply to deliver" }));
    expect(screen.getByText("Agree to the courier guidelines to apply.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText("I agree to the courier guidelines."));
    respond(201, { status: "PENDING" });
    await user.click(screen.getByRole("button", { name: "Apply to deliver" }));
    expect(call(0).body).toEqual({ transportMode: "BIKE", acceptGuidelines: true });
  });
});

const ticket: KitchenOrderView = {
  id: "order-1",
  orderNumber: "CC-7K3Q9A",
  status: "PLACED",
  version: 0,
  restaurantName: "The Burger Joint",
  placedAt: "2026-10-14T19:00:00.000Z",
  statusUpdatedAt: "2026-10-14T19:00:00.000Z",
  dropLocation: "Agnes Arnold Hall",
  items: [{ name: "Fries", quantity: 2, options: [], specialInstructions: "Extra salt" }],
};

describe("Kitchen Console", () => {
  it("confirms as the simulated restaurant, sending the version it showed", async () => {
    const user = userEvent.setup();
    render(<KitchenBoard initial={[ticket]} timeZone="America/Chicago" />);
    const card = screen.getByRole("article", { name: "Order CC-7K3Q9A" });
    expect(card).toHaveTextContent("Note: Extra salt");
    respond(200, { ...ticket, status: "CONFIRMED", version: 1 });
    respond(200, { data: [{ ...ticket, status: "CONFIRMED", version: 1 }] });
    await user.click(within(card).getByRole("button", { name: "Confirm" }));
    expect(call(0).body).toEqual({ toStatus: "CONFIRMED", actingAs: "RESTAURANT_SIM", expectedVersion: 0 });
    expect(await screen.findByText("Order CC-7K3Q9A confirmed.")).toBeInTheDocument();
    const preparing = screen.getByRole("region", { name: /Preparing/ });
    expect(within(preparing).getByRole("button", { name: "Mark ready" })).toBeInTheDocument();
  });

  it("needs a reason before rejecting", async () => {
    const user = userEvent.setup();
    render(<KitchenBoard initial={[ticket]} timeZone="America/Chicago" />);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("button", { name: "Reject order" })).toBeDisabled();
    await user.type(screen.getByLabelText("Reason for the customer"), "Out of fries");
    respond(200, { ...ticket, status: "CANCELLED", version: 1 });
    respond(200, { data: [] });
    await user.click(screen.getByRole("button", { name: "Reject order" }));
    expect(call(0).body).toEqual({
      toStatus: "CANCELLED",
      actingAs: "RESTAURANT_SIM",
      expectedVersion: 0,
      reason: "Out of fries",
    });
    expect(await screen.findByText("Order CC-7K3Q9A rejected.")).toBeInTheDocument();
  });
});
