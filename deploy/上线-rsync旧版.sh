#!/bin/bash
# 一键上线：上传文件 → 填邀请码 → 重启编曲台 → aitown.me 显示官网 → 自检
# 用法：bash ~/Desktop/Music/拾音编曲台/deploy/上线.sh    （服务器密码只输一次）
set -e
SRV=root@8.160.179.19
DIR="$HOME/Desktop/Music/拾音编曲台/"
CM="-o ControlMaster=auto -o ControlPath=/tmp/shiyin-ssh-%r@%h -o ControlPersist=120 -o StrictHostKeyChecking=accept-new"
echo "① 上传文件（会问一次服务器密码）"
rsync -a --exclude '.DS_Store' --exclude '.env' --exclude '.env.bak*' --exclude '千问Key*' -e "ssh $CM" "$DIR" $SRV:/srv/shiyin/
echo "② 服务器配置"
ssh $CM $SRV 'bash -s' <<'REMOTE'
set -e
TS=$(date +%Y%m%d%H%M%S)
E=/srv/shiyin/.env
cp -a $E /root/shiyin.env.bak-$TS
if grep -q '^INVITE_CODES=.' $E; then echo "   邀请码：已配置"; else echo "!! 服务器 .env 里没有 INVITE_CODES，编曲台会对所有人开放，请先补上"; fi
chown -R nginx:nginx /srv/shiyin
systemctl restart shiyin; sleep 2
echo "   编曲台服务：$(systemctl is-active shiyin)"
F=/etc/nginx/conf.d/aitown.conf
cp -a $F /root/aitown.conf.bak-$TS
cat > $F <<'NG'
# aitown.me 官网（静态页面，文件在 /srv/shiyin/site）
server {
    listen 443 ssl http2;
    server_name aitown.me www.aitown.me;
    ssl_certificate /etc/letsencrypt/live/aitown.me/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aitown.me/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    root /srv/shiyin/site;
    index index.html;
    gzip on; gzip_types text/css application/javascript image/svg+xml;
    add_header X-Content-Type-Options nosniff;
    location = /index.html { add_header Cache-Control "no-cache"; add_header X-Content-Type-Options nosniff; }
    location / { try_files $uri $uri/ /index.html; }
}
server {
    listen 80;
    server_name aitown.me www.aitown.me;
    location /.well-known/acme-challenge/ { root /usr/share/nginx/html; }
    location / { return 301 https://aitown.me$request_uri; }
}
NG
if nginx -t 2>/tmp/ngt; then systemctl reload nginx; echo "   网页服务器：已重载"
else cat /tmp/ngt; cp -a /root/aitown.conf.bak-$TS $F; nginx -t && systemctl reload nginx; echo "!! 官网配置有误，已恢复原样"; fi
sleep 1
echo "③ 自检"
printf "   官网 https://aitown.me/          → %s\n" "$(curl -s -o /dev/null -w '%{http_code}' https://aitown.me/)"
printf "   官网标题                          → %s\n" "$(curl -s https://aitown.me/ | grep -o '<title>[^<]*' | head -1 | sed 's/<title>//')"
printf "   编曲台 https://music.aitown.me/   → %s（没输邀请码时应看到输码页）\n" "$(curl -s https://music.aitown.me/ | grep -o '请输入邀请码' | head -1)"
printf "   错误邀请码                        → %s\n" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"code":"x"}' https://music.aitown.me/api/login)"
printf "   大模型                            → %s\n" "$(curl -s https://music.aitown.me/api/health | grep -o '"model":"[^"]*"')"
echo "   最近日志："; journalctl -u shiyin -n 5 --no-pager | sed 's/^/     /'
REMOTE
ssh $CM -O exit $SRV 2>/dev/null || true
echo "✓ 完成"
