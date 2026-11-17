import { useCallback, useState } from 'react';
import { executeCode } from '../lib/api.js';

/**
 * useRunner
 * ---------
 * Runs a snippet via the backend and exposes the execution lifecycle:
 * `running`, the `result` payload, and any transport-level `runError`.
 */
export function useRunner() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState(null);

  const run = useCallback(async ({ language, code, stdin = '' }) => {
    setRunning(true);
    setRunError(null);
    setResult(null);

    try {
      if (language === 'html') {
        const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setResult({ ok: true, language: 'html', stdout: 'HTML opened in a new tab.', stderr: '', exitCode: 0 });
        setRunning(false);
        return;
      }

      const data = await executeCode({ language, code, stdin });
      setResult(data);
    } catch (err) {
      setRunError(err.message ?? 'Execution failed.');
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setRunError(null);
  }, []);

  return { running, result, runError, run, clear };
}
