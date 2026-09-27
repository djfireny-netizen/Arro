# 部署配置：复制一份改名为 deploy/config.sh 再填写（config.sh 不进仓库）
#   cp deploy/config.example.sh deploy/config.sh
SERVER=root@你的服务器公网IP     # ssh 登录的用户和地址
APP_DOMAIN=music.example.com     # 编曲台的域名
SITE_DOMAIN=example.com          # 官网域名（可选，www 会一起处理；不需要官网就留空）
