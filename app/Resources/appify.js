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
var appRevision = Ti.App.Properties.getString('carma.revision');
var installedRevision = Ti.App.Properties.getString('installed.revision');
if (appRevision!==installedRevision){
	//need to extract bundled native resources for new and updated apps
	var existing = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, path_name);
	if (existing.exists()) {
		//delete the previous existing extracted resources
		existing.deleteDirectory(true);
	}
	//create the target directory
	Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, path_name).createDirectory();
	Compression.unzip(Ti.Filesystem.applicationDataDirectory + "/" + path_name, Ti.Filesystem.resourcesDirectory + "/" + path_name + '.zip',true);
	//update the installed revision
	Ti.App.Properties.setString('installed.revision',appRevision);	
	
	//before we start we need to clear any pending update tasks against the previous revison.
	var updateReady = Ti.App.Properties.getBool('updateReady');
	if (updateReady){
	    Ti.App.Properties.setBool('updateReady', false);
		Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,'standby').deleteDirectory(true);
	}

	//finally we need to set the bundleVersion of the newly installed manifest.
	var installedManifestFile = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory + '/carma-splinter/manifest.mf');
	Ti.App.Properties.setString('bundleVersion', installedManifestFile.read().text.split(/\r\n|\r|\n/g)[0].split(':')[1]);
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