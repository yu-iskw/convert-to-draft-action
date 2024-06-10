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
    types: [opened, synchronize, reopened]

jobs:
  convert_to_draft:
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      pull-requests: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      - name: Convert PR to Draft
        uses: yu-iskw/convert-to-draft-action@v1
        with:
          GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
```
