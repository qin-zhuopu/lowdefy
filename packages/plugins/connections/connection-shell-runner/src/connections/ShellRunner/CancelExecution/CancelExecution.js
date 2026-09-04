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

import { type } from '@lowdefy/helpers';
import getDb from '../getDb.js';
import dispatchNext from '../dispatchNext.js';
import { runners } from '../runners.js';
import schema from './schema.js';

const KILL_GRACE_MS = 2000;

function appendLine({ db, executionId, line }) {
  const maxSeqRow = db
    .prepare(`SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM logs WHERE execution_id = ?`)
    .get(executionId);
  db.prepare(
    `INSERT INTO logs (execution_id, seq, stream, line, ts) VALUES (?, ?, 'stderr', ?, ?)`
  ).run(executionId, maxSeqRow.maxSeq + 1, line, Date.now());
}

async function CancelExecution({ request, connection }) {
  const { executionId } = request;
  if (type.isNone(executionId) || `${executionId}`.trim() === '') {
    throw new Error('CancelExecution request property "executionId" should be a non-empty string.');
  }
  const db = getDb({ connection });
  const execution = db
    .prepare(`SELECT id, job_id, status FROM executions WHERE id = ?`)
    .get(executionId);
  if (!execution) {
    throw new Error(`Execution "${executionId}" not found.`);
  }

  if (execution.status !== 'running' && execution.status !== 'queued') {
    return { id: executionId, status: execution.status };
  }

  // Mark cancelled first so the child's exit handler does not overwrite the
  // status with success/failed.
  db.prepare(
    `UPDATE executions SET status = 'cancelled', finished_at = ? WHERE id = ?`
  ).run(Date.now(), executionId);
  appendLine({ db, executionId, line: 'Execution cancelled by user.' });

  const child = runners.get(executionId);
  if (child) {
    child.kill('SIGTERM');
    const killTimer = setTimeout(() => {
      if (runners.has(executionId)) {
        const liveChild = runners.get(executionId);
        if (liveChild) {
          liveChild.kill('SIGKILL');
        }
      }
    }, KILL_GRACE_MS);
    // Do not keep the process alive just for the grace timer.
    if (typeof killTimer.unref === 'function') {
      killTimer.unref();
    }
  }

  // Start the next queued execution for this job.
  dispatchNext({ db, jobId: execution.job_id });

  return { id: executionId, status: 'cancelled' };
}

CancelExecution.schema = schema;
CancelExecution.meta = {
  checkRead: false,
  checkWrite: true,
};

export default CancelExecution;
