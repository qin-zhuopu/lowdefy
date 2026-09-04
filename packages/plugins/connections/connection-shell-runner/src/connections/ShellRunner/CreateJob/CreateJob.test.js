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

import CreateJob from './CreateJob.js';
import ListJobs from '../ListJobs/ListJobs.js';

let connection;

beforeEach(() => {
  connection = {
    dbPath: path.resolve(os.tmpdir(), `lowdefy-shell-createjob-${crypto.randomUUID()}.sqlite`),
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

test('CreateJob inserts a job and ListJobs returns it', async () => {
  const job = await CreateJob({
    request: { name: 'Build', command: 'echo hi' },
    connection,
  });
  expect(job).toMatchObject({ name: 'Build', command: 'echo hi' });
  expect(typeof job.id).toBe('string');
  expect(job.id.length).toBeGreaterThan(0);

  const jobs = await ListJobs({ request: {}, connection });
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ id: job.id, name: 'Build', command: 'echo hi' });
});

test('CreateJob throws on missing name', async () => {
  await expect(CreateJob({ request: { command: 'echo hi' }, connection })).rejects.toThrow(
    'CreateJob request property "name" should be a non-empty string.'
  );
});

test('CreateJob throws on empty command', async () => {
  await expect(
    CreateJob({ request: { name: 'Build', command: '   ' }, connection })
  ).rejects.toThrow('CreateJob request property "command" should be a non-empty string.');
});

test('valid request', async () => {
  const schema = CreateJob.schema;
  expect(validate({ schema, data: { name: 'Build', command: 'echo hi' } })).toEqual({
    valid: true,
  });
});

test('name missing', async () => {
  const schema = CreateJob.schema;
  expect(() => validate({ schema, data: { command: 'echo hi' } })).toThrow(
    'CreateJob request should have required property "name".'
  );
});

test('checkWrite should be true', async () => {
  expect(CreateJob.meta.checkWrite).toBe(true);
});
