#!/bin/bash
# Read-only inspection of the website domain configuration and active certificates.
. "$(dirname "$0")/_load-config.sh"
ssh -o StrictHostKeyChecking=accept-new $SERVER "D=$SITE_DOMAIN bash -s" <<'REMOTE'
echo "1. Certificate served for $D:"
echo | openssl s_client -connect 127.0.0.1:443 -servername $D 2>/dev/null | openssl x509 -noout -subject -enddate -ext subjectAltName 2>&1 | sed 's/^/   /'
echo "2. Certificate served for www.$D:"
echo | openssl s_client -connect 127.0.0.1:443 -servername www.$D 2>/dev/null | openssl x509 -noout -subject -enddate 2>&1 | sed 's/^/   /'
echo "3. Nginx warnings:"
nginx -t 2>&1 | grep -iE "conflict|warn|emerg" | sed 's/^/   /'
echo "4. Configuration references to $D (file : line):"
nginx -T 2>/dev/null | awk '/^# configuration file/{f=$4} /server_name|ssl_certificate |listen/{print "   " f " : " $0}' | grep -B2 -A3 "$D" | grep -v "^--$"
echo "5. /etc/hosts entries for $D:"; grep -i "$D" /etc/hosts | sed 's/^/   /' || echo "   (none)"
REMOTE
