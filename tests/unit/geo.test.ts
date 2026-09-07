import { describe, expect, it } from 'vitest';
import { calculateDistanceKm, calculateEtaMinutes } from '../../src/common/utils/geo.js';

describe('Geo Utilities — Haversine Distance & ETA Calculation', () => {
  it('should return 0 km when source and destination are identical', () => {
    const lat = 23.8103;
    const lon = 90.4125;
    const distance = calculateDistanceKm(lat, lon, lat, lon);
    expect(distance).toBe(0);
  });

  it('should correctly calculate spherical distance between two known coordinates', () => {
    // Dhaka (23.8103, 90.4125) to Chittagong (22.3569, 91.7832) is approx 208 - 215 km
    const distance = calculateDistanceKm(23.8103, 90.4125, 22.3569, 91.7832);
    expect(distance).toBeGreaterThan(200);
    expect(distance).toBeLessThan(220);
  });

  it('should correctly estimate ETA in minutes', () => {
    // 45 km at 45 km/h = 60 minutes
    const eta = calculateEtaMinutes(45, 45);
    expect(eta).toBe(60);

    // 0 km should default to at least 1 minute
    expect(calculateEtaMinutes(0)).toBe(1);

    // 15 km at 45 km/h = 20 minutes
    expect(calculateEtaMinutes(15, 45)).toBe(20);
  });
});
