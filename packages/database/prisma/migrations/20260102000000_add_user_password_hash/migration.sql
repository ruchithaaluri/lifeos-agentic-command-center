-- Add password hash storage for real (non-demo) accounts.
-- Nullable: demo and OAuth-only accounts have no local password.
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
