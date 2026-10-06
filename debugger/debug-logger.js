(function(root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DebugLogger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  var LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  var SECRET_KEY = /(?:pass(?:word)?|secret|token|cookie|authorization|api[_-]?key|private[_-]?key|email)/i;
  var MAX_STRING_LENGTH = 4096;

  function safeStorage(candidate) {
    if (candidate && typeof candidate.getItem === 'function' &&
        typeof candidate.setItem === 'function' && typeof candidate.removeItem === 'function') return candidate;
    if (typeof module === 'object' && module.exports) return null;
    try {
      var storage = root && root.localStorage;
      if (storage && typeof storage.getItem === 'function' &&
          typeof storage.setItem === 'function' && typeof storage.removeItem === 'function') return storage;
    } catch (e) {}
    return null;
  }

  function cleanText(value) {
    var text = String(value == null ? '' : value)
      .replace(/bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
      .replace(/\b(?:token|secret|password|cookie|authorization)\s*[:=]\s*[^\s,;]+/gi, '[redacted]')
      .replace(/https?:\/\/[^\s"'<>]+/gi, function(value) {
        try {
          var url = new URL(value);
          return url.origin + url.pathname + (url.search ? '?[redacted]' : '') + (url.hash ? '#[redacted]' : '');
        } catch (e) {
          return '[url]';
        }
      })
      .replace(/(^|[\s("'=])(?:[A-Za-z]:[\\/]|\/(?:home|Users|mnt|tmp|workspace|var\/www)\/)[^\s"'<>]*/gi, '$1[path]')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > MAX_STRING_LENGTH ? text.slice(0, MAX_STRING_LENGTH) + '…' : text;
  }

  function safeValue(value, key, seen, depth) {
    if (key && SECRET_KEY.test(key)) return '[redacted]';
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return cleanText(value);
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function' || typeof value === 'symbol') return cleanText(String(value));
    if (value instanceof Error) {
      return {
        name: cleanText(value.name || 'Error'),
        message: cleanText(value.message || ''),
        stack: cleanText(value.stack || '')
      };
    }
    if (value instanceof Date) {
      try { return value.toISOString(); } catch (e) { return '[invalid date]'; }
    }
    if (depth >= 6) return '[max-depth]';
    seen = seen || new Set();
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    var result;
    if (Array.isArray(value)) {
      result = value.slice(0, 50).map(function(item) { return safeValue(item, '', seen, depth + 1); });
      if (value.length > 50) result.push('[truncated]');
    } else {
      result = {};
      Object.keys(value).slice(0, 50).forEach(function(property) {
        try { result[property] = safeValue(value[property], property, seen, depth + 1); }
        catch (e) { result[property] = '[unavailable]'; }
      });
    }
    seen.delete(value);
    return result;
  }

  function normalizeLevel(level) {
    var normalized = String(level || 'debug').toLowerCase();
    return Object.prototype.hasOwnProperty.call(LEVELS, normalized) ? normalized : 'debug';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderHtml(namespace, records, maxChars) {
    var selected = records.slice();
    function build(entries) {
      var counts = { debug: 0, info: 0, warn: 0, error: 0 };
      entries.forEach(function(entry) { if (counts[entry.level] !== undefined) counts[entry.level]++; });
      var cards = entries.map(function(entry) {
        var details = entry.data === undefined ? '' :
          '<details><summary>Details</summary><pre>' + escapeHtml(JSON.stringify(entry.data, null, 2)) + '</pre></details>';
        return '<article class="entry entry--' + escapeHtml(entry.level) + '">' +
          '<div class="entry__header"><time>' + escapeHtml(entry.timestamp) + '</time><span class="badge badge--' + escapeHtml(entry.level) + '">' + escapeHtml(entry.level.toUpperCase()) + '</span><span class="scope">' + escapeHtml(entry.namespace) + '</span></div>' +
          '<div class="entry__message">' + escapeHtml(entry.message) + '</div>' + details +
          '</article>';
      }).join('\n');
      return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + escapeHtml(namespace) + ' debug log</title>\n<style>' +
        ':root{color-scheme:dark;--bg:#0b1020;--panel:#111a2e;--border:#293750;--text:#e8eefb;--muted:#98a8c4;--debug:#38bdf8;--info:#60a5fa;--warn:#fbbf24;--error:#fb7185}' +
        '*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top,#17233d 0,var(--bg) 55%);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}' +
        'main{max-width:1040px;margin:0 auto;padding:28px 20px 60px}header h1{margin:4px 0 2px;font-size:25px;letter-spacing:-.03em}.eyebrow{color:var(--debug);font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}.subtitle{color:var(--muted);margin:0}' +
        '.overview{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0}.stat{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--muted)}.stat strong{color:var(--text);margin-right:5px}.entries{display:grid;gap:10px}.entry{background:rgba(17,26,46,.88);border:1px solid var(--border);border-left:4px solid var(--debug);border-radius:9px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.16)}.entry--info{border-left-color:var(--info)}.entry--warn{border-left-color:var(--warn)}.entry--error{border-left-color:var(--error)}.entry__header{display:flex;align-items:center;gap:9px;flex-wrap:wrap;color:var(--muted);font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}.badge{border-radius:99px;padding:2px 8px;background:rgba(56,189,248,.13);color:var(--debug);font:700 10px/1.5 system-ui,sans-serif}.badge--info{background:rgba(96,165,250,.13);color:var(--info)}.badge--warn{background:rgba(251,191,36,.14);color:var(--warn)}.badge--error{background:rgba(251,113,133,.14);color:var(--error)}.scope{color:#c3d2ea}.entry__message{margin-top:8px;white-space:pre-wrap;overflow-wrap:anywhere;font-weight:600}details{margin-top:8px;color:var(--muted)}summary{cursor:pointer;width:max-content}pre{margin:8px 0 0;padding:10px;border-radius:7px;background:#080d18;color:#c8d7ee;white-space:pre-wrap;overflow-wrap:anywhere;overflow-x:auto;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}.empty{margin-top:18px;padding:22px;border:1px dashed var(--border);border-radius:10px;color:var(--muted);text-align:center}@media(max-width:600px){main{padding:18px 12px 40px}header h1{font-size:21px}}' +
        '</style>\n</head>\n<body>\n<main>\n<header><div class="eyebrow">Local debug trace</div><h1>' + escapeHtml(namespace) + '</h1><p class="subtitle">' + entries.length + ' entries · generated ' + escapeHtml(new Date().toISOString()) + '</p></header>\n' +
        '<section class="overview"><div class="stat"><strong>' + entries.length + '</strong>total</div><div class="stat"><strong>' + counts.debug + '</strong>debug</div><div class="stat"><strong>' + counts.info + '</strong>info</div><div class="stat"><strong>' + counts.warn + '</strong>warnings</div><div class="stat"><strong>' + counts.error + '</strong>errors</div></section>\n' +
        (cards ? '<section class="entries">' + cards + '</section>' : '<div class="empty">No log entries yet.</div>') + '\n</main>\n</body>\n</html>\n';
    }
    var html = build(selected);
    while (html.length > maxChars && selected.length > 1) {
      selected.shift();
      html = build(selected);
    }
    return html;
  }

  function createLogger(options) {
    options = options || {};
    var namespace = cleanText(options.namespace || 'app') || 'app';
    var enabled = options.enabled !== false;
    var minimumLevel = normalizeLevel(options.level || 'debug');
    var consoleOutput = options.consoleOutput !== false;
    var consoleTarget = options.console || (root && root.console);
    var maxEntries = Math.max(1, Math.min(10000, Number(options.maxEntries) || 1000));
    var maxStorageChars = Math.max(4096, Math.min(2000000, Number(options.maxStorageChars) || 250000));
    var maxFileBytes = Math.max(4096, Math.min(20000000, Number(options.maxFileBytes) || 1000000));
    var storageKey = String(options.storageKey || ('debug-logger:' + namespace));
    var storage = options.persist === false ? null : safeStorage(options.storage);
    var filePath = typeof options.filePath === 'string' ? options.filePath : '';
    var sink = typeof options.sink === 'function' ? options.sink : null;
    var sinkError = typeof options.onSinkError === 'function' ? options.onSinkError : function() {};
    var entries = [];

    if (storage) {
      try {
        var stored = JSON.parse(storage.getItem(storageKey) || '[]');
        if (Array.isArray(stored)) entries = stored.slice(-maxEntries).map(function(entry) {
          return safeValue(entry, '', new Set(), 0);
        });
      } catch (e) {}
    }

    function persistStorage() {
      if (!storage) return;
      try {
        var serialized = JSON.stringify(entries);
        while (serialized.length > maxStorageChars && entries.length > 1) {
          entries.shift();
          serialized = JSON.stringify(entries);
        }
        storage.setItem(storageKey, serialized);
      } catch (error) {
        try { sinkError(error); } catch (e) {}
      }
    }

    function persistFile(entry) {
      if (!filePath || typeof require !== 'function' || typeof module !== 'object' || !module.exports) return;
      try {
        var fs = require('fs');
        var path = require('path');
        var resolvedPath = path.resolve(filePath);
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        if (path.extname(resolvedPath).toLowerCase() === '.html') {
          fs.writeFileSync(resolvedPath, renderHtml(namespace, entries, maxFileBytes), { encoding: 'utf8', mode: 0o600 });
          return;
        }
        fs.appendFileSync(resolvedPath, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
        if (fs.statSync(resolvedPath).size > maxFileBytes) {
          var lines = fs.readFileSync(resolvedPath, 'utf8').split(/\r?\n/).filter(Boolean);
          var keep = [];
          var byteCount = 0;
          for (var i = lines.length - 1; i >= 0; i--) {
            var lineBytes = typeof Buffer !== 'undefined' ? Buffer.byteLength(lines[i] + '\n', 'utf8') : lines[i].length + 1;
            if (keep.length && byteCount + lineBytes > maxFileBytes) break;
            keep.unshift(lines[i]);
            byteCount += lineBytes;
          }
          fs.writeFileSync(resolvedPath, keep.join('\n') + (keep.length ? '\n' : ''), { encoding: 'utf8', mode: 0o600 });
        }
      } catch (error) {
        try { sinkError(error); } catch (e) {}
      }
    }

    function emit(level, message, data) {
      level = normalizeLevel(level);
      if (!enabled || LEVELS[level] < LEVELS[minimumLevel]) return null;
      var error = message instanceof Error ? message : null;
      var messageText = error ? (error.message || error.name || 'Error') :
        (typeof message === 'string' ? message : JSON.stringify(safeValue(message, '', new Set(), 0)));
      var entry = {
        timestamp: new Date().toISOString(),
        namespace: namespace,
        level: level,
        message: cleanText(messageText)
      };
      if (data !== undefined) entry.data = safeValue(data, '', new Set(), 0);
      else if (error) entry.data = safeValue(error, '', new Set(), 0);
      entries.push(entry);
      if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);
      persistStorage();
      persistFile(entry);
      if (sink) {
        try { sink(safeValue(entry, '', new Set(), 0)); } catch (sinkFailure) { try { sinkError(sinkFailure); } catch (e) {} }
      }
      if (consoleOutput && consoleTarget) {
        var method = typeof consoleTarget[level] === 'function' ? consoleTarget[level] : consoleTarget.log;
        if (typeof method === 'function') {
          if (entry.data === undefined) method.call(consoleTarget, '[' + namespace + ']', entry.message);
          else method.call(consoleTarget, '[' + namespace + ']', entry.message, entry.data);
        }
      }
      return safeValue(entry, '', new Set(), 0);
    }

    var logger = {
      log: emit,
      debug: function(message, data) { return emit('debug', message, data); },
      info: function(message, data) { return emit('info', message, data); },
      warn: function(message, data) { return emit('warn', message, data); },
      error: function(message, data) { return emit('error', message, data); },
      capture: function(error, data) { return emit('error', error, data); },
      setEnabled: function(value) { enabled = !!value; return enabled; },
      setLevel: function(value) { minimumLevel = normalizeLevel(value); return minimumLevel; },
      configure: function(next) {
        next = next || {};
        if (Object.prototype.hasOwnProperty.call(next, 'enabled')) enabled = !!next.enabled;
        if (Object.prototype.hasOwnProperty.call(next, 'level')) minimumLevel = normalizeLevel(next.level);
        if (Object.prototype.hasOwnProperty.call(next, 'consoleOutput')) consoleOutput = next.consoleOutput !== false;
        return logger;
      },
      child: function(name) {
        var childName = cleanText(name || 'child');
        var childOptions = Object.assign({}, options, { namespace: namespace + ':' + childName });
        if (Object.prototype.hasOwnProperty.call(options, 'storageKey')) childOptions.storageKey = storageKey + ':' + childName;
        else delete childOptions.storageKey;
        return createLogger(childOptions);
      },
      getLogs: function() { return safeValue(entries, '', new Set(), 0); },
      export: function() { return renderHtml(namespace, entries, maxFileBytes); },
      exportHTML: function() { return renderHtml(namespace, entries, maxFileBytes); },
      exportJSON: function() { return JSON.stringify(entries, null, 2); },
      downloadHTML: function(filename) {
        if (!root || !root.document || !root.Blob || !root.URL || typeof root.URL.createObjectURL !== 'function') return false;
        var safeFilename = String(filename || (namespace + '-debug-log.html')).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 160);
        var url = '';
        try {
          url = root.URL.createObjectURL(new root.Blob([renderHtml(namespace, entries, maxFileBytes)], { type: 'text/html;charset=utf-8' }));
          var link = root.document.createElement('a');
          link.href = url;
          link.download = safeFilename.toLowerCase().endsWith('.html') ? safeFilename : safeFilename + '.html';
          (root.document.body || root.document.documentElement).appendChild(link);
          link.click();
          link.remove();
          root.setTimeout(function() { try { root.URL.revokeObjectURL(url); } catch (e) {} }, 1000);
          return true;
        } catch (e) {
          if (url) { try { root.URL.revokeObjectURL(url); } catch (ignore) {} }
          return false;
        }
      },
      flush: function() { persistStorage(); return true; },
      clear: function() {
        entries = [];
        if (storage) { try { storage.removeItem(storageKey); } catch (e) {} }
        return true;
      }
    };
    Object.defineProperties(logger, {
      enabled: { enumerable: true, get: function() { return enabled; } },
      level: { enumerable: true, get: function() { return minimumLevel; } },
      namespace: { enumerable: true, get: function() { return namespace; } }
    });
    return logger;
  }

  function scriptOptions() {
    try {
      var script = root && root.document && root.document.currentScript;
      if (!script || typeof script.getAttribute !== 'function') return { namespace: 'debug' };
      return {
        namespace: script.getAttribute('data-namespace') || 'debug',
        level: script.getAttribute('data-level') || 'debug',
        enabled: script.getAttribute('data-enabled') !== 'false',
        maxEntries: Number(script.getAttribute('data-max-entries')) || 1000,
        storageKey: script.getAttribute('data-storage-key') || undefined
      };
    } catch (e) {
      return { namespace: 'debug' };
    }
  }

  var defaultLogger = createLogger(scriptOptions());
  defaultLogger.createLogger = createLogger;
  defaultLogger.levels = Object.assign({}, LEVELS);
  return defaultLogger;
});
