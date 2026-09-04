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
import GetLogs from '../GetLogs/GetLogs.js';
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

async function waitForLogLine({ executionId, needle, timeoutMs = 8000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { lines } = await GetLogs({ request: { executionId, afterSeq: 0 }, connection });
    if (lines.some((row) => `${row.line}`.includes(needle))) {
      return;
    }
    await sleep(25);
  }
  throw new Error(`Timed out waiting for log line containing "${needle}"`);
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

test('cancelling a running execution does not start a queued sibling until the cancelled child is fully gone', async () => {
  // A command that ignores SIGTERM so the child survives past the cancel call
  // until the SIGKILL grace elapses. This maximises the window in which an
  // incorrect inline dispatch would start the sibling early.
  // A command that installs an ignore-TERM trap and then loops, re-arming the
  // trap on every tick. This reliably survives SIGTERM (unlike a bare
  // `trap "" TERM; sleep 30`, where a TERM arriving in the tiny window before
  // the trap is installed can still kill it), so the cancelled child stays
  // alive for the full SIGKILL grace and we can prove the sibling is not
  // dispatched early.
  // Install an ignore-TERM trap, then print a READY marker, then loop. We wait
  // for the READY marker in the logs before cancelling, which guarantees the
  // trap is already installed (avoiding the race where a SIGTERM arriving
  // before bash sets the trap could still kill the child). This makes the
  // child reliably survive SIGTERM for the full SIGKILL grace, so we can prove
  // the queued sibling is not dispatched early.
  const job = await CreateJob({
    request: {
      name: 'Trap',
      command: 'trap "" TERM; echo READY; while true; do sleep 5; done',
    },
    connection,
  });
  const first = await TriggerJob({ request: { jobId: job.id }, connection });
  const second = await TriggerJob({ request: { jobId: job.id }, connection });
  await waitForStatus({ executionId: first.executionId, statuses: ['running'] });
  // Wait until the trap is installed (READY printed) before cancelling.
  await waitForLogLine({ executionId: first.executionId, needle: 'READY' });

  // The sibling must be queued while the first runs (strict serial).
  const queuedBefore = await GetExecution({
    request: { executionId: second.executionId },
    connection,
  });
  expect(queuedBefore.status).toBe('queued');

  // The cancelled child's real process is still alive here (it traps TERM and
  // only dies on SIGKILL after KILL_GRACE_MS). Record when we requested cancel.
  const cancelledAt = Date.now();
  await CancelExecution({ request: { executionId: first.executionId }, connection });

  // The sibling's REAL bash process must not start while the cancelled child is
  // still alive. Because dispatch is deferred to the cancelled child's exit
  // handler (not inline in CancelExecution), the sibling stays 'queued' until
  // the child is actually reaped (~KILL_GRACE_MS). Poll tightly during the
  // grace window and assert:
  //  - there are never two 'running' rows for the job at any instant, and
  //  - the sibling does not leave 'queued' before the child has been reaped.
  let siblingStartedEarly = false;
  const graceDeadline = cancelledAt + 1500; // comfortably inside KILL_GRACE_MS (2000)
  while (Date.now() < graceDeadline) {
    const firstExec = await GetExecution({ request: { executionId: first.executionId }, connection });
    const secondExec = await GetExecution({
      request: { executionId: second.executionId },
      connection,
    });
    const runningCount = [firstExec.status, secondExec.status].filter(
      (status) => status === 'running'
    ).length;
    // Never two running rows for the same job at any instant.
    expect(runningCount).toBeLessThanOrEqual(1);
    // The sibling must still be queued while the cancelled child is alive: it
    // must not have been dispatched (given a started_at) yet.
    if (secondExec.status !== 'queued' || secondExec.started_at !== null) {
      siblingStartedEarly = true;
      break;
    }
    await sleep(25);
  }
  expect(siblingStartedEarly).toBe(false);

  // After the kill grace (2s) the cancelled child is reaped and its exit
  // handler dispatches the sibling, which then runs.
  const sibling = await waitForStatus({
    executionId: second.executionId,
    statuses: ['running', 'success', 'failed'],
    timeoutMs: 8000,
  });
  expect(['running', 'success', 'failed']).toContain(sibling.status);

  // The cancelled execution stays cancelled.
  const cancelled = await GetExecution({ request: { executionId: first.executionId }, connection });
  expect(cancelled.status).toBe('cancelled');

  // Clean up the sibling so its sleep does not linger.
  await CancelExecution({ request: { executionId: second.executionId }, connection });
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
