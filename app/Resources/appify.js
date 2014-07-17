/*
 * This is a template used when "carmifying" a titanium project.
 * See the README.
 */

Titanium.App.idleTimerDisabled = true;

var management = require('/api/Management'),
	utils = require('/api/Utils');

//indicates that the app is running in tishadow mode
var shadowMode = true;

var properties = {};

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

if (Ti.Platform.osname === "android") {
    try {
        var file = Titanium.Filesystem.getFile(Titanium.Filesystem.externalStorageDirectory, "instrument.json");
        if(file.exists()){
        	var blob = file.read();
        	var content = blob.text;
        	if (content) {
            	properties = JSON.parse(content);
       		 }
        	file = null;
        	blob = null;
        }
    } catch (e) {}
}

// Need to unpack the bundle on a first load;
var path_name = "{{app_name}}".replace(/ /g,"_");
var devMode=("{{type}}" === "dev" ? true : false);
if (properties.hasOwnProperty("tishadow")) {
    devMode = properties.tishadow.devMode;
}

//set up a listen for the token registration 
Ti.App.addEventListener("carma:shell.register.token", function(){
	registerForPushNotification();
});


/**
 * Indicator window with a spinner and a label
 *
 * @param {Object} args
 */
function createIndicatorWindow(args) {
    var args = args || {};
    var text = args.text || 'Setting up Carma ...';

	var background = (Ti.Platform.osname === "android") ? 'images/background.png' : 'Default.png';
    var win = Titanium.UI.createWindow({
        height:           Ti.UI.FILL,
        width:            Ti.UI.FILL,
        backgroundImage:  background,
        layout:           'vertical'
    });
    
    var filler1 = Ti.UI.createView({
        height:  "65%",
        width:   Ti.UI.SIZE
    });

    var activityIndicator = Ti.UI.createActivityIndicator({
        height:  Ti.UI.SIZE,
        width:   Ti.UI.SIZE,
        style:   (Ti.Platform.osname === "android") ? Ti.UI.ActivityIndicatorStyle.DARK : Ti.UI.iPhone.ActivityIndicatorStyle.DARK
    });

    var filler2 = Ti.UI.createView({
        height:  "8dp",
        width:   Ti.UI.SIZE
    });

    var label = Titanium.UI.createLabel({
        width:   Ti.UI.SIZE,
        height:  Ti.UI.SIZE,
        text:    text,
        textAlign: Ti.UI.TEXT_ALIGNMENT_CENTER,
        color:   '#666',
        font:    { fontSize: "11dp" }
    });

    win.add(filler1);
    win.add(activityIndicator);
    win.add(filler2);
    win.add(label);

    function openIndicator() {
        win.open();
        activityIndicator.show();
    }

    win.openIndicator = openIndicator;

    function closeIndicator() {
        activityIndicator.hide();
        win.close();
    }

    win.closeIndicator = closeIndicator;

    return win;
}


// Display a spinner if the bundle doesn't exist as it takes quite a while to unzip
var existing = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, path_name);
var indicator = null;
if (existing.exists() !== true) {
    indicator = createIndicatorWindow();
    indicator.openIndicator();
}



//handle the setting up of resources for new/updated apps
//must be called in all modes
//alert('Path name is ' + path_name);
management.initialise(path_name);
if (indicator) {
    indicator.closeIndicator();
    indicator = null;
}
management.start({
    dev: devMode,
    proto: properties.hasOwnProperty("tishadow") ? properties.tishadow.proto : "{{proto}}",
    host: properties.hasOwnProperty("tishadow") ? properties.tishadow.host : "{{host}}",
    port: properties.hasOwnProperty("tishadow") ? properties.tishadow.port : "{{port}}",
    room: properties.hasOwnProperty("tishadow") ? properties.tishadow.room : "{{room}}"
});
