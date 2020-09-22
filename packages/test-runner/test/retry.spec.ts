/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import colors from 'colors/safe';
import { fixtures } from './fixtures';
const { it, expect } = fixtures;

function countSubstring(output: string, str: string): number {
  const index = output.indexOf(str);
  if (index === -1)
    return 0;
  return 1 + countSubstring(output.substring(index + str.length), str);
}

it('should retry failures', async ({ runTest }) => {
  const result = await runTest('retry-failures.js', { retries: 10 });
  expect(result.exitCode).toBe(1);
  expect(result.expectedFlaky).toBe(0);
  expect(result.unexpectedFlaky).toBe(1);
  // Just a single annotation.
  expect(result.report.suites[0].specs[0].tests[0].annotations.length).toBe(1);
  expect(result.report.suites[0].specs[0].tests[0].annotations[0].type).toBe('slow');
  expect(result.report.suites[0].specs[0].tests[0].annotations[0].description).toContain('hey');
  // Modifiers function should be run only once.
  expect(countSubstring(result.output, 'modifiers!')).toBe(1);
  // There should be two results, first failed, second passed.
  expect(result.results.length).toBe(2);
  expect(result.results[0].workerIndex).toBe(0);
  expect(result.results[0].status).toBe('failed');
  expect(result.results[1].workerIndex).toBe(1);
  expect(result.results[1].status).toBe('passed');
});

it('should retry timeout', async ({ runTest }) => {
  const { exitCode, passed, failed, timedOut, output } = await runTest('one-timeout.js', { timeout: 100, retries: 2 });
  expect(exitCode).toBe(1);
  expect(passed).toBe(0);
  expect(failed).toBe(0);
  expect(timedOut).toBe(1);
  expect(output.split('\n')[0]).toBe(colors.red('T').repeat(3));
});

it('should fail on unexpected pass with retries', async ({ runTest }) => {
  const { exitCode, failed, output } = await runTest('unexpected-pass.js', { retries: 1 });
  expect(exitCode).toBe(1);
  expect(failed).toBe(1);
  expect(output).toContain('passed unexpectedly');
});

it('should not retry unexpected pass', async ({ runTest }) => {
  const { exitCode, passed, failed, output } = await runTest('unexpected-pass.js', { retries: 2 });
  expect(exitCode).toBe(1);
  expect(passed).toBe(0);
  expect(failed).toBe(1);
  expect(output.split('\n')[0]).toBe(colors.red('P'));
});

it('should not retry expected failure', async ({ runTest }) => {
  const { exitCode, passed, failed, output } = await runTest('expected-failure.js', { retries: 2 });
  expect(exitCode).toBe(0);
  expect(passed).toBe(2);
  expect(failed).toBe(0);
  expect(output.split('\n')[0]).toBe(colors.green('f') + colors.green('·'));
});

it('should retry unhandled rejection', async ({ runTest }) => {
  const result = await runTest('unhandled-rejection.js', { retries: 2 });
  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(0);
  expect(result.failed).toBe(1);
  expect(result.output.split('\n')[0]).toBe(colors.red('F').repeat(3));
  expect(result.output).toContain('Unhandled rejection');
});
