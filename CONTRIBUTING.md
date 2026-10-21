# Contributing to Poxeet

Thanks for helping. Bug reports, ideas, docs fixes and code are all welcome.

## Before you start

- **Small fixes** (typos, clear bugs): open a pull request straight away.
- **Bigger changes** (a new feature, a new screen, a change to the database or to how posts are published): open an issue first and describe what you want to change and why. It saves you building something that can't be merged.
- **Security problems:** don't open a public issue. Report them privately with "Report a vulnerability" in the repository's Security tab, and give us time to fix them before telling anyone else.

## Set up

Follow "Run your own copy" in the [README](README.md). For development you also want a local Supabase:

```bash
pnpm install
supabase start          # local Postgres and Auth in Docker
supabase migration up --local
pnpm dev
```

## Before you open a pull request

Run all of these. They must pass:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test:db            # unit and database tests, against the local Supabase
```

Then check:

- **Tests:** new behaviour has a test next to the ones like it in `tests/`. Anything that touches data access gets a database test (`*-db.test.ts`).
- **Database changes:** add a new file in `supabase/migrations/`, named with the next timestamp. Never edit a migration that's already in `main`: live databases have run it. Every member table keeps row-level security, so a member can only ever reach their own rows.
- **Secrets:** keys, tokens and anything from `SUPABASE_SECRET_KEY` stay on the server. Nothing secret in `NEXT_PUBLIC_` variables, client components or logs.
- **UI changes:** look at them at phone width (375px) and on a wide desktop, and include a screenshot of each in the pull request. Reuse the components in `components/ui` and the tokens in `design-tokens.json` (see `/design`).
- **Copy:** short, plain sentences. Say what happens, not what the code does.

## The pull request

- One change per pull request, with a title that says what it does.
- In the description: what changed, why, and how you checked it.
- Keep commits focused. We may squash them when merging.

## License

Poxeet is licensed under [Apache 2.0](LICENSE). By contributing, you agree that your contribution is licensed under it too. The Poxeet name and logo aren't covered by the license; see "Name and logo" in the README.

## Be kind

Assume good intent, keep feedback about the work, and help newcomers find their way.
