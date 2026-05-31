-- Remove unused building year field from estimate projects
ALTER TABLE "estimate_projects" DROP COLUMN IF EXISTS "building_year";
