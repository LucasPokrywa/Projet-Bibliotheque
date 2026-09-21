FROM postgres:18.6-trixie

COPY init.sql /docker-entrypoint-initdb.d/01-init.sql
COPY migrations/02-auth.sql /docker-entrypoint-initdb.d/02-auth.sql
COPY migrations/03-admin.sql /docker-entrypoint-initdb.d/03-admin.sql

EXPOSE 5432
