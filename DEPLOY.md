# 部署到自己的云服务器

目标：`https://你的域名` 打开就是拾音编曲台，大模型的 API Key 只放在服务器上。

整体结构：浏览器 → Nginx（HTTPS、采样文件、限流）→ `node server.mjs`（只监听本机）→ DeepSeek。

## 快速部署：aitown.me · 阿里云 ECS（华北6 乌兰察布）· Alibaba Cloud Linux 3

你的域名已备案（浙ICP备2026029742号-1），服务器在阿里云内地地域，可以直接上线。按顺序做下面 6 步。

### 第 1 步：放行端口（阿里云控制台）
ECS → 实例 → 网络与安全组 → 安全组 → 入方向 → 添加规则：
- 端口 80，授权对象 0.0.0.0/0
- 端口 443，授权对象 0.0.0.0/0
- 22 端口（SSH）建议只对你自己的 IP 开放

### 第 2 步：域名解析（阿里云控制台 → 云解析 DNS → aitown.me）
添加两条 A 记录，记录值都是服务器公网 IP `8.160.179.19`：
- 主机记录 `@`
- 主机记录 `www`

### 第 3 步：把代码传到服务器（在你 Mac 的"终端"里执行）
先在 ECS 页面点"远程连接"登录服务器，执行一次 `dnf install -y rsync`。然后回到 Mac 终端：

```
rsync -av ~/Desktop/Music/拾音编曲台/ root@8.160.179.19:/srv/shiyin/
```

会问服务器的 root 密码（忘了可以在 ECS 页面点"重置密码"）。这一步会把你本机的 `.env`（里面有 DeepSeek 的 Key）一起传上去，走的是加密的 SSH，不经过 GitHub。

### 第 4 步：一键安装（在服务器上执行）

```
bash /srv/shiyin/deploy/setup-alinux.sh aitown.me
```

脚本会：装 Node.js 和 Nginx、补全 `.env` 里公开部署需要的设置（只监听本机、每人每天 10 次、全站每天 300 次、只接受 aitown.me 的请求、备案号）、注册成开机自启的服务、配置 Nginx。最后一行出现 `HTTP/1.1 200 OK` 就说明成功了。
这时打开 `http://aitown.me` 应该已经能用。

### 第 5 步：开 HTTPS
1. 阿里云控制台搜"数字证书管理服务"→ SSL 证书 → 免费证书，为 `aitown.me` 申请一张（验证方式选"自动 DNS 验证"，因为域名就在阿里云）。
2. 签发后点"下载"，选 Nginx 格式，解压得到 `.pem` 和 `.key` 两个文件，改名为 `aitown.me.pem` 和 `aitown.me.key`。
3. 在 Mac 终端上传（先在服务器上 `mkdir -p /etc/nginx/cert`）：
   ```
   scp aitown.me.pem aitown.me.key root@8.160.179.19:/etc/nginx/cert/
   ```
4. 再在服务器上跑一次第 4 步的脚本，它发现证书就会自动切到 HTTPS，并把 http 跳转到 https。

免费证书有有效期，到期前要重新申请、上传、再跑一次脚本。

### 第 6 步：公安备案
网站开通后 30 天内，到"全国互联网安全管理服务平台"办理公安联网备案。拿到备案号后，在服务器的 `/srv/shiyin/.env` 里加一行 `POLICE_NUMBER=你的公安备案号`，然后 `systemctl restart shiyin`。

### 以后更新
在 Mac 上：

```
rsync -av --exclude .env ~/Desktop/Music/拾音编曲台/ root@8.160.179.19:/srv/shiyin/
```

再在服务器上：`chown -R nginx:nginx /srv/shiyin && systemctl restart shiyin`。只改了 `ai.mjs`（提示词）的话，不用重启。

### 出问题时看这里
- 服务日志：`journalctl -u shiyin -n 50`
- Nginx 报错：`nginx -t`、`tail -n 50 /var/log/nginx/error.log`
- 服务是否在跑：`systemctl status shiyin`

### 关于带宽
你的服务器是 3 Mbps 带宽。网页本身约 240 KB，每种风格第一次打开还要下载 1–2 MB 的乐器采样，同时来几个人就会慢。先用着没问题；用户多了以后，可以把 `samples/` 放到阿里云 OSS + CDN 上，服务器只负责网页和大模型接口。

---

以下是通用说明，供参考。

## 0. 先确认两件事

- **服务器在哪**：在中国大陆的服务器，域名要先做 ICP 备案才能用 80/443 端口对外访问；香港和海外服务器不需要备案。
- **面向谁**：如果打算公开给国内公众使用生成式 AI 功能，按现行规定可能需要做相应的备案或登记，正式对外前建议咨询专业人士。

## 阿里云 ECS 专门要注意的

