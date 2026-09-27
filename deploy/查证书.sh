#!/bin/bash
# 只读检查：找出 aitown.me 实际用的是哪段配置、哪张证书（不改任何东西）
ssh -o StrictHostKeyChecking=accept-new root@8.160.179.19 'bash -s' <<'REMOTE'
echo "① 服务器对 aitown.me 实际出示的证书："
echo | openssl s_client -connect 127.0.0.1:443 -servername aitown.me 2>/dev/null | openssl x509 -noout -subject -enddate -ext subjectAltName 2>&1 | sed 's/^/   /'
echo "② 对 www.aitown.me 出示的证书："
echo | openssl s_client -connect 127.0.0.1:443 -servername www.aitown.me 2>/dev/null | openssl x509 -noout -subject -enddate 2>&1 | sed 's/^/   /'
echo "③ nginx 的警告："
nginx -t 2>&1 | grep -iE "conflict|warn|emerg" | sed 's/^/   /'
echo "④ 所有写了 aitown.me 的地方（文件 : 行）："
nginx -T 2>/dev/null | awk '/^# configuration file/{f=$4} /server_name|ssl_certificate |listen/{print "   " f " : " $0}' | grep -B2 -A3 "aitown.me" | grep -v "^--$"
echo "⑤ /etc/hosts 里的 aitown："; grep -i aitown /etc/hosts | sed 's/^/   /' || echo "   （无）"
REMOTE
