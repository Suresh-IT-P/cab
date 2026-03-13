/**
 * Elite Cabs - Main Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    const isLandingPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
    const isAuthPage = window.location.pathname.includes('auth.html') || window.location.pathname.includes('login.html');

    const member = JSON.parse(localStorage.getItem('elite_member'));
    const pilot = JSON.parse(localStorage.getItem('elite_pilot'));
    const master = JSON.parse(localStorage.getItem('elite_master'));

    // 1. Landing Page Logic (Home)
    // We NO LONGER force redirect admins/pilots away from index.html
    // This allows you to browse the home page even if you have an admin session active.

    // 2. Auth Guard for Landing Page (index.html)
    // If you are on the landing page and NOT logged in as a passenger, we show login.
    // (Optional: You can remove this if you want index.html to be public)
    if (isLandingPage && !member && !master && !pilot) {
        window.location.href = 'auth.html';
        return;
    }

    const bookingForm = document.getElementById('booking-form');
    const passengerInput = document.getElementById('passengers');
    const vehicleSelect = document.getElementById('vehicle-type');
    const fareEstimate = document.getElementById('fare-estimate');
    const distanceVal = document.getElementById('distance-val');
    const fareVal = document.getElementById('fare-val');
    const vehicleBadge = document.getElementById('vehicle-badge');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const pickupDate = document.getElementById('pickup-date');

    // 1. Initialize Date Restrictions (Must be future)
    const today = new Date().toISOString().split('T')[0];
    pickupDate.setAttribute('min', today);
    pickupDate.value = today;

    // 2. Tab Switching Logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Mobile Burger Logic
    const burgerToggle = document.getElementById('burger-toggle');
    const navLinksList = document.querySelector('.nav-links');

    if (burgerToggle && navLinksList) {
        burgerToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            burgerToggle.classList.toggle('active');
            navLinksList.classList.toggle('active');
        });

        // Close menu when clicking a link
        navLinksList.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                burgerToggle.classList.remove('active');
                navLinksList.classList.remove('active');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navLinksList.contains(e.target) && !burgerToggle.contains(e.target)) {
                burgerToggle.classList.remove('active');
                navLinksList.classList.remove('active');
            }
        });
    }

    // 3. Auto-Select Vehicle Logic
    function updateVehicleSelection() {
        const count = parseInt(passengerInput.value) || 0;

        if (vehicleSelect.value === 'auto') {
            if (count > 4) {
                vehicleBadge.textContent = 'Auto-Selected: Luxury SUV (7 Seater)';
                vehicleBadge.style.background = '#D32F2F'; // Primary Red
            } else {
                vehicleBadge.textContent = 'Auto-Selected: Premium Sedan (5 Seater)';
                vehicleBadge.style.background = '#212121'; // Dark
            }
        } else {
            const selectedText = vehicleSelect.options[vehicleSelect.selectedIndex].text;
            vehicleBadge.textContent = `Manual Selection: ${selectedText}`;
            vehicleBadge.style.background = '#444';
        }

        // Trigger fare update if locations are set
        calculateFare();
    }

    passengerInput.addEventListener('input', updateVehicleSelection);
    vehicleSelect.addEventListener('change', updateVehicleSelection);

    // 4. Fare Calculation Logic - ZERO KEY SOLUTION (OSRM)
    async function calculateFare() {
        // Check if user is logged in
        const user = JSON.parse(localStorage.getItem('elite_member'));
        if (!user) {
            fareEstimate.classList.add('hidden');
            return;
        }

        // Retrieve coordinates stored in datasets by the autocomplete
        const pickupCoords = document.getElementById('pickup').dataset.coords;
        const dropCoords = document.getElementById('drop').dataset.coords;

        if (pickupCoords && dropCoords) {
            try {
                // OSRM: No API key required for public demo instance
                const url = `https://router.project-osrm.org/route/v1/driving/${pickupCoords};${dropCoords}?overview=false`;
                const response = await fetch(url);
                const data = await response.json();

                if (data.routes && data.routes.length > 0) {
                    const distanceInKm = Math.ceil(data.routes[0].distance / 1000);
                    updateFareDisplay(distanceInKm);
                }
            } catch (err) {
                console.error('Distance calculation error:', err);
                // Graceful fallback to Elite standard city distance
                updateFareDisplay(15);
            }
        } else {
            fareEstimate.classList.add('hidden');
        }
    }

    function updateFareDisplay(distance) {
        const passengers = parseInt(passengerInput.value) || 1;
        const vehicleType = (vehicleSelect.value === 'auto')
            ? (passengers > 4 ? 'suv' : 'sedan')
            : vehicleSelect.value;

        // Elite Premium Pricing
        let baseFare = 0;
        let perKm = 0;

        if (vehicleType === 'suv') {
            baseFare = 300; // Premium SUV opening
            perKm = 18.5;
        } else {
            baseFare = 150; // Premium Sedan opening
            perKm = 14;
        }

        const totalFare = baseFare + (distance * perKm);

        distanceVal.textContent = distance;
        fareVal.textContent = `₹${totalFare}`;
        fareEstimate.classList.remove('hidden');
    }

    // --- ZERO KEY Autocomplete (Photon API by Komoot) ---
    function setupAutocomplete(inputId, suggestionBoxId) {
        const input = document.getElementById(inputId);
        const box = document.getElementById(suggestionBoxId);
        let timeout = null;

        input.addEventListener('input', () => {
            clearTimeout(timeout);
            const query = input.value;

            if (query.length < 3) {
                box.innerHTML = '';
                delete input.dataset.coords;
                return;
            }

            timeout = setTimeout(async () => {
                const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
                try {
                    const res = await fetch(url);
                    const data = await res.json();
                    box.innerHTML = '';

                    if (data.features) {
                        data.features.forEach(feature => {
                            const p = feature.properties;
                            const c = feature.geometry.coordinates; // [lng, lat]

                            // Formulate a professional address string
                            const label = [p.name, p.street, p.city, p.state].filter(Boolean).join(', ');

                            const item = document.createElement('div');
                            item.className = 'suggestion-item';
                            item.textContent = label;

                            item.onclick = () => {
                                input.value = label;
                                input.dataset.coords = `${c[0]},${c[1]}`;
                                box.innerHTML = '';
                                calculateFare(); // Trigger fare update immediately
                            };
                            box.appendChild(item);
                        });
                    }
                } catch (e) {
                    console.error('Autocomplete service unavailable', e);
                }
            }, 400);
        });

        // Hide suggestions on click outside
        document.addEventListener('click', (e) => {
            if (e.target !== input) box.innerHTML = '';
        });
    }

    // --- MAP PICKER LOGIC (Leaflet + OSM) ---
    let map, mapMarker;
    let currentPickingType = 'pickup'; // 'pickup' or 'drop'
    let tempCoords = null;
    let pickupCoords = null;
    let dropCoords = null;

    window.openMapPicker = function (type) {
        currentPickingType = type || (pickupCoords ? 'drop' : 'pickup');
        document.getElementById('map-modal').style.display = 'flex';
        document.getElementById('picking-type').textContent = currentPickingType;
        document.getElementById('confirm-location').style.display = 'none';

        if (!map) {
            // Initialise map centered on a default location (e.g., Chennai)
            map = L.map('map-picker').setView([13.0827, 80.2707], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map);

            map.on('click', (e) => {
                const { lat, lng } = e.latlng;
                tempCoords = `${lng},${lat}`;

                if (mapMarker) map.removeLayer(mapMarker);
                mapMarker = L.marker([lat, lng]).addTo(map);

                document.getElementById('confirm-location').style.display = 'inline-block';
            });
        } else {
            // Refresh map size if modal was hidden
            setTimeout(() => map.invalidateSize(), 100);
            if (mapMarker) {
                map.removeLayer(mapMarker);
                mapMarker = null;
            }
        }
    };

    window.closeMapPicker = function () {
        document.getElementById('map-modal').style.display = 'none';
    };

    window.confirmMapPoint = async function () {
        if (!tempCoords) return;

        const [lngStr, latStr] = tempCoords.split(',');
        const lng = parseFloat(lngStr);
        const lat = parseFloat(latStr);

        const inputId = currentPickingType;
        const input = document.getElementById(inputId);

        input.dataset.coords = tempCoords;
        if (currentPickingType === 'pickup') pickupCoords = tempCoords;
        else dropCoords = tempCoords;

        // Reverse Geocoding via Photon (Free)
        try {
            const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`);
            const data = await res.json();
            if (data.features && data.features.length > 0) {
                const p = data.features[0].properties;
                const address = [p.name, p.street, p.city, p.district].filter(Boolean).join(', ');
                input.value = address || `Location at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            } else {
                input.value = `Location at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }
        } catch (e) {
            input.value = `Selected Point (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
        }

        closeMapPicker();
        calculateFare();

        // If we just picked pickup, automatically suggest picking drop
        if (currentPickingType === 'pickup' && !dropCoords) {
            setTimeout(() => {
                if (confirm("Now select your destination on the map?")) {
                    openMapPicker('drop');
                }
            }, 500);
        }
    };

    // Initialise Zero-Key Free Services
    setupAutocomplete('pickup', 'pickup-suggestions');
    setupAutocomplete('drop', 'drop-suggestions');

    // Blur listeners for manual entry fallback
    document.getElementById('pickup').addEventListener('blur', () => {
        setTimeout(calculateFare, 250);
    });
    document.getElementById('drop').addEventListener('blur', () => {
        setTimeout(calculateFare, 250);
    });

    // 5. Booking Submission
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const user = JSON.parse(localStorage.getItem('elite_member'));
        if (!user) {
            alert('Please login to elite access to confirm your booking.');
            window.location.href = 'auth.html';
            return;
        }

        const bookingData = {
            userId: user.id,
            pickup: document.getElementById('pickup').value,
            drop: document.getElementById('drop').value,
            date: document.getElementById('pickup-date').value,
            time: document.getElementById('pickup-time').value,
            passengers: passengerInput.value,
            vehicle: vehicleSelect.value === 'auto'
                ? (parseInt(passengerInput.value) > 4 ? 'suv' : 'sedan')
                : vehicleSelect.value,
            fare: fareVal.textContent
        };

        try {
            const response = await fetch('/api/bookings/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            });

            if (response.ok) {
                const result = await response.json();
                alert(`🏨 ELITE BOOKING CONFIRMED!\nBooking ID: #B${result.bookingId}\n\nYour premium captain will be assigned shortly.`);
                bookingForm.reset();

                // Clear map state
                if (mapMarker) {
                    map.removeLayer(mapMarker);
                    mapMarker = null;
                }

                // Clear coordinate datasets
                document.getElementById('pickup').removeAttribute('data-coords');
                document.getElementById('drop').removeAttribute('data-coords');
                pickupCoords = null;
                dropCoords = null;

                updateVehicleSelection();
            } else {
                const errData = await response.json();
                console.error('Server Booking Error:', errData);
                alert(`Booking failed: ${errData.error || 'Please check your connection.'}`);
            }
        } catch (err) {
            console.error('Submission Error:', err);
            alert('A network error occurred.');
        }
    });

    // --- Authentication UI Header Logic ---
    function updateAuthHeader() {
        const member = JSON.parse(localStorage.getItem('elite_member'));
        const pilot = JSON.parse(localStorage.getItem('elite_pilot'));
        const master = JSON.parse(localStorage.getItem('elite_master'));

        const navLinks = document.querySelector('.nav-links');
        const bookBtn = document.querySelector('.nav-cta');
        const logoutBtn = document.getElementById('nav-logout');

        // Hero Button Toggles (Index.html layout without nav)
        const guestActions = document.querySelectorAll('.guest-action');
        const authActions = document.querySelectorAll('.auth-action');
        const heroDashBtn = document.getElementById('hero-dashboard-btn');

        if (member || pilot || master) {
            document.body.classList.add('authenticated');
            guestActions.forEach(btn => btn.style.display = 'none');
            authActions.forEach(btn => btn.style.display = 'block');

            if (heroDashBtn) {
                if (member) {
                    heroDashBtn.textContent = 'Traveler Hub';
                    heroDashBtn.onclick = () => window.location.href = 'dashboard.html';
                } else if (pilot) {
                    heroDashBtn.textContent = 'Pilot Portal';
                    heroDashBtn.onclick = () => window.location.href = 'driver.html';
                } else if (master) {
                    heroDashBtn.textContent = 'Control Center';
                    heroDashBtn.onclick = () => window.location.href = 'admin.html';
                }
            }
        } else {
            document.body.classList.remove('authenticated');
            guestActions.forEach(btn => btn.style.display = 'block');
            authActions.forEach(btn => btn.style.display = 'none');
        }

        if (!navLinks) return;

        // Clear existing auth links
        navLinks.querySelectorAll('.auth-link').forEach(l => l.remove());

        if (member || pilot || master) {
            document.body.classList.add('authenticated');

            // Add Member Link
            if (member) {
                const li = document.createElement('li');
                li.className = 'auth-link';
                li.innerHTML = `<a href="dashboard.html" style="color:var(--primary-red); font-weight:700;">My Travel Hub</a>`;
                navLinks.insertBefore(li, navLinks.firstChild);
            }

            // Add Pilot Link
            if (pilot) {
                const li = document.createElement('li');
                li.className = 'auth-link';
                li.innerHTML = `<a href="driver.html" style="color:#FFD700; font-weight:700;">Pilot Portal</a>`;
                navLinks.appendChild(li);
            }

            // Add Admin Link
            if (master) {
                const li = document.createElement('li');
                li.className = 'auth-link';
                li.innerHTML = `<a href="admin.html" style="color:#00FF00; font-weight:700;">Control Center</a>`;
                navLinks.appendChild(li);
            }

            // ADDED: Logout button for mobile burger menu
            const logoutLi = document.createElement('li');
            logoutLi.className = 'auth-link menu-button-item mobile-only-item';
            logoutLi.innerHTML = `<button class="btn logout-btn" onclick="logoutUser()" style="display:flex !important;">🚪 Sign Out</button>`;
            navLinks.appendChild(logoutLi);

            // ADDED: Book Now button for mobile burger menu
            const bookLi = document.createElement('li');
            bookLi.className = 'auth-link menu-button-item mobile-only-item';
            bookLi.innerHTML = `<button class="btn btn-primary" onclick="openMapPicker()">Book Now</button>`;
            navLinks.appendChild(bookLi);

            // Update header button text only, don't touch display style
            if (bookBtn) {
                if (member) {
                    bookBtn.textContent = 'Traveler Hub';
                    bookBtn.onclick = () => window.location.href = 'dashboard.html';
                } else {
                    bookBtn.textContent = 'Book Now';
                    bookBtn.onclick = () => window.location.href = '#booking';
                }
            }

            if (logoutBtn) {
                const primaryName = (member || pilot || master).name.split(' ')[0];
                logoutBtn.textContent = `Logout (${primaryName})`;
            }
        } else {
            document.body.classList.remove('authenticated');

            const li = document.createElement('li');
            li.className = 'auth-link';
            li.innerHTML = `<a href="auth.html">Login</a>`;
            navLinks.appendChild(li);

            // ADDED: Book Now button for mobile burger menu (Guest Mode)
            const bookLi = document.createElement('li');
            bookLi.className = 'auth-link menu-button-item mobile-only-item';
            bookLi.innerHTML = `<button class="btn btn-primary" onclick="openMapPicker()">Book Now</button>`;
            navLinks.appendChild(bookLi);
        }
    }

    window.logoutUser = function () {
        localStorage.removeItem('elite_member');
        localStorage.removeItem('elite_pilot');
        localStorage.removeItem('elite_master');
        window.location.reload();
    }

    updateAuthHeader();

    // Demo: Direct link to panels (for user review)
    // In production, these would be protected by login
    document.querySelector('.logo').addEventListener('dblclick', () => {
        if (confirm("Enter Admin Panel?")) window.location.href = 'admin.html';
    });
});

/**
 * GOOGLE MAPS INTEGRATION NOTES:
 * To enable real distance calculation, add the following script to index.html:
 * <script src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=places"></script>
 * 
 * Then use:
 * let autocompletePickup = new google.maps.places.Autocomplete(document.getElementById('pickup'));
 * let autocompleteDrop = new google.maps.places.Autocomplete(document.getElementById('drop'));
 * 
 * And for fare:
 * let service = new google.maps.DistanceMatrixService();
 * service.getDistanceMatrix({
 *     origins: [pickup],
 *     destinations: [drop],
 *     travelMode: 'DRIVING'
 * }, callback);
 */
