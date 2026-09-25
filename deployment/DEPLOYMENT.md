# Deployment Guide: Certificate Generation Web System

This guide outlines deployment options for hosting the **Sri Vasavi Engineering College Automatic Certificate Generation System**.

---

## 📁 Project Architecture Overview

```text
CERTIFICATEWEB2/
├── frontend/           # Client-side UI & certificate rendering engine
│   ├── index.html      # Public Student Portal & Verification
│   ├── admin.html      # Administrative Management Portal
│   ├── css/            # Style sheets & modern design tokens
│   ├── js/             # Client controllers (admin.js, app.js)
│   └── templates/      # High-resolution certificate template images
├── backend/            # Express.js REST API & Database engine
│   ├── app.js          # Main Express server entrypoint
│   ├── db.js           # MongoDB connection & auto-seeding
│   ├── models/         # Mongoose schemas (Student, Event, Participation, Template, Admin)
│   ├── routes/         # REST endpoints (auth, students, events, certificates, upload, templates)
│   └── utils/          # Excel parsers, PDF parsers, certificate generators
├── deployment/         # Cloud deployment configs & Docker specifications
│   ├── vercel.json     # Vercel serverless configuration
│   ├── render.yaml     # Render blueprint configuration
│   ├── Dockerfile      # Production container build
│   └── .dockerignore   # Container build ignore rules
├── api/                # Vercel serverless function entrypoint
│   └── index.js
├── uploads/            # Custom template uploads directory
└── package.json        # Dependencies and startup scripts
```

---

## 1. Deploying to Vercel (Serverless)

Vercel hosts the frontend static files at edge and the backend API as a Serverless Function.

### Steps:
1. Push repository to **GitHub / GitLab**.
2. Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **"Add New Project"**.
3. Import your repository.
4. Set the following **Environment Variables**:
   - `MONGODB_URI`: `mongodb+srv://<username>:<password>@cluster0.ijcjv55.mongodb.net/coordinator_certificate_db?retryWrites=true&w=majority`
   - `JWT_SECRET`: `super_secret_certificate_jwt_key_2026`
   - `DEFAULT_ADMIN_USER`: `admin`
   - `DEFAULT_ADMIN_PASS`: `admin@123`
5. Click **Deploy**. Vercel will automatically detect `api/index.js` and `vercel.json`.

> **Note for MongoDB Atlas with Vercel**: Ensure your MongoDB Atlas Network Access allows `0.0.0.0/0` (Anywhere), as serverless functions use dynamic IP addresses.

---

## 2. Deploying to Render (Persistent Web Service)

Render provides persistent background execution, ideal for file uploads and long-running connections.

### Steps:
1. Connect your repository to [Render Dashboard](https://dashboard.render.com).
2. Select **"Blueprint"** and Render will automatically detect `render.yaml`.
   - Alternatively, choose **"Web Service"**:
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Health Check Path**: `/api/health`
3. Add Environment Variables:
   - `NODE_VERSION`: `20.18.0`
   - `PORT`: `10000`
   - `JWT_SECRET`: `your_secure_jwt_secret`
   - `MONGODB_URI`: Your MongoDB Atlas connection string.
4. Click **Create Web Service**.

---

## 3. Deploying with Docker

To build and run as a standalone container:

### Build Docker Image:
```bash
docker build -f deployment/Dockerfile -t certificate-web:latest .
```

### Run Container:
```bash
docker run -d \
  -p 3000:3000 \
  --name cert-system \
  -e PORT=3000 \
  -e MONGODB_URI="your_mongodb_atlas_uri" \
  -e JWT_SECRET="your_secure_jwt_secret" \
  certificate-web:latest
```

---

## 4. Local Development

Run the system locally:
```bash
# Install dependencies
npm install

# Start development server
npm start
# Server will run at http://localhost:3001
```
- **Student Portal**: `http://localhost:3001/`
- **Admin Dashboard**: `http://localhost:3001/admin`
- **Health Check**: `http://localhost:3001/api/health`
