CREATE DATABASE IF NOT EXISTS elite_cabs;
USE elite_cabs;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    role ENUM('user', 'admin', 'driver') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
