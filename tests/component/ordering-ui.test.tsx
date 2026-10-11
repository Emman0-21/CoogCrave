import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutForm } from "@/components/features/cart/checkout-form";
import { PriceBreakdown } from "@/components/features/cart/price-breakdown";
import { OrderTracker } from "@/components/features/orders/order-tracker";
import { AddToCart } from "@/components/features/restaurants/add-to-cart";
import { openStatusText } from "@/components/features/restaurants/open-status";
import type { MenuItemView, OrderDetailView, QuoteView } from "@/shared/schemas/ordering";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const fetchMock = vi.fn<typeof fetch>();
beforeAll(() => {
  // jsdom doesn't implement modal dialogs; this stand-in opens and closes them like a browser would.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  Object.values(router).forEach((fn) => fn.mockReset());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}
const sentBody = (call: number) =>
  JSON.parse(String(fetchMock.mock.calls[call]![1]!.body)) as Record<string, unknown>;
const sentHeaders = (call: number) => fetchMock.mock.calls[call]![1]!.headers as Record<string, string>;

const shake: MenuItemView = {
  id: "item-shake",
  name: "Milkshake",
  description: "Thick and cold.",
  priceCents: 499,
  isAvailable: true,
  optionGroups: [
    {
      id: "g-flavor",
      name: "Flavor",
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: "o-vanilla", name: "Vanilla", priceDeltaCents: 0, isAvailable: true },
        { id: "o-choc", name: "Chocolate", priceDeltaCents: 0, isAvailable: true },
      ],
    },
    {
      id: "g-extras",
      name: "Extras",
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: "o-cream", name: "Whipped cream", priceDeltaCents: 50, isAvailable: true },
        { id: "o-sprinkles", name: "Sprinkles", priceDeltaCents: 25, isAvailable: true },
        { id: "o-cherry", name: "Cherry", priceDeltaCents: 25, isAvailable: false },
      ],
    },
  ],
};
const place = { name: "The Burger Joint", slug: "the-burger-joint" };

