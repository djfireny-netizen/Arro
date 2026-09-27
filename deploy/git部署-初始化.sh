#!/bin/bash
# 一次性：在服务器上建一个"收货仓库"，以后 git push 过去就自动上线
# 用法：bash deploy/git部署-初始化.sh（在项目文件夹里运行；需要登录服务器时输一次密码）
set -e
. "$(dirname "$0")/_load-config.sh"
SRV=$SERVER
LOCAL_ENV="$PROJECT_DIR/.env"
# 评测口令：本机没有就生成一个，写进本机 .env；同一个值写进服务器 .env（不在屏幕上显示）
T=$(grep '^EVAL_TOKEN=' "$LOCAL_ENV" 2>/dev/null | cut -d= -f2)
if [ -z "$T" ]; then T=$(openssl rand -hex 16); printf '\nEVAL_TOKEN=%s\n' "$T" >> "$LOCAL_ENV"; fi
ssh -o StrictHostKeyChecking=accept-new $SRV "EVAL_TOKEN=$T bash -s" <<'REMOTE'
set -e
E=/srv/shiyin/.env
if ! grep -q '^EVAL_TOKEN=' $E; then cp -a $E /root/shiyin.env.bak-$(date +%Y%m%d%H%M%S); echo "EVAL_TOKEN=$EVAL_TOKEN" >> $E; echo "✓ 评测口令已写入服务器 .env（重启后生效）"; fi
command -v git >/dev/null || dnf install -y git
mkdir -p /srv/shiyin.git && cd /srv/shiyin.git
[ -f HEAD ] || git init -q --bare -b main
cat > hooks/post-receive <<'HOOK'
#!/bin/bash
# 收到推送 → 取出代码到 /srv/shiyin（不碰 .env）→ 重启 → 自检；失败自动回到上一版
set -e
while read old new ref; do
  [ "$ref" = "refs/heads/main" ] || { echo "只上线 main 分支，忽略 $ref"; continue; }
  W=/srv/shiyin
  echo "→ 上线 $(git log -1 --format='%h %s' $new)"
  git --work-tree=$W --git-dir=/srv/shiyin.git checkout -f main
  chown -R nginx:nginx $W
  systemctl restart shiyin; sleep 2
  if systemctl is-active -q shiyin && curl -sf -o /dev/null http://127.0.0.1:5178/api/health; then
    echo "✓ 编曲台已重启并通过自检"
    echo "$new $(date '+%F %T')" >> /srv/shiyin.git/上线记录.txt
  else
    echo "!! 新版本起不来，回到上一版 $old"
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
echo "✓ 服务器收货仓库已就绪：/srv/shiyin.git"
REMOTE
cd "$PROJECT_DIR"
git remote get-url server >/dev/null 2>&1 || git remote add server $SRV:/srv/shiyin.git
echo "✓ 本机已添加远端 server。以后上线：bash deploy/上线.sh"
