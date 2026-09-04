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

import { jest } from '@jest/globals';

const mockReadFileSync = jest.fn();
const mockExistsSync = jest.fn();
const mockResolve = jest.fn();

jest.unstable_mockModule('fs', () => ({
  default: {
    readFileSync: mockReadFileSync,
    existsSync: mockExistsSync,
  },
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
}));

jest.unstable_mockModule('node:module', () => ({
  createRequire: () => ({ resolve: mockResolve }),
}));

let writeServerExternalPackages;
beforeAll(async () => {
  const mod = await import('./writeServerExternalPackages.js');
  writeServerExternalPackages = mod.default;
});

const mockWriteBuildArtifact = jest.fn();

function makeContext() {
  return {
    directories: { server: '/tmp/server' },
    writeBuildArtifact: mockWriteBuildArtifact,
  };
}

// Configure mockResolve and mockReadFileSync so each fake plugin reports the
// given package.json contents.
function setupPlugins(plugins) {
  const filesByPath = new Map();
  for (const { pkg, pkgJson } of plugins) {
    const pkgRoot = `/fake/node_modules/${pkg}`;
    const typesPath = `${pkgRoot}/dist/types.js`;
    filesByPath.set(`${pkgRoot}/package.json`, JSON.stringify({ name: pkg, ...pkgJson }));
    mockResolve.mockImplementation((spec) => {
      const match = plugins.find((p) => spec === `${p.pkg}/types`);
      if (match) return `/fake/node_modules/${match.pkg}/dist/types.js`;
      throw new Error(`Cannot resolve ${spec}`);
    });
  }
  mockExistsSync.mockImplementation((p) => filesByPath.has(p));
  mockReadFileSync.mockImplementation((p) => {
    if (filesByPath.has(p)) return filesByPath.get(p);
    throw new Error(`ENOENT: ${p}`);
  });
}

beforeEach(() => {
  mockReadFileSync.mockReset();
  mockExistsSync.mockReset();
  mockResolve.mockReset();
  mockWriteBuildArtifact.mockReset();
});

test('writes empty array when components.imports is empty', async () => {
  const components = { imports: {} };
  await writeServerExternalPackages({ components, context: makeContext() });
  expect(mockWriteBuildArtifact).toHaveBeenCalledWith(
    'serverExternalPackages.json',
    '[]'
  );
});

test('writes empty array when components.imports is missing', async () => {
  await writeServerExternalPackages({ components: {}, context: makeContext() });
  expect(mockWriteBuildArtifact).toHaveBeenCalledWith(
    'serverExternalPackages.json',
    '[]'
  );
});

test('collects serverExternalPackages declared on a block plugin', async () => {
  setupPlugins([
    {
      pkg: '@lowdefy/blocks-tiptap',
      pkgJson: { lowdefy: { serverExternalPackages: ['turndown'] } },
    },
  ]);
  const components = {
    imports: {
      blocks: [{ package: '@lowdefy/blocks-tiptap', typeName: 'Tiptap' }],
    },
  };
  await writeServerExternalPackages({ components, context: makeContext() });
  expect(mockWriteBuildArtifact).toHaveBeenCalledWith(
    'serverExternalPackages.json',
    '["turndown"]'
  );
});

test('walks non-block plugin categories', async () => {
  setupPlugins([
    {
      pkg: '@lowdefy/plugin-aws',
      pkgJson: { lowdefy: { serverExternalPackages: ['@aws-sdk/client-s3'] } },
    },
  ]);
  const components = {
    imports: {
      connections: [{ package: '@lowdefy/plugin-aws', typeName: 'AwsS3Bucket' }],
    },
  };
  await writeServerExternalPackages({ components, context: makeContext() });
  expect(mockWriteBuildArtifact).toHaveBeenCalledWith(
    'serverExternalPackages.json',
    '["@aws-sdk/client-s3"]'
  );
});

