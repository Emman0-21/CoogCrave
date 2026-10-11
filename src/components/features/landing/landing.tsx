import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

import { OrderTicket, SAMPLE_TICKET } from "./order-ticket";

export function Landing({ signedIn }: { signedIn: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 sm:px-8">
      <section
        aria-labelledby="hero-title"
        className="grid flex-1 items-center gap-12 pt-6 pb-16 md:grid-cols-[1.15fr_1fr] md:pt-10"
      >
        <div>
          <h1 id="hero-title" className="font-display text-display font-black tracking-tight text-balance">
            {/* The space keeps the two lines separate words for screen readers and copy/paste. */}
            <span className="block font-wide">Cravings delivered.</span>{" "}
            {/* Condensed type needs normal tracking and extra word spacing, or "By Coogs" reads as one word. */}
            <span className="mt-2 block tracking-normal font-narrow [word-spacing:0.12em]">
              By Coogs, for Coogs.
            </span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink-muted">
            Order from spots around campus and have it brought to your building, whether that&apos;s the
            library, your lab, or the rec, by a fellow UH student delivering between classes.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/restaurants" className={buttonClasses("primary")}>
              See what&apos;s open
            </Link>
            {!signedIn && (
              <Link href="/sign-up" className={buttonClasses("secondary")}>
                Create your account
              </Link>
            )}
          </div>
          <p className="mt-4 max-w-[34rem] text-ink-muted">
            Demo mode: menus are samples and payments are simulated, including what couriers earn.
          </p>
        </div>

        <OrderTicket ticket={SAMPLE_TICKET} />
      </section>

      <section
        aria-label="How CoogCrave works"
        className="grid gap-10 border-t border-line py-12 sm:grid-cols-2"
      >
        <div className="max-w-prose">
          <h2 className="font-display text-2xl font-extrabold">Hungry</h2>
          <p className="mt-3 leading-relaxed text-ink-muted">
            Pick a campus restaurant, choose your building as the drop-off, and follow your order from the
            counter to your door. You&apos;ll see who&apos;s bringing it.
          </p>
        </div>
        <div className="max-w-prose">
          <h2 className="font-display text-2xl font-extrabold">Between classes</h2>
          <p className="mt-3 leading-relaxed text-ink-muted">
            Turn on deliveries when you have a free hour. Take one order at a time, walk it across campus, and
            see what you&apos;d earn on each run.
          </p>
        </div>
      </section>
    </main>
  );
}
