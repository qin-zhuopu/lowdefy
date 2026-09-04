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
import GetLogs from './GetLogs.js';

let connection;

beforeEach(() => {
  connection = {
    dbPath: path.resolve(os.tmpdir(), `lowdefy-shell-getlogs-${crypto.randomUUID()}.sqlite`),
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

async function waitForFinish(executionId) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const logs = await GetLogs({ request: { executionId }, connection });
    if (['success', 'failed', 'cancelled'].includes(logs.status)) {
      return;
    }
    await sleep(25);
  }
  throw new Error('Timed out waiting for execution to finish');
}

test('GetLogs afterSeq returns only newer lines and reports status', async () => {
  const job = await CreateJob({
    request: { name: 'Multi', command: 'echo one; echo two; echo three' },
    connection,
  });
  const { executionId } = await TriggerJob({ request: { jobId: job.id }, connection });
  await waitForFinish(executionId);

  const all = await GetLogs({ request: { executionId }, connection });
  expect(all.status).toBe('success');
  expect(all.exitCode).toBe(0);
  expect(all.lines.length).toBeGreaterThanOrEqual(3);
  expect(all.lines.map((l) => l.line)).toEqual(
    expect.arrayContaining(['one', 'two', 'three'])
  );

  const firstSeq = all.lines[0].seq;
  const incremental = await GetLogs(
    { request: { executionId, afterSeq: firstSeq }, connection }
  );
  expect(incremental.lines.every((l) => l.seq > firstSeq)).toBe(true);
  expect(incremental.lines.length).toBe(all.lines.length - 1);

  const lastSeq = all.lines[all.lines.length - 1].seq;
  const none = await GetLogs({ request: { executionId, afterSeq: lastSeq }, connection });
  expect(none.lines).toEqual([]);
});

test('GetLogs throws for unknown execution', async () => {
  await expect(GetLogs({ request: { executionId: 'nope' }, connection })).rejects.toThrow(
    'Execution "nope" not found.'
  );
});

test('executionId missing', async () => {
  const schema = GetLogs.schema;
  expect(() => validate({ schema, data: {} })).toThrow(
    'GetLogs request should have required property "executionId".'
  );
});

test('checkRead should be true', async () => {
  expect(GetLogs.meta.checkRead).toBe(true);
});
