## Summary

<!-- What changed and why, in a few sentences. -->

## Related requirements

<!-- IDs from docs/PRODUCT_REQUIREMENTS.md and docs/THREAT_MODEL.md, e.g. ORD-3, T-08 -->

## Tests performed

<!-- Paste the commands you ran and their results. Don't list checks you didn't run. -->

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test` (unit, component, integration)
- [ ] `pnpm test:e2e` (if UI or flows changed)
- [ ] New or changed behavior has tests

## Security considerations

- [ ] Inputs validated with strict schemas at the route boundary
- [ ] Authorization enforced in the service layer, not only in UI or proxy
- [ ] No secrets, tokens, or personal data in code, logs, fixtures, or screenshots
- [ ] Threat model updated if a new risk was introduced or a control changed

## Database changes

- [ ] None
- [ ] Migration generated with `pnpm db:generate` and reviewed
- [ ] Destructive change? Describe the expand → migrate → contract plan and rollback:

## UI changes

<!-- Screenshots at mobile (360px) and desktop widths. Note keyboard and screen-reader checks. -->

- [ ] Simulated features (payments, restaurant actions, earnings) are labeled as simulations
- [ ] No wording implies UH or restaurant endorsement

## Known limitations

<!-- What this PR deliberately doesn't do. -->

## Reviewer checklist

- [ ] Docs match the implementation (`ARCHITECTURE`, `API_SPEC`, `DATABASE_DESIGN`, `PROGRESS`)
- [ ] Layering respected: routes → services → domain; no DB access from routes or components
- [ ] Error paths and edge cases are tested, not just the happy path
