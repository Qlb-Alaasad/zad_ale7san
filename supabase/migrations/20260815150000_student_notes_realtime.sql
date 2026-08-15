-- Enable realtime updates for student_notes so student portals refresh grades on note changes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'student_notes'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.student_notes;
    END IF;
  END IF;
END $$;
