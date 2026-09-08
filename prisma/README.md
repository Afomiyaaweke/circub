// Prisma config — switches the datasource provider based on DATABASE_URL.
//
// On Vercel (production), DATABASE_URL is a Postgres connection string
// (postgresql://...). On local dev it's a SQLite file URL (file:./db/custom.db).
//
// Prisma doesn't support a single schema with a dynamic provider — the
// `provider` field is hardcoded in the .prisma file. We work around this
// by post-processing the schema at `prisma generate` time: a custom
// generator script reads DATABASE_URL, picks the right provider, and
// writes the active schema to a temp location Prisma then uses.
//
// Simpler approach we actually use: keep two schema files
//   - prisma/schema.prisma          (SQLite, for local dev)
//   - prisma/schema.postgres.prisma (Postgres, for Vercel)
// and have the `build` script auto-pick the right one based on DATABASE_URL.
// See package.json `build` script and `scripts/prisma-build.mjs`.
