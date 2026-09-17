const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config();

// Set Google DNS to ensure SRV records for Atlas resolve cleanly on Windows
if (process.platform === 'win32') {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  } catch (e) {
    // Ignore if unable to set custom DNS
  }
}

let isConnected = false;
let lastError = null;
let activeConnectionMode = 'disconnected';
let cachedPromise = null;

// Disable command buffering in serverless to fail fast instead of hanging on timeouts
mongoose.set('bufferCommands', false);

const formatUri = (rawUri) => {
  if (!rawUri) return '';
  let uri = rawUri.trim().replace(/^["']|["']$/g, '');
  
  if (uri.startsWith('mongodb+srv://') || uri.startsWith('mongodb://')) {
    // If uri has mongodb.net/? or mongodb.net? (empty db name before query string)
    if (/mongodb\.net\/\?/.test(uri)) {
      uri = uri.replace('mongodb.net/?', 'mongodb.net/certificate_db?');
    } else if (/mongodb\.net\/?$/.test(uri)) {
      uri = uri.replace(/mongodb\.net\/?$/, 'mongodb.net/certificate_db?retryWrites=true&w=majority');
    } else if (!/mongodb\.net\/[a-zA-Z0-9_-]+/.test(uri) && uri.includes('?')) {
      uri = uri.replace('?', '/certificate_db?');
    }
  }
  return uri;
};

const connectDB = async (customUri = null) => {
  const isCloud = !!(process.env.VERCEL || process.env.RENDER || process.env.NODE_ENV === 'production');
  const primaryUri = formatUri(customUri || process.env.MONGODB_URI);
  const localFallbackUri = isCloud ? null : 'mongodb://127.0.0.1:27017/certificate_db';

  if (!primaryUri && !localFallbackUri) {
    lastError = 'MONGODB_URI is not set. Please provide a MongoDB Atlas connection string in your environment variables.';
    console.warn('⚠️ ' + lastError);
    return false;
  }

  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return true;
  }

  if (cachedPromise) {
    return cachedPromise;
  }

  cachedPromise = (async () => {
    // Try primary URI first (e.g. MongoDB Atlas)
    if (primaryUri) {
      try {
        console.log(`📡 Connecting to Primary MongoDB (${maskUri(primaryUri)})...`);
        const conn = await mongoose.connect(primaryUri, {
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000,
          maxPoolSize: 10,
        });

        isConnected = true;
        lastError = null;
        activeConnectionMode = primaryUri.includes('mongodb+srv') ? 'MongoDB Atlas' : 'Primary MongoDB';
        console.log(`✅ ${activeConnectionMode} Connected: ${conn.connection.host}`);
        await seedDefaults();
        return true;
      } catch (atlasErr) {
        console.warn(`⚠️ Primary MongoDB connection failed: ${atlasErr.message}`);
        cachedPromise = null;
        if (isCloud) {
          isConnected = false;
          lastError = atlasErr.message;
          return false;
        }
        console.log('🔄 Attempting automatic fallback to local MongoDB (127.0.0.1:27017)...');
      }
    }

    if (localFallbackUri) {
      try {
        const conn = await mongoose.connect(localFallbackUri, {
          serverSelectionTimeoutMS: 4000,
          connectTimeoutMS: 4000,
          maxPoolSize: 10,
        });

        isConnected = true;
        lastError = null;
        activeConnectionMode = 'Local MongoDB (Fallback)';
        console.log(`✅ Local MongoDB Connected: ${conn.connection.host}`);
        await seedDefaults();
        return true;
      } catch (err) {
        isConnected = false;
        lastError = err.message;
        cachedPromise = null;
        console.error(`❌ All MongoDB Connection attempts failed: ${err.message}`);
        return false;
      }
    }

    return false;
  })();

  return cachedPromise;
};

const seedDefaults = async () => {
  try {
    const Admin = require('./models/Admin');
    const Template = require('./models/Template');
    const bcrypt = require('bcryptjs');

    // 1. Seed Admin if none exists
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      const defaultUser = process.env.DEFAULT_ADMIN_USER || 'admin';
      const defaultPass = process.env.DEFAULT_ADMIN_PASS || 'admin123';
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(defaultPass, salt);
      await Admin.create({
        username: defaultUser,
        password_hash: hash
      });
      console.log(`👤 Default Admin created: ${defaultUser} / ${defaultPass}`);
    }

    // 2. Seed Default Participation Template if none exists
    let participationTemplate = await Template.findOne({ template_type: 'participation' });
    if (!participationTemplate) {
      // Check legacy template without template_type
      const legacyTemplate = await Template.findOne({ template_type: { $exists: false } });
      if (legacyTemplate) {
        legacyTemplate.template_type = 'participation';
        await legacyTemplate.save();
        participationTemplate = legacyTemplate;
      } else {
        participationTemplate = await Template.create({
          template_name: 'Sri Vasavi Engineering College (Aikyam - Participation)',
          template_file: '/templates/svec_template.jpg',
          template_type: 'participation',
          is_active: true,
          fields_config: {
            canvas_width: 1024,
            canvas_height: 682,
            name: {
              x: 350,
              y: 355,
              fontSize: 20,
              fontFamily: 'Playfair Display, serif',
              fontWeight: 'bold',
              color: '#1a1a2e',
              align: 'left'
            },
            semester: {
              x: 125,
              y: 382,
              fontSize: 16,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 'bold',
              color: '#1a1a2e',
              align: 'left'
            },
            branch: {
              x: 360,
              y: 382,
              fontSize: 16,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 'bold',
              color: '#1a1a2e',
              align: 'left'
            },
            roll_no: {
              x: 690,
              y: 382,
              fontSize: 16,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 'bold',
              color: '#1a1a2e',
              align: 'left'
            },
            events: {
              x: 400,
              y: 409,
              fontSize: 16,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 'bold',
              color: '#7b1113',
              align: 'left'
            }
          }
        });
        console.log('📜 Default Participation template seeded!');
      }
    }

    // 3. Seed Default Coordination Template if none exists
    const coordinationTemplate = await Template.findOne({ template_type: 'coordination' });
    if (!coordinationTemplate) {
      await Template.create({
        template_name: 'Sri Vasavi Engineering College (Certificate of Coordination)',
        template_file: '/templates/svec_coordinator_template.jpg',
        template_type: 'coordination',
        is_active: true,
        fields_config: {
          canvas_width: 1024,
          canvas_height: 682,
          name: {
            x: 350,
            y: 355,
            fontSize: 20,
            fontFamily: 'Playfair Display, serif',
            fontWeight: 'bold',
            color: '#1a1a2e',
            align: 'left'
          },
          semester: {
            x: 125,
            y: 382,
            fontSize: 16,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'bold',
            color: '#1a1a2e',
            align: 'left'
          },
          branch: {
            x: 360,
            y: 382,
            fontSize: 16,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'bold',
            color: '#1a1a2e',
            align: 'left'
          },
          roll_no: {
            x: 690,
            y: 382,
            fontSize: 16,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'bold',
            color: '#1a1a2e',
            align: 'left'
          },
          events: {
            x: 400,
            y: 409,
            fontSize: 16,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'bold',
            color: '#7b1113',
            align: 'left'
          },
          designation: {
            x: 512,
            y: 440,
            fontSize: 15,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'bold',
            color: '#7b1113',
            align: 'center'
          }
        }
      });
      console.log('⭐ Default Coordination template seeded!');
    }
  } catch (err) {
    console.error('Error seeding defaults:', err.message);
  }
};

const getStatus = () => {
  return {
    connected: isConnected && mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
    mode: activeConnectionMode,
    error: lastError,
    uriMasked: maskUri(process.env.MONGODB_URI || '')
  };
};

const maskUri = (uri) => {
  if (!uri) return '';
  return uri.replace(/\/\/(.*?):(.*?)@/, '//***:***@');
};

module.exports = {
  connectDB,
  seedDefaults,
  getStatus
};
