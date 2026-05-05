require('dotenv').config();

const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '12345678';
const JWT_SECRET = process.env.JWT_SECRET || 'powerbi-link-hub-secret';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const DATA_FILE = path.join(DATA_DIR, 'links.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

function readLinks() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { links: [] };
  }
}

function writeLinks(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登入' });
  }
  try {
    jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '登入已過期，請重新登入' });
  }
}

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '密碼錯誤' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

app.get('/api/links', (req, res) => {
  const data = readLinks();
  const { search, category } = req.query;
  let links = data.links;

  if (search) {
    const q = search.toLowerCase();
    links = links.filter(l =>
      l.title.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q) ||
      l.url.toLowerCase().includes(q)
    );
  }
  if (category) {
    links = links.filter(l => l.category === category);
  }

  links.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(links);
});

app.get('/api/categories', (req, res) => {
  const data = readLinks();
  const cats = [...new Set(data.links.map(l => l.category).filter(Boolean))];
  res.json(cats);
});

app.post('/api/links', authMiddleware, upload.single('image'), (req, res) => {
  const { title, url, description, category } = req.body;
  if (!title || !url) {
    return res.status(400).json({ error: '標題和網址為必填' });
  }
  const data = readLinks();
  const link = {
    id: uuidv4(),
    title,
    url,
    description: description || '',
    imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
    category: category || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.links.push(link);
  writeLinks(data);
  res.status(201).json(link);
});

app.put('/api/links/:id', authMiddleware, upload.single('image'), (req, res) => {
  const data = readLinks();
  const idx = data.links.findIndex(l => l.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: '連結不存在' });
  }
  const existing = data.links[idx];
  const { title, url, description, category } = req.body;
  if (title !== undefined) existing.title = title;
  if (url !== undefined) existing.url = url;
  if (description !== undefined) existing.description = description;
  if (category !== undefined) existing.category = category;
  if (req.file) {
    if (existing.imageUrl) {
      const oldPath = path.join(UPLOADS_DIR, existing.imageUrl.replace(/^\/uploads\//, ''));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    existing.imageUrl = `/uploads/${req.file.filename}`;
  }
  existing.updatedAt = new Date().toISOString();
  data.links[idx] = existing;
  writeLinks(data);
  res.json(existing);
});

app.delete('/api/links/:id', authMiddleware, (req, res) => {
  const data = readLinks();
  const idx = data.links.findIndex(l => l.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: '連結不存在' });
  }
  const removed = data.links[idx];
  if (removed.imageUrl) {
    const oldPath = path.join(UPLOADS_DIR, removed.imageUrl.replace(/^\/uploads\//, ''));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  data.links.splice(idx, 1);
  writeLinks(data);
  res.json({ success: true });
});

app.post('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ valid: true });
});

app.listen(PORT, () => {
  console.log(`PowerBI Link Hub running at http://localhost:${PORT}`);
});