test('plugin without lowdefy field contributes nothing', async () => {
  setupPlugins([
    { pkg: '@lowdefy/blocks-basic', pkgJson: { version: '5.3.0' } },
  ]);
  const components = {
    imports: {
      blocks: [{ package: '@lowdefy/blocks-basic', typeName: 'Box' }],
    },
  };
  await writeServerExternalPackages({ components, context: makeContext() });
  expect(mockWriteBuildArtifact).toHaveBeenCalledWith(
    'serverExternalPackages.json',
    '[]'
  );
});

test('skips unresolvable plugins silently', async () => {
  mockResolve.mockImplementation(() => {
    throw new Error('Cannot resolve');
  });
  mockExistsSync.mockReturnValue(false);
  const components = {
    imports: {
      blocks: [{ package: 'some-custom-plugin', typeName: 'Custom' }],
    },
  };
  await expect(
    writeServerExternalPackages({ components, context: makeContext() })
  ).resolves.toBeUndefined();
  expect(mockWriteBuildArtifact).toHaveBeenCalledWith(
    'serverExternalPackages.json',
    '[]'
  );
});

test('deduplicates externals declared by multiple plugins', async () => {
  setupPlugins([
    {
      pkg: 'plugin-a',
      pkgJson: { lowdefy: { serverExternalPackages: ['shared-dep', 'a-only'] } },
    },
    {
      pkg: 'plugin-b',
      pkgJson: { lowdefy: { serverExternalPackages: ['shared-dep', 'b-only'] } },
    },
  ]);
  const components = {
    imports: {
      connections: [
        { package: 'plugin-a', typeName: 'A' },
        { package: 'plugin-b', typeName: 'B' },
      ],
    },
  };
  await writeServerExternalPackages({ components, context: makeContext() });
  expect(mockWriteBuildArtifact).toHaveBeenCalledWith(
    'serverExternalPackages.json',
    '["a-only","b-only","shared-dep"]'
  );
});

test('sorts the output deterministically', async () => {
  setupPlugins([
    {
      pkg: 'plugin-z',
      pkgJson: { lowdefy: { serverExternalPackages: ['zeta', 'alpha'] } },
    },
  ]);
  const components = {
    imports: {
      operators: { server: [{ package: 'plugin-z', typeName: '_z' }] },
    },
  };
  await writeServerExternalPackages({ components, context: makeContext() });
  expect(mockWriteBuildArtifact).toHaveBeenCalledWith(
    'serverExternalPackages.json',
    '["alpha","zeta"]'
  );
});

test('throws when an external collides with a transpiled block package', async () => {
  setupPlugins([
    {
      pkg: 'meta-plugin',
      pkgJson: {
        lowdefy: { serverExternalPackages: ['@lowdefy/blocks-tiptap'] },
      },
    },
  ]);
  const components = {
    imports: {
      blocks: [{ package: '@lowdefy/blocks-tiptap', typeName: 'Tiptap' }],
      connections: [{ package: 'meta-plugin', typeName: 'Meta' }],
    },
  };
  await expect(
    writeServerExternalPackages({ components, context: makeContext() })
  ).rejects.toThrow(/meta-plugin.*@lowdefy\/blocks-tiptap/);
});

test('finds package.json via the direct exports-map resolve when available', async () => {
  // Plugin whose exports map explicitly exposes ./package.json — direct resolve works.
  mockResolve.mockImplementation((spec) => {
    if (spec === 'direct-plugin/package.json') {
      return '/fake/node_modules/direct-plugin/package.json';
    }
    throw new Error(`Cannot resolve ${spec}`);
  });
  mockReadFileSync.mockImplementation((p) => {
    if (p === '/fake/node_modules/direct-plugin/package.json') {
      return JSON.stringify({
        name: 'direct-plugin',
        lowdefy: { serverExternalPackages: ['direct-dep'] },
      });
    }
    throw new Error(`ENOENT: ${p}`);
  });
  mockExistsSync.mockReturnValue(false);
  const components = {
    imports: {
      blocks: [{ package: 'direct-plugin', typeName: 'X' }],
    },
  };
  await writeServerExternalPackages({ components, context: makeContext() });
  expect(mockWriteBuildArtifact).toHaveBeenCalledWith(
    'serverExternalPackages.json',
    '["direct-dep"]'
  );
});
