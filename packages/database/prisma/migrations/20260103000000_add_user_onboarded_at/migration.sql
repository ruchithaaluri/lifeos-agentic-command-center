-- Add onboarding state for first-login workspace provisioning.
ALTER TABLE "users" ADD COLUMN "onboarded_at" TIMESTAMP(3);
