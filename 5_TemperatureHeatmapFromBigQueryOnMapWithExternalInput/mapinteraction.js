    // Client ID for OAuth 2.0 authorization against BigQuery.
    var clientId = '[Your-Client-Id]';
    var scopes = 'https://www.googleapis.com/auth/bigquery';

    // BigQuery configuration settings for executing queries
    var gcpProjectId = '[Your-Project-Id]';

    // Limit the number of records that a query will return.
    var recordLimit = 10000;
    var jobCheckTimer;

    var map;
    var drawingManager;


    //--- BigQuery related helper-functions

    // Check if the user is authorized. (OAuth flow)
    function authorize(event) {
      gapi.auth.authorize({client_id: clientId, scope: scopes, immediate: false}, handleAuthResult);
      return false;
    }

    // If authorized, load BigQuery API
    function handleAuthResult(authResult) {
      if (authResult && !authResult.error) {
        loadApi();
      } else {
        console.error('Not authorized.')
      }
    }

    // Load BigQuery client API and then initialize the map.
    function loadApi(){
      gapi.client.load('bigquery', 'v2').then(
        function() {
          initMap();
        }
      );
    }

    // Function to send a query to BigQuery using the Google Client API for JavaScript.
    function sendQuery(queryString){
      let request = gapi.client.bigquery.jobs.query({
          'query': queryString,
          'timeoutMs': 30000,
          'projectId': gcpProjectId,  //see configuration value above
          'useLegacySql':false
      });
      request.execute(response => checkJobStatus(response.jobReference.jobId));
    }

    // Function to poll a BigQuery job to see if it has finished executing.
    function checkJobStatus(jobId){
      let request = gapi.client.bigquery.jobs.get({
        'projectId': gcpProjectId,
        'jobId': jobId
      });
      request.execute(response => {

        //Show job statistics to the user
        updateStatus(response);

        if (response.status.errorResult){
          // Handle any errors.
          console.log(response.status.error);
          return;
        }
        if (response.status.state == 'DONE'){
          // Get the results.
          clearTimeout(jobCheckTimer);
          getQueryResults(jobId);
          return;
        }
        // Not finished, check again in a moment.
        jobCheckTimer = setTimeout(checkJobStatus, 500, [jobId]);       
      });
    }

    // When a BigQuery job has completed, fetch the results.
    function getQueryResults(jobId){
      let request = gapi.client.bigquery.jobs.getQueryResults({
        'projectId': gcpProjectId,
        'jobId': jobId
      });
      request.execute(response => {
        showStations(response.result.rows);

        //Hide the 'loading' animation.
        fadeToggle(document.getElementById('spinner'));

        //Show job statistics to the user
        updateStatus(response);
      })
    }


    //--- Map-related functions.
    function initMap() {
      const brussels = { lat: 50.8476, lng: 4.3572 };
      map = new google.maps.Map(document.getElementById('map'), {
        center: brussels,
        zoom: 5,
        styles: mapStyle //our custom style - see below
      });
      setUpDrawingTools();
    }

    // Add the DrawingManager and set up drawing event handlers.
    function setUpDrawingTools(){
      // Initialize drawing manager.
      drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.RECTANGLE,
        drawingControl: true,
        drawingControlOptions: {
          position: google.maps.ControlPosition.TOP_LEFT,
          drawingModes: [
            google.maps.drawing.OverlayType.RECTANGLE
          ]
        },
        rectangleOptions: {
          fillOpacity: 0
        }
      });
      drawingManager.setMap(map);

      // Handle the drawing events.
      drawingManager.addListener('rectanglecomplete', rectangle => {
        //show a 'loading' animation to indicate that something is happening.
        fadeToggle(document.getElementById('spinner'));
        rectangleQuery(rectangle.getBounds());
      });
    }


    //--- Query-related functions.

    // Query locations by rectangular area.
    function rectangleQuery(latLngBounds){
      let queryString = rectangleSQL(latLngBounds.getNorthEast(), latLngBounds.getSouthWest());
      sendQuery(queryString);
    }

    function rectangleSQL(ne, sw){
      let queryString = 'SELECT station.name, station.latitude, station.longitude, ROUND(AVG(wx_2015.value/10), 2) as wx_2015_tmax'
      queryString += ' FROM `bigquery-public-data.ghcn_d.ghcnd_stations` AS station'
      queryString += ' JOIN `bigquery-public-data.ghcn_d.ghcnd_2015` AS wx_2015 ON station.id = wx_2015.id'
      queryString += ' WHERE station.latitude > ' + sw.lat();
      queryString += ' AND station.latitude < ' + ne.lat();
      queryString += ' AND station.longitude > ' + sw.lng();
      queryString += ' AND station.longitude < ' + ne.lng();
      queryString += ' AND wx_2015.element = "TMAX"'
      queryString += ' AND EXTRACT(MONTH FROM wx_2015.date) = ' + document.getElementById("month").value;
      queryString += ' GROUP BY station.id, station.name, station.latitude, station.longitude'
      queryString += ' LIMIT ' + recordLimit;

      return queryString;
    }


    //--- Place the stations on the map

    // Show query results as colored circles on the map.
    function showStations(rows) {

      //Only execute if we actually found stations in the selected area
      if(rows.length > 0) {
        //TODO: Use custom layers to make this more performant for large queries with many locations // see: https://stackoverflow.com/questions/6768477/adding-many-circles-to-a-google-map

        let nameCol = 0;
        let latCol = 1;
        let lngCol = 2;
        let tmaxCol = 3;
        let weatherStationMap = [];

        //Fill array with all station coordinates & data
        for (let i = 0; i < rows.length; i++) {
          let f = rows[i].f;

          let coords = { lat: parseFloat(f[latCol].v), lng: parseFloat(f[lngCol].v) };
          let latLng = new google.maps.LatLng(coords);

          let stationName = f[nameCol].v;
          let stationTMax = f[tmaxCol].v
          
          weatherStationMap.push( { location: latLng, name: stationName, tmax: stationTMax } );
        }

        // Place the circle on the map for each item in weatherStationMap array
        for (const weatherStation in weatherStationMap) {
          
          const low = [250, 100, 50]; // color of low temperature
          const high = [0, 100, 50]; // color of high temperature
          const minTemp = -20.0;  // value we consider lowest (celcius), and should be all blue
          const maxTemp = 40.0;   // value we consider highest (celcius), and should be all red
          
          // fraction represents where the value sits between the min and max
          const fraction = (Math.min(weatherStationMap[weatherStation].tmax, maxTemp) - minTemp) / (maxTemp - minTemp);
          const color = interpolateHsl(low, high, fraction);

          // Add the circle for this city to the map.
          const weatherStationCircle = new google.maps.Circle({
            strokeColor: color,
            strokeOpacity: 1,
            strokeWeight: 2,
            fillColor: color,
            fillOpacity: 0.6,
            map,
            center: weatherStationMap[weatherStation].location,
            radius: 10000,
          });  
        
        }
      }
    }

    function interpolateHsl(lowHsl, highHsl, fraction) {
      const color = [];
    
      for (let i = 0; i < 3; i++) {
        // Calculate color based on the fraction.
        color.push((highHsl[i] - lowHsl[i]) * fraction + lowHsl[i]);
      }
      return "hsl(" + color[0] + "," + color[1] + "%," + color[2] + "%)";
    }


    //Visual satistics output about query response
    function updateStatus(response){
      if(response.statistics){
        let durationMs = response.statistics.endTime - response.statistics.startTime;
        let durationS = durationMs/1000;
        let suffix = (durationS ==1) ? '':'s';
        let durationTd = document.getElementById("duration");
        durationTd.innerHTML = durationS + ' second' + suffix;
      }
      if(response.totalRows){
        let rowsTd = document.getElementById("rowCount");
        rowsTd.innerHTML = response.totalRows;
      }
      if(response.totalBytesProcessed){
        let bytesTd = document.getElementById("bytes");
        bytesTd.innerHTML = (response.totalBytesProcessed/1073741824) + ' GB';
      }
    }


    //toggle the opacity of an HTML element to make it appear/disappear. We are using this in the 'loading' view.
    function fadeToggle(obj){
        if(obj.style.opacity==1){
            obj.style.opacity = 0;
            setTimeout(() => { 
              obj.style.zIndex = -1000;
            }, 1000);
        } else {
            obj.style.zIndex = 1000;
            obj.style.opacity = 1;
        }
    }

    
    // We are custom-color-styling the map to fit our 'website'
    const mapStyle = [
      {
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#f5f5f5"
          }
        ]
      },
      {
        "elementType": "labels.icon",
        "stylers": [
          {
            "visibility": "on"
          }
        ]
      },
      {
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#616161"
          }
        ]
      },
      {
        "elementType": "labels.text.stroke",
        "stylers": [
          {
            "color": "#f5f5f5"
          }
        ]
      },
      {
        "featureType": "administrative.land_parcel",
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#bdbdbd"
          }
        ]
      },
      {
        "featureType": "poi",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#eeeeee"
          }
        ]
      },
      {
        "featureType": "poi",
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#757575"
          }
        ]
      },
      {
        "featureType": "poi.park",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#e5e5e5"
          }
        ]
      },
      {
        "featureType": "poi.park",
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#9e9e9e"
          }
        ]
      },
      {
        "featureType": "road",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#ffffff"
          }
        ]
      },
      {
        "featureType": "road.arterial",
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#757575"
          }
        ]
      },
      {
        "featureType": "road.highway",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#dadada"
          }
        ]
      },
      {
        "featureType": "road.highway",
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#616161"
          }
        ]
      },
      {
        "featureType": "road.local",
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#9e9e9e"
          }
        ]
      },
      {
        "featureType": "transit.line",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#e5e5e5"
          }
        ]
      },
      {
        "featureType": "transit.station",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#eeeeee"
          }
        ]
      },
      {
        "featureType": "water",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#c9c9c9"
          }
        ]
      },
      {
        "featureType": "water",
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#9e9e9e"
          }
        ]
      }
    ]