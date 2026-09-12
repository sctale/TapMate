# LinguaGo 多语学堂 — 设计文档

> 日期：2026-09-12 ｜ 状态：按推荐方案执行
> 多语种（英/日/韩）沉浸式在线语言学习平台

## 1. 产品定位

面向中文母语学习者的多语种学习平台，覆盖英语、日语、韩语，打造「分级课程 + 互动练习 + 沉浸反馈」的完整学习闭环：入学测评 → 课程学习 → 间隔复习 → 社区打卡 → 成就激励。

## 2. 形态与架构

- 交付形态：响应式 Web 应用（桌面 / 移动浏览器）
- 架构：前后端分离 Monorepo
  - `server/`：Express + TypeScript REST API（端口 3001）
  - `web/`：React 18 + Vite SPA（端口 5173，开发代理 `/api` → 3001）

备选方案与取舍：

| 方案 | 取舍 |
|---|---|
| ✅ Vite SPA + Express API | 登录后互动型应用的主流形态（对标多邻国 Web），结构简单、迭代快，API 天然可复用给后续移动端 |
| Next.js 全栈 SSR | 更适合内容营销 / 强 SEO 场景，本产品为应用型学习工具，暂不需要 |
| React Native App | 移动体验好，但 Web 先行可最快验证产品，本期不做 |

## 3. 技术栈（全部主流标准）

| 层 | 选型 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + React Router 6 + Zustand + Recharts + lucide-react |
| 后端 | Node.js + Express 4 + TypeScript + zod |
| 数据库 | SQLite（better-sqlite3，文件型零配置，后续可平滑迁移 Postgres） |
| 认证 | JWT Bearer + bcryptjs 密码哈希 |
| 语音 | 浏览器原生 Web Speech API：speechSynthesis（TTS）+ SpeechRecognition（跟读识别） |

## 4. 分级课程体系（行业标准）

| 语言 | 分级标准 | 首发内容 |
|---|---|---|
| 英语 | CEFR | A1、A2（各 2 单元 × 2 课） |
| 日语 | JLPT | N5、N4（各 2 单元 × 2 课） |
| 韩语 | TOPIK | 1 级、2 级（各 2 单元 × 2 课） |

结构：语言 → 级别 → 单元 → 课程 → 练习。每课含 8 个词汇、2 个语法点、6 道互动练习（词汇 / 听力 / 语法 / 口语混合）。课程按 Duolingo 式线性解锁：完成前一课解锁下一课。

## 5. 功能设计

### 5.1 用户系统
注册（邮箱 + 密码）、登录、JWT 鉴权、个人资料（昵称、母语、学习目标标签）。

### 5.2 互动学习模块（课程播放器）
每课学习流程：词汇闪卡（可发音）→ 语法讲解 → 互动练习 → 结算。
- 单词记忆：双面闪卡 + 四选一测验，浏览器 TTS 发音
- 语法练习：单选题 + 填空题
- 听力训练：TTS 播放 → 理解选择 / 听写
- 口语跟读：TTS 示范 → 麦克风识别（SpeechRecognition）→ 文本相似度评分（0-100），≥60 通过、≥90 满分激励；不支持的浏览器降级为自评跟读

### 5.3 学习进度追踪
- 课程完成状态 + 最佳成绩
- 单词间隔重复（简化 SM-2：连对梯度 1/3/7/16/35 天，答错重置）
- 每日活动（时长 / XP / 课程数 / 新词数）+ 连续打卡 streak
- 仪表盘：近 14 天 XP 折线图、各语言进度环、待复习数

### 5.4 个性化学习路径（可解释规则引擎）
- 冷启动：入学测评（每语言 8 题难度递增）→ 推荐起点级别
- 推荐优先级：到期复习 > 当前课程下一课 > 错题率 > 40% 的薄弱课重练 > 未开始的新语言
- 兴趣标签（日常 / 旅行 / 商务 / 考试）影响课程主题排序

### 5.5 社区交流
- 动态 Feed：手动发帖 + 完课自动打卡动态
- 点赞、评论；每课关联课程讨论

### 5.6 成就激励
- XP 经验值（完课 50 + 正确率加成，复习每词 +2）与用户等级（每 200 XP 升 1 级）
- 连续打卡 streak（火焰标识）
- 徽章 10 枚：初试锋芒 / 三日之约 / 一周坚持 / 月度大师 / 词汇新星 / 词汇达人 / 单元通关 / 级别毕业 / 口语之星 / 社区之声
- 排行榜：周榜（本周 XP）/ 总榜

## 6. 数据模型

users、languages、levels、units、lessons、vocabularies、grammar_rules、exercises、user_progress、user_vocab_stats（SRS）、daily_activity、user_languages（定级 + 兴趣）、placement_results、posts、comments、post_likes、badges、user_badges，共 18 张表，SQLite 外键约束。

## 7. API 设计（REST，前缀 /api）

- auth：`POST /auth/register`、`POST /auth/login`、`GET /auth/me`
- 课程：`GET /languages`、`GET /languages/:code/path`、`GET /lessons/:id`
- 学习：`POST /lessons/:id/complete`、`GET /review/queue`、`POST /review/answer`
- 测评：`GET /placement/:code/quiz`、`POST /placement/:code/submit`
- 仪表：`GET /dashboard`
- 社区：`GET/POST /community/posts`、`POST /community/posts/:id/like`、`GET/POST /community/posts/:id/comments`
- 激励：`GET /leaderboard`、`GET /badges`

## 8. 关键算法

- 口语评分：文本归一化（大小写 / 标点）→ 词级 F1 + 字符级 Levenshtein 相似度加权 → 0-100 分
- SRS：答对 stage+1，间隔 [1,3,7,16,35,60] 天封顶；答错重置 stage=0、次日复习
- 推荐引擎：纯规则，每条推荐附带理由文案，可解释可调试

## 9. 目录结构

```
linguago/
├── server/               # Express API
│   └── src/
│       ├── index.ts      # 入口：迁移 + 自动播种 + 路由挂载
│       ├── db.ts         # SQLite 初始化与建表
│       ├── seed/         # 英/日/韩课程内容 + 徽章 + 演示数据
│       ├── middleware/   # JWT 鉴权
│       ├── services/     # SRS / 相似度 / 推荐 / 徽章
│       └── routes/       # auth / courses / learning / dashboard / community / gamification
└── web/                  # React SPA
    └── src/
        ├── api/          # axios 封装 + 类型
        ├── stores/       # zustand（auth 等）
        ├── hooks/        # useSpeech（TTS + 语音识别）
        ├── components/   # 布局 / UI 组件 / 练习播放器 / 闪卡 / 帖子卡片
        └── pages/        # 首页 / 登录注册 / 入门引导 / 仪表盘 / 课程路径 / 学习器 / 复习 / 社区 / 成就 / 个人中心
```

## 10. 测试与验收

- 单元测试（vitest）：SRS 状态机、口语相似度评分
- 构建验收：server tsc 类型检查 + web vite build 通过
- 端到端手测：注册 → 测评定级 → 学完一课（含口语跟读）→ 到期复习 → 社区发帖点赞 → 徽章与排行榜出现

## 11. 范围说明

本期一次性交付 P1（基座）+ P2（智能化）+ P3（社区成就）；内容规模为每语言 2 级别 × 4 课。付费、直播课、真人对话、更高级别内容不在本期范围，接口与数据结构已预留扩展。
