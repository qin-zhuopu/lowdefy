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

async function DeleteJob({ request, connection }) {
  const { jobId } = request;
  if (type.isNone(jobId) || `${jobId}`.trim() === '') {
    throw new Error('DeleteJob request property "jobId" should be a non-empty string.');
  }
  const db = getDb({ connection });
  const remove = db.transaction(() => {
    db.prepare(
      `DELETE FROM logs WHERE execution_id IN (SELECT id FROM executions WHERE job_id = ?)`
    ).run(jobId);
    db.prepare(`DELETE FROM executions WHERE job_id = ?`).run(jobId);
    const info = db.prepare(`DELETE FROM jobs WHERE id = ?`).run(jobId);
    return info.changes;
  });
  const deleted = remove();
  return { id: jobId, deleted: deleted > 0 };
}

DeleteJob.schema = schema;
DeleteJob.meta = {
  checkRead: false,
  checkWrite: true,
};

export default DeleteJob;
