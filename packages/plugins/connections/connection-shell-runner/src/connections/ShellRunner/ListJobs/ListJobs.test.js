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

import CreateJob from '../CreateJob/CreateJob.js';
import ListJobs from './ListJobs.js';

let connection;

beforeEach(() => {
  connection = {
    dbPath: path.resolve(os.tmpdir(), `lowdefy-shell-listjobs-${crypto.randomUUID()}.sqlite`),
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

test('ListJobs returns empty array when no jobs', async () => {
  const jobs = await ListJobs({ request: {}, connection });
  expect(jobs).toEqual([]);
});

test('ListJobs returns jobs newest first with latest_status null before any run', async () => {
  const a = await CreateJob({ request: { name: 'A', command: 'echo a' }, connection });
  await new Promise((r) => setTimeout(r, 5));
  const b = await CreateJob({ request: { name: 'B', command: 'echo b' }, connection });
  const jobs = await ListJobs({ request: {}, connection });
  expect(jobs.map((j) => j.id)).toEqual([b.id, a.id]);
  expect(jobs[0].latest_status).toBeNull();
});

test('checkRead should be true', async () => {
  expect(ListJobs.meta.checkRead).toBe(true);
});
