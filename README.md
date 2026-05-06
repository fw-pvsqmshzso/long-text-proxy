# Long Text Proxy

把超长上下文请求伪造成上游接受的格式，用来绕开部分有输入token数量限制渠道的输入长度限制。常见用法是 SillyTavern / 酒馆使用。

## 1. 先检查有没有 Bun

打开终端，输入：

```bash
bun --version
```

如果能看到版本号，比如 `1.x.x`，说明已经有 Bun，直接看「已有 Bun：本地启动」。

如果提示 `bun: command not found`、`未找到命令`、`不是内部或外部命令`，看「没有 Bun：安装 Bun」。

## 2. 拉取仓库

```bash
git clone https://github.com/fw-pvsqmshzso/long-text-proxy.git
cd long-text-proxy
```

如果没有 git，可以直接在 GitHub 页面点绿色 `Code` → `Download ZIP`，解压后进入文件夹。

## 3. 已有 Bun：本地启动

```bash
bun install
bun run start
```

看到类似下面的内容就代表启动成功：

```text
Long Text Proxy listening on http://0.0.0.0:8787
```

然后打开浏览器：

```text
http://你的本机局域网IP:8787
```

也可以先打开：

```text
http://localhost:8787
```

页面里会自动显示酒馆该填写的代理 URL。局域网使用时请优先用页面显示的 `http://实际局域网IP:8787/v1`，不要给手机填 `127.0.0.1`。

## 4. 没有 Bun：安装 Bun

### macOS / Linux

```bash
curl -fsSL https://bun.sh/install | bash
```

安装完关闭终端重新打开，再检查：

```bash
bun --version
```

然后回到「已有 Bun：本地启动」。

### Windows

PowerShell 里运行：

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

安装完关闭 PowerShell 重新打开，再检查：

```powershell
bun --version
```

然后回到「已有 Bun：本地启动」。

## 5. 不想装 Bun：用 Docker

电脑已经装好 Docker 的话，可以直接：

```bash
docker compose up -d --build
```

打开：

```text
http://localhost:8787
```

停止服务：

```bash
docker compose down
```

## 6. 页面怎么用

1. 打开本地页面：`http://localhost:8787` 或页面提示的局域网地址。
2. 在「原始 API 地址」里填你原本渠道给的 API 地址，例如 `https://api.example.com/v1`。
3. 在「原始 API Key」里填你原本渠道给的 key。
4. 点「验证 & 拉取模型」。
5. 选择模型。
6. 点「生成代理 Key」。
7. 把页面生成的「代理地址」和「代理 Key」填到酒馆里。

注意：酒馆里要填新生成的代理地址和代理 Key，不要继续填原始地址和原始 Key。

## 7. 酒馆 / SillyTavern 填法

在酒馆 API 设置里选择 OpenAI 兼容接口，然后填写：

```text
API 地址：页面生成的代理地址，通常是 http://实际局域网IP:8787/v1
API Key：页面生成的代理 Key，通常以 sk-ltp- 开头
模型：页面里生成代理 Key 时选择的那个模型
```

如果酒馆和代理在同一台电脑上，可以用：

```text
http://localhost:8787/v1
```

如果酒馆在手机或另一台设备上，不要用 `localhost` 或 `127.0.0.1`，要用页面提示的局域网 IP。

## 8. 常见坑

### 端口被占用

报错类似：

```text
EADDRINUSE: port 8787 is in use
```

说明 8787 已经有一个服务在跑。先关掉旧窗口，或者换端口启动：

```bash
LISTEN_PORT=8788 bun run start
```

然后打开：

```text
http://localhost:8788
```

### 手机打不开电脑地址

检查这几件事：

- 手机和电脑必须在同一个 Wi-Fi / 局域网。
- 酒馆里不要填 `127.0.0.1`。
- 电脑防火墙可能拦了 8787 端口，需要允许本程序或该端口通过。
- 页面显示多个地址时，优先试 `192.168.x.x` 或 `10.x.x.x` 那个。

### 验证模型时 401

通常是原始 API Key 不对，或原始 API 地址填错。

可以检查：

- 原始 API 地址是不是 OpenAI 兼容地址。
- 地址末尾有没有 `/v1`，有些渠道需要，有些渠道不需要；本工具会自动兼容常见写法。
- Key 有没有复制少字符。
- 如果你粘贴了 `Bearer sk-...`，本工具会自动去掉 `Bearer`。

### 拉不到模型

可能是渠道没有开放 `/v1/models`。如果渠道本身不支持拉模型，这里就会失败。

### 酒馆还是连不上

确认酒馆里填的是：

```text
代理地址，不是原始 API 地址
代理 Key，不是原始 API Key
```

代理 Key 是点「生成代理 Key」后出现的 `sk-ltp-...`。

## 9. 数据保存在哪里

本地会生成 SQLite 数据库文件：

```text
data.db
data.db-wal
data.db-shm
```

里面保存的是「代理 Key → 原始 API 地址 / 原始 API Key / 模型」的映射。

这些文件已被 `.gitignore` 排除，不会上传到 GitHub。

## 10. 更新代码

以后要更新到最新版：

```bash
cd long-text-proxy
git pull
bun install
bun run start
```
