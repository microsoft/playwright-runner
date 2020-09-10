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

import { fixtures } from './fixtures';
const { it, expect } = fixtures;

it('should allow custom parameters', async ({ runTest }) => {
  const result = await runTest('register-parameter.js', {
    'param1': 'value1',
  });
  expect(result.exitCode).toBe(0);
});

it('should fail on unknown parameters', async ({ runTest }) => {
  const result = await runTest('register-parameter.js', {
    'param1': 'value1',
    'param3': 'value3'
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('unknown option');
  expect(result.output).toContain('param3');
});
