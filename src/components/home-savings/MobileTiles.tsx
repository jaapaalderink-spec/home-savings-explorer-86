import { CATEGORIES } from "./categories";

/** Mobiele tegel-layout: alle categorieën als tegels onder het huis. */
export function MobileTiles({
  results,
  onPick,
}: {
  results: Record<string, boolean>;
  onPick: (id: string) => void;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2.5 sm:hidden">
      {CATEGORIES.map((cat) => {
        const Icon = cat.icon;
        const done = !!results[cat.id];
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onPick(cat.id)}
            className="focus-brand flex min-h-14 items-center gap-2.5 rounded-2xl bg-background p-3 text-left transition-transform duration-200 active:scale-[0.98] motion-reduce:transition-none"
            style={{ boxShadow: "var(--shadow-panel)" }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: done ? "#4f8f62" : "#f0b84f" }}
            >
              <Icon size={18} strokeWidth={2.4} className="text-moss" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{cat.label}</span>
              <span className="block truncate text-[11px] text-moss/70">{done ? "Ingevuld" : cat.short}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
