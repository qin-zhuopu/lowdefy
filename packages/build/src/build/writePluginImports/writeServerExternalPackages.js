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

import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';

import { ConfigError } from '@lowdefy/errors';

// Collect every unique plugin package across all import categories.
// Mirrors the dependency walk in updateServerPackageJson.js so externalisation
// covers connections/operators/actions etc., not just blocks.
function collectPluginPackages(imports) {
  const categories = [
    imports.actions,
    imports.agents,
    imports.auth?.adapters,
    imports.auth?.callbacks,
    imports.auth?.events,
    imports.auth?.providers,
    imports.blocks,
    imports.connections,
    imports.icons,
    imports.requests,
    imports.operators?.client,
    imports.operators?.server,
  ];
  const packages = new Set();
  for (const list of categories) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item?.package) packages.add(item.package);
    }
  }
  return packages;
}

// Direct resolve of `${pkg}/package.json` fails for plugins whose exports map
// uses a catch-all like `"./*": "./dist/*"` (e.g. blocks-tiptap, plugin-aws),
// because it routes the request into `./dist/package.json`. Fall back to
// resolving a known subpath and walking up to the real package root.
function findPluginPackageJson({ requireFromServer, pkg }) {
  try {
    const direct = requireFromServer.resolve(`${pkg}/package.json`);
    const json = JSON.parse(fs.readFileSync(direct, 'utf8'));
    if (json.name === pkg) return json;
  } catch {
    // Fall through to walk-up resolution.
  }
  const subpaths = ['types', 'metas', 'blocks', 'connections'];
  for (const sub of subpaths) {
    let entry;
    try {
      entry = requireFromServer.resolve(`${pkg}/${sub}`);
    } catch {
      continue;
    }
    let dir = path.dirname(entry);
    const root = path.parse(dir).root;
    while (dir !== root) {
      const candidate = path.join(dir, 'package.json');
      if (fs.existsSync(candidate)) {
        try {
          const json = JSON.parse(fs.readFileSync(candidate, 'utf8'));
          if (json.name === pkg) return json;
        } catch {
          // Malformed package.json — try the next ancestor.
        }
      }
      dir = path.dirname(dir);
    }
  }
  return null;
}

async function writeServerExternalPackages({ components, context }) {
  const requireFromServer = createRequire(
    path.join(context.directories.server, 'package.json')
  );

  const pluginPackages = collectPluginPackages(components.imports ?? {});
  // Track which plugin contributed each external so error messages can name them.
  const externalToPlugins = new Map();

  for (const pkg of pluginPackages) {
    const pluginPkgJson = findPluginPackageJson({ requireFromServer, pkg });
    const list = pluginPkgJson?.lowdefy?.serverExternalPackages;
    if (!Array.isArray(list)) continue;
    for (const external of list) {
      if (!externalToPlugins.has(external)) {
        externalToPlugins.set(external, []);
      }
      externalToPlugins.get(external).push(pkg);
    }
  }

  // Next.js rejects entries that are also in transpilePackages. Block packages
  // are always transpiled, so a plugin externalising one would silently break
  // the build at next start — fail early with a pointer to the offender.
  const transpiledBlockPackages = new Set(
    (components.imports?.blocks ?? []).map((b) => b.package)
  );
  for (const [external, plugins] of externalToPlugins) {
    if (transpiledBlockPackages.has(external)) {
      throw new ConfigError(
        `Plugin "${plugins.join('", "')}" declared serverExternalPackages entry "${external}", which is also a transpiled block package. A package cannot be both transpiled and externalised.`
      );
    }
  }

  const sorted = [...externalToPlugins.keys()].sort();
  await context.writeBuildArtifact(
    'serverExternalPackages.json',
    JSON.stringify(sorted)
  );
}

export default writeServerExternalPackages;
