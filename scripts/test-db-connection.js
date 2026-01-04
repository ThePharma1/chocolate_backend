require('dotenv').config();
const mysql = require('mysql');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || 8889;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || 'root';
const DB_NAME = process.env.DB_NAME || 'swisse';

console.log('Testing DB connection with:');
console.log({ host: DB_HOST, port: DB_PORT, user: DB_USER, database: DB_NAME });

const conn = mysql.createConnection({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectTimeout: 5000,
});

conn.connect((err) => {
  if (err) {
    console.error('Connection failed:', err.code || err.message);
    process.exit(1);
  }

  console.log('Connected successfully. Running test query...');
  conn.query('SELECT 1 + 1 AS solution', (qErr, results) => {
    if (qErr) {
      console.error('Query failed:', qErr.message || qErr.code);
      conn.end();
      process.exit(1);
    }

    console.log('Query result:', results && results[0] ? results[0].solution : results);
    conn.end();
    process.exit(0);
  });
});