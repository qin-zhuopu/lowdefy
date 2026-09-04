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

import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { validate } from '@lowdefy/ajv';

import CreateJob from '../CreateJob/CreateJob.js';
import DeleteJob from './DeleteJob.js';
import ListJobs from '../ListJobs/ListJobs.js';

let connection;

beforeEach(() => {
  connection = {
    dbPath: path.resolve(os.tmpdir(), `lowdefy-shell-deletejob-${crypto.randomUUID()}.sqlite`),
  };
});

afterEach(() => {
  try {
    fs.rmSync(connection.dbPath, { force: true });
    fs.rmSync(`${connection.dbPath}-wal`, { force: true });
    fs.rmSync(`${connection.dbPath}-shm`, { force: true });
  } catch (error) {
    // ignore cleanup errors
  }
});

test('DeleteJob removes the job', async () => {
  const job = await CreateJob({ request: { name: 'A', command: 'echo a' }, connection });
  const res = await DeleteJob({ request: { jobId: job.id }, connection });
  expect(res).toEqual({ id: job.id, deleted: true });
  const jobs = await ListJobs({ request: {}, connection });
  expect(jobs).toEqual([]);
});

test('DeleteJob returns deleted false for unknown job', async () => {
  const res = await DeleteJob({ request: { jobId: 'nope' }, connection });
  expect(res).toEqual({ id: 'nope', deleted: false });
});

test('jobId missing', async () => {
  const schema = DeleteJob.schema;
  expect(() => validate({ schema, data: {} })).toThrow(
    'DeleteJob request should have required property "jobId".'
  );
});

test('checkWrite should be true', async () => {
  expect(DeleteJob.meta.checkWrite).toBe(true);
});
