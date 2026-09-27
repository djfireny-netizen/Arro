# 部署到自己的服务器

目标：`https://你的域名` 打开就是编曲台，大模型的 API Key 只放在服务器上。

结构：浏览器 → Nginx（HTTPS、采样文件、限流）→ `node server.mjs`（只监听本机）→ 大模型接口。

下面以阿里云 ECS + Alibaba Cloud Linux 3 为例，其它 Linux 发行版把 `dnf` 换成对应的包管理器即可。

## 0. 先确认

- **中国内地服务器**：域名要先完成 ICP 备案，才能用 80/443 端口对外访问；网站开通后 30 天内还要办理公安联网备案。香港和海外服务器不需要。
- **对公众开放生成式 AI 功能**：按现行规定可能需要做相应的备案或登记，正式对外前建议咨询专业人士。
- **AI 生成内容标识**：编曲台已按《人工智能生成合成内容标识办法》（GB 45438-2025）在页面和导出文件里加了标识，二次开发时请保留。

## 1. 服务器准备

- 安全组 / 防火墙放行 80、443；22 端口建议只对自己的 IP 开放。
- 域名解析：加一条 A 记录，指向服务器公网 IP。编曲台建议用子域名（如 `music.example.com`），官网可以用主域名。

## 2. 第一次部署（在服务器上）

```bash
sudo mkdir -p /srv/shiyin && cd /srv/shiyin
# 把代码放进来：git clone，或者在本机 scp / rsync 上传
cp .env.example .env && nano .env        # 至少填 PROVIDER 和对应的 API Key
sudo bash deploy/setup-alinux.sh music.example.com
```

`setup-alinux.sh` 会：安装 Node.js 和 Nginx；补全 `.env` 里公开部署需要的设置（只监听本机、每人每天 10 次、全站每天 300 次、只接受本域名的请求）；注册成开机自启的服务；配置 Nginx；服务器上有 certbot 且域名已解析时，自动申请 HTTPS 证书。可以重复执行。

中国内地服务器需要在页面底部挂备案号时：

```bash
ICP_NUMBER='X ICP备XXXXXXXX号-1' sudo -E bash deploy/setup-alinux.sh music.example.com
```

公安备案号拿到后，在 `.env` 里加 `POLICE_NUMBER=...`，然后 `systemctl restart shiyin`。

需要官网（`site/`）时，参考 `deploy/nginx-site.conf`。

## 3. 以后更新：git 推送上线（在本机）

```bash
cp deploy/config.example.sh deploy/config.sh   # 填服务器地址和域名（这个文件不进仓库）
bash deploy/git部署-初始化.sh                   # 只需一次：在服务器建收货仓库
bash deploy/上线.sh                             # 每次上线
```

- `git部署-初始化.sh`：在服务器建 `/srv/shiyin.git` 和 post-receive 钩子；同时生成评测口令 `EVAL_TOKEN`，本机和服务器的 `.env` 各写一份。
- `上线.sh`：只上线已经提交的代码。推到服务器后，钩子会取出代码、重启服务、自检，起不来就自动回到上一版。本机登录了 GitHub 的话，会顺带推一份到 GitHub。
- 服务器不需要访问 GitHub（内地服务器访问 GitHub 常常不稳定）。
- `ai.mjs`（提示词）改了不用重启，下一次请求自动生效；`server.mjs` 改了要重启，上线脚本会自动重启。

其它脚本：`修证书.sh` 重新申请官网证书并打开自动续期；`查证书.sh` 只读检查证书和 Nginx 配置。

## 4. 出问题时

- 服务日志：`journalctl -u shiyin -n 50`
- Nginx：`nginx -t`、`tail -n 50 /var/log/nginx/error.log`
- 服务状态：`systemctl status shiyin`
- 上线记录：`/srv/shiyin.git/上线记录.txt`

## 5. 防刷和费用

- `RATE_LIMIT_PER_IP`：每个 IP 每天能用几次大模型（超出后自动改用本地引擎，本地引擎不限）。
- `RATE_LIMIT_PER_DAY`：全站每天的总次数上限。
- `MAX_CONCURRENT`：同时最多几个生成在跑。
- Nginx 里还有一层：`/api/arrange` 每个 IP 每分钟最多 6 次。
- `EVAL_TOKEN`：带这个口令的评测请求不受"每个 IP 每天几次"的限制，口令不要外传。
- 建议在大模型平台后台设置消费上限。一次整首生成（两轮）大约消耗几千到一万多个 token。

## 6. 带宽

网页本身约 250 KB，每种风格第一次打开还要下载 1–2 MB 的乐器采样。带宽小的服务器同时来几个人就会慢；用户多了以后，可以把 `samples/` 放到对象存储 + CDN 上，服务器只负责网页和大模型接口。
