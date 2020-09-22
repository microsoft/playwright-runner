/**
 * Copyright Microsoft Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { initializeImageMatcher } from './expect';
import { WorkerRunner, fixturePool } from './workerRunner';
import { Console } from 'console';
import { serializeError } from './util';
import { debugLog, setDebugWorkerIndex } from './debug';

let closed = false;

sendMessageToParent('ready');

if (!process.env.PW_RUNNER_DEBUG) {
  global.console = new Console({
    stdout: process.stdout,
    stderr: process.stderr,
    colorMode: process.env.FORCE_COLOR === '1',
  });

  process.stdout.write = chunk => {
    if (testRunner)
      testRunner.stdout(chunk);
    return true;
  };

  process.stderr.write = chunk => {
    if (testRunner)
      testRunner.stderr(chunk);
    return true;
  };
}

process.on('disconnect', gracefullyCloseAndExit);
process.on('SIGINT',() => {});
process.on('SIGTERM',() => {});

let workerIndex: number;
let testRunner: WorkerRunner;

process.on('unhandledRejection', (reason, promise) => {
  if (testRunner)
    testRunner.unhandledError(reason);
});

process.on('uncaughtException', error => {
  if (testRunner)
    testRunner.unhandledError(error);
});

process.on('message', async message => {
  if (message.method === 'init') {
    workerIndex = message.params.workerIndex;
    setDebugWorkerIndex(workerIndex);
    initializeImageMatcher(message.params);
    debugLog(`init`, message.params);
    return;
  }
  if (message.method === 'stop') {
    debugLog(`stopping...`);
    await gracefullyCloseAndExit();
    debugLog(`stopped`);
    return;
  }
  if (message.method === 'run') {
    debugLog(`run`, message.params);
    testRunner = new WorkerRunner(message.params.entry, message.params.config, workerIndex);
    for (const event of ['testBegin', 'testStdOut', 'testStdErr', 'testEnd', 'done'])
      testRunner.on(event, sendMessageToParent.bind(null, event));
    await testRunner.run();
    testRunner = null;
  }
});

async function gracefullyCloseAndExit() {
  if (closed)
    return;
  closed = true;
  // Force exit after 30 seconds.
  setTimeout(() => process.exit(0), 30000);
  // Meanwhile, try to gracefully close all browsers.
  if (testRunner)
    testRunner.stop();
  try {
    await fixturePool.teardownScope('worker');
  } catch (e) {
    process.send({ method: 'teardownError', params: { error: serializeError(e) } });
  }
  process.exit(0);
}

function sendMessageToParent(method, params = {}) {
  if (closed)
    return;
  try {
    if (method !== 'ready')
      debugLog(`send`, { method, params });
    process.send({ method, params });
  } catch (e) {
    // Can throw when closing.
  }
}
