export const AFFILIATION_DISCLAIMER =
  "CoogCrave is an independent student project. It is not affiliated with or endorsed by the University of Houston or any restaurant shown.";

export const DEMO_DISCLAIMER = "Demo mode: menus and prices are sample data, and no real payments are taken.";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-5xl space-y-1 px-5 py-6 text-sm text-ink-muted sm:px-8">
        <p>{AFFILIATION_DISCLAIMER}</p>
        <p>{DEMO_DISCLAIMER}</p>
      </div>
    </footer>
  );
}
