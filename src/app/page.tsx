import { OrderTicket, SAMPLE_TICKET } from "@/components/features/landing/order-ticket";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <p className="font-display text-xl font-black text-action font-wide">CoogCrave</p>
      </header>

      <section
        aria-labelledby="hero-title"
        className="grid flex-1 items-center gap-12 pt-6 pb-16 md:grid-cols-[1.15fr_1fr] md:pt-12"
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
          <p className="mt-6 inline-flex rounded-control border border-line-strong px-4 py-2 text-sm">
            We&apos;re building it now. Ordering and courier sign-up open soon.
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
