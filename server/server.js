var express = require('express');
var middleware = require('./config/middleware.js');
var http = require('http');
var Q = require('q');
var keys = require('./config/keys.js');
var request = require('request');
var _ = require('underscore');
var parseString = require('xml2js').parseString;

//Helpers
var getRequest = require('./helpers/getRequest.js');
var getXmlRequest = require('./helpers/getXmlRequest.js');

app = express();
middleware(app,express);

//Global Variables
var userDestination;
var neighborhoods;
var country;
var numNeighborhoods;

var neighborhoodObject = {};

//Handle a POST request
//api/getNeighbors
app.post('/api/getNeighbors', function (req, res) {
	console.log('server.js says: POST request received! Data:', req.body);

	var searchInfo = req.body;
	var glanceCards = [];
	var eventNumber = 0;

	var checkAndRespond = function (neighborhoodObj) {
		if(eventNumber === 1) {
			res.status(200).send(neighborhoodObj);
		}
	}

	geoCode(searchInfo.address)
	.then(function (geoCode) {
		// console.log('Data from geoCode received. EventNumber:', eventNumber);
		// console.log('geoCode:', geoCode);
    ++eventNumber;
		userDestination = geoCode;
		return findNeighborhoods(geoCode);
	},function (errorMessage) {
    ++eventNumber;
    checkAndRespond({});
  })

	.then(function (neighborhoodObj) {
		console.log('Neighborhoods fetched.');
    numNeighborhoods = Object.keys(neighborhoodObj).length;
    if(Object.keys(neighborhoodObj).length === 0) { checkAndRespond({}); }
		return getStreetAddresses(neighborhoodObj);
	})

	.then(function (neighborhoodObj) {
		console.log('Street addresses fetched.');
		return getDistances(neighborhoodObj);
	})

  .then(function (neighborhoodObj) {
    console.log('Distances fetched.');
    return getPictures(neighborhoodObj);
  })

  .then(function (neighborhoodObj) {
    console.log('Instagram Pictures fetched.');
    return getAmenitiesAndAttractions(neighborhoodObj);
  })

  .then(function (neighborhoodObj) {
    console.log('Amenities fetched.');
    //Fetch estimates and Demography Information only if the address is in the United States
    if(country === 'USA') { return getEstimates(neighborhoodObj, searchInfo); }
    else { checkAndRespond(neighborhoodObj); }
  })

  .then(function (neighborhoodObj) {
    console.log('Rental Estimates fetched.');
    // checkAndRespond(neighborhoodObj);
    return getDemographics(neighborhoodObj)
  })

  .then(function (neighborhoodObj) {
    console.log('Zillow Info Fetched.');
    console.log('eventNumber:', eventNumber);
    checkAndRespond(neighborhoodObj);
  });

});	//end of POST request handler


//-----------------------------------------------------------------------------------
//GET INSTAGRAM pictures that are location specific for neighborhoods
/*Input: neighborhood Object
  Output: neighborhood Object augmented with Instagram images
*/
var getPictures = function (neighborhoodObj) {
  var deferred = Q.defer();
  var numEvents = 0;


  for(var neighborhood in neighborhoodObj) {
    var coordinates = {
      latitude : neighborhoodObj[neighborhood].latitude,
      longitude : neighborhoodObj[neighborhood].longitude
    };


    //remove
    // console.log('Calling instagram: Neighborhood:',neighborhood);

    //remove
    getInstagram(coordinates, neighborhood)
    .then(function (tuple) {
      //[imagesArray, neighborhood]
      var imagesArray = tuple[0];
      var neighborhood = tuple[1];

      numEvents++;
      neighborhoodObj[neighborhood].instagram = imagesArray;

      //remove
      // console.log('Instagram Images received for neighborhood:', neighborhood);

      if(numEvents === numNeighborhoods) {
        deferred.resolve(neighborhoodObj);
      }
    });
  }

  return deferred.promise;
}

