/**
 * Menu option rules (PRD CART-2). An item has option groups ("Size": choose exactly 1; "Add-ons": up to
 * 3); the customer's selection must satisfy every group. Checked when an item is added to the cart and
 * again whenever the cart is read, because the menu can change in between.
 */

export interface OptionRule {
  id: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
}

export interface OptionGroupRule {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: readonly OptionRule[];
}

export interface SelectedOption {
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  priceDeltaCents: number;
}

export type OptionProblem =
  | { kind: "DUPLICATE_OPTION"; optionId: string }
  | { kind: "UNKNOWN_OPTION"; optionId: string }
  | { kind: "OPTION_UNAVAILABLE"; optionId: string; optionName: string }
  | { kind: "TOO_FEW"; groupId: string; groupName: string; min: number }
  | { kind: "TOO_MANY"; groupId: string; groupName: string; max: number };

export type SelectionResult =
  { ok: true; selected: SelectedOption[] } | { ok: false; problems: OptionProblem[] };

/**
 * Validates a selection against an item's groups. Every problem is reported (not just the first) so the
 * UI can mark each group. Selected options come back in menu order, whatever order they were sent in.
 */
export function validateSelection(
  groups: readonly OptionGroupRule[],
  selectedIds: readonly string[],
): SelectionResult {
  const problems: OptionProblem[] = [];
  const seen = new Set<string>();
  for (const id of selectedIds) {
    if (seen.has(id)) problems.push({ kind: "DUPLICATE_OPTION", optionId: id });
    seen.add(id);
  }

  const known = new Set(groups.flatMap((g) => g.options.map((o) => o.id)));
  for (const id of seen) {
    if (!known.has(id)) problems.push({ kind: "UNKNOWN_OPTION", optionId: id });
  }

  const selected: SelectedOption[] = [];
  for (const group of groups) {
    const chosen = group.options.filter((o) => seen.has(o.id));
    for (const option of chosen) {
      if (!option.isAvailable) {
        problems.push({ kind: "OPTION_UNAVAILABLE", optionId: option.id, optionName: option.name });
      }
      selected.push({
        id: option.id,
        groupId: group.id,
        groupName: group.name,
        name: option.name,
        priceDeltaCents: option.priceDeltaCents,
      });
    }
    if (chosen.length < group.minSelect) {
      problems.push({ kind: "TOO_FEW", groupId: group.id, groupName: group.name, min: group.minSelect });
    }
    if (chosen.length > group.maxSelect) {
      problems.push({ kind: "TOO_MANY", groupId: group.id, groupName: group.name, max: group.maxSelect });
    }
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, selected };
}

/** A short, user-facing sentence for a problem ("Choose 1 option for Size."). */
export function describeOptionProblem(problem: OptionProblem): string {
  switch (problem.kind) {
    case "DUPLICATE_OPTION":
      return "An option was selected twice.";
    case "UNKNOWN_OPTION":
      return "An option doesn't belong to this item.";
    case "OPTION_UNAVAILABLE":
      return `${problem.optionName} isn't available right now.`;
    case "TOO_FEW":
      return problem.min === 1
        ? `Choose an option for ${problem.groupName}.`
        : `Choose at least ${problem.min} options for ${problem.groupName}.`;
    case "TOO_MANY":
      return problem.max === 1
        ? `Choose only one option for ${problem.groupName}.`
        : `Choose up to ${problem.max} options for ${problem.groupName}.`;
  }
}
