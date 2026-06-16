#!/bin/bash
# Genesys HRMS — SQLite online backup (stop-free).
# Usage: ./scripts/backup.sh [DB_PATH] [BACKUP_DIR]
#   DB_PATH   defaults to ./data/hrms.db
#   BACKUP_DIR defaults to ./backups
# Keeps the latest 30 backups.

set -euo pipefail

DB_PATH="${1:-./data/hrms.db}"
BACKUP_DIR="${2:-./backups}"
KEEP=30

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: Database not found at $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/hrms-${TIMESTAMP}.db"

echo "Backing up $DB_PATH → $BACKUP_FILE ..."

# Use SQLite's .backup command (online, no locking)
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

if [ -f "$BACKUP_FILE" ]; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "✓ Backup complete: $BACKUP_FILE ($SIZE)"
else
  echo "ERROR: Backup file was not created"
  exit 1
fi

# Prune old backups (keep latest $KEEP)
TOTAL=$(ls -1 "$BACKUP_DIR"/hrms-*.db 2>/dev/null | wc -l)
if [ "$TOTAL" -gt "$KEEP" ]; then
  REMOVE=$((TOTAL - KEEP))
  ls -1t "$BACKUP_DIR"/hrms-*.db | tail -n "$REMOVE" | while read f; do
    echo "  Pruning old backup: $f"
    rm -f "$f"
  done
  echo "✓ Pruned $REMOVE old backup(s), keeping latest $KEEP"
fi

echo "Done."
