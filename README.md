# KLOR POKER — Multiplayer Texas Hold'em Prototype

**Playable demo with virtual credits, not a production real-money gambling platform.** Node.js 20+, no npm dependencies. The interface recreates the emerald / black / gold feel of the reference design using responsive CSS and includes the original reference PNG in `public/design-reference.png`.

## Launch

```bash
cd baron-poker
npm test
# Linux/macOS: export CENTER_PASSWORD='your-long-private-password'
# PowerShell: $env:CENTER_PASSWORD='your-long-private-password'
npm start
```

Open http://localhost:3000. First-run center username is **center**. If `CENTER_PASSWORD` is not set, a random temporary password is generated and printed once in the server log. Once created, `data/state.json` stores its salted password hash; changing the environment variable alone does not reset it.

## How to play multiplayer

1. Log in as Center and open **Control center**. Create one Admin; log in as that Admin (separate browser/incognito), create an Agent. Log in as the Agent and create two or more Users.
2. Fund the Admin with virtual credits; Admin funds Agent; Agent funds Users. Each Player uses a separate browser profile/device. Two users sit at the same table and select buy-ins.
3. Press **Deal next hand**. Players act in turn with Fold / Check / Call / Raise. The server keeps opponent hole cards private until showdown and settles the result.
4. Center can change the rake rate (0–15%) and hand cap, create tables, view transfers and rake records.

## Supported

- 6-max no-limit Hold'em; shuffled 52-card deck via `crypto.randomInt`; hole cards; flop/turn/river; blinds; rotating dealer; betting; folds; calls; raises; all-in; turn order; hand evaluation (including wheel); side pots; ties and odd chip distribution; rake cap, no flop/no drop.
- Server-side game authority; authenticated users and role hierarchy: Center → Admin → Agent → User; virtual-credit wallet transfers; table lobby; hand event history; polling-based state updates (1.3 seconds); multi-table in a single Node process.

## Important limitations / required before production

- **Play credits only. No deposits/withdrawals or real-money payouts.** Explicit licensing, AML/KYC, age checks, responsible gaming, jurisdiction restrictions, tax reporting and independent game certification are required for regulated operations.
- Live hands remain in RAM. Wallet debits, table stacks and active contributions are checkpointed together. On restart, persisted stacks and unfinished-hand contributions return to wallets; the hand is cancelled and players rejoin through the lobby. This file snapshot is not a transactional database. This is a prototype and must not be used with real stakes.
- Single process, in-memory sessions, no distributed pub/sub, no distributed reconnect policies, no anti-collusion, no audit-grade append-only ledger, no fraud engine or secure operator accounting. Use PostgreSQL for durable double-entry accounting, Redis for presence and room routing, TLS, centralized logs, backups, monitoring, queues, load tests and an audited distributed hand service before scale-up.
- Raise reopening and incomplete all-in raise edge cases require formal rule-engine validation prior to production. Other unimplemented features: tournaments, MTT/SNG, multi-currency, reservations, rakeback distribution, player statistics, chat moderation, waitlists, explicit sit-out, full hand resumption after restart, hand replayer.
- The account hierarchy has **direct-child** management only (Center creates Admin, Admin creates Agent, Agent creates User). Credit transfer uses virtual chips. Keep the default password private and disable it on any hosted server.

## Files

- `server.js`: Node HTTP API / authentication / balances / persistence.
- `game.js`: Hold'em table engine (blinds, betting rules, showdown order, sit-out, leave, timers, snapshots).
- `poker.js`: deck, evaluator, side pots and rake logic.
- `rules.test.js`: deterministic rule scenarios for the engine.
- `public/`: responsive UI.
- `poker.test.js`: unit tests.


## Login troubleshooting
If Enter appears to do nothing, check the on-screen error message. The login error toast is now visible on the login screen. If you previously ran the old ZIP, the password was saved in `data/state.json` and changing `CENTER_PASSWORD` afterward does not modify it. For a **new demo only**, shut down the server, delete `data/state.json` (deletes all demo accounts and balances), set `CENTER_PASSWORD` in the same PowerShell window, and run `npm start`.


## Updated player flow and management

- Center, Admin and Agent enter their own role-labelled management panel. Only Center configures rake and tables. Each operator creates and funds direct subordinates and sees their own transfer records; Center sees the global ledger.
- Players enter the lobby. A zero wallet blocks opening any unseated table on both client and server. Already seated players retain access when their wallet is zero because their chips are on the table.
- One player may occupy only one table. Buy-ins are listed per table (minimum 20 or 10 big blinds; maximum 1000 or 100 big blinds, whichever is greater).
- When a completed hand leaves a player below one big blind, the result remains unobstructed for eight seconds; the player then receives a full 30 seconds to add chips from their virtual wallet. A modal shows the remaining time; an Agent can fund the wallet during that interval. At expiry the seat is removed and any residual chips return to the wallet. Zero chips during an active all-in do not trigger removal before settlement.
- Turns allow 30 seconds, then the server auto-folds. Two consecutive inactive hands cause removal before the third hand; remaining table chips return to the wallet. A valid manual action resets this counter. Hands start automatically after a eight-second between-hand pause with at least two eligible players. Manual deal remains available.
- Incomplete all-in raises do not reopen raising for players who have already acted. Opponent cards remain private on a fold win. Unmatched contributions return without rake. Rake goes to the Center wallet; buy-in, rebuy and voluntary cash-out have ledger entries.
- Rebuy and chip transfers are virtual-credit operations, not payment processing.

