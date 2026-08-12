-- Safe migration: add is_featured to public.prompts without affecting existing data
-- Run this in Supabase SQL Editor

ALTER TABLE public.prompts
ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
