# Cooperative Gig Services Platform — SIH 2026 PS 89

A cooperative-owned gig services platform for household & community services. Unlike conventional gig platforms (like Urban Company), this platform emphasizes **fair work allocation**, **worker welfare**, **transparent pricing**, **verified skilled workers**, and **AI-assisted matching & demand forecasting**.

---

## 🧱 Tech Stack

### Frontend
- **React.js + Vite** (JavaScript)
- **React Router** — routing
- **Axios** — API calls
- **Tailwind CSS** — styling
- **Leaflet + OpenStreetMap** — maps & location
- **Recharts** — analytics charts
- **React Hook Form** — forms

### Backend
- **Node.js + Express.js**
- **MongoDB + Mongoose** (local MongoDB)
- **JWT** — authentication
- **bcryptjs** — password hashing
- **Multer** — file/image uploads
- **Socket.IO** — real-time notifications

---

## 🔧 Prerequisites

1. **Node.js** (v18+)
   - Download from https://nodejs.org
2. **MongoDB** (local)
   - Download MongoDB Community Server from https://www.mongodb.com/try/download/community
   - Or install via Homebrew: `brew tap mongodb/brew && brew install mongodb-community`

---

## 🚀 Setup & Run

### 1. Start MongoDB

```bash
# Homebrew (macOS)
brew services start mongodb-community

# Or run mongod directly
mongod --dbpath /path/to/data/db
```

### 2. Backend

```bash
cd backend
npm install
# Create .env file (copy from .env.example):
cp .env.example .env
# Seed database (optional, recommended for demo):
npm run seed
# Start backend
npm run dev
```

Backend runs at `http://localhost:5001`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

---

## 🔑 Environment Variables

Create `backend/.env` based on `backend/.env.example`:

```
PORT=5001
MONGO_URI=mongodb://127.0.0.1:27017/cooperative_gig_platform
JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=7d
```

---

## 💻 Demo Login Credentials (after seeding)

| Role    | Email                  | Password |
|---------|------------------------|----------|
| Admin   | admin@coop.in          | Admin@123 |
| Customer| customer1@test.com     | Pass@123  |
| Worker  | worker1@test.com       | Pass@123  |

---

## 🗂 Project Structure

```
cooperative-gig-platform/
│
├── frontend/                  # React/Vite app
│   └── src/
│       ├── components/        # Reusable UI components
│       ├── pages/
│       │   ├── auth/          # Login, Register, Forgot/Reset Password
│       │   ├── customer/      # Customer app
│       │   ├── worker/        # Worker app
│       │   ├── admin/         # Cooperative admin dashboard
│       │   └── public/        # Landing, about, etc.
│       ├── layouts/           # Shared layout components
│       ├── hooks/             # Custom React hooks
│       ├── services/          # API call layer (axios)
│       ├── context/           # Auth & internationalization context
│       ├── utils/             # Helper utilities
│       └── App.jsx
│
├── backend/                   # Express API
│   └── src/
│       ├── config/            # DB connection, env
│       ├── models/            # Mongoose schemas
│       ├── controllers/
│       │   ├── auth/          # Auth controller
│       │   ├── customer/      # Customer controllers
│       │   ├── worker/        # Worker controllers
│       │   ├── admin/         # Admin controllers
│       │   └── shared/        # Services, bookings, payments
│       ├── routes/            # Express routes
│       ├── middleware/        # auth, role, error, upload
│       ├── services/          # Business logic (matching, ai, payment)
│       ├── utils/             # Helpers, seed script
│       └── server.js
│
├── README.md
└── .gitignore
```

---

## ✨ Key Features

- **Role-based access** — Customer / Worker / Admin (Cooperative)
- **Fair worker matching** — scoring based on skill, distance, availability, rating, experience, **and workload fairness**
- **Transparent pricing** — full breakdown (labour, materials, cooperative contribution, fees)
- **Mock payment system** — designed for Razorpay integration later
- **Invoices** — generated automatically after completion
- **Ratings & reviews** — bi-directional (customer ↔ worker), single review per booking
- **Complaint/dispute management**
- **Worker welfare module** — insurance, schemes, training, benefits
- **Training & certification programs** — with enrollment tracking
- **Admin analytics** — Recharts dashboards
- **Demand heatmap** — Leaflet geographic visualization
- **AI demand forecasting** — statistical/mock predictions ready for Python ML
- **AI workforce allocation** — identifies shortages, overloaded/underutilized workers
- **Voice input** — Web Speech API (replaceable with multilingual AI later)
- **Multilingual** — i18n English + Hindi (React i18next)
- **Real-time notifications** — Socket.IO

---

## 🗺 Demo Scenario

1. **Customer** logs in → selects Plumbing → describes leaking pipe → uploads image → location → selects emergency → request
2. Matching engine finds suitable (and fairly allocated) workers
3. **Worker** accepts → navigates → starts job → uploads before/after images → completes
4. Customer confirms → **payment** → **invoice** → **rating**
5. **Admin** monitors bookings, allocation, demand map, AI predictions, workload, revenue, welfare

---

## 📜 License

Internal prototype for SIH 2026 — Problem Statement 89.
