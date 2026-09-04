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

// Incremental real-time log endpoint. The client polls this with the highest
// seq it has already received (afterSeq) and receives only newer lines plus the
// current execution status so it knows when to stop polling.
async function GetLogs({ request, connection }) {
  const { executionId } = request;
  if (type.isNone(executionId) || `${executionId}`.trim() === '') {
    throw new Error('GetLogs request property "executionId" should be a non-empty string.');
  }
  const afterSeq = type.isNone(request.afterSeq) ? 0 : request.afterSeq;
  const db = getDb({ connection });
  const execution = db
    .prepare(`SELECT status, exit_code FROM executions WHERE id = ?`)
    .get(executionId);
  if (!execution) {
    throw new Error(`Execution "${executionId}" not found.`);
  }
  const lines = db
    .prepare(
      `SELECT seq, stream, line, ts
      FROM logs
      WHERE execution_id = ? AND seq > ?
      ORDER BY seq ASC`
    )
    .all(executionId, afterSeq);
  return { status: execution.status, exitCode: execution.exit_code, lines };
}

GetLogs.schema = schema;
GetLogs.meta = {
  checkRead: true,
  checkWrite: false,
};

export default GetLogs;
