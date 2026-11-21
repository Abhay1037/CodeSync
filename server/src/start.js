/**
 * Production entry point.
 *
 * Forces NODE_ENV before any module (especially config/env.js) is imported:
 * that enables static SPA serving, disables the unsandboxed local runner and
 * hides stack traces. Run with `npm start` from the repository root.
 */
process.env.NODE_ENV = 'production';

await import('./server.js');
