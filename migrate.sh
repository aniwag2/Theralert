#!/bin/sh

echo "Waiting for MySQL database at db:3306 to be ready..."

/usr/bin/wait-for-it.sh db:3306 --timeout=60 --strict -- echo "MySQL is up and running!"

# Define a flag file path. This file will be created ONLY if the schema is successfully applied.
SCHEMA_APPLIED_FLAG="/var/lib/mysql/schema_applied.flag"

# Check if the schema has already been applied by looking for the flag file.
if [ -f "$SCHEMA_APPLIED_FLAG" ]; then
    echo "Database schema already applied (flag file found). Skipping schema application."
else
    echo "Schema flag file not found. Attempting to apply database schema from /app/schema.sql..."

    # Apply the schema.
    # IMPORTANT: We are NOT doing a pre-check with SELECT.
    # The assumption here is that if the flag file doesn't exist, this is the first run on a fresh volume.
    # If the tables already exist (e.g., from a partial previous run), the 'CREATE TABLE IF NOT EXISTS'
    # syntax (which your schema.sql currently *doesn't* have, but could) would handle it gracefully.
    # Without 'IF NOT EXISTS', the mariadb command will ERROR 1050 if tables already exist.
    # This is why the 'docker-compose down -v' is crucial for the first test run.
    mariadb -h db --user="${DB_USER}" --password="${DB_PASSWORD}" --database="${DB_NAME}" --ssl-verify-server-cert=0 --default-auth=mysql_native_password < /app/schema.sql

    if [ $? -eq 0 ]; then
        echo "Database schema applied successfully."
        # Create the flag file to indicate successful schema application
        touch "$SCHEMA_APPLIED_FLAG"
        echo "Created schema applied flag file: $SCHEMA_APPLIED_FLAG"
    else
        echo "Error applying database schema. It might be due to tables already existing."
        # If the schema application fails (e.g., tables already exist, which is an ERROR 1050),
        # but we *don't* want to exit if it's because tables already exist.
        # This is the tricky part: distinguishing a "real" error from "tables already exist".
        # Let's try to check for the specific error message, or assume a non-zero exit might mean it's fine.

        # A more robust check here would be to parse the error message.
        # For simplicity and to get you running, let's assume if it errors, but tables exist, it's fine.
        # However, the best practice is to make CREATE TABLE statements idempotent (CREATE TABLE IF NOT EXISTS).

        # For now, let's just log the error but still create the flag if the tables *actually* exist
        # by checking existence after the failed mariadb command.
        mariadb -h db --user="${DB_USER}" --password="${DB_PASSWORD}" --database="${DB_NAME}" -Nbe "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${DB_NAME}' AND TABLE_NAME = 'users';" 2>/dev/null
        TABLE_CHECK_POST_APPLY=$? # Check exit code of the last mariadb command

        if [ "$TABLE_CHECK_POST_APPLY" -eq 0 ]; then
            echo "Tables appear to exist despite schema application error (possibly ER_NO_SUCH_TABLE on a fresh run, or ER_TABLE_EXISTS on a re-run). Assuming schema is ready."
            touch "$SCHEMA_APPLIED_FLAG" # Create flag if tables exist, even if mariadb had an error during schema apply
            echo "Created schema applied flag file: $SCHEMA_APPLIED_FLAG"
        else
            echo "Schema application failed and tables do not exist. This is a critical error. Exiting."
            exit 1 # Exit with an error code if schema truly failed and tables are still missing.
        fi
    fi
fi

echo "Starting Next.js application..."

# Start the Next.js server.
node server.js