/** Shared Monaco options applied to both panes. */
export const EDITOR_OPTIONS = {
  fontSize: 14,
  fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: 'on',
  smoothScrolling: true,
  padding: { top: 12, bottom: 12 },
};

/**
 * Mirror of the server's USER_COLORS palette. Index N maps to the CSS class
 * `cursor-cN` (see index.css) so remote carets are coloured without any
 * runtime style injection.
 */
export const USER_COLORS = [
  '#60a5fa',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#22d3ee',
  '#a3e635',
  '#fb923c',
];

/** Clamp an index into the palette so a bad value can never break the UI. */
export const colorFor = (index) => USER_COLORS[index % USER_COLORS.length] ?? USER_COLORS[0];

/** Languages the backend runner (Piston) can actually execute. */
export const RUNNABLE_LANGUAGES = new Set([
  'javascript',
  'typescript',
  'python',
  'java',
  'cpp',
  'html',
]);
