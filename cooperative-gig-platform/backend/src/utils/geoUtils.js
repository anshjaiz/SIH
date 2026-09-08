/**
 * Geospatial helper utilities
 * Using haversine formula for distance calculation (km)
 */

// Earth radius in km
const EARTH_RADIUS_KM = 6371;

// Convert degrees to radians
const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Calculate distance between two lat/lng points (in km)
 * @param {Array} point1 [lng, lat]
 * @param {Array} point2 [lng, lat]
 */
const haversineDistance = (point1, point2) => {
  if (!point1 || !point2 || !point1.length || !point2.length) return Infinity;

  const lat1 = toRad(point1[1]);
  const lat2 = toRad(point2[1]);
  const deltaLat = toRad(point2[1] - point1[1]);
  const deltaLng = toRad(point2[0] - point1[0]);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c; // distance in km
};

/**
 * Find nearby workers using MongoDB geospatial query
 * Returns list of worker profiles sorted by distance
 * @param {Object} filters
 */
const findNearbyWorkers = async (Model, location, maxDistanceKm, extraFilter = {}) => {
  const query = {
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: location,
        },
        $maxDistance: maxDistanceKm * 1000, // MongoDB uses meters
      },
    },
    ...extraFilter,
  };

  return Model.find(query);
};

// Convert lat/lng to GeoJSON format [lng, lat]
const toGeoPoint = (lat, lng) => {
  return [lng, lat];
};

// Extract [lng, lat] from input
const normalizeCoordinates = (input) => {
  if (Array.isArray(input) && input.length >= 2) {
    // Assume [lng, lat]
    return [Number(input[0]), Number(input[1])];
  }
  if (input && input.lat && input.lng) {
    return [Number(input.lng), Number(input.lat)];
  }
  if (input && input.latitude && input.longitude) {
    return [Number(input.longitude), Number(input.latitude)];
  }
  return null;
};

// Estimate travel time in minutes (assume ~30 km/h average in city)
const estimateTravelMinutes = (distanceKm) => {
  return Math.ceil((distanceKm / 30) * 60);
};

module.exports = {
  haversineDistance,
  findNearbyWorkers,
  toGeoPoint,
  normalizeCoordinates,
  estimateTravelMinutes,
  EARTH_RADIUS_KM,
};
