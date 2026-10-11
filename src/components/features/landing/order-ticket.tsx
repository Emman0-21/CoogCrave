export interface TicketStep {
  label: string;
  done: boolean;
  current?: boolean;
}

export interface SampleTicket {
  orderNumber: string;
  restaurant: string;
  pickup: string;
  dropOff: string;
  courier: string;
  items: { name: string; quantity: number }[];
  steps: TicketStep[];
}

/** Illustrative only — shows what order tracking will look like. Not real order data. */
export const SAMPLE_TICKET: SampleTicket = {
  orderNumber: "CC-7K3Q9",
  restaurant: "Smash & Shake",
  pickup: "Student Center South",
  dropOff: "MD Anderson Library, east entrance",
  courier: "Jordan, on foot",
  items: [
    { name: "Double smash burger, add bacon", quantity: 2 },
    { name: "Shoestring fries", quantity: 1 },
  ],
  steps: [
    { label: "Order placed", done: true },
    { label: "Ready at the counter", done: true },
    { label: "Picked up", done: true, current: true },
    { label: "Delivered", done: false },
  ],
};

export function OrderTicket({ ticket }: { ticket: SampleTicket }) {
  return (
    <figure className="mx-auto w-full max-w-sm">
      <div className="animate-ticket-print rounded-ticket bg-surface px-6 pt-8 pb-9 shadow-[0_1px_0_var(--color-line-strong)] ticket-edges">
        <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-line-strong pb-4">
          <p className="font-display text-lg font-extrabold font-wide">{ticket.restaurant}</p>
          <p className="text-sm text-ink-muted tabular-nums">{ticket.orderNumber}</p>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-b border-dashed border-line-strong py-4 text-sm">
          <dt className="text-ink-muted">Pickup</dt>
          <dd>{ticket.pickup}</dd>
          <dt className="text-ink-muted">Drop-off</dt>
          <dd className="font-bold">{ticket.dropOff}</dd>
          <dt className="text-ink-muted">Courier</dt>
          <dd>{ticket.courier}</dd>
        </dl>

        <ul className="space-y-1 border-b border-dashed border-line-strong py-4 text-sm">
          {ticket.items.map((item) => (
            <li key={item.name} className="flex gap-3">
              <span className="w-6 text-ink-muted tabular-nums">{item.quantity}×</span>
              <span>{item.name}</span>
            </li>
          ))}
        </ul>

        <ol className="space-y-2 pt-4 text-sm" aria-label="Order progress">
          {ticket.steps.map((step) => (
            <li
              key={step.label}
              aria-current={step.current ? "step" : undefined}
              className={`flex items-center gap-3 ${step.done ? "" : "text-ink-muted"}`}
            >
              <span
                aria-hidden="true"
                className={`size-3 rounded-full border-2 ${
                  step.current
                    ? "border-action bg-action"
                    : step.done
                      ? "border-ink bg-ink"
                      : "border-line-strong bg-canvas"
                }`}
              />
              <span className={step.current ? "font-bold text-action" : undefined}>{step.label}</span>
              {step.current && <span className="sr-only">(current step)</span>}
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="mt-4 text-center text-sm text-ink-muted">
        Sample order, showing how tracking will look.
      </figcaption>
    </figure>
  );
}