//-----------------------------------------------------------------------------------
//GET INSTAGRAM pictures that are location specific
/*Input: Coordinates, neighborhood
  Output: imagesArray with links
*/
var getInstagram = function (coordinates, neighborhood) {
  var deferred = Q.defer();

  var instaUrl_accessToken = 'https://api.instagram.com/v1/media/search?access_token='
  var instaUrl_latitude = '&lat='
  var instaUrl_longitude = '&lng='
  var instaUrl_distance = '&distance=';

  var instaUrl = instaUrl_accessToken + keys.instagramAccessToken +
                 instaUrl_latitude + coordinates.latitude +
                 instaUrl_longitude + coordinates.longitude +
                 instaUrl_distance + 2000;

  //remove
  console.log('instaUrl:', instaUrl);

  getRequest(instaUrl)
  .then(function (responseObj) {
    var results = responseObj.data;
    var imagesArray = [];

    //remove
    // console.log('getInstagram says: Response data fetched: ',results.length);

    _.each(results, function (result) {
      // console.log(result.type);
      imagesArray.push({
        name: result.location.name,
        type: result.type,
        location: result.location,
        link: result.link,
        likes: result.likes,
        images: result.images,
        user: result.user
      });
    });

    deferred.resolve([imagesArray, neighborhood]);
  });

  return deferred.promise;
}

//-----------------------------------------------------------------------------------
//GET amenities for all neighborhoods
/*Input: neighborhood Object
  Output: neighborhood Object augmented with amenities
*/
var getAmenitiesAndAttractions = function (neighborhoodObj) {
  var deferred = Q.defer();
  // console.log('Get Amenities called.');

  //console.log
  var numEvents = 0;


  for(var neighborhood in neighborhoodObj) {
    var coordinates = {
      latitude : neighborhoodObj[neighborhood].latitude,
      longitude : neighborhoodObj[neighborhood].longitude
    };
    queryAmenities(coordinates, neighborhood)
    .then(function (tuple) {
      //[amenitiesObj, neighborhood]
      var amenitiesObj = tuple[0];
      var neighborhood = tuple[1];

      numEvents++;
      neighborhoodObj[neighborhood].amenities_attractions = amenitiesObj;
      // console.log('Number of events:',numEvents);
      // console.log('Number of neighborhoods:',numNeighborhoods);

      if(numEvents === numNeighborhoods) { deferred.resolve(neighborhoodObj); }    //change the if condition
    });
  }

  return deferred.promise;
}


//-----------------------------------------------------------------------------------
//Get amenities for a given neighrbood for radii 0.5, 1.5 and 2.5 kilometers
/*Input: neighborhood Object
  Output: AmenitiesObject
*/
var queryAmenities = function (coordinates, neighborhood) {
  var deferred = Q.defer();

  var amenitiesObj = {};
  var radius = 500;
  var types = 'airport|atm|bank|beauty_salon|book_store|cafe|car_rental|convenience_store|fire_station|food|gas_station|grocery_or_supermarket|gym|hospital|laundry|library|pharmacy|post_office|school|spa|store|subway_station|train_station|veterinary_care|amusement_park|aquarium|art_gallery|bar|bowling_alley|casino|movie_theatre|museum|night_club|park|restaurant|shopping_mall|stadium|university|zoo';

  var gAmenitiesUrl_location = 'https://maps.googleapis.com/maps/api/place/search/json?location=';
  var gAmenitiesUrl_radius = '&radius=';
  var gAmenitiesUrl_types = '&types=';
  var gAmenitiesUrl_key = '&key=';

  var gAmenitiesUrl_1 = gAmenitiesUrl_location + coordinates.latitude + ',' + coordinates.longitude + gAmenitiesUrl_radius;
  var gAmenitiesUrl_2 = gAmenitiesUrl_types + types + gAmenitiesUrl_key + keys.googleAPIKey;

  var numEvents = 0;

  //function to append amenities to amenities object
  var append = function (amenitiesArray) {
    for(var i=0; i<amenitiesArray.length; i++) {
      var amenity = amenitiesArray[i];
      amenitiesObj[amenity.name] = amenitiesObj[amenity.name] || amenity;
    }
  }

  //Fetch amenities for radii 500, 1500 and 2500
  for(var i=0; i<3; i++) {
    var gAmenitiesUrl = gAmenitiesUrl_1 + radius + gAmenitiesUrl_2;
    // console.log('gAmenitiesUrl:',gAmenitiesUrl);
    radius += 1000;

    getRequest(gAmenitiesUrl)
    .then(function (responseObj) {
      numEvents++;
      //remove
      // console.log('queryAmenities says: number of amenities:', responseObj.results.length);
      append(responseObj.results);

      if(numEvents === 3) {
        //remove
        // console.log('Total number of amenities:', Object.keys(amenitiesObj).length);

        deferred.resolve([amenitiesObj, neighborhood]);
      }
    }, function (errorMessage) {
      numEvents++;
      if(numEvents === 3) { deferred.resolve([amenitiesObj, neighborhood]); }
    });
  }

  return deferred.promise;
}

