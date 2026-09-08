# Manual SQL

SQL that must NOT run automatically as part of `prisma migrate deploy`.

Anything in here is destructive and depends on a data migration having already
completed. Promote a file to `prisma/migrations/` only once its precondition is
verified on the target database.
