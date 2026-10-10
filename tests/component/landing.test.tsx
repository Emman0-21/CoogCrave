import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";
import { AFFILIATION_DISCLAIMER, DEMO_DISCLAIMER, SiteFooter } from "@/components/layout/site-footer";

describe("landing page", () => {
  it("leads with the tagline as the only h1", () => {
    render(<HomePage />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Cravings delivered. By Coogs, for Coogs.");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("says plainly that ordering isn't open yet instead of linking to unbuilt pages", () => {
    render(<HomePage />);
    expect(screen.getByText(/Ordering and courier sign-up open soon/)).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("labels the order ticket as a sample and exposes progress as an ordered list with the current step", () => {
    render(<HomePage />);
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

describe("site footer", () => {
  it("states the non-affiliation and demo-mode disclaimers on every page", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(AFFILIATION_DISCLAIMER);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(DEMO_DISCLAIMER);
    expect(AFFILIATION_DISCLAIMER).toMatch(/not affiliated with or endorsed by the University of Houston/);
  });
});
