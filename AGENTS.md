<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Local development and Git workflow

- Read LOCAL_DEVELOPMENT.md before configuring or testing this project.
- Keep Lovable connected to main. Work on a separate branch and use a reviewed
  pull request before merging into main; publishing is a separate user decision.
- Preserve the current Lovable Cloud backend and connectors. Do not create a
  replacement backend or run database migrations as part of local setup.
- Managed server credentials are unavailable for supported local use in this
  project. Do not attempt to extract them or replace them with public keys.
- Run local unit tests with integration tests excluded. Preview operations may
  affect real data; do not trigger payments, SMS, or database writes as smoke tests.
- Never commit secrets. .env is already tracked and must contain public values only.
