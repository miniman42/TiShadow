/*
 * This is a template used when "carmifying" a titanium project.
 * See the README.
 */

Titanium.App.idleTimerDisabled = true;

var management = require('/api/Management'),
	utils = require('/api/Utils');

//indicates that the app is running in tishadow mode
var shadowMode = true;

//fix for Android intents
if (Ti.Platform.osname === "android") {
	Ti.App.INTENT_DATA = Ti.Android.currentActivity.intent.data;
}

var registerForPushNotification = function(){


Ti.Network.registerForPushNotifications({
			types: [
				Ti.Network.NOTIFICATION_TYPE_BADGE,
				Ti.Network.NOTIFICATION_TYPE_ALERT,
				Ti.Network.NOTIFICATION_TYPE_SOUND
			],
			success: function(e) {
				Ti.App.fireEvent("carma:shell.push.token", {state: "success", token: e.deviceToken});
			},
			error: function(e) {
				Ti.App.fireEvent("carma:shell.push.token", {state: "error", error: e.error});
			},
			callback: function(e) {
				Ti.App.fireEvent("carma:shell.push.token", {state: "callback", callback: e});
			}
		});

};


// Need to unpack the bundle on a first load;
var path_name = "{{app_name}}".replace(/ /g,"_");
var devMode=("{{type}}" === "dev" ? true : false);


//set up a listen for the token registration 
Ti.App.addEventListener("carma:shell.register.token", function(){
	registerForPushNotification();
});






//handle the setting up of resources for new/updated apps
//must be called in all modes
//alert('Path name is ' + path_name);
management.initialise(path_name);
management.start({dev: devMode, proto: "{{proto}}",host : "{{host}}",port : "{{port}}",room : "{{room}}"});
