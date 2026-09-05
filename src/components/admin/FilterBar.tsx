import { CATEGORIES, CATEGORY_LABEL } from "@/lib/lead-pricing";
import { PERIODS, RISK_LABEL, STATE_LABEL, type LeadFilters } from "@/components/admin/filters";

const STATES: Array<LeadFilters["state"]> = ["new", "assigned", "underfilled", "cancelled"];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf ${
        active ? "bg-moss text-cloud" : "bg-muted text-moss hover:bg-moss/10"
      }`}
    >
      {children}
    </button>
  );
}

export function FilterBar({
  value,
  onChange,
}: {
  value: LeadFilters;
  onChange: (next: LeadFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
      <span className="text-xs font-semibold uppercase tracking-wide text-moss/60">Periode</span>
      {PERIODS.map((p) => (
        <Chip key={p.label} active={value.days === p.days} onClick={() => onChange({ ...value, days: p.days })}>
          {p.label}
        </Chip>
      ))}
      <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-moss/60">Categorie</span>
      <Chip active={!value.category} onClick={() => onChange({ ...value, category: undefined })}>
        Alle
      </Chip>
      {CATEGORIES.map((c) => (
        <Chip
          key={c}
          active={value.category === c}
          onClick={() => onChange({ ...value, category: value.category === c ? undefined : c })}
        >
          {CATEGORY_LABEL[c]}
        </Chip>
      ))}
      <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-moss/60">Status</span>
      <Chip active={!value.state} onClick={() => onChange({ ...value, state: undefined })}>
        Alle
      </Chip>
      {STATES.map((s) => (
        <Chip key={s} active={value.state === s} onClick={() => onChange({ ...value, state: value.state === s ? undefined : s })}>
          {STATE_LABEL[s as string]}
        </Chip>
      ))}
      <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-moss/60">
        Kwaliteit
      </span>
      <Chip active={!value.risk} onClick={() => onChange({ ...value, risk: undefined })}>
        Alle
      </Chip>
      {(["review", "duplicate", "blocked"] as const).map((r) => (
        <Chip
          key={r}
          active={value.risk === r}
          onClick={() => onChange({ ...value, risk: value.risk === r ? undefined : r })}
        >
          {RISK_LABEL[r]}
        </Chip>
      ))}
    </div>
  );
}
