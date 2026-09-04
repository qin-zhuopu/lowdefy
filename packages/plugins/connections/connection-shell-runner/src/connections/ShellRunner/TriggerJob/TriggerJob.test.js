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
import TriggerJob from './TriggerJob.js';
import GetExecution from '../GetExecution/GetExecution.js';
import GetLogs from '../GetLogs/GetLogs.js';
import ListExecutions from '../ListExecutions/ListExecutions.js';

let connection;

beforeEach(() => {
  connection = {
    dbPath: path.resolve(os.tmpdir(), `lowdefy-shell-trigger-${crypto.randomUUID()}.sqlite`),
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
  const execution = await GetExecution({ request: { executionId }, connection });
  throw new Error(
    `Timed out waiting for statuses ${statuses.join(',')}. Last status: ${execution.status}`
  );
}

test('TriggerJob runs a real bash echo and reaches success with captured stdout', async () => {
  const job = await CreateJob({
    request: { name: 'Echo', command: 'echo hello' },
    connection,
  });
  const { executionId, status } = await TriggerJob({ request: { jobId: job.id }, connection });
  expect(['queued', 'running']).toContain(status);

  const finished = await waitForStatus({ executionId, statuses: ['success', 'failed'] });
  expect(finished.status).toBe('success');
  expect(finished.exit_code).toBe(0);

  const logs = await GetLogs({ request: { executionId }, connection });
  const combined = logs.lines.map((l) => l.line).join('\n');
  expect(combined).toContain('hello');
  expect(logs.lines.some((l) => l.stream === 'stdout')).toBe(true);
});

test('strict per-job serial: second execution stays queued while first runs, then runs', async () => {
  const job = await CreateJob({
    request: { name: 'Sleeper', command: 'sleep 0.5; echo done' },
    connection,
  });

  const first = await TriggerJob({ request: { jobId: job.id }, connection });
  const second = await TriggerJob({ request: { jobId: job.id }, connection });

  // Give the first a moment to actually be spawned/running.
  await waitForStatus({ executionId: first.executionId, statuses: ['running'] });

  const secondExec = await GetExecution({
    request: { executionId: second.executionId },
    connection,
  });
  expect(secondExec.status).toBe('queued');

  // Never two running at once for the same job.
  const executions = await ListExecutions({ request: { jobId: job.id }, connection });
  const runningCount = executions.filter((e) => e.status === 'running').length;
  expect(runningCount).toBe(1);

  // First finishes, then the second dispatches and completes.
  await waitForStatus({ executionId: first.executionId, statuses: ['success'] });
  const secondFinished = await waitForStatus({
    executionId: second.executionId,
    statuses: ['success', 'failed'],
  });
  expect(secondFinished.status).toBe('success');
});

test('different jobs run concurrently', async () => {
  const jobA = await CreateJob({ request: { name: 'A', command: 'sleep 0.5' }, connection });
  const jobB = await CreateJob({ request: { name: 'B', command: 'sleep 0.5' }, connection });

  const a = await TriggerJob({ request: { jobId: jobA.id }, connection });
  const b = await TriggerJob({ request: { jobId: jobB.id }, connection });

  await waitForStatus({ executionId: a.executionId, statuses: ['running'] });
  const bExec = await waitForStatus({ executionId: b.executionId, statuses: ['running'] });
  expect(bExec.status).toBe('running');
});

test('TriggerJob throws for unknown job', async () => {
  await expect(TriggerJob({ request: { jobId: 'nope' }, connection })).rejects.toThrow(
    'Job "nope" not found.'
  );
});

test('jobId missing', async () => {
  const schema = TriggerJob.schema;
  expect(() => validate({ schema, data: {} })).toThrow(
    'TriggerJob request should have required property "jobId".'
  );
});

test('checkWrite should be true', async () => {
  expect(TriggerJob.meta.checkWrite).toBe(true);
});
