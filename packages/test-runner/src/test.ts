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

import { assert } from 'console';
import { Parameters, TestAnnotations, TestResult, TestStatus } from './ipc';

class Base {
  title: string;
  file: string;
  location: string;
  parent?: Suite;

  _only = false;
  _ordinal: number;

  constructor(title: string, parent?: Suite) {
    this.title = title;
    this.parent = parent;
  }

  titlePath(): string[] {
    if (!this.parent)
      return [];
    if (!this.title)
      return this.parent.titlePath();
    return [...this.parent.titlePath(), this.title];
  }

  fullTitle(): string {
    return this.titlePath().join(' ');
  }
}

export class Spec extends Base {
  fn: Function;
  tests: Test[] = [];

  constructor(title: string, fn: Function, suite: Suite) {
    super(title, suite);
    this.fn = fn;
    suite._addSpec(this);
  }

  _ok(): boolean {
    return !this.tests.find(r => !r.ok());
  }
}

export class Suite extends Base {
  suites: Suite[] = [];
  specs: Spec[] = [];
  _entries: (Suite | Spec)[] = [];
  total = 0;

  constructor(title: string, parent?: Suite) {
    super(title, parent);
    if (parent)
      parent._addSuite(this);
  }

  _addSpec(spec: Spec) {
    spec.parent = this;
    this.specs.push(spec);
    this._entries.push(spec);
  }

  _addSuite(suite: Suite) {
    suite.parent = this;
    this.suites.push(suite);
    this._entries.push(suite);
  }

  findSpec(fn: (test: Spec) => boolean | void): boolean {
    for (const suite of this.suites) {
      if (suite.findSpec(fn))
        return true;
    }
    for (const test of this.specs) {
      if (fn(test))
        return true;
    }
    return false;
  }

  findSuite(fn: (suite: Suite) => boolean | void): boolean {
    if (fn(this))
      return true;
    for (const suite of this.suites) {
      if (suite.findSuite(fn))
        return true;
    }
    return false;
  }

  _allSpecs(): Spec[] {
    const result: Spec[] = [];
    this.findSpec(test => { result.push(test); });
    return result;
  }

  _renumber() {
    // All tests are identified with their ordinals.
    let ordinal = 0;
    this.findSpec((test: Spec) => {
      test._ordinal = ordinal++;
    });
  }

  _countTotal() {
    this.total = 0;
    for (const suite of this.suites) {
      suite._countTotal();
      this.total += suite.total;
    }
    for (const spec of this.specs)
      this.total += spec.tests.length;
  }
}

export class Test {
  spec: Spec;
  parameters: Parameters;
  skipped: boolean;
  flaky: boolean;
  slow: boolean;
  expectedStatus: TestStatus;
  timeout: number;
  annotations: any[];
  results: TestResult[] = [];

  _annotations?: TestAnnotations;

  constructor(spec: Spec) {
    this.spec = spec;
  }

  _appendResult(result: TestResult) {
    assert(result.retryNumber === this.results.length);
    this.results.push(result);
  }

  _setAnnotations(annotations: TestAnnotations) {
    this._annotations = annotations;
    this.skipped = annotations.skipped;
    this.flaky = annotations.flaky;
    this.slow = annotations.slow;
    this.expectedStatus = annotations.expectedStatus;
    this.timeout = annotations.timeout;
    this.annotations = annotations.annotations;
  }

  ok(): boolean {
    let hasPassedResults = false;
    for (const result of this.results) {
      // Missing status is Ok when running in shards mode.
      if (result.status === 'skipped' || !result.status)
        return true;
      if (!this.flaky && result.status !== this.expectedStatus)
        return false;
      if (result.status === this.expectedStatus)
        hasPassedResults = true;
    }
    return hasPassedResults;
  }
}