//-----------------------------------------------------------------------------------
//GET auxillary information for a neighborhood from Zillow
/*Input: neighborhood Object
  Output: Object of neighborhoods
*/
var getDemographics  = function (neighborhoodObj) {
  var deferred = Q.defer();
  var numEvents = 0;
  //remove
  console.log('Fetch Zillow Info called. numNeighborhoods:', numNeighborhoods);

//UNCOMMENT TO QUERY ZILLOW
  for(var neighborhood in neighborhoodObj) {
    queryZillow(neighborhood, neighborhoodObj[neighborhood].city)
    .then(function (tuple) {
      //tuple: [demographyObj, neighborhood]
      var demographyObj = tuple[0];
      var neighborhood = tuple[1];

      numEvents++;
      // console.log('Zillow data fetched for neighborhood:', neighborhood);
      // console.log('Demography information:', demographyObj['Demographics:demographics']);
      neighborhoodObj[neighborhood].demography = demographyObj['Demographics:demographics'].response[0];
      // _.extend(neighborhoodObj[neighborhood], demographyObj);

      if(numEvents === numNeighborhoods) {
        deferred.resolve(neighborhoodObj);
      }
    });
  }

//COMMENT TO ACTIVATE ZILLOW
// deferred.resolve(neighborhoodObj);

  return deferred.promise;
};


//-----------------------------------------------------------------------------------
//GET demography information for a neighborhood and a city from Zillow
/*Input: neighborhood, city
  Output: demographyObj
*/
var queryZillow = function (neighborhood, city) {
  var deferred = Q.defer();

  var zwsId = keys.zwsId;
  var zillowUrl_zwsId = 'http://www.zillow.com/webservice/GetDemographics.htm?zws-id='
  var zillowUrl_neighborhood = '&neighborhood='
  var zillowUrl_city = '&city=';

  var zillowUrl = zillowUrl_zwsId + zwsId + zillowUrl_neighborhood + neighborhood + zillowUrl_city + city;

  //remove
  console.log('ZillowUrl:', zillowUrl);

  getXmlRequest(zillowUrl)
  .then(function (responseObj) {
    // console.log('Response Object:', responseObj);
    deferred.resolve([responseObj, neighborhood]);
  });

  return deferred.promise;
}


//-----------------------------------------------------------------------------------
//GET list of neighborhood localities for a pair of coordinates (corresponding to the given street address)
/*Input: coordinates
  Output: Object of neighborhoods
*/

