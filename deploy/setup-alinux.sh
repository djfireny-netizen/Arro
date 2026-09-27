#!/usr/bin/env bash
# Arro setup for Alibaba Cloud ECS running Alibaba Cloud Linux 3.
# Usage: place the code in /srv/shiyin, then run on the server:
#   sudo bash /srv/shiyin/deploy/setup-alinux.sh music.example.com
#   For mainland China registration text: ICP_NUMBER='YOUR_REGISTRATION_TEXT' sudo -E bash ...
# The setup script can be rerun after updating the code.
set -e
DOMAIN=${1:?Usage: setup-alinux.sh your-domain.example}
APP=/srv/shiyin
cd "$APP"

echo "== 0/5 Checking existing sites for conflicts"
if command -v ss >/dev/null; then
  OTHER=$(ss -ltnp 2>/dev/null | awk '$4 ~ /:(80|443)$/' | grep -v nginx || true)
  if [ -n "$OTHER" ]; then echo "!! Ports 80/443 are already occupied by another service:"; echo "$OTHER"; echo "Resolve the port conflict before deploying."; exit 1; fi
fi
if [ -d /etc/nginx ]; then
  CONFLICT=$(grep -rlsE "server_name[^;]*[[:space:]]$DOMAIN([[:space:];]|$)" /etc/nginx/conf.d /etc/nginx/nginx.conf /etc/nginx/sites-enabled 2>/dev/null | grep -v '/conf.d/shiyin.conf' || true)
  if [ -n "$CONFLICT" ]; then echo "!! $DOMAIN is already used in another Nginx configuration: $CONFLICT"; echo "To preserve the existing site, use a different subdomain, for example: bash $0 music.$DOMAIN"; exit 1; fi
fi

echo "== 1/5 Installing Node.js and Nginx"
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1 || true)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 18 ]; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  dnf install -y nodejs
fi
command -v nginx >/dev/null || dnf install -y nginx
node -v

echo "== 2/5 Configuring .env"
[ -f .env ] || cp .env.example .env
add() { grep -q "^$1=" .env || echo "$1=$2" >> .env; }
add HOST 127.0.0.1
add TRUST_PROXY 1
add ALLOWED_ORIGIN "https://$DOMAIN,https://www.$DOMAIN,http://$DOMAIN,http://www.$DOMAIN"
add RATE_LIMIT_PER_IP 10
add RATE_LIMIT_PER_DAY 300
add MAX_CONCURRENT 4
[ -n "$ICP_NUMBER" ] && add ICP_NUMBER "$ICP_NUMBER"
if ! grep -qE '^(DEEPSEEK_API_KEY|DASHSCOPE_API_KEY|ARK_API_KEY)=.+' .env; then
  echo "!! Model API credentials are missing. Run nano $APP/.env, configure PROVIDER and its key, then rerun this script."
fi
chown -R nginx:nginx "$APP"
chmod 600 .env

echo "== 3/5 Registering a system service with boot startup and automatic restart"
NODE_BIN=$(command -v node)
sed "s#User=www-data#User=nginx#; s#WorkingDirectory=.*#WorkingDirectory=$APP#; s#ExecStart=.*#ExecStart=$NODE_BIN server.mjs#" deploy/shiyin.service > /etc/systemd/system/shiyin.service
systemctl daemon-reload
systemctl enable shiyin >/dev/null 2>&1
systemctl restart shiyin
sleep 2
if ! curl -fsS http://127.0.0.1:5178/api/health; then echo; echo "!! Service startup failed. Recent logs:"; journalctl -u shiyin -n 30 --no-pager; exit 1; fi; echo

echo "== 4/5 Configuring Nginx"
LE=/etc/letsencrypt/live/$DOMAIN
use_https() {  # $1=certificate $2=private key
  sed "s/example.com/$DOMAIN/g; s#/etc/nginx/cert/$DOMAIN.pem#$1#; s#/etc/nginx/cert/$DOMAIN.key#$2#" deploy/nginx-https.conf > /etc/nginx/conf.d/shiyin.conf
  echo "Enabling HTTPS: $1"
}
if [ -f "$LE/fullchain.pem" ]; then use_https "$LE/fullchain.pem" "$LE/privkey.pem"
elif [ -f "/etc/nginx/cert/$DOMAIN.pem" ] && [ -f "/etc/nginx/cert/$DOMAIN.key" ]; then use_https "/etc/nginx/cert/$DOMAIN.pem" "/etc/nginx/cert/$DOMAIN.key"
else
  sed "s/example.com/$DOMAIN/g" deploy/nginx.conf > /etc/nginx/conf.d/shiyin.conf
  echo "Using HTTP for now"
  # Request a certificate if Certbot is available and DNS resolves to this server.
  if command -v certbot >/dev/null && getent hosts "$DOMAIN" >/dev/null; then
    nginx -t && systemctl reload nginx
    if certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring; then
      use_https "$LE/fullchain.pem" "$LE/privkey.pem"
    else echo "!! Certificate request failed; using HTTP. Verify DNS and rerun this script."; fi
  fi
fi
if command -v getenforce >/dev/null && [ "$(getenforce)" = "Enforcing" ]; then setsebool -P httpd_can_network_connect 1; fi
nginx -t
systemctl enable nginx >/dev/null 2>&1
systemctl reload nginx 2>/dev/null || systemctl restart nginx

echo "== 5/5 Complete"
echo "Local check: curl -I http://127.0.0.1/ -H 'Host: $DOMAIN'"
curl -sI http://127.0.0.1/ -H "Host: $DOMAIN" | head -1 || true
echo "Allow ports 80/443 in the security group and point the $DOMAIN and www A records to this server."
