#!/bin/sh

# This script is the entrypoint for the Next.js application container.
# It ensures the database is ready and applies schema before starting the app.

echo "Waiting for MySQL database at db:3306 to be ready..."

# Use wait-for-it.sh to ensure the database service is up and accepting connections.
/usr/bin/wait-for-it.sh db:3306 --timeout=60 --strict -- echo "MySQL is up and running!"

echo "Applying database schema from /app/schema.sql..."

# Execute the schema.sql file against the database using the 'mariadb' command.
# Keep --ssl-verify-server-cert=0 for robustness, although mariadb client might be more forgiving.
# Keep --default-auth=mysql_native_password for clarity and explicit plugin use.
mariadb -h db -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} --ssl-verify-server-cert=0 --default-auth=mysql_native_password < /app/schema.sql

if [ $? -eq 0 ]; then
  echo "Database schema applied successfully."
else
  echo "Error applying database schema. Exiting."
  exit 1 # Exit with an error code to stop the container from looping
fi

echo "Starting Next.js application..."

# Start the Next.js server.
node server.js