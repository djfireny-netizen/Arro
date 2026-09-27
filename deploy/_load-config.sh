# Shared deployment configuration loader: read deploy/config.sh.
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$DEPLOY_DIR")"
if [ ! -f "$DEPLOY_DIR/config.sh" ]; then
  echo "!! Missing configuration: run cp deploy/config.example.sh deploy/config.sh, then enter the server address and domains."; exit 1
fi
. "$DEPLOY_DIR/config.sh"
