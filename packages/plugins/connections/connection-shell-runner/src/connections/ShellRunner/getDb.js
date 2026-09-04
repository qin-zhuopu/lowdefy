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
import Database from 'better-sqlite3';
import { type } from '@lowdefy/helpers';

// Module singleton handles keyed by resolved absolute db path so the same
// process always reuses one better-sqlite3 handle per database file.
const databases = new Map();

function resolveDbPath({ connection }) {
  if (!type.isNone(connection?.dbPath)) {
    return path.resolve(connection.dbPath);
  }
  if (!type.isNone(process.env.LOWDEFY_JENKINS_DB)) {
    return path.resolve(process.env.LOWDEFY_JENKINS_DB);
  }
  return path.resolve(
    process.env.LOWDEFY_JENKINS_DATA_DIR || os.tmpdir(),
    'lowdefy-jenkins.sqlite'
  );
}

function initializeSchema(db) {
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      status TEXT NOT NULL,
      exit_code INTEGER,
      queued_at INTEGER,
      started_at INTEGER,
      finished_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      execution_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      stream TEXT NOT NULL,
      line TEXT NOT NULL,
      ts INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_executions_job_status ON executions (job_id, status);
    CREATE INDEX IF NOT EXISTS idx_logs_execution_seq ON logs (execution_id, seq);
  `);
}

function reconcileOrphans(db) {
  // Any execution still 'running' in a fresh process has no live child, so it
  // was interrupted by a server restart. Mark it failed and record a log line.
  const now = Date.now();
  const orphans = db.prepare(`SELECT id FROM executions WHERE status = 'running'`).all();
  const reconcile = db.transaction(() => {
    for (const orphan of orphans) {
      const maxSeqRow = db
        .prepare(`SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM logs WHERE execution_id = ?`)
        .get(orphan.id);
      db.prepare(
        `INSERT INTO logs (execution_id, seq, stream, line, ts) VALUES (?, ?, 'stderr', ?, ?)`
      ).run(orphan.id, maxSeqRow.maxSeq + 1, 'Execution interrupted by server restart.', now);
      db.prepare(
        `UPDATE executions SET status = 'failed', finished_at = ? WHERE id = ?`
      ).run(now, orphan.id);
    }
  });
  reconcile();
}

function getDb({ connection }) {
  const dbPath = resolveDbPath({ connection });
  if (databases.has(dbPath)) {
    return databases.get(dbPath);
  }
  const db = new Database(dbPath);
  initializeSchema(db);
  reconcileOrphans(db);
  databases.set(dbPath, db);
  return db;
}

export default getDb;
