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

import { fixtures } from '../../';
import * as fs from 'fs';
import * as path from 'path';

const { it, registerFixture, expect } = fixtures.extend<{ test: { postProcess: string } }>();

registerFixture('postProcess', async ({}, runTest, info) => {
  await runTest('');
  const { result } = info;
  fs.writeFileSync(path.join(process.env.PW_OUTPUT_DIR, 'test-error-visible-in-fixture.txt'), JSON.stringify(result.error, undefined, 2));
});

it('ensure fixture handles test error', async ({ postProcess }) => {
  expect(true).toBe(false);
});
