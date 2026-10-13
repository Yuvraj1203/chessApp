# Kingdom of Chess — live tournament module

Coaches run tournaments; students join, get auto-matched, and play each other on a real-time board with a shared, server-owned clock. Results feed a leaderboard.

| | |
|---|---|
| Backend | NestJS 11 (strict TS), Drizzle ORM + PostgreSQL, Socket.IO, class-validator, `chess.js` |
| Frontend | Next.js (App Router) + React 19, Tailwind + shadcn/ui, TanStack Query, Socket.IO client, `chess.js` + `react-chessboard` |

```
backend/    NestJS API + Socket.IO gateway + Drizzle schema/migrations/seed
frontend/   Next.js app
docker-compose.yml
```

## Setup

### Option A — Docker (one command)

```bash
docker compose up --build              # Postgres + API (runs migrations) + web
docker compose exec backend npm run db:seed
```
Open http://localhost:3000. *(Compose files were written but not executed on the machine this was developed on — Docker wasn't installed there; Option B is the verified path.)*

### Option B — local

Prereqs: Node 20+, a Postgres (local, Docker, or a Supabase/Neon free tier).

```bash
# 1) Database — either
docker run -d --name koc-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=kingdom_of_chess postgres:16-alpine
# or use any hosted Postgres URL (the Supabase pooler on :6543 works)

# 2) Backend
cd backend
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm install
npm run db:migrate            # applies ./drizzle migrations
npm run db:seed               # 1 coach + 6 students + 3 tournaments (idempotent)
npm run start:dev             # http://localhost:4000/api/v1

# 3) Frontend (new terminal)
cd frontend
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:3000
```

Tests: `cd backend && npm test` (28 unit tests). `npm run db:reset` (dev only) clears all matches and re-opens tournaments.

### Seed credentials (password for all: `Password123!`)

| Role | Email |
|---|---|
| Coach | coach@kingdomofchess.com |
| Student | aarav@ · diya@ · vihaan@ · ananya@ · rohan@ · ishita@ `kingdomofchess.com` |

## How to play a match locally

1. Open two **separate browser profiles** (or one normal + one private window — the session is a cookie shared per browser) at http://localhost:3000.
2. Window 1: sign in as `aarav@…`; window 2: `diya@…`.
3. In both, open **Summer Blitz Open** → *Join tournament* → *Find opponent*.
4. The second click pairs you; both browsers jump to the board. Drag pieces; moves, clocks and the PGN panel update on both sides.
5. End the game (checkmate / resign / draw offer / run a clock out), then press *Find next opponent*. Round-robin tournaments (default) won't re-pair the same two players; switch on **Allow rematches** (the seeded *Rapid Rumble 5+3* has it on) to play repeatedly with two accounts.
6. Coach (`coach@…`) can open any live match to spectate (read-only), start/complete tournaments, add participants, and see stats.

## API

Everything is under `/api/v1` (URI versioning). Success: `{ "success": true, "data": … }`. Error: `{ "success": false, "error": { "statusCode", "error", "message", "details?" }, "path", "timestamp" }`. Auth is a JWT in an **httpOnly** cookie (`koc_token`).

| Method & path | Who | Notes |
|---|---|---|
| `POST /auth/login` · `POST /auth/logout` | public | login sets the cookie |
| `GET /me` | any | user + `activeMatchId` |
| `GET /tournaments?status=&mine=` | any | students never see drafts |
| `POST /tournaments` · `PATCH /:id` · `DELETE /:id` | coach | status moves forward only: draft→open→ongoing→completed |
| `POST /tournaments/:id/join` | student | only while `open` |
| `POST /tournaments/:id/participants` · `DELETE …/:userId` | coach | add/remove students |
| `GET /tournaments/:id` · `/leaderboard` · `/matches` | any | |
| `GET /tournaments/:id/stats` | coach | totals, W/B/D split |
| `GET /users/students` | coach | |
| `GET /matches/mine` · `GET /matches/:id` | any / player or coach | history / snapshot |

## Socket.IO events

The handshake is authenticated from the same cookie (no valid JWT ⇒ connection refused). Every client→server event is acked as `{ ok: true, data }` or `{ ok: false, error }`.

**Client → server**

| Event | Payload | Notes |
|---|---|---|
| `queue:join` | `{ tournamentId }` | students; must be a participant, not mid-game |
| `queue:leave` | `{ tournamentId }` | |
| `tournament:watch` / `tournament:unwatch` | `{ tournamentId }` | live leaderboard refresh |
| `match:join` | `{ matchId }` | **only the two players or a coach** are admitted; ack returns the full snapshot — used on first load *and* after refresh/reconnect |
| `match:leave` | `{ matchId }` | |
| `match:move` | `{ matchId, from, to, promotion? }` | validated by the server |
| `match:resign` | `{ matchId }` | |
| `match:draw:offer` | `{ matchId }` | |
| `match:draw:respond` | `{ matchId, accept }` | |

**Server → client**

