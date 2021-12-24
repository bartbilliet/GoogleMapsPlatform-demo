let map;

function initMap() {
  const brussels = { lat: 50.8476, lng: 4.3572 };

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 3,
    center: brussels,
    mapTypeId: "terrain",
  });

  // Create a <script> tag and set the USGS URL as the source.
  const script = document.createElement("script");

  
  // Loading past 7-day M2.5+ earthquake data from earthquake.usgs.gov (via CORS)
  // For details about the dataset, see: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php

  // When the script runs, the target domain passes the data as an argument to another script, usually named callback(). In our example the callback function name is eqfeed_callback. 
  // The target domain defines the callback script name, which is the first name on the page when you load the target URL in a browser.
  script.src = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojsonp";
  document.getElementsByTagName("head")[0].appendChild(script);
}

// We define the callback script here in our code, here named eqfeed_callback based on the callback script name defined by our GeoJSON data script. 
// Loop through the results array and place a marker for each set of coordinates received from the above script. 
const eqfeed_callback = function (results) {
  
  for (let i = 0; i < results.features.length; i++) {
    const coords = results.features[i].geometry.coordinates;
    const latLng = new google.maps.LatLng(coords[1], coords[0]);

    new google.maps.Marker({
      position: latLng,
      map: map,
    });
  }
};