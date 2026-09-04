/* eslint-disable no-param-reassign */

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

import { execSync } from 'child_process';
import { type } from '@lowdefy/helpers';

function computeGitSha() {
  const fromEnv = process.env.LOWDEFY_GIT_SHA?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch (_) {
    return null;
  }
}

function buildApp({ components }) {
  if (type.isNone(components.app)) {
    components.app = {};
  }
  if (!type.isObject(components.app)) {
    throw new Error('lowdefy.app is not an object.');
  }
  if (type.isNone(components.app.html)) {
    components.app.html = {};
  }
  if (type.isNone(components.app.html.appendBody)) {
    components.app.html.appendBody = '';
  }
  if (type.isNone(components.app.html.appendHead)) {
    components.app.html.appendHead = '';
  }
  components.appMeta = {
    slug: components.slug ?? null,
    name: components.name ?? null,
    version: components.version ?? null,
    description: components.description ?? null,
    license: components.license ?? null,
    lowdefyVersion: components.lowdefy ?? null,
    gitSha: computeGitSha(),
  };
  return components;
}

export default buildApp;
