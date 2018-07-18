// found at https://steinbrennergit.github.io/welp-project/
// repo at https://github.com/steinbrennergit/welp-project/

/* USER STORY

Process (what happens when a user Submits)
    - Get input of a dollar amount from field (input validation required)
    - Get input of a city name from field
    - Maybe get input of a maximum distance from a third field?
        * Other options; cuisine choices, etc. (can circle back to these features if we get everything 100%)
    - Pass input to Zomato API and retrieve eligible restaurants
        *** Restaurant requires API key and restaurant ID
        * Inform the user that the city they named is invalid if we get no restaurants/an API error
    - Using the "average cost for two" property from the data returned by Zomato,
        * Filter out restaurants which cost too much
    - Using Bing Maps API, populate a map with pushpins for each of the restaurant locations, sorted by distance
        * How are we calculating that distance if the user is just giving us a city?
        * Potentially - get city AND zip code or address as input, get restaurants from the whole city from Zomato, filter 
            to a particular distance from the user's address or zip code?
    - Populate a scrollable list of these restaurants with their locations and distance (?)
    - Display the map adjacent to the input form


### As written, this process does not require Firebase. We might remove Firebase from the implementation.
### OR, if we get done with the core functionality with time to spare:
    - Using a modal, prompt the user if they want to enter a username to retain their searches
    - If the username/email they enter matches a previous entry in the database, give them their last X searches
        they can pre-select and get those same results back.
    - Store search parameters under that username for them to return to later
*/

/***********PRODUCTION CODE***************/
// Database init and reference
firebase.initializeApp(fbConfig);
const db = firebase.database();

// Constant HTML references
const $money = $("#money");
const $city = $("#city-location");
const $zip = $("#zip-location");

// Global vars
var numOfRecentSearches = 0;
var isSignedIn = false;
var userEmail = "";
var dir = "/"; // Contain user's unique directory within the database
var map;

var userLocation = null; // IF GEOLOCATED: BING LOCATION OBJECT
var restaurantList = [];

/**** FOR GEOLOCATION ****/
/*
function getLocation() {
    navigator.geolocation.getCurrentPosition(function (pos) {
        console.log("enter navigator")

        userLocation = new Microsoft.Maps.Location(pos.coords.latitude, pos.coords.longitude);
        console.log("navigator line 1");

        let userPin = new Microsoft.Maps.Pushpin(userLocation);
        console.log("navigator line 2");

        map.entities.push(userPin);
        console.log("navigator line 3");

        map.setView({ center: userLocation, zoom: 11.5 });
        console.log("navigator done");

    });
}
*/
/**** END GEOLOCATION ****/

// Using user input, get restaurant information from the Zomato API, store in array
function getRestaurants(money, city, zip, toPush) {
    // let maxDist = 20; // NOT CURRENTLY IN USE

    // First query URL to query Zomato for the city provided by user input
    var firstQueryURL = "https://developers.zomato.com/api/v2.1/cities?q=" + city + "&apikey=284d8bf6da6b7fc3efc07100c1246454"

    // AJAX call to Zomato for city information
    $.ajax({
        url: firstQueryURL,
        method: 'GET'
    }).then(function (res) {
        // res should contain an object, representing the city, with a unique identifier

        var id = res.location_suggestions["0"].id; // assign the city identifier to variable id

        // If the city is not found, notify the user that their search failed
        if (id === undefined) {
            console.log("City not found; return (notify user)");
            return;
        }

        // If the user is signed in and this function was called with TRUE in toPush, 
        //  push this search to the database to be retrieved later.
        if (isSignedIn && toPush) {
            db.ref(dir).push({ money, city, zip, userEmail });
        }

        // Build the nested query URL to search for restaurants within the city
        var secondQueryURL = "https://developers.zomato.com/api/v2.1/search?apikey=284d8bf6da6b7fc3efc07100c1246454&entity_type=city&sort=cost&order=asc&entity_id=" + id // Add parameters to this URL

        // AJAX call to Zomato for restaurant information within city
        $.ajax({
            url: secondQueryURL,
            method: 'GET'
        }).then(function (res) {
            // Res should contain an object containing up to 20 restaurant objects, sorted by cost
            // If we want more than 20, we would call again with an offset - this would be difficult and highly inefficient
            // To broaden our search would require paying for the API key

            // Create a placeholder array for restaurants filtered by cost
            let filteredRestaurants = []

            // Iterating through restaurant objects (LOOP), push all restaurant objects where the (average cost for two / 2) < money
            for (let i = 0; i < 20; i++) {
                // Restaurants are not contained in an array, but are indexed - if we run out of them before 20, break out of loop
                if (res.restaurants[i] === undefined) {
                    break;
                }

                // For ease of typing, name the important object path
                let restaurant = res.restaurants[i].restaurant;

                // Calculate cost for one, make the comparison described above
                let costForOne = restaurant.average_cost_for_two / 2;
                if (costForOne <= money && costForOne !== 0) {
                    filteredRestaurants.push(restaurant); // Push to array if cost is acceptable
                }
            }

            // Assign the result to the global variable restaurantList
            restaurantList = filteredRestaurants;

            // Call the fns to display this information
            generateMap();
            generateList();

            // Hide the search window
            $("#first-window").addClass("hide");
        });
    });
}

