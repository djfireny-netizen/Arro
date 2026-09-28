# Deploy Arro on your server

[English](./DEPLOY.md) | [简体中文](./DEPLOY.zh-CN.md)

The production setup serves Arro at your HTTPS domain while keeping model API credentials on the server:

Browser → Nginx (HTTPS and rate limiting) → Node.js on localhost → model provider.

These instructions use Alibaba Cloud ECS with Alibaba Cloud Linux 3. Adapt the package manager and service setup for other Linux distributions.

## Before deployment

For a mainland China deployment, review the applicable ICP, public security registration, generative AI, and AI-generated content labeling requirements. Arro includes interface and export labels; preserve those features when adapting the application.

Allow inbound ports 80 and 443. Restrict SSH access as appropriate for your administration setup. Point a DNS A record at the server's public IP; a subdomain such as `music.example.com` can host the application.

## Initial installation

On the server:

```bash
sudo mkdir -p /srv/shiyin
cd /srv/shiyin
# Clone or copy the repository into this directory first.
cp .env.example .env
nano .env
# Configure PROVIDER and its API credential before continuing.
sudo bash deploy/setup-alinux.sh music.example.com
```

The setup script installs Node.js and Nginx, adds public deployment settings to `.env`, registers the systemd service, and configures Nginx. Defaults include localhost binding, 10 generations per IP per day, 300 generations site-wide per day, and requests restricted to the configured origin. If Certbot is available and DNS resolves correctly, the script requests an HTTPS certificate.

To display an ICP registration number, pass your actual registration text:

```bash
ICP_NUMBER='YOUR_REGISTRATION_NUMBER' sudo -E bash deploy/setup-alinux.sh music.example.com
```

Set `POLICE_NUMBER` in `.env` when available, then restart `shiyin`. For the optional public website in `site/`, adapt `deploy/nginx-site.conf`.

Configure invitation codes in the server's `.env` using `INVITE_CODES`. Enter credentials and invitation codes locally; keep them out of commits, logs, and shared command transcripts.

## Deploy updates from your computer

```bash
cp deploy/config.example.sh deploy/config.sh
# Edit deploy/config.sh with your server address and domains.
bash deploy/git部署-初始化.sh
bash deploy/上线.sh
```

Run initialization once. It creates `/srv/shiyin.git` and its post-receive hook, and configures an `EVAL_TOKEN` in the local and server `.env` files.

The deployment script requires a clean working tree and pushes committed code to the server. The hook checks out the new version, restarts the service, and checks health. If startup fails, it restores the previous revision. The script also attempts to push to GitHub; if local GitHub authentication is unavailable, that backup step is skipped.

The production server does not need to fetch from GitHub. Changes to `ai.mjs` are loaded on the next generation request; changes to `server.mjs` require a restart. The deployment script performs that restart automatically.

Avoid deployment during evaluation: restarting the service clears its in-memory job table, and changing prompts during a run mixes versions within the same sample set.

## Operational checks

```bash
systemctl status shiyin
journalctl -u shiyin -n 50
nginx -t
tail -n 50 /var/log/nginx/error.log
```

Deployment records are stored at `/srv/shiyin.git/上线记录.txt`.

Additional scripts:

- `deploy/查证书.sh`: inspect certificates and Nginx configuration.
- `deploy/修证书.sh`: request website certificates and enable renewal.

## Quotas and capacity

| Setting | Purpose |
| --- | --- |
| `RATE_LIMIT_PER_IP` | Daily generation limit for each IP |
| `RATE_LIMIT_PER_DAY` | Daily generation limit across the site |
| `MAX_CONCURRENT` | Maximum simultaneous generation jobs |
| `EVAL_TOKEN` | Evaluation credential that bypasses the per-IP daily quota |

Evaluation still respects the site-wide limit and concurrency limit. Nginx also limits `/api/arrange` requests to six per minute per IP. Local engine generation does not use model API credits.

Configure spending limits with the model provider where available. A two-pass arrangement can consume several thousand to more than ten thousand tokens; actual usage depends on the model output and retries.

The application page is roughly 250 KB, with approximately 1–2 MB of samples loaded on the first use of a style. For larger audiences, sample hosting on object storage and a CDN can reduce server bandwidth requirements.

## ARRO 1.1 job persistence and recovery

The service now needs a private writable job directory. By default it uses `.arro-data/` beside `server.mjs`; `ARRO_JOB_DIR` can point to an alternative directory owned by the service user. The directory is ignored by Git, uses mode 0700, and contains an atomically replaced mode-0600 journal. It contains generated results and usage metadata, not model credentials or complete request bodies. It is not served by the HTTP router.

Keep this directory through deployments and restarts. Request identity, browser-session ownership, completion state, and daily usage accounting survive restart. Completed results and retry identities are retained for 24 hours; the journal is bounded to 256 records. The server rejects new work when full rather than dropping a current retry record. An interrupted upstream call is not automatically replayed. Clients must preserve both invitation and `arro_session` cookies; the bundled evaluation runner does so.

Model connections use normal TLS certificate verification. Configure a trusted CA through the Node.js trust configuration if required by your environment.

Before deployment, run the unit/HTTP tests and browser regression suite. `ARRO_TEST_BASE=http://127.0.0.1:5181` can direct the browser suite at an isolated mock preview service instead of starting a local server. Use only a non-production mock preview with the synthetic invitation `TEST-CODE-1` and its own job directory.

Production retains invitation-only access. Confirm `/api/health` reports `version: "1.1.0"`, verify the login page and static brand assets over HTTPS, and check that protected project modules still require login. Keep the preceding commit and deployment record for rollback. A rollback must preserve `.env`, `.arro-data`, browser IndexedDB, and exported project files.

If older application code cannot open an exported 1.1 project, run the tagged 1.1 recovery copy locally:

```bash
git clone --branch v1.1.0 https://github.com/djfireny-netizen/Arro.git Arro-recovery
cd Arro-recovery
HOST=127.0.0.1 PROVIDER=mock node server.mjs
```

Open localhost:5178 and import the `.arro.json` file to play or export it. This path requires no model credential and does not regenerate the saved music.
