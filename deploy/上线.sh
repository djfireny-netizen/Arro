#!/bin/bash
# Deploy committed code to the server with restart, health check, and rollback, then push to GitHub.
# Usage: bash deploy/上线.sh from the project directory.
# Initialize once with deploy/git部署-初始化.sh.
set -e
. "$(dirname "$0")/_load-config.sh"
cd "$PROJECT_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "!! Uncommitted changes found. Commit them before deployment:"; git status --short; exit 1
fi
echo "1. Pushing to the server (SSH may request your password)"
git push server main
echo "2. Checking the deployed service"
printf "   Application → %s\n" "$(curl -s https://$APP_DOMAIN/ | grep -o '请输入邀请码' | head -1)"
printf "   Model → %s\n" "$(curl -s https://$APP_DOMAIN/api/health | grep -o '"model":"[^"]*"')"
if git remote get-url origin >/dev/null 2>&1; then
  echo "3. Pushing to GitHub"
  GIT_TERMINAL_PROMPT=0 git push -q origin main 2>/dev/null && echo "   Pushed to GitHub" || echo "   (GitHub push unavailable; skipped. Production deployment is unaffected.)"
fi
echo "✓ Complete: $(git log -1 --format='%h %s')"
