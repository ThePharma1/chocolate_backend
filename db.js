const mysql = require("mysql");
const util = require("util");
const bcrypt = require("bcryptjs");

// Detect if running in Cloud Run
const isCloudRun = !!process.env.K_SERVICE;

// Pool configuration depending on environment
const poolConfig = isCloudRun
  ? {
      connectionLimit: 10,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      socketPath: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
    }
  : {
      connectionLimit: 10,
      host: process.env.DB_HOST || "127.0.0.1",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "root",
      database: process.env.DB_NAME || "swisse",
      port: process.env.DB_PORT || 3306,
    };

const pool = mysql.createPool(poolConfig);
pool.query = util.promisify(pool.query);

let _available = false;

async function init() {
  try {
    // Only create DB locally, not in Cloud Run
    if (!isCloudRun) {
      try {
        const conn = mysql.createConnection({
          host: process.env.DB_HOST,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          port: process.env.DB_PORT,
        });
        const q = util.promisify(conn.query).bind(conn);
        await q(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
        conn.end();
      } catch (e) {
        console.warn("CREATE DATABASE skipped:", e.message);
      }
    }

    // Tables (safe to create in both environments)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        inStock TINYINT(1) DEFAULT 1,
        image TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        address TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE SET NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        qty INT NOT NULL DEFAULT 1,
        FOREIGN KEY (order_id) REFERENCES orders(id)
          ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
          ON DELETE RESTRICT
      )
    `);

    // Seed admin user
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
