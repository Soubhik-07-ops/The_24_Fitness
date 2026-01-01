-- Fix foreign key constraint issue for offers table
-- Run this if you already created the offers table with the foreign key constraint
-- Drop the existing foreign key constraint
ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_created_by_fkey;
-- The created_by column will remain as UUID but without foreign key constraint
-- This allows storing admin IDs from the admins table without requiring them to exist in auth.users