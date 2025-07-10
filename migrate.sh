#!/bin/sh

# This script is the entrypoint for the Next.js application container.
# It ensures the database is ready and applies schema before starting the app.

echo "Waiting for MySQL database at db:3306 to be ready..."

# Use wait-for-it.sh to ensure the database service is up and accepting connections.
# This is crucial to prevent the Next.js app from trying to connect before MySQL is ready.
# --timeout=60: Wait for up to 60 seconds.
# --strict: Exit immediately if wait-for-it.sh fails to connect within the timeout.
/usr/bin/wait-for-it.sh db:3306 --timeout=60 --strict -- echo "MySQL is up and running!"

echo "Applying database schema from /app/schema.sql..."

# Execute the schema.sql file against the database.
# -h db: Connects to the 'db' service (your MySQL container) within the Docker Compose network.
# -u ${DB_USER}: Uses the DB_USER environment variable.
# -p${DB_PASSWORD}: Uses the DB_PASSWORD environment variable (no space after -p for security).
# ${DB_NAME}: Connects to the specific database name.
# < /app/schema.sql: Pipes the schema.sql file's content as input to the mysql client.
mysql -h db -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} < /app/schema.sql

if [ $? -eq 0 ]; then
  echo "Database schema applied successfully."
else
  echo "Error applying database schema. Exiting."
  exit 1
fi

echo "Starting Next.js application..."

# Start the Next.js server.
# This command is based on the 'output: standalone' configuration in next.config.js.
node server.js