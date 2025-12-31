#!/bin/sh

echo "Backup scheduler entrypoint started."
# --- ADD THIS BLOCK ---
# Wait for 5 seconds to give the db and api services time to fully initialize
# after their healthchecks have passed. This prevents startup race conditions.
echo "Waiting for 5 seconds for other services to settle..."
sleep 20

echo "The first backup will run immediately, then once every 24 hours."

# This is an infinite loop
while true; do
  # Run the main backup script
  /bin/bash /app/backup.sh

  # Sleep for 24 hours (86400 seconds) before the next run
  echo "Backup finished. Next run is scheduled in 24 hours."
  sleep 86400
done