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
- Energy calculator tariffs, export-cost models and battery strategy live in `src/lib/home-savings/scenario.ts` + `config.ts`; battery value is shown as the marginal with/without comparison per year, Shapley only for package allocation — keeps the battery number honest and the package additive.
- The calculator reports energy-cost savings only (no purchase cost, payback or ROI); the long-term battery horizon, degradation and main year are central settings in `config.ts` — keeps advice free of unverifiable investment figures.
- Calculator defaults live in `src/lib/home-savings/config.ts`; admins override only registered settings (`calculator-settings.ts` SETTINGS) via drafts in `calculator_config_versions`, live only after `publish_calculator_config` — legal rules stay in code, invalid published values fall back to code defaults, and leads record the config version used.
- Company team changes go through invitations (`company_invitations`, hashed one-time tokens) and the `accept_company_invitation` / `team_update_member` RPCs; seat pricing lives in `src/lib/team-policy.ts` — keeps last-owner and no-self-escalation checks atomic in the database.
- Service areas (`service_areas`: radius/provinces/national per product) are matched in the database (`eligible_companies_for_lead`, `coverage_by_region`); saving an area re-syncs `company_regions` as the coarse guard used by `allocate_lead_to_company` until the phase-3 planner replaces it.
- All allocation (auto, retry, market, manual) goes through `allocate_lead_bundle` (one row per company, bundled products, max 4 companies ever); `distributeLead` plans with the pure `lead-planner.ts` and companies with a `subscription_versions` row use quota + bundle pricing while others keep legacy pricing — one set of checks in the database for every path.
- Platform admin rights require an aal2 (TOTP) session: server checks use `adminRole` in `src/lib/admin-guard.ts` and the DB `has_role` denies admin to aal1 user JWTs; failed background work is tracked in `background_jobs` with backoff — admin access is MFA-gated centrally, never per screen.
