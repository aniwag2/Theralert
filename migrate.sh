#!/bin/sh

echo "Waiting for MySQL database at db:3306 to be ready..."

/usr/bin/wait-for-it.sh db:3306 --timeout=60 --strict -- echo "MySQL is up and running!"

# Check if the 'users' table exists. If it doesn't, apply the schema.
# Replace 'users' with any critical table that should always be present after schema initialization.
TABLE_EXISTS=$(mariadb -h db -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} -e "SHOW TABLES LIKE 'users';" 2>/dev/null)

if [ -z "$TABLE_EXISTS" ]; then
    echo "Database schema not found. Applying initial schema from /app/schema.sql..."
    mariadb -h db -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} --ssl-verify-server-cert=0 --default-auth=mysql_native_password < /app/schema.sql

    if [ $? -eq 0 ]; then
        echo "Database schema applied successfully."
    else
        echo "Error applying database schema. Exiting."
        exit 1
    fi
else
    echo "Database schema already exists. Skipping schema application."
fi

echo "Starting Next.js application..."
node server.js