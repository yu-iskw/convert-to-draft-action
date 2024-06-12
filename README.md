# convert-to-draft-action

A custom GitHub Action to convert a pull request to draft if all workflows aren't passed

## How to use

To use the `convert-to-draft-action` in your GitHub repository, follow these steps:

**Create a Workflow File**:
Create a new workflow file in your repository under `.github/workflows/check-workflows.yml` with the following content:

```yaml
name: Convert PR to Draft

on:
  pull_request:
    types:
      [
        opened,
        synchronize,
        reopened,
        ready_for_review,
        review_requested,
        auto_merge_enabled,
      ]

jobs:
  convert_to_draft:
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      pull-requests: write
    steps:
      - name: Convert PR to Draft
        uses: yu-iskw/convert-to-draft-action@v0.1.2
        with:
          # Required
          GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
          # Optional
          leave_comment: "1"
          # Optional
          comment_body: |
            The pull request has been converted to a draft because some workflows failed or are still running.
            Please get it ready to review after all workflows are passed.
```

## Inputs

These inputs are defined in the `action.yml` file and are used to configure the behavior of the action when it runs.
The `convert-to-draft-action` accepts the following inputs:

- `GITHUB_TOKEN` (required):
  - **Description**: The GitHub token used to authenticate the action.
  - **Default**: None
- `leave_comment` (optional):
  - **Description**: A flag to determine whether to leave a comment when the pull request is converted to a draft.
  - **Default**: "1"
- `comment_body` (optional):
  - **Description**: The body of the comment to leave when the pull request is converted to a draft.
  - **Default**: SEE [action.yml](./action.yml)
