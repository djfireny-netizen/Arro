#!/bin/bash
# One-time setup: create a bare server repository for deployment through git push.
# Usage: bash deploy/git部署-初始化.sh from the project directory; enter an SSH password if requested.
set -e
. "$(dirname "$0")/_load-config.sh"
SRV=$SERVER
LOCAL_ENV="$PROJECT_DIR/.env"
# Create a missing local evaluation credential and configure the server with the same value without displaying it.
T=$(grep '^EVAL_TOKEN=' "$LOCAL_ENV" 2>/dev/null | cut -d= -f2)
if [ -z "$T" ]; then T=$(openssl rand -hex 16); printf '\nEVAL_TOKEN=%s\n' "$T" >> "$LOCAL_ENV"; fi
ssh -o StrictHostKeyChecking=accept-new $SRV "EVAL_TOKEN=$T bash -s" <<'REMOTE'
set -e
E=/srv/shiyin/.env
if ! grep -q '^EVAL_TOKEN=' $E; then cp -a $E /root/shiyin.env.bak-$(date +%Y%m%d%H%M%S); echo "EVAL_TOKEN=$EVAL_TOKEN" >> $E; echo "✓ Evaluation credential written to the server .env; restart to apply."; fi
command -v git >/dev/null || dnf install -y git
mkdir -p /srv/shiyin.git && cd /srv/shiyin.git
[ -f HEAD ] || git init -q --bare -b main
cat > hooks/post-receive <<'HOOK'
#!/bin/bash
# On push: check out into /srv/shiyin, preserve .env, restart, and check health; roll back on failure.
set -e
while read old new ref; do
  [ "$ref" = "refs/heads/main" ] || { echo "Only main is deployed; ignoring $ref"; continue; }
  W=/srv/shiyin
  echo "→ Deploying $(git log -1 --format='%h %s' $new)"
  git --work-tree=$W --git-dir=/srv/shiyin.git checkout -f main
  chown -R nginx:nginx $W
  systemctl restart shiyin; sleep 2
  if systemctl is-active -q shiyin && curl -sf -o /dev/null http://127.0.0.1:5178/api/health; then
    echo "✓ Arro restarted and passed the health check."
    echo "$new $(date '+%F %T')" >> /srv/shiyin.git/上线记录.txt
  else
    echo "!! Startup failed; rolling back to $old"
    journalctl -u shiyin -n 20 --no-pager
    if [ "$old" != "0000000000000000000000000000000000000000" ]; then
      git --git-dir=/srv/shiyin.git update-ref refs/heads/main $old
      git --work-tree=$W --git-dir=/srv/shiyin.git checkout -f main
      chown -R nginx:nginx $W; systemctl restart shiyin
    fi
    exit 1
  fi
done
HOOK
chmod +x hooks/post-receive
echo "✓ Server deployment repository ready: /srv/shiyin.git"
REMOTE
cd "$PROJECT_DIR"
git remote get-url server >/dev/null 2>&1 || git remote add server $SRV:/srv/shiyin.git
echo "✓ Local server remote configured. Deploy with: bash deploy/上线.sh"
