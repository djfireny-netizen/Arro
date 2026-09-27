#!/bin/bash
# 重新申请 aitown.me 的 HTTPS 证书，并打开自动续期
# 用法：bash ~/Desktop/Music/拾音编曲台/deploy/修证书.sh    （输一次服务器密码）
ssh -o StrictHostKeyChecking=accept-new root@8.160.179.19 'bash -s' <<'REMOTE'
echo "① 现在的证书："
for d in /etc/letsencrypt/live/*/; do n=$(basename $d); [ -f $d/cert.pem ] || continue
  printf "   %-18s 到期 %s  覆盖 %s\n" "$n" "$(openssl x509 -in $d/cert.pem -noout -enddate | cut -d= -f2)" "$(openssl x509 -in $d/cert.pem -noout -ext subjectAltName | tail -1 | tr -d ' ')"; done
mkdir -p /usr/share/nginx/html/.well-known/acme-challenge
echo "② 重新申请 aitown.me（含 www）"
if certbot certonly --webroot -w /usr/share/nginx/html --cert-name aitown.me -d aitown.me -d www.aitown.me --force-renewal --non-interactive --agree-tos --register-unsafely-without-email -q; then echo "   成功（aitown.me + www.aitown.me）"
else echo "   www 可能没有解析到这台服务器，改为只申请 aitown.me"
  certbot certonly --webroot -w /usr/share/nginx/html --cert-name aitown.me -d aitown.me --force-renewal --non-interactive --agree-tos --register-unsafely-without-email -q && echo "   成功（aitown.me）" || echo "!! 申请失败，把上面的内容发给 Claude"
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
for h in aitown.me www.aitown.me music.aitown.me; do printf "   https://%-16s → %s\n" "$h" "$(curl -s -o /dev/null -w '%{http_code}' https://$h/ || echo 证书错误)"; done
REMOTE
