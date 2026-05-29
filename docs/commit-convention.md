# Git Commit Message Convention

This project uses **[Conventional Commits](https://www.conventionalcommits.org/)**.

## Format

```text
<type>(optional-scope): <short imperative summary>

[optional body explaining why / context]

[optional footer]
```

- **Summary**: imperative mood ("add", not "added"/"adds"), lowercase, no trailing period, ≤ ~72 chars.
- **Body**: explain *why* and any context; wrap at ~72 cols. Optional.
- **Footer**: metadata such as `BREAKING CHANGE: …`, issue refs (`Closes #12`), or `Co-Authored-By:`. Optional.

## Types

| Type       | Use for                                                        |
| ---------- | -------------------------------------------------------------- |
| `feat`     | A new feature                                                  |
| `fix`      | A bug fix                                                       |
| `docs`     | Documentation only                                             |
| `style`    | Formatting / whitespace; no code-behavior change               |
| `refactor` | Code change that neither fixes a bug nor adds a feature        |
| `perf`     | Performance improvement                                        |
| `test`     | Adding or correcting tests                                     |
| `build`    | Build system, dependencies, packaging                          |
| `ci`       | CI configuration and scripts                                   |
| `chore`    | Maintenance that doesn't touch src or tests (e.g. tooling)     |
| `revert`   | Reverts a previous commit                                      |

## Scopes (suggested)

`backend`, `frontend`, `deploy`, `docs`, `db`, `auth`, `storage`, `api`, `gallery`, `detail`, `edit`.

## Examples

```text
feat(gallery): add click-to-expand filter popover

fix(auth): reject API keys after their revoked_at timestamp

docs: add commit message convention

refactor(api): promote crud serialization helpers to public names

build(backend): pin Python to 3.12 for wheel stability
```

## Breaking changes

Either append `!` after the type/scope, or add a `BREAKING CHANGE:` footer:

```text
feat(api)!: rename /commissions/{id}/images visibility param

BREAKING CHANGE: `visibility` is now required; default behavior removed.
```
