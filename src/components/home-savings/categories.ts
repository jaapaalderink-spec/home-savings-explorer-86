import { Sun, Zap, Car, Snowflake, BatteryCharging, FileText } from "lucide-react";
import type { CategoryId, HouseType } from "@/lib/home-savings";

export interface CategoryMeta {
  id: CategoryId | "contract";
  label: string;
  short: string;
  icon: typeof Sun;
  /** positie op de huisfoto, in procenten van breedte/hoogte */
  hotspot: { x: number; y: number };
  /** mobiele volgorde-index */
  order: number;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: "solar",
    label: "Zonnepanelen",
    short: "Bespaar tot 60% op je stroomrekening",
    icon: Sun,
    hotspot: { x: 62, y: 20 },
    order: 0,
  },
  {
    id: "airco",
    label: "Airco",
    short: "Efficiënt koelen én verwarmen, minder gas",
    icon: Snowflake,
    hotspot: { x: 86.5, y: 52 },
    order: 1,
  },
  {
    id: "heatpump",
    label: "Warmtepomp",
    short: "Van gas los, flink lagere energierekening",
    icon: Zap,
    hotspot: { x: 16.5, y: 72 },
    order: 2,
  },
  {
    id: "battery",
    label: "Thuisbatterij",
    short: "Sla overtollige zonnestroom op",
    icon: BatteryCharging,
    hotspot: { x: 48, y: 68 },
    order: 3,
  },
  {
    id: "ev",
    label: "Laadpaal",
    short: "Goedkoop thuis je elektrische auto laden",
    icon: Car,
    hotspot: { x: 57, y: 62 },
    order: 4,
  },
];

export const CONTRACT_META: CategoryMeta = {
  id: "contract",
  label: "Energiecontract",
  short: "Kies vast, dynamisch of variabel",
  icon: FileText,
  hotspot: { x: 88, y: 88 },
  order: 7,
};


export const HOUSE_TYPES: { id: HouseType; label: string }[] = [
  { id: "rijtjeshuis", label: "Rijtjeshuis" },
  { id: "hoekwoning", label: "Hoekwoning" },
  { id: "vrijstaand", label: "Vrijstaand" },
  { id: "appartement", label: "Appartement" },
];
