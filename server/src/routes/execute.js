import { Router } from 'express';
import { env } from '../config/env.js';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Code execution endpoint.
 *
 * Tries to use a Piston runner if available; falls back to local execution
 * for JavaScript/TypeScript in development.
 */
export const executeRouter = Router();

/** Client language ids -> Piston language ids (only runnable ones). */
const PISTON_LANGUAGE = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  cpp: 'c++',
};

const MAX_CODE_BYTES = 100_000;

function runLocal({ language, code, stdin = '' }) {
  return new Promise((resolve) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codesync-'));
    let filePath;
    let cmd;
    let args = [];

    try {
      if (language === 'javascript') {
        filePath = path.join(tmpDir, 'main.js');
        fs.writeFileSync(filePath, code);
        cmd = process.execPath;
        args = [filePath];
      } else if (language === 'typescript') {
        filePath = path.join(tmpDir, 'main.ts');
        fs.writeFileSync(filePath, code);
        cmd = 'npx';
        args = ['-y', 'tsx', filePath];
      } else if (language === 'html') {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
        return resolve({
          ok: true,
          language,
          stdout: 'HTML opened in preview window.',
          stderr: '',
          output: 'HTML opened in preview window.',
          exitCode: 0,
          signal: null,
          html: true,
        });
      } else if (language === 'python') {
        filePath = path.join(tmpDir, 'main.py');
        fs.writeFileSync(filePath, code);
        cmd = 'python';
        args = [filePath];
      } else if (language === 'java') {
        // Try to extract public class name
        let className = 'Main';
        const match = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
        if (match) className = match[1];
        else {
          const m2 = code.match(/class\s+([A-Za-z0-9_]+)/);
          if (m2) className = m2[1];
        }
        filePath = path.join(tmpDir, `${className}.java`);
        fs.writeFileSync(filePath, code);
        const compile = spawn('javac', [filePath], { cwd: tmpDir, timeout: 15000 });
        let cerr = '';
        compile.stderr.on('data', (d) => (cerr += d.toString()));
        compile.on('close', (c) => {
          if (c !== 0) {
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}
            return resolve({ ok: false, error: cerr || 'Java compilation failed.' });
          }
          const runProc = spawn('java', ['-cp', tmpDir, className], { cwd: tmpDir, timeout: 15000 });
          let stdout = '';
          let stderr = '';
          if (stdin) {
            runProc.stdin.write(String(stdin));
            runProc.stdin.end();
          }
          runProc.stdout.on('data', (d) => (stdout += d.toString()));
          runProc.stderr.on('data', (d) => (stderr += d.toString()));
          runProc.on('close', (rc, sig) => {
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}
            resolve({ ok: true, language, stdout, stderr, output: stdout + stderr, exitCode: rc, signal: sig });
          });
          runProc.on('error', (err) => {
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}
            resolve({ ok: false, error: err.message });
          });
        });
        compile.on('error', (err) => {
          try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          } catch {}
          resolve({ ok: false, error: err.message });
        });
        return;
      } else if (language === 'cpp') {
        filePath = path.join(tmpDir, 'main.cpp');
        fs.writeFileSync(filePath, code);
        const compile = spawn('g++', ['-O2', '-o', 'main', filePath], { cwd: tmpDir, timeout: 20000 });
        let cerr = '';
        compile.stderr.on('data', (d) => (cerr += d.toString()));
        compile.on('close', (c) => {
          if (c !== 0) {
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}
            return resolve({ ok: false, error: cerr || 'C++ compilation failed.' });
          }
          const exe = process.platform === 'win32' ? path.join(tmpDir, 'main.exe') : path.join(tmpDir, 'main');
          const runProc = spawn(exe, [], { cwd: tmpDir, timeout: 15000 });
          let stdout = '';
          let stderr = '';
          if (stdin) {
            runProc.stdin.write(String(stdin));
            runProc.stdin.end();
          }
          runProc.stdout.on('data', (d) => (stdout += d.toString()));
          runProc.stderr.on('data', (d) => (stderr += d.toString()));
          runProc.on('close', (rc, sig) => {
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}
            resolve({ ok: true, language, stdout, stderr, output: stdout + stderr, exitCode: rc, signal: sig });
          });
          runProc.on('error', (err) => {
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}
            resolve({ ok: false, error: err.message });
          });
        });
        compile.on('error', (err) => {
          try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          } catch {}
          resolve({ ok: false, error: err.message });
        });
        return;
      } else {
        return resolve({ ok: false, error: `Local execution not supported for ${language}.` });
      }

      const proc = spawn(cmd, args, {
        cwd: tmpDir,
        env: { ...process.env },
        timeout: 10000,
      });

      let stdout = '';
      let stderr = '';
      if (stdin) {
        proc.stdin.write(String(stdin));
        proc.stdin.end();
      }

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code, signal) => {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
        resolve({
          ok: true,
          language,
          stdout,
          stderr,
          output: stdout + stderr,
          exitCode: code,
          signal,
        });
      });

      proc.on('error', (err) => {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
        resolve({ ok: false, error: err.message });
      });
    } catch (err) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
      resolve({ ok: false, error: err.message });
    }
  });
}

executeRouter.post('/execute', async (req, res, next) => {
  try {
    const { language, code, stdin = '' } = req.body ?? {};

    const pistonLang = PISTON_LANGUAGE[language];
    if (!pistonLang && language !== 'html') {
      return res.status(400).json({ error: `Language '${language}' cannot be executed.` });
    }
    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ error: 'No code provided.' });
    }
    if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
      return res.status(413).json({ error: 'Code is too large to run.' });
    }

    // Try local execution first for supported languages
    if (['javascript', 'typescript', 'html', 'python', 'java', 'cpp'].includes(language)) {
      const local = await runLocal({ language, code, stdin });
      if (local.ok) {
        return res.json(local);
      }
      // fall through to try Piston if local failed
    }

    // Hard timeout so a hung runner can't tie up our event loop.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.pistonTimeoutMs);

    let upstream;
    try {
      upstream = await fetch(`${env.pistonUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.pistonApiKey ? { Authorization: `Bearer ${env.pistonApiKey}` } : {}),
        },
        body: JSON.stringify({
          language: pistonLang,
          version: '*',
          files: [{ content: code }],
          stdin: String(stdin),
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timer);
      // If Piston is unreachable, try local again for JS/TS
      if (language === 'javascript' || language === 'typescript') {
        const local = await runLocal({ language, code, stdin });
        if (local.ok) return res.json(local);
        return res.status(502).json({ error: local.error || fetchErr.message });
      }
      return res.status(502).json({ error: fetchErr.message });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.error('[execute] Piston error', upstream.status, errText);
      // Fallback to local for JS/TS
      if (language === 'javascript' || language === 'typescript') {
        const local = await runLocal({ language, code, stdin });
        if (local.ok) return res.json(local);
      }
      return res.status(502).json({
        error: `Code runner responded with ${upstream.status}${errText ? `: ${errText.slice(0, 200)}` : '.'}`,
      });
    }

    const data = await upstream.json();
    const run = data.run ?? {};

    return res.json({
      ok: true,
      language,
      stdout: run.stdout ?? '',
      stderr: run.stderr ?? '',
      output: run.output ?? run.stdout ?? run.stderr ?? '',
      exitCode: run.code ?? run.exitCode ?? null,
      signal: run.signal ?? null,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Code runner timed out.' });
    }
    console.error('[execute] unexpected error', err);
    return res.status(500).json({ error: err.message ?? 'Execution failed.' });
  }
});