Validation: `npm test`. If process spawning is restricted, use `node --test --experimental-test-isolation=none`. Integration tests use an isolated temporary database and exercise the real 30-second server timer.

See [ANALIZA.md](ANALIZA.md) for the functional assessment and remaining limitations.


## Table presentation

CSS/SVG ceramic chip stacks, event-based chip flights and payout animations, larger cards, server-selected best-five winner highlights, per-winner side-pot selection, continuous server-synced avatar timer, optional synthesized sounds, reduced-motion toggle, fullscreen, all-in and pot-sized raise presets. Visual helpers live in `public/table-visuals.js` and `public/table.css`.

Browser verification: start a separate headless Chrome with remote debugging on port 9228, then run `node tools/check-table-browser.mjs`. Set `PREVIEW_ORIGIN` or `CHROME_DEBUG` if needed. The script injects isolated API fixtures into its own tab, verifies real DOM behavior and writes screenshots under `artifacts/`; it does not create accounts or change real balances.


The responsive table resizes the felt to available width without scaling text, avatars or cards. Short screens scroll vertically to preserve legibility; results and actions keep their normal layout. History opens in a scrollable overlay. Central suit symbols are SVG paths with explicit geometric centering; ranks remain in the standard corners. Server-side inactivity tests exercise free-check timeout folding, manual activity reset, removal before another blind, and full stack return.


The felt geometry now preserves a 2.3:1 racetrack shape on wide screens and a 0.9:1 rounded rectangle on portrait phones. A ResizeObserver sizes only the felt against the measured free scene, keeping native card and text sizes. Short phone/landscape windows retain a readable minimum scene with vertical scrolling.


## Rake reporting

Center, Admin and Agent have a Rake page and an overview total. `/api/rake/report` is staff-only: Center sees global rake, Admin and Agent see only the rake attributed to players in their descendant tree. Each pot splits its rake evenly between its contributors, with remaining cents assigned in seat order; unmatched refunds contribute zero. Per-hand allocations are persisted once in the rake ledger. Rake rounds down once against the cumulative contested pot, so splitting into side pots cannot lose fractional cents; the cap applies to the entire hand. Reports show all-time totals, today in Europe/Berlin, hand count, current settings and the last 100 matching hands, updated immediately after settlement through an authenticated SSE stream, with automatic reconnection. Center alone changes settings and receives the existing wallet credit; reports do not create additional wallet credits. Historical entries without allocations remain global-only, explicitly labelled, rather than inventing a hierarchy split. Player API snapshots omit rake settings and accounting fields. Browser check: `node tools/check-rake-browser.mjs` using the isolated Chrome session described above.

Chip deposit dialogs include a 0-to-wallet-credit slider synchronized with the numeric input. Wallet changes update the range while preserving the selection where possible. Table buy-in limits still apply; invalid or zero amounts disable confirmation. Both voluntary top-up and the timed rebuy dialog use the same controls.


## Hold'em rules update

Timeouts check when free and fold otherwise; odd chips go to the first winner left of the button; cumulative short all-ins reopen raising (TDA); showdown follows the last river aggressor and auto-mucks beaten hands unless someone is all-in; leaving mid-hand folds and cashes out at settlement; players may join a running game and post a live big blind (the button skips them); sit-out toggle with a 10-minute limit; dead money from out-of-turn folds goes to the remaining players; BET vs RAISE labels. UI: SB/BB badges, live side pots, Albanian hand descriptions, pre-action checkboxes, show-cards button, hand-rankings dialog. New endpoints: `POST /api/table/:id/sitout {value}` and `POST /api/table/:id/show`; `leave` returns `{pending:true}` when the exit happens at the end of the hand. See ANALIZA.md for details.

## Table redesign and all-in runout

All-in runouts are dealt by the server clock: hands are tabled, then flop, turn and river arrive with pauses before the showdown. Pots with identical contenders merge, so a folded blind no longer creates a phantom side pot. `public/table.css` is a new, self-contained game-view stylesheet; the felt is sized by `feltBox()` and seats by `seatLayout()` in `public/table-visuals.js`. The action dock has a fixed height and stays in view; phones get a portrait table, and phones in landscape get a right-hand action column. Animations: bets to the bet spot, collection into the pot, flips on reveal, and pot-by-pot payouts to the winners. New endpoints: `POST /api/table/:id/timebank` and `POST /api/table/:id/chat {text}`. Keyboard: F fold, C check/call, R bet/raise.


## Deploying with Coolify (or any container host)
Accounts and balances live in `data/state.json`, which is **not** in Git. Containers lose their files on every deploy, so give the app persistent storage:
1. Coolify → the application → **Persistent Storage** → add a volume, e.g. name `klorpoker-data`, destination `/data`.
2. **Environment Variables** → `STATE_FILE=/data/state.json` (and optionally `CENTER_PASSWORD` for a brand-new database).
3. Redeploy. To restore an existing database, copy `state.json` into the volume (Coolify → Terminal) and restart.
