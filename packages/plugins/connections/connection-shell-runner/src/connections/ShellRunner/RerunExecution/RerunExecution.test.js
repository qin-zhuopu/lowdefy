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
import GetExecution from '../GetExecution/GetExecution.js';
import ListExecutions from '../ListExecutions/ListExecutions.js';
import RerunExecution from './RerunExecution.js';

let connection;

beforeEach(() => {
  connection = {
    dbPath: path.resolve(os.tmpdir(), `lowdefy-shell-rerun-${crypto.randomUUID()}.sqlite`),
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

async function waitForStatus({ executionId, statuses, timeoutMs = 8000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const execution = await GetExecution({ request: { executionId }, connection });
    if (statuses.includes(execution.status)) {
      return execution;
    }
    await sleep(25);
  }
  throw new Error(`Timed out waiting for statuses ${statuses.join(',')}`);
}

test('RerunExecution enqueues a new execution for the same job', async () => {
  const job = await CreateJob({ request: { name: 'A', command: 'echo a' }, connection });
  const first = await TriggerJob({ request: { jobId: job.id }, connection });
  await waitForStatus({ executionId: first.executionId, statuses: ['success', 'failed'] });

  const rerun = await RerunExecution({
    request: { executionId: first.executionId },
    connection,
  });
  expect(rerun.executionId).not.toBe(first.executionId);
  await waitForStatus({ executionId: rerun.executionId, statuses: ['success', 'failed'] });

  const executions = await ListExecutions({ request: { jobId: job.id }, connection });
  expect(executions).toHaveLength(2);
});

test('RerunExecution throws for unknown execution', async () => {
  await expect(RerunExecution({ request: { executionId: 'nope' }, connection })).rejects.toThrow(
    'Execution "nope" not found.'
  );
});

test('executionId missing', async () => {
  const schema = RerunExecution.schema;
  expect(() => validate({ schema, data: {} })).toThrow(
    'RerunExecution request should have required property "executionId".'
  );
});

test('checkWrite should be true', async () => {
  expect(RerunExecution.meta.checkWrite).toBe(true);
});
