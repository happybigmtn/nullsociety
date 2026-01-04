import { stripTrailingSlash } from '../url';

describe('url utils', () => {
  it('strips trailing slashes', () => {
    expect(stripTrailingSlash('https://example.com/')).toBe('https://example.com');
    expect(stripTrailingSlash('https://example.com/path/')).toBe('https://example.com/path');
  });

  it('returns original values when not needed', () => {
    expect(stripTrailingSlash('https://example.com')).toBe('https://example.com');
    expect(stripTrailingSlash('')).toBe('');
  });
});
