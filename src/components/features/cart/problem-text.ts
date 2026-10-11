import { formatCents } from "@/shared/format";
import type { CartItemProblem, CartProblem } from "@/shared/schemas/ordering";

export function cartProblemText(
  problem: CartProblem,
  ctx: { restaurantName: string; minSubtotalCents: number | null },
): string {
  switch (problem) {
    case "RESTAURANT_CLOSED":
      return `${ctx.restaurantName} isn't taking orders right now. Your cart is saved for when it opens.`;
    case "ITEM_PROBLEMS":
      return "Some items changed since you added them. Remove or replace the marked items to check out.";
    case "BELOW_MINIMUM_SUBTOTAL":
      return `Orders need at least ${formatCents(ctx.minSubtotalCents ?? 0)} of food.`;
  }
}

export function itemProblemText(problem: CartItemProblem): string {
  return problem === "ITEM_UNAVAILABLE"
    ? "No longer available as chosen. Remove it to check out."
    : "Its choices changed. Remove it and add it again.";
}
