import { FileText, ChevronRight } from "lucide-react";
import { CONTRACT_META } from "./categories";

/**
 * Zevende, gelijkwaardige keuze — bewust géén hotspot op het huis maar
 * een eigen kaart onder de huisscène.
 */
export function ContractCard({
  done,
  onPick,
}: {
  done: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(CONTRACT_META.id)}
      className="focus-brand mx-auto mt-4 flex w-full max-w-xl items-center gap-4 rounded-3xl bg-background p-4 text-left transition-transform duration-200 hover:-translate-y-0.5 sm:mt-6 sm:p-5"
      style={{ boxShadow: "var(--shadow-panel)", border: "1px dashed rgba(49,86,66,0.35)" }}
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
        style={{ backgroundColor: done ? "#4f8f62" : "#f0b84f" }}
      >
        <FileText size={22} strokeWidth={2.4} className="text-moss" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-base font-bold text-ink sm:text-lg">
          Kies je energiecontract
        </span>
        <span className="block truncate text-sm text-moss/75">
          Vast, dynamisch, variabel of nog onbekend — het bepaalt je besparing.
        </span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-moss/60" />
    </button>
  );
}
