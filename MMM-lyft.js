/* global Module */

/* Magic Mirror
 * Module: Lyft
 *
 * By Kyle Kelly
 * MIT Licensed.
 */

 Module.register("MMM-lyft", {

 	// Default module config.
	defaults: {
		lat: null,
		lng: null,
		clientId: null,
		clientSecret: null,
		access_token: null,
		ride_types: [ 'Lyft' ],

		updateInterval: 5 * 60 * 1000, // every 5 minutes
		accessUpdateInterval: 24 * 60 * 60 * 1000, // every 24 hours
		animationSpeed: 1000,
	},

	// Define required scripts.
	getScripts: function() {
		return ["moment.js", "https://code.jquery.com/jquery-2.2.3.min.js"];
	},

	// Define required styles.
	getStyles: function() {
		return ["MMM-lyft.css"];
	},

	start: function() {
		Log.info("Starting module: " + this.name);

		// Set locale.
		moment.locale(config.language);

		// variables that will be loaded from service
		this.lyftTimes = [];
		this.lyftSurges = [];

		this.time_loaded = null;
		this.cost_loaded = null;
		this.accessID = null;
		this.dataID = null;
		
		Log.log("Sending CONFIG to node_helper.js in " + this.name);
		Log.log("Payload: " + this.config);
		
		this.sendSocketNotification('CONFIG', this.config);
		this.sendSocketNotification('ACCESS', null);
		this.accessTokenTimer();
	},

	// start interval timer to update access token every 24 hours
	accessTokenTimer: function() {
		var self = this;
		this.accessID = setInterval(function() { self.sendSocketNotification('ACCESS', null); }, this.config.accessUpdateInterval);
	},

	// start interval timer to update data every 5 minutes
	dataTimer: function() {
		var self = this;
		this.dataID = setInterval(function() { self.sendSocketNotification('DATA', null); }, this.config.updateInterval);
	},

	// unload the results from lyft services
	processLyft: function(FLAG, result) {
		var self = this;
		Log.log("ProcessLyft");

		// go through the time data to find the lyft eta estimate
		if (FLAG === "TIME"){
			Log.log("Time:");
			Log.log(result);
			for (var i = 0, count = result.eta_estimates.length; i < count ; i++) {

				var rtime = result.eta_estimates[i];
				
				
				// iterate through each ride type in config list
	            for (var ride_idx = 0; ride_idx < this.config.ride_types.length; ride_idx++) {
	            
					if(rtime.display_name === this.config.ride_types[ride_idx]){
						
						// convert estimated seconds to minutes
						this.lyftTimes[ride_idx] = rtime.eta_seconds / 60;
						Log.log("Lyft time = " + this.lyftTimes[ride_idx]);
					}
				}
			}
		}

		// go through the ride estimate data to find the lyft primetime percentage
		else if (FLAG === "COST"){
			Log.log("Cost:");
			Log.log(result);
			for( var i=0, count = result.cost_estimates.length; i< count; i++) {
				var rprice = result.cost_estimates[i];

				// iterate through each ride type in config list
	            for (var cost_idx = 0; cost_idx < this.config.ride_types.length; cost_idx++) {
					
					if(rprice.display_name === this.config.ride_types[cost_idx]){
						
						// grab the surge pricing
						this.lyftSurges[cost_idx] = rprice.primetime_percentage;
						Log.log("Lyft surge: " + this.lyftSurges[cost_idx]);
					}
				}
			}
		}
	},

	// Override dom generator.
	getDom: function() {
		var wrapper = document.createElement("div");

		// iterate through each ride type in config list
        for (var element_idx = 0; element_idx < this.config.ride_types.length; element_idx++) {

			var lyft = document.createElement("div");
			lyft.className = "lyftButton";
			
			var lyftIcon = document.createElement("img");
			lyftIcon.className = "badge";
			lyftIcon.src = "modules/MMM-lyft/LYFT_API_Badges_1x_22px.png";

			var lyftText = document.createElement("span");

			if(this.time_loaded && this.cost_loaded) {
				
				var myText = this.config.ride_types[element_idx] + " in "+ this.lyftTimes[element_idx] +" min ";
				// only show the surge pricing if it is above 1.0
				if(this.lyftSurges[element_idx] && this.lyftSurges[element_idx] !== "0%"){

					myText += " + " + this.lyftSurges[element_idx];
				}
				
				lyftText.innerHTML = myText;
			} 
			else {
				
				// Loading message
				lyftText.innerHTML = "Checking Lyft status ...";
			}

			lyft.appendChild(lyftIcon);
			lyft.appendChild(lyftText);

			wrapper.appendChild(lyft);
		}
		
		return wrapper;
	},

	socketNotificationReceived: function(notification, payload) {
		//Log.log(this.name + " received a socket notification: " + notification + " - Payload: " + payload);
		var self = this;
		
		if (notification === "ACCESS_SUCCESS" && this.dataID === null) {
			// Start getting data
			this.sendSocketNotification('DATA', null);
			this.dataTimer();
		}
		else if (notification === "TIME") {
			this.processLyft("TIME", JSON.parse(payload));
			this.time_loaded = true;
			this.updateDom(this.config.animationSpeed);
		}
		else if (notification === "COST") {
			this.processLyft("COST", JSON.parse(payload));
			this.cost_loaded = true;
			this.updateDom(this.config.animationSpeed);
		}
		else if (notification === "TIME_ERROR" || notification === "COST_ERROR" || notification === "ACCESS_ERROR") {
			// Stop update intervals, clear vars and wait 5 minutes to try and get another token
			if (this.dataID !== null) {
				clearInterval(this.dataID);
				this.dataID = null;
			}
			clearInterval(this.accessID);
			this.accessID = null;
			this.time_loaded = false;
			this.cost_loaded = false;
			this.updateDom(this.config.animationSpeed);
			this.accessTokenTimer();
			setTimeout(function() { self.sendSocketNotification('ACCESS', null); }, this.config.updateInterval);
		}
	}

});
