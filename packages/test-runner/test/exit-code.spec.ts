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

import '@playwright/test-runner';
import { spawnSync } from 'child_process';
import colors from 'colors/safe';
import * as fs from 'fs';
import * as path from 'path';
import rimraf from 'rimraf';
import { promisify } from 'util';

const removeFolderAsync = promisify(rimraf);

it('should fail', async () => {
  const result = await runTest('one-failure.js');
  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(0);
  expect(result.failed).toBe(1);
});

it('should timeout', async () => {
  const { exitCode, passed, failed, timedOut } = await runTest('one-timeout.js', { timeout: 100 });
  expect(exitCode).toBe(1);
  expect(passed).toBe(0);
  expect(failed).toBe(0);
  expect(timedOut).toBe(1);
});

it('should succeed', async () => {
  const result = await runTest('one-success.js');
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.failed).toBe(0);
});

it('should access error in fixture', async () => {
  const result = await runTest('test-error-visible-in-fixture.js');
  expect(result.exitCode).toBe(1);
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-results', 'test-error-visible-in-fixture.txt')).toString());
  expect(data.message).toContain('Object.is equality');
});

it('should access data in fixture', async () => {
  const { exitCode, report } = await runTest('test-data-visible-in-fixture.js');
  expect(exitCode).toBe(1);
  const testResult = report.suites[0].tests[0].results[0];
  expect(testResult.data).toEqual({ 'myname': 'myvalue' });
  expect(testResult.stdout).toEqual([{ text: 'console.log\n' }]);
  expect(testResult.stderr).toEqual([{ text: 'console.error\n' }]);
});

it('should handle fixture timeout', async () => {
  const { exitCode, output, failed, timedOut } = await runTest('fixture-timeout.js', { timeout: 500 });
  expect(exitCode).toBe(1);
  expect(output).toContain('Timeout of 500ms');
  expect(failed).toBe(1);
  expect(timedOut).toBe(1);
});

it('should handle worker fixture timeout', async () => {
  const result = await runTest('worker-fixture-timeout.js', { timeout: 500 });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('Timeout of 500ms');
});

it('should handle worker fixture error', async () => {
  const result = await runTest('worker-fixture-error.js');
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('Worker failed');
});

it('should collect stdio', async () => {
  const { exitCode, report } = await runTest('stdio.js');
  expect(exitCode).toBe(0);
  const testResult = report.suites[0].tests[0].results[0];
  const { stdout, stderr } = testResult;
  expect(stdout).toEqual([{ text: 'stdout text' }, { buffer: Buffer.from('stdout buffer').toString('base64') }]);
  expect(stderr).toEqual([{ text: 'stderr text' }, { buffer: Buffer.from('stderr buffer').toString('base64') }]);
});

it('should work with typescript', async () => {
  const result = await runTest('typescript.ts');
  expect(result.exitCode).toBe(0);
});

it('should retry failures', async () => {
  const result = await runTest('retry-failures.js', { retries: 1 });
  expect(result.exitCode).toBe(1);
  expect(result.expectedFlaky).toBe(0);
  expect(result.unexpectedFlaky).toBe(1);
});

it('should retry timeout', async () => {
  const { exitCode, passed, failed, timedOut, output } = await runTest('one-timeout.js', { timeout: 100, retries: 2 });
  expect(exitCode).toBe(1);
  expect(passed).toBe(0);
  expect(failed).toBe(0);
  expect(timedOut).toBe(1);
  expect(output.split('\n')[0]).toBe(colors.red('T').repeat(3));
});

it('should repeat each', async () => {
  const { exitCode, report } = await runTest('one-success.js', { 'repeat-each': 3 });
  expect(exitCode).toBe(0);
  expect(report.suites.length).toBe(3);
  for (const suite of report.suites)
    expect(suite.tests.length).toBe(1);
});

it('should report suite errors', async () => {
  const { exitCode, failed, output } = await runTest('suite-error.js');
  expect(exitCode).toBe(1);
  expect(failed).toBe(1);
  expect(output).toContain('Suite error');
});

it('should allow flaky', async () => {
  const result = await runTest('allow-flaky.js', { retries: 1 });
  expect(result.exitCode).toBe(0);
  expect(result.expectedFlaky).toBe(1);
  expect(result.unexpectedFlaky).toBe(0);
});

