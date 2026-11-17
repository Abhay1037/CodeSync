import Editor from '@monaco-editor/react';
import { useCallback, useEffect, useRef } from 'react';
import { EDITOR_OPTIONS, colorFor } from '../constants/editor.js';

/**
 * EditorPanel
 * ------------
 * A single Monaco pane. It is INTENTIONALLY uncontrolled (`defaultValue`)
 * and applies incoming remote edits imperatively.
 *
 * Why not a controlled `value` prop?
 *   With `value`, applying a remote edit fires Monaco's change event, which
 *   would immediately echo the same edit back to the server (an infinite
 *   loop across peers). Here we use a suppression flag so remote updates
 *   don't re-broadcast, while local typing still calls `onChange`.
 *
 * It also renders the PARTNER's live cursor via a Monaco decoration and, when
 * this pane is ours, publishes our caret through `onCursorChange`.
 */
export default function EditorPanel({
  code,
  language,
  editable,
  ownerLabel,
  accent,
  remoteCursor,
  onChange,
  onCursorChange,
}) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef(null);
  const applyingRemote = useRef(false);

  // Keep the latest props in refs so the once-registered Monaco listener and
  // the mount callback never read stale values.
  const editableRef = useRef(editable);
  const onCursorChangeRef = useRef(onCursorChange);
  const remoteCursorRef = useRef(remoteCursor);

  useEffect(() => {
    editableRef.current = editable;
  }, [editable]);
  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);

  /** Paint (or clear) the partner's caret decoration. */
  const applyRemoteCursor = useCallback((cursor) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const collection = decorationsRef.current;
    if (!editor || !monaco || !collection) return;

    if (!cursor?.position) {
      collection.set([]);
      return;
    }

    const { position, username, colorIndex = 0 } = cursor;
    const cls = `cursor-c${colorIndex % 8}`;

    collection.set([
      {
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column
        ),
        options: {
          // The label doubles as the visible caret (left border in CSS).
          after: {
            content: ` ${username}`,
            inlineClassName: `remote-cursor-label ${cls}`,
          },
          overviewRuler: {
            color: colorFor(colorIndex),
            position: monaco.editor.OverviewRulerLane.Right,
          },
          showIfCollapsed: true,
          zIndex: 100,
        },
      },
    ]);
  }, []);

  const handleMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorationsRef.current = editor.createDecorationsCollection();

    // Publish our caret, but ONLY from the pane we own.
    editor.onDidChangeCursorPosition((event) => {
      if (editableRef.current) onCursorChangeRef.current?.(event.position);
    });

    // Apply any cursor that arrived before Monaco finished mounting.
    applyRemoteCursor(remoteCursorRef.current);
  };

  // Apply remote document changes (and initial room state) to the model.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const current = editor.getValue();
    if (current === (code ?? '')) return; // nothing changed, avoid cursor jump

    applyingRemote.current = true;

    // Preserve caret + scroll so a partner's typing doesn't yank our view.
    const position = editor.getPosition();
    const scrollTop = editor.getScrollTop();

    editor.setValue(code ?? '');

    if (position) editor.setPosition(position);
    editor.setScrollTop(scrollTop);

    // Monaco dispatches the change synchronously; clear after the microtask.
    window.setTimeout(() => {
      applyingRemote.current = false;
    }, 0);
  }, [code]);

  // Re-paint the partner caret whenever it moves.
  useEffect(() => {
    remoteCursorRef.current = remoteCursor;
    applyRemoteCursor(remoteCursor);
  }, [remoteCursor, applyRemoteCursor]);

  const handleChange = (value) => {
    if (applyingRemote.current) return; // ignore echo of remote update
    onChange(value ?? '');
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {/* Pane header */}
      <header
        className={`flex shrink-0 items-center justify-between border-b px-3 py-2 text-xs ${
          accent ? 'border-brand-500/40 bg-brand-50' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${accent ? 'bg-brand-500' : 'bg-slate-400'}`} />
          <span className="font-medium text-slate-700">{ownerLabel}</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            editable
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-slate-200 text-slate-600'
          }`}
        >
          {editable ? 'Editable' : 'Read-only'}
        </span>
      </header>

      {/* Monaco canvas */}
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          theme="vs"
          language={language}
          defaultValue={code}
          onMount={handleMount}
          onChange={handleChange}
          options={{ ...EDITOR_OPTIONS, readOnly: !editable }}
        />
      </div>
    </section>
  );
}
