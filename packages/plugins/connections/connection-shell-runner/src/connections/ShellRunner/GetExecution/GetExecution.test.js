/*
  Copyright 2020-2026 Lowdefy, Inc

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { validate } from '@lowdefy/ajv';

import CreateJob from '../CreateJob/CreateJob.js';
import TriggerJob from '../TriggerJob/TriggerJob.js';
import GetExecution from './GetExecution.js';

let connection;

beforeEach(() => {
  connection = {
    dbPath: path.resolve(os.tmpdir(), `lowdefy-shell-getexec-${crypto.randomUUID()}.sqlite`),
  };
});

afterEach(() => {
  try {
    fs.rmSync(connection.dbPath, { force: true });
    fs.rmSync(`${connection.dbPath}-wal`, { force: true });
    fs.rmSync(`${connection.dbPath}-shm`, { force: true });
  } catch (error) {
    // ignore cleanup errors
  }
});

test('GetExecution returns the execution row', async () => {
  const job = await CreateJob({ request: { name: 'A', command: 'echo a' }, connection });
  const { executionId } = await TriggerJob({ request: { jobId: job.id }, connection });
  const execution = await GetExecution({ request: { executionId }, connection });
  expect(execution.id).toBe(executionId);
  expect(execution.job_id).toBe(job.id);
  expect(typeof execution.status).toBe('string');
});

test('GetExecution throws for unknown execution', async () => {
  await expect(GetExecution({ request: { executionId: 'nope' }, connection })).rejects.toThrow(
    'Execution "nope" not found.'
  );
});

test('executionId missing', async () => {
  const schema = GetExecution.schema;
  expect(() => validate({ schema, data: {} })).toThrow(
    'GetExecution request should have required property "executionId".'
  );
});

test('checkRead should be true', async () => {
  expect(GetExecution.meta.checkRead).toBe(true);
});
