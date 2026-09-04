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

import crypto from 'crypto';
import { type } from '@lowdefy/helpers';
import getDb from '../getDb.js';
import dispatchNext from '../dispatchNext.js';
import schema from './schema.js';

async function RerunExecution({ request, connection }) {
  const { executionId } = request;
  if (type.isNone(executionId) || `${executionId}`.trim() === '') {
    throw new Error('RerunExecution request property "executionId" should be a non-empty string.');
  }
  const db = getDb({ connection });
  const original = db.prepare(`SELECT job_id FROM executions WHERE id = ?`).get(executionId);
  if (!original) {
    throw new Error(`Execution "${executionId}" not found.`);
  }
  const jobId = original.job_id;
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO executions (id, job_id, status, queued_at) VALUES (?, ?, 'queued', ?)`
  ).run(id, jobId, Date.now());

  dispatchNext({ db, jobId });

  const execution = db.prepare(`SELECT id, status FROM executions WHERE id = ?`).get(id);
  return { executionId: execution.id, status: execution.status };
}

RerunExecution.schema = schema;
RerunExecution.meta = {
  checkRead: false,
  checkWrite: true,
};

export default RerunExecution;
