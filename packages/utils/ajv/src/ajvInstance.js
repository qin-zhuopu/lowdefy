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

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import addKeywords from 'ajv-keywords';
import ajvErrors from 'ajv-errors';

// Hard cap on errors collected per generated validator function.
// `allErrors: true` is required for ajv-errors (errorMessage:), but without a
// cap an attacker can make Ajv allocate an unbounded number of error objects
// (CodeQL js/resource-exhaustion-from-deep-object-traversal). The code.process
// hook below rewrites every `errors++;` site to early-exit at this threshold,
// bounding memory at ~MAX_VALIDATION_ERRORS * ~500 bytes per validate() call.
const MAX_VALIDATION_ERRORS = 20;

// Ajv 8 emits the exact pattern `errors++;` after every error push (see
// ajv/lib/compile/errors.ts addError), and ends each generated validator with
// `<validateName>.errors = vErrors; return errors === 0;`. We inject a
// `<validateName>.errors = vErrors; return false;` guard immediately after
// each `errors++;` so the validator stops walking the input once the cap is
// reached *and* the caller still sees the (capped) errors array on the
// function's `.errors` property — which is how `ajv.errors` is populated.
function capErrors(code) {
  const fnMatch = code.match(/return\s+function\s+(\w+)\s*\(/);
  if (!fnMatch) return code;
  const fnName = fnMatch[1];
  return code.replace(
    /errors\+\+;/g,
    `errors++;if(errors>=${MAX_VALIDATION_ERRORS}){${fnName}.errors=vErrors;return false;}`
  );
}

const ajv = new Ajv({
  // codeql[js/resource-exhaustion-from-deep-object-traversal] -- bounded by capErrors() above
  allErrors: true,
  strict: false,
  code: { process: capErrors },
});

// Order matters: format and keyword definitions must be registered before
// ajv-errors so the errorMessage keyword can attach to them.
addFormats(ajv);
// `instanceof` — match JS class instances (e.g. `instanceof: 'Date'`).
// `transform`  — normalise string values mid-validation (`transform: [trim, toUpperCase]`).
// `regexp`     — `pattern:` with regex flags (`regexp: '/^l[0-9]+$/i'`).
addKeywords(ajv, ['instanceof', 'transform', 'regexp']);
ajvErrors(ajv);

export { MAX_VALIDATION_ERRORS };
export default ajv;