| Event | Payload | Sent to |
|---|---|---|
| `queue:status` | `{ tournamentId, queued }` | the user |
| `match:found` | `{ matchId, tournamentId, color, opponent }` | both paired players (client navigates to the board) |
| `match:state` | `MatchSnapshot` (fen, pgn, turn, whiteMs, blackMs, running, drawOffer, …, serverTime) | match room, after every move / draw offer |
| `match:ended` | `MatchSnapshot` + `result`, `endReason`, full PGN | match room and both players |
| `tournament:updated` | `{ tournamentId }` | tournament room (clients refetch via TanStack Query) |

## Decisions & trade-offs

**Server-authoritative game.** Clients send move *intents*; the server validates turn + legality with `chess.js`, applies it, and broadcasts a snapshot. The client's own `chess.js` check is only for instant feedback. A tampered client cannot move out of turn, make an illegal move, or change a clock.

**Clock.** The server stores each side's remaining time *as of* `turnStartedAt`; the running side's elapsed time is derived on demand. A server timer fires at the moment the mover's time runs out and ends the game (`timeout`). Clients get the remaining ms of both sides with every snapshot and merely tick locally between snapshots, so both players converge on the same numbers on every move (residual difference = network latency). Increments (`5+3`) are supported. Clocks start when the match is created (white's clock runs until white moves), which is simple and fair enough here; the usual "clock starts after the first moves" rule would need an abort path.

**Persistence & reconnection.** Every move persists `fen`/PGN/clocks. Refreshing the page, dropping the connection, or restarting the API restores the game: on boot active matches are reloaded and their timers rescheduled; `match:join` returns the snapshot. A disconnected player's clock keeps running (they can lose on time) — no abandonment grace period.

**Never double-booked.** Three layers: (1) a user sits in at most one queue; (2) pairing runs inside a per-tournament critical section and removes both players from the queue *before* the async create; (3) the DB is the final judge — `match_players` has a **partial unique index** on `user_id WHERE active`, so even a race or a second API instance can't create two live games for a player (the insert fails and the pair is released). Limits: the queue itself is in-memory, so with multiple API replicas you'd need a shared queue (Redis) and sticky/adapter-based Socket.IO. Fine for one process.

**Matchmaking.** Standings-based: of all eligible waiting pairs, pick the closest in points, FIFO on ties. In a round-robin tournament (default) pairs who already met (or are playing) are not eligible, so players who've played everyone simply wait. A queue entry is dropped when the user's last socket disconnects.

**Tournament lifecycle.** The coach controls `draft → open → ongoing → completed`. Students self-join only while `open`; the coach can still add students while `ongoing`. Queueing works in `open`/`ongoing`. In round-robin mode an `ongoing` tournament **auto-completes** when every pair has played and nothing is live; the coach can also complete it manually (blocked while games are in progress). Completing declares the winner = rank 1. Start time is informational: it isn't enforced as a gate (so demos aren't blocked by clocks).

**Scoring & tiebreak.** Win 1, draw ½, loss 0, computed from finished matches (a pure, unit-tested function). Order: points → wins → Sonneborn-Berger (sum of opponents' points weighted by your result) → name. Equal on all three ⇒ shared rank.

**Auth.** bcrypt passwords, JWT (7 days) in an httpOnly, `SameSite=Lax` cookie. A global guard authenticates every route unless `@Public()`, and a roles guard enforces `@Roles()`; the frontend mirrors this (Next `proxy.ts` redirects when there is no cookie, `RoleGate` and the `(app)` layout re-check via `GET /me`, coach-only UI isn't rendered for students). The proxy only checks cookie presence; the API is the real enforcement. Cookies are shared across ports on `localhost`; in production put web and API on the same site (e.g. `app.` / `api.` subdomains) or behind one origin.

**Standardised I/O.** A global interceptor wraps successes and a global exception filter wraps errors (validation errors become `details[]`). DTOs use class-validator with `whitelist` + `forbidNonWhitelisted`; socket payloads are validated with the same decorators.

**Frontend.** TanStack Query for REST with invalidation after every mutation (and on `tournament:updated` pushes); Socket.IO for live play. Loading skeletons, error alerts with retry, and empty states on every list. Dates render as `DD/MM/YYYY, HH:mm` in the viewer's timezone (stored as UTC `timestamptz`).

### Stretch goals covered
Server-authoritative state · reconnection (board + clock restored) · coach spectator mode · draw offers, threefold repetition, 50-move rule, insufficient material, increments · standings-based matchmaking · round-robin completion with declared winner · move-list navigation · DD/MM/YYYY + timezone handling.

### Known caveats / what I'd do next
- Pawn promotion auto-queens (no piece picker).
- Queue state is in-memory (see above); no rate limiting on login.
- Timeout awards a loss even if the opponent only has a bare king (FIDE would call it a draw).
- Unit tests cover the deterministic logic (scoring, join/queue rules, status transitions, move/turn/clock validation, repetition/stalemate/checkmate, pairing). Socket wiring and the UI were verified manually/with a browser script, not with automated tests; next step would be a Jest e2e suite with `socket.io-client`.
- Docker Compose is untested on the author's machine.
