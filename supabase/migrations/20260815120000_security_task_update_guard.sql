/*
# Security: restrict student task updates to delivery fields only
#
# Defense-in-depth alongside RLS tasks_student_update (auth.uid() = student_id).
# Admins may update any column; students cannot reassign or rewrite task metadata.
*/

CREATE OR REPLACE FUNCTION public.enforce_student_task_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.student_id THEN
    RAISE EXCEPTION 'Unauthorized task update';
  END IF;

  NEW.student_id := OLD.student_id;
  NEW.title := OLD.title;
  NEW.description := OLD.description;
  NEW.due_date := OLD.due_date;
  NEW.category_id := OLD.category_id;
  NEW.created_at := OLD.created_at;

  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('assigned', 'in_progress', 'submitted', 'completed') THEN
    RAISE EXCEPTION 'Invalid task status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_student_task_update ON public.tasks;
CREATE TRIGGER trg_enforce_student_task_update
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_student_task_update();
