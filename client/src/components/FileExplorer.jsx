import { useMemo, useState } from 'react';
import { PANELS } from '../constants/events.js';

/** Build a nested tree from flat `path` strings. */
function buildTree(files) {
  const root = { folders: new Map(), files: [] };

  for (const file of files) {
    const parts = String(file.path ?? file.name ?? file.id)
      .split('/')
      .filter(Boolean);
    let node = root;

    for (let i = 0; i < parts.length - 1; i += 1) {
      const name = parts[i];
      if (!node.folders.has(name)) {
        node.folders.set(name, { name, folders: new Map(), files: [] });
      }
      node = node.folders.get(name);
    }

    node.files.push(file);
  }

  return root;
}

/** Short badge text for the file extension. */
function fileBadge(name) {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs') return 'JS';
  if (ext === 'ts' || ext === 'tsx') return 'TS';
  if (ext === 'css') return 'CSS';
  if (ext === 'html') return '<>';
  if (ext === 'json') return '{}';
  if (ext === 'md') return 'MD';
  if (ext === 'py') return 'PY';
  return '•';
}

function Chevron({ open }) {
  return (
    <span className="w-3 shrink-0 text-[10px] text-slate-500">
      {open ? '▾' : '▸'}
    </span>
  );
}

function TreeNode({ node, path, depth, collapsed, onToggle, panelFiles, role, onOpen }) {
  const folderNames = [...node.folders.keys()].sort((a, b) => a.localeCompare(b));
  const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ul className={depth === 0 ? 'space-y-0.5' : 'space-y-0.5'}>
      {folderNames.map((name) => {
        const child = node.folders.get(name);
        const childPath = path ? `${path}/${name}` : name;
        const isOpen = !collapsed.has(childPath);

        return (
          <li key={childPath}>
            <button
              type="button"
              onClick={() => onToggle(childPath)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-medium text-slate-700 hover:bg-slate-200/60"
              style={{ paddingLeft: `${8 + depth * 12}px` }}
            >
              <Chevron open={isOpen} />
              <span className="text-amber-600/80">{isOpen ? '📂' : '📁'}</span>
              <span>{name}</span>
            </button>
            {isOpen && (
              <TreeNode
                node={child}
                path={childPath}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                panelFiles={panelFiles}
                role={role}
                onOpen={onOpen}
              />
            )}
          </li>
        );
      })}

      {sortedFiles.map((file) => {
        const isYours = panelFiles[role] === file.id;
        const isLeft = panelFiles[PANELS.LEFT] === file.id;
        const isRight = panelFiles[PANELS.RIGHT] === file.id;

        return (
          <li key={file.id}>
            <button
              type="button"
              onClick={() => onOpen(file.id)}
              title={file.path}
              className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition ${
                isYours
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
              }`}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
            >
              <span className="w-3 shrink-0" />
              <span className="w-7 shrink-0 rounded bg-slate-200/80 px-1 text-center text-[9px] font-semibold text-slate-600">
                {fileBadge(file.name)}
              </span>
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                {isLeft && (
                  <span
                    className="rounded bg-blue-100 px-1 text-[9px] font-bold text-blue-700"
                    title="Open in the left panel"
                  >
                    L
                  </span>
                )}
                {isRight && (
                  <span
                    className="rounded bg-violet-100 px-1 text-[9px] font-bold text-violet-700"
                    title="Open in the right panel"
                  >
                    R
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * FileExplorer
 * ------------
 * Side rail that shows the room's shared file tree; clicking a file opens it
 * in the current user's own editor panel.
 */
export default function FileExplorer({ files, panelFiles, role, onOpen, onCreate }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [creating, setCreating] = useState(false);
  const [draftPath, setDraftPath] = useState('');
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const tree = useMemo(() => buildTree(files), [files]);

  const toggle = (path) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const openCreateForm = () => {
    setCreating(true);
    setDraftPath('');
    setFormError('');
  };

  const closeCreateForm = () => {
    if (creatingBusy) return;
    setCreating(false);
    setDraftPath('');
    setFormError('');
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    const path = draftPath.trim();

    if (!path) {
      setFormError('Enter a file name.');
      return;
    }
    if (!onCreate) {
      setFormError('File creation is unavailable.');
      return;
    }

    setCreatingBusy(true);
    setFormError('');
    const result = await onCreate(path);
    setCreatingBusy(false);

    if (!result?.ok) {
      setFormError(result?.error ?? 'Could not create the file.');
      return;
    }

    // Expand any folders the new file was placed inside.
    const createdPath = result.file?.path ?? path;
    const parts = createdPath
      .replace(/\\/g, '/')
      .replace(/^\.?\/+/, '')
      .split('/')
      .filter(Boolean);
    const ancestors = parts
      .slice(0, -1)
      .map((_, index, arr) => arr.slice(0, index + 1).join('/'));
    if (ancestors.length > 0) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        ancestors.forEach((ancestor) => next.delete(ancestor));
        return next;
      });
    }

    setCreating(false);
    setDraftPath('');
    setFormError('');
  };

  const activeFile = files.find((file) => file.id === panelFiles[role]);

  return (
    <aside className="flex min-h-0 w-full flex-col border-slate-200 bg-slate-50 lg:w-64 lg:border-r">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Explorer</h2>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {role ? `Your panel: ${role}` : 'Waiting for a seat…'} · {files.length} files
          </p>
        </div>
        <button
          type="button"
          onClick={creating ? closeCreateForm : openCreateForm}
          disabled={!role || !onCreate}
          title="Create a new file"
          className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:border-brand-500/60 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating ? '×' : '+ New'}
        </button>
      </header>

      {creating && (
        <form
          onSubmit={submitCreate}
          className="shrink-0 border-b border-slate-200 bg-white px-3 py-2"
        >
          <label
            htmlFor="new-file-path"
            className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500"
          >
            New file
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="new-file-path"
              autoFocus
              value={draftPath}
              onChange={(event) => setDraftPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeCreateForm();
              }}
              disabled={creatingBusy}
              placeholder="src/new-file.js"
              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={creatingBusy}
              className="rounded-md bg-brand-600 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:cursor-wait disabled:opacity-50"
            >
              {creatingBusy ? '…' : 'Add'}
            </button>
          </div>
          {formError && <p className="mt-1.5 text-[11px] text-red-600">{formError}</p>}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] text-slate-500">Use / for folders</p>
            <button
              type="button"
              onClick={closeCreateForm}
              disabled={creatingBusy}
              className="text-[10px] text-slate-500 hover:text-slate-700 disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {files.length === 0 ? (
          <p className="mt-6 px-2 text-center text-xs text-slate-500">
            No files in this room yet.
          </p>
        ) : (
          <TreeNode
            node={tree}
            path=""
            depth={0}
            collapsed={collapsed}
            onToggle={toggle}
            panelFiles={panelFiles}
            role={role}
            onOpen={onOpen}
          />
        )}
      </div>

      <footer className="shrink-0 border-t border-slate-200 px-4 py-2.5">
        <p className="truncate text-[11px] text-slate-500">
          {activeFile ? (
            <>
              Open in your panel:{' '}
              <span className="font-mono text-slate-700">{activeFile.path}</span>
            </>
          ) : (
            'Click a file to open it, or create a new one.'
          )}
        </p>
      </footer>
    </aside>
  );
}
