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

import getDb from '../getDb.js';
import schema from './schema.js';

async function ListJobs({ request, connection }) {
  const db = getDb({ connection });
  const jobs = db
    .prepare(
      `SELECT
        j.id,
        j.name,
        j.command,
        j.created_at,
        (
          SELECT e.status
          FROM executions e
          WHERE e.job_id = j.id
          ORDER BY e.queued_at DESC, e.id DESC
          LIMIT 1
        ) AS latest_status
      FROM jobs j
      ORDER BY j.created_at DESC, j.id DESC`
    )
    .all();
  return jobs;
}

ListJobs.schema = schema;
ListJobs.meta = {
  checkRead: true,
  checkWrite: false,
};

export default ListJobs;
