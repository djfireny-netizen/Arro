#!/bin/bash
# Renew the website HTTPS certificate for SITE_DOMAIN and www, and enable automatic renewal.
# Usage: bash deploy/修证书.sh from the project directory.
. "$(dirname "$0")/_load-config.sh"
ssh -o StrictHostKeyChecking=accept-new $SERVER "D=$SITE_DOMAIN A=$APP_DOMAIN bash -s" <<'REMOTE'
echo "1. Current certificates:"
for d in /etc/letsencrypt/live/*/; do n=$(basename $d); [ -f $d/cert.pem ] || continue
  printf "   %-18s expires %s  names %s\n" "$n" "$(openssl x509 -in $d/cert.pem -noout -enddate | cut -d= -f2)" "$(openssl x509 -in $d/cert.pem -noout -ext subjectAltName | tail -1 | tr -d ' ')"; done
mkdir -p /usr/share/nginx/html/.well-known/acme-challenge
echo "2. Requesting a new certificate for $D and www"
if certbot certonly --webroot -w /usr/share/nginx/html --cert-name $D -d $D -d www.$D --force-renewal --non-interactive --agree-tos --register-unsafely-without-email -q; then echo "   Success ($D + www.$D)"
else echo "   www may not resolve to this server; requesting $D only"
  certbot certonly --webroot -w /usr/share/nginx/html --cert-name $D -d $D --force-renewal --non-interactive --agree-tos --register-unsafely-without-email -q && echo "   Success ($D)" || echo "!! Certificate request failed; review the output above."
fi
echo "3. Enabling automatic renewal and Nginx reload"
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh; chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
if systemctl list-unit-files 2>/dev/null | grep -q '^certbot-renew.timer'; then systemctl enable --now certbot-renew.timer >/dev/null 2>&1; echo "   Enabled certbot-renew.timer"
else (crontab -l 2>/dev/null | grep -v 'certbot renew'; echo '17 3 * * * certbot renew -q') | crontab -; echo "   Added a daily renewal task"; fi
nginx -t 2>/dev/null && systemctl reload nginx && echo "   Nginx reloaded"
echo "4. Results:"
for d in /etc/letsencrypt/live/*/; do n=$(basename $d); [ -f $d/cert.pem ] || continue
  printf "   %-18s expires %s\n" "$n" "$(openssl x509 -in $d/cert.pem -noout -enddate | cut -d= -f2)"; done
for h in $D www.$D $A; do printf "   https://%-16s → %s\n" "$h" "$(curl -s -o /dev/null -w '%{http_code}' https://$h/ || echo certificate-error)"; done
REMOTE
