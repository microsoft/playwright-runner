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

import { FixturePool, rerunRegistrations, assignParameters, TestInfo, parameters } from './fixtures';
import { EventEmitter } from 'events';
import { setCurrentTestFile } from './expect';
import { Test, Suite, Configuration, serializeError, TestResult, TestStatus } from './test';
import { spec } from './spec';
import { RunnerConfig } from './runnerConfig';
import * as util from 'util';

export const fixturePool = new FixturePool();

export type TestBeginPayload = {
  id: string;
  skipped: boolean;
  flaky: boolean
  slow: boolean;
  timeout: number;
  expectedStatus: TestStatus;
}

export type TestEndPayload = {
  id: string;
  result: TestResult;
}

export type TestRunnerEntry = {
  file: string;
  ids: string[];
  configurationString: string;
  configuration: Configuration;
  hash: string;
};

function chunkToParams(chunk: Buffer | string):  { text?: string, buffer?: string } {
  if (chunk instanceof Buffer)
    return { buffer: chunk.toString('base64') };
  if (typeof chunk !== 'string')
    return { text: util.inspect(chunk) };
  return { text: chunk };
}

export class TestRunner extends EventEmitter {
  private _failedTestId: string | undefined;
  private _fatalError: any | undefined;
  private _ids: Set<string>;
  private _remaining: Set<string>;
  private _trialRun: any;
  private _parsedGeneratorConfiguration: any = {};
  private _config: RunnerConfig;
  private _timeout: number;
  private _testId: string | null;
  private _stdOutBuffer: (string | Buffer)[] = [];
  private _stdErrBuffer: (string | Buffer)[] = [];
  private _testResult: TestResult | null = null;
  private _suite: Suite;
  private _loaded = false;

  constructor(entry: TestRunnerEntry, config: RunnerConfig, workerId: number) {
    super();
    this._suite = new Suite('');
    this._suite.file = entry.file;
    this._suite._configurationString = entry.configurationString;
    this._ids = new Set(entry.ids);
    this._remaining = new Set(entry.ids);
    this._trialRun = config.trialRun;
    this._timeout = config.timeout;
    this._config = config;
    for (const {name, value} of entry.configuration)
      this._parsedGeneratorConfiguration[name] = value;
    this._parsedGeneratorConfiguration['config'] = config;
    this._parsedGeneratorConfiguration['parallelIndex'] = workerId;
    setCurrentTestFile(this._suite.file);
  }

  stop() {
    this._trialRun = true;
  }

  unhandledError(error: Error | any) {
    if (this._testResult) {
      this._testResult.status = 'failed';
      this._testResult.error = serializeError(error);
      this._failedTestId = this._testId;
      this.emit('testEnd', {
        id: this._testId,
        result: this._testResult
      } as TestEndPayload);
      this._testResult = null;
    } else if (!this._loaded) {
      // No current test - fatal error.
      this._fatalError = serializeError(error);
    }
    this._reportDone();
  }

  stdout(chunk: string | Buffer) {
    this._stdOutBuffer.push(chunk);
    for (const c of this._stdOutBuffer)
      this.emit('testStdOut', { id: this._testId, ...chunkToParams(c) });
    this._stdOutBuffer = [];
  }

  stderr(chunk: string | Buffer) {
    this._stdErrBuffer.push(chunk);
    for (const c of this._stdErrBuffer)
      this.emit('testStdErr', { id: this._testId, ...chunkToParams(c) });
    this._stdErrBuffer = [];
  }

  async run() {
    assignParameters(this._parsedGeneratorConfiguration);

    const revertBabelRequire = spec(this._suite, this._suite.file, this._timeout, parameters);
    require(this._suite.file);
    revertBabelRequire();
    // Enumerate tests to assign ordinals.
    this._suite._renumber();
    // Build ids from ordinals + configuration strings.
    this._suite._assignIds();
    this._loaded = true;

    rerunRegistrations(this._suite.file);
    await this._runSuite(this._suite);
    this._reportDone();
  }

  private async _runSuite(suite: Suite) {
    try {
      await this._runHooks(suite, 'beforeAll', 'before');
    } catch (e) {
      this._fatalError = serializeError(e);
      this._reportDone();
    }
    for (const entry of suite._entries) {
      if (entry instanceof Suite)
        await this._runSuite(entry);
      else
        await this._runTest(entry);
    }
    try {
      await this._runHooks(suite, 'afterAll', 'after');
    } catch (e) {
      this._fatalError = serializeError(e);
      this._reportDone();
    }
  }

  private async _runTest(test: Test) {
    if (this._failedTestId)
      return false;
    if (this._ids.size && !this._ids.has(test._id))
      return;
    this._remaining.delete(test._id);

    const id = test._id;
    this._testId = id;
    // We only know resolved skipped/flaky value in the worker,
    // send it to the runner.
    test._skipped = test._isSkipped();
    test._flaky = test.isFlaky();
    test._slow = test._isSlow();
    test._timeout = test._isSlow() ? this._timeout * 3 : this._timeout;
    this.emit('testBegin', {
      id,
      skipped: test._skipped,
      flaky: test._flaky,
      slow: test._slow,
      timeout: test._timeout,
    } as TestBeginPayload);

    const result: TestResult = {
      duration: 0,
      status: 'passed',
      expectedStatus: test._expectedStatus,
      stdout: [],
      stderr: [],
      data: {}
    };
    this._testResult = result;

    if (test._skipped) {
      result.status = 'skipped';
      this.emit('testEnd', { id, result });
      return;
    }

    const startTime = Date.now();
    try {
      const testInfo = { config: this._config, test, result };
      if (!this._trialRun) {
        await this._runHooks(test.parent, 'beforeEach', 'before', testInfo);
        await fixturePool.runTestWithFixturesAndTimeout(test.fn, test._timeout, testInfo);
        await this._runHooks(test.parent, 'afterEach', 'after', testInfo);
      } else {
        result.status = result.expectedStatus;
      }
    } catch (error) {
      // Error in the test fixture teardown.
      result.status = 'failed';
      result.error = serializeError(error);
    }
    result.duration = Date.now() - startTime;
    if (this._testResult) {
      // We could have reported end due to an unhandled exception.
      this.emit('testEnd', { id, result });
    }
    if (result.status !== 'passed')
      this._failedTestId = this._testId;
    this._testResult = null;
    this._testId = null;
  }

  private async _runHooks(suite: Suite, type: string, dir: 'before' | 'after', testInfo?: TestInfo) {
    if (!suite._hasTestsToRun())
      return;
    const all = [];
    for (let s = suite; s; s = s.parent) {
      const funcs = s._hooks.filter(e => e.type === type).map(e => e.fn);
      all.push(...funcs.reverse());
    }
    if (dir === 'before')
      all.reverse();
    for (const hook of all)
      await fixturePool.resolveParametersAndRun(hook, this._config, testInfo);
  }

  private _reportDone() {
    this.emit('done', {
      failedTestId: this._failedTestId,
      fatalError: this._fatalError,
      remaining: [...this._remaining],
    });
  }
}
