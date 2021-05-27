var Q = require('q');
var getRequest = require('./getRequest.js');
var keys;

if (process.env.PORT) {
  keys = {
    googleAPIKey: process.env.GOOGLE_KEY,
    zwsId: process.env.ZILLOW_KEY,
    instagramAccessToken: process.env.INSTAGRAM_KEY
  }
} else {
  keys = require('../config/keys.js');
}
/*Input: address
  Output: geoCode = {
            latitude :
            longitude :
            place_id :
          }
*/
module.exports = function (address) {
  var deferred = Q.defer();
  var address = address;
  var gPlacesUrl_address = 'https://maps.googleapis.com/maps/api/geocode/json?address=';
  var gPlacesUrl_sensor = '&sensor=false';
  console.log('server.js says: geoCode called.');
  // console.log('address: ',address);
  // console.log('googleAPIKey: ',keys.googleAPIKey);
  var gPlacesUrl = gPlacesUrl_address + address + gPlacesUrl_sensor + "&key=" + keys.googleAPIKey;
  console.log('gPlacesUrl', gPlacesUrl)
  console.log("******************************************************")
  getRequest(gPlacesUrl)
  .then(function (coordinatesObj) {
    console.log(coordinatesObj)
    if(coordinatesObj.status === 'OK') {
      var results = coordinatesObj.results[0];
      var geoCode = {
        formattedAddress : results.formatted_address,
        placeId : results.place_id,
        coordinates : {
          latitude: results.geometry.location.lat,
          longitude: results.geometry.location.lng
        }
      };
      console.log(geoCode)
      deferred.resolve(geoCode);
    }
    else {
      deferred.reject('Invalid Address.');
      console.log("invalid address")
    }
  });
  return deferred.promise;
}
