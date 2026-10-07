import type { FrequencyEntry } from "../protocol/types";

export interface FrequencyGroup {
  /** Displayed title: "Tower", "TRACON", "FSS", "AWOS"… */
  title: string;
  type: string;
  entries: FrequencyEntry[];
}

export interface AirportFrequencies {
  icao: string;
  name: string;
  groups: FrequencyGroup[];
}

export interface GroupedFrequencies {
  airports: AirportFrequencies[];
  /** VFR services (FIS…), shown under every airport */
  vfr: FrequencyEntry[];
  /** En-route centres */
  center: FrequencyEntry[];
}

/** Display order of the types (same as the official toolbar). */
export const TYPE_ORDER = [
  "ATIS", "AWOS", "UNICOM", "Information", "Radio", "FlightService", "Clearance",
  "Ground", "Tower", "ApproachDeparture", "Approach", "Departure"
];

const AWOS_LABELS: Record<string, string> = { ASOS: "ASOS", AWS: "AWIS", AWI: "AWIB" };

export function groupTitle(type: string, entries: FrequencyEntry[]): string {
  if (type === "ApproachDeparture") return "TRACON";
  if (type === "FlightService") return "FSS";
  if (type === "AWOS") {
    const labels = new Set(entries.map(e => AWOS_LABELS[e.stationType] ?? "AWOS"));
    return labels.size === 1 ? [...labels][0]! : "AWOS";
  }
  return type;
}

/** Group by airport then by type, removing duplicate frequencies. */
export function groupFrequencies(items: FrequencyEntry[]): GroupedFrequencies {
  const airports = new Map<string, { icao: string; name: string; byType: Map<string, FrequencyEntry[]> }>();
  const vfr: FrequencyEntry[] = [];
  const center: FrequencyEntry[] = [];

  for (const f of items) {
    if (f.type === "Center") { if (!center.some(c => c.frequency === f.frequency)) center.push(f); continue; }
    if (f.type === "VFR") { vfr.push(f); continue; }
    const key = `${f.airport}|${f.airportName}`;
    let ap = airports.get(key);
    if (!ap) { ap = { icao: f.airport, name: f.airportName, byType: new Map() }; airports.set(key, ap); }
    if (f.type === "None") continue;
    const list = ap.byType.get(f.type) ?? [];
    if (!list.some(x => x.frequency === f.frequency)) list.push(f);
    ap.byType.set(f.type, list);
  }

  const orderOf = (t: string) => { const i = TYPE_ORDER.indexOf(t); return i === -1 ? TYPE_ORDER.length : i; };

  return {
    airports: [...airports.values()].map(ap => ({
      icao: ap.icao,
      name: ap.name,
      groups: [...ap.byType.entries()]
        .sort((a, b) => orderOf(a[0]) - orderOf(b[0]) || a[0].localeCompare(b[0]))
        .map(([type, entries]) => ({ type, title: groupTitle(type, entries), entries }))
    })),
    vfr,
    center
  };
}