- **地域决定要不要备案**：在 ECS 控制台看实例的"地域"。中国内地地域（华东、华北、华南等）要先做 ICP 备案，域名才能用 80/443 访问；中国香港和海外地域不需要。
- **备案怎么做**：在阿里云控制台搜"ICP 备案"，按向导走，通常要几个工作日到几周。`.me` 在工信部批准的可备案后缀里，但具体受理还要看你所在省份管局的要求。域名需要先完成实名认证。
- **安全组**：ECS 控制台 → 实例 → 安全组 → 入方向，放行 80 和 443 端口（22 端口建议只对你自己的 IP 开放）。
- **域名解析**：阿里云控制台 →"云解析 DNS"→ `aitown.me` → 添加记录：类型 A，主机记录 `@`（或 `music` 之类的子域名），记录值是 ECS 的公网 IP。
- **拉 GitHub 代码慢或失败**：内地服务器访问 GitHub 有时不稳定。可以多试几次，或者在本机打包后用 `scp` 传到服务器：`scp -r 拾音编曲台 root@服务器IP:/srv/shiyin`。
- **系统是 Alibaba Cloud Linux / CentOS 时**：把下面的 `apt` 换成 `dnf`；装 Node 用 `curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash - && sudo dnf install -y nodejs nginx`；`deploy/shiyin.service` 里的 `User=www-data` 改成 `User=nginx`；HTTPS 证书也可以用阿里云"数字证书管理服务"里的免费证书，下载 Nginx 格式后在配置里指定。

- **备案号要挂在网页底部**：在 `.env` 里填 `ICP_NUMBER=浙ICP备2026029742号-1`，网页底部会显示并链接到工信部网站。
- **公安备案**：网站开通后 30 天内，要到"全国互联网安全管理服务平台"办理公安联网备案，拿到号后填 `POLICE_NUMBER=`。
- **备案和服务器绑定**：ICP 备案是通过阿里云做的，网站要放在阿里云中国内地地域的服务器上才算接入有效。

## 1. 服务器上装好 Node.js 和 Nginx

需要 Node.js 18 或更高版本（推荐 20 或 22）。以 Ubuntu 为例：

```
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx
node -v
```

## 2. 把代码拉到服务器

先把这个文件夹推到你的 GitHub 仓库（`.env` 已在 `.gitignore` 里，不会被传上去）。然后在服务器上：

```
sudo mkdir -p /srv/shiyin && sudo chown $USER /srv/shiyin
git clone https://github.com/你的用户名/你的仓库.git /srv/shiyin
cd /srv/shiyin
cp .env.example .env
nano .env
```

`.env` 里至少填：

```
PROVIDER=deepseek
DEEPSEEK_API_KEY=你的 Key
HOST=127.0.0.1
TRUST_PROXY=1
RATE_LIMIT_PER_IP=10
RATE_LIMIT_PER_DAY=300
ALLOWED_ORIGIN=https://你的域名
```

先手动跑一下确认没问题：`node server.mjs`，看到"拾音编曲台已启动"就按 Ctrl+C 停掉。

## 3. 让它开机自启、崩了自动重启

```
sudo cp deploy/shiyin.service /etc/systemd/system/
sudo chown -R www-data /srv/shiyin
sudo systemctl daemon-reload
sudo systemctl enable --now shiyin
sudo systemctl status shiyin
```

看日志：`journalctl -u shiyin -f`

## 4. 域名解析

在域名服务商那里加一条 **A 记录**：主机记录 `@`（或你想用的子域名，比如 `music`），记录值是服务器的公网 IP。

## 5. Nginx 和 HTTPS

```
sudo cp deploy/nginx.conf /etc/nginx/conf.d/shiyin.conf
sudo nano /etc/nginx/conf.d/shiyin.conf      # 把 example.com 换成你的域名（比如 aitown.me）
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

记得在云服务器的安全组 / 防火墙里放行 80 和 443 端口。

## 6. 以后更新

```
cd /srv/shiyin && git pull && sudo systemctl restart shiyin
```

`ai.mjs`（提示词）改了不用重启，下一次请求自动生效；`server.mjs` 改了要重启。

## 防刷和费用

- `RATE_LIMIT_PER_IP`：每个 IP 每天能用几次大模型（超出后自动改用本地引擎，本地引擎不限）。
- `RATE_LIMIT_PER_DAY`：全站每天的总次数上限。
- `MAX_CONCURRENT`：同时最多几个生成在跑。
- Nginx 里还有一层：每个 IP 每分钟最多 6 次。
- 另外建议在 DeepSeek 后台设置消费上限或只充值小额。

一次整首生成（两轮）大约消耗几千到一万多个 token，按 DeepSeek 当前价格估算每次几分钱量级，以官网价格为准。
