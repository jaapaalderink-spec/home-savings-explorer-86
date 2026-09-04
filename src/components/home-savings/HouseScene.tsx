import { useRef, useState, type PointerEvent } from "react";
import { MousePointerClick } from "lucide-react";
import { CATEGORIES, type CategoryMeta } from "./categories";
import houseHeroAsset from "@/assets/house-hero-v2.png.asset.json";

const houseHero = houseHeroAsset.url;

interface Props {
  activeId: string | null;
  results: Record<string, boolean>;
  onPick: (id: string) => void;
}

/**
 * Premium hero: een echte woningfoto met interactieve hotspots.
 * De foto beweegt heel subtiel mee met de cursor (parallax) en staat stil
 * bij prefers-reduced-motion.
 */
export function HouseScene({ activeId, results, onPick }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    setTilt({
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
    });
  };

  return (
    <div
      ref={frame}
      onPointerMove={handleMove}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      className="group/scene relative mx-auto w-full max-w-5xl overflow-hidden rounded-[28px] sm:rounded-[36px]"
      style={{
        boxShadow: "0 30px 80px -24px rgba(23,33,27,0.45), 0 2px 0 0 rgba(255,255,255,0.6) inset",
      }}
    >
      {/* foto met zachte parallax */}
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        <img
          src={houseHero}
          width={1728}
          height={941}
          alt="Moderne vrijstaande woning met zonnepanelen op het dak, een warmtepomp-buitenunit links voor, een airco-unit aan de rechtergevel en een elektrische auto met laadpaal in de garage."
          className="h-full w-full scale-[1.06] object-cover transition-transform duration-500 ease-out motion-reduce:!transform-none"
          style={{ transform: `scale(1.06) translate3d(${tilt.x * -10}px, ${tilt.y * -8}px, 0)` }}
          fetchPriority="high"
        />

        {/* cinematische scrims: bovenaan licht, onderaan diep voor leesbaarheid */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "linear-gradient(to bottom, rgba(247,248,245,0.35) 0%, rgba(247,248,245,0) 26%, rgba(23,33,27,0.05) 62%, rgba(23,33,27,0.55) 100%)",
          }}
        />
        {/* warme gouden gloed rechtsboven, in merkkleur sun */}
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
          aria-hidden="true"
          style={{ background: "radial-gradient(circle, rgba(240,184,79,0.45), transparent 70%)" }}
        />
        {/* vignette */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{ boxShadow: "inset 0 0 120px 24px rgba(23,33,27,0.28)" }}
        />

        {/* hotspots */}
        {CATEGORIES.map((cat) => (
          <Hotspot
            key={cat.id}
            cat={cat}
            active={activeId === cat.id}
            done={!!results[cat.id]}
            onPick={onPick}
          />
        ))}

        {/* hint onderin, verdwijnt visueel niet maar stoort niet */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md ring-1 ring-white/25 sm:text-sm">
            <MousePointerClick size={15} aria-hidden="true" />
            Tik op een onderdeel van het huis
          </span>
          <span className="hidden rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md ring-1 ring-white/25 sm:inline-flex">
            6 maatregelen · 1 overzicht
          </span>
        </div>
      </div>
    </div>
  );
}

function Hotspot({
  cat,
  active,
  done,
  onPick,
}: {
  cat: CategoryMeta;
  active: boolean;
  done: boolean;
  onPick: (id: string) => void;
}) {
  const Icon = cat.icon;
  const flipUp = cat.hotspot.y > 55;
  return (
    <button
      type="button"
      onClick={() => onPick(cat.id)}
      aria-label={`${cat.label} — ${cat.short}`}
      className="group absolute hidden -translate-x-1/2 -translate-y-1/2 rounded-full focus-brand hover:z-20 focus-visible:z-20 sm:block"
      style={{ left: `${cat.hotspot.x}%`, top: `${cat.hotspot.y}%` }}
    >
      {/* pulserende ring in sun-kleur */}
      <span
        className={`absolute inset-0 rounded-full ${active ? "hidden" : "animate-hotspot motion-reduce:animate-none"}`}
        aria-hidden="true"
        style={{ backgroundColor: done ? "#4f8f62" : "#f0b84f" }}
      />
      {/* kern: glasachtige knop */}
      <span
        className="relative flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-white/60 backdrop-blur-md transition-transform duration-200 group-hover:scale-110 group-focus-visible:scale-110"
        style={{
          backgroundColor: active ? "#4f8f62" : done ? "rgba(79,143,98,0.92)" : "rgba(240,184,79,0.94)",
          boxShadow: "0 10px 24px rgba(23,33,27,0.35)",
        }}
      >
        <Icon size={20} strokeWidth={2.4} className={active || done ? "text-white" : "text-ink"} />
        {done && (
          <span
            className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white"
            style={{ backgroundColor: "#17211b" }}
          />
        )}
      </span>
      {/* label */}
      <span
        className={`pointer-events-none absolute left-1/2 z-10 w-48 -translate-x-1/2 rounded-2xl px-3 py-2 text-left opacity-0 shadow-xl ring-1 ring-white/10 backdrop-blur-md transition-all duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 ${
          flipUp ? "bottom-full mb-3" : "top-full mt-3"
        }`}
        style={{ backgroundColor: "rgba(23,33,27,0.88)", color: "#f7f8f5" }}
      >
        <span className="block text-xs font-bold">{cat.label}</span>
        <span className="block text-[11px] leading-snug opacity-80">{cat.short}</span>
      </span>
    </button>
  );
}
