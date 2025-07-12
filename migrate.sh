#!/bin/sh

# This script is the entrypoint for the Next.js application container.
# It ensures the database is ready and applies schema before starting the app.

echo "Waiting for MySQL database at db:3306 to be ready..."

# Use wait-for-it.sh to ensure the database service is up and accepting connections.
/usr/bin/wait-for-it.sh db:3306 --timeout=60 --strict -- echo "MySQL is up and running!"

echo "Checking if database schema exists..."

# Query INFORMATION_SCHEMA to check for the existence of the 'users' table
# This is more robust as it doesn't try to query data, just metadata.
# We expect to get '1' if the table exists, and '0' if it doesn't.
# We redirect stderr to /dev/null to hide connection errors, but keep stdout to capture the count.
TABLE_EXISTS_COUNT=$(mariadb -h db --user="${DB_USER}" --password="${DB_PASSWORD}" --database="${DB_NAME}" -Nbe "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${DB_NAME}' AND TABLE_NAME = 'users';" 2>/dev/null)

# Check the result of the count query.
# If TABLE_EXISTS_COUNT is '1', the table exists.
# If TABLE_EXISTS_COUNT is '0', the table does not exist.
# If the mariadb command itself failed (e.g., connection issue), TABLE_EXISTS_COUNT might be empty or not '1'.
# We check if it's explicitly '1' for success.
if [ "$TABLE_EXISTS_COUNT" -ne 1 ]; then
    echo "Database schema not found (or table 'users' does not exist). Applying initial schema from /app/schema.sql..."
    # Execute the schema.sql file against the database using the 'mariadb' command.
    mariadb -h db --user="${DB_USER}" --password="${DB_PASSWORD}" --database="${DB_NAME}" --ssl-verify-server-cert=0 --default-auth=mysql_native_password < /app/schema.sql

    if [ $? -eq 0 ]; then
        echo "Database schema applied successfully."
    else
        echo "Error applying database schema. Exiting."
        exit 1 # Exit with an error code to stop the container from looping
    fi
else
    echo "Database schema (table 'users') already exists. Skipping schema application."
fi

echo "Starting Next.js application..."

# Start the Next.js server.
node server.js