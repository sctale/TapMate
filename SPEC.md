# TapMate 优化 SPEC（Agent 接力文档）

> 更新时间：2026-09-13 / 当前版本：**v0.6.0**（已发布）
> 用途：代码审查后的待办清单，供任何 Agent 按项接力执行。
> 每完成一项：勾选 `[x]`、写入 CHANGELOG、走标准发布链路（见 §4）。

---

## 1. 项目快照（接力前必读）

- **定位**：Android 多模型聚合聊天 App（Expo RN 56 / RN 0.85.3 / TypeScript strict）
- **架构**：`src/providers/`（厂商适配器：chatEngine 按 apiProtocol 分发）→ `src/state/ProvidersContext` → `src/database/chatDB`(expo-sqlite) → `src/secure/credentials`(expo-secure-store/Keystore)；UI 全部功能入口收进右侧悬浮球（ModelBall），无顶部 chrome
- **校验命令**（改动后必跑，全绿才可发布）：
  ```powershell
  npm run typecheck; npm run lint; npm test
  ```
- **硬约束**（详见项目记忆 project_memory.md，违反会造成实际损失）：
  - 版本号单一数据源 `app.json.expo.version`，**禁止手改**其他处版本号，由发布脚本同步
  - release APK 必须私有 keystore 签名（`keystore/` + `keystore.properties` 不入库、**已备份**）；发布脚本含 apksigner 校验，debug 签名直接中止
  - 编辑 `scripts/release-app.ps1`（含中文）后必须补回 UTF-8 BOM 并用 `[PSParser]::Tokenize` 验证（Edit 工具会丢 BOM）
  - `android/` 被 gitignore，改原生配置必须做 Expo config plugin（参考 `plugins/withReleaseSigning.js`），prebuild 会覆盖手工修改
  - `predictiveBackGestureEnabled` 必须保持 `false`（true 会让返回键绕过 RN BackHandler，设置页无法退出——v0.5.4 教训）

## 2. 已完成（勿重复做）

- [x] P0-1 release 私有签名 + apksigner 校验（v0.5.2）
- [x] P0-2 retryOne 上下文重复修复 + chatContext.ts 回归单测（v0.5.2）
- [x] P0-3 发布脚本 --notes-file（v0.5.2）
- [x] APK/.tmp-icons/keystore 移出 git 跟踪 + .gitignore（v0.5.2）
- [x] 官网全屏页去控制条、刷新/退出进球菜单（v0.5.3）
- [x] 悬浮球常态变浅/展开加深（v0.5.3）
- [x] 配置页去返回按钮（v0.5.3）
- [x] 悬浮球拖动后点击失灵（movedRef 复位时机）（v0.5.4）
- [x] 键盘遮挡网页输入框（edge-to-edge adjustResize 失效，paddingBottom=kbdH）（v0.5.4）
- [x] 设置页返回键失效（关 predictive back）（v0.5.4）
- [x] 官网页状态栏避让按厂商开关 `ProviderDef.webImmersive`（v0.5.4）
- [x] **回滚厂商分叉**：v0.6.0 起官网页一律 RN 补状态栏白条（用户反馈 DeepSeek/千问顶部位置分叉割裂，`webImmersive` 字段删除）
- [x] P1-5 推理模型空闲超时分级 180s（`chatEngine.idleTimeoutMsFor` + 单测）（v0.6.0）
- [x] P1-6 toast 稳定引用：HomeScreen 回调/memo 依赖 `toast.show` 而非 toast 对象，缓解流式期整树重渲染（v0.6.0）

## 3. 待办清单

### P1（中风险，建议 v0.5.5 / v0.6.0 消化）

- [ ] **P1-4 解绑厂商不清 WebView Cookie**
  - 现状：`ProvidersContext.removeConfig` 只删 SecureStore 配置，官网登录态仍在 CookieManager → 用户以为解绑，实际仍登录
  - 方案：解绑 web 通道厂商时同步清对应域 Cookie（react-native-webview 无按域 API 时用 `WebStorage`/全量清 + 明示提示）
  - 验收：解绑 ChatGPT 后重进官网页为未登录态；单测/手测记录

- [x] ~~P1-5 长思考模型 45s 空闲超时误杀~~（v0.6.0 已做：idleTimeoutMsFor 分级 180s）
  - 现状：`HomeScreen.tsx` `IDLE_TIMEOUT_MS=45000`；o 系列/deepseek-reasoner 思考期无增量输出会被判超时丢弃
  - 方案：按模型分级（已知推理模型 120-180s），或收到任意 SSE 事件（含心跳/role 帧）即续命
  - 验收：deepseek-reasoner 长思考回答不被掐断

- [x] ~~P1-6 useToast 返回不稳定对象~~（v0.6.0 已做：HomeScreen 依赖 toast.show 稳定引用）
  - 现状：`Toast.tsx` 每次 render 返回新 `{show,node}` → HomeScreen 大量 memo 失效，每 120ms flush 全量重渲染
  - 方案：`useMemo`/`useRef` 稳定返回值
  - 验收：流式期间 React DevTools Profiler 中 ModelBall/消息列表无整树 re-render

