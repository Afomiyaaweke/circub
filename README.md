# circub

**Local price intelligence for travelers.**

circub is a community-driven platform where locals proactively post what things really cost in their cities, and travelers get verified, up-to-date local knowledge before they travel.

## What it does

- **Local Price Feed**: Locals post real prices for products, services, restaurants, transport, markets, and more.
- **Verified locals**: Every contributor builds a public profile with reputation, rating, and helpful votes.
- **Local consensus**: When multiple locals post about the same product, we aggregate a community consensus price range.
- **Price history**: See how prices change over time (current, 3 months ago, 6 months ago, 1 year ago).
- **Helpful voting & reports**: Travelers vote on accuracy and flag outdated, fake, or promotional posts.
- **Ask a local**: Send direct messages to verified locals when you can't find what you need.
- **Personal & Company accounts**: Travelers and locals use personal profiles; businesses use company pages.

## Tech stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Database**: Prisma ORM + SQLite
- **Styling**: Tailwind CSS 4 + shadcn/ui + Lucide icons
- **Auth**: bcrypt password hashing + signed cookie sessions
- **Brand color**: green (#22C55E family)

## Getting started

```bash
# Install dependencies
bun install

# Set up the database (creates SQLite file + pushes Prisma schema)
bun run db:push

# (Optional) Reset the database to a clean slate
bun run scripts/seed.ts

# Start the dev server
bun run dev
```

Then open http://localhost:3000 in your browser. You'll see the landing page. Click **Sign up free** to create a Personal or Company account, or **Sign in** if you already have one.

## Project structure

```
prisma/
  schema.prisma           # User, Product, Post, Connection, Message, LocalPricePost, LocalPriceVote, LocalPriceReport models
public/
  logo.svg                # circub logo (3D green "C" + cube + wordmark)
  logo-mark.svg           # icon-only variant
src/
  app/
    page.tsx              # Auth-aware routing (landing page vs dashboard)
    layout.tsx            # Root layout, Toaster
    api/                  # All API routes (auth, posts, connections, messages, local-prices, etc.)
  components/
    social/               # All UI components (header, sidebars, tabs, modals)
  lib/
    db.ts                 # Prisma client
    session.ts            # Cookie-based session helpers
    types.ts              # Shared TypeScript interfaces
    utils.ts              # cn() helper
scripts/
  seed.ts                 # Database reset script (clears all demo data)
```

## Auth

- `POST /api/auth/register` - Create a Personal or Company account (bcrypt-hashed password, session cookie set)
- `POST /api/auth/login` - Sign in
- `POST /api/auth/logout` - Sign out
- `GET /api/auth/me` - Get the currently authenticated user

## Local price posts

- `GET /api/local-prices` - List with filters (country, city, category, sort, search)
- `POST /api/local-prices` - Create a new local price post
- `GET /api/local-prices/[id]` - Get single post
- `DELETE /api/local-prices/[id]` - Delete own post
- `POST /api/local-prices/[id]/vote` - Toggle HELPFUL / NOT_ACCURATE
- `POST /api/local-prices/[id]/report` - Report incorrect price, outdated info, fake post, etc.
- `GET /api/local-prices/consensus` - Aggregated price range from multiple local reports
- `GET /api/local-prices/history` - Time-windowed price history
- `GET /api/local-prices/filters` - Available countries, cities, categories
- `GET /api/local-profiles/[id]` - Local contributor profile

## License

This project is proprietary. All rights reserved.
