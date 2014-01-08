/*
 * This is a template used when "carmifying" a titanium project.
 * See the README.
 */

Titanium.App.idleTimerDisabled = true;

var management = require('/api/Management'),
	utils = require('/api/Utils');


// Need to unpack the bundle on a first load;
var path_name = "{{app_name}}".replace(/ /g,"_");
var devMode=("{{type}}" === "dev" ? true : false);

//handle the setting up of resources for new/updated apps
//must be called in all modes
//alert('Path name is ' + path_name);
management.initialise(path_name);
management.start({dev: devMode, proto: "{{proto}}",host : "{{host}}",port : "{{port}}",room : "{{room}}"});
