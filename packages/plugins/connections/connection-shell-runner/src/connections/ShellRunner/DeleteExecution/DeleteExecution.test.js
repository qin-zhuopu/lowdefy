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
import CancelExecution from '../CancelExecution/CancelExecution.js';
import DeleteExecution from './DeleteExecution.js';

let connection;

beforeEach(() => {
  connection = {
    dbPath: path.resolve(os.tmpdir(), `lowdefy-shell-delexec-${crypto.randomUUID()}.sqlite`),
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

test('DeleteExecution refuses while running and succeeds after finish', async () => {
  const job = await CreateJob({ request: { name: 'Long', command: 'sleep 30' }, connection });
  const { executionId } = await TriggerJob({ request: { jobId: job.id }, connection });
  await waitForStatus({ executionId, statuses: ['running'] });

  await expect(DeleteExecution({ request: { executionId }, connection })).rejects.toThrow(
    'Cannot delete a running execution; cancel it first.'
  );

  await CancelExecution({ request: { executionId }, connection });
  await waitForStatus({ executionId, statuses: ['cancelled'] });

  const res = await DeleteExecution({ request: { executionId }, connection });
  expect(res).toEqual({ id: executionId, deleted: true });
  await expect(GetExecution({ request: { executionId }, connection })).rejects.toThrow(
    'not found.'
  );
});

test('DeleteExecution throws for unknown execution', async () => {
  await expect(DeleteExecution({ request: { executionId: 'nope' }, connection })).rejects.toThrow(
    'Execution "nope" not found.'
  );
});

test('executionId missing', async () => {
  const schema = DeleteExecution.schema;
  expect(() => validate({ schema, data: {} })).toThrow(
    'DeleteExecution request should have required property "executionId".'
  );
});

test('checkWrite should be true', async () => {
  expect(DeleteExecution.meta.checkWrite).toBe(true);
});
