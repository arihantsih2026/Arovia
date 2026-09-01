-- Ensure PostGIS types (GEOGRAPHY, GEOMETRY) are resolvable.
-- The extensions schema is where PostGIS is installed on Supabase Cloud,
-- but the migration executor's default search_path may not include it.
SET search_path = public, extensions;

-- =============================================================
-- Migration: Initial Schema — profiles table
-- =============================================================
-- This migration creates the profiles table, which stores
-- application-level user information. Authentication is handled
-- entirely by Supabase Auth (auth.users). The profiles.id
-- column references auth.users.id so each profile corresponds
-- to exactly one authenticated user.
--
-- city_id and state_id are stored as TEXT because the finalized
-- table list does not include separate cities or states tables.
-- TEXT codes (e.g. state ISO codes, city identifiers) preserve
-- the approved field names and remain extensible — foreign-key
-- constraints can be added later when the administrative-area
-- model is implemented.
-- =============================================================

-- profiles --
CREATE TABLE public.profiles (
    id          UUID        PRIMARY KEY
                            REFERENCES auth.users (id) ON DELETE CASCADE,
    full_name   TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    role        TEXT        NOT NULL
                            CHECK (role IN ('public', 'city', 'state')),
    city_id     TEXT,
    state_id    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add a descriptive comment to the table.
COMMENT ON TABLE  public.profiles IS 'Application-level user profile linked to Supabase Auth.';
COMMENT ON COLUMN public.profiles.id IS 'Matches auth.users.id — one profile per authenticated user.';
COMMENT ON COLUMN public.profiles.role IS 'Access role: public, city, or state.';
COMMENT ON COLUMN public.profiles.city_id IS 'City identifier (nullable). Relevant for city-role users.';
COMMENT ON COLUMN public.profiles.state_id IS 'State identifier (nullable). Relevant for state-role users.';

-- Enable Row Level Security. Policies will be added in a
-- dedicated security step once the full schema is in place.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- habitations table
-- =============================================================
-- Core geographic unit of the system (village / ward / locality).
-- Each habitation carries a PostGIS GEOGRAPHY point (WGS84,
-- SRID 4326) for map visualization and spatial queries.
--
-- district and state are stored as TEXT — the finalized schema
-- does not include separate administrative-area reference tables.
-- =============================================================

-- habitations --
CREATE TABLE public.habitations (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT            NOT NULL,
    district    TEXT            NOT NULL,
    state       TEXT            NOT NULL,
    population  INTEGER         CHECK (population >= 0),
    location    GEOGRAPHY(Point, 4326),
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Spatial index for geographic filtering / proximity queries.
CREATE INDEX idx_habitations_location
    ON public.habitations USING GIST (location);

-- Descriptive comments.
COMMENT ON TABLE  public.habitations IS 'Core geographic unit — village, ward, or locality.';
COMMENT ON COLUMN public.habitations.location IS 'WGS84 geographic point (longitude, latitude).';
COMMENT ON COLUMN public.habitations.population IS 'Estimated population (must be >= 0).';

-- Enable Row Level Security. Policies deferred to the security step.
ALTER TABLE public.habitations ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- hazards table
-- =============================================================
-- A hazard event/type affecting a specific habitation.
-- Each hazard references its parent habitation via habitation_id.
--
-- type is unconstrained TEXT so the application can add new hazard
-- classifications (flood, cyclone, landslide, heatwave, etc.)
-- without schema changes.
--
-- severity is a positive integer with no upper bound — the
-- concrete scale will be defined by the risk-assessment model.
-- =============================================================

-- hazards --
CREATE TABLE public.hazards (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    habitation_id   UUID            NOT NULL
                                    REFERENCES public.habitations (id) ON DELETE CASCADE,
    type            TEXT            NOT NULL,
    severity        INTEGER         NOT NULL CHECK (severity >= 1),
    event_time      TIMESTAMPTZ     NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- FK index: hazards are routinely queried by habitation.
CREATE INDEX idx_hazards_habitation_id
    ON public.hazards (habitation_id);

-- Descriptive comments.
COMMENT ON TABLE  public.hazards IS 'Hazard event or classification linked to a habitation.';
COMMENT ON COLUMN public.hazards.type IS 'Hazard classification (e.g. flood, cyclone, landslide).';
COMMENT ON COLUMN public.hazards.severity IS 'Positive integer severity — scale defined by the risk model.';
COMMENT ON COLUMN public.hazards.event_time IS 'When the hazard event occurred or was recorded.';

-- Enable Row Level Security. Policies deferred to the security step.
ALTER TABLE public.hazards ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- risk_assessments table
-- =============================================================
-- Stores the assessed risk resulting from a hazard.
-- Each risk assessment references its parent hazard via hazard_id.
--
-- risk_score is NUMERIC (arbitrary precision, no range constraint)
-- because the finalized architecture names the field but does not
-- define an exact numeric scale, minimum, maximum, or formula.
--
-- risk_level is unconstrained TEXT because the architecture does
-- not provide a finalized enumeration (e.g. LOW/MEDIUM/HIGH).
-- The application or risk-model layer will define valid values.
--
-- Geographic context is inherited through the chain:
--   risk_assessments → hazards → habitations → location
-- No PostGIS column is added here.
-- =============================================================

-- risk_assessments --
CREATE TABLE public.risk_assessments (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    hazard_id   UUID            NOT NULL
                                REFERENCES public.hazards (id) ON DELETE CASCADE,
    risk_score  NUMERIC,
    risk_level  TEXT,
    assessed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- FK index: risk assessments are routinely queried by hazard.
CREATE INDEX idx_risk_assessments_hazard_id
    ON public.risk_assessments (hazard_id);

-- Descriptive comments.
COMMENT ON TABLE  public.risk_assessments IS 'Assessed risk resulting from a hazard.';
COMMENT ON COLUMN public.risk_assessments.hazard_id IS 'Parent hazard — every risk assessment belongs to one hazard.';
COMMENT ON COLUMN public.risk_assessments.risk_score IS 'Numeric risk score — scale defined by the application risk model.';
COMMENT ON COLUMN public.risk_assessments.risk_level IS 'Risk level label — values defined by the application risk model.';
COMMENT ON COLUMN public.risk_assessments.assessed_at IS 'When the risk assessment was performed.';

-- Enable Row Level Security. Policies deferred to the security step.
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- relocation_sites table
-- =============================================================
-- A safe location that can serve as a relocation or evacuation
-- destination during disaster response.
--
-- location is GEOGRAPHY(Point, 4326) — the same WGS84 point
-- representation used by habitations — enabling map display,
-- spatial filtering, distance calculations, and future route
-- planning.
--
-- suitability is unconstrained TEXT because the architecture
-- names the field but does not define a fixed scale, enum, or
-- formula.  The application or planning layer will assign and
-- interpret values.
--
-- No foreign keys to other tables are defined here — the
-- finalized architecture does not specify a direct relationship
-- from relocation_sites to habitations, hazards, or any other
-- existing table.  Later route/scenario tables will reference
-- relocation_sites where the architecture requires it.
-- =============================================================

-- relocation_sites --
CREATE TABLE public.relocation_sites (
    id          UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT                NOT NULL,
    location    GEOGRAPHY(Point, 4326),
    capacity    INTEGER             CHECK (capacity >= 0),
    suitability TEXT,
    created_at  TIMESTAMPTZ         NOT NULL DEFAULT now()
);

-- Spatial index for proximity queries and route-planning lookups.
CREATE INDEX idx_relocation_sites_location
    ON public.relocation_sites USING GIST (location);

-- Descriptive comments.
COMMENT ON TABLE  public.relocation_sites IS 'Safe location for relocation or evacuation during disaster response.';
COMMENT ON COLUMN public.relocation_sites.name IS 'Name or identifier of the relocation site.';
COMMENT ON COLUMN public.relocation_sites.location IS 'WGS84 geographic point (longitude, latitude).';
COMMENT ON COLUMN public.relocation_sites.capacity IS 'Approximate number of people the site can accommodate (>= 0).';
COMMENT ON COLUMN public.relocation_sites.suitability IS 'Suitability descriptor — interpretation defined by the application layer.';

-- Enable Row Level Security. Policies deferred to the security step.
ALTER TABLE public.relocation_sites ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- roads table
-- =============================================================
-- Foundational road-network data.  Each row represents a road
-- segment stored as a PostGIS LineString in WGS84 (SRID 4326).
--
-- LineString is used instead of Point because roads are linear
-- infrastructure — a sequence of coordinates describing the
-- segment's path.  This geometry supports map display, spatial
-- intersection queries, and future network/routing construction.
--
-- road_type is unconstrained TEXT because the architecture names
-- the field but does not define a fixed classification.
--
-- accessibility is unconstrained TEXT because the architecture
-- names the field but does not define an enum, scale, or formula.
-- The application or planning layer will assign and interpret
-- values.
--
-- No foreign keys to other tables are defined — the finalized
-- architecture does not require a direct FK from roads at this
-- stage.  Later route tables can reference roads where the
-- architecture specifies it.
-- =============================================================

-- roads --
CREATE TABLE public.roads (
    id            UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT,
    geometry      GEOMETRY(LineString, 4326),
    road_type     TEXT,
    accessibility TEXT,
    created_at    TIMESTAMPTZ             NOT NULL DEFAULT now()
);

-- Spatial index for geographic intersection and proximity queries.
CREATE INDEX idx_roads_geometry
    ON public.roads USING GIST (geometry);

-- Descriptive comments.
COMMENT ON TABLE  public.roads IS 'Road segment — foundational road-network data.';
COMMENT ON COLUMN public.roads.name IS 'Road or road-segment name.';
COMMENT ON COLUMN public.roads.geometry IS 'WGS84 LineString representing the road segment path.';
COMMENT ON COLUMN public.roads.road_type IS 'Road classification — interpretation defined by the application layer.';
COMMENT ON COLUMN public.roads.accessibility IS 'Accessibility descriptor — interpretation defined by the application layer.';

-- Enable Row Level Security. Policies deferred to the security step.
ALTER TABLE public.roads ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- routes table
-- =============================================================
-- A route/path through the road network.  Each row represents a
-- constructed path connecting an origin to a destination.
--
-- origin and destination are GEOGRAPHY(Point, 4326) — the same
-- WGS84 point representation used by habitations and relocation
-- sites — representing the spatial endpoints of the route.
--
-- geometry is GEOMETRY(LineString, 4326) — the actual path of
-- connected coordinates, matching the representation used by
-- roads.  This supports map visualization and spatial queries.
--
-- distance is NUMERIC (arbitrary precision, no unit constraint)
-- because the architecture names the field but does not define
-- units or range.  The application/routing layer determines the
-- unit and calculation.
--
-- estimated_time is INTERVAL because it represents a time
-- duration.  INTERVAL is PostgreSQL's native duration type and
-- does not impose a fixed unit (seconds vs. minutes vs. hours).
-- The architecture does not define the unit or calculation method,
-- so INTERVAL keeps the field extensible.
--
-- No foreign keys are defined — the architecture does not require
-- FKs from routes to habitations, relocation_sites, or roads at
-- this stage.  The route geometry represents the path
-- independently.
--
-- No routing algorithm is implemented here — this is the
-- persistence layer only.
-- =============================================================

-- routes --
CREATE TABLE public.routes (
    id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    origin          GEOGRAPHY(Point, 4326),
    destination     GEOGRAPHY(Point, 4326),
    geometry        GEOMETRY(LineString, 4326),
    distance        NUMERIC,
    estimated_time  INTERVAL,
    created_at      TIMESTAMPTZ             NOT NULL DEFAULT now()
);

-- Spatial index on the route path for map display and spatial queries.
CREATE INDEX idx_routes_geometry
    ON public.routes USING GIST (geometry);

-- Descriptive comments.
COMMENT ON TABLE  public.routes IS 'Route/path through the road network connecting an origin to a destination.';
COMMENT ON COLUMN public.routes.origin IS 'WGS84 geographic point — start of the route.';
COMMENT ON COLUMN public.routes.destination IS 'WGS84 geographic point — end of the route.';
COMMENT ON COLUMN public.routes.geometry IS 'WGS84 LineString representing the actual route path.';
COMMENT ON COLUMN public.routes.distance IS 'Route distance — unit and calculation defined by the application layer.';
COMMENT ON COLUMN public.routes.estimated_time IS 'Estimated travel duration — calculation defined by the application layer.';

-- Enable Row Level Security. Policies deferred to the security step.
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- scenarios table
-- =============================================================
-- An emergency or disaster scenario that the system can reason
-- about (e.g. flood, cyclone, landslide, heatwave).
--
-- This is the scenario data layer — it stores the definition of
-- a scenario.  It is NOT the simulation engine, AI prediction
-- layer, action-plan system, or alert system.
--
-- hazard_type is unconstrained TEXT so the system can accommodate
-- new hazard categories without schema changes.  It is a
-- scenario-level classification field, not a foreign key to the
-- hazards table.
--
-- severity is INTEGER CHECK (severity >= 1), paralleling the
-- existing hazards.severity convention.  No upper bound or
-- arbitrary scale is imposed.
--
-- affected_area is GEOGRAPHY(Polygon, 4326) because it
-- represents a geographic area, not a point or line.  GEOGRAPHY
-- is used (rather than GEOMETRY) to be consistent with the
-- project's point-location convention and to support geodetic
-- area/distance calculations over WGS84 coordinates.
-- =============================================================

-- scenarios --
CREATE TABLE public.scenarios (
    id              UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT                        NOT NULL,
    description     TEXT,
    hazard_type     TEXT                        NOT NULL,
    severity        INTEGER                     CHECK (severity >= 1),
    affected_area   GEOGRAPHY(Polygon, 4326),
    created_at      TIMESTAMPTZ                 NOT NULL DEFAULT now()
);

-- Spatial index for geographic queries on the affected area.
CREATE INDEX idx_scenarios_affected_area
    ON public.scenarios USING GIST (affected_area);

-- Descriptive comments.
COMMENT ON TABLE  public.scenarios IS 'Emergency/disaster scenario definition.';
COMMENT ON COLUMN public.scenarios.name IS 'Human-readable scenario name.';
COMMENT ON COLUMN public.scenarios.description IS 'Free-text description of the scenario.';
COMMENT ON COLUMN public.scenarios.hazard_type IS 'Hazard category (e.g. flood, cyclone) — extensible TEXT, no enum.';
COMMENT ON COLUMN public.scenarios.severity IS 'Positive integer severity — no upper bound imposed.';
COMMENT ON COLUMN public.scenarios.affected_area IS 'WGS84 polygon representing the geographic area affected by the scenario.';

-- Enable Row Level Security. Policies deferred to the security step.
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- action_plans table
-- =============================================================
-- An emergency response action associated with a scenario.
--
-- Each action plan belongs to exactly one scenario via
-- scenario_id.  ON DELETE CASCADE is used because an action plan
-- has no independent meaning without its parent scenario.
--
-- action is unconstrained TEXT — the architecture does not define
-- a fixed action enumeration.  The application layer may later
-- support actions such as "evacuate", "issue warning", etc.
--
-- priority is INTEGER with no range constraint because the
-- architecture names the field but does not define a concrete
-- scale.  The application/risk layer will define the operational
-- interpretation.
--
-- This table represents planned actions, NOT their execution
-- state.  Fields such as status, assigned_team, completed_at
-- are not part of the approved design.
-- =============================================================

-- action_plans --
CREATE TABLE public.action_plans (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id     UUID            NOT NULL
                                    REFERENCES public.scenarios (id) ON DELETE CASCADE,
    action          TEXT            NOT NULL,
    priority        INTEGER,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- FK index: action plans are routinely queried by scenario.
CREATE INDEX idx_action_plans_scenario_id
    ON public.action_plans (scenario_id);

-- Descriptive comments.
COMMENT ON TABLE  public.action_plans IS 'Emergency response action associated with a scenario.';
COMMENT ON COLUMN public.action_plans.scenario_id IS 'Parent scenario — every action plan belongs to one scenario.';
COMMENT ON COLUMN public.action_plans.action IS 'Planned response action — extensible TEXT, no enum.';
COMMENT ON COLUMN public.action_plans.priority IS 'Action priority — interpretation defined by the application layer.';

-- Enable Row Level Security. Policies deferred to the security step.
ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- safety_teams table
-- =============================================================
-- An emergency response or safety team that can participate in
-- disaster-response operations.
--
-- This table stores team identity and contact information only.
-- It is NOT a dispatch engine, live tracking system, or team
-- assignment engine — those are later application concerns.
--
-- type is unconstrained TEXT because the architecture does not
-- define a finalized team-type enumeration.  The application
-- layer may later support categories such as medical, fire,
-- rescue, etc.
--
-- contact is simple TEXT because the architecture does not
-- specify a phone/email structure.  Format interpretation is
-- left to the application layer.
--
-- No foreign keys are defined — the architecture does not
-- specify a direct FK from safety_teams to scenarios,
-- action_plans, or any other table at this stage.
-- =============================================================

-- safety_teams --
CREATE TABLE public.safety_teams (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT            NOT NULL,
    type        TEXT            NOT NULL,
    contact     TEXT,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Descriptive comments.
COMMENT ON TABLE  public.safety_teams IS 'Emergency response or safety team.';
COMMENT ON COLUMN public.safety_teams.name IS 'Human-readable team name.';
COMMENT ON COLUMN public.safety_teams.type IS 'Team category (e.g. medical, fire, rescue) — extensible TEXT, no enum.';
COMMENT ON COLUMN public.safety_teams.contact IS 'Team contact information — format defined by the application layer.';

-- Enable Row Level Security. Policies deferred to the security step.
ALTER TABLE public.safety_teams ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- field_devices table
-- =============================================================
-- A physical device deployed in the field as part of the Sentinel
-- monitoring infrastructure.
--
-- id is the internal database UUID.  device_id is the externally
-- identifiable device identifier and must be unique.
--
-- type is unconstrained TEXT because the architecture does not
-- define a finalized device-type enumeration.
--
-- location is GEOGRAPHY(Point, 4326) — the same WGS84 point
-- convention used by habitations and relocation_sites.  It is
-- nullable because a device record may be created before its
-- physical location is known.
--
-- status is unconstrained TEXT because the architecture does not
-- define a finalized status enumeration.  No automatic status
-- transitions are implemented.
--
-- No foreign keys are defined — the architecture does not specify
-- a direct FK from field_devices to any other table at this
-- stage.
-- =============================================================

-- field_devices --
CREATE TABLE public.field_devices (
    id          UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id   TEXT                NOT NULL UNIQUE,
    type        TEXT                NOT NULL,
    location    GEOGRAPHY(Point, 4326),
    status      TEXT,
    created_at  TIMESTAMPTZ         NOT NULL DEFAULT now()
);

-- Spatial index for geographic queries on device locations.
CREATE INDEX idx_field_devices_location
    ON public.field_devices USING GIST (location);

-- Descriptive comments.
COMMENT ON TABLE  public.field_devices IS 'Physical field device deployed for monitoring.';
COMMENT ON COLUMN public.field_devices.device_id IS 'Unique external device identifier.';
COMMENT ON COLUMN public.field_devices.type IS 'Device category — extensible TEXT, no enum.';
COMMENT ON COLUMN public.field_devices.location IS 'WGS84 geographic point — physical location of the device.';
COMMENT ON COLUMN public.field_devices.status IS 'Device status — interpretation defined by the application layer.';

-- Enable Row Level Security. Policies deferred to the security step.
ALTER TABLE public.field_devices ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- alerts table
-- =============================================================
-- Safety/disaster alerts for appropriate roles (public, city,
-- state).  Each alert carries a title, message, severity label,
-- geographic location or affected area, target audience, and an
-- active flag.
--
-- severity is TEXT because the approved architecture gives the
-- example "High" but does not define a numeric scale or a fixed
-- enumeration.  The application layer assigns and interprets
-- severity labels.
--
-- location is GEOGRAPHY(Geometry, 4326) — the generic geography
-- type that accepts both Point and Polygon subtypes.  The
-- approved architecture explicitly describes this field as
-- "PostGIS Point/Polygon", so a single generic geography column
-- preserves both possibilities without inventing extra columns.
--
-- audience is CHECK-constrained to the three audiences
-- explicitly listed by the architecture: public, city, state.
--
-- active is BOOLEAN NOT NULL DEFAULT true — indicates whether
-- the alert is currently active.  No automatic activation or
-- deactivation logic is implemented.
--
-- No foreign keys are defined — the approved alerts
-- specification does not define an FK to scenarios, hazards,
-- habitations, or any other table.  The alert location is
-- spatial rather than a direct FK.
--
-- This table represents the alert data layer only.  It does NOT
-- implement notification delivery, realtime subscriptions, alert
-- generation, severity calculation, acknowledgment, or any
-- application logic.
-- =============================================================

-- alerts --
CREATE TABLE public.alerts (
    id          UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT                    NOT NULL,
    message     TEXT                    NOT NULL,
    severity    TEXT                    NOT NULL,
    location    GEOGRAPHY(Geometry, 4326),
    audience    TEXT                    NOT NULL
                                        CHECK (audience IN ('public', 'city', 'state')),
    active      BOOLEAN                 NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ             NOT NULL DEFAULT now()
);

-- Spatial index for geographic queries on alert locations/areas.
CREATE INDEX idx_alerts_location
    ON public.alerts USING GIST (location);

-- Descriptive comments.
COMMENT ON TABLE  public.alerts IS 'Safety/disaster alert for appropriate roles.';
COMMENT ON COLUMN public.alerts.title IS 'Human-readable alert title.';
COMMENT ON COLUMN public.alerts.message IS 'Alert information or recommendation.';
COMMENT ON COLUMN public.alerts.severity IS 'Severity label (e.g. High) — interpretation defined by the application layer.';
COMMENT ON COLUMN public.alerts.location IS 'WGS84 geography — Point or Polygon representing the alert location or affected area.';
COMMENT ON COLUMN public.alerts.audience IS 'Target audience: public, city, or state.';
COMMENT ON COLUMN public.alerts.active IS 'Whether the alert is currently active.';

-- Enable Row Level Security. Policies deferred to the security step.
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
