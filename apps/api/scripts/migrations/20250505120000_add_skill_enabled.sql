-- Migration: 20250505120000_add_skill_enabled
-- Description: Add enabled field to skills table for admin toggle functionality
-- Author: Claude
-- Date: 2025-05-05

-- Add enabled column to skills table
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;

-- Create index for faster filtering by enabled status
CREATE INDEX IF NOT EXISTS "skills_enabled_idx" ON "skills"("enabled");
