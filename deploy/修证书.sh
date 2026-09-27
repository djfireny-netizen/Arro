#!/bin/bash
# 重新申请官网域名（SITE_DOMAIN，含 www）的 HTTPS 证书，并打开自动续期
# 用法：bash deploy/修证书.sh（在项目文件夹里运行）
. "$(dirname "$0")/_load-config.sh"
ssh -o StrictHostKeyChecking=accept-new $SERVER "D=$SITE_DOMAIN A=$APP_DOMAIN bash -s" <<'REMOTE'
echo "① 现在的证书："
for d in /etc/letsencrypt/live/*/; do n=$(basename $d); [ -f $d/cert.pem ] || continue
  printf "   %-18s 到期 %s  覆盖 %s\n" "$n" "$(openssl x509 -in $d/cert.pem -noout -enddate | cut -d= -f2)" "$(openssl x509 -in $d/cert.pem -noout -ext subjectAltName | tail -1 | tr -d ' ')"; done
mkdir -p /usr/share/nginx/html/.well-known/acme-challenge
echo "② 重新申请 $D（含 www）"
if certbot certonly --webroot -w /usr/share/nginx/html --cert-name $D -d $D -d www.$D --force-renewal --non-interactive --agree-tos --register-unsafely-without-email -q; then echo "   成功（$D + www.$D）"
else echo "   www 可能没有解析到这台服务器，改为只申请 $D"
  certbot certonly --webroot -w /usr/share/nginx/html --cert-name $D -d $D --force-renewal --non-interactive --agree-tos --register-unsafely-without-email -q && echo "   成功（$D）" || echo "!! 申请失败，把上面的内容发给 Claude"
fi
echo "③ 打开自动续期（续完自动重载网页服务器）"
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh; chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
if systemctl list-unit-files 2>/dev/null | grep -q '^certbot-renew.timer'; then systemctl enable --now certbot-renew.timer >/dev/null 2>&1; echo "   已开启 certbot-renew.timer"
else (crontab -l 2>/dev/null | grep -v 'certbot renew'; echo '17 3 * * * certbot renew -q') | crontab -; echo "   已加入每日定时任务"; fi
nginx -t 2>/dev/null && systemctl reload nginx && echo "   网页服务器已重载"
echo "④ 结果："
for d in /etc/letsencrypt/live/*/; do n=$(basename $d); [ -f $d/cert.pem ] || continue
  printf "   %-18s 到期 %s\n" "$n" "$(openssl x509 -in $d/cert.pem -noout -enddate | cut -d= -f2)"; done
for h in $D www.$D $A; do printf "   https://%-16s → %s\n" "$h" "$(curl -s -o /dev/null -w '%{http_code}' https://$h/ || echo 证书错误)"; done
REMOTE
