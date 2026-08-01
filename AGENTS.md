# AGENTS.md

Operational rules for AI coding agents working in this repository. These are
mandatory and override default agent behavior.

## Repository layout — canonical source + two mirrors

FlowLogix has one canonical source repository and two identical mirrors.

| Role | GitHub URL |
| :--- | :--- |
| **Canonical source** | https://github.com/AN3S-CREATE/FlowLogix.git |
| Mirror 1 | https://github.com/veralogix-group-innovation/FlowLogix.git |
| Mirror 2 | https://github.com/AN3S-at-CREATE/FlowLogix.git |

## Mirror every commit and push to all three remotes

Whenever you commit or push work, you MUST individually push the same work to
**all three** repositories so they never diverge.

Rules:

- Push to each remote **individually** (one push per repository) — do not rely
  on a single push reaching the others.
- Use the **same branch name** and the **same commit contents** on all three.
- A change is not considered done until it has landed on all three. If a push
  to any remote fails, treat the task as incomplete and surface the failure.
- This applies to every branch and every commit, including follow-up fixes and
  documentation-only changes.

### Configuring the remotes (one-time)

```sh
git remote add origin       https://github.com/AN3S-CREATE/FlowLogix.git
git remote add an3s         https://github.com/AN3S-CREATE/FlowLogix.git
git remote add veralogix    https://github.com/veralogix-group-innovation/FlowLogix.git
git remote add an3s-at      https://github.com/AN3S-at-CREATE/FlowLogix.git
```

> **Note**: Prefer `origin` → `AN3S-CREATE/FlowLogix.git` (canonical). If an
> existing clone still has `origin` on another host, that is fine — just make
> sure all three destinations above are configured and each receives every push.
> (`origin` and `an3s` may both point at the canonical repo.)

### Pushing every commit to all three

After committing on your working branch, push to each remote individually
(use the same branch name everywhere):

```sh
git push origin    HEAD
git push veralogix HEAD
git push an3s-at   HEAD
```

If `an3s` is configured as an alias of the canonical source, you may use
`git push an3s HEAD` instead of (or in addition to) `origin`.

Confirm all three destinations succeeded before considering the change done.

### Retired remote — do not re-add

`VeralogixCatalyst/FlowLogix` was a mirror until **2026-07-26**, when it
became unreachable: `git ls-remote` returns `remote: Repository not found`.
GitHub returns that same 404 for a deleted repository and for a private one the
caller cannot see, so the cause is not distinguishable from a clone. It was
**removed from this policy by the repository owner**, not silently dropped.

Do not re-add it as a mirror unless the owner explicitly asks. If it is ever
restored, re-add it here first, then resume four-way pushes.
