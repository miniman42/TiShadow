/*
 * This is a template used when TiShadow "appifying" a titanium project.
 * See the README.
 */

Titanium.App.idleTimerDisabled = true;

var TiShadow = require("/api/TiShadow"),
    management = require('/api/Management'),
	utils = require('/api/Utils');


// Need to unpack the bundle on a first load;
var path_name = "{{app_name}}".replace(/ /g,"_");
var devMode=("{{type}}" === "dev" ? true : false);

//handle the setting up of resources for new/updated apps
//must be called in all modes
management.initialise(path_name);

if (devMode===true){
	//Call home
	TiShadow.connect({
	  proto: "{{proto}}",
	  host : "{{host}}",
	  port : "{{port}}",
	  room : "{{room}}",
	  name : Ti.Platform.osname + ", " + Ti.Platform.version + ", " + Ti.Platform.address
	});
	console.log("Running in dev mode...");
} else {
	console.log("Running in production mode...");
	management.start();
}

TiShadow.launchApp(path_name);
