export type EnergyUnit = "kWh" | "MMBtu" | "MCF";
export type MeterType = "electric" | "gas";

export interface UsagePoint {
  period_start: string; // ISO date (YYYY-MM-DD)
  period_end: string;   // ISO date
  usage: number;        // numeric quantity in the unit below
  unit: EnergyUnit;     // kWh | MMBtu | MCF
  demand_kw?: number | null;
  total_cost?: number | null;
}

export interface MeterBinding {
  buildingId: string;      // your buildings.id
  pmPropertyId: string;    // ENERGY STAR Portfolio Manager property id
  pmMeterId: string;       // Portfolio Manager meter id
  meterType: MeterType;    // electric | gas
  meterNo?: string | null; // optional local meter number
}

export interface UploadRequest {
  meter: MeterBinding;
  points: UsagePoint[];
  dryRun?: boolean;
}

export interface DownloadRequest {
  meter: MeterBinding;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  dryRun?: boolean;
}

export interface EsResponse<T=unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}
