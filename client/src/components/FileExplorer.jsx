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

function ancestorsOf(path) {
  const parts = String(path ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.?\/+/, '')
    .split('/')
    .filter(Boolean);
  return parts.slice(0, -1).map((_, index, arr) => arr.slice(0, index + 1).join('/'));
}

function TreeNode({
  node,
  path,
  depth,
  collapsed,
  onToggle,
  panelFiles,
  role,
  onOpen,
  onStartRename,
  onDelete,
  editing,
  renameDraft,
  renameBusy,
  onRenameDraft,
  onSubmitRename,
  onCancelRename,
}) {
  const canManage = Boolean(onStartRename && onDelete);
  const folderNames = [...node.folders.keys()].sort((a, b) => a.localeCompare(b));
  const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  const indent = { paddingLeft: `${8 + depth * 12}px` };

  return (
    <ul className="space-y-0.5">
      {folderNames.map((name) => {
        const child = node.folders.get(name);
        const childPath = path ? `${path}/${name}` : name;
        const isOpen = !collapsed.has(childPath);

        return (
          <li key={childPath}>
            <button
              type="button"
              onClick={() => onToggle(childPath)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left font-label-md text-label-md font-medium text-on-surface-variant hover:bg-surface-container"
              style={indent}
            >
              <span className="material-symbols-outlined w-3 shrink-0 text-[12px] text-outline">
                {isOpen ? 'expand_more' : 'chevron_right'}
              </span>
              <span className="material-symbols-outlined text-[16px] text-tertiary">
                {isOpen ? 'folder_open' : 'folder'}
              </span>
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
                onStartRename={onStartRename}
                onDelete={onDelete}
                editing={editing}
                renameDraft={renameDraft}
                renameBusy={renameBusy}
                onRenameDraft={onRenameDraft}
                onSubmitRename={onSubmitRename}
                onCancelRename={onCancelRename}
              />
            )}
          </li>
        );
      })}

      {sortedFiles.map((file) => {
        const isYours = panelFiles[role] === file.id;
        const isLeft = panelFiles[PANELS.LEFT] === file.id;
        const isRight = panelFiles[PANELS.RIGHT] === file.id;

        if (editing === file.id) {
          return (
            <li key={file.id}>
              <form onSubmit={onSubmitRename} className="py-1 pr-2" style={indent}>
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(event) => onRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') onCancelRename();
                  }}
                  disabled={renameBusy}
                  aria-label={`New path for ${file.path}`}
                  className="w-full rounded-md border border-primary bg-surface-container-lowest px-2 py-1 font-code-sm text-code-sm text-on-surface outline-none disabled:opacity-60"
                />
                <div className="mt-1 flex items-center gap-2 font-code-sm text-code-sm">
                  <button
                    type="submit"
                    disabled={renameBusy}
                    className="rounded bg-primary-container px-2 py-0.5 font-label-sm text-label-sm font-semibold text-on-primary hover:bg-primary disabled:opacity-50"
                  >
                    {renameBusy ? '…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelRename}
                    disabled={renameBusy}
                    className="text-on-surface-variant hover:text-on-background disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </li>
          );
        }

        return (
          <li key={file.id} className="group flex items-center">
            <button
              type="button"
              onClick={() => onOpen(file.id)}
              title={file.path}
              className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left font-label-md text-label-md transition ${
                isYours
                  ? 'bg-primary-container font-medium text-on-primary-container'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-background'
              }`}
              style={indent}
            >
              <span className="w-3 shrink-0" />
              <span className="w-7 shrink-0 rounded bg-surface-container-high px-1 text-center font-code-sm text-code-sm font-semibold text-on-surface-variant">
                {fileBadge(file.name)}
              </span>
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                {isLeft && (
                  <span
                    className="rounded bg-surface-container-highest px-1 font-code-sm text-code-sm font-bold text-primary"
                    title="Open in the left panel"
                  >
                    L
                  </span>
                )}
                {isRight && (
                  <span
                    className="rounded bg-secondary-container px-1 font-code-sm text-code-sm font-bold text-on-secondary-container"
                    title="Open in the right panel"
                  >
                    R
                  </span>
                )}
              </span>
            </button>

            {canManage && (
              <span className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onStartRename(file)}
                  title={`Rename ${file.path}`}
                  aria-label={`Rename ${file.path}`}
                  className="rounded px-1 text-on-surface-variant hover:bg-surface-container hover:text-on-background"
                >
                  <span className="material-symbols-outlined text-[13px]">edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(file)}
                  title={`Delete ${file.path}`}
                  aria-label={`Delete ${file.path}`}
                  className="rounded px-1 text-on-surface-variant hover:bg-error-container hover:text-error"
                >
                  <span className="material-symbols-outlined text-[13px]">delete</span>
                </button>
              </span>
            )}
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
export default function FileExplorer({
  files,
  panelFiles,
  role,
  onOpen,
  onCreate,
  onRename,
  onDelete,
}) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [creating, setCreating] = useState(false);
  const [draftPath, setDraftPath] = useState('');
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const tree = useMemo(() => buildTree(files), [files]);

  const toggle = (path) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const reveal = (path) => {
    const ancestors = ancestorsOf(path);
    if (ancestors.length === 0) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      ancestors.forEach((ancestor) => next.delete(ancestor));
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

    reveal(result.file?.path ?? path);
    setCreating(false);
    setDraftPath('');
    setFormError('');
  };

  const activeFile = files.find((file) => file.id === panelFiles[role]);
  // Ignore a stale rename target (e.g. the file was deleted by the partner).
  const editingFile = editingId && files.some((file) => file.id === editingId) ? editingId : null;

  const startRename = (file) => {
    if (!onRename) return;
    setActionError('');
    setEditingId(file.id);
    setRenameDraft(file.path ?? file.name ?? file.id);
  };

  const cancelRename = () => {
    if (renameBusy) return;
    setEditingId(null);
    setRenameDraft('');
    setActionError('');
  };

  const submitRename = async (event) => {
    event.preventDefault();
    const nextPath = renameDraft.trim();
    if (!nextPath || !onRename || !editingFile) return;

    setRenameBusy(true);
    setActionError('');
    const result = await onRename(editingFile, nextPath);
    setRenameBusy(false);

    if (!result?.ok) {
      setActionError(result?.error ?? 'Could not rename the file.');
      return;
    }

    reveal(nextPath);
    setEditingId(null);
    setRenameDraft('');
  };

  const handleDelete = async (file) => {
    if (!onDelete) return;
    const confirmed = window.confirm(
      `Delete "${file.path}"? This removes it for both editors.`
    );
    if (!confirmed) return;

    setActionError('');
    const result = await onDelete(file.id);
    if (!result?.ok) {
      setActionError(result?.error ?? 'Could not delete the file.');
      return;
    }
    if (editingId === file.id) {
      setEditingId(null);
      setRenameDraft('');
    }
  };

  return (
    <aside className="flex min-h-0 w-full flex-col border-outline-variant bg-surface-container-low lg:w-64 lg:border-r">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-outline-variant px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Explorer</h2>
          <p className="mt-0.5 truncate font-code-sm text-code-sm text-on-surface-variant">
            {role ? `Your panel: ${role}` : 'Waiting for a seat…'} · {files.length} files
          </p>
        </div>
        <button
          type="button"
          onClick={creating ? closeCreateForm : openCreateForm}
          disabled={!role || !onCreate}
          title="Create a new file"
          className="flex shrink-0 items-center gap-1 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1 font-label-sm text-label-sm font-medium text-on-surface-variant transition hover:border-primary/60 hover:text-on-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[14px]">
            {creating ? 'close' : 'add'}
          </span>
          {creating ? '' : 'New'}
        </button>
      </header>

      {creating && (
        <form
          onSubmit={submitCreate}
          className="shrink-0 border-b border-outline-variant bg-surface-container-lowest px-3 py-2"
        >
          <label
            htmlFor="new-file-path"
            className="mb-1 block font-code-sm text-code-sm font-semibold uppercase tracking-wide text-on-surface-variant"
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
              className="min-w-0 flex-1 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-code-md text-code-md text-on-surface outline-none placeholder:text-outline focus:border-primary disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={creatingBusy}
              className="rounded-md bg-primary-container px-2 py-1.5 font-label-sm text-label-sm font-semibold text-on-primary hover:bg-primary disabled:cursor-wait disabled:opacity-50"
            >
              {creatingBusy ? '…' : 'Add'}
            </button>
          </div>
          {formError && (
            <p role="alert" className="mt-1.5 font-code-sm text-code-sm text-error">
              {formError}
            </p>
          )}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="font-code-sm text-code-sm text-outline">Use / for folders</p>
            <button
              type="button"
              onClick={closeCreateForm}
              disabled={creatingBusy}
              className="font-code-sm text-code-sm text-on-surface-variant hover:text-on-background disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {actionError && (
          <p
            role="alert"
            className="mx-1 mb-2 rounded-md border border-outline-variant bg-error-container px-2 py-1 font-code-sm text-code-sm text-on-error-container"
          >
            {actionError}
          </p>
        )}
        {files.length === 0 ? (
          <p className="mt-6 px-2 text-center font-body-sm text-body-sm text-on-surface-variant">
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
            onStartRename={onRename ? startRename : undefined}
            onDelete={onDelete ? handleDelete : undefined}
            editing={editingFile}
            renameDraft={renameDraft}
            renameBusy={renameBusy}
            onRenameDraft={setRenameDraft}
            onSubmitRename={submitRename}
            onCancelRename={cancelRename}
          />
        )}
      </div>

      <footer className="shrink-0 border-t border-outline-variant px-4 py-2.5">
        <p className="truncate font-code-sm text-code-sm text-on-surface-variant">
          {activeFile ? (
            <>
              Open in your panel:{' '}
              <span className="text-on-surface">{activeFile.path}</span>
            </>
          ) : (
            'Click a file to open it, or create a new one.'
          )}
        </p>
      </footer>
    </aside>
  );
}
