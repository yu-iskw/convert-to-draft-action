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

import { getInput, info, setFailed } from "@actions/core";
import { context, getOctokit } from "@actions/github";

async function run() {
  try {
    const token = getInput("GITHUB_TOKEN");
    const { number: prNumber } = context.payload.pull_request || {};
    const { owner, repo } = context.repo;
    const runNumber = context.runNumber;
    const runId = context.runId;

    info(`PR Number: ${prNumber}`);
    info(`Owner: ${owner}`);
    info(`Repo: ${repo}`);

    if (!prNumber) {
      throw new Error("Pull request number is undefined");
    }

    const octokit = getOctokit(token);
    const { data: prData } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    if (prData.draft) {
      info("The pull request is already in draft status.");
      return;
    }

    const workflowRuns = await fetchWorkflowRuns(token, owner, repo);
    const runs = filterWorkflowRuns(workflowRuns, prNumber, runNumber, runId);

    if (hasFailedOrRunningWorkflows(runs)) {
      await convertPrToDraft(token, owner, repo, prNumber);
      await leaveCommentIfDraft(token, owner, repo, prNumber);
    } else {
      info("All workflows passed.");
    }
  } catch (error) {
    setFailed(error.message);
  }
}

async function fetchWorkflowRuns(token, owner, repo) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/runs?event=pull_request`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );

  info(`Fetch result status: ${response.status}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch workflow runs: ${response.statusText}`);
  }

  const data = await response.json();
  const workflowStatuses = data.workflow_runs.reduce((acc, run) => {
    acc[run.status] = (acc[run.status] || 0) + 1;
    return acc;
  }, {});

  info(`Workflow runs data: ${data.workflow_runs.length} runs found`);
  info(`Workflow runs by status: ${JSON.stringify(workflowStatuses, null, 2)}`);

  if (!data.workflow_runs) {
    throw new Error("workflow_runs is undefined");
  }

  return data.workflow_runs;
}

function filterWorkflowRuns(
  workflowRuns,
  prNumber,
  excluded_runNumber,
  excluded_runId,
) {
  const runs = workflowRuns.filter(
    (run) =>
      run.pull_requests.some((pr) => pr.number === prNumber) &&
      run.run_number !== excluded_runNumber &&
      run.id !== excluded_runId,
  );

  info(`Filtered runs: ${JSON.stringify(runs, null, 2)}`);
  return runs;
}

function hasFailedOrRunningWorkflows(runs) {
  return runs.some(
    (run) => run.conclusion !== "success" || run.conclusion === null,
  );
}

async function convertPrToDraft(token, owner, repo, prNumber) {
  info("Some workflows failed or are still running. Converting PR to draft...");

  const octokit = getOctokit(token);
  const query = `
    mutation($id: ID!) {
      convertPullRequestToDraft(input: { pullRequestId: $id }) {
        pullRequest {
          id
          number
          isDraft
        }
      }
    }
  `;

  const pullRequestId = await getPullRequestId(octokit, owner, repo, prNumber);

  if (!pullRequestId) {
    throw new Error(
      `Could not resolve to a node with the global id of '${prNumber}'`,
    );
  }

  const variables = {
    id: pullRequestId,
  };

  const response = await octokit.graphql(query, variables);

  if (!response.convertPullRequestToDraft) {
    throw new Error("Failed to convert pull request to draft");
  }

  info("Pull request successfully converted to draft.");
}

async function getPullRequestId(octokit, owner, repo, prNumber) {
  const pullRequest = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  if (!pullRequest.data.node_id) {
    throw new Error(
      `Could not resolve to a node with the global id of '${prNumber}'`,
    );
  }

  return pullRequest.data.node_id;
}

async function leaveCommentIfDraft(token, owner, repo, prNumber) {
  const octokit = getOctokit(token);
  const { data: prData } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  if (prData.draft) {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: `
      The pull request has been converted to a draft because some workflows failed or are still running.
      Please get it ready to review after all workflows are passed.
      `,
    });

    info("Comment left on the pull request.");
  } else {
    info("The pull request is not in draft status.");
  }
}

run();
