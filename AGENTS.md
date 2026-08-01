# AGENTS.md

Operational rules for AI coding agents working in this repository. These are
mandatory and override default agent behavior.

## Mirror every commit and push to all FlowLogix remotes

FlowLogix is maintained as identical mirrors across three GitHub repositories.
The **primary / original** repository is:

- <https://github.com/AN3S-CREATE/FlowLogix.git>

Whenever you commit or push work to **any** FlowLogix remote, you MUST
individually push the same work to **all three** so they never diverge:

- <https://github.com/AN3S-CREATE/FlowLogix.git> *(primary / `origin`)*
- <https://github.com/veralogix-group-innovation/FlowLogix.git> *(mirror)*
- <https://github.com/AN3S-at-CREATE/FlowLogix.git> *(mirror)*

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
git remote add origin    https://github.com/AN3S-CREATE/FlowLogix.git
git remote add an3s      https://github.com/AN3S-CREATE/FlowLogix.git
git remote add veralogix https://github.com/veralogix-group-innovation/FlowLogix.git
git remote add an3s-at   https://github.com/AN3S-at-CREATE/FlowLogix.git
```

(`origin` and `an3s` may both point at the primary; that is fine.)

### Pushing every commit to all three

After committing on your working branch, push it to each remote individually
(use the same branch name everywhere):

```sh
git push origin    HEAD
git push veralogix HEAD
git push an3s-at   HEAD
```

If `an3s` is configured as an alias of the primary, you may use
`git push an3s HEAD` instead of (or in addition to) `origin`.

Confirm all three destinations succeeded before considering the change done.
