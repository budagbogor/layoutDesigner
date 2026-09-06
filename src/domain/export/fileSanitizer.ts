/**
 * Utility to sanitize project names for safe cross-platform filesystem filenames.
 * Strips invalid characters (\ / : * ? " < > |) and normalizes whitespace.
 */
export function sanitizeFilename(name: string, defaultName: string = 'mobeng_workshop'): string {
  if (!name || typeof name !== 'string') return defaultName;
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
  return cleaned || defaultName;
}
