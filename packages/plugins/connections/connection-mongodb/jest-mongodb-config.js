// @shelf/jest-mongodb loads this file with require(), which on Node >=22 returns the
// module namespace for ESM files, so options must be a named export (not default).
// A single-node replica set is used instead of a standalone server because the
// consecutive id requests use transactions, which require a replica set. The
// instance block is still required — the preset reads instance.dbName even in
// replica set mode.
export const mongodbMemoryServerOptions = {
  instance: {
    dbName: 'test',
  },
  replSet: {
    count: 1,
    dbName: 'test',
    storageEngine: 'wiredTiger',
  },
  autoStart: false,
};
