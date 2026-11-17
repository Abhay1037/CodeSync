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

  const exitBadge = (() => {
    if (runError) return { text: 'error', cls: 'bg-red-500/15 text-red-300' };
    if (!result) return null;
    const code = result.exitCode ?? 0;
    return code === 0
      ? { text: 'exit 0', cls: 'bg-emerald-500/15 text-emerald-300' }
      : { text: `exit ${code}`, cls: 'bg-amber-500/15 text-amber-300' };
  })();

  return (
    <section className="flex h-56 shrink-0 flex-col border-t border-slate-200 bg-white">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-900">Output</span>
          {exitBadge && (
            <span className={`rounded-full px-2 py-0.5 font-medium ${exitBadge.cls.replace('/15', '/10').replace('text-', 'text-').replace('red-300', 'red-700').replace('emerald-300', 'emerald-700').replace('amber-300', 'amber-700')}`}>
              {exitBadge.text}
            </span>
          )}
          {running && <span className="text-amber-700">running…</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStdin((s) => !s)}
            className="rounded border border-slate-300 px-2 py-0.5 text-slate-700 hover:text-slate-900"
          >
            stdin
          </button>
          <button
            onClick={onClear}
            className="rounded border border-slate-300 px-2 py-0.5 text-slate-700 hover:text-slate-900"
          >
            clear
          </button>
          <button
            onClick={handleRun}
            disabled={!canRun || running}
            className="rounded bg-emerald-600 px-2.5 py-0.5 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ▶ Run
          </button>
          <button
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-0.5 text-slate-700 hover:text-slate-900"
          >
            ✕
          </button>
        </div>
      </header>

      {showStdin && (
        <textarea
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          placeholder="Program input (stdin)…"
          className="h-16 shrink-0 resize-none border-b border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:bg-white"
        />
      )}

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-xs">
        {running && <p className="text-slate-500">Executing your code…</p>}

        {runError && <pre className="whitespace-pre-wrap break-words text-red-700">{runError}</pre>}

        {!running && !runError && !result && (
          <p className="text-slate-500">
            Press Run to execute {canRun ? 'your open file' : '(no runnable language selected)'}.
          </p>
        )}

        {result && !runError && (
          <div className="space-y-2">
            {result.stdout ? (
              <pre className="whitespace-pre-wrap break-words text-slate-900">{result.stdout}</pre>
            ) : (
              <p className="text-slate-500">(no stdout)</p>
            )}
            {result.stderr && (
              <pre className="whitespace-pre-wrap break-words text-red-700">{result.stderr}</pre>
            )}
            {typeof result.exitCode === 'number' && result.exitCode !== 0 && (
              <p className="text-slate-500">Exit code: {result.exitCode}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
