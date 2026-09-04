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
import CancelExecution from './CancelExecution.js';

let connection;

beforeEach(() => {
  connection = {
    dbPath: path.resolve(os.tmpdir(), `lowdefy-shell-cancel-${crypto.randomUUID()}.sqlite`),
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

test('CancelExecution kills a running sleep job and marks it cancelled', async () => {
  const job = await CreateJob({ request: { name: 'Long', command: 'sleep 30' }, connection });
  const { executionId } = await TriggerJob({ request: { jobId: job.id }, connection });
  await waitForStatus({ executionId, statuses: ['running'] });

  const res = await CancelExecution({ request: { executionId }, connection });
  expect(res).toEqual({ id: executionId, status: 'cancelled' });

  const execution = await GetExecution({ request: { executionId }, connection });
  expect(execution.status).toBe('cancelled');
  expect(execution.finished_at).not.toBeNull();

  // The status must remain cancelled after the killed child exits (not overwritten).
  await sleep(300);
  const after = await GetExecution({ request: { executionId }, connection });
  expect(after.status).toBe('cancelled');
});

test('CancelExecution on a queued execution prevents it from running', async () => {
  const job = await CreateJob({ request: { name: 'Serial', command: 'sleep 1' }, connection });
  const first = await TriggerJob({ request: { jobId: job.id }, connection });
  const second = await TriggerJob({ request: { jobId: job.id }, connection });
  await waitForStatus({ executionId: first.executionId, statuses: ['running'] });

  const queued = await GetExecution({ request: { executionId: second.executionId }, connection });
  expect(queued.status).toBe('queued');

  await CancelExecution({ request: { executionId: second.executionId }, connection });
  const cancelled = await GetExecution({
    request: { executionId: second.executionId },
    connection,
  });
  expect(cancelled.status).toBe('cancelled');

  // Cancel the first too so the sleep does not linger.
  await CancelExecution({ request: { executionId: first.executionId }, connection });
});

test('executionId missing', async () => {
  const schema = CancelExecution.schema;
  expect(() => validate({ schema, data: {} })).toThrow(
    'CancelExecution request should have required property "executionId".'
  );
});

test('checkWrite should be true', async () => {
  expect(CancelExecution.meta.checkWrite).toBe(true);
});
