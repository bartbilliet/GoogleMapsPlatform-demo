
// Initialize and add the map
function initMap() {

// The location of Brussels
const brussels = { lat: 50.8476, lng: 4.3572 };

// The map, centered at Brussels
const map = new google.maps.Map(document.getElementById("map"), {
    zoom: 7,
    center: brussels,
});

// The marker, positioned at Brussels
const marker = new google.maps.Marker({
    position: brussels,
    map: map,
});
}