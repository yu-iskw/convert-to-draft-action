// Copyright 2024 yu-iskw
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const core = require("@actions/core");
const github = require("@actions/github");
const fetch = require("node-fetch");

async function run() {
  try {
    const token = core.getInput("GITHUB_TOKEN");
    const context = github.context;
    const prNumber = context.payload.pull_request?.number;
    const owner = context.repo.owner;
    const repo = context.repo.repo;

    core.info(`PR Number: ${prNumber}`);
    core.info(`Owner: ${owner}`);
    core.info(`Repo: ${repo}`);

    if (!prNumber) {
      throw new Error("Pull request number is undefined");
    }

    const result = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs?event=pull_request`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    core.info(`Fetch result status: ${result.status}`);

    if (!result.ok) {
      throw new Error(`Failed to fetch workflow runs: ${result.statusText}`);
    }

    const data = await result.json();
    core.info(`Workflow runs data: ${JSON.stringify(data, null, 2)}`);

    if (!data.workflow_runs) {
      throw new Error("workflow_runs is undefined");
    }

    const runs = data.workflow_runs.filter((run) =>
      run.pull_requests.some((pr) => pr.number === prNumber),
    );

    core.info(`Filtered runs: ${JSON.stringify(runs, null, 2)}`);

    const hasFailedOrRunningWorkflows = runs.some(
      (run) => run.conclusion !== "success" || run.conclusion === null,
    );

    if (hasFailedOrRunningWorkflows) {
      core.info(
        "Some workflows failed or are still running. Converting PR to draft...",
      );
      core.info(`Workflows: ${JSON.stringify(runs, null, 2)}`);
      const updateResult = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
          },
          body: JSON.stringify({ draft: true }),
        },
      );

      core.info(`Update result status: ${updateResult.status}`);
      core.info(`Update result status text: ${updateResult.statusText}`);
      core.info(
        `Update result headers: ${JSON.stringify(updateResult.headers.raw(), null, 2)}`,
      );
      const updateResultBody = await updateResult.text();
      core.info(`Update result body: ${updateResultBody}`);

      if (!updateResult.ok) {
        throw new Error(
          `Failed to update pull request: ${updateResult.statusText}`,
        );
      }
    } else {
      core.info("All workflows passed.");
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
