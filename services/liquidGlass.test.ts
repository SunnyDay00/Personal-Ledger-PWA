import { describe, expect, it } from 'vitest';
import { createCapsuleLensMap, NAV_GLASS_DISPLACEMENT_SCALE } from './liquidGlass';

describe('clear navigation lens field', () => {
  it('matches the measured surface while keeping its interior and outside corners neutral', () => {
    const map = createCapsuleLensMap(239.5, 63.7);
    expect([map.width, map.height]).toEqual([240, 64]);
    expect(map.data.length).toBe(240 * 64 * 4);
    const pixel = (x: number, y: number) => Array.from(map.data.slice((y * map.width + x) * 4, (y * map.width + x) * 4 + 4));
    expect(pixel(120, 32)).toEqual([128, 128, 128, 255]);
    expect(pixel(0, 0)).toEqual([128, 128, 128, 255]);
  });

  it('bends live backdrop sampling inward at each edge instead of warping the center', () => {
    const map = createCapsuleLensMap(240, 64);
    const channel = (x: number, y: number, index: number) => map.data[(y * map.width + x) * 4 + index];
    expect(channel(120, 5, 1)).toBeGreaterThan(128);
    expect(channel(120, 58, 1)).toBeLessThan(128);
    expect(channel(5, 32, 0)).toBeGreaterThan(128);
    expect(channel(234, 32, 0)).toBeLessThan(128);
    expect(Math.abs(channel(120, 5, 1) + channel(120, 58, 1) - 255)).toBeLessThanOrEqual(1);
  });

  it('keeps refraction bounded and the map fully opaque without mixing color channels into the backdrop', () => {
    const map = createCapsuleLensMap(240, 64);
    for (let offset = 0; offset < map.data.length; offset += 4) {
      for (const channel of [map.data[offset], map.data[offset + 1]]) {
        expect(Math.abs((channel / 255 - 0.5) * NAV_GLASS_DISPLACEMENT_SCALE)).toBeLessThan(8.1);
      }
      expect(map.data[offset + 2]).toBe(128);
      expect(map.data[offset + 3]).toBe(255);
    }
  });

  it('rejects invalid surface sizes rather than allocating a broken filter', () => {
    expect(() => createCapsuleLensMap(0, 64)).toThrow('Invalid');
    expect(() => createCapsuleLensMap(240, Number.NaN)).toThrow('Invalid');
  });
});
