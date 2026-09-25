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

// Isolated database name for certificateweb2 (Coordinators Portal)
// Disconnected from certificate-portal-29kq to prevent data reflection
const DB_NAME = process.env.MONGODB_DB_NAME || 'coordinator_certificate_db';

const formatUri = (rawUri) => {
  if (!rawUri) return '';
  let uri = rawUri.trim().replace(/^["']|["']$/g, '');
  
  if (uri.startsWith('mongodb+srv://') || uri.startsWith('mongodb://')) {
    // If uri specifies certificate_db, replace it with isolated coordinator_certificate_db
    if (uri.includes('/certificate_db')) {
      uri = uri.replace('/certificate_db', `/${DB_NAME}`);
    } else if (/mongodb\.net\/\?/.test(uri)) {
      uri = uri.replace('mongodb.net/?', `mongodb.net/${DB_NAME}?`);
    } else if (/mongodb\.net\/?$/.test(uri)) {
      uri = uri.replace(/mongodb\.net\/?$/, `mongodb.net/${DB_NAME}?retryWrites=true&w=majority`);
    } else if (!/mongodb\.net\/[a-zA-Z0-9_-]+/.test(uri) && uri.includes('?')) {
      uri = uri.replace('?', `/${DB_NAME}?`);
    }
  }
  return uri;
};

const connectDB = async (customUri = null) => {
  const isCloud = !!(process.env.VERCEL || process.env.RENDER || process.env.NODE_ENV === 'production');
  const primaryUri = formatUri(customUri || process.env.MONGODB_URI);
  const localFallbackUri = isCloud ? null : `mongodb://127.0.0.1:27017/${DB_NAME}`;

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

    // 1. Seed or Sync Admin Accounts
    const salt = await bcrypt.genSalt(10);

    // Sync default admin (admin / admin@123)
    const defaultUser = (process.env.DEFAULT_ADMIN_USER || 'admin').trim().toLowerCase();
    const defaultPass = process.env.DEFAULT_ADMIN_PASS || 'admin@123';
    let defaultAdmin = await Admin.findOne({ username: defaultUser });
    if (!defaultAdmin) {
      const hash = await bcrypt.hash(defaultPass, salt);
      await Admin.create({
        username: defaultUser,
        password_hash: hash
      });
      console.log(`👤 Admin created: ${defaultUser} / ${defaultPass}`);
    } else {
      // Sync password to ensure login works with .env password
      defaultAdmin.password_hash = await bcrypt.hash(defaultPass, salt);
      await defaultAdmin.save();
    }

    // Sync custom admin if specified (e.g. ADMIN_USER=hari, ADMIN_PASS=@Meerayya@123)
    if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
      const customUser = process.env.ADMIN_USER.trim().toLowerCase();
      const customPass = process.env.ADMIN_PASS;
      let customAdmin = await Admin.findOne({ username: customUser });
      if (!customAdmin) {
        const hash = await bcrypt.hash(customPass, salt);
        await Admin.create({
          username: customUser,
          password_hash: hash
        });
        console.log(`👤 Custom Admin created: ${customUser} / ${customPass}`);
      } else {
        customAdmin.password_hash = await bcrypt.hash(customPass, salt);
        await customAdmin.save();
      }
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

    // 3. Seed Default Coordination Template if none exists (Clean institutional format: Name, Sem, Branch, Roll)
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
          }
        }
      });
      console.log('⭐ Default Coordination template seeded (clean institutional format)!');
    }

    // 4. Seed Default Appreciation Template if none exists
    let appreciationTemplate = await Template.findOne({ template_type: 'appreciation' });
    if (!appreciationTemplate) {
      appreciationTemplate = await Template.create({
        template_name: 'Sri Vasavi Engineering College (Certificate of Appreciation - Nexus 2K26)',
        template_file: '/templates/svec_appreciation_template.jpg',
        template_type: 'appreciation',
        is_active: true,
        fields_config: {
          canvas_width: 1024,
          canvas_height: 682,
          name: {
            x: 350,
            y: 334,
            fontSize: 20,
            fontFamily: 'Playfair Display, serif',
            fontWeight: 'bold',
            color: '#1a1a2e',
            align: 'left'
          },
          semester: {
            x: 140,
            y: 362,
            fontSize: 16,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'bold',
            color: '#1a1a2e',
            align: 'center'
          },
          branch: {
            x: 430,
            y: 362,
            fontSize: 14,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'bold',
            color: '#1a1a2e',
            align: 'center'
          },
          roll_no: {
            x: 740,
            y: 362,
            fontSize: 16,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'bold',
            color: '#1a1a2e',
            align: 'left'
          },
          position: {
            x: 240,
            y: 393,
            fontSize: 16,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'bold',
            color: '#7b1113',
            align: 'center'
          },
          events: {
            x: 500,
            y: 393,
            fontSize: 15,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 'bold',
            color: '#1a1a2e',
            align: 'left'
          }
        }
      });
      console.log('🏅 Default Appreciation template seeded (Nexus 2K26 format)!');
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
