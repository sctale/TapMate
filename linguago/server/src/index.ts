import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { migrate } from './db.js';
import { ensureSeeded } from './seed/index.js';
import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import learningRoutes from './routes/learning.js';
import dashboardRoutes from './routes/dashboard.js';
import communityRoutes from './routes/community.js';
import gamificationRoutes from './routes/gamification.js';

const app = express();
app.use(cors());
app.use(express.json());

// 启动时自动迁移 + 播种（首次）
migrate();
ensureSeeded();

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'LinguaGo API' }));

app.use('/api/auth', authRoutes);
app.use('/api', courseRoutes);
app.use('/api', learningRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', communityRoutes);
app.use('/api', gamificationRoutes);

// 统一错误处理
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? '参数错误' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`[LinguaGo] API 已启动: http://localhost:${PORT}`);
});
