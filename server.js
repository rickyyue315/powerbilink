require('dotenv').config();

const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { Jimp, JimpMime } = require('jimp');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '12345678';
const JWT_SECRET = process.env.JWT_SECRET || 'powerbi-link-hub-secret';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const DATA_FILE = path.join(DATA_DIR, 'links.json');
const MAX_IMAGE_WIDTH = parseInt(process.env.MAX_IMAGE_WIDTH, 10) || 400;
const MAX_IMAGE_HEIGHT = parseInt(process.env.MAX_IMAGE_HEIGHT, 10) || 300;
const IMAGE_QUALITY = parseInt(process.env.IMAGE_QUALITY, 10) || 80;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.type(path.extname(filePath)).sendFile(filePath);
  } else {
    res.status(404).end();
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

function fitInsideDims(origW, origH, maxW, maxH) {
  if (origW <= maxW && origH <= maxH) return { w: origW, h: origH };
  const ratio = Math.min(maxW / origW, maxH / origH);
  return { w: Math.round(origW * ratio), h: Math.round(origH * ratio) };
}

async function compressImage(filePath) {
  try {
    const inputBuf = fs.readFileSync(filePath);
    const image = await Jimp.read(inputBuf);

    const { w, h } = fitInsideDims(image.bitmap.width, image.bitmap.height, MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT);
    image.resize({ w, h });

    const ext = path.extname(filePath).toLowerCase();
    const quality = ext === '.gif' ? Math.max(IMAGE_QUALITY - 10, 5) : IMAGE_QUALITY;
    const outputName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
    const outputPath = path.join(path.dirname(filePath), outputName);

    const buf = await image.getBuffer('image/jpeg', { quality });
    fs.writeFileSync(outputPath, buf);
    fs.unlinkSync(filePath);

    console.log('compressImage OK:', outputName, w + 'x' + h, buf.length, 'bytes');
    return outputName;
  } catch (err) {
    console.error('compressImage failed, keeping original:', err.message);
    return path.basename(filePath);
  }
}

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

app.post('/api/links', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { title, url, description, category } = req.body;
    if (!title || !url) {
      if (req.file) {
        const tmp = path.join(UPLOADS_DIR, req.file.filename);
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      }
      return res.status(400).json({ error: '標題和網址為必填' });
    }

    let imageFilename = null;
    if (req.file) {
      imageFilename = await compressImage(path.join(UPLOADS_DIR, req.file.filename));
    }

    const data = readLinks();
    const link = {
      id: uuidv4(),
      title,
      url,
      description: description || '',
      imageUrl: imageFilename ? `/uploads/${imageFilename}` : null,
      category: category || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.links.push(link);
    writeLinks(data);
    res.status(201).json(link);
  } catch (err) {
    console.error('POST error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.put('/api/links/:id', authMiddleware, upload.single('image'), async (req, res) => {
  try {
  const data = readLinks();
  const idx = data.links.findIndex(l => l.id === req.params.id);
  if (idx === -1) {
    if (req.file) {
      const tmp = path.join(UPLOADS_DIR, req.file.filename);
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
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
    const compressedFilename = await compressImage(path.join(UPLOADS_DIR, req.file.filename));
    existing.imageUrl = `/uploads/${compressedFilename}`;
  }
  existing.updatedAt = new Date().toISOString();
  data.links[idx] = existing;
  writeLinks(data);
  res.json(existing);
  } catch (err) {
    console.error('PUT error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
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

app.get('/api/diag', async (req, res) => {
  const result = {};
  try {
    const pixels = Buffer.alloc(400 * 300 * 4);
    for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
    const testPath = path.join(UPLOADS_DIR, '_diag_test.jpg');
    const img = await Jimp.fromBitmap({ data: pixels, width: 400, height: 300 });
    await img.write(testPath);
    result.engine = 'jimp';
    result.status = 'ok';
    result.fileWrite = fs.existsSync(testPath);
    result.fileSize = result.fileWrite ? fs.statSync(testPath).size : 0;
    fs.unlinkSync(testPath);
    
    // List uploads directory
    const files = fs.readdirSync(UPLOADS_DIR);
    result.uploadsCount = files.length;
    result.recentFiles = files.slice(-5);
  } catch (e) {
    result.engine = 'jimp';
    result.status = 'fail';
    result.error = e.message;
  }
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`PowerBI Link Hub running at http://localhost:${PORT}`);
  try {
    const pixels = Buffer.alloc(4, 255);
    Jimp.fromBitmap({ data: pixels, width: 1, height: 1 });
    console.log('jimp: OK');
  } catch (e) {
    console.error('jimp: FAIL -', e.message);
  }
});
