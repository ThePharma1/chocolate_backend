require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { pool, init, isAvailable } = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize DB (attempt, but do not exit on failure)
init()
  .then(() => console.log("DB initialized"))
  .catch((err) => {
    console.error("DB init failed (continuing without DB):", err.message || err);
  });

// Get products
app.get("/api/products", async (req, res) => {
  try {
    const rows = await pool.query("SELECT id, name, price, inStock, image FROM products");
    res.json({ ok: true, products: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Failed to load products" });
  }
});

// Add product
app.post("/api/products", async (req, res) => {
  const { name, price, inStock = true, image = "" } = req.body;
  if (!name || typeof price === 'undefined' || Number.isNaN(Number(price))) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid fields' });
  }
  if (!isAvailable()) return res.status(503).json({ ok: false, error: 'DB unavailable' });

  try {
    const result = await pool.query(
      "INSERT INTO products (name, price, inStock, image) VALUES (?, ?, ?, ?)",
      [name, Number(price), inStock ? 1 : 0, image]
    );
    const insertId = result.insertId || (Array.isArray(result) && result.insertId);
    const rows = await pool.query("SELECT id, name, price, inStock, image FROM products WHERE id = ? LIMIT 1", [insertId]);
    res.json({ ok: true, product: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Failed to save product' });
  }
});

// Add order
app.post("/api/orders", async (req, res) => {
  const { cart, customer, userEmail } = req.body;
  if (!Array.isArray(cart) || cart.length === 0) return res.status(400).json({ ok: false, error: "Invalid cart" });
  if (!isAvailable()) return res.status(503).json({ ok: false, error: 'DB unavailable' });

  let orderId = null;
  try {
    // Resolve user id if email provided
    let userId = null;
    if (userEmail) {
      const users = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [userEmail]);
      if (users && users.length) userId = users[0].id;
    }

    const address = customer ? JSON.stringify(customer) : null;

    // Insert order row
    const insertRes = await pool.query("INSERT INTO orders (user_id, address) VALUES (?, ?)", [userId, address]);
    orderId = insertRes.insertId || (Array.isArray(insertRes) && insertRes.insertId);

    // Aggregate quantities by product id (expect items to contain an `id` for products)
    const counts = {};
    for (const it of cart) {
      const pid = it.id || null;
      if (!pid) continue;
      const qty = it.qty && Number.isFinite(Number(it.qty)) ? Number(it.qty) : 1;
      counts[pid] = (counts[pid] || 0) + qty;
    }

    const rowsToInsert = Object.keys(counts).map((pid) => [orderId, pid, counts[pid]]);
    if (rowsToInsert.length) {
      // Bulk insert
      await pool.query("INSERT INTO order_products (order_id, product_id, qty) VALUES ?", [rowsToInsert]);
    }

    res.json({ ok: true, orderId, message: "Order received" });
  } catch (err) {
    console.error(err);
    // Attempt to rollback partial insert
    try {
      if (orderId) await pool.query('DELETE FROM orders WHERE id = ?', [orderId]);
    } catch (e) {
      console.error('Failed cleanup after order error:', e.message || e);
    }
    res.status(500).json({ ok: false, error: "Failed to save order" });
  }
});

// Auth: login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, error: "Missing email or password" });

  try {
    const rows = await pool.query("SELECT id, email, password, role FROM users WHERE email = ? LIMIT 1", [email]);
    if (!rows.length) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    const user = rows[0];
    const match = bcrypt.compareSync(password, user.password);
    if (!match) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    res.json({ ok: true, user: { email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Login failed" });
  }
});

// Auth: signup
app.post("/api/auth/signup", async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, error: "Missing fields" });

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    console.error("helllooo");
    if (existing.length) return res.status(400).json({ ok: false, error: "Email already in use" });

    const hash = bcrypt.hashSync(password, 10);
    await pool.query("INSERT INTO users (email, password, role) VALUES (?)", [[email, hash, role || "customer"]]);
    res.json({ ok: true, user: { email, role: role || "customer" } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Signup failed" });
  }
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
