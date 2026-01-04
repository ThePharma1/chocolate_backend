const mysql = require("mysql");
const util = require("util");
const bcrypt = require("bcryptjs");

const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "root";
const DB_NAME = process.env.DB_NAME || "swisse";
const DB_PORT = process.env.DB_PORT || 8889;

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

pool.query = util.promisify(pool.query);

let _available = false;

async function init() {
  try {
    // Try creating DB (non-fatal if fails)
    try {
      const conn = mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
        port: DB_PORT,
      });
      const q = util.promisify(conn.query).bind(conn);
      await q(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
      conn.end();
    } catch (e) {
      console.warn("CREATE DATABASE skipped:", e.message);
    }

    /* ================= USERS ================= */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    /* ================= PRODUCTS ================= */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        inStock TINYINT(1) DEFAULT 1,
        image TEXT
      )
    `);

    /* ================= ORDERS ================= */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        address TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT orders_user_fk
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE SET NULL
      )
    `);

    /* ================= ORDER_PRODUCTS ================= */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        qty INT NOT NULL DEFAULT 1,
        CONSTRAINT op_order_fk
          FOREIGN KEY (order_id) REFERENCES orders(id)
          ON DELETE CASCADE,
        CONSTRAINT op_product_fk
          FOREIGN KEY (product_id) REFERENCES products(id)
          ON DELETE RESTRICT
      )
    `);

    /* ================= SEED ADMIN ================= */
    const users = await pool.query("SELECT COUNT(*) AS cnt FROM users");
    if (users[0].cnt === 0) {
      const hash = bcrypt.hashSync("1234", 10);
      await pool.query(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        ["admin@swisse.com", hash, "worker"]
      );
      console.log("Admin user created");
    }

    _available = true;
    console.log("✅ Database initialized successfully");
  } catch (err) {
    _available = false;
    console.error("❌ DB init failed:", err.message || err);
  }
}

function isAvailable() {
  return _available;
}

module.exports = {
  pool,
  init,
  isAvailable,
};
