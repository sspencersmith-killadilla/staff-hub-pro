-- Historical WorkPlanOS tenant-scope migration.
-- Superseded by 060_wpo_department_scope.sql before this feature went live.
-- Keep this file as a no-op so databases that have not applied 058 can proceed
-- directly from the original org_id schema to the department_id schema in 060.

select 1;
