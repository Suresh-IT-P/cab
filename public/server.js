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

    await adminConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await adminConnection.query(`USE \`${dbName}\``);
    console.log(`Database "${dbName}" ensured.`);

    // 2. Create Isolated Tables
    // Passengers (Travelers)
    await adminConnection.query(`
        CREATE TABLE IF NOT EXISTS passengers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100) UNIQUE,
            password VARCHAR(255),
            phone VARCHAR(20),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Drivers (Partner Pilots)
    await adminConnection.query(`
        CREATE TABLE IF NOT EXISTS drivers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100) UNIQUE,
            password VARCHAR(255),
            phone VARCHAR(20),
            car_model VARCHAR(100),
            car_number VARCHAR(100),
            wallet_balance DECIMAL(10,2) DEFAULT 0.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    try {
        await adminConnection.query('ALTER TABLE drivers ADD COLUMN wallet_balance DECIMAL(10,2) DEFAULT 0.00');
    } catch (e) {
        // Ignore if column already exists
    }

    // Admins (Executive Command)
    await adminConnection.query(`
        CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100) UNIQUE,
            password VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await adminConnection.query(`
        CREATE TABLE IF NOT EXISTS bookings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT, -- Maps to passengers.id
            pickup_loc TEXT,
            drop_loc TEXT,
            pickup_date DATE,
            pickup_time TIME,
            passengers INT,
            vehicle_type VARCHAR(50),
            fare VARCHAR(20),
            status ENUM('pending', 'assigned', 'completed', 'cancelled') DEFAULT 'pending',
            driver_id INT NULL, -- Maps to drivers.id
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 2.5 Ensure the Master Admin exists in the Executive Vault
    await adminConnection.query(`
        INSERT INTO admins (id, name, email, password) 
        VALUES (1, 'System Admin', 'admin@elitecabs', 'suresh2005')
        ON DUPLICATE KEY UPDATE email='admin@elitecabs', password='suresh2005'
    `);

    console.log('Isolated Multi-Role Tables and default admin ensured.');

    await adminConnection.end();

    // 3. Initialize Shared Pool
    db = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: dbName,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'UTF8MB4_UNICODE_CI'
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
        console.error('CRITICAL ERROR during startup:', err);
        // Do not use process.exit(1) here in some environments, but for local dev it's okay
        process.exit(1);
    }
}

startServer();

// --- API ROUTES ---

// --- AUTHENTICATION ROUTES ---

// 1. Passenger Registry
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        const [existing] = await db.query('SELECT id FROM passengers WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Email already registered.' });

        const sql = 'INSERT INTO passengers (name, email, password, phone) VALUES (?, ?, ?, ?)';
        const [result] = await db.query(sql, [name, email, password, phone]);
        res.json({ success: true, userId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'Registry Failure' });
    }
});

// 2. Passenger Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [users] = await db.query('SELECT id, name, email, phone FROM passengers WHERE email = ? AND password = ?', [email, password]);
        if (users.length > 0) {
            const user = users[0];
            user.role = 'user'; // Virtual role for frontend compatibility
            res.json({ success: true, user });
        } else {
            res.status(401).json({ error: 'Unauthorized credentials.' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Auth Failure' });
    }
});

// 3. Admin Command Login (Executive Only)
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [admins] = await db.query('SELECT id, name, email FROM admins WHERE email = ? AND password = ?', [email, password]);
        if (admins.length > 0) {
            const user = admins[0];
            user.role = 'admin';
            res.json({ success: true, user });
        } else {
            res.status(401).json({ error: 'Mainframe Access Denied.' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Executive Auth Failure' });
    }
});

