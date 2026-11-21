/**
 * Canonical list of realtime event names and domain constants.
 *
 * IMPORTANT: keep this file byte-for-byte in sync with
 * `client/src/constants/events.js`. A typo in an event name is the most
 * common source of "my socket updates never arrive" bugs.
 */
export const EVENTS = {
  // client -> server
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  FILE_CREATE: 'file:create',
  FILE_OPEN: 'file:open',
  FILE_RENAME: 'file:rename',
  FILE_DELETE: 'file:delete',
  CODE_CHANGE: 'code:change',
  CURSOR_UPDATE: 'cursor:update',

  // server -> client
  ROOM_STATE: 'room:state',
  ROOM_FULL: 'room:full',
  ROOM_DELETED: 'room:deleted',
  FILE_CREATED: 'file:created',
  FILE_OPENED: 'file:opened',
  FILE_RENAMED: 'file:renamed',
  FILE_DELETED: 'file:deleted',
  CODE_UPDATE: 'code:update',
  USERS_UPDATE: 'users:update',

  // shared
  ERROR_MESSAGE: 'error:message',
};

/**
 * Caret colours handed out per panel (left = blue, right = violet).
 * The client maps the index to a CSS class (cursor-cN) so remote cursors
 * can be coloured dynamically without injecting styles at runtime.
 */
export const USER_COLORS = [
  '#60a5fa', // 0 - left  (blue)
  '#a78bfa', // 1 - right (violet)
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#22d3ee',
  '#a3e635',
  '#fb923c',
];

/** The two editable panes that exist in every room. */
export const PANELS = {
  LEFT: 'left',
  RIGHT: 'right',
};

/**
 * "Restrictive Editing": each room is a two-party workspace, so the server
 * assigns one editor per panel and rejects any further joins.
 */
export const MAX_USERS_PER_ROOM = 2;

/** Guard against unbounded file growth in a single room. */
export const MAX_FILES_PER_ROOM = 100;

/** Seed document so a freshly created room isn't blank for both editors. */
export const DEFAULT_CODE = {
  left: `// src/main.js — owned by the first joiner.\n// Only that user can type in the left panel.\n\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet('CodeSync'));\n`,
  right: `// src/utils.js — owned by the second joiner.\n// Only that user can type in the right panel.\n\nexport function formatName(name) {\n  return name.trim().replace(/\\s+/g, ' ');\n}\n`,
};

/**
 * Seed file tree for a new room. Files are shared by the room; each editor
 * opens one of them in their own panel and can only edit that panel.
 * `id` is the stable wire/persistence key; `path` drives the explorer tree.
 */
export const DEFAULT_FILES = [
  {
    id: 'src/main.js',
    name: 'main.js',
    path: 'src/main.js',
    folder: 'src',
    language: 'javascript',
    content: DEFAULT_CODE.left,
  },
  {
    id: 'src/utils.js',
    name: 'utils.js',
    path: 'src/utils.js',
    folder: 'src',
    language: 'javascript',
    content: DEFAULT_CODE.right,
  },
  {
    id: 'src/styles.css',
    name: 'styles.css',
    path: 'src/styles.css',
    folder: 'src',
    language: 'css',
    content: `/* Shared workspace styles. */\n:root {\n  --accent: #6366f1;\n}\n\n.workspace {\n  display: flex;\n  min-height: 100vh;\n}\n`,
  },
  {
    id: 'src/components/editor-toolbar.js',
    name: 'editor-toolbar.js',
    path: 'src/components/editor-toolbar.js',
    folder: 'src/components',
    language: 'javascript',
    content: `export function createToolbar({ onRun, onSave }) {\n  const toolbar = document.createElement('div');\n  toolbar.className = 'toolbar';\n\n  const run = document.createElement('button');\n  run.textContent = 'Run';\n  run.addEventListener('click', onRun);\n\n  const save = document.createElement('button');\n  save.textContent = 'Save';\n  save.addEventListener('click', onSave);\n\n  toolbar.append(run, save);\n  return toolbar;\n}\n`,
  },
  {
    id: 'README.md',
    name: 'README.md',
    path: 'README.md',
    folder: '',
    language: 'markdown',
    content: `# CodeSync Workspace\n\nA shared two-editor room. Each editor owns one panel, and the file explorer lets you switch which file is shown in your panel.\n\n## Files\n\n- \`src/main.js\`\n- \`src/utils.js\`\n- \`src/styles.css\`\n- \`src/components/editor-toolbar.js\`\n`,
  },
];

/** Default file shown in each panel when a room is created. */
export const DEFAULT_PANEL_FILES = {
  left: 'src/main.js',
  right: 'src/utils.js',
};
