import { cn } from "@/components/ui/cn";

/** Required next to every restaurant (PRD CAT-6, THREAT_MODEL T-32). */
export function SampleMenuLabel({ className }: { className?: string }) {
  return <span className={cn("text-sm text-ink-muted", className)}>Sample menu, not affiliated</span>;
}
