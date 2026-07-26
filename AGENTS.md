# AGENTS.md

Operational rules for AI coding agents working in this repository. These are
mandatory and override default agent behavior.

## Mirror every commit and push to all FlowLogix remotes

FlowLogix is maintained as identical mirrors across two GitHub
repositories. Whenever you commit or push work to **either** of them, you MUST
individually push the same work to **both** so they never diverge:

- https://github.com/veralogix-group-innovation/FlowLogix.git
- https://github.com/AN3S-CREATE/FlowLogix.git

Rules:

- Push to each remote **individually** (one push per repository) — do not rely
  on a single push reaching the other.
- Use the **same branch name** and the **same commit contents** on both
  repositories.
- A change is not considered done until it has landed on both. If a push
  to either remote fails, treat the task as incomplete and surface the failure.
- This applies to every branch and every commit, including follow-up fixes and
  documentation-only changes.

### Configuring the remotes (one-time)

```sh
git remote add veralogix https://github.com/veralogix-group-innovation/FlowLogix.git
git remote add an3s      https://github.com/AN3S-CREATE/FlowLogix.git
```

### Pushing every commit to both

After committing on your working branch, push it to each remote individually
(use the same branch name everywhere):

```sh
git push veralogix HEAD
git push an3s      HEAD
```

Confirm both pushes succeeded before considering the change done.

### Retired remote — do not re-add

`VeralogixCatalyst/FlowLogix` was a third mirror until **2026-07-26**, when it
became unreachable: `git ls-remote` returns `remote: Repository not found`.
GitHub returns that same 404 for a deleted repository and for a private one the
caller cannot see, so the cause is not distinguishable from a clone. It was
**removed from this policy by the repository owner**, not silently dropped.

Do not re-add it as a mirror unless the owner explicitly asks. If it is ever
restored, re-add it here first, then resume three-way pushes.
