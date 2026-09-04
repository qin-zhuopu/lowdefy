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

import CancelExecution from './CancelExecution/CancelExecution.js';
import CreateJob from './CreateJob/CreateJob.js';
import DeleteExecution from './DeleteExecution/DeleteExecution.js';
import DeleteJob from './DeleteJob/DeleteJob.js';
import GetExecution from './GetExecution/GetExecution.js';
import GetLogs from './GetLogs/GetLogs.js';
import ListExecutions from './ListExecutions/ListExecutions.js';
import ListJobs from './ListJobs/ListJobs.js';
import RerunExecution from './RerunExecution/RerunExecution.js';
import TriggerJob from './TriggerJob/TriggerJob.js';

import schema from './schema.js';

export default {
  schema,
  requests: {
    CancelExecution,
    CreateJob,
    DeleteExecution,
    DeleteJob,
    GetExecution,
    GetLogs,
    ListExecutions,
    ListJobs,
    RerunExecution,
    TriggerJob,
  },
};
