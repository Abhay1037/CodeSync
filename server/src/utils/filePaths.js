/**
 * Virtual file-path helpers for the room file explorer.
 *
 * These paths are stored in MongoDB and rendered as a tree; they never touch
 * the real filesystem. Still, normalising them keeps the tree predictable and
 * blocks traversal-looking input like `../secret`.
 */

const LANGUAGE_BY_EXTENSION = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  java: 'java',
  cpp: 'cpp',
  cc: 'cpp',
  c: 'cpp',
  html: 'html',
  htm: 'html',
  css: 'css',
  json: 'json',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shell',
  rs: 'rust',
  go: 'go',
};

// Letters, numbers, dot, underscore, hyphen and spaces are enough for a demo
// file explorer and avoid surprising characters in ids/badges.
const SEGMENT_PATTERN = /^[A-Za-z0-9._ -]+$/;

export function languageForPath(path) {
  const name = String(path ?? '').split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return 'plaintext';
  const extension = name.slice(dot + 1).toLowerCase();
  return LANGUAGE_BY_EXTENSION[extension] ?? 'plaintext';
}

/**
 * Normalise and validate a user-supplied file path.
 *
 * @returns {{ ok: true, path, name, folder, language } | { ok: false, reason, message }}
 */
export function normalizeFilePath(rawPath) {
  const original = String(rawPath ?? '')
    .trim()
    .replace(/\\/g, '/');

  if (!original) {
    return { ok: false, reason: 'INVALID_PATH', message: 'Enter a file name.' };
  }
  if (original.endsWith('/')) {
    return {
      ok: false,
      reason: 'INVALID_PATH',
      message: 'Enter a file name after the folder.',
    };
  }

  const withoutPrefix = original.replace(/^\.?\/+/, '').replace(/\/+$/, '');
  const segments = withoutPrefix.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { ok: false, reason: 'INVALID_PATH', message: 'Enter a file name.' };
  }
  if (segments.length > 8) {
    return {
      ok: false,
      reason: 'INVALID_PATH',
      message: 'Folders can be at most 8 levels deep.',
    };
  }

  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      return {
        ok: false,
        reason: 'INVALID_PATH',
        message: 'Dot segments are not allowed.',
      };
    }
    if (segment.length > 64) {
      return {
        ok: false,
        reason: 'INVALID_PATH',
        message: 'Each file or folder name must be 64 characters or fewer.',
      };
    }
    if (!SEGMENT_PATTERN.test(segment)) {
      return {
        ok: false,
        reason: 'INVALID_PATH',
        message: 'Use letters, numbers, spaces, dots, underscores or hyphens only.',
      };
    }
  }

  const path = segments.join('/');
  if (path.length > 180) {
    return {
      ok: false,
      reason: 'INVALID_PATH',
      message: 'That file path is too long.',
    };
  }

  return {
    ok: true,
    path,
    name: segments[segments.length - 1],
    folder: segments.slice(0, -1).join('/'),
    language: languageForPath(path),
  };
}
