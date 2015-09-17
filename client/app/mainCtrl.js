app.controller('MainController', ['Map', 'ServerApi', '$state', 'Details', 'Charts', '$anchorScroll', '$location', function (Map, ServerApi, $state, Details, Charts, $anchorScroll, $location){

  var main = this;
  main.picturesArr = [];
  main.isCollapsed = false;
  main.neighborhoodsObj = {}; //this is the response from the server

  main.searchInfo = {}; // JSON obj to send to server
  main.searchInfo.address = '';
  main.searchInfo.buyOrRent = 'rent';
  main.searchInfo.bedrooms = 1;
  main.searchInfo.bathrooms = 1;
  main.searchInfo.maxRent = 8000;
  main.searchInfo.commuteTime = 45;
  main.searchInfo.commuteDistance = 30;
  main.imageArray = ['../assets/images/default-neighborhood-bg.jpg', '../assets/images/default-photo-gallery.jpg', '../assets/images/santamonica.jpg'];

  main.filteredNeighborhoodArray = [];
  main.serverResponse = {};
  main.filterType = 'estimateLow';
  main.currentNeighborhood;

  main.serviceObj = {};
  main.attractionObj = {};

  main.coordinates = {
      latitude: 38.5,
      longitude: -98.5
  };

  main.priceRange = '';      //stores the current price range for the selected neighborhood
  main.buyPrice = {};

  //unscoped local variables
  var autocomplete;

  //----------------------------------------------------------------------------------
  // Function to flatten the object so that the array can be sorted by a parameter
  // Input: neighborhoodsObj
  // Output: flattened array of objects
  main.getPriceString = function (neighborhood) {
    var obj = {}
    if(main.searchInfo.buyOrRent === 'rent') {
      if(!neighborhood.rentEstimate) {
        obj.title = 'Rent Estimate Not Available';
        return obj;
      }
      obj.title = 'Rent Estimate';
      obj.price = (neighborhood.rentEstimate.estimateLow) ? '$' + neighborhood.rentEstimate.estimateLow.toLocaleString() + ' - ' + '$' + neighborhood.rentEstimate.estimateHigh.toLocaleString() : 'Not Available';
    } else {
        if(!main.buyPrice[neighborhood.name].priceStr) {
          obj.title = 'Home Price Not Available';
          return obj;
        }
        obj.title = main.buyPrice[neighborhood.name].housetype;
        obj.price = main.buyPrice[neighborhood.name].priceStr;
      };
    return obj;
   }

  main.orderPrice = function(obj) {
    if(main.searchInfo.buyOrRent === 'rent') {
      if (obj.rentEstimate) {
        return obj.rentEstimate.estimateLow;
      } else {
      return "Price Not Available"
      }
    } else {
      return main.buyPrice[obj.name].priceNum;
    }
  };

  main.orderByArray = function(neighborhoods){
    var arr = [];
    for (var i = 0; i < neighborhoods.length; i++) {
      if(neighborhoods[i].name==='Downtown') {
        neighborhoods[i].name = neighborhoods[i].name + ' ' + neighborhoods[i].city;
      }
      arr.push({
          name: neighborhoods[i].name,
          commuteTime: neighborhoods[i].commuteInfo.commuteTime,
          commuteDistance: neighborhoods[i].commuteInfo.commuteDistance,
          estimateLow: neighborhoods[i].rentEstimate ? neighborhoods[i].rentEstimate.estimateLow : 'Not Available',
          estimateHigh: neighborhoods[i].rentEstimate ? neighborhoods[i].rentEstimate.estimateHigh : 'Not Available',
          instagram: neighborhoods[i].instagram,
          coordinates: {latitude: neighborhoods[i].latitude, longitude: neighborhoods[i].longitude},
          demography: neighborhoods[i].demographics,
          priceString : main.getPriceString(neighborhoods[i]),
          orderPrice: main.orderPrice(neighborhoods[i])
      });
    }
    return arr;
  };

//Function to get the purchase prices for homes
  main.getBuyPrice  = function(arr) {
    var priceData;
    var dataInfo;
    var temp = {};
      temp.priceNum;
      temp.priceStr;
            //item.demography.pages[0].page[0].tables[0].table[0].data[0].attribute[3].values[0]
        ////.city[0].value[0]._
    arr.forEach( function(item) {
      priceData = {};
      dataInfo = [,];
      temp = {
        housetype: 'House Purchase Estimate',
        priceStr: 'Data Not Available',
        priceNum: 100000000
        };
      if (main.searchInfo.buyOrRent === 'rent') {
        temp.housetype = 'rent selected';
        temp.priceStr = 'rent selected';
      } else if (item.demographics &&
        item.demographics.pages &&
        item.demographics.pages[0] &&
        item.demographics.pages[0].page &&
        item.demographics.pages[0].page[0] &&
        item.demographics.pages[0].page[0].tables &&
        item.demographics.pages[0].page[0].tables[0] &&
        item.demographics.pages[0].page[0].tables[0].table &&
        item.demographics.pages[0].page[0].tables[0].table[0] &&
        item.demographics.pages[0].page[0].tables[0].table[0].data &&
        item.demographics.pages[0].page[0].tables[0].table[0].data[0] &&
        item.demographics.pages[0].page[0].tables[0].table[0].data[0].attribute) {

        priceData = item.demographics.pages[0].page[0].tables[0].table[0].data[0].attribute;

        dataInfo[1] = 'city';

        if (main.searchInfo.bedrooms === '2') {
          temp.housetype = 'Median 2-Bedroom Home Value';
          dataInfo[0] = 3
        } else if (main.searchInfo.bedrooms === '3') {
          temp.housetype = 'Median 3-Bedroom Home Value';
          dataInfo[0] = 4;
        } else if (main.searchInfo.bedrooms === '4') {
          temp.housetype = 'Median 4-Bedroom Home Value';
          dataInfo[0] = 5;
        } else if (main.searchInfo.buyOrRent === 'buy') {
          temp.housetype = 'Median Single Family Home Value';
          dataInfo[0] = 1;
        }
        if (priceData[dataInfo[0]] && priceData[dataInfo[0]].values && priceData[dataInfo[0]].values[0]) {
          if (priceData[dataInfo[0]].values[0].neighborhood) {
            dataInfo[1] = 'neighborhood';
          }
        }
        if (priceData[dataInfo[0]] &&
          priceData[dataInfo[0]].values &&
          priceData[dataInfo[0]].values[0] &&
          priceData[dataInfo[0]].values[0][dataInfo[1]] &&
          priceData[dataInfo[0]].values[0][dataInfo[1]][0] &&
          priceData[dataInfo[0]].values[0][dataInfo[1]][0].value &&
          priceData[dataInfo[0]].values[0][dataInfo[1]][0].value[0] &&
          priceData[dataInfo[0]].values[0][dataInfo[1]][0].value[0]._) {
            temp.priceNum = parseInt(priceData[dataInfo[0]].values[0][dataInfo[1]][0].value[0]._);
            temp.priceStr = '$' + temp.priceNum.toLocaleString();
        }
      }
      main.buyPrice[item.name] = temp;
    });
  };

  //Function to set the selected type of housing to 'rent'
  main.setValueRent = function() {
    main.searchInfo.buyOrRent = 'rent';
  };

  //Function to set the selected type of housing to 'buy'
  main.setValueBuy = function() {
    main.searchInfo.buyOrRent = 'buy';
  };


  //----------------------------------------------------------------------------------
  //Function to set up autocomplete feature for the search field
  main.autoCompleteInit = function () {
    var input = document.getElementById('place-search');
    var options = { types: [] };
    autocomplete = new google.maps.places.Autocomplete(input, options);

    //listener to listen to a place change
    autocomplete.addListener('place_changed', function() {
      var place = autocomplete.getPlace();
      // console.log('mainCtrl.js says: Place changed. Place:',place.formatted_address);
      if(place.formatted_address || main.searchInfo.address.length > 0) {
        main.searchInfo.address = place.formatted_address || main.searchInfo.address;
        // main.submitAddress();
      }
    });
  };

  //----------------------------------------------------------------------------------
  //Function to fetch address and validate it
  main.submitAddress = function() {
    $state.go('main.results');
    main.filteredNeighborhoodArray = [];
    requestNeighborhoods();
    Map.panAndFocusDestination(main.searchInfo.address);
  };

  //Rerouters
  main.getResults = function() {
    Map.userDestination = main.searchInfo.address;
    $state.go('main.results');
    main.submitAddress();
  }
  main.gotoLanding = function() {
    $state.go('landing');
  }

  //----------------------------------------------------------------------------------
  // Function to make an API request for neighborhoods
  var requestNeighborhoods = function() {
    ServerApi.submit(main.searchInfo)
    .then(function(data) {
      main.serverResponse = data;
      main.neighborhoods = Object.keys(data).map(function(key) {
        return data[key];
      });

      main.attractionObj = Details.createPlacesObj(main.neighborhoods, Details.attractionDict);
      main.serviceObj = Details.createPlacesObj(main.neighborhoods, Details.serviceDict);
      main.getBuyPrice(main.neighborhoods);
      main.neighborhoodArray = main.orderByArray(main.neighborhoods);
      main.filterNeighborhoods();

      main.markNeighborhoods();
    });
  };

  //----------------------------------------------------------------------------------
  // Function to filter neighborhoods by user's filter options
  main.filterNeighborhoods = function() {
    main.filteredNeighborhoodArray = main.neighborhoodArray.filter(function(obj) {
      return !(main.searchInfo.maxRent < obj.estimateLow) &&
      !(main.searchInfo.commuteTime < obj.commuteTime) &&
      !(main.searchInfo.commuteDistance < obj.commuteDistance);
    });
    // console.log('main.filteredNeighborhoodArray',main.filteredNeighborhoodArray);
  };

  //----------------------------------------------------------------------------------
  // Function to filter neighborhoods by user's filter options
  main.markNeighborhoods = function() {
    for (var i = 0; i < main.neighborhoodArray.length; i++) {
      main.dropNeighborhoodMarker(main.neighborhoodArray[i].coordinates, main.neighborhoodArray[i].name, main.neighborhoodArray[i]);
    }
  };

  //----------------------------------------------------------------------------------
  //Drop a marker with a link to be clicked
  main.dropNeighborhoodMarker = function (coordinates, title, neighborhoodObj) {
    var icon = {
      url: "assets/images/housepurplewhite.png",
      size: new google.maps.Size(5.3*8, 13*8),
      origin: new google.maps.Point(0, 0),
      anchor: new google.maps.Point(20, 30),
      scaledSize: new google.maps.Size(5.3*4, 13*4)
    };

    var marker = Map.dropMarker(coordinates, title, title, icon, 'neighborhood');


    marker.addListener('click', function() {
      if(neighborhoodObj.name === main.currentNeighborhood.name) { return; }

      main.selectNeighborhood(neighborhoodObj)
      console.log('neighborhoodObj:',neighborhoodObj);
      console.log('main.currneigh:',main.currentNeighborhood);
    });
    return marker;
  };



  //----------------------------------------------------------------------------------
  //Function to move the page

  main.goToAnchor = function(anchorId) {
    // set the location.hash to the id of
    // the element you wish to scroll to.
    $location.hash(anchorId);

    // call $anchorScroll()
    $anchorScroll();
  };

  //----------------------------------------------------------------------------------
  // Helper functions - GOOGLE MAPS

  //----------------------------------------------------------------------------------
  //Function to initialize and draw the map, centering on the the center of the U.S.
  main.initMap = function() {
    console.log("main.initMap")
    var centerUS = {
      latitude: 38.5,
      longitude: -96
    };
    //test coordinates
    Map.initialize(centerUS);
  };

  //----------------------------------------------------------------------------------
  //Function to add a marker on the map
  main.addMarker = function (coordinates, title) {
    title = 'Test marker' || title;
    Map.dropMarker(coordinates, title);
  };

  //----------------------------------------------------------------------------------
  //Function to test new methods defined in mapService
  //remove
  main.testMap = function() {
    console.log('mainCtrl.js says: testMap called');  //make the submit button work
    // Map.panAndFocus(main.coordinates);
    // Map.dropMarker(main.coordinates);
  };

  //----------------------------------------------------------------------------------
  //Function to map neighborhood data
  main.mapCurrentNeighborhood = function (neighborhood) {
    Details.currentNeighborhood = neighborhood;
    Details.currentNeighborhood.services = main.serviceObj[neighborhood.name];
    Details.currentNeighborhood.attractions = main.attractionObj[neighborhood.name];

    for (var place in Details.currentNeighborhood.places){
      if (place === "grocery_or_supermarket") {
        Details.currentNeighborhood.places[place] = ["grocery", Details.currentNeighborhood.places[place]]
      } else {
        Details.currentNeighborhood.places[place] = [place.replace("_", " "), Details.currentNeighborhood.places[place]]
      }
    }
  }

  //----------------------------------------------------------------------------------
  //Function to drop a circle + marker on a selected neighborhood
  main.selectNeighborhood = function (neighborhood) {
    // console.log('mainCtrl.js says: selected Neighborhood: ', neighborhood);
    main.populatePictures(neighborhood);
    main.mapCurrentNeighborhood(neighborhood);
    main.priceRange = neighborhood.priceString;
    main.currentNeighborhood = neighborhood;

    // console.log('select neigh bor hood current',  main.currentNeighborhood)

    //remove
    // console.log('selectNeighborhood says: main.serverResponse:',main.serverResponse);
    // console.log('selectNeighborhood', Details.currentNeighborhood);

    $state.go('main.results');
    setTimeout(function() {


      $state.go('main.details');

      Charts.barChartData(neighborhood);
      Charts.pieChartData(neighborhood);
      Map.panAndFocus(neighborhood.coordinates, 13);
      Map.drawCircle(neighborhood.coordinates, 2000);
    }, 200)
  };

  //----------------------------------------------------------------------------------
  // instagram map
  main.populatePictures = function(hood){
    main.picturesArr = [];
    hood.instagram.forEach(function (obj) {
      main.picturesArr.push([obj.images.low_resolution.url, obj.user.full_name]);
    });
    // console.log('detailsController says: picturesArr:', main.picturesArr);
  }

  //remove


  //----------------------------------------------------------------------------------
  // Initialization functions
  setTimeout(main.autoCompleteInit, 200);

  main.randomImage = function(){
    // removed this line so the image is no longer random: return { 'background-image': 'url("' + main.imageArray[Math.floor(Math.random() * main.imageArray.length)] + '")' };
    return { 'background-image': 'url("' + main.imageArray[1] + '")' };
  };

}]);











