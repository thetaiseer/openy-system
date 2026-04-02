-- ============================================================
-- OPENY — Supabase Database Schema
-- ============================================================
-- Run this script once in your Supabase project:
--   Dashboard → SQL Editor → New query → paste → Run
--
-- All tables use a single JSONB `data` column so the app can
-- store any record shape without schema migrations.
-- The `id` column mirrors the record's own `id` field and
-- acts as the primary key for upserts.
--
-- Storage bucket for exported files (PDF / Excel / Word):
--   Dashboard → Storage → New bucket → name: "exports" → Public bucket: ON
-- The app uploads to paths like:  invoices/<timestamp>-<uid>-<filename>
-- ============================================================

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id         TEXT        PRIMARY KEY,
    data       JSONB       NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quotations
CREATE TABLE IF NOT EXISTS quotations (
    id         TEXT        PRIMARY KEY,
    data       JSONB       NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Client Contracts
CREATE TABLE IF NOT EXISTS client_contracts (
    id         TEXT        PRIMARY KEY,
    data       JSONB       NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HR Contracts
CREATE TABLE IF NOT EXISTS hr_contracts (
    id         TEXT        PRIMARY KEY,
    data       JSONB       NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
    id         TEXT        PRIMARY KEY,
    data       JSONB       NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Salary History
CREATE TABLE IF NOT EXISTS salary_history (
    id         TEXT        PRIMARY KEY,
    data       JSONB       NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
    id         TEXT        PRIMARY KEY,
    data       JSONB       NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounting Ledger
CREATE TABLE IF NOT EXISTS acct_ledger (
    id         TEXT        PRIMARY KEY,
    data       JSONB       NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounting Expenses
CREATE TABLE IF NOT EXISTS acct_expenses (
    id         TEXT        PRIMARY KEY,
    data       JSONB       NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy: Client Collections (backward-compatibility only)
CREATE TABLE IF NOT EXISTS acct_client_collections (
    id         TEXT        PRIMARY KEY,
    data       JSONB       NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy: Egypt Collections (backward-compatibility only)
CREATE TABLE IF NOT EXISTS acct_egypt_collections (
    id         TEXT        PRIMARY KEY,
    data       JSONB       NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy: Captain Collections (backward-compatibility only)
CREATE TABLE IF NOT EXISTS acct_captain_collections (
    id         TEXT        PRIMARY KEY,
    data       JSONB       NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Optional: auto-update `updated_at` on every row change
-- Requires the moddatetime extension (enabled by default in
-- Supabase — run once if not already enabled):
-- ============================================================
-- CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;
--
-- CREATE OR REPLACE TRIGGER set_updated_at_invoices
--     BEFORE UPDATE ON invoices
--     FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);
--
-- (Repeat the trigger block for each table as needed.)
-- ============================================================

-- ============================================================
-- Optional: Row-Level Security
-- Uncomment after confirming the app works, then add policies
-- that match your auth setup.
-- ============================================================
-- ALTER TABLE invoices              ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE quotations            ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE client_contracts      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE hr_contracts          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE employees             ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE salary_history        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE activity_logs         ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE acct_ledger           ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE acct_expenses         ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE acct_client_collections   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE acct_egypt_collections    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE acct_captain_collections  ENABLE ROW LEVEL SECURITY;
