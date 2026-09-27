#!/bin/bash
# 一次性：在服务器上建一个"收货仓库"，以后 git push 过去就自动上线
# 用法：bash ~/Desktop/Music/拾音编曲台/deploy/git部署-初始化.sh   （服务器密码输一次）
set -e
SRV=root@8.160.179.19
ssh -o StrictHostKeyChecking=accept-new $SRV 'bash -s' <<'REMOTE'
set -e
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
cd "$HOME/Desktop/Music/拾音编曲台"
git remote get-url server >/dev/null 2>&1 || git remote add server $SRV:/srv/shiyin.git
echo "✓ 本机已添加远端 server。以后上线：bash deploy/上线.sh"
