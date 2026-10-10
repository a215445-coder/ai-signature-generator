# 墨签 · AI 艺术签名生成器

输入中文或英文姓名，选择风格，AI 实时为你创作 4 款独一无二的艺术签名，支持高清透明背景 PNG 下载。

高级简约的黑白设计，适配电脑与手机。每一次生成都**真实调用 AI 图像生成接口**，不使用字体模拟、不使用预置图片冒充。

## ✨ 功能

- 输入中文 / 英文姓名，5 种风格可选：潇洒、商务、连笔、艺术、极简
- 一次生成 4 款不同方案，可单独或全部重新生成
- 针对中英文分别优化提示词，尽力保证姓名拼写准确
- 点击放大预览、左右切换方案、下载高清透明背景 PNG（本地自动抠除白色背景）
- Node.js 服务端代理 AI 请求，API Key 仅保存在环境变量 `.env` 中，不暴露给前端
- 内置按 IP 限流（每分钟 12 次）与生成图片自动清理（保留 2 小时），控制成本
- 自动化测试（`npm test`），无需真实 API Key 即可运行

## 🚀 快速开始

### 1. 申请 API Key（约 2 分钟）

推荐使用**硅基流动 SiliconFlow**：手机号注册即可，支持支付宝充值，新用户赠送体验额度。

1. 打开 <https://cloud.siliconflow.cn/> 注册并登录
2. 进入「API 密钥」页面：<https://cloud.siliconflow.cn/account/ak>
3. 点击「新建 API 密钥」，复制 `sk-` 开头的密钥

### 2. 配置环境变量

```bash
cd "AI Signature Generator"
cp .env.example .env   # 项目已自带 .env，如缺失可执行此命令
```

编辑 `.env`，把密钥粘贴到 `AI_API_KEY=` 后面：

```bash
AI_API_KEY=sk-xxxxxxxxxxxxxxxx
```

### 3. 安装依赖并启动

```bash
npm install
npm start
```

浏览器打开 <http://localhost:3000>，输入姓名即可生成。页面顶栏会显示「API 就绪」，表示配置成功。

> 开发模式（文件变更自动重启）：`npm run dev`

## 🔑 API 配置说明

所有配置都在项目根目录的 `.env` 文件中（不会提交到版本库、不会暴露到前端）：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PROVIDER` | 服务商：`siliconflow`（推荐）或 `openai`（OpenAI 兼容接口） | `siliconflow` |
| `AI_API_KEY` | API Key（必填） | 空 |
| `AI_MODEL` | 模型名，留空使用下表默认值 | 随服务商 |
| `AI_BASE_URL` | 接口地址，一般无需修改 | 随服务商 |
| `AI_IMAGE_SIZE` | 生成图片尺寸 | `1584x1056` |
| `PORT` | 服务端口 | `3000` |

### 模型选择与价格（硅基流动，价格以官方为准）

| 模型 | 价格/张 | 中文文字准确度 | 说明 |
| --- | --- | --- | --- |
| `Qwen/Qwen-Image`（**默认**） | 约 ¥0.3 | ★★★★★ | 官方主打文字渲染，中英文姓名最准确，推荐 |
| `Tongyi-MAI/Z-Image-Turbo` | 约 ¥0.1 | ★★★ | 性价比高，文字准确度一般 |
| `Kwai-Kolors/Kolors` | 免费 | ★★★ | 国风审美好，长句文字易出错 |
| `black-forest-labs/FLUX.1-schnell` | 免费 | ★★（中文弱） | 适合纯英文姓名 |

切换模型：修改 `.env` 中的 `AI_MODEL` 后重启。完整模型列表见 <https://siliconflow.cn/models>。

### 使用其他服务商

`PROVIDER=openai` 可对接任何 OpenAI 兼容的 `images/generations` 接口，例如：

```bash
# OpenAI（英文姓名效果好，中文较差）
PROVIDER=openai
AI_API_KEY=sk-...
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-image-1

# 智谱 AI（OpenAI 兼容；模型名与参数请以智谱官方文档为准）
PROVIDER=openai
AI_API_KEY=xxx
AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
AI_MODEL=cogview-4
```

## 💰 费用说明

- **每次完整生成 = 4 张图片**：默认模型 `Qwen/Qwen-Image` 约 ¥0.3/张 → **一次生成约 ¥1.2**
- **单独重新生成某款 = 1 张** → 约 ¥0.3
- 换用 `Tongyi-MAI/Z-Image-Turbo`（约 ¥0.1/张）可将成本降至 1/3；`Kolors`、`FLUX.1-schnell` 免费
- 硅基流动新用户注册即送体验额度，足够生成几十次
- 本服务端不会缓存结果冒充生成：每一次「生成 / 重新生成」都产生一次真实的 API 调用与费用

## 🖼 关于透明 PNG

AI 生图模型直接输出的图片不含透明通道（背景为纯白）。本站在**浏览器本地**用 Canvas 对生成图做白色背景抠除：白色越纯越透明、墨迹越深越不透明，边缘保留抗锯齿过渡，最终导出高清透明 PNG，可直接用于签名档、印章、水印等场景。

## 🧪 测试

```bash
npm test
```

测试通过内置的本地模拟生图服务（`scripts/mock-upstream.js`）验证完整链路：请求构造、提示词准确性、响应解析、图片落盘、错误映射、限流与静态页面，**不需要真实 API Key**。

本地联调（不产生费用）：

```bash
node scripts/mock-upstream.js          # 终端 1：模拟生图服务（9191 端口）
AI_BASE_URL=http://127.0.0.1:9191 AI_API_KEY=test npm start   # 终端 2：主服务
```

## ⚠️ 说明

- 本项目不伪造 AI 调用：未配置 API Key 时页面会明确提示，配置后每次生成均为实时调用
- AI 生成文字仍可能出现个别笔画误差，属模型特性；遇到错字点击「重新生成」即可，重新生成会产生新的费用
- 生成的签名仅供个人娱乐与设计参考，请勿用于仿冒他人签名或任何违法用途

## 🗂 项目结构

```
├── server.js               # 服务入口
├── lib/
│   ├── app.js              # Express 应用：/api/generate、/api/health
│   ├── providers.js        # 生图服务商适配（硅基流动 / OpenAI 兼容）
│   ├── prompts.js          # 5 种风格的中英文提示词
│   └── config.js           # 环境变量配置
├── public/                 # 前端（原生 HTML/CSS/JS，无构建步骤）
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   └── generated/          # 生成的图片（运行时创建，自动清理）
├── scripts/mock-upstream.js  # 本地模拟生图服务（联调/测试用）
├── test/server.test.js     # 自动化测试（node:test）
├── .env.example            # 配置模板
└── .env                    # 本地配置（已被 .gitignore 忽略）
```
