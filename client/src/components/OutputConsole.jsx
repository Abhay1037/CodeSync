import { useState } from 'react';

/**
 * OutputConsole
 * -------------
 * Bottom drawer that shows the result of the last run: stdout, stderr and the
 * exit code, plus a small stdin box for programs that read input.
 */
export default function OutputConsole({
  running,
  result,
  runError,
  onRun,
  onClose,
  onClear,
  canRun,
}) {
  const [stdin, setStdin] = useState('');
  const [showStdin, setShowStdin] = useState(false);

  const handleRun = () => onRun(stdin);

  // Full class strings must appear literally so Tailwind's scanner keeps them.
  const exitBadge = (() => {
    if (runError) return { text: 'error', cls: 'bg-error-container text-on-error-container' };
    if (!result) return null;
    const code = result.exitCode ?? 0;
    return code === 0
      ? { text: 'exit 0', cls: 'bg-secondary-container text-on-secondary-container' }
      : { text: `exit ${code}`, cls: 'bg-tertiary-container text-on-tertiary-container' };
  })();

  const chip =
    'rounded border border-outline-variant px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant hover:text-on-background';

  return (
    <section className="flex h-56 shrink-0 flex-col border-t border-outline-variant bg-surface-container-lowest">
      <header className="flex shrink-0 items-center justify-between border-b border-outline-variant px-3 py-2 font-label-md text-label-md">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-on-surface">Output</span>
          {exitBadge && (
            <span className={`rounded-full px-2 py-0.5 font-medium ${exitBadge.cls}`}>
              {exitBadge.text}
            </span>
          )}
          {running && <span className="text-on-tertiary-container">running…</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowStdin((s) => !s)} className={chip}>
            stdin
          </button>
          <button type="button" onClick={onClear} className={chip}>
            clear
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun || running}
            className="rounded bg-secondary px-2.5 py-0.5 font-medium text-on-secondary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ▶ Run
          </button>
          <button type="button" onClick={onClose} className={chip} aria-label="Close output">
            ✕
          </button>
        </div>
      </header>

      {showStdin && (
        <textarea
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          placeholder="Program input (stdin)…"
          className="h-16 shrink-0 resize-none border-b border-outline-variant bg-surface-container-low px-3 py-2 font-code-md text-code-md text-on-surface outline-none focus:bg-surface-container-lowest"
        />
      )}

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2 font-code-md text-code-md">
        {running && <p className="text-on-surface-variant">Executing your code…</p>}

        {runError && <pre className="whitespace-pre-wrap break-words text-error">{runError}</pre>}

        {!running && !runError && !result && (
          <p className="text-on-surface-variant">
            Press Run to execute {canRun ? 'your open file' : '(no runnable language selected)'}.
          </p>
        )}

        {result && !runError && (
          <div className="flex flex-col gap-2">
            {result.stdout ? (
              <pre className="whitespace-pre-wrap break-words text-on-surface">{result.stdout}</pre>
            ) : (
              <p className="text-on-surface-variant">(no stdout)</p>
            )}
            {result.stderr && (
              <pre className="whitespace-pre-wrap break-words text-error">{result.stderr}</pre>
            )}
            {typeof result.exitCode === 'number' && result.exitCode !== 0 && (
              <p className="text-on-surface-variant">Exit code: {result.exitCode}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
