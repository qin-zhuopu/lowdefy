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
import schema from './schema.js';

async function CreateJob({ request, connection }) {
  const { name, command } = request;
  if (type.isNone(name) || `${name}`.trim() === '') {
    throw new Error('CreateJob request property "name" should be a non-empty string.');
  }
  if (type.isNone(command) || `${command}`.trim() === '') {
    throw new Error('CreateJob request property "command" should be a non-empty string.');
  }
  const db = getDb({ connection });
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  db.prepare(`INSERT INTO jobs (id, name, command, created_at) VALUES (?, ?, ?, ?)`).run(
    id,
    name,
    command,
    createdAt
  );
  return { id, name, command, created_at: createdAt };
}

CreateJob.schema = schema;
CreateJob.meta = {
  checkRead: false,
  checkWrite: true,
};

export default CreateJob;
