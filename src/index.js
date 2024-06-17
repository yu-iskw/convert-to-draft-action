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

/**
 * References:
 * - https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28#list-workflow-runs-for-a-repository
 * - https://docs.github.com/en/rest/actions/workflow-jobs?apiVersion=2022-11-28#get-a-job-for-a-workflow-run
 */

async function run() {
  try {
    // Sleep 5 seconds to make sure other workflows are triggered
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const token = getInput("GITHUB_TOKEN");
    const leaveComment = getInput("leave_comment");
    const commentBody = getInput("comment_body");

    // Extract pull request number from the context payload
    const prNumber = context.payload.pull_request?.number;
    // Extract repository owner and name from the context
    const { owner, repo } = context.repo;
    // Extract job ID from the context
    const jobId = context.job;
    // Extract run ID from the context
    const runId = context.runId;
    // Extract workflow name from the context
    const workflow = context.workflow;
    // Get the head SHA from the context
    const headSha = context.payload.pull_request?.head?.sha;

    // Log context information for debugging
    info(`Context: ${JSON.stringify(context, null, 2)}`);
    info(`PR Number: ${prNumber}`);
    info(`Owner: ${owner}`);
    info(`Repo: ${repo}`);
    info(`Job ID: ${jobId}`);
    info(`Run ID: ${runId}`);
    info(`Workflow: ${workflow}`);
    info(`Head SHA: ${headSha}`);

    // Check if pull request number is defined
    if (!prNumber) {
      throw new Error("Pull request number is undefined");
    }

    // Initialize Octokit with the provided token
    const octokit = getOctokit(token);
    // Fetch pull request data from GitHub
    const { data: prData } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Log pull request data for debugging
    info(`Pull Request Data: ${JSON.stringify(prData, null, 2)}`);

    // Check if the pull request is already in draft status
    if (prData.draft) {
      info("The pull request is already in draft status.");
      return;
    }

    // Fetch workflow runs associated with the pull request
    const workflowRuns = await fetchWorkflowRuns(token, owner, repo, headSha);

    // Get running workflow runs
    const runningWorkflowRuns = getRunningWorkflowRuns(workflowRuns, runId);

    // If there is any running workflow run, convert the pull request to draft
    if (runningWorkflowRuns.length > 0) {
      info("Any workflow run is not completed");
      await convertPrToDraft(token, owner, repo, prNumber);
    }

    // Only if there is any failed workflow run, then check if their workflows jobs are truly failed
    // because it is impossible to know if the failed jobs are skipped or not.

    // Fetch workflow jobs for the remaining workflow runs
    const jobs = await fetchWorkflowJobs(token, owner, repo, workflowRuns);

    // Filter out the current workflow run using the head SHA
    const filteredJobs = jobs.filter((job) => job.head_sha !== headSha);

    // Convert the pull request to draft if any workflows failed or are still running
    if (hasFailedOrRunningJobs(filteredJobs)) {
      await convertPrToDraft(token, owner, repo, prNumber);
      // Leave a comment if the pull request is converted to draft and leave_comment is true
      if (leaveComment === "1") {
        await leaveCommentIfDraft(token, owner, repo, prNumber, commentBody);
      }
    } else {
      info("All workflows passed.");
    }
  } catch (error) {
    // Set the action as failed if an error occurs
    setFailed(error.message);
  }
}

function getRunningWorkflowRuns(workflowRuns, currentRunId) {
  return workflowRuns.filter(
    (run) => run.status !== "completed" && run.id !== currentRunId,
  );
}

async function fetchWorkflowRuns(token, owner, repo, headSha) {
  /**
   * NOTE: We can't determine if a workflow run is a part of a skipped workflow job.
   *       So, we need to fetch workflow jobs by workflow runs and check if the job is skipped.
   */
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/runs?head_sha=${headSha}`,
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
  info(`Workflow runs details: ${JSON.stringify(data.workflow_runs, null, 2)}`);

  if (!data.workflow_runs) {
    throw new Error("workflow_runs is undefined");
  }

  return data.workflow_runs;
}

async function fetchWorkflowJobs(token, owner, repo, workflowRuns) {
  const jobs = [];
  for (const run of workflowRuns) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}/jobs`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    info(`Fetch jobs result status: ${response.status}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch workflow jobs: ${response.statusText}`);
    }

    const data = await response.json();
    jobs.push(...data.jobs);
  }

  info(`Total jobs fetched: ${jobs.length}`);
  info(`Jobs details: ${JSON.stringify(jobs, null, 2)}`);
  return jobs;
}

function hasFailedOrRunningJobs(jobs) {
  const failedOrRunningJobs = jobs.filter(
    (job) => job.conclusion !== "success" || job.conclusion === null,
  );
  info(
    `Failed or running jobs: ${JSON.stringify(failedOrRunningJobs, null, 2)}`,
  );
  return failedOrRunningJobs.length > 0;
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
  info(`Draft conversion response: ${JSON.stringify(response, null, 2)}`);
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

  info(`Pull Request ID: ${pullRequest.data.node_id}`);
  return pullRequest.data.node_id;
}

async function leaveCommentIfDraft(token, owner, repo, prNumber, commentBody) {
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
      body: commentBody,
    });

    info("Comment left on the pull request.");
  } else {
    info("The pull request is not in draft status.");
  }
}

run();
