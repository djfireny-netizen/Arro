# 被其它部署脚本引用：读取 deploy/config.sh
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$DEPLOY_DIR")"
if [ ! -f "$DEPLOY_DIR/config.sh" ]; then
  echo "!! 还没有部署配置：先运行 cp deploy/config.example.sh deploy/config.sh，再填上服务器地址和域名"; exit 1
fi
. "$DEPLOY_DIR/config.sh"
