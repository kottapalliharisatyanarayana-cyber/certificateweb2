// Backward-compatibility entrypoint for cloud services (Render, Vercel) referencing server/app.js
const app = require('../backend/app');

module.exports = app;
