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
import github from "@actions/github";
import fetch from "node-fetch";

async function run() {
	try {
		const token = getInput("GITHUB_TOKEN");
		const { context } = github;
		const { number: prNumber } = context.payload.pull_request || {};
		const { owner, repo } = context.repo;

		info(`PR Number: ${prNumber}`);
		info(`Owner: ${owner}`);
		info(`Repo: ${repo}`);

		if (!prNumber) {
			throw new Error("Pull request number is undefined");
		}

		const workflowRuns = await fetchWorkflowRuns(token, owner, repo);
		const runs = filterWorkflowRuns(workflowRuns, prNumber);

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
	info(`Workflow runs data: ${JSON.stringify(data, null, 2)}`);

	if (!data.workflow_runs) {
		throw new Error("workflow_runs is undefined");
	}

	return data.workflow_runs;
}

function filterWorkflowRuns(workflowRuns, prNumber) {
	const runs = workflowRuns.filter((run) =>
		run.pull_requests.some((pr) => pr.number === prNumber),
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

	const response = await fetch(
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

	info(`Update result status: ${response.status}`);
	info(`Update result status text: ${response.statusText}`);
	info(
		`Update result headers: ${JSON.stringify(response.headers.raw(), null, 2)}`,
	);
	const responseBody = await response.text();
	info(`Update result body: ${responseBody}`);

	if (!response.ok) {
		throw new Error(`Failed to update pull request: ${response.statusText}`);
	}
}

async function leaveCommentIfDraft(token, owner, repo, prNumber) {
	const prResponse = await fetch(
		`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github.v3+json",
			},
		},
	);

	if (!prResponse.ok) {
		throw new Error(`Failed to fetch pull request: ${prResponse.statusText}`);
	}

	const prData = await prResponse.json();

	if (prData.draft) {
		const commentResponse = await fetch(
			`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
					Accept: "application/vnd.github.v3+json",
				},
				body: JSON.stringify({
					body: `
          The pull request has been converted to a draft because some workflows failed or are still running.
          Please get it ready to review after all workflows are passed.
          `,
				}),
			},
		);

		info(`Comment result status: ${commentResponse.status}`);
		info(`Comment result status text: ${commentResponse.statusText}`);

		if (!commentResponse.ok) {
			throw new Error(
				`Failed to leave a comment on the pull request: ${commentResponse.statusText}`,
			);
		}
	} else {
		info("The pull request is not in draft status.");
	}
}

run();