// Using our array of restaurant objects, build the map with the Bing Maps API
function generateMap() {

    // Create a new Bing Maps map and assign it to global variable
    map = new Microsoft.Maps.Map("#map-div", { showLocateMeButton: false });

    // Declare variable centerLoc outside the scope of the for loop (may not be necessary)
    var centerLoc;

    // For each restaurant object (LOOP)
    for (let i = 0; i < restaurantList.length; i++) {

        // For ease of typing, name the important object path
        var restaurant = restaurantList[i];

        // Get lat and long coords from restaurant object
        var latitude = restaurant.location.latitude;
        var longitude = restaurant.location.longitude;

        // Create a new Bing Maps location object with restaurant coords
        var loc = new Microsoft.Maps.Location(latitude, longitude);

        // Create a new Bing Maps pushpin at that location
        var pin = new Microsoft.Maps.Pushpin(loc);

        // Create the text box associated with the push pin
        var infobox = new Microsoft.Maps.Infobox(loc, {
            visible: false, autoAlignment: true
        });

        // Associate the infobox with the map
        infobox.setMap(map);

        // Dynamically set pin metadata to be retrieved later for infobox display
        pin.metadata = {
            title: restaurant.name,
            description: restaurant.location.address,
            rating: restaurant.user_rating.aggregate_rating // not a property of metadata
        };

        // On click/tap, show the info box
        Microsoft.Maps.Events.addHandler(pin, 'click', function (args) {
            // For ease of typing, name the important object path
            let tar = args.target;

            // Get the location of the pushpin to which this infobox is associated
            let pinLoc = new Microsoft.Maps.Location(tar.geometry.y, tar.geometry.x);

            // Attach the infobox to the pushpin's location and display relevant info
            infobox.setOptions({
                location: pinLoc,
                title: tar.metadata.title,
                description: tar.metadata.description,
                rating: tar.metadata.rating, // need to attach rating to description
                visible: true
            });
        });

        // On mouse hover, show the info box
        Microsoft.Maps.Events.addHandler(pin, 'mouseover', function (args) {
            // For ease of typing, name the important object path
            let tar = args.target;

            // Get the location of the pushpin to which this infobox is associated
            let pinLoc = new Microsoft.Maps.Location(tar.geometry.y, tar.geometry.x);

            // Attach the infobox to the pushpin's location and display relevant info
            infobox.setOptions({
                location: pinLoc,
                title: tar.metadata.title,
                description: tar.metadata.description,
                rating: tar.metadata.rating, // need to attach rating to description
                visible: true
            });
        });

        // When mouse leaves the pushpin, hide the info box
        Microsoft.Maps.Events.addHandler(pin, 'mouseout', function () {
            infobox.setOptions({
                visible: false
            });
        });

        // Push each pin to the map
        map.entities.push(pin);

        // Set the center location to that of the first restaurant
        if (i === 0) {
            centerLoc = new Microsoft.Maps.Location(latitude, longitude);
        }
    };

    // Set the map to center on the first restaurant, with appropriate zoom
    map.setView({
        mapTypeId: Microsoft.Maps.MapTypeId.road,
        center: centerLoc,
        zoom: 11.5
    });

    // Show the map
    $("#map-div").removeClass("hide");
}

// Using our array of restaurant objects, generate a list of restaurants to display
function generateList() {
    if (restaurantList.length === 0) { // Check for an empty list of restaurants
        console.log("empty list") // Somehow, notify user that there are no results
        return;
    }

    // For each restaurant object (LOOP)
    for (let i = 0; i < restaurantList.length; i++) {

        //create a new anchor tag append the restaurant list
        var newAnchor = $("<a>").attr("class", "flex-column align-items-start");
        newAnchor.attr("href", "#")

        //Create new div to add the data into
        var newDiv = $("<div>").attr("class", "d-flex w-100 justify-content-between")

        //Adds the restaurnaunt name in the drop down
        var newName = $("<h5>").addClass("mb-1", "mb-name")
        newName.text(restaurantList[i].name).css('text-align', 'left').css("padding-right", '20px')

        //Adds the address into the same dropdown box
        var newAddress = $("<p>").addClass("mb-1", "mb-address")
        newAddress.text(restaurantList[i].location.address).css('text-align', 'right').css("padding-left", '20px')

        // Appends the name and address to the new div
        newDiv.append(newName, newAddress);

        // Appends the new div to the new anchor tag
        newAnchor.append(newDiv).css("background-color", 'darkgrey').css("border", '1px solid black')

        // Appends the anchor tag to the column group to display results
        $("#column-group").append(newAnchor)

    }
    $("#column-group").removeClass("hide")
    // Remove hide from new search button
}

