/**
 * Haversine formula calculation for geographical coordinates
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate estimated time of arrival (ETA) in minutes based on distance and average speed.
 * Default urban emergency speed = 45 km/h.
 */
export function calculateEtaMinutes(distanceKm: number, averageSpeedKmh = 45): number {
  if (distanceKm <= 0) return 1;
  const hours = distanceKm / averageSpeedKmh;
  const minutes = Math.ceil(hours * 60);
  return Math.max(1, minutes);
}
