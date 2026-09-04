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
import schema from './schema.js';

async function ListExecutions({ request, connection }) {
  const { jobId } = request;
  if (type.isNone(jobId) || `${jobId}`.trim() === '') {
    throw new Error('ListExecutions request property "jobId" should be a non-empty string.');
  }
  const db = getDb({ connection });
  const executions = db
    .prepare(
      `SELECT id, job_id, status, exit_code, queued_at, started_at, finished_at
      FROM executions
      WHERE job_id = ?
      ORDER BY queued_at DESC, id DESC`
    )
    .all(jobId);
  return executions;
}

ListExecutions.schema = schema;
ListExecutions.meta = {
  checkRead: true,
  checkWrite: false,
};

export default ListExecutions;
