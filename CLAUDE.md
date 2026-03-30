# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Life Pulse** is a private web app that automatically aggregates content from a user's connected accounts (Apple Photos, Google Photos, Instagram, Facebook, Outlook, and others TBD) and generates a curated newsletter — daily, weekly, monthly, or on a custom cadence — summarising what the user has been up to, with highlights and descriptions of their life moments.

**Core purpose**: Keep geographically separated families and loved ones connected without the overhead of individual calls. Instead of calling 10 family members separately, a user sends one approved newsletter to a pre-authorised recipient list.

**Key features**:
- **Content aggregation**: Pull photos, posts, and activity from connected sources
- **AI-generated summaries**: Auto-generate newsletter content with descriptions and highlights
- **User approval flow**: All generated content must be reviewed and approved by the user before sending — nothing goes out automatically
- **Explicit content filtering**: Content must be screened to avoid anything explicit before it reaches the approval stage
- **Pre-authorised recipient list**: Users manage a list of trusted recipients (family/friends); newsletters only go to this list
- **Calendar-linked availability**: Users can share available call time slots (linked to their calendar) so recipients can book a call — reducing the need for repeated "when are you free?" coordination

## Tech Stack

- **Frontend**: React + Vite
- **Routing**: React Router (client-side)
- **Backend/DB**: Supabase (database + auth)
- **Auth**: GitHub OAuth via Supabase
- **Styling**: Tailwind CSS

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run preview   # Preview production build
```

Database migrations are managed with the Supabase CLI (already linked to the project):

```bash
npx supabase db execute --file supabase/migrations/<file>.sql   # Run a migration
npx supabase migration new <name>                                # Create a new migration file
```

## Architecture

- All database schema changes go in `supabase/migrations/` as SQL files — never ask the user to paste SQL into the Supabase dashboard manually.
- Auth state comes from Supabase; GitHub OAuth is already configured.
- Every protected route must verify an active Supabase session before rendering.

## Non-Negotiable Rules

- **RLS on every table**: All database tables must have Row Level Security enabled.
- **No cross-user data leakage**: RLS policies must ensure users can only access their own data.
- **Session checks on protected pages**: Always verify the Supabase session at the route level before rendering protected content.
- **Secrets in env vars**: All API keys, Supabase keys, and OAuth credentials go in `.env` (git-ignored), never hardcoded.
- **Migrations via CLI**: All database changes are written as SQL files in `supabase/migrations/` and applied with `npx supabase db execute`.
