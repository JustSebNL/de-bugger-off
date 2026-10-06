# de-bugger-off

De-bugger-off is your simple way to tell bugs to bugger off. It is designed to drop into a project without giving you a headache during setup—because bugs in a codebase are already reason enough to pull your hair out... if you still have any. It will not fix the bugs for you, but it will leave a clear, readable trail to help you find the culprit. There are no npm dependencies, and it works in browser or Node.js projects, redacts common sensitive values, and can produce a styled standalone HTML report.

Maintainer: [JustSebNL (Just Seb)](https://github.com/JustSebNL)

## Browser setup

Copy the `debugger/` directory into your project and add one script tag to the page's `<head>`:

```html
<script src="debugger/debug-logger.js" data-namespace="my-project" data-level="debug"></script>
```

The script creates a global `DebugLogger`. Use it from later scripts:

```html
<script>
  DebugLogger.info('Application started', { version: '1.0' });
  DebugLogger.error('Request failed', { status: 500 });
</script>
```

The browser logger keeps a bounded localStorage history. Download a readable report with:

```js
DebugLogger.downloadHTML('my-project-debug.html');
```

Script-tag options are `data-namespace`, `data-level`, `data-enabled`, `data-max-entries`, and `data-storage-key`.

## Node.js setup

No npm install is required. Use the same file with CommonJS:

```js
const DebugLogger = require('./debugger/debug-logger.js');
const log = DebugLogger.createLogger({
  namespace: 'my-project',
  level: 'debug',
  filePath: './debug.html'
});

log.info('Application started', { version: '1.0' });
log.error('Request failed', { status: 500 });
```

A `.html` `filePath` is rewritten as a self-contained, styled log report as entries arrive; open it directly in a browser. Use a `.jsonl` path for newline-delimited JSON instead. File output uses Node.js built-ins only.

## Logger API

`debug`, `info`, `warn`, `error`, `capture`, `setLevel`, `setEnabled`, `getLogs`, `export`, `exportHTML`, `exportJSON`, `downloadHTML`, `flush`, `clear`, and `child` are available on each logger. Configure levels, names, retention, storage, output, and sinks through `createLogger(options)`.

Log records are bounded. By default, common secret fields, emails, local paths, and URL query/fragment values are redacted before storage or output.

Run the tests with Node's built-in test runner:

```sh
node --test scripts/debug-logger.test.mjs
```

Licensed under Apache-2.0; see `LICENSE`.
