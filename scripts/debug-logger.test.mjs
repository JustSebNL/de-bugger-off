import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';

const loggerSource = fs.readFileSync(new URL('../debugger/debug-logger.js', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const DebugLogger = require('../debugger/debug-logger.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test('browser script tag configures the global logger without package imports', () => {
  const values = new Map();
  const output = [];
  const attrs = {
    'data-namespace': 'sample-site',
    'data-level': 'info',
    'data-enabled': 'true',
    'data-storage-key': 'sample-site-logs'
  };
  const context = {
    URL,
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    },
    document: { currentScript: { getAttribute(name) { return attrs[name] || null; } } },
    console: { debug: (...args) => output.push(args), info: (...args) => output.push(args), warn: (...args) => output.push(args), error: (...args) => output.push(args) }
  };
  context.globalThis = context;
  vm.runInNewContext(loggerSource, context);

  context.DebugLogger.debug('filtered');
  context.DebugLogger.info('started');

  assert.equal(context.DebugLogger.namespace, 'sample-site');
  assert.equal(context.DebugLogger.level, 'info');
  assert.equal(output.length, 1);
  assert.ok(values.has('sample-site-logs'));
});

test('portable logger captures configured levels to a supplied local sink', () => {
  assert.equal(globalThis.DebugLogger, DebugLogger);
  const written = [];
  const logger = DebugLogger.createLogger({
    namespace: 'example-project',
    enabled: true,
    level: 'debug',
    consoleOutput: false,
    persist: false,
    sink: entry => written.push(entry)
  });

  logger.debug('startup', { ready: true });
  logger.warn('retrying', { attempt: 2 });

  assert.equal(written.length, 2);
  assert.equal(written[0].namespace, 'example-project');
  assert.equal(written[0].level, 'debug');
  assert.equal(logger.getLogs().length, 2);
});

test('logger defaults to verbose output and can be configured or disabled', () => {
  const output = [];
  const logger = DebugLogger.createLogger({
    namespace: 'levels',
    consoleOutput: true,
    console: { debug: (...args) => output.push(args), info: (...args) => output.push(args), warn: (...args) => output.push(args), error: (...args) => output.push(args) },
    persist: false
  });

  logger.debug('visible');
  logger.setLevel('warn');
  logger.info('filtered');
  logger.error('visible error');
  logger.setEnabled(false);
  logger.error('disabled');

  assert.equal(output.length, 2);
  assert.equal(logger.getLogs().length, 2);
});

test('local storage persistence is bounded and redacts secrets and URL queries', () => {
  const storage = memoryStorage();
  const options = { namespace: 'privacy', storage: storage, maxEntries: 2, consoleOutput: false };
  const logger = DebugLogger.createLogger(options);

  logger.info('download attempt', {
    url: 'https://media.example/video.mp4?token=private&session=secret',
    credentials: { password: 'hidden', authorization: 'Bearer hidden-token' },
    contact: 'person@example.com',
    localPath: 'D:/Users/alice/private/trace.jsonl'
  });
  const firstSaved = storage.getItem('debug-logger:privacy');
  assert.ok(firstSaved);
  assert.doesNotMatch(firstSaved, /private|secret|hidden-token|person@example\.com/);
  assert.match(firstSaved, /https:\/\/media\.example\/video\.mp4\?\[redacted\]/);
  assert.match(firstSaved, /\[path\]/);

  logger.info('second event');
  logger.info('third event');
  assert.equal(logger.getLogs().length, 2);
  assert.equal(DebugLogger.createLogger(options).getLogs().length, 2);
});

test('HTML export is self-contained, styled, and escapes log content', () => {
  const logger = DebugLogger.createLogger({ namespace: 'html-app', consoleOutput: false, persist: false });
  logger.error('<script>alert(1)</script>', { detail: '<b>unsafe</b>' });

  const html = logger.export();
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<style>/);
  assert.match(html, /class="entry entry--error"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;unsafe&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(logger.exportJSON(), /"level": "error"/);
});

test('an HTML file path produces an openable styled report', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-logger-html-'));
  const filePath = path.join(directory, 'debug.html');
  try {
    const logger = DebugLogger.createLogger({ namespace: 'html-file', filePath: filePath, consoleOutput: false, persist: false });
    logger.info('startup complete');
    const html = fs.readFileSync(filePath, 'utf8');
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /html-file/);
    assert.match(html, /startup complete/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Node JSONL file output remains available when configured', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-logger-'));
  const filePath = path.join(directory, 'trace.jsonl');
  try {
    const logger = DebugLogger.createLogger({ namespace: 'node-app', filePath: filePath, maxFileBytes: 4096, consoleOutput: false, persist: false });
    logger.error('failure', { error: new Error('safe message') });
    const entry = JSON.parse(fs.readFileSync(filePath, 'utf8').trim());
    assert.equal(entry.namespace, 'node-app');
    assert.equal(entry.level, 'error');
    assert.equal(entry.data.error.message, 'safe message');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