// Called when the user submits their search query
$("#submit-button").on("click", function () {
    event.preventDefault() // Prevents page from reloading on submit

    // Get input from input fields
    let money = parseInt($money.val().trim());

    // Make the city input presentable regardless of user's choice of capitalization
    let tempCity = $city.val().trim();
    let city = tempCity.charAt(0).toUpperCase() + tempCity.slice(1).toLowerCase();
    // Does not capitalize every word, if the city has multiple words; consider improving

    let zip = $zip.val().trim();

    /**** FOR GEOLOCATION ****/
    // map = new Microsoft.Maps.Map("#map-div", { showLocateMeButton: false });
    // var located = getLocation();
    /**** END GEOLOCATION ****/

    // Pass inputs to getRestaurants() where the Zomato API is queried for information
    getRestaurants(money, city, zip, true);
});

// Called when the user attempts to log in
$("#login").on("click", function () {
    event.preventDefault();

    // console.log(isSignedIn);

    // If user is signed in, sign them out (this button can serve both functions)
    if (isSignedIn) {
        firebase.auth().signOut().then(function () {
            window.location.reload(true);
        }).catch(function (error) { console.log(error) });
    } // This is deprecated; current implementation hides the log in button when signed in
    // And hides the log out button when signed out

    // Get email and password from input fields
    let em = $("#email").val().trim();
    let pw = $("#password").val().trim();

    // Attempt to sign the user in
    firebase.auth().signInWithEmailAndPassword(em, pw).then(function () {
        window.location.reload(true);
    }).catch(function (error) {
        // If the user does not exist, sign them up (which will sign them in)
        if (error.code === "auth/user-not-found") {
            firebase.auth().createUserWithEmailAndPassword(em, pw).then(function () {
                window.location.reload(true);
            }).catch(function (error) { console.log(error); });
        }
        // Different catch needed for wrong password, to notify user
    });
});

// Called when the user attempts to log out
$("#logout").on("click", function () {

    // Do nothing if not logged in 
    if (!isSignedIn) {
        return;
    } // This is deprecated; current implementation hides the log in button when signed in
    // And hides the log out button when signed out

    // Log the user out of their account
    firebase.auth().signOut().then(function () {
        window.location.reload(true);
    }).catch(function (error) { console.log(error) });
})

// Called when the user requests a new search
// Reload the page (allow caching for speed) to present the user with a fresh search form
$("#new-search").on("click", function () {
    window.location.reload(false);
    // This could be accomplished by using JQuery to manipulate the HTML and "start over"
    // However, that is likely to be even less efficient? and a pain to implement
});

// Called when the user logs in, logs out, or opens the page
firebase.auth().onAuthStateChanged(function (user) {

    // If user is signed in
    if (user) {
        // console.log("signed in");

        // Hide the log in button, and show the log out button
        $("#login-modal-button").addClass("hide");
        $("#logout").removeClass("hide");

        // Save a boolean value to indicate the user is signed in
        isSignedIn = true;
        // Save the user's email to use for signing the data sent to database (debugging tool)
        userEmail = user.email;

        // Change the displayed name from "Guest User" to the user's email
        $("#navbarDropdownMenuLink").text(userEmail);

        // Change the database directory to the user's unique identifier
        dir += user.uid;

        // Called when the user performs a search and the data is pushed to database
        db.ref(dir).on("child_added", function (snap) {
            // console.log(dir);
            // console.log(snap.val());

            // Limit the list to 10 recent searches
            if (numOfRecentSearches >= 10) {
                return;
            }

            // Get input values from the database entry
            let c = snap.val().city;
            let z = snap.val().zip;
            let m = snap.val().money;

            // Create the HTML elements necessary to append to a list of options
            let $past = $("#past-searches");
            let newP = $("<p>").addClass("search");
            let text = c + ", " + z + ", $" + m;
            newP.attr("data-city", c);
            newP.attr("data-zip", z);
            newP.attr("data-money", m);
            newP.text(text);
            $past.append(newP);

            // Increment recent searches to ensure they are limited to 10
            numOfRecentSearches++;
            // console.log('numSearches: ' + numOfRecentSearches);
        });
    } else { // If the user signed OUT, hide the log out button, show the sign in button
        $("#login-modal-button").removeClass("hide");
        $("#logout").addClass("hide");
    }
});

// Called when a user clicks on a recent search to replicate
$(document).on("click", ".search", function () {
    // console.log(this);

    // Get input data from the HTML element
    let c = $(this).attr("data-city");
    let z = $(this).attr("data-zip");
    let m = $(this).attr("data-money");

    // Hide the modal
    $("#exampleModalCenter").modal("hide");

    // Call getRestaurants() with the search data; pass "false" so this is not pushed to database again
    getRestaurants(m, c, z, false);
});