// 4. Partner Pilot Login (Drivers Only)
app.post('/api/driver/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [drivers] = await db.query('SELECT id, name, email, phone, car_model, car_number, wallet_balance FROM drivers WHERE email = ? AND password = ?', [email, password]);
        if (drivers.length > 0) {
            const user = drivers[0];
            user.role = 'driver';
            res.json({ success: true, user });
        } else {
            res.status(401).json({ error: 'Pilot Authorization Denied.' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Pilot Auth Failure' });
    }
});

// 4.1 Get Latest Driver Info (Wallet, etc.)
app.get('/api/driver/info/:id', async (req, res) => {
    try {
        const [drivers] = await db.query('SELECT id, name, email, phone, car_model, car_number, wallet_balance FROM drivers WHERE id = ?', [req.params.id]);
        if (drivers.length > 0) {
            res.json({ success: true, driver: drivers[0] });
        } else {
            res.status(404).json({ error: 'Pilot not found.' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch pilot info' });
    }
});

// 2. Booking Management
app.post('/api/bookings/create', async (req, res) => {
    try {
        const booking = req.body;
        console.log('Incoming Booking Request:', JSON.stringify(booking, null, 2));

        const sql = 'INSERT INTO bookings (user_id, pickup_loc, drop_loc, pickup_date, pickup_time, passengers, vehicle_type, fare, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const values = [
            booking.userId || 1,
            String(booking.pickup || ''),
            String(booking.drop || ''),
            booking.date,
            booking.time,
            parseInt(booking.passengers) || 1,
            String(booking.vehicle || 'sedan'),
            String(booking.fare || '₹0'),
            'pending'
        ];

        console.log('Values for DB:', JSON.stringify(values));

        const [result] = await db.query(sql, values);
        console.log('Insert Success! ID:', result.insertId);
        res.json({ success: true, bookingId: result.insertId });
    } catch (err) {
        console.error('MySQL Error during booking creation:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 2.2 User Ride History - JOIN WITH DRIVERS TABLE
app.get('/api/user/bookings/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const sql = `
            SELECT b.*, d.name as driver_name, d.phone as driver_phone, d.car_model, d.car_number 
            FROM bookings b 
            LEFT JOIN drivers d ON b.driver_id = d.id 
            WHERE b.user_id = ? 
            ORDER BY b.created_at DESC
        `;
        const [rows] = await db.query(sql, [userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'History Retrieval Failure' });
    }
});

// 2.3 Accept Ride (Driver Action)
app.post('/api/bookings/accept', async (req, res) => {
    try {
        const { bookingId, driverId } = req.body;
        
        const [bookings] = await db.query('SELECT fare FROM bookings WHERE id = ? AND status = "pending"', [bookingId]);
        if (bookings.length === 0) return res.status(400).json({ error: 'Ride no longer available or already assigned.' });
        
        const bookingFare = parseFloat(bookings[0].fare.replace(/[^0-9.]/g, '')) || 0;
        const requiredBalance = bookingFare * 0.10;
        
        const [drivers] = await db.query('SELECT wallet_balance FROM drivers WHERE id = ?', [driverId]);
        if (drivers.length === 0) return res.status(400).json({ error: 'Pilot not found.' });
        
        const walletBalance = parseFloat(drivers[0].wallet_balance) || 0;
        
        if (walletBalance < requiredBalance) {
            return res.status(400).json({ error: `Insufficient funds. Minimum wallet balance required: ₹${requiredBalance.toFixed(2)} (10% of fare).` });
        }

        const sql = 'UPDATE bookings SET status = "assigned", driver_id = ? WHERE id = ?';
        const [result] = await db.query(sql, [driverId, bookingId]);

        if (result.affectedRows > 0) {
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Ride no longer available or already assigned.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2.4 Driver Current Jobs (Assigned to them)
app.get('/api/driver/my-jobs/:driverId', async (req, res) => {
    try {
        const driverId = req.params.driverId;
        const sql = `
            SELECT b.*, u.name as customer_name, u.phone as customer_phone 
            FROM bookings b 
            LEFT JOIN passengers u ON b.user_id = u.id 
            WHERE b.driver_id = ? AND b.status IN ("assigned", "completed")
            ORDER BY b.created_at DESC
        `;
        const [rows] = await db.query(sql, [driverId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Admin Panel Data
app.get('/api/admin/stats', async (req, res) => {
    try {
        const [totalBookings] = await db.query("SELECT COUNT(*) as count FROM bookings");
        const [activeBookings] = await db.query("SELECT COUNT(*) as count FROM bookings WHERE status IN ('pending', 'assigned')");
        const [totalRevenue] = await db.query("SELECT fare FROM bookings WHERE status = 'completed'");
        const [driverCount] = await db.query("SELECT COUNT(*) as count FROM drivers");
        const [userCount] = await db.query("SELECT COUNT(*) as count FROM passengers");

        let revenue = 0;
        totalRevenue.forEach(row => {
            revenue += parseFloat(row.fare.replace(/[^0-9.]/g, '')) || 0;
        });

        res.json({
            totalBookings: totalBookings[0].count,
            activeBookings: activeBookings[0].count,
            revenue: revenue,
            totalDrivers: driverCount[0].count,
            totalUsers: userCount[0].count
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.1 Detailed Bookings for Admin
app.get('/api/admin/bookings', async (req, res) => {
    try {
        const sql = `
            SELECT b.*, 
                   u.name as customer_name, u.phone as customer_phone,
                   d.name as driver_name, d.car_model, d.car_number
            FROM bookings b
            LEFT JOIN passengers u ON b.user_id = u.id
            LEFT JOIN drivers d ON b.driver_id = d.id
            ORDER BY b.created_at DESC
        `;
        const [rows] = await db.query(sql);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.2 Member Management (Passengers)
app.get('/api/admin/users', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, name, email, phone, 'user' as role, created_at FROM passengers ORDER BY created_at DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.2.1 Fleet Management (Drivers)
app.get('/api/admin/drivers', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, name, email, phone, 'driver' as role, car_model, car_number, wallet_balance, created_at FROM drivers ORDER BY created_at DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.3 Delete Operations
app.post('/api/admin/delete-passenger', async (req, res) => {
    try {
        const { id } = req.body;
        await db.query("DELETE FROM passengers WHERE id = ?", [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/delete-driver', async (req, res) => {
    try {
        const { id } = req.body;
        await db.query("DELETE FROM drivers WHERE id = ?", [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.4 Registry Updates
app.post('/api/admin/update-driver', async (req, res) => {
    try {
        const { id, name, phone, car_model, car_number } = req.body;
        const sql = 'UPDATE drivers SET name = ?, phone = ?, car_model = ?, car_number = ? WHERE id = ?';
        await db.query(sql, [name, phone, car_model, car_number, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.4.1 Wallet Update
app.post('/api/admin/update-driver-wallet', async (req, res) => {
    try {
        const { id, wallet_balance } = req.body;
        const sql = 'UPDATE drivers SET wallet_balance = ? WHERE id = ?';
        await db.query(sql, [wallet_balance, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.5 Induct Pilot (Admin only creates drivers here)
app.post('/api/admin/create-driver', async (req, res) => {
    try {
        const { name, email, password, phone, car_model, car_number } = req.body;
        const [existing] = await db.query('SELECT id FROM drivers WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Pilot email already authorized.' });

        const sql = 'INSERT INTO drivers (name, email, password, phone, car_model, car_number) VALUES (?, ?, ?, ?, ?, ?)';
        await db.query(sql, [name, email, password, phone, car_model, car_number]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Pilot Induction failed.' });
    }
});

// 4. Driver Panel Jobs (Available Pending Jobs)
app.get('/api/driver/jobs', async (req, res) => {
    try {
        const sql = `
            SELECT b.*, u.name as customer_name, u.phone as customer_phone 
            FROM bookings b 
            LEFT JOIN passengers u ON b.user_id = u.id 
            WHERE b.status = "pending"
            ORDER BY b.created_at ASC
        `;
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
