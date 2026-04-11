# 🚀 HƯỚNG DẪN DEPLOY SMART FINANCE LÊN INTERNET

## 📁 Cấu Trúc Project

```
smart-finance/
├── backend/          ← Thư mục gốc để deploy Railway
│   ├── server.js
│   ├── package.json
│   ├── railway.toml
│   ├── .env.example
│   ├── config/
│   │   └── db.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Transaction.js
│   │   └── SavingsGoal.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── transactions.js
│   │   ├── goals.js
│   │   └── dashboard.js
│   └── middleware/
│       └── auth.js
└── frontend/         ← Được serve tự động bởi backend
    ├── index.html    (Trang đăng nhập)
    ├── dashboard.html
    └── transactions.html
```

---

## BƯỚC 1 — Push lên GitHub

```bash
# Mở terminal trong thư mục smart-finance
cd smart-finance

git init
git add .
git commit -m "feat: Smart Finance full-stack app"

# Tạo repo mới trên GitHub rồi push
git remote add origin https://github.com/TEN-CUA/smart-finance.git
git branch -M main
git push -u origin main
```

---

## BƯỚC 2 — Tạo MongoDB Atlas (Database)

1. Vào https://cloud.mongodb.com
2. Tạo cluster miễn phí (Free Tier M0)
3. **Database Access** → Add User:
   - Username: `smartfinance`
   - Password: (tạo mật khẩu mạnh, copy lại)
   - Role: `Atlas admin`
4. **Network Access** → Add IP → chọn **Allow Access from Anywhere** (0.0.0.0/0)
5. **Connect** → Drivers → Copy connection string:
   ```
   mongodb+srv://smartfinance:<password>@cluster0.xxxxx.mongodb.net/smart-finance
   ```
   *(Thay `<password>` bằng mật khẩu vừa tạo)*

---

## BƯỚC 3 — Deploy Railway

1. Vào https://railway.app → **New Project**
2. Chọn **Deploy from GitHub repo** → chọn repo `smart-finance`
3. ⚠️ **QUAN TRỌNG** — Cài Root Directory:
   - Vào **Settings** → **Source** → **Root Directory** → nhập: `backend`
4. Vào **Variables** → **Add Variable** lần lượt:

   | Key | Value |
   |-----|-------|
   | `MONGO_URI` | `mongodb+srv://smartfinance:...` |
   | `JWT_SECRET` | `smart_finance_secret_2026_abcxyz` |
   | `JWT_EXPIRES_IN` | `7d` |
   | `NODE_ENV` | `production` |

5. Railway tự động deploy! Sau ~2 phút xem **Deployments** → ✅ Success
6. Vào **Settings** → **Domains** → **Generate Domain** → lấy URL dạng:
   ```
   https://smart-finance-production-xxxx.up.railway.app
   ```

---

## BƯỚC 4 — Kiểm Tra

Mở trình duyệt vào URL Railway:
- ✅ `https://your-app.up.railway.app` → Trang đăng nhập
- ✅ `https://your-app.up.railway.app/api/health` → `{"status":"ok"}`
- Đăng ký tài khoản → đăng nhập → thêm giao dịch thử

---

## API Endpoints

| Method | URL | Mô tả | Auth |
|--------|-----|--------|------|
| POST | `/api/auth/register` | Đăng ký | ❌ |
| POST | `/api/auth/login` | Đăng nhập | ❌ |
| GET | `/api/auth/me` | Thông tin user | ✅ |
| GET | `/api/dashboard` | Tổng quan | ✅ |
| GET | `/api/transactions` | Danh sách giao dịch | ✅ |
| POST | `/api/transactions` | Thêm giao dịch | ✅ |
| DELETE | `/api/transactions/:id` | Xóa giao dịch | ✅ |
| GET | `/api/goals` | Mục tiêu tiết kiệm | ✅ |
| POST | `/api/goals` | Thêm mục tiêu | ✅ |
| PATCH | `/api/goals/:id/deposit` | Nạp tiền vào mục tiêu | ✅ |

---

## Chạy Cục Bộ (Local Development)

```bash
cd backend

# Tạo file .env từ template
cp .env.example .env
# Sửa MONGO_URI trong .env

# Cài dependencies
npm install

# Chạy development
npm run dev
# → Server chạy tại http://localhost:5000
# → Mở http://localhost:5000 để xem web
```

---

## Lỗi Thường Gặp

**❌ "MongoServerError: bad auth"**
→ Sai username/password MongoDB. Kiểm tra lại MONGO_URI

**❌ Build failed "Cannot find module"**  
→ Kiểm tra Root Directory đã set là `backend` chưa

**❌ Web không load sau deploy**  
→ Kiểm tra biến `NODE_ENV=production` đã thêm chưa

**❌ CORS error**  
→ Trong server.js đổi `origin` thành `'*'` tạm thời để test