var findNeighborhoods = function (geoCode) {
	var deferred = Q.defer();

	var gPlacesUrl_location = 'https://maps.googleapis.com/maps/api/place/search/json?location=';			//latitude + ',' + longitude
	var gPlacesUrl_radius = '&radius=';
	var gPlacesUrl_types = '&types=';
	var gPlacesUrl_key = 'l&key=';

	var neighborhoodObj = {};
	var radius = 1000;
	var numResponses = 1;
	var key = keys.googleAPIKey;
	var types = 'locality|sublocality|neighborhood|administrative_area_level_1|administrative_area_level_2|administrative_area_level_3|administrative_area_level_4|administrative_area_level_5|sublocality_level_4|sublocality_level_3|sublocality_level_2|sublocality_level_1';

  for(radius = 1000; radius<=20000; radius+=500) {
		var gPlacesUrl = gPlacesUrl_location + geoCode.coordinates.latitude + ',' + geoCode.coordinates.longitude +
										 gPlacesUrl_radius + radius +
										 gPlacesUrl_types + types +
										 gPlacesUrl_key + key;

    //remove
    // console.log('gPlaces:', gPlacesUrl);

		getRequest(gPlacesUrl)
		.then(function (responseObj) {
			var results = responseObj.results;

      //remove
      // console.log('Neighborhood object:', results);

			_.each(results, function (result) {
				neighborhoodObj[result.name] = neighborhoodObj[result.name] ||
				{
          name: result.name,
					latitude: result.geometry.location.lat,
					longitude: result.geometry.location.lng,
					placeId: result.place_id
				};
			});

			//remove
			// console.log('Neighborhoods fetched:',numResponses);

			if(numResponses === 39) { deferred.resolve(neighborhoodObj); }
			else { numResponses++; }
		},

    function (errorMessage) {
      // console.log('Error/server not responding.');
      // console.log('errorMessage:', errorMessage);

      if(numResponses === 39) { deferred.resolve(neighborhoodObj); }
      else { numResponses++; }
    });

	}//end of for loop

	return deferred.promise;
}


//-----------------------------------------------------------------------------------
//GET rental estimates from zilpy.com for a neighborhood object
/*Input: Object of neighborhoods
  Output: Rent estimate for each neighborhood augmented on the object
*/

var getEstimates = function (neighborhoodObj, searchInfo) {
	var deferred = Q.defer();

	var neighborhoodList = Object.keys(neighborhoodObj);
	var lastNeighborhood = neighborhoodList[neighborhoodList.length - 1];
	numNeighborhoods = neighborhoodList.length;
	var numEvents = 0;

  //remove
  // console.log('Getting estimates for rent:');
  // console.log('Number of neighborhoods:', numNeighborhoods);

	for(var neighborhood in neighborhoodObj) {
		//console.log(neighborhoodObj[neighborhood]);
		var zilpySearchInfo = {
			address : neighborhoodObj[neighborhood].streetAddress,
			bedrooms : searchInfo.bedrooms,
			bathrooms : searchInfo.bathrooms
		}

		zilpy(zilpySearchInfo, neighborhood)
		.then(function (triplet) {
			//[rentEstimate, propertyType, neighborhood]
			var rentEstimate = triplet[0];
			var propertyType = triplet[1];
			var neighborhood = triplet[2];
			numEvents++;

			//remove
      // console.log('Neighborhood:',neighborhood);
      // console.log("Completed:",numEvents);

			neighborhoodObj[neighborhood].rentEstimate = rentEstimate;
			neighborhoodObj[neighborhood].propertyType = propertyType;

			if(numEvents === numNeighborhoods) {
				// console.log('Resolved.');
				deferred.resolve(neighborhoodObj);
			}

		});
	}

	return deferred.promise;
}


//-----------------------------------------------------------------------------------
//GET Rent estimate High/Low
/*Prerequisites:
	Street Address, Bedrooms, Bathrooms
  Website: zilpy.com

  Input: searchInfo = {
					address:
					bedrooms:
					bathrooms:
  			}
  Output: zilpyData object
*/

var zilpy = function (searchInfo, neighborhood) {
	var deferred = Q.defer();

	/* Possible values for ptype:
			single_family_house
			apartment_condo
			town_house
	*/

	var zilpyUrl_address = 'http://api-stage.zilpy.com/property/-/rent/newreport?addr='
	var zilpyUrl_bedrooms = '&ptype=apartment_condo&bdr='							//default to apartment_condos
	var zilpyUrl_bathrooms = '&ba=';

	var zilpyUrl = zilpyUrl_address + searchInfo.address + zilpyUrl_bedrooms + searchInfo.bedrooms + zilpyUrl_bathrooms + searchInfo.bathrooms;
  // console.log('zilpyUrl', zilpyUrl);

  //remove
  // deferred.resolve(['ZTO', 'ZTO', neighborhood]);

  // UNCOMMENT - ZILPY TEMPORARILY DISABLED
  //----------------------------------------------------------------------------
	getRequest(zilpyUrl)
	.then(function (zilpyData) {
		 // console.log('Neighborhood fetched:',neighborhood);
		 // console.log('Zilpy Data:',zilpyData);
     // console.log('************************');
		deferred.resolve([zilpyData.estimate, zilpyData.subjectPropertyUserEntry.propertyType, neighborhood]);
	}, function (errorMessage) {
    console.log('Error/server not responding.');
    console.log('errorMessage:', errorMessage);
    deferred.resolve(['N/A', 'N/A', neighborhood]);
  });

	return deferred.promise;
}


