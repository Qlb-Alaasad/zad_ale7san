-- Make start_time and end_time nullable on sessions table
ALTER TABLE public.sessions ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE public.sessions ALTER COLUMN end_time DROP NOT NULL;