# Green Button Interval Analytics - Design Doc

## Goal
Store Evergy Green Button interval XML data and tie it to existing `buildings` for time-based analytics (hour/day/month trends, peaks, baseload, TOU, anomalies).

## Current Scope (Implemented)
- Bulk ingest XML files.
- Match each file to a building by filename address (with alias/fuzzy fallback).
- Persist raw intervals with source identifiers from XML.
- Track per-file ingest status and counts.
- Deduplicate re-imported intervals.

## Current Data Model
### 1) `public.green_button_imports` (file-level)
- One row per XML file import.
- Key fields: `org_id`, `building_id`, `source_filename`, `file_checksum_sha256`, `source_meter_identifier`, `source_usage_point_id`, `status`, count fields, `error_summary`.

### 2) `public.green_button_intervals` (raw fact)
- One row per interval.
- Key fields: `org_id`, `building_id`, `meter_id` (nullable), `import_id`, `interval_start_utc`, `duration_seconds`, `value_wh`, `source_meter_identifier`, `source_usage_point_id`.
- Dedupe key: `(building_id, source_usage_point_id, interval_start_utc, duration_seconds)`.

### 3) `public.green_button_intervals_hourly` (view)
- Hourly rollup from raw intervals.
- Columns: `org_id`, `building_id`, `meter_id`, `hour_start_utc`, `kwh`.

## Ingestion Rules (Current)
1. Parse file + intervals.
2. Resolve `building_id` from filename address.
3. Apply ingest alias mappings (example: `925 E MADISON AVE FTBLL -> 801 E MADISON`).
4. Persist intervals and import counts.
5. No meter auto-create.

## First Analytics Metric (Current Priority)
### 1) Demand Exposure
What it shows:
- Monthly peak demand (`kW`) by building.

Question it answers:
- Which building is driving demand charges?

Chart:
- Multi-series line chart.
- X-axis: month.
- Y-axis: peak `kW`.
- Series: one line per building (with all/specific building selector).
- Tooltip: peak date/time for each point.
- Threshold color markers can be added later.

Monthly review checks:
- Sudden spike vs prior 3-month pattern.
- One building consistently highest.
- Seasonal ramp beginning.
- Crossing tariff minimum/ratchet threshold.

Why it matters:
- Demand charges are based on the highest 15-minute spike, so this panel highlights exposure risk.

## Page Plan
### Page 1: Green Button Analytics (now scaffolded)
- Bulk ingest button.
- Import health/stats.
- Coverage + date range indicators.

### Page 2+: Additional Metrics (Later)
- Add more panels after Demand Exposure is validated.

## Time + Units
- Store raw in `value_wh`.
- Standard analytics unit: `kWh`.
- Keep timestamps in UTC; convert to local time for reporting windows.
