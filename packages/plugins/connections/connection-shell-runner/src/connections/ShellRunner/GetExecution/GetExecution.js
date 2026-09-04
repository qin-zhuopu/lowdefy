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

async function GetExecution({ request, connection }) {
  const { executionId } = request;
  if (type.isNone(executionId) || `${executionId}`.trim() === '') {
    throw new Error('GetExecution request property "executionId" should be a non-empty string.');
  }
  const db = getDb({ connection });
  const execution = db
    .prepare(
      `SELECT id, job_id, status, exit_code, queued_at, started_at, finished_at
      FROM executions
      WHERE id = ?`
    )
    .get(executionId);
  if (!execution) {
    throw new Error(`Execution "${executionId}" not found.`);
  }
  return execution;
}

GetExecution.schema = schema;
GetExecution.meta = {
  checkRead: true,
  checkWrite: false,
};

export default GetExecution;
