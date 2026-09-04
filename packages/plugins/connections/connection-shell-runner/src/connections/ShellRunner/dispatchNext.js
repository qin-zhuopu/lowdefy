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

import startExecution from './runners.js';

// Atomically starts the next queued execution for a job, but only if no
// execution for that job is currently running. This DB-state guard (inside a
// transaction) guarantees strict per-job serial ordering: a job never has two
// executions running at once. Different jobs run concurrently because the guard
// is scoped by job_id.
function dispatchNext({ db, jobId }) {
  const pick = db.transaction(() => {
    const running = db
      .prepare(`SELECT id FROM executions WHERE job_id = ? AND status = 'running' LIMIT 1`)
      .get(jobId);
    if (running) {
      return null;
    }
    const next = db
      .prepare(
        `SELECT id FROM executions WHERE job_id = ? AND status = 'queued' ORDER BY queued_at ASC, id ASC LIMIT 1`
      )
      .get(jobId);
    if (!next) {
      return null;
    }
    // Claim the execution inside the transaction so a concurrent dispatchNext
    // cannot select the same queued row.
    db.prepare(`UPDATE executions SET status = 'running' WHERE id = ?`).run(next.id);
    return next.id;
  });

  const executionId = pick();
  if (!executionId) {
    return;
  }

  const execution = db.prepare(`SELECT * FROM executions WHERE id = ?`).get(executionId);
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId);
  startExecution({ db, execution, job });
}

export default dispatchNext;
