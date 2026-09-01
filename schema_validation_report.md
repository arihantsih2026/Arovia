# Schema Validation Report

**Migration**: [`20260828144222_initial_schema.sql`](file:///d:/arovia-sentinel/supabase/migrations/20260828144222_initial_schema.sql)
**Total lines**: 503 | **Total bytes**: 23,884
**Validation type**: Static SQL inspection only (Docker unavailable)
**Date**: 2026-08-29

---

## 1. Table Inventory

Exactly **11 CREATE TABLE** statements found. All match the approved list.

| # | Table | Line | Status |
|---|-------|------|--------|
| 1 | `profiles` | 19 | ✅ Present |
| 2 | `habitations` | 54 | ✅ Present |
| 3 | `hazards` | 91 | ✅ Present |
| 4 | `risk_assessments` | 134 | ✅ Present |
| 5 | `relocation_sites` | 182 | ✅ Present |
| 6 | `roads` | 231 | ✅ Present |
| 7 | `routes` | 289 | ✅ Present |
| 8 | `scenarios` | 341 | ✅ Present |
| 9 | `action_plans` | 390 | ✅ Present |
| 10 | `safety_teams` | 437 | ✅ Present |
| 11 | `field_devices` | 481 | ✅ Present |

> [!NOTE]
> The 12th approved table, `alerts`, is not yet implemented and is expected in a future step.

**No extra tables found.** ✅

---

## 2. Per-Table Column Audit

### 2.1 — `profiles` (L19–29)

| Column | Type | PK | FK | Nullable | Default | Constraint | Status |
|--------|------|----|----|----------|---------|------------|--------|
| `id` | UUID | ✅ | → `auth.users(id)` ON DELETE CASCADE | NOT NULL | — | — | ✅ |
| `full_name` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `email` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `role` | TEXT | — | — | NOT NULL | — | CHECK `IN ('public','city','state')` | ✅ |
| `city_id` | TEXT | — | — | nullable | — | — | ✅ |
| `state_id` | TEXT | — | — | nullable | — | — | ✅ |
| `created_at` | TIMESTAMPTZ | — | — | NOT NULL | `now()` | — | ✅ |

- PK does **not** use `gen_random_uuid()` — correct, because `profiles.id` mirrors `auth.users.id`.
- FK to `auth.users(id)` ON DELETE CASCADE — correct.
- RLS enabled (L40) ✅

---

### 2.2 — `habitations` (L54–62)

| Column | Type | PK | FK | Nullable | Default | Constraint | Status |
|--------|------|----|----|----------|---------|------------|--------|
| `id` | UUID | ✅ | — | NOT NULL | `gen_random_uuid()` | — | ✅ |
| `name` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `district` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `state` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `population` | INTEGER | — | — | nullable | — | CHECK `>= 0` | ✅ |
| `location` | GEOGRAPHY(Point, 4326) | — | — | nullable | — | — | ✅ |
| `created_at` | TIMESTAMPTZ | — | — | NOT NULL | `now()` | — | ✅ |

- GiST index: `idx_habitations_location` on `location` (L65) ✅
- SRID 4326 ✅
- RLS enabled (L74) ✅

---

### 2.3 — `hazards` (L91–99)

| Column | Type | PK | FK | Nullable | Default | Constraint | Status |
|--------|------|----|----|----------|---------|------------|--------|
| `id` | UUID | ✅ | — | NOT NULL | `gen_random_uuid()` | — | ✅ |
| `habitation_id` | UUID | — | → `habitations(id)` ON DELETE CASCADE | NOT NULL | — | — | ✅ |
| `type` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `severity` | INTEGER | — | — | NOT NULL | — | CHECK `>= 1` | ✅ |
| `event_time` | TIMESTAMPTZ | — | — | NOT NULL | — | — | ✅ |
| `created_at` | TIMESTAMPTZ | — | — | NOT NULL | `now()` | — | ✅ |

- B-tree index: `idx_hazards_habitation_id` on `habitation_id` (L102) ✅
- RLS enabled (L112) ✅

---

### 2.4 — `risk_assessments` (L134–142)

| Column | Type | PK | FK | Nullable | Default | Constraint | Status |
|--------|------|----|----|----------|---------|------------|--------|
| `id` | UUID | ✅ | — | NOT NULL | `gen_random_uuid()` | — | ✅ |
| `hazard_id` | UUID | — | → `hazards(id)` ON DELETE CASCADE | NOT NULL | — | — | ✅ |
| `risk_score` | NUMERIC | — | — | nullable | — | — | ✅ |
| `risk_level` | TEXT | — | — | nullable | — | — | ✅ |
| `assessed_at` | TIMESTAMPTZ | — | — | nullable | — | — | ✅ |
| `created_at` | TIMESTAMPTZ | — | — | NOT NULL | `now()` | — | ✅ |

- B-tree index: `idx_risk_assessments_hazard_id` on `hazard_id` (L145) ✅
- No arbitrary risk scale invented ✅
- RLS enabled (L156) ✅

---

### 2.5 — `relocation_sites` (L182–189)

| Column | Type | PK | FK | Nullable | Default | Constraint | Status |
|--------|------|----|----|----------|---------|------------|--------|
| `id` | UUID | ✅ | — | NOT NULL | `gen_random_uuid()` | — | ✅ |
| `name` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `location` | GEOGRAPHY(Point, 4326) | — | — | nullable | — | — | ✅ |
| `capacity` | INTEGER | — | — | nullable | — | CHECK `>= 0` | ✅ |
| `suitability` | TEXT | — | — | nullable | — | — | ✅ |
| `created_at` | TIMESTAMPTZ | — | — | NOT NULL | `now()` | — | ✅ |

- GiST index: `idx_relocation_sites_location` on `location` (L192) ✅
- No FKs to other tables ✅
- RLS enabled (L203) ✅

---

### 2.6 — `roads` (L231–238)

| Column | Type | PK | FK | Nullable | Default | Constraint | Status |
|--------|------|----|----|----------|---------|------------|--------|
| `id` | UUID | ✅ | — | NOT NULL | `gen_random_uuid()` | — | ✅ |
| `name` | TEXT | — | — | nullable | — | — | ✅ |
| `geometry` | GEOMETRY(LineString, 4326) | — | — | nullable | — | — | ✅ |
| `road_type` | TEXT | — | — | nullable | — | — | ✅ |
| `accessibility` | TEXT | — | — | nullable | — | — | ✅ |
| `created_at` | TIMESTAMPTZ | — | — | NOT NULL | `now()` | — | ✅ |

- GiST index: `idx_roads_geometry` on `geometry` (L241) ✅
- LineString (not Point) for linear infrastructure ✅
- No routing algorithms ✅
- RLS enabled (L252) ✅

---

### 2.7 — `routes` (L289–297)

| Column | Type | PK | FK | Nullable | Default | Constraint | Status |
|--------|------|----|----|----------|---------|------------|--------|
| `id` | UUID | ✅ | — | NOT NULL | `gen_random_uuid()` | — | ✅ |
| `origin` | GEOGRAPHY(Point, 4326) | — | — | nullable | — | — | ✅ |
| `destination` | GEOGRAPHY(Point, 4326) | — | — | nullable | — | — | ✅ |
| `geometry` | GEOMETRY(LineString, 4326) | — | — | nullable | — | — | ✅ |
| `distance` | NUMERIC | — | — | nullable | — | — | ✅ |
| `estimated_time` | INTERVAL | — | — | nullable | — | — | ✅ |
| `created_at` | TIMESTAMPTZ | — | — | NOT NULL | `now()` | — | ✅ |

- GiST index: `idx_routes_geometry` on `geometry` (L300) ✅
- No routing algorithms ✅
- No FKs ✅
- RLS enabled (L312) ✅

---

### 2.8 — `scenarios` (L341–349)

| Column | Type | PK | FK | Nullable | Default | Constraint | Status |
|--------|------|----|----|----------|---------|------------|--------|
| `id` | UUID | ✅ | — | NOT NULL | `gen_random_uuid()` | — | ✅ |
| `name` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `description` | TEXT | — | — | nullable | — | — | ✅ |
| `hazard_type` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `severity` | INTEGER | — | — | nullable | — | CHECK `>= 1` | ✅ |
| `affected_area` | GEOGRAPHY(Polygon, 4326) | — | — | nullable | — | — | ✅ |
| `created_at` | TIMESTAMPTZ | — | — | NOT NULL | `now()` | — | ✅ |

- GiST index: `idx_scenarios_affected_area` on `affected_area` (L352) ✅
- Polygon (not Point or Line) for area representation ✅
- No simulation logic ✅
- RLS enabled (L364) ✅

---

### 2.9 — `action_plans` (L390–397)

| Column | Type | PK | FK | Nullable | Default | Constraint | Status |
|--------|------|----|----|----------|---------|------------|--------|
| `id` | UUID | ✅ | — | NOT NULL | `gen_random_uuid()` | — | ✅ |
| `scenario_id` | UUID | — | → `scenarios(id)` ON DELETE CASCADE | NOT NULL | — | — | ✅ |
| `action` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `priority` | INTEGER | — | — | nullable | — | — | ✅ |
| `created_at` | TIMESTAMPTZ | — | — | NOT NULL | `now()` | — | ✅ |

- B-tree index: `idx_action_plans_scenario_id` on `scenario_id` (L400) ✅
- No execution-state fields ✅
- RLS enabled (L410) ✅

---

### 2.10 — `safety_teams` (L437–443)

| Column | Type | PK | FK | Nullable | Default | Constraint | Status |
|--------|------|----|----|----------|---------|------------|--------|
| `id` | UUID | ✅ | — | NOT NULL | `gen_random_uuid()` | — | ✅ |
| `name` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `type` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `contact` | TEXT | — | — | nullable | — | — | ✅ |
| `created_at` | TIMESTAMPTZ | — | — | NOT NULL | `now()` | — | ✅ |

- No FKs ✅
- No indexes (PK auto-index only) — appropriate for standalone identity table ✅
- RLS enabled (L452) ✅

---

### 2.11 — `field_devices` (L481–488)

| Column | Type | PK | FK | Nullable | Default | Constraint | Status |
|--------|------|----|----|----------|---------|------------|--------|
| `id` | UUID | ✅ | — | NOT NULL | `gen_random_uuid()` | — | ✅ |
| `device_id` | TEXT | — | — | NOT NULL | — | UNIQUE | ✅ |
| `type` | TEXT | — | — | NOT NULL | — | — | ✅ |
| `location` | GEOGRAPHY(Point, 4326) | — | — | nullable | — | — | ✅ |
| `status` | TEXT | — | — | nullable | — | — | ✅ |
| `created_at` | TIMESTAMPTZ | — | — | NOT NULL | `now()` | — | ✅ |

- GiST index: `idx_field_devices_location` on `location` (L491) ✅
- `device_id` UNIQUE constraint (implicit unique index, no duplicate B-tree) ✅
- No telemetry, tracking, or communication fields ✅
- RLS enabled (L502) ✅

---

## 3. Index Inventory

Exactly **9 explicit indexes** found (plus automatic PK indexes and the `device_id` unique index):

| Index | Type | Column | Table | Line | Status |
|-------|------|--------|-------|------|--------|
| `idx_habitations_location` | GiST | `location` | habitations | 65 | ✅ |
| `idx_hazards_habitation_id` | B-tree | `habitation_id` | hazards | 102 | ✅ |
| `idx_risk_assessments_hazard_id` | B-tree | `hazard_id` | risk_assessments | 145 | ✅ |
| `idx_relocation_sites_location` | GiST | `location` | relocation_sites | 192 | ✅ |
| `idx_roads_geometry` | GiST | `geometry` | roads | 241 | ✅ |
| `idx_routes_geometry` | GiST | `geometry` | routes | 300 | ✅ |
| `idx_scenarios_affected_area` | GiST | `affected_area` | scenarios | 352 | ✅ |
| `idx_action_plans_scenario_id` | B-tree | `scenario_id` | action_plans | 400 | ✅ |
| `idx_field_devices_location` | GiST | `location` | field_devices | 491 | ✅ |

No speculative or unnecessary indexes. ✅

---

## 4. Foreign Key Inventory

| Child Table | FK Column | Parent Table | ON DELETE | Line | Status |
|-------------|-----------|-------------|-----------|------|--------|
| `profiles` | `id` | `auth.users(id)` | CASCADE | 21 | ✅ |
| `hazards` | `habitation_id` | `habitations(id)` | CASCADE | 94 | ✅ |
| `risk_assessments` | `hazard_id` | `hazards(id)` | CASCADE | 137 | ✅ |
| `action_plans` | `scenario_id` | `scenarios(id)` | CASCADE | 393 | ✅ |

All FKs follow the approved parent→child hierarchy. No invented relationships. ✅

---

## 5. RLS Inventory

All **11 tables** have `ENABLE ROW LEVEL SECURITY`:

| Table | Line | Status |
|-------|------|--------|
| profiles | 40 | ✅ |
| habitations | 74 | ✅ |
| hazards | 112 | ✅ |
| risk_assessments | 156 | ✅ |
| relocation_sites | 203 | ✅ |
| roads | 252 | ✅ |
| routes | 312 | ✅ |
| scenarios | 364 | ✅ |
| action_plans | 410 | ✅ |
| safety_teams | 452 | ✅ |
| field_devices | 502 | ✅ |

No RLS policies defined yet — correct, deferred to the dedicated security step. ✅

---

## 6. PostGIS Spatial Type Summary

| Table | Column | Spatial Type | SRID | Status |
|-------|--------|-------------|------|--------|
| habitations | location | GEOGRAPHY(Point, 4326) | 4326 | ✅ |
| relocation_sites | location | GEOGRAPHY(Point, 4326) | 4326 | ✅ |
| roads | geometry | GEOMETRY(LineString, 4326) | 4326 | ✅ |
| routes | origin | GEOGRAPHY(Point, 4326) | 4326 | ✅ |
| routes | destination | GEOGRAPHY(Point, 4326) | 4326 | ✅ |
| routes | geometry | GEOMETRY(LineString, 4326) | 4326 | ✅ |
| scenarios | affected_area | GEOGRAPHY(Polygon, 4326) | 4326 | ✅ |
| field_devices | location | GEOGRAPHY(Point, 4326) | 4326 | ✅ |

All spatial types are architecture-appropriate:
- Points for locations ✅
- LineStrings for paths/roads ✅
- Polygon for affected areas ✅
- All SRID 4326 (WGS84) ✅

---

## 7. Negative Checks (Absence Verification)

| Check | Result |
|-------|--------|
| Extra tables beyond the 11 approved | ✅ None found |
| CREATE FUNCTION / TRIGGER / TYPE / VIEW / SEQUENCE / ENUM / EXTENSION / POLICY | ✅ None found |
| Routing algorithms (Dijkstra, A*, shortest-path) | ✅ None |
| AI/ML logic, prediction functions, LLM calls | ✅ None |
| Risk formulas, probability calculations | ✅ None |
| Authentication secrets, API keys, device tokens | ✅ None |
| Telemetry, sensor readings, heartbeat logic | ✅ None |
| Live tracking, movement history, GPS trails | ✅ None |
| Dispatch, assignment, execution-state fields | ✅ None |
| Seed data or INSERT statements | ✅ None |
| `supabase db push` or remote deployment commands | ✅ Not executed |

---

## 8. Architectural Ambiguities

**None blocking.** All type decisions were documented in inline SQL comments with clear rationale. The following design choices were made where the architecture was intentionally open-ended:

| Field | Decision | Rationale |
|-------|----------|-----------|
| `risk_score` | NUMERIC (no range) | Architecture defines no scale |
| `risk_level` | TEXT (no enum) | Architecture defines no enumeration |
| `suitability` | TEXT (no enum) | Architecture defines no scale |
| `road_type` | TEXT (no enum) | Architecture defines no classification |
| `accessibility` | TEXT (no enum) | Architecture defines no scale |
| `estimated_time` | INTERVAL | PostgreSQL's native duration type, unit-agnostic |
| `affected_area` | GEOGRAPHY(Polygon) | Area ≠ Point or Line; Polygon is unambiguous |
| `priority` | INTEGER (no range) | Architecture defines no scale |
| `contact` | TEXT (no structure) | Architecture defines no phone/email split |
| `status` | TEXT (no enum) | Architecture defines no status list |
| `roads.name` | nullable | Unnamed road segments are common |

---

## 9. Verdict

> [!IMPORTANT]
> **The schema is correct.** All 11 approved tables are present with the expected columns, types, constraints, foreign keys, indexes, spatial types, and RLS settings. No architectural violations, speculative additions, or unauthorized objects were found.
>
> The migration is ready for the next phase: **dedicated RLS policy / security implementation**, followed by `alerts` (the 12th and final table).
>
> **Do NOT run `supabase db push` yet.**
