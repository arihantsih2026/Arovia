/**
 * AROVIA Sentinel Spatial Utilities
 * Parses PostGIS EWKB (Well-Known Binary) hex strings and GeoJSON geometries
 * into standardized GeoJSON formats and Leaflet LatLng coordinate tuples.
 *
 * SRID: EPSG:4326 (WGS84)
 * GeoJSON coordinate standard: [longitude, latitude]
 * Leaflet coordinate standard: [latitude, longitude]
 */

export interface GeoJSONPoint {
  type: "Point";
  coordinates: [number, number]; // [lon, lat]
}

export interface GeoJSONLineString {
  type: "LineString";
  coordinates: [number, number][]; // [[lon, lat], ...]
}

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: [number, number][][]; // [[[lon, lat], ...], ...]
}

export type GeoJSONGeometry =
  | GeoJSONPoint
  | GeoJSONLineString
  | GeoJSONPolygon;

/**
 * Converts a hex string representation of EWKB (Little-Endian/NDR) into standard GeoJSON.
 */
export function parseEWKB(raw: unknown): GeoJSONGeometry | null {
  if (!raw) return null;

  // If already parsed as a GeoJSON object by PostgREST
  if (typeof raw === "object" && raw !== null && "type" in raw && "coordinates" in raw) {
    return raw as GeoJSONGeometry;
  }

  if (typeof raw !== "string") return null;
  const hex = raw.trim();
  if (hex.length < 18) return null;

  try {
    // Parse hex bytes into Uint8Array
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;

    const isLittleEndian = view.getUint8(offset) === 1;
    offset += 1;

    const typeWithFlags = view.getUint32(offset, isLittleEndian);
    offset += 4;

    const hasSRID = (typeWithFlags & 0x20000000) !== 0;
    const geomType = typeWithFlags & 0x000000ff; // 1 = Point, 2 = LineString, 3 = Polygon

    if (hasSRID) {
      // Skip 4-byte SRID integer
      offset += 4;
    }

    if (geomType === 1) {
      // Point
      const lon = view.getFloat64(offset, isLittleEndian);
      offset += 8;
      const lat = view.getFloat64(offset, isLittleEndian);
      return { type: "Point", coordinates: [lon, lat] };
    }

    if (geomType === 2) {
      // LineString
      const numPoints = view.getUint32(offset, isLittleEndian);
      offset += 4;
      const coords: [number, number][] = [];
      for (let i = 0; i < numPoints; i++) {
        const lon = view.getFloat64(offset, isLittleEndian);
        offset += 8;
        const lat = view.getFloat64(offset, isLittleEndian);
        offset += 8;
        coords.push([lon, lat]);
      }
      return { type: "LineString", coordinates: coords };
    }

    if (geomType === 3) {
      // Polygon
      const numRings = view.getUint32(offset, isLittleEndian);
      offset += 4;
      const rings: [number, number][][] = [];
      for (let r = 0; r < numRings; r++) {
        const numPoints = view.getUint32(offset, isLittleEndian);
        offset += 4;
        const ringCoords: [number, number][] = [];
        for (let i = 0; i < numPoints; i++) {
          const lon = view.getFloat64(offset, isLittleEndian);
          offset += 8;
          const lat = view.getFloat64(offset, isLittleEndian);
          offset += 8;
          ringCoords.push([lon, lat]);
        }
        rings.push(ringCoords);
      }
      return { type: "Polygon", coordinates: rings };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Converts a GeoJSON [lon, lat] coordinate to Leaflet [lat, lon] tuple.
 */
export function toLeafletLatLng(coord: [number, number]): [number, number] {
  return [coord[1], coord[0]];
}

/**
 * Converts a GeoJSON LineString coordinates to Leaflet LatLng array.
 */
export function toLeafletPolyline(coords: [number, number][]): [number, number][] {
  return coords.map((c) => [c[1], c[0]]);
}

/**
 * Converts a GeoJSON Polygon coordinates to Leaflet LatLng nested array.
 */
export function toLeafletPolygon(coords: [number, number][][]): [number, number][][] {
  return coords.map((ring) => ring.map((c) => [c[1], c[0]]));
}
