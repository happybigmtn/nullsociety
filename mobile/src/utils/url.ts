export const stripTrailingSlash = (value: string): string => {
  if (!value) return value;
  return value.endsWith('/') ? value.slice(0, -1) : value;
};
