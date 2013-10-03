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
  /*
    setInterval(function(){
  		console.log("Downloading Update from CDN...");
  		var updateUrl="http://developer.avego.com/libs/splinter/carma-splinter.zip";
  		loadRemoteZip("carma-splinter",updateUrl);
  	},10000);
  */
}

function loadRemoteZip(name, url) {
  var xhr = Ti.Network.createHTTPClient();
  xhr.setTimeout(10000);
  xhr.onload=function(e) {
    try {
      log.info("Unpacking new production bundle: " + name);

      var path_name = name.replace(/ /g,"_");
      // SAVE ZIP
      var zip_file = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, path_name + '.zip');
      zip_file.write(this.responseData);
      // Prepare path
      var target = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, path_name);
      if (!target.exists()) {
        target.createDirectory();
      }
      // Extract
      var dataDir=Ti.Filesystem.applicationDataDirectory + "/";
      Compression.unzip(dataDir + path_name, dataDir + path_name + '.zip',true);

  
	  console.log("Launching...");
      // Launch
      TiShadow.launchApp(path_name);
    } catch (e) {
      log.error(utils.extractExceptionData(e));
    }
  };
  xhr.onerror = function(e){
    Ti.UI.createAlertDialog({title:'XHR', message:'Error: ' + e.error}).show();
  };
  xhr.open('GET', url);
  xhr.send();
};


//Launch the app
TiShadow.launchApp(path_name);