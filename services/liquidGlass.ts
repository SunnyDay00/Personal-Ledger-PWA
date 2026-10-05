export const NAV_GLASS_DISPLACEMENT_SCALE = 24;

// Encode inward lens sampling around a capsule rim. Its flat center stays clear.
// R/G are X/Y offsets for SVG feDisplacementMap; this contains no page pixels.
export const createCapsuleLensMap = (measuredWidth: number, measuredHeight: number) => {
  if (!Number.isFinite(measuredWidth) || !Number.isFinite(measuredHeight) || measuredWidth <= 0 || measuredHeight <= 0) {
    throw new Error('Invalid glass surface dimensions');
  }
  const width = Math.ceil(measuredWidth);
  const height = Math.ceil(measuredHeight);
  const radius = Math.min(width, height) / 2;
  const straightX = width / 2 - radius;
  const straightY = height / 2 - radius;
  const bezel = Math.min(14, radius * 0.44);
  const maxBend = Math.min(8, radius * 0.25);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - width / 2;
      const py = y + 0.5 - height / 2;
      const nx = px - Math.max(-straightX, Math.min(straightX, px));
      const ny = py - Math.max(-straightY, Math.min(straightY, py));
      const distance = Math.hypot(nx, ny);
      const depth = radius - distance;
      const bend = depth > 0 && depth < bezel
        ? Math.sin(Math.PI * depth / bezel) ** 2 * maxBend : 0;
      const shiftX = distance > 0 ? -nx / distance * bend : 0;
      const shiftY = distance > 0 ? -ny / distance * bend : 0;
      const offset = (y * width + x) * 4;
      data[offset] = Math.round(255 * (0.5 + shiftX / NAV_GLASS_DISPLACEMENT_SCALE));
      data[offset + 1] = Math.round(255 * (0.5 + shiftY / NAV_GLASS_DISPLACEMENT_SCALE));
      data[offset + 2] = 128;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
};
