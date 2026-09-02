CREATE SEQUENCE "employee_number_seq" AS BIGINT;

SELECT setval(
  'employee_number_seq',
  GREATEST(
    10,
    COALESCE(
      (
        SELECT MAX(SUBSTRING("employeeId" FROM 5)::BIGINT)
        FROM "Employee"
        WHERE "employeeId" ~ '^EMP-[0-9]+$'
      ),
      0
    )
  ),
  true
);

CREATE FUNCTION next_employee_id() RETURNS TEXT
LANGUAGE SQL
VOLATILE
AS $$
  SELECT 'EMP-' || LPAD(nextval('employee_number_seq')::TEXT, 3, '0');
$$;

ALTER TABLE "Employee"
ALTER COLUMN "employeeId" SET DEFAULT next_employee_id();
