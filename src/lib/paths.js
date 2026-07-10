// Prefix an absolute app path with Astro's configured `base`.
// Leaves external URLs, fragments, and relative paths untouched.
export function withBase(path) {
  if (!path || typeof path !== 'string') return path;
  if (!path.startsWith('/')) return path;
  const base = import.meta.env.BASE_URL;
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmed}${path}`;
}