//-----------------------------------------------------------------------------------
//GET distances and commute time from each neighborhood to user destination
/* INPUT: neighborhood object
	 OUTPUT: neighborhood obj augmented with commute distance and time
*/
var getDistances = function (neighborhoodObj, transitMode) {
	var transitMode = transitMode || 'driving';
	var deferred = Q.defer();
  //remove
  // console.log('getDistances called.');

  //make an origins array
  var originsArr = [];
  var destination = '' + userDestination.coordinates.latitude + ',' +
  											 userDestination.coordinates.longitude;
  var index = 0;


  var gDrivingUrl_origins = 'https://maps.googleapis.com/maps/api/distancematrix/json?origins=';		//lat,lng|lat,lng|lat,lng
  var gDrivingUrl_destinations = '&destinations=';
  var gDrivingUrl_mode = '&units=metric&mode=';
  var gDrivingUrl_key = '&key=';

  for (var neighborhood in neighborhoodObj) {
  	originsArr.push(neighborhoodObj[neighborhood].latitude + ',' + neighborhoodObj[neighborhood].longitude);
  }

  var origins = originsArr.join('|');

  //remove
  // console.log('origins:',origins);
  // console.log('destination', destination);

  var gDrivingUrl = gDrivingUrl_origins + origins +
  									gDrivingUrl_destinations + destination +
  									gDrivingUrl_mode + transitMode +
  									gDrivingUrl_key + keys.googleAPIKey;

  // remove
  console.log('gDrivingUrl:', gDrivingUrl);

  getRequest(gDrivingUrl)
  .then(function (distancesObj) {
  	var distances = distancesObj.rows;

  	//remove
  	// console.log('Number of rows:',distances.length);

		for(var neighborhood in neighborhoodObj) {

			var distance = distances[index].elements[0].distance.text;
			var time = distances[index].elements[0].duration.text;

			distance = +distance.split(' ')[0];
			time = +time.split(' ')[0];

			//remove
			// console.log('Distance:',distance);
			// console.log('Time:',time);

			neighborhoodObj[neighborhood].commuteInfo = {
				commuteDistance : distance,
				commuteTime : time
			};

			index++;
		}

  	deferred.resolve(neighborhoodObj);
  });

	return deferred.promise;
}


//-----------------------------------------------------------------------------------
//GET street addresses for each neighborhood
/*Input: neighborhoodObj
  Output: Extends each neighborhood in the object with a reference street address
*/
var getStreetAddresses = function (neighborhoodObj) {
	var deferred = Q.defer();

	//remove
	// console.log('List of neighborhoods');

	var neighborhoodList = Object.keys(neighborhoodObj);

  //remove
  console.log('Number of neighborhoods:', neighborhoodList.length);

	var lastNeighborhood = neighborhoodList[neighborhoodList.length - 1];
	var numNeighborhoods = neighborhoodList.length;
	var numEvents = 0;

  var requestCounter = 0;
  var wait = 5;
  var index = 0;

  var makeRequest = function (neighborhood) {
    index++;
    var coordinates = {
      latitude : neighborhoodObj[neighborhood].latitude,
      longitude : neighborhoodObj[neighborhood].longitude
    };

    reverseGeocode(coordinates, neighborhood)
    .then(function (tuple) {
      //[addressObj, neighborhood]
      var addressObj = tuple[0];
      var neighborhood = tuple[1];
      numEvents++;

      //remove
      // console.log('----------getStreetAddresses----------')
      // console.log('Number of streetAddresses:',numEvents);
      // console.log('addressObj:', addressObj);

      neighborhoodObj[neighborhood].streetAddress = addressObj.formatted_address;
      if(country === 'USA') { _.extend(neighborhoodObj[neighborhood], addressObj); }

      if(numEvents === numNeighborhoods) {
        // console.log('Resolved.');
        deferred.resolve(neighborhoodObj);
      }

      if(index < numNeighborhoods) {
        setTimeout(function () {
          makeRequest(neighborhoodList[index]);
        }, wait);
      }

    });
  }

  makeRequest(neighborhoodList[0]);

	//deferred.resolve('done');
	return deferred.promise;
}


