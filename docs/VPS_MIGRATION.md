# VPS Migration Guide

目标：从当前 Windows 目录迁移到 Linux VPS，并尽量保持客户端无感。

## 迁移前检查

1. 确认 Windows 本机可用：

   ```powershell
   python -m py_compile sse2json.py config_loader.py config_manager.py router.py upstream_client.py stream_adapters.py
   python -m unittest discover -s tests
   ```

2. 备份这些运行文件：

   ```text
   config.json
   runtime_config.json
   data/
   tmp/router_state.json
   tmp/proxy_history.sqlite3*
   tmp/admin_audit.jsonl
   ```

3. 不需要迁移这些本地垃圾或构建产物：

   ```text
   __pycache__/
   .pytest_cache/
   .playwright-cli/
   dashboard_src/node_modules/
   proxy_logs/
   *.log
   *.png
   tmp/proxy-live-latest.*.log
   scratch/
   ```

## 推荐方式：Docker Compose

在 VPS 上安装 Docker 后：

```bash
sudo mkdir -p /opt/litellm-proxy
sudo chown "$USER":"$USER" /opt/litellm-proxy
cd /opt/litellm-proxy
```

把项目文件同步到 `/opt/litellm-proxy`，同时把 Windows 上的 `config.json`、`runtime_config.json`、`data/`、需要保留的 `tmp/*.sqlite3*` 和 `tmp/router_state.json` 放回同名位置。

首次启动：

```bash
mkdir -p tmp proxy_logs data
touch runtime_config.json
docker compose up -d --build
docker compose logs -f
```

健康检查：

```bash
curl http://127.0.0.1:4894/health
curl http://127.0.0.1:4894/v1/models
```

Compose 默认只映射到 VPS 的 `127.0.0.1:4894`，适合前面再挂 Nginx/Caddy。若必须直接暴露端口，把 `docker-compose.yml` 的端口改成 `"4894:4894"`，并确认 `server.admin_key` 已换成强随机值。

## 备选方式：systemd 裸机运行

```bash
sudo useradd --system --home /opt/litellm-proxy --shell /usr/sbin/nologin litellm-proxy
sudo mkdir -p /opt/litellm-proxy
sudo rsync -a --delete ./ /opt/litellm-proxy/
sudo chown -R litellm-proxy:litellm-proxy /opt/litellm-proxy

cd /opt/litellm-proxy
sudo -u litellm-proxy python3 -m venv .venv
sudo -u litellm-proxy .venv/bin/pip install -r requirements.txt

sudo cp deploy/systemd/litellm-proxy.service /etc/systemd/system/litellm-proxy.service
sudo systemctl daemon-reload
sudo systemctl enable --now litellm-proxy
sudo journalctl -u litellm-proxy -f
```

## Nginx 反代

```bash
sudo cp deploy/nginx/litellm-proxy.conf /etc/nginx/sites-available/litellm-proxy.conf
sudo ln -s /etc/nginx/sites-available/litellm-proxy.conf /etc/nginx/sites-enabled/litellm-proxy.conf
sudo nginx -t
sudo systemctl reload nginx
```

把 `proxy.example.com` 改成你的域名。启用 HTTPS 可用 certbot：

```bash
sudo certbot --nginx -d proxy.example.com
```

## 客户端无感切换

如果原客户端使用 `http://127.0.0.1:4894`，远程 VPS 无法完全无感，必须做二选一：

1. 客户端 Base URL 改为 `https://你的域名`。
2. 在客户端机器上做 SSH 隧道，让本机继续有 `127.0.0.1:4894`：

   ```bash
   ssh -N -L 4894:127.0.0.1:4894 user@your-vps
   ```

如果原来客户端已经访问某个域名，只需要把域名 DNS 切到 VPS，路径保持不变。

## VPS 上建议的配置

`config.json` 建议保留：

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 4894,
    "max_workers": 20,
    "log_dir": "proxy_logs",
    "debug_disk_log": false,
    "admin_key": "replace-with-a-long-random-secret"
  }
}
```

外网部署时至少做到：

- `admin_key` 使用强随机值。
- 优先通过 HTTPS 反代访问。
- 防火墙只开放 80/443；4894 只监听本机或只在内网开放。
- `runtime_config.json`、`config.json`、`tmp/`、`data/` 定期备份。

## 常用运维命令

Docker：

```bash
docker compose ps
docker compose logs -f --tail=200
docker compose restart
docker compose pull && docker compose up -d --build
```

systemd：

```bash
sudo systemctl status litellm-proxy
sudo journalctl -u litellm-proxy -f
sudo systemctl restart litellm-proxy
```
