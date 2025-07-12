#!/bin/sh

echo "Waiting for MySQL database at db:3306 to be ready..."

/usr/bin/wait-for-it.sh db:3306 --timeout=60 --strict -- echo "MySQL is up and running!"

echo "Applying database schema from /app/schema.sql (idempotent)..."

# Execute the schema.sql file. Because schema.sql now uses 'CREATE TABLE IF NOT EXISTS',
# it won't error if tables already exist. It will simply create them if they don't.
mariadb -h db --user="${DB_USER}" --password="${DB_PASSWORD}" --database="${DB_NAME}" --ssl-verify-server-cert=0 --default-auth=mysql_native_password < /app/schema.sql

if [ $? -eq 0 ]; then
    echo "Database schema applied successfully or already existed."
else
    echo "Error applying database schema. Exiting."
    exit 1 # Exit with an error code only if the mariadb command itself failed critically
fi

echo "Starting Next.js application..."

node server.js