#!/bin/bash
set -e

RUN_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
CONFIG_FILE="$(realpath "$RUN_DIR/../config.ini" 2>/dev/null || echo "$RUN_DIR/../config.ini")"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Archivo de configuración no encontrado: $CONFIG_FILE"
    exit 1
fi

export RUN_BY_CRON='True'

SCRIPT_NAME=$(basename "${BASH_SOURCE[0]}" .sh)
LOGS_DIR="${RUN_DIR}/logs"
mkdir -p "$LOGS_DIR"

LOG_FILE="${LOGS_DIR}/${SCRIPT_NAME}.log"
ERR_FILE="${LOGS_DIR}/${SCRIPT_NAME}.err"

# Redirection for the whole script
exec 1>> "$LOG_FILE"
exec 2>> "$ERR_FILE"

echo "$(date): --- Starting station download process ---"

cd "$RUN_DIR"

# Prevent concurrent executions with a lock
LOCKFILE="/tmp/stations_download.lock"
exec 200>"$LOCKFILE"

if ! flock -n 200; then
    echo "$(date): Another instance is already running. Exiting."
    exit 0
fi

# Cleanup on exit
cleanup() {
    rm -f "$LOCKFILE"
}
trap cleanup EXIT

# Environment setup
source "$HOME"/.env_py3_10/bin/activate
VENV_PY="$HOME/.env_py3_10/bin/python"

# Run the downloader
time "$VENV_PY" download_stations_data.py --config "$CONFIG_FILE"

echo "$(date): --- Download process completed ---"
