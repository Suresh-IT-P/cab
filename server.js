const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Global DB Connection Pool
let db;

async function initDB() {
    const dbName = process.env.DB_NAME || 'elite_cabs';

    // 1. Initial connection without database to ensure it exists
    const adminConnection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || ''
    });

    console.log('Admin connection established.');

    await adminConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await adminConnection.query(`USE \`${dbName}\``);
    console.log(`Database "${dbName}" ensured.`);

    // 2. Create Tables
    await adminConnection.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100) UNIQUE,
            password VARCHAR(255),
            role ENUM('user', 'admin', 'driver') DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await adminConnection.query(`
        CREATE TABLE IF NOT EXISTS bookings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            pickup_loc TEXT,
            drop_loc TEXT,
            pickup_date DATE,
            pickup_time TIME,
            passengers INT,
            vehicle_type VARCHAR(50),
            fare VARCHAR(20),
            status ENUM('pending', 'assigned', 'completed', 'cancelled') DEFAULT 'pending',
            driver_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('Tables ensured.');

    await adminConnection.end();

    // 3. Initialize Shared Pool
    db = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: dbName,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log('Database Pool initialized.');
}

async function startServer() {
    try {
        await initDB();
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('CRITICAL ERROR during startup:', err.message);
        // Do not use process.exit(1) here in some environments, but for local dev it's okay
        process.exit(1);
    }
}

startServer();

// --- API ROUTES ---

// 1. Authentication (Mocked for Demo)
app.post('/api/login', (req, res) => {
    const { email, password, role } = req.body;
    res.json({ success: true, user: { email, role }, token: 'mock-jwt-token' });
});

// 2. Booking Management
app.post('/api/bookings/create', async (req, res) => {
    try {
        const booking = req.body;
        const sql = 'INSERT INTO bookings (user_id, pickup_loc, drop_loc, pickup_date, pickup_time, passengers, vehicle_type, fare, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const values = [1, booking.pickup, booking.drop, booking.date, booking.time, booking.passengers, booking.vehicle, booking.fare, 'pending'];

        const [result] = await db.query(sql, values);
        res.json({ success: true, bookingId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Admin Panel Data
app.get('/api/admin/stats', async (req, res) => {
    try {
        const [countRows] = await db.query("SELECT COUNT(*) as count FROM bookings");
        const [revenueRows] = await db.query("SELECT fare FROM bookings WHERE status = 'completed'");

        let totalRevenue = 0;
        revenueRows.forEach(row => {
            // Remove ₹ symbol and comma before parsing
            const numericFare = parseFloat(row.fare.replace(/[^0-9.]/g, '')) || 0;
            totalRevenue += numericFare;
        });

        res.json({
            totalBookings: countRows[0].count,
            revenue: totalRevenue || 0,
            activeDrivers: 12 // Mocked for demo
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Driver Panel Jobs
app.get('/api/driver/jobs', async (req, res) => {
    try {
        const sql = "SELECT * FROM bookings WHERE status = 'pending'";
        const [rows] = await db.query(sql);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Update Booking Status
app.post('/api/bookings/update-status', async (req, res) => {
    try {
        const { bookingId, status } = req.body;
        const sql = 'UPDATE bookings SET status = ? WHERE id = ?';
        await db.query(sql, [status, bookingId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// 6. Config / API Keys
app.get('/api/config/maps-key', (req, res) => {
    res.json({
        mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || ''
    });
});
