#!/usr/bin/env bash
# 拾音编曲台 · 阿里云 ECS（Alibaba Cloud Linux 3）一键部署
# 用法：代码放到 /srv/shiyin 之后，在服务器上执行：
#   sudo bash /srv/shiyin/deploy/setup-alinux.sh music.example.com
#   （中国内地服务器要挂备案号的话：ICP_NUMBER='X ICP备XXXXXXXX号-1' sudo -E bash ...）
# 可以重复执行：更新代码后再跑一遍即可。
set -e
DOMAIN=${1:?用法：setup-alinux.sh 你的域名}
APP=/srv/shiyin
cd "$APP"

echo "== 0/5 检查这台服务器上已有的网站，避免冲突"
if command -v ss >/dev/null; then
  OTHER=$(ss -ltnp 2>/dev/null | awk '$4 ~ /:(80|443)$/' | grep -v nginx || true)
  if [ -n "$OTHER" ]; then echo "!! 80/443 端口已经被别的程序占用（不是 Nginx）："; echo "$OTHER"; echo "先把这个情况发给 Claude，确认后再部署。"; exit 1; fi
fi
if [ -d /etc/nginx ]; then
  CONFLICT=$(grep -rlsE "server_name[^;]*[[:space:]]$DOMAIN([[:space:];]|$)" /etc/nginx/conf.d /etc/nginx/nginx.conf /etc/nginx/sites-enabled 2>/dev/null | grep -v '/conf.d/shiyin.conf' || true)
  if [ -n "$CONFLICT" ]; then echo "!! $DOMAIN 已经在别的 Nginx 配置里用了：$CONFLICT"; echo "为了不影响现有网站，建议换一个子域名，比如：bash $0 music.$DOMAIN"; exit 1; fi
fi

echo "== 1/5 安装 Node.js 和 Nginx"
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1 || true)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 18 ]; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  dnf install -y nodejs
fi
command -v nginx >/dev/null || dnf install -y nginx
node -v

echo "== 2/5 配置 .env"
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
  echo "!! .env 里还没有填大模型的 API Key。先 nano $APP/.env 填上 PROVIDER 和 Key，再重新运行本脚本。"
fi
chown -R nginx:nginx "$APP"
chmod 600 .env

echo "== 3/5 注册成系统服务（开机自启、崩了自动重启）"
NODE_BIN=$(command -v node)
sed "s#User=www-data#User=nginx#; s#WorkingDirectory=.*#WorkingDirectory=$APP#; s#ExecStart=.*#ExecStart=$NODE_BIN server.mjs#" deploy/shiyin.service > /etc/systemd/system/shiyin.service
systemctl daemon-reload
systemctl enable shiyin >/dev/null 2>&1
systemctl restart shiyin
sleep 2
if ! curl -fsS http://127.0.0.1:5178/api/health; then echo; echo "!! 服务没有启动成功，最近的日志："; journalctl -u shiyin -n 30 --no-pager; exit 1; fi; echo

echo "== 4/5 配置 Nginx"
LE=/etc/letsencrypt/live/$DOMAIN
use_https() {  # $1=证书 $2=私钥
  sed "s/example.com/$DOMAIN/g; s#/etc/nginx/cert/$DOMAIN.pem#$1#; s#/etc/nginx/cert/$DOMAIN.key#$2#" deploy/nginx-https.conf > /etc/nginx/conf.d/shiyin.conf
  echo "启用 HTTPS：$1"
}
if [ -f "$LE/fullchain.pem" ]; then use_https "$LE/fullchain.pem" "$LE/privkey.pem"
elif [ -f "/etc/nginx/cert/$DOMAIN.pem" ] && [ -f "/etc/nginx/cert/$DOMAIN.key" ]; then use_https "/etc/nginx/cert/$DOMAIN.pem" "/etc/nginx/cert/$DOMAIN.key"
else
  sed "s/example.com/$DOMAIN/g" deploy/nginx.conf > /etc/nginx/conf.d/shiyin.conf
  echo "先用 HTTP"
  # 服务器上有 certbot 的话，自动申请免费证书（需要域名已经解析到这台服务器）
  if command -v certbot >/dev/null && getent hosts "$DOMAIN" >/dev/null; then
    nginx -t && systemctl reload nginx
    if certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring; then
      use_https "$LE/fullchain.pem" "$LE/privkey.pem"
    else echo "!! 证书申请没成功，先用 HTTP。确认域名解析生效后再运行一次本脚本。"; fi
  fi
fi
if command -v getenforce >/dev/null && [ "$(getenforce)" = "Enforcing" ]; then setsebool -P httpd_can_network_connect 1; fi
nginx -t
systemctl enable nginx >/dev/null 2>&1
systemctl reload nginx 2>/dev/null || systemctl restart nginx

echo "== 5/5 完成"
echo "本机测试：curl -I http://127.0.0.1/ -H 'Host: $DOMAIN'"
curl -sI http://127.0.0.1/ -H "Host: $DOMAIN" | head -1 || true
echo "记得：阿里云安全组放行 80、443 端口；云解析里 $DOMAIN 和 www 的 A 记录指向本机公网 IP。"
