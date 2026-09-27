#!/bin/bash
# 上线：把已提交的代码推到服务器（服务器自动重启 + 自检，失败自动回滚），再备份到 GitHub
# 用法：bash ~/Desktop/Music/拾音编曲台/deploy/上线.sh
# 首次使用前先运行一次：deploy/git部署-初始化.sh
set -e
cd "$HOME/Desktop/Music/拾音编曲台"
if [ -n "$(git status --porcelain)" ]; then
  echo "!! 还有没提交的改动，先提交再上线："; git status --short; exit 1
fi
echo "① 推送到服务器（会问一次服务器密码）"
git push server main
echo "② 线上自检"
printf "   编曲台 → %s\n" "$(curl -s https://music.aitown.me/ | grep -o '请输入邀请码' | head -1)"
printf "   大模型 → %s\n" "$(curl -s https://music.aitown.me/api/health | grep -o '"model":"[^"]*"')"
if git remote get-url origin >/dev/null 2>&1; then
  echo "③ 备份到 GitHub"; git push origin main || echo "   （GitHub 这次没推上去，不影响线上，稍后再推即可）"
fi
echo "✓ 完成：$(git log -1 --format='%h %s')"
