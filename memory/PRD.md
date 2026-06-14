# Ledger — Personal Expense & Income Tracker

## Original Problem Statement
A web app that helps track monthly expenses and incomes (on different bank accounts, wallets and cash flow). For each item: name, date-of-purchase, unit price, quantity, billed amount, category, is_recurrent. Add RBAC for auth with MFA. Show spending trends, change in cost of unit prices over time, and help track recurrent expenses for budgeting.

## User Choices
- **Auth**: Emergent Google OAuth + app-level TOTP MFA (Google Authenticator/Authy) on top
- **RBAC roles**: Owner (full control), Editor (CRUD own data), Viewer (read-only)
- **Data scope**: each user sees only their own
- **Currency**: multi-currency, default INR
- **Charts**: Recharts (line + bar + pie)

## Architecture
- **Backend**: FastAPI + Motor (MongoDB async), pyotp for TOTP, qrcode for MFA enrollment, Emergent Auth `/session-data` exchange
- **Frontend**: React 19 + react-router 7 + Recharts + Shadcn UI + sonner
- **Auth**: httpOnly cookie `session_token` (7-day), Bearer fallback; per-request MFA gate (`mfa_verified` flag on session)
- **MongoDB collections**: `users`, `user_sessions`, `accounts`, `categories`, `transactions`

## What's Been Implemented (2026-02)
- Login with Emergent Google OAuth + AuthCallback (session_id → session_token exchange)
- TOTP MFA: setup (QR + base32), enable, verify on sign-in, disable
- RBAC: Owner-only `/api/users` & role mgmt; Editor/Owner can write; Viewer read-only
- Accounts CRUD with auto-computed `current_balance = opening + incomes − expenses + transfers_in − transfers_out`
- Categories CRUD (expense / income kinds, colors)
- Transactions CRUD with name, date, unit_price, quantity, billed_amount, category, account, is_recurrent + recurrence_period (weekly/monthly/yearly), notes, currency + fx_rate
- **Account-to-account transfers** with cross-currency FX rate field
- **Transaction search** (q param, name + notes, case-insensitive)
- **CSV bulk import** with template download & per-row error reporting
- **Per-category monthly budgets** with progress bars + over-budget alerts
- Dashboard: balance, monthly income/expense, recurring burn, 6-month line trend, top categories bar, recent activity table
- Analytics: trends (income vs expense bar), net cash flow line, category pie split, **unit-price drift charts per item** (≥2 data points), recurring expenses table with monthly-normalized burn
- Settings: profile, default currency, MFA enable/disable, RBAC user management (Owner only)
- Custom design: earthy organic theme (Chivo + Manrope + IBM Plex Mono), flat 1px borders, sharp control-room aesthetic

## Tests Status (iteration_1)
- Backend pytest: 22/22 passing (after HIGH-bug fix in analytics_trends for transfer type)
- Frontend Playwright: 23/27 passing — remaining 4 are spec naming mismatches, not real bugs
- Verified end-to-end: budgets, CSV import (2/2 rows), transfers (balances correct), search

## Backlog (Next Phase)
**P0**
- Bulk import transactions (CSV) for backfilling historical data
- Per-month budget targets per category with progress bars

**P1**
- Multi-currency conversion (currently each account holds its own currency, no FX)
- Transfer between accounts (currently only income/expense)
- Search transactions by name

**P2**
- Export PDF/CSV monthly statement
- Email digest of monthly spending
- Recurring transaction auto-creation (cron) — currently only tagged, not auto-created
- Forecast / projected balance based on recurring items

## Test Credentials
See `/app/memory/test_credentials.md`. App uses Google OAuth — no passwords. Seed test sessions via mongosh.
