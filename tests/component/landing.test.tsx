import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Landing } from "@/components/features/landing/landing";
import { AFFILIATION_DISCLAIMER, DEMO_DISCLAIMER, SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

describe("landing page", () => {
  it("leads with the tagline as the only h1", () => {
    render(<Landing signedIn={false} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Cravings delivered. By Coogs, for Coogs.");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("sends visitors to the restaurants and offers sign-up, and is honest about demo mode", () => {
    render(<Landing signedIn={false} />);
    expect(screen.getByRole("link", { name: "See what's open" })).toHaveAttribute("href", "/restaurants");
    expect(screen.getByRole("link", { name: "Create your account" })).toHaveAttribute("href", "/sign-up");
    expect(screen.getByText(/menus are samples and payments are simulated/)).toBeInTheDocument();
    // Only links to pages that exist.
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "/restaurants",
      "/sign-up",
    ]);
  });

  it("doesn't ask signed-in students to sign up again", () => {
    render(<Landing signedIn />);
    expect(screen.queryByRole("link", { name: "Create your account" })).toBeNull();
    expect(screen.getByRole("link", { name: "See what's open" })).toBeInTheDocument();
  });

  it("labels the order ticket as a sample and exposes progress as an ordered list with the current step", () => {
    render(<Landing signedIn={false} />);
    const ticket = screen.getByRole("figure");
    expect(within(ticket).getByText("Sample order, showing how tracking will look.")).toBeInTheDocument();
    const progress = within(ticket).getByRole("list", { name: "Order progress" });
    expect(progress.tagName).toBe("OL");
    const current = within(progress)
      .getAllByRole("listitem")
      .filter((item) => item.getAttribute("aria-current") === "step");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Picked up");
  });
});

describe("site header", () => {
  it("offers restaurants, sign-in, and sign-up when signed out", () => {
    render(<SiteHeader user={null} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Restaurants" })).toHaveAttribute("href", "/restaurants");
    expect(within(nav).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(within(nav).getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/sign-up");
    expect(within(nav).queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: /^Cart/ })).toBeNull();
  });

  it("shows orders, the cart count, the account link, and Admin only to admins", () => {
    const { rerender } = render(<SiteHeader user={{ firstName: "Alex", isAdmin: false, cartCount: 0 }} />);
    expect(screen.getByRole("link", { name: "Alex: your account" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/orders");
    expect(screen.getByRole("link", { name: "Cart, empty" })).toHaveAttribute("href", "/cart");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();

    rerender(<SiteHeader user={{ firstName: "Ada", isAdmin: true, cartCount: 3 }} />);
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Cart, 3 items" })).toBeInTheDocument();
  });
});

describe("site footer", () => {
  it("states the non-affiliation and demo-mode disclaimers on every page", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(AFFILIATION_DISCLAIMER);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(DEMO_DISCLAIMER);
    expect(AFFILIATION_DISCLAIMER).toMatch(/not affiliated with or endorsed by the University of Houston/);
  });
});
