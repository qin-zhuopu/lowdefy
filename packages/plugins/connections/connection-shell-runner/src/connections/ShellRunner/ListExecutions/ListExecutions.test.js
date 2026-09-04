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
import ListExecutions from './ListExecutions.js';

let connection;

beforeEach(() => {
  connection = {
    dbPath: path.resolve(os.tmpdir(), `lowdefy-shell-listexec-${crypto.randomUUID()}.sqlite`),
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('ListExecutions returns executions newest first for a job', async () => {
  const job = await CreateJob({ request: { name: 'A', command: 'echo a' }, connection });
  const first = await TriggerJob({ request: { jobId: job.id }, connection });
  await sleep(5);
  const second = await TriggerJob({ request: { jobId: job.id }, connection });

  const executions = await ListExecutions({ request: { jobId: job.id }, connection });
  expect(executions).toHaveLength(2);
  expect(executions[0].id).toBe(second.executionId);
  expect(executions[1].id).toBe(first.executionId);
});

test('jobId missing', async () => {
  const schema = ListExecutions.schema;
  expect(() => validate({ schema, data: {} })).toThrow(
    'ListExecutions request should have required property "jobId".'
  );
});

test('checkRead should be true', async () => {
  expect(ListExecutions.meta.checkRead).toBe(true);
});
