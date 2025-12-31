# Use a newer version of Alpine that has PostgreSQL 16 tools
FROM alpine:3.20

# Install necessary tools
RUN apk add --no-cache \
    postgresql-client \
    aws-cli \
    gzip \
    bash \
    curl

# Create a working directory
RUN mkdir -p /app
WORKDIR /app

# Copy our backup script AND our new entrypoint script
COPY backup.sh .
COPY entrypoint.sh .

# Make both scripts executable
RUN chmod +x backup.sh
RUN chmod +x entrypoint.sh

# The command to start our scheduler loop when the container starts
CMD ["/app/entrypoint.sh"]