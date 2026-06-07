-- Migration: Add missing 'price' column to the jobs table
-- Run this in the Supabase SQL Editor if the database was created from the old schema.sql
-- (which lacked the price column).

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS price INTEGER NOT NULL DEFAULT 0;
