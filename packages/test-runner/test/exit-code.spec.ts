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

import path from 'path';
import { fixtures } from './fixtures';
const { it, expect } = fixtures;

it('should collect stdio', async ({ runTest }) => {
  const { exitCode, report } = await runTest('stdio.js');
  expect(exitCode).toBe(0);
  const testResult = report.suites[0].tests[0].results[0];
  const { stdout, stderr } = testResult;
  expect(stdout).toEqual([{ text: 'stdout text' }, { buffer: Buffer.from('stdout buffer').toString('base64') }]);
  expect(stderr).toEqual([{ text: 'stderr text' }, { buffer: Buffer.from('stderr buffer').toString('base64') }]);
});

it('should work with not defined errors', async ({runTest}) => {
  const result = await runTest('is-not-defined-error.ts');
  const { fileErrors } = result.report;
  expect(fileErrors.length).toBe(1);
  expect(fileErrors[0].file).toContain('assets' + path.sep + 'is-not-defined-error.ts');
  expect(fileErrors[0].error.message).toContain('foo is not defined');
  expect(result.exitCode).toBe(1);
});

it('should work with typescript', async ({ runTest }) => {
  const result = await runTest('typescript.ts');
  expect(result.exitCode).toBe(0);
});

it('should repeat each', async ({ runTest }) => {
  const { exitCode, report } = await runTest('one-success.js', { 'repeat-each': 3 });
  expect(exitCode).toBe(0);
  expect(report.suites.length).toBe(3);
  for (const suite of report.suites)
    expect(suite.tests.length).toBe(1);
});

it('should allow flaky', async ({ runTest }) => {
  const result = await runTest('allow-flaky.js', { retries: 1 });
  expect(result.exitCode).toBe(0);
  expect(result.expectedFlaky).toBe(1);
  expect(result.unexpectedFlaky).toBe(0);
});

it('should fail on unexpected pass', async ({ runTest }) => {
  const { exitCode, failed, output } = await runTest('unexpected-pass.js');
  expect(exitCode).toBe(1);
  expect(failed).toBe(1);
  expect(output).toContain('passed unexpectedly');
});

it('should respect global timeout', async ({ runTest }) => {
  const { exitCode, output } = await runTest('one-timeout.js', { 'timeout': 100000, 'global-timeout': 500 });
  expect(exitCode).toBe(1);
  expect(output).toContain('Timed out waiting 0.5s for the entire test run');
});

it('should exit with code 1 if the specified folder/file does not exist', async ({runTest}) => {
  const result = await runTest('111111111111.js');
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain(`${path.join(__dirname, 'assets', '111111111111.js')} does not exist`);
});
