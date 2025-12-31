#!/bin/bash

# This script is executed by the cron daemon inside the 'backup' Docker container.

# --- Configuration ---
DB_HOST="db"
# The API service name and port from your docker-compose.yml
API_URL="http://api:8000"

# --- Helper Function to Notify the API ---
notify_api() {
  EVENT_TYPE=$1
  MESSAGE=$2
  
  # Use curl to send a JSON payload to the API's broadcast endpoint.
  # The --max-time flag prevents the script from hanging if the API is down.
  curl --max-time 5 -X POST "$API_URL/system/broadcast-event" \
    -H "Content-Type: application/json" \
    -d "{\"type\": \"$EVENT_TYPE\", \"data\": {\"message\": \"$MESSAGE\"}}"
}

# --- Trap for Failures ---
# This command will run when the script exits, but only if it exits with an error.
trap 'notify_api "backup.failed" "Database backup failed unexpectedly."' ERR

# --- Main Logic ---
echo "Backup job started at: $(date)"
notify_api "backup.started" "Database backup in progress..."

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="$POSTGRES_DB-$TIMESTAMP.sql.gz"
FILE_PATH="/tmp/$FILENAME"

trap "rm -f '$FILE_PATH'" EXIT

echo "Dumping database: $POSTGRES_DB..."
export PGPASSWORD=$POSTGRES_PASSWORD
pg_dump -h "$DB_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c | gzip > "$FILE_PATH"

if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo "ERROR: pg_dump command failed. Backup aborted."
  # The ERR trap will handle the failure notification.
  exit 1
fi

echo "Uploading $FILENAME to bucket $R2_BUCKET..."
aws s3 cp "$FILE_PATH" "s3://$R2_BUCKET/$FILENAME" --endpoint-url "$R2_ENDPOINT_URL"

if [ $? -ne 0 ]; then
  echo "ERROR: S3 upload failed. Backup aborted."
  # The ERR trap will handle the failure notification.
  exit 1
fi

echo "Backup successful: $FILENAME has been uploaded to $R2_BUCKET."
notify_api "backup.finished" "Database backup complete."
echo "Backup job finished at: $(date)"