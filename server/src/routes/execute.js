import { Router } from 'express';
import { env } from '../config/env.js';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Code execution endpoint.
 *
 * Runs code through the configured Piston-compatible service. The optional
 * unsandboxed local runner remains a development-only fallback.
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

/** Languages the local (unsandboxed, dev-only) runner can execute. */
const LOCAL_RUNNABLE = new Set(['javascript', 'typescript', 'python', 'java', 'cpp']);

const MAX_CODE_BYTES = 100_000;
/** Keep runaway programs from exhausting the server's memory. */
const MAX_OUTPUT_CHARS = 64 * 1024;

/** Filenames matter to Piston: Java source files must match the public class. */
const PISTON_FILE_NAMES = {
  javascript: 'main.js',
  typescript: 'main.ts',
  python: 'main.py',
  cpp: 'main.cpp',
};

/** Safe, user-facing messages. Never include the runner URL, key or upstream body. */
const RUNNER_NOT_CONFIGURED_ERROR =
  'Code execution is not configured on this server. Ask the server administrator to set it up.';
const RUNNER_UNAVAILABLE_ERROR =
  'Code execution service is unavailable. Please try again later.';
const RUNNER_AUTH_ERROR =
  'Code runner authentication failed. Ask the server administrator to check the execution service.';

function pistonFileName(language, code) {
  if (language === 'java') {
    const match = code.match(
      /\bpublic\s+(?:(?:final|abstract|strictfp)\s+)*class\s+([A-Za-z_$][\w$]*)/
    );
    // Piston's Java runtime appends ".java" itself; the public class name is
    // the stem it needs for source-file mode.
    return match?.[1] ?? 'Main';
  }
  return PISTON_FILE_NAMES[language] ?? 'main.code';
}

/** Map Piston's run/compile stages onto the shape the output console expects. */
function formatPistonResponse(data, language) {
  const compile = data?.compile ?? null;
  const run = data?.run ?? null;

  const compileStdout = typeof compile?.stdout === 'string' ? compile.stdout : '';
  const compileStderr = typeof compile?.stderr === 'string' ? compile.stderr : '';
  const runStdout = typeof run?.stdout === 'string' ? run.stdout : '';
  const runStderr = typeof run?.stderr === 'string' ? run.stderr : '';

  const compileFailed = compile != null && compile.code != null && Number(compile.code) !== 0;
  const stage = compileFailed ? compile : (run ?? {});
  const stderr = [compileStderr, runStderr].filter(Boolean).join('\n');
  const output = [compileStdout, compileStderr, runStdout, runStderr].filter(Boolean).join('\n');

  return {
    ok: true,
    language,
    stdout: runStdout,
    stderr,
    output: output || run?.output || '',
    exitCode: stage.code ?? stage.exitCode ?? null,
    signal: stage.signal ?? null,
  };
}

/**
 * Minimal environment for child processes.
 *
 * SECURITY: never forward `process.env` here. It contains JWT_SECRET,
 * MONGO_URI (often with an Atlas password) and other secrets that a user
 * could dump with `console.log(process.env)`.
 */
function childEnv() {
  const allow = [
    'PATH',
    'PATHEXT',
    'SystemRoot',
    'windir',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'NUMBER_OF_PROCESSORS',
  ];
  const out = {};
  for (const key of allow) {
    if (process.env[key] != null) out[key] = process.env[key];
  }
  return out;
}

/** Append a chunk while respecting the output cap. */
function appendCapped(current, chunk) {
  if (current.length >= MAX_OUTPUT_CHARS) return current;
  const next = current + chunk;
  if (next.length <= MAX_OUTPUT_CHARS) return next;
  return `${next.slice(0, MAX_OUTPUT_CHARS)}\n…(output truncated)`;
}

/** Turn a bare ENOENT into an actionable "install this" message. */
function spawnErrorMessage(err, tool) {
  if (err?.code === 'ENOENT') {
    return `${tool} was not found on PATH. Install it, or run code through Piston.`;
  }
  return err.message;
}

