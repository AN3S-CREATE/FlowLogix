# AGENTS.md

Operational rules for AI coding agents working in this repository. These are
mandatory and override default agent behavior.

## Mirror every commit and push to all FlowLogix remotes

FlowLogix is maintained as identical mirrors across three GitHub
repositories. Whenever you commit or push work to **any** of them, you MUST
individually push the same work to **all three** so they never diverge:

- https://github.com/veralogix-group-innovation/FlowLogix.git
- https://github.com/AN3S-CREATE/FlowLogix.git
- https://github.com/VeralogixCatalyst/FlowLogix.git

Rules:

- Push to each remote **individually** (one push per repository) — do not rely
  on a single push reaching the others.
- Use the **same branch name** and the **same commit contents** on every
  repository.
- A change is not considered done until it has landed on all three. If a push
  to any remote fails, treat the task as incomplete and surface the failure.
- This applies to every branch and every commit, including follow-up fixes and
  documentation-only changes.

### Configuring the remotes (one-time)

```sh
git remote add veralogix https://github.com/veralogix-group-innovation/FlowLogix.git
git remote add an3s      https://github.com/AN3S-CREATE/FlowLogix.git
git remote add catalyst  https://github.com/VeralogixCatalyst/FlowLogix.git
```

### Pushing every commit to all three

After committing on your working branch, push it to each remote individually
(use the same branch name everywhere):

```sh
git push veralogix HEAD
git push an3s      HEAD
git push catalyst  HEAD
```

Confirm all three pushes succeeded before considering the change done.
