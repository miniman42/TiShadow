/*
 * This is a template used when TiShadow "appifying" a titanium project.
 * See the README.
 */

Titanium.App.idleTimerDisabled = true;

var TiShadow = require("/api/TiShadow"),
	Compression = require('ti.compression'),
	log = require('/api/Log'), 
    management = require('/api/Management'),
	utils = require('/api/Utils');


// Need to unpack the bundle on a first load;
var path_name = "{{app_name}}".replace(/ /g,"_");
var target = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, path_name);
if (!target.exists()) {
  target.createDirectory();
  Compression.unzip(Ti.Filesystem.applicationDataDirectory + "/" + path_name, Ti.Filesystem.resourcesDirectory + "/" + path_name + '.zip',true);
}

var devMode=("{{type}}" === "dev" ? true : false);


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

//Launch the app
TiShadow.launchApp(path_name);