describe("adding to the cart", () => {
  it("explains sold-out items and asks signed-out visitors to sign in", () => {
    const { rerender } = render(
      <AddToCart item={{ ...shake, isAvailable: false }} restaurant={place} canOrder signedIn />,
    );
    expect(screen.getByText("Sold out today")).toBeInTheDocument();
    rerender(<AddToCart item={shake} restaurant={place} canOrder signedIn={false} />);
    expect(screen.getByRole("link", { name: "Sign in to order" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Frestaurants%2Fthe-burger-joint",
    );
  });

  it("checks required choices before sending, caps multi-choice groups, and prices the selection", async () => {
    const user = userEvent.setup();
    render(<AddToCart item={shake} restaurant={place} canOrder signedIn />);
    await user.click(screen.getByRole("button", { name: "Add Milkshake" }));
    const dialog = screen.getByRole("dialog", { name: "Milkshake" });

    await user.click(within(dialog).getByRole("button", { name: /Add to cart/ }));
    expect(within(dialog).getByText("Choose a flavor.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("radio", { name: "Chocolate" }));
    await user.click(within(dialog).getByRole("checkbox", { name: /Whipped cream/ }));
    await user.click(within(dialog).getByRole("checkbox", { name: /Sprinkles/ }));
    expect(within(dialog).getByRole("checkbox", { name: /Cherry/ })).toBeDisabled(); // unavailable
    await user.click(within(dialog).getByRole("button", { name: "One more" }));
    expect(within(dialog).getByRole("button", { name: "Add to cart, $11.48" })).toBeInTheDocument();

    respond(201, { items: [] });
    await user.click(within(dialog).getByRole("button", { name: "Add to cart, $11.48" }));
    expect(sentBody(0)).toEqual({
      menuItemId: "item-shake",
      quantity: 2,
      optionIds: ["o-choc", "o-cream", "o-sprinkles"],
      specialInstructions: null,
      replaceCart: false,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Added 2 to your cart.");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("offers to start a new cart when the cart holds another restaurant", async () => {
    const user = userEvent.setup();
    render(<AddToCart item={{ ...shake, optionGroups: [] }} restaurant={place} canOrder signedIn />);
    await user.click(screen.getByRole("button", { name: "Add Milkshake" }));
    respond(409, {
      error: {
        code: "CART_RESTAURANT_CONFLICT",
        message: "…",
        details: { currentRestaurant: { name: "Starbucks" } },
      },
    });
    await user.click(screen.getByRole("button", { name: /Add to cart/ }));
    expect(await screen.findByText(/Your cart has items from Starbucks/)).toBeInTheDocument();
    respond(201, { items: [] });
    await user.click(screen.getByRole("button", { name: "Start a new cart" }));
    expect(sentBody(1)).toMatchObject({ replaceCart: true });
  });
});

const quote: QuoteView = {
  lines: [],
  restaurant: {
    id: "r",
    slug: "the-burger-joint",
    name: "The Burger Joint",
    isOpenNow: true,
    isAcceptingOrders: true,
  },
  subtotalCents: 2098,
  deliveryFeeCents: 249,
  serviceFeeCents: 105,
  taxCents: 182,
  tipCents: 200,
  totalCents: 2834,
  taxIsSample: true,
  paymentMode: "DEMO",
  maxTipCents: 5000,
  canPlaceOrder: true,
  problems: [],
};
const locations = [
  { id: "loc-lib", name: "M.D. Anderson Memorial Library", shortName: "Library", description: null },
  { id: "loc-aah", name: "Agnes Arnold Hall", shortName: "AAH", description: null },
];

describe("checkout", () => {
  it("labels the demo payment and the sample tax, and quotes from the server", async () => {
    respond(200, quote);
    render(<CheckoutForm locations={locations} defaultLocationId="loc-lib" />);
    expect(await screen.findByText("$28.34", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(/Demo checkout. No real payment is taken./)).toBeInTheDocument();
    expect(screen.getByText("Tax (sample rate)")).toBeInTheDocument();
    expect(sentBody(0)).toEqual({ deliveryLocationId: "loc-lib", tipCents: 200 });
  });

  it("asks for a building first, then places the order with one Idempotency-Key reused on retry", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm locations={locations} defaultLocationId={null} />);
    await user.click(screen.getByRole("button", { name: "Place order" }));
    expect(screen.getByText("Choose where to bring your order.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    respond(200, quote);
    await user.selectOptions(screen.getByLabelText("Drop-off building"), "loc-aah");
    const place = await screen.findByRole("button", { name: "Place order, $28.34" });

    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await user.click(place);
    expect(await screen.findByText(/Couldn't reach CoogCrave/)).toBeInTheDocument();

    respond(201, { id: "order-1" });
    await user.click(screen.getByRole("button", { name: "Place order, $28.34" }));
    expect(router.push).toHaveBeenCalledWith("/orders/order-1?placed=1");

    const [firstTry, retry] = [sentHeaders(1), sentHeaders(2)];
    expect(firstTry["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(retry["idempotency-key"]).toBe(firstTry["idempotency-key"]);
    expect(sentBody(2)).toEqual({
      deliveryLocationId: "loc-aah",
      deliveryInstructions: null,
      tipCents: 200,
      expectedTotalCents: 2834,
    });
  });

  it("shows the new total when prices changed, instead of placing the order", async () => {
    const user = userEvent.setup();
    respond(200, quote);
    render(<CheckoutForm locations={locations} defaultLocationId="loc-lib" />);
    await screen.findByRole("button", { name: "Place order, $28.34" });
    respond(409, {
      error: {
        code: "PRICE_CHANGED",
        message: "…",
        details: { quote: { ...quote, totalCents: 3034, subtotalCents: 2298 } },
      },
    });
    await user.click(screen.getByRole("button", { name: "Place order, $28.34" }));
    expect(await screen.findByText(/Prices changed while you were here/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order, $30.34" })).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});

const placedOrder: OrderDetailView = {
  viewer: "CUSTOMER",
  id: "order-1",
  orderNumber: "CC-7K3Q9A",
  status: "PLACED",
  statusUpdatedAt: "2026-10-14T19:00:00.000Z",
  version: 0,
  createdAt: "2026-10-14T19:00:00.000Z",
  restaurant: { id: "r", slug: "the-burger-joint", name: "The Burger Joint", pickupLocation: "RAD Center" },
  items: [
    {
      name: "Fries",
      quantity: 2,
      unitPriceCents: 349,
      optionsTotalCents: 0,
      lineTotalCents: 698,
      options: [],
      specialInstructions: null,
    },
  ],
  price: {
    subtotalCents: 698,
    deliveryFeeCents: 249,
    serviceFeeCents: 50,
    taxCents: 62,
    tipCents: 0,
    totalCents: 1059,
  },
  deliveryLocation: { id: "loc", name: "Agnes Arnold Hall" },
  deliveryInstructions: null,
  timeline: [{ status: "PLACED", at: "2026-10-14T19:00:00.000Z", actorType: "CUSTOMER" }],
  payment: { mode: "DEMO", status: "AUTHORIZED" },
  allowedTransitions: [{ toStatus: "CANCELLED", actingAs: null, reasonRequired: false }],
};

describe("order tracking", () => {
  it("shows real steps with times, marks the current one, and makes no ETA claims (PRD TRK-1, TRK-3)", () => {
    render(<OrderTracker initial={placedOrder} timeZone="America/Chicago" />);
    const progress = screen.getByRole("list", { name: "Order progress" });
    const current = within(progress)
      .getAllByRole("listitem")
      .filter((li) => li.getAttribute("aria-current") === "step");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Order placed2:00 PM");
    expect(within(progress).getByText("Restaurant confirmed").parentElement).toHaveTextContent("(not yet)");
    expect(document.body.textContent).not.toMatch(/minutes away|ETA|arriving in/i);
  });

  it("asks before cancelling, sends the version it showed, and shows the result", async () => {
    const user = userEvent.setup();
    render(<OrderTracker initial={placedOrder} timeZone="America/Chicago" />);
    await user.click(screen.getByRole("button", { name: "Cancel order" }));
    respond(200, {
      ...placedOrder,
      status: "CANCELLED",
      version: 1,
      allowedTransitions: [],
      payment: { mode: "DEMO", status: "VOIDED" },
    });
    await user.click(screen.getByRole("button", { name: "Yes, cancel order" }));
    expect(sentBody(0)).toEqual({ toStatus: "CANCELLED", expectedVersion: 0 });
    expect(await screen.findByText("This order was cancelled. No payment was taken.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
    expect(screen.getByText("Demo payment released. Nothing was charged.")).toBeInTheDocument();
  });

  it("polls every 5 seconds while active and visible, and stops once the order is finished (PRD TRK-2)", async () => {
    vi.useFakeTimers();
    render(<OrderTracker initial={placedOrder} timeZone="America/Chicago" />);
    respond(200, { ...placedOrder, status: "CONFIRMED", version: 1 });
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Restaurant confirmed");

    respond(200, { ...placedOrder, status: "CANCELLED", version: 2, allowedTransitions: [] });
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchMock).toHaveBeenCalledTimes(2); // finished: no more requests
  });

  it("doesn't poll a finished order at all", async () => {
    vi.useFakeTimers();
    render(
      <OrderTracker
        initial={{ ...placedOrder, status: "CANCELLED", allowedTransitions: [] }}
        timeZone="America/Chicago"
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("prices and opening times", () => {
  it("itemizes every charge", () => {
    render(<PriceBreakdown price={placedOrder.price} />);
    expect(screen.getByText("Courier tip").nextSibling).toHaveTextContent("$0.00");
    expect(screen.getByText("Total").nextSibling).toHaveTextContent("$10.59");
  });

  it("words open, paused, and closed states", () => {
    const now = new Date("2026-10-14T13:00:00Z");
    const base = {
      isOpenNow: true,
      canOrder: true,
      isAcceptingOrders: true,
      closesAtMinute: 1260,
      nextOpenAt: null,
    };
    expect(openStatusText(base, now, "America/Chicago")).toBe("Open until 9:00 PM");
    expect(
      openStatusText({ ...base, canOrder: false, isAcceptingOrders: false }, now, "America/Chicago"),
    ).toBe("Not taking orders right now");
    expect(
      openStatusText(
        {
          ...base,
          isOpenNow: false,
          canOrder: false,
          closesAtMinute: null,
          nextOpenAt: "2026-10-14T15:30:00Z",
        },
        now,
        "America/Chicago",
      ),
    ).toBe("Closed. Opens today at 10:30 AM");
  });
});