it('should fail on unexpected pass', async () => {
  const { exitCode, failed, output } = await runTest('unexpected-pass.js');
  expect(exitCode).toBe(1);
  expect(failed).toBe(1);
  expect(output).toContain('passed unexpectedly');
});

it('should fail on unexpected pass with retries', async () => {
  const { exitCode, failed, output } = await runTest('unexpected-pass.js', { retries: 1 });
  expect(exitCode).toBe(1);
  expect(failed).toBe(1);
  expect(output).toContain('passed unexpectedly');
});

it('should not retry unexpected pass', async () => {
  const { exitCode, passed, failed, output } = await runTest('unexpected-pass.js', { retries: 2 });
  expect(exitCode).toBe(1);
  expect(passed).toBe(0);
  expect(failed).toBe(1);
  expect(output.split('\n')[0]).toBe(colors.red('P'));
});

it('should not retry expected failure', async () => {
  const { exitCode, passed, failed, output } = await runTest('expected-failure.js', { retries: 2 });
  expect(exitCode).toBe(0);
  expect(passed).toBe(2);
  expect(failed).toBe(0);
  expect(output.split('\n')[0]).toBe(colors.green('f') + colors.green('·'));
});

it('should respect nested skip', async () => {
  const { exitCode, passed, failed, skipped } = await runTest('nested-skip.js');
  expect(exitCode).toBe(0);
  expect(passed).toBe(0);
  expect(failed).toBe(0);
  expect(skipped).toBe(1);
});

it('should retry unhandled rejection', async () => {
  const result = await runTest('unhandled-rejection.js', { retries: 2 });
  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(0);
  expect(result.failed).toBe(1);
  expect(result.output.split('\n')[0]).toBe(colors.red('F').repeat(3));
  expect(result.output).toContain('Unhandled rejection');
});

it('should respect global timeout', async () => {
  const { exitCode, output } = await runTest('one-timeout.js', { 'timeout': 100000, 'global-timeout': 500 });
  expect(exitCode).toBe(1);
  expect(output).toContain('Timed out waiting 0.5s for the entire test run');
});

it('should respect slow test', async () => {
  const { exitCode, output } = await runTest('slow.js', { timeout: 1 });
  expect(output).toContain('Timeout of 3ms exceeded');
  expect(exitCode).toBe(1);
});

async function runTest(filePath: string, params: any = {}) {
  const outputDir = path.join(__dirname, 'test-results');
  const reportFile = path.join(outputDir, 'results.json');
  await removeFolderAsync(outputDir).catch(e => {});

  const { output, status } = spawnSync('node', [
    path.join(__dirname, '..', 'cli.js'),
    path.join(__dirname, 'assets', filePath),
    '--output=' + outputDir,
    '--reporter=dot,json',
    ...Object.keys(params).map(key => `--${key}=${params[key]}`)
  ], {
    env: {
      ...process.env,
      PWRUNNER_JSON_REPORT: reportFile,
    }
  });
  const passed = (/(\d+) passed/.exec(output.toString()) || [])[1];
  const failed = (/(\d+) failed/.exec(output.toString()) || [])[1];
  const timedOut = (/(\d+) timed out/.exec(output.toString()) || [])[1];
  const expectedFlaky = (/(\d+) expected flaky/.exec(output.toString()) || [])[1];
  const unexpectedFlaky = (/(\d+) unexpected flaky/.exec(output.toString()) || [])[1];
  const skipped = (/(\d+) skipped/.exec(output.toString()) || [])[1];
  const report = JSON.parse(fs.readFileSync(reportFile).toString());
  let outputStr = output.toString();
  outputStr = outputStr.substring(1, outputStr.length - 1);
  return {
    exitCode: status,
    output: outputStr,
    passed: parseInt(passed, 10),
    failed: parseInt(failed || '0', 10),
    timedOut: parseInt(timedOut || '0', 10),
    expectedFlaky: parseInt(expectedFlaky || '0', 10),
    unexpectedFlaky: parseInt(unexpectedFlaky || '0', 10),
    skipped: parseInt(skipped || '0', 10),
    report
  };
}
