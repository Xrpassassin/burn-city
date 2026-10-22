// Procedural, dependency-free ground texture painter. Callers own the canvas/texture lifecycle.
const PALETTES = Object.freeze({
  natural: Object.freeze(['#9ba978', '#b9a17a', '#8c9b72', '#c6b18a', '#87977a', '#a88d6a', '#d0c29a']),
  legacy: Object.freeze(['#969696', '#a7a7a7', '#b4b4b4', '#858585']),
});

export function drawGroundTexture(ctx, width, height, variant = 'natural', random = Math.random) {
  if (!ctx || !Number.isFinite(width) || width < 1 || !Number.isFinite(height) || height < 1) {
    throw new TypeError('A 2D context and positive dimensions are required');
  }
  const palette = PALETTES[variant] || PALETTES.natural;
  ctx.fillStyle = variant === 'legacy' ? '#c8c8c8' : '#c2c9a7';
  ctx.fillRect(0, 0, width, height);
  const count = Math.floor(width * height / (variant === 'legacy' ? 25 : 19));
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = variant === 'legacy'
      ? (() => { const v = 150 + random() * 105 | 0; return `rgb(${v},${v},${v})`; })()
      : palette[Math.floor(random() * palette.length)];
    const size = variant === 'legacy' ? 1 + random() * 4 : .7 + random() * 3.2;
    const x = random() * width, y = random() * height;
    ctx.fillRect(x, y, size * (variant === 'legacy' ? 2 : 1.4), size * .65);
  }
  return { variant: PALETTES[variant] ? variant : 'natural', flecks: count };
}
