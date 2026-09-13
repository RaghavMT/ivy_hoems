import { describe, expect, it } from 'vitest';
import { safeNextPath } from '../lib/redirect';

describe('safeNextPath', () => {
  it('keeps an in-app path with its query string', () => {
    expect(safeNextPath('/listings/MAG-2000002?from=saved')).toBe('/listings/MAG-2000002?from=saved');
  });

  it('falls back to listings when there is no path', () => {
    expect(safeNextPath(null)).toBe('/listings');
    expect(safeNextPath('')).toBe('/listings');
  });

  it('rejects absolute URLs to other sites', () => {
    expect(safeNextPath('https://evil.example/phish')).toBe('/listings');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeNextPath('//evil.example')).toBe('/listings');
  });

  it('rejects backslash tricks that browsers treat as protocol-relative', () => {
    expect(safeNextPath('/\\evil.example')).toBe('/listings');
  });

  it('does not send the user back to the login page', () => {
    expect(safeNextPath('/login?next=/saved')).toBe('/listings');
  });
});