//-----------------------------------------------------------------------------------
//GET the street address of a latitude/longitude pair
//Reverse Geocoding
/*
  Input: coordinates = {
						latitude :
						longitude :
  				}
  Output: Street address (string)
*/

var reverseGeocode = function (coordinates, neighborhood) {
	var deferred = Q.defer();

	var geocodeUrl_latlng = 'https://maps.googleapis.com/maps/api/geocode/json?latlng='
	var geocodeUrl_key = '&key=';

	var geocodeUrl = geocodeUrl_latlng + coordinates.latitude + ',' + coordinates.longitude + geocodeUrl_key + keys.googleAPIKey;

	//remove
	// console.log('reverseGeocodeUrl:',geocodeUrl);

	getRequest(geocodeUrl)
	.then(function (streetAddress) {
		 // console.log('***********reverse Geocode**********');
   //   console.log('streetAddress fetched.');
		 // console.log('LatLng:',coordinates.latitude, coordinates.longitude);
		 // console.log('Street Address:',streetAddress);

     if(streetAddress.status === 'OK') {
       var addressBits = streetAddress.results[0].formatted_address.split(', ');
       // console.log('Street address pieces:', addressBits);
       var addressObj = { formatted_address: streetAddress.results[0].formatted_address }

       //Update the global variable
       country = addressBits.pop();
       if(country === 'USA') {
         //standard format
         var stateZip = addressBits.pop().split(' ');
         var state = stateZip[0];
         var zip = stateZip[1];
         var city = addressBits.pop();

         addressObj.country = country;
         addressObj.state = state;
         addressObj.city = city;
         addressObj.zip = zip;
       }

       //remove
       // console.log('addressObj:',addressObj);

  		 deferred.resolve([addressObj, neighborhood]);
     }
     else {
       deferred.resolve([{formatted_address : 'Not available'}, neighborhood]);
     }
	},
  function (errorMessage) {
    // console.log('Error while fetching street address:',errorMessage);
    deferred.reject('Not Available');
  });

	return deferred.promise;
}


//-----------------------------------------------------------------------------------
//GET latitude and longitude of an address, given the address
//Geocode
/*Prerequisites:
  Street Address
  Website: Google maps endpoint

  Input: address
  Output: geoCode = {
            latitude :
            longitude :
            place_id :
          }
*/

var geoCode = function (address) {
  var deferred = Q.defer();

  var address = address;
  var gPlacesUrl_address = 'http://maps.googleapis.com/maps/api/geocode/json?address=';
  var gPlacesUrl_sensor = '&sensor=false';

  // console.log('server.js says: geoCode called.');
  // console.log('address: ',address);
  // console.log('googleAPIKey: ',keys.googleAPIKey);

  var gPlacesUrl = gPlacesUrl_address + address + gPlacesUrl_sensor;

  getRequest(gPlacesUrl)
  .then(function (coordinatesObj) {
    // console.log('coordinatesObj:', coordinatesObj);

    if(coordinatesObj.status === 'OK') {
      //Fetch the placeID, formatted address and the coordinates; make a minimal geoCode
      var results = coordinatesObj.results[0];
      var geoCode = {
        formattedAddress : results.formatted_address,
        placeId : results.place_id,
        coordinates : {
          latitude: results.geometry.location.lat,
          longitude: results.geometry.location.lng
        }
      };
      deferred.resolve(geoCode);
    }

    else {
      deferred.reject('Invalid Address.');
    }
  });

  return deferred.promise;
}



module.exports = app;






