function runLocal({ language, code, stdin = '' }) {
  return new Promise((resolve) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codesync-'));
    let filePath;
    let cmd;
    let args = [];
    let toolName = 'the interpreter';

    try {
      if (language === 'javascript') {
        filePath = path.join(tmpDir, 'main.js');
        fs.writeFileSync(filePath, code);
        cmd = process.execPath;
        args = [filePath];
        toolName = 'node';
      } else if (language === 'typescript') {
        filePath = path.join(tmpDir, 'main.ts');
        fs.writeFileSync(filePath, code);
        toolName = 'npx/tsx';
        // `npx` ships as a .cmd shim on Windows, so it needs cmd.exe to run.
        if (process.platform === 'win32') {
          cmd = process.env.ComSpec || 'cmd.exe';
          args = ['/d', '/s', '/c', `npx -y tsx "${filePath}"`];
        } else {
          cmd = 'npx';
          args = ['-y', 'tsx', filePath];
        }
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
        toolName = 'python';
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
        const compile = spawn('javac', [filePath], { cwd: tmpDir, timeout: 15000, env: childEnv() });
        let cerr = '';
        compile.stderr.on('data', (d) => (cerr = appendCapped(cerr, d.toString())));
        compile.on('close', (c) => {
          if (c !== 0) {
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}
            return resolve({ ok: false, error: cerr || 'Java compilation failed.' });
          }
          const runProc = spawn('java', ['-cp', tmpDir, className], {
            cwd: tmpDir,
            timeout: 15000,
            env: childEnv(),
          });
          let stdout = '';
          let stderr = '';
          if (stdin) {
            runProc.stdin.write(String(stdin));
            runProc.stdin.end();
          }
          runProc.stdout.on('data', (d) => (stdout = appendCapped(stdout, d.toString())));
          runProc.stderr.on('data', (d) => (stderr = appendCapped(stderr, d.toString())));
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
            resolve({ ok: false, error: spawnErrorMessage(err, toolName) });
          });
        });
        compile.on('error', (err) => {
          try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          } catch {}
          resolve({ ok: false, error: spawnErrorMessage(err, toolName) });
        });
        return;
      } else if (language === 'cpp') {
        filePath = path.join(tmpDir, 'main.cpp');
        fs.writeFileSync(filePath, code);
        toolName = 'g++';
        const compile = spawn('g++', ['-O2', '-o', 'main', filePath], {
          cwd: tmpDir,
          timeout: 20000,
          env: childEnv(),
        });
        let cerr = '';
        compile.stderr.on('data', (d) => (cerr = appendCapped(cerr, d.toString())));
        compile.on('close', (c) => {
          if (c !== 0) {
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}
            return resolve({ ok: false, error: cerr || 'C++ compilation failed.' });
          }
          const exe = process.platform === 'win32' ? path.join(tmpDir, 'main.exe') : path.join(tmpDir, 'main');
          const runProc = spawn(exe, [], { cwd: tmpDir, timeout: 15000, env: childEnv() });
          let stdout = '';
          let stderr = '';
          if (stdin) {
            runProc.stdin.write(String(stdin));
            runProc.stdin.end();
          }
          runProc.stdout.on('data', (d) => (stdout = appendCapped(stdout, d.toString())));
          runProc.stderr.on('data', (d) => (stderr = appendCapped(stderr, d.toString())));
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
            resolve({ ok: false, error: spawnErrorMessage(err, toolName) });
          });
        });
        compile.on('error', (err) => {
          try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          } catch {}
          resolve({ ok: false, error: spawnErrorMessage(err, toolName) });
        });
        return;
      } else {
        return resolve({ ok: false, error: `Local execution not supported for ${language}.` });
      }

      const proc = spawn(cmd, args, {
        cwd: tmpDir,
        env: childEnv(),
        timeout: 10000,
      });

      let stdout = '';
      let stderr = '';
      if (stdin) {
        proc.stdin.write(String(stdin));
        proc.stdin.end();
      }

      proc.stdout.on('data', (d) => {
        stdout = appendCapped(stdout, d.toString());
      });
      proc.stderr.on('data', (d) => {
        stderr = appendCapped(stderr, d.toString());
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
        resolve({ ok: false, error: spawnErrorMessage(err, toolName) });
      });
    } catch (err) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
      resolve({ ok: false, error: spawnErrorMessage(err, toolName) });
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

    // HTML previews are built in the browser; the server never renders them.
    if (language === 'html') {
      return res.json({
        ok: true,
        language,
        stdout: 'HTML preview is handled in the browser.',
        stderr: '',
        output: '',
        exitCode: 0,
        signal: null,
        html: true,
      });
    }

    let localError = null;
    async function tryLocalFallback() {
      if (!env.allowLocalExec || !LOCAL_RUNNABLE.has(language)) return null;
      const local = await runLocal({ language, code, stdin });
      if (local.ok) return local;
      localError = local.error ?? null;
      return null;
    }

    // No public runner by design: in production this is a clear setup error,
    // while development can still use the explicitly allowed local runner.
    if (!env.pistonApiUrl) {
      const local = await tryLocalFallback();
      if (local) return res.json(local);
      return res.status(503).json({ error: RUNNER_NOT_CONFIGURED_ERROR });
    }

    // Hard timeout so a hung runner can't tie up our event loop.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.pistonTimeoutMs);

    let upstream;
    try {
      upstream = await fetch(`${env.pistonApiUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.pistonApiKey ? { Authorization: `Bearer ${env.pistonApiKey}` } : {}),
        },
        body: JSON.stringify({
          language: pistonLang,
          version: '*',
          files: [{ name: pistonFileName(language, code), content: code }],
          stdin: String(stdin),
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      const timedOut = fetchErr?.name === 'AbortError';
      const local = timedOut ? null : await tryLocalFallback();
      if (local) return res.json(local);

      const error = timedOut ? 'Code runner timed out.' : RUNNER_UNAVAILABLE_ERROR;
      return res.status(timedOut ? 504 : 502).json({
        error: localError ? `${error} Local compiler said: ${localError}` : error,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      // Full upstream detail stays in server logs, never in the browser.
      console.error('[execute] runner error', upstream.status, errText.slice(0, 500));

      const local = await tryLocalFallback();
      if (local) return res.json(local);

      const authFailure = upstream.status === 401 || upstream.status === 403;
      const error = authFailure
        ? RUNNER_AUTH_ERROR
        : `Code runner rejected the request (HTTP ${upstream.status}). Ask the server administrator to check the execution service.`;
      return res.status(502).json({
        error: localError ? `${error} Local compiler said: ${localError}` : error,
      });
    }

    let data;
    try {
      data = await upstream.json();
    } catch {
      const local = await tryLocalFallback();
      if (local) return res.json(local);
      return res.status(502).json({ error: 'Code runner returned an invalid response.' });
    }

    return res.json(formatPistonResponse(data, language));
  } catch (err) {
    console.error('[execute] unexpected error', err);
    return res.status(500).json({ error: 'Execution failed unexpectedly.' });
  }
});
