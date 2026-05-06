#!/bin/bash
# =============================================================================
# Arkon Document Backup Script
# =============================================================================
#
# Backs up the arkon-documents volume to a compressed archive.
# Designed for cron or manual execution.
#
# Usage:
#   ./scripts/backup-documents.sh [destination_dir]
#
# Examples:
#   ./scripts/backup-documents.sh                    # Backs up to ./backups/
#   ./scripts/backup-documents.sh /mnt/backup        # Backs up to /mnt/backup/
#   ./scripts/backup-documents.sh s3://bucket/path   # Backs up to S3 (requires aws cli)
#
# Environment:
#   BACKUP_RETENTION_DAYS  - Days to keep local backups (default: 30)
#   AWS_PROFILE            - AWS profile for S3 uploads (optional)
#
# =============================================================================

set -euo pipefail

# Configuration
VOLUME_NAME="arkon-workstation_arkon-documents"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="arkon-documents-${TIMESTAMP}.tar.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Destination (default to ./backups/)
DEST_DIR="${1:-./backups}"

# Determine backup type
if [[ "$DEST_DIR" == s3://* ]]; then
  BACKUP_TYPE="s3"
  S3_PATH="$DEST_DIR"
  DEST_DIR="/tmp/arkon-backup-$$"
  mkdir -p "$DEST_DIR"
else
  BACKUP_TYPE="local"
  mkdir -p "$DEST_DIR"
fi

BACKUP_PATH="$DEST_DIR/$BACKUP_NAME"

echo "==> Starting backup of $VOLUME_NAME"
echo "    Backup file: $BACKUP_NAME"
echo "    Destination: $DEST_DIR"

# Create backup using a temporary container
echo "==> Creating archive..."
docker run --rm \
  -v "${VOLUME_NAME}:/data:ro" \
  -v "$(realpath "$DEST_DIR"):/backup" \
  alpine:3.19 \
  sh -c "cd /data && tar czf /backup/${BACKUP_NAME} ."

BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
echo "==> Backup created: $BACKUP_NAME ($BACKUP_SIZE)"

# Upload to S3 if needed
if [[ "$BACKUP_TYPE" == "s3" ]]; then
  echo "==> Uploading to S3: $S3_PATH"
  aws s3 cp "$BACKUP_PATH" "${S3_PATH}/${BACKUP_NAME}"
  rm -f "$BACKUP_PATH"
  rmdir "$DEST_DIR" 2>/dev/null || true
  echo "==> Uploaded to S3"
else
  # Clean up old local backups
  echo "==> Cleaning up backups older than ${RETENTION_DAYS} days..."
  find "$DEST_DIR" -name "arkon-documents-*.tar.gz" -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

  BACKUP_COUNT=$(find "$DEST_DIR" -name "arkon-documents-*.tar.gz" | wc -l)
  echo "==> Local backups remaining: $BACKUP_COUNT"
fi

echo "==> Backup complete!"

# Verify backup integrity
echo "==> Verifying backup integrity..."
if [[ "$BACKUP_TYPE" == "local" ]]; then
  if tar tzf "$BACKUP_PATH" > /dev/null 2>&1; then
    echo "==> Backup verified successfully"
  else
    echo "!!! Backup verification failed!"
    exit 1
  fi
fi
