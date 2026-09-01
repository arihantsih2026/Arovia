"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  HabitationItem,
  HazardItem,
  RiskAssessmentItem,
  RoadItem,
  RouteItem,
  ScenarioItem,
  RelocationSiteItem,
} from "@/lib/arovia";
import {
  GeoJSONLineString,
  GeoJSONPoint,
  GeoJSONPolygon,
  parseEWKB,
  toLeafletLatLng,
  toLeafletPolygon,
  toLeafletPolyline,
} from "@/lib/spatial";

interface DisasterMapProps {
  habitations: HabitationItem[];
  hazards: HazardItem[];
  riskAssessments: RiskAssessmentItem[];
  roads: RoadItem[];
  routes: RouteItem[];
  scenarios: ScenarioItem[];
  relocationSites?: RelocationSiteItem[];
  activeScenarioMode?: boolean;
  drawingMode?: boolean;
  onPolygonDrawn?: (geoJson: GeoJSONPolygon) => void;
}

export default function DisasterMap({
  habitations,
  hazards,
  riskAssessments,
  roads,
  routes,
  scenarios,
  relocationSites = [],
  activeScenarioMode = false,
  drawingMode = false,
  onPolygonDrawn,
}: DisasterMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupsRef = useRef<{
    habitations: L.LayerGroup;
    hazards: L.LayerGroup;
    roads: L.LayerGroup;
    routes: L.LayerGroup;
    scenarios: L.LayerGroup;
    relocationSites: L.LayerGroup;
  } | null>(null);

  const [visibleLayers, setVisibleLayers] = useState({
    habitations: true,
    hazards: true,
    roads: true,
    routes: true,
    scenarios: true,
    relocationSites: true,
  });

  const [drawnPoints, setDrawnPoints] = useState<L.LatLng[]>([]);
  const drawingLayerRef = useRef<L.LayerGroup | null>(null);

  const [selectedFeature, setSelectedFeature] = useState<{
    type: "habitation" | "hazard" | "road" | "route" | "scenario" | "relocation_site";
    title: string;
    properties: Record<string, string | number | null | undefined>;
  } | null>(null);

  // Initialize Leaflet Map once on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center to India (e.g. coordinates around northern/eastern India)
    const map = L.map(mapContainerRef.current, {
      center: [22.5, 85.0],
      zoom: 6,
      zoomControl: false,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    // OpenStreetMap CartoDB Positron / standard tile layer for clean intelligence look
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    const habitationsGroup = L.layerGroup().addTo(map);
    const hazardsGroup = L.layerGroup().addTo(map);
    const roadsGroup = L.layerGroup().addTo(map);
    const routesGroup = L.layerGroup().addTo(map);
    const scenariosGroup = L.layerGroup().addTo(map);
    const relocationSitesGroup = L.layerGroup().addTo(map);
    const drawGroup = L.layerGroup().addTo(map);

    drawingLayerRef.current = drawGroup;

    layerGroupsRef.current = {
      habitations: habitationsGroup,
      hazards: hazardsGroup,
      roads: roadsGroup,
      routes: routesGroup,
      scenarios: scenariosGroup,
      relocationSites: relocationSitesGroup,
    };

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerGroupsRef.current = null;
      drawingLayerRef.current = null;
    };
  }, []);

  // Handle map click for drawing mode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (!drawingMode) return;
      setDrawnPoints((prev) => [...prev, e.latlng]);
    };

    map.on("click", onMapClick);

    return () => {
      map.off("click", onMapClick);
    };
  }, [drawingMode]);

  // Render drawn polygon
  useEffect(() => {
    const group = drawingLayerRef.current;
    if (!group) return;

    group.clearLayers();

    if (drawnPoints.length > 0) {
      // Draw points
      drawnPoints.forEach((latlng) => {
        L.circleMarker(latlng, { radius: 5, color: "#6366f1", fillColor: "#818cf8", fillOpacity: 1 }).addTo(group);
      });

      // Draw polyline/polygon
      if (drawnPoints.length > 1) {
        L.polyline(drawnPoints, { color: "#6366f1", weight: 3, dashArray: "5, 5" }).addTo(group);
      }
      
      if (drawnPoints.length > 2) {
        L.polygon(drawnPoints, { color: "#6366f1", weight: 2, fillColor: "#818cf8", fillOpacity: 0.2 }).addTo(group);
      }
    }
  }, [drawnPoints]);

  // Update features whenever data or layer toggles change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const groups = layerGroupsRef.current;
    if (!map || !groups) return;

    // Clear previous layers
    groups.habitations.clearLayers();
    groups.hazards.clearLayers();
    groups.roads.clearLayers();
    groups.routes.clearLayers();
    groups.scenarios.clearLayers();
    groups.relocationSites.clearLayers();

    const allBounds: L.LatLngBounds = L.latLngBounds([]);

    // 1. Habitations Markers
    if (visibleLayers.habitations) {
      habitations.forEach((hab) => {
        const geom = parseEWKB(hab.location);
        if (geom && geom.type === "Point") {
          const [lat, lon] = toLeafletLatLng(geom.coordinates);
          allBounds.extend([lat, lon]);

          const habitationIcon = L.divIcon({
            className: "custom-habitation-marker",
            html: `<div style="background-color: #0d9488; width: 22px; height: 22px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold;">H</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });

          const marker = L.marker([lat, lon], { icon: habitationIcon });
          marker.bindTooltip(`<b>${hab.name}</b><br/>Pop: ${hab.population?.toLocaleString() ?? "Unknown"}`, {
            direction: "top",
            offset: [0, -10],
          });

          marker.on("click", () => {
            setSelectedFeature({
              type: "habitation",
              title: hab.name,
              properties: {
                "District": hab.district,
                "State": hab.state,
                "Estimated Population": hab.population?.toLocaleString() ?? "Not specified",
                "Coordinates (Lat, Lon)": `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
              },
            });
          });

          groups.habitations.addLayer(marker);
        }
      });
    }

    // 2. Hazards Markers (associated with habitations)
    if (visibleLayers.hazards) {
      hazards.forEach((hazard) => {
        // Find linked habitation's location
        const linkedHab = habitations.find((h) => h.id === hazard.habitation_id);
        const geom = parseEWKB(linkedHab?.location);

        if (geom && geom.type === "Point") {
          const [lat, lon] = toLeafletLatLng(geom.coordinates);
          allBounds.extend([lat, lon]);

          const linkedRisk = riskAssessments.find((r) => r.hazard_id === hazard.id);
          const isCritical = hazard.severity >= 4;
          const markerColor = isCritical ? "#e11d48" : "#f59e0b";

          const hazardIcon = L.divIcon({
            className: "custom-hazard-marker",
            html: `<div style="background-color: ${markerColor}; width: 26px; height: 26px; border-radius: 8px; border: 2px solid white; box-shadow: 0 0 12px ${markerColor}99; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 900; animation: pulse 2s infinite;">⚠</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });

          const marker = L.marker([lat + 0.004, lon + 0.004], { icon: hazardIcon }); // slight offset from habitation
          marker.bindTooltip(
            `<b>Hazard: ${hazard.type.toUpperCase()}</b><br/>Severity: Level ${hazard.severity}<br/>Risk: ${
              linkedRisk?.risk_level ?? "Assessed"
            }`,
            { direction: "top", offset: [0, -12] }
          );

          marker.on("click", () => {
            setSelectedFeature({
              type: "hazard",
              title: `${hazard.type.toUpperCase()} Incident`,
              properties: {
                "Hazard Type": hazard.type.replace(/_/g, " "),
                "Severity Level": `Level ${hazard.severity}`,
                "Affected Habitation": linkedHab?.name ?? hazard.habitation_name ?? "Unknown",
                "District / State": `${linkedHab?.district ?? ""}, ${linkedHab?.state ?? ""}`,
                "Evaluated Risk Level": linkedRisk?.risk_level ?? "Assessed",
                "Risk Score": linkedRisk?.risk_score ?? "N/A",
                "Event Timestamp": new Date(hazard.event_time).toLocaleString(),
              },
            });
          });

          groups.hazards.addLayer(marker);
        }
      });
    }

    // 3. Roads (LineStrings)
    if (visibleLayers.roads) {
      roads.forEach((road) => {
        const geom = parseEWKB(road.geometry) as GeoJSONLineString | null;
        if (geom && geom.type === "LineString" && geom.coordinates?.length > 1) {
          const latlngs = toLeafletPolyline(geom.coordinates);
          latlngs.forEach((pt) => allBounds.extend(pt));

          const polyline = L.polyline(latlngs, {
            color: "#475569",
            weight: 4,
            opacity: 0.8,
          });

          polyline.bindTooltip(`<b>${road.name ?? "Road Segment"}</b><br/>Type: ${road.road_type ?? "N/A"}`, {
            sticky: true,
          });

          polyline.on("click", () => {
            setSelectedFeature({
              type: "road",
              title: road.name ?? "Road Segment",
              properties: {
                "Road Classification": road.road_type ?? "Standard Road",
                "Accessibility Status": road.accessibility ?? "Open",
                "Waypoints": `${geom.coordinates.length} points`,
              },
            });
          });

          groups.roads.addLayer(polyline);
        }
      });
    }

    // 4. Routes (Evacuation LineStrings)
    if (visibleLayers.routes) {
      routes.forEach((route) => {
        const geom = parseEWKB(route.geometry) as GeoJSONLineString | null;
        if (geom && geom.type === "LineString" && geom.coordinates?.length > 1) {
          const latlngs = toLeafletPolyline(geom.coordinates);
          latlngs.forEach((pt) => allBounds.extend(pt));

          const polyline = L.polyline(latlngs, {
            color: "#0284c7",
            weight: 5,
            dashArray: "8, 8",
            opacity: 0.9,
          });

          polyline.bindTooltip(
            `<b>Evacuation Route</b><br/>Distance: ${route.distance ?? "—"} km<br/>Est. Time: ${
              route.estimated_time ?? "—"
            }`,
            { sticky: true }
          );

          polyline.on("click", () => {
            setSelectedFeature({
              type: "route",
              title: "Evacuation / Transport Corridor",
              properties: {
                "Total Distance": route.distance ? `${route.distance} km` : "Not calculated",
                "Estimated Travel Time": route.estimated_time ?? "Calculating",
                "Waypoints": `${geom.coordinates.length} nodes`,
              },
            });
          });

          groups.routes.addLayer(polyline);
        }
      });
    }

    // 5. Scenarios (Affected Area Polygons)
    if (visibleLayers.scenarios) {
      scenarios.forEach((scenario) => {
        const geom = parseEWKB(scenario.affected_area) as GeoJSONPolygon | null;
        if (geom && geom.type === "Polygon" && geom.coordinates?.length > 0) {
          const polygonCoords = toLeafletPolygon(geom.coordinates);
          polygonCoords.flat().forEach((pt) => allBounds.extend(pt));

          const isCritical = (scenario.severity ?? 0) >= 4;
          const fillColor = isCritical ? "#e11d48" : "#f59e0b";

          const polygon = L.polygon(polygonCoords, {
            color: activeScenarioMode ? "#0d9488" : fillColor,
            weight: activeScenarioMode ? 3 : 2,
            fillColor: activeScenarioMode ? "#14b8a6" : fillColor,
            fillOpacity: activeScenarioMode ? 0.3 : 0.2,
            dashArray: activeScenarioMode ? "" : "4, 4",
          });

          polygon.bindTooltip(
            `<b>Scenario Zone: ${scenario.name}</b><br/>Hazard: ${scenario.hazard_type.toUpperCase()}`,
            { sticky: true }
          );

          polygon.on("click", () => {
            setSelectedFeature({
              type: "scenario",
              title: scenario.name,
              properties: {
                "Hazard Classification": scenario.hazard_type.toUpperCase(),
                "Severity Index": scenario.severity ? `Level ${scenario.severity}` : "Unrated",
                "Description": scenario.description ?? "No description provided",
              },
            });
          });

          groups.scenarios.addLayer(polygon);
        }
      });
    }

    // 6. Relocation Sites Markers
    if (visibleLayers.relocationSites) {
      relocationSites.forEach((site) => {
        const geom = parseEWKB(site.location);
        if (geom && geom.type === "Point") {
          const [lat, lon] = toLeafletLatLng(geom.coordinates);
          allBounds.extend([lat, lon]);

          const siteIcon = L.divIcon({
            className: "custom-relocation-marker",
            html: `<div style="background-color: #22c55e; width: 24px; height: 24px; border-radius: 6px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; font-weight: bold;">⛨</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });

          const marker = L.marker([lat, lon], { icon: siteIcon });
          marker.bindTooltip(`<b>${site.name}</b><br/>Capacity: ${site.capacity ?? "Unknown"}`, {
            direction: "top",
            offset: [0, -10],
          });

          marker.on("click", () => {
            setSelectedFeature({
              type: "relocation_site",
              title: site.name,
              properties: {
                "Capacity": site.capacity?.toLocaleString() ?? "Not specified",
                "Suitability": site.suitability ?? "Not assessed",
                "Coordinates (Lat, Lon)": `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
              },
            });
          });

          groups.relocationSites.addLayer(marker);
        }
      });
    }

    // Auto-fit map bounds if valid bounds were computed
    if (allBounds.isValid()) {
      map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [habitations, hazards, riskAssessments, roads, routes, scenarios, relocationSites, visibleLayers, activeScenarioMode]);

  function handleResetView() {
    const map = mapInstanceRef.current;
    if (!map) return;

    const allBounds: L.LatLngBounds = L.latLngBounds([]);

    habitations.forEach((h) => {
      const g = parseEWKB(h.location) as GeoJSONPoint | null;
      if (g && g.type === "Point") allBounds.extend(toLeafletLatLng(g.coordinates));
    });

    roads.forEach((r) => {
      const g = parseEWKB(r.geometry) as GeoJSONLineString | null;
      if (g && g.type === "LineString") toLeafletPolyline(g.coordinates).forEach((p) => allBounds.extend(p));
    });

    scenarios.forEach((s) => {
      const g = parseEWKB(s.affected_area) as GeoJSONPolygon | null;
      if (g && g.type === "Polygon") toLeafletPolygon(g.coordinates).flat().forEach((p) => allBounds.extend(p));
    });

    relocationSites.forEach((rs) => {
      const g = parseEWKB(rs.location) as GeoJSONPoint | null;
      if (g && g.type === "Point") allBounds.extend(toLeafletLatLng(g.coordinates));
    });

    if (allBounds.isValid()) {
      map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 14 });
    }
  }

  return (
    <div className="relative isolate flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Map Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {drawingMode ? "Draw Scenario Area" : "Live Spatial Operations Map"}
          </h2>
          <p className="text-xs text-slate-500">
            {drawingMode 
              ? "Click on the map to define the boundary polygon for the new scenario. Must intersect your district/state."
              : "Interactive PostGIS geospatial layer (SRID: EPSG:4326) filtered by your verified database scope."}
          </p>
        </div>

        {drawingMode && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawnPoints([])}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300 transition"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={drawnPoints.length < 3}
              onClick={() => {
                if (drawnPoints.length >= 3 && onPolygonDrawn) {
                  const coordinates = [...drawnPoints, drawnPoints[0]].map(p => [p.lng, p.lat] as [number, number]);
                  onPolygonDrawn({
                    type: "Polygon",
                    coordinates: [coordinates]
                  });
                }
              }}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
            >
              Confirm Area
            </button>
          </div>
        )}

        {/* Layer Toggles */}
        {!drawingMode && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
              visibleLayers.habitations
                ? "bg-teal-50 text-teal-800 border-teal-300"
                : "bg-white text-slate-500 border-slate-200"
            }`}
            onClick={() => setVisibleLayers((p) => ({ ...p, habitations: !p.habitations }))}
            type="button"
          >
            Habitations ({habitations.length})
          </button>
          <button
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
              visibleLayers.hazards
                ? "bg-rose-50 text-rose-800 border-rose-300"
                : "bg-white text-slate-500 border-slate-200"
            }`}
            onClick={() => setVisibleLayers((p) => ({ ...p, hazards: !p.hazards }))}
            type="button"
          >
            Hazards ({hazards.length})
          </button>
          <button
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
              visibleLayers.roads
                ? "bg-slate-200 text-slate-800 border-slate-400"
                : "bg-white text-slate-500 border-slate-200"
            }`}
            onClick={() => setVisibleLayers((p) => ({ ...p, roads: !p.roads }))}
            type="button"
          >
            Roads ({roads.length})
          </button>
          <button
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
              visibleLayers.routes
                ? "bg-sky-50 text-sky-800 border-sky-300"
                : "bg-white text-slate-500 border-slate-200"
            }`}
            onClick={() => setVisibleLayers((p) => ({ ...p, routes: !p.routes }))}
            type="button"
          >
            Routes ({routes.length})
          </button>
          <button
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
              visibleLayers.scenarios
                ? "bg-amber-50 text-amber-800 border-amber-300"
                : "bg-white text-slate-500 border-slate-200"
            }`}
            onClick={() => setVisibleLayers((p) => ({ ...p, scenarios: !p.scenarios }))}
            type="button"
          >
            Impact Zones ({scenarios.length})
          </button>
          <button
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
              visibleLayers.relocationSites
                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                : "bg-white text-slate-500 border-slate-200"
            }`}
            onClick={() => setVisibleLayers((p) => ({ ...p, relocationSites: !p.relocationSites }))}
            type="button"
          >
            Relocation ({relocationSites.length})
          </button>
          <button
            className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 transition cursor-pointer"
            onClick={handleResetView}
            type="button"
          >
            Fit Bounds
          </button>
        </div>
        )}
      </div>

      {/* Map Container and Detail Drawer */}
      <div className="relative h-[540px] w-full bg-slate-100">
        <div className="h-full w-full" ref={mapContainerRef} />

        {/* Map Legend Overlay */}
        <div className="absolute bottom-4 left-4 z-1000 rounded-xl border border-slate-200 bg-white/95 p-3.5 shadow-lg backdrop-blur-xs text-xs">
          <p className="font-bold text-slate-800 mb-2">Map Legend</p>
          <div className="space-y-1.5 text-slate-600">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-teal-600 border border-white" />
              <span>Habitation Marker</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-xs bg-rose-600 text-[9px] text-white flex items-center justify-center font-bold">⚠</span>
              <span>Active Hazard Incident</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-4 bg-slate-600 rounded-full" />
              <span>Road Network</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-4 bg-sky-600 border-b border-dashed border-sky-600" />
              <span>Evacuation Corridor</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 bg-amber-500/30 border border-amber-500 rounded-2xs" />
              <span>Scenario Impact Zone</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 bg-emerald-500 border border-white rounded-xs text-[9px] text-white flex items-center justify-center font-bold">⛨</span>
              <span>Relocation Site</span>
            </div>
          </div>
        </div>

        {/* Selected Feature Details Modal / Drawer */}
        {selectedFeature ? (
          <div className="absolute top-4 right-4 z-1000 max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                  {selectedFeature.type}
                </span>
                <h3 className="mt-1.5 text-base font-bold text-slate-900">{selectedFeature.title}</h3>
              </div>
              <button
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                onClick={() => setSelectedFeature(null)}
                type="button"
              >
                ✕
              </button>
            </div>
            <dl className="mt-3.5 divide-y divide-slate-100 border-t border-slate-100 text-xs">
              {Object.entries(selectedFeature.properties).map(([key, val]) => (
                <div className="flex justify-between py-1.5" key={key}>
                  <dt className="text-slate-500 font-medium">{key}</dt>
                  <dd className="font-semibold text-slate-900 text-right">{val ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}