- [ ] **P1-7 chatDB 初始化失败永久卡死**
  - 现状：`chatDB.ts` dbPromise 缓存 rejected promise，首开失败后所有操作永远失败且静默
  - 方案：catch 时重置 `dbPromise=null` 允许重试 + 失败 toast 提示
  - 验收：模拟首开失败（改名 db 文件）后二次进入可恢复

- [ ] **P1-10 流式中途杀进程回答永久丢失**
  - 现状：assistant 消息先空内容入库，仅 settle 时回填；半截内容只在内存 buffer
  - 方案：settle 之外每 2-3s 或每 ~500 字符增量 `updateMessage`
  - 验收：流式中强杀 App，重进会话可见半截回答

- [ ] **P1-8 git 历史瘦身（可选，趁开源早期）**
  - 现状：v0.4.0–v0.5.1 共 6 个 APK（~480MB pack）仍在历史（索引已删，blob 未清）
  - 方案：`git filter-repo --invert-paths --path-glob '*.apk'`，强推 main；**需用户确认**（破坏性操作）
  - 验收：`git count-objects -v` size-pack 显著下降

### P2（低风险，批量消化）

- [ ] **P2-a HomeScreen 拆分**（1039 行上帝组件）：抽 `useChatStreams`（流注册表+settle+超时）与 `useCompareMode` 两个 hook；行为不变，21 单测保持绿
- [ ] **P2-b 死代码清理**：HomeScreen styles 中 v0.3 顶栏残留（header/title/headerBtn*/chip*/webHint*/chromeOverlay/topEdge 等，约 120 行，grep 确认无引用后删）
- [ ] **P2-c DB 写失败静默吞**：全库 `.catch(() => {})` 至少改 `console.warn`；`updateMessage` 同步 `sessions.updated_at`
- [ ] **P2-d 列表性能**：流式 flush 时 `scrollToEnd({animated:false})` 防动画打断抖动；`listMessages` 加 LIMIT（如 500）
- [ ] **P2-e release 开 minify**：gradle.properties `android.enableMinifyInReleaseBuilds=true`（验证 proguard 不误伤 WebView/SQLite 反射后降体积）
- [ ] **P2-f Markdown 链接 scheme 白名单**：`MarkdownText.tsx` openURL 仅放行 http(s)，防 AI 输出携带 intent://、tel:
- [ ] **P2-g Manifest 权限裁剪**：移除模板残留 SYSTEM_ALERT_WINDOW / 存储权限（targetSdk 36 本已无效）
- [ ] **P2-h 自定义 Base URL 强制 https** + 保存时明示"Key 将发送到该地址"（ConfigScreen）
- [ ] **P2-i 无障碍补齐**：发送按钮/悬浮球菜单行/消息气泡补 accessibilityRole+label；悬浮球 46dp、sendBtn ~42dp 扩到 48dp 或加 hitSlop
- [ ] **P2-j 核心路径测试补齐**：chatDB 内存态集成测试（vitest + expo-sqlite mock）；CompareSheet 选择逻辑；无 coverage 配置（`npm run test:coverage`）
- [ ] **P2-k 深色模式评估**（roadmap 级，产品决策，勿直接做）

## 4. 标准发布链路（每次改动完成后默认走完）

```powershell
# 前置：CHANGELOG.md 顶部新增 ## [X.Y.Z] - 日期 条目（feat→次版本+1，fix→补丁+1）
powershell -ExecutionPolicy Bypass -File scripts\release-app.ps1 -Version X.Y.Z `
  -CommitMsg "fix: vX.Y.Z——一句话中文说明"
```
脚本自动：版本同步（app.json/package.json/package-lock/build.gradle versionCode=major*10000+minor*100+patch/README）→ tsc → gradlew assembleRelease → aapt 版本校验 + apksigner 签名校验 → 复制 `TapMate-vX.Y.Z.apk` → git commit+push → `gh release create`（说明取自 CHANGELOG）。**不用 GitHub Actions。**

> 注：脚本第 2 步会跑 `npx expo prebuild`？——不会。若改动涉及原生配置（app.json plugins/android 块），发布前手动 `npx expo prebuild --platform android --clean --no-install` 并检查生成产物（如 signingConfigs 注入、manifest 属性），再跑脚本。

## 5. 接力 Agent 注意事项

- **UI 改动**：按用户规则需用预览卡展示效果；RN 项目无法直接 HTML 预览时，至少构建测试 APK 放根目录让用户实机验证（命名 `TapMate-vX.Y.Z-test.apk`，发布后删除）
- **间歇性 Bug**：用户已认可 TRAE-debugger 插桩取证流程（v0.5.4 两项根因均由此确认）；release 包需临时给 `android/app/src/main/AndroidManifest.xml` 加 `android:usesCleartextTraffic="true"` 才能 HTTP 上报，**取证后必须 prebuild --clean 回滚**
- **调试产物**：`debug-*.md`、`.dbg/`、插桩代码（`#region debug-point`）在用户确认修复后全部删除，不得进入发布提交
- **一次一个 P1 项**：每项独立走发布链路（补丁号 +1），不要攒大包
