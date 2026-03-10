/**
 * Elite Cabs - Main Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
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
            // Logic for specific trip types can be added here
        });
    });

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

    // 4. Fare Calculation Logic
    // Using Mapbox Directions API for calculating real driving distance
    async function calculateFare() {
        const pickup = document.getElementById('pickup').value;
        const drop = document.getElementById('drop').value;

        if (pickup && drop) {
            if (window.mapboxAccessToken) {
                try {
                    // Step 1: Geocode pickup and drop into coordinates
                    const pickupCoords = await geocodeAddress(pickup);
                    const dropCoords = await geocodeAddress(drop);

                    if (pickupCoords && dropCoords) {
                        // Step 2: Get Directions from Mapbox
                        const query = await fetch(
                            `https://api.mapbox.com/directions/v5/mapbox/driving/${pickupCoords[0]},${pickupCoords[1]};${dropCoords[0]},${dropCoords[1]}?access_token=${window.mapboxAccessToken}`
                        );
                        const json = await query.json();

                        if (json.routes && json.routes.length > 0) {
                            const distanceInMeters = json.routes[0].distance;
                            const distanceInKm = Math.ceil(distanceInMeters / 1000);
                            updateFareDisplay(distanceInKm);
                            return;
                        }
                    }
                } catch (err) {
                    console.error('Mapbox Distance Error:', err);
                }
            }

            // Fallback to mock if API fails or token not set
            updateFareDisplay(Math.floor(Math.random() * 50) + 10);
        } else {
            fareEstimate.classList.add('hidden');
        }
    }

    async function geocodeAddress(address) {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${window.mapboxAccessToken}&limit=1`;
        const response = await fetch(url);
        const data = await response.json();
        return data.features && data.features.length > 0 ? data.features[0].center : null;
    }

    function updateFareDisplay(distance) {
        const passengers = parseInt(passengerInput.value) || 1;
        const vehicleType = (vehicleSelect.value === 'auto')
            ? (passengers > 4 ? 'suv' : 'sedan')
            : vehicleSelect.value;

        let baseFare = 0;
        let perKm = 0;

        if (vehicleType === 'suv') {
            baseFare = 200;
            perKm = 22;
        } else {
            baseFare = 100;
            perKm = 15;
        }

        const totalFare = baseFare + (distance * perKm);

        distanceVal.textContent = distance;
        fareVal.textContent = `₹${totalFare}`;
        fareEstimate.classList.remove('hidden');
    }

    // --- Mapbox Search / Autocomplete Implementation ---
    function setupAutocomplete(inputId, suggestionBoxId) {
        const input = document.getElementById(inputId);
        const box = document.getElementById(suggestionBoxId);
        let timeout = null;

        input.addEventListener('input', () => {
            clearTimeout(timeout);
            const query = input.value;
            if (query.length < 3) {
                box.innerHTML = '';
                return;
            }

            timeout = setTimeout(async () => {
                if (!window.mapboxAccessToken) return;
                const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${window.mapboxAccessToken}&types=address,poi&limit=5`;
                try {
                    const res = await fetch(url);
                    const data = await res.json();
                    box.innerHTML = '';
                    data.features.forEach(feature => {
                        const item = document.createElement('div');
                        item.className = 'suggestion-item';
                        item.textContent = feature.place_name;
                        item.onclick = () => {
                            input.value = feature.place_name;
                            box.innerHTML = '';
                            calculateFare();
                        };
                        box.appendChild(item);
                    });
                } catch (e) { console.error('Mapbox search failed', e); }
            }, 300);
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (e.target !== input) box.innerHTML = '';
        });
    }

    // --- Dynamic Location Service initialization ---
    async function initLocationServices() {
        try {
            const response = await fetch('/api/config/maps-key');
            const data = await response.json();

            if (!data.mapboxToken || data.mapboxToken.includes('YOUR_')) {
                console.warn('Mapbox Token not configured. Using elite mock mode.');
                return;
            }

            window.mapboxAccessToken = data.mapboxToken;
            console.log('Mapbox Location Service initialised.');

            // Initialize Search Logic
            setupAutocomplete('pickup', 'pickup-suggestions');
            setupAutocomplete('drop', 'drop-suggestions');

        } catch (err) {
            console.error('Failed to initialise Mapbox:', err);
        }
    }

    initLocationServices();

    // Fallback listeners for standard inputs
    document.getElementById('pickup').addEventListener('blur', () => setTimeout(calculateFare, 200));
    document.getElementById('drop').addEventListener('blur', () => setTimeout(calculateFare, 200));

    // 5. Booking Submission
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const bookingData = {
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
                alert(`Booking Confirmed! ID: #B${result.bookingId}\n\nOur captain will be assigned shortly.`);
                bookingForm.reset();
                updateVehicleSelection();
            } else {
                alert('Booking failed. Please check your data.');
            }
        } catch (err) {
            console.error('Submission Error:', err);
            alert('A network error occurred.');
        }
    });

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
