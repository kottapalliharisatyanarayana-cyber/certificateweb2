const dns = require('dns');
if (process.platform === 'win32') {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  } catch (e) {}
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { connectDB, getStatus } = require('./db');

// Import route modules
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const eventRoutes = require('./routes/events');
const uploadRoutes = require('./routes/upload');
const templateRoutes = require('./routes/templates');
const certificateRoutes = require('./routes/certificates');

// Import models for system stats
const Student = require('./models/Student');
const Event = require('./models/Event');
const Participation = require('./models/Participation');
const Template = require('./models/Template');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads/templates directory exists (skip on Vercel read-only filesystem)
if (!process.env.VERCEL) {
  try {
    const uploadsDir = path.join(__dirname, '../uploads/templates');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  } catch (e) {
    console.warn('Could not create uploadsDir:', e.message);
  }
}

// URL restoration for Vercel serverless rewrites:
// If Vercel rewrote the request to /api, restore the original URI from x-forwarded-uri or x-matched-path
app.use((req, res, next) => {
  const forwardUri = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'];
  if (forwardUri && (req.url === '/api' || req.url === '/api/' || req.url === '')) {
    req.url = forwardUri;
  }
  next();
});

// Core Middlewares
app.use(cors());

// Vercel Serverless Stream Fix:
// If req.body has already been consumed and parsed by Vercel Serverless Function runtime,
// mark req._body = true so express.json() / body-parser does not hang waiting for stream EOF.
app.use((req, res, next) => {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {}
    }
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      req._body = true;
    }
  }
  next();
});

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static asset folders (for local development)
if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, '../frontend')));
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
}

// Process-level unhandled rejection protection
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
});

// Database connection middleware for all API routes (Vercel serverless & local)
app.use(async (req, res, next) => {
  // Always allow health checks and base API info to respond without blocking on DB
  if (req.path.endsWith('/health') || req.path === '/api' || req.path === '/api/' || req.path === '/') {
    return next();
  }

  try {
    const connected = await connectDB();
    if (!connected) {
      const dbStatus = getStatus();
      return res.status(503).json({
        success: false,
        message: 'Database connection is not available: ' + (dbStatus.error || 'Please verify MONGODB_URI in Vercel Environment Variables and ensure MongoDB Atlas Network Access whitelist includes 0.0.0.0/0.'),
        diagnosis: {
          hasMongoUri: !!process.env.MONGODB_URI,
          error: dbStatus.error,
          mode: dbStatus.mode
        }
      });
    }
  } catch (dbErr) {
    return res.status(503).json({
      success: false,
      message: 'Database error: ' + dbErr.message
    });
  }
  next();
});

// Root API Status Endpoint
app.get(['/api', '/api/'], (req, res) => {
  res.json({
    status: 'online',
    service: 'Certificate Generation Web System API',
    endpoints: {
      health: '/api/health',
      stats: '/api/stats',
      students: '/api/students',
      events: '/api/events',
      templates: '/api/templates',
      certificates: '/api/certificates',
      upload: '/api/upload'
    }
  });
});

// Health & System Status Endpoint
app.get(['/api/health', '/health'], (req, res) => {
  const dbStatus = getStatus();
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    version: '1.0.0'
  });
});

// Admin System Statistics Endpoint
app.get(['/api/stats', '/stats'], async (req, res) => {
  try {
    const [totalStudents, totalEvents, totalParticipations, activePartTemplate, activeCoordTemplate, activeApprecTemplate] = await Promise.all([
      Student.countDocuments(),
      Event.countDocuments(),
      Participation.countDocuments({ participated: true }),
      Template.findOne({ template_type: 'participation', is_active: true }).select('template_name template_file')
        .then(t => t || Template.findOne({ is_active: true }).select('template_name template_file')),
      Template.findOne({ template_type: 'coordination', is_active: true }).select('template_name template_file')
        .then(t => t || Template.findOne({ template_type: 'coordination' }).select('template_name template_file')),
      Template.findOne({ template_type: 'appreciation', is_active: true }).select('template_name template_file')
        .then(t => t || Template.findOne({ template_type: 'appreciation' }).select('template_name template_file'))
    ]);

    const dbStatus = getStatus();

    res.json({
      success: true,
      stats: {
        totalStudents,
        totalEvents,
        totalParticipations,
        activeTemplate: activePartTemplate ? activePartTemplate.template_name : 'Sri Vasavi College (Participation)',
        activeCoordTemplate: activeCoordTemplate ? activeCoordTemplate.template_name : 'Certificate of Coordination',
        activeApprecTemplate: activeApprecTemplate ? activeApprecTemplate.template_name : 'Certificate of Appreciation',
        dbMode: dbStatus.mode,
        dbConnected: dbStatus.connected
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve system statistics: ' + err.message
    });
  }
});

// Sample file download aliases
app.get(['/api/sample/appreciation-excel', '/sample/appreciation-excel'], (req, res) => {
  res.redirect('/api/upload/sample-appreciation-excel');
});

// Mount API Routes (supports both /api/route and /route for Vercel rewrites)
app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/students', '/students'], studentRoutes);
app.use(['/api/events', '/events'], eventRoutes);
app.use(['/api/upload', '/upload'], uploadRoutes);
app.use(['/api/templates', '/templates'], templateRoutes);
app.use(['/api/certificates', '/certificates'], certificateRoutes);

if (!process.env.VERCEL) {
  // Admin portal route alias (Local development)
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin.html'));
  });

  // SPA fallback for student portal (Local development)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return next();
    }
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });
}

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: 'File upload error: ' + err.message });
  }
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Start Server with automatic port fallback
const http = require('http');

const listenOnPort = (server, port, maxAttempts = 5) => {
  return new Promise((resolve, reject) => {
    let currentPort = Number(port);
    let attempts = 0;

    const tryListen = () => {
      attempts++;
      server.listen(currentPort, '0.0.0.0');
    };

    server.once('listening', () => {
      resolve(currentPort);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
        console.warn(`⚠️ Port ${currentPort} is currently in use. Trying next available port: ${currentPort + 1}...`);
        currentPort++;
        setTimeout(tryListen, 250);
      } else {
        reject(err);
      }
    });

    tryListen();
  });
};

const startServer = async () => {
  try {
    await connectDB();
    const server = http.createServer(app);
    const activePort = await listenOnPort(server, PORT);

    console.log('====================================================');
    console.log('📜 AUTOMATIC CERTIFICATE GENERATION WEB SYSTEM');
    console.log(`🌐 Server running at: http://localhost:${activePort}`);
    console.log(`🎓 Student Portal:    http://localhost:${activePort}/`);
    console.log(`🔐 Admin Dashboard:   http://localhost:${activePort}/admin`);
    console.log(`📡 Health Check:      http://localhost:${activePort}/api/health`);
    console.log('====================================================');
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

if (!process.env.VERCEL) {
  startServer();
}

module.exports = app;
