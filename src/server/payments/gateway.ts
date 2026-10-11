import "server-only";

import { randomUUID } from "node:crypto";

/**
 * Payment port (docs/ARCHITECTURE.md §9). Services ask the gateway for a provider reference and record the
 * result in the `payments` table; swapping in a real processor (Stripe PaymentIntents with manual capture
 * map 1:1 onto authorize / capture / void) means writing another implementation of this interface.
 */
export interface PaymentGateway {
  readonly provider: "DEMO";
  /** Reserve the amount. Returns the processor's reference for later capture or void. */
  authorize(amountCents: number): Promise<{ providerReference: string }>;
  /** Collect a reserved amount (delivered orders). */
  capture(providerReference: string): Promise<void>;
  /** Release a reservation that won't be captured (cancelled or failed orders). */
  void(providerReference: string): Promise<void>;
}

/**
 * SIMULATION: moves no money and contacts no processor. It only issues a reference so the order flow,
 * the payments table, and the UI ("Demo checkout — no real payment is taken") behave like the real thing.
 */
export class DemoPaymentGateway implements PaymentGateway {
  readonly provider = "DEMO" as const;

  authorize(amountCents: number): Promise<{ providerReference: string }> {
    if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
      return Promise.reject(new RangeError(`amount must be non-negative integer cents (got ${amountCents})`));
    }
    return Promise.resolve({ providerReference: `demo_pi_${randomUUID().replaceAll("-", "")}` });
  }

  capture(providerReference: string): Promise<void> {
    if (!providerReference.startsWith("demo_pi_")) {
      return Promise.reject(new Error("Not a demo payment reference."));
    }
    return Promise.resolve();
  }

  void(providerReference: string): Promise<void> {
    if (!providerReference.startsWith("demo_pi_")) {
      return Promise.reject(new Error("Not a demo payment reference."));
    }
    return Promise.resolve();
  }
}

let gateway: PaymentGateway | undefined;

export function getPaymentGateway(): PaymentGateway {
  gateway ??= new DemoPaymentGateway();
  return gateway;
}
