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

import { spawn } from 'child_process';
import dispatchNext from './dispatchNext.js';

// Module-level map of live child processes in THIS process, keyed by execution
// id. The authoritative running state lives in the DB; this map only exists so
// CancelExecution can kill a running child.
export const runners = new Map();

function makeLineWriter({ db, executionId, stream, seqRef }) {
  let buffer = '';
  const insert = db.prepare(
    `INSERT INTO logs (execution_id, seq, stream, line, ts) VALUES (?, ?, ?, ?, ?)`
  );
  const writeLine = (line) => {
    seqRef.value += 1;
    insert.run(executionId, seqRef.value, stream, line, Date.now());
  };
  const onData = (chunk) => {
    buffer += chunk.toString();
    let index = buffer.indexOf('\n');
    while (index !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      writeLine(line);
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf('\n');
    }
  };
  const flush = () => {
    if (buffer.length > 0) {
      writeLine(buffer.replace(/\r$/, ''));
      buffer = '';
    }
  };
  return { onData, flush };
}

// Starts a real bash process for an execution that has already been marked
// 'running' in the DB. Detached from the request lifecycle: the child exit is
// handled asynchronously and the next queued execution for the job is
// dispatched on exit.
function startExecution({ db, execution, job }) {
  const now = Date.now();
  db.prepare(`UPDATE executions SET status = 'running', started_at = ? WHERE id = ?`).run(
    now,
    execution.id
  );

  const maxSeqRow = db
    .prepare(`SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM logs WHERE execution_id = ?`)
    .get(execution.id);
  const seqRef = { value: maxSeqRow.maxSeq };

  let child;
  try {
    child = spawn('bash', ['-c', job.command], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    finalizeError({ db, executionId: execution.id, jobId: job.id, seqRef, message: error.message });
    return;
  }

  runners.set(execution.id, child);

  const stdoutWriter = makeLineWriter({ db, executionId: execution.id, stream: 'stdout', seqRef });
  const stderrWriter = makeLineWriter({ db, executionId: execution.id, stream: 'stderr', seqRef });
  child.stdout.on('data', stdoutWriter.onData);
  child.stderr.on('data', stderrWriter.onData);

  child.on('error', (error) => {
    runners.delete(execution.id);
    finalizeError({ db, executionId: execution.id, jobId: job.id, seqRef, message: error.message });
  });

  child.on('exit', (code) => {
    stdoutWriter.flush();
    stderrWriter.flush();
    runners.delete(execution.id);
    const current = db
      .prepare(`SELECT status FROM executions WHERE id = ?`)
      .get(execution.id);
    // A cancelled execution keeps its 'cancelled' status set by CancelExecution.
    if (current && current.status !== 'cancelled') {
      db.prepare(
        `UPDATE executions SET status = ?, exit_code = ?, finished_at = ? WHERE id = ?`
      ).run(code === 0 ? 'success' : 'failed', code, Date.now(), execution.id);
    }
    dispatchNext({ db, jobId: job.id });
  });
}

function finalizeError({ db, executionId, jobId, seqRef, message }) {
  seqRef.value += 1;
  db.prepare(
    `INSERT INTO logs (execution_id, seq, stream, line, ts) VALUES (?, ?, 'stderr', ?, ?)`
  ).run(executionId, seqRef.value, message, Date.now());
  db.prepare(
    `UPDATE executions SET status = 'failed', finished_at = ? WHERE id = ?`
  ).run(Date.now(), executionId);
  dispatchNext({ db, jobId });
}

export default startExecution;
