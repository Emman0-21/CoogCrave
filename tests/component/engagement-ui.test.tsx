import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationList } from "@/components/features/notifications/notification-list";
import { ReviewPanel } from "@/components/features/orders/review-panel";
import type { NotificationListView, NotificationView } from "@/shared/schemas/engagement";

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
  body: JSON.parse(String(fetchMock.mock.calls[n]![1]?.body ?? "null")) as unknown,
});

const note = (id: string, overrides: Partial<NotificationView> = {}): NotificationView => ({
  id,
  type: "ORDER_DELIVERED",
  title: "Delivered",
  body: "Order CC-7K3Q9A was delivered.",
  orderId: "order-1",
  href: "/orders/order-1",
  readAt: null,
  createdAt: "2026-10-14T19:00:00.000Z",
  ...overrides,
});

describe("inbox", () => {
  const initial: NotificationListView = {
    data: [note("n1"), note("n2", { title: "On its way", readAt: "2026-10-14T19:01:00.000Z" })],
    nextCursor: "next",
    unreadCount: 1,
  };

  it("marks a notification read when it's opened, then goes to its page", async () => {
    const user = userEvent.setup();
    render(<NotificationList initial={initial} timeZone="America/Chicago" />);
    const list = screen.getByRole("list", { name: "Notifications" });
    expect(within(list).getByRole("button", { name: /^Delivered\s*\(unread\)/ })).toBeInTheDocument();
    respond(204, null);
    await user.click(within(list).getByRole("button", { name: /^Delivered/ }));
    expect(call(0)).toEqual({ url: "/api/v1/notifications/mark-read", body: { ids: ["n1"] } });
    expect(router.push).toHaveBeenCalledWith("/orders/order-1");
    expect(screen.getByText("All caught up.")).toBeInTheDocument();
  });

  it("doesn't mark an already-read notification again", async () => {
    const user = userEvent.setup();
    render(<NotificationList initial={initial} timeZone="America/Chicago" />);
    await user.click(screen.getByRole("button", { name: /^On its way/ }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/orders/order-1");
  });

  it("marks all read and refreshes the header badge", async () => {
    const user = userEvent.setup();
    render(<NotificationList initial={initial} timeZone="America/Chicago" />);
    respond(204, null);
    await user.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(call(0).body).toEqual({ all: true });
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Mark all as read" })).toBeNull();
    expect(screen.queryByText("(unread)")).toBeNull();
  });

  it("loads older notifications a page at a time", async () => {
    const user = userEvent.setup();
    render(<NotificationList initial={initial} timeZone="America/Chicago" />);
    respond(200, { data: [note("n3", { title: "Order placed" })], nextCursor: null, unreadCount: 1 });
    await user.click(screen.getByRole("button", { name: "Show older" }));
    expect(call(0).url).toBe("/api/v1/notifications?cursor=next");
    expect(await screen.findByRole("button", { name: /^Order placed/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show older" })).toBeNull();
  });

  it("explains an empty inbox", () => {
    render(
      <NotificationList
        initial={{ data: [], nextCursor: null, unreadCount: 0 }}
        timeZone="America/Chicago"
      />,
    );
    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
  });
});

describe("rating a delivery", () => {
  it("needs a star rating, then sends it with the optional comment", async () => {
    const user = userEvent.setup();
    const onReviewed = vi.fn();
    render(<ReviewPanel orderId="order-1" courierFirstName="Sam" review={null} onReviewed={onReviewed} />);
    expect(screen.getByRole("group", { name: "How was the delivery from Sam?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send rating" }));
    expect(screen.getByText("Choose 1 to 5 stars.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText("4 stars, good"));
    await user.type(screen.getByLabelText("Anything to add? (optional)"), "Quick, thanks");
    const saved = { id: "r1", rating: 4, comment: "Quick, thanks", createdAt: "2026-10-14T19:30:00.000Z" };
    respond(201, saved);
    await user.click(screen.getByRole("button", { name: "Send rating" }));
    expect(call(0)).toEqual({
      url: "/api/v1/orders/order-1/review",
      body: { rating: 4, comment: "Quick, thanks" },
    });
    expect(onReviewed).toHaveBeenCalledWith(saved);
  });

  it("shows the server's reason when the rating isn't accepted", async () => {
    const user = userEvent.setup();
    render(<ReviewPanel orderId="order-1" courierFirstName={null} review={null} onReviewed={vi.fn()} />);
    await user.click(screen.getByLabelText("5 stars, great"));
    respond(409, { error: { code: "ALREADY_REVIEWED", message: "You've already rated this delivery." } });
    await user.click(screen.getByRole("button", { name: "Send rating" }));
    expect(await screen.findByText("You've already rated this delivery.")).toBeInTheDocument();
  });

  it("shows a rating already given, in words as well as stars", () => {
    render(
      <ReviewPanel
        orderId="order-1"
        courierFirstName="Sam"
        review={{ id: "r1", rating: 5, comment: "Great", createdAt: "2026-10-14T19:30:00.000Z" }}
        onReviewed={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "Your rating" })).toHaveTextContent("5 out of 5, great");
    expect(screen.queryByRole("button", { name: "Send rating" })).toBeNull();
  });
});
