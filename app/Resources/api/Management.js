
var TiShadow = require("/api/TiShadow"),
    Compression = require('ti.compression'),
    log = require('/api/Log'), 
    utils = require('/api/Utils'), 
    manifestHandler = require('/api/ManifestHandler');

var BUNDLE_TIMESTAMP = "currentBundleTimestamp", 
    MIN_APP_REVISION = "minAppRevision", 
    MAX_APP_REVISION = "maxAppRevision",
    STANDBY_DIR = 'standby',
    DOWNLOAD_DIR = 'update',
    MANIFEST_FILE = 'manifest.mf',
    APP_NAME;

//need to make sure app update events do not overlap as its possible to trigger these multiple times.   
var _updateQueue = [],
	isProcessingUpdateQueue=false, 
	updateWindow = null, 
	backgroundWindow  = null,
	activityIndicator = null, 
	activityCallback = null;
// interval Ids to be cleared when updates are to be applied.
var intervalIds = [];


var createUpdateWindow = function(){
	
	backgroundWindow = Ti.UI.createWindow({
	  backgroundColor: 'black', 
	  //backgroundImage = 'images/background.jpg',
	  opacity: 0.3,
	});

	updateWindow = Ti.UI.createWindow({
		backgroundColor: 'transparent',
		opacity: 1.0
	  //backgroundImage = 'images/background.jpg',
	});
	backgroundWindow.setBackgroundImage('images/background.jpg');


	var style;
	if (Ti.Platform.name === 'iPhone OS'){
	  style = Titanium.UI.iPhone.ActivityIndicatorStyle.BIG;
	}
	else {
	  style = Ti.UI.ActivityIndicatorStyle.BIG;
	}

	activityIndicator = Ti.UI.createActivityIndicator({
	  color: 'white',
	  font: {fontSize:16},
	  message: 'Loading...',
	  style:style,
	  height:Ti.UI.SIZE,
	  width:Ti.UI.SIZE, 
	  navBarHidden: true, 
	  modal : false
	});

	updateWindow.add(activityIndicator);
	activityCallback = function(e){
		activityIndicator.show();
	};

	updateWindow.addEventListener('open', activityCallback);

	updateWindow.open();
	backgroundWindow.open();

};


var closeUpdateWindow = function(){
	updateWindow.removeEventListener('open', activityCallback);
    activityIndicator.hide();
	updateWindow.close();
	backgroundWindow.close();
	backgroundWindow = null;
	updateWindow = null;
};




//This function makes sure that the local filesystem is setup correctly to allow successful app launches and handling of native
//revision updates.  It must be called prior to launching the application with TIShadow or calling start on the module itself
exports.initialise = function(name){

	//record the name as this is also the path of the running app...
	APP_NAME=name;

	//get as built AppRevsion
	var appRevision = getAppRevision();
	
	//if this is a new or updated native revision
	var existing = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, APP_NAME);
	if ((appRevision!==getInstalledRevision())||(existing.exists()!==true)){
		//need to install the new revision
		installAppRevisionBundle();		
	}
};

//start the management process, waiting for production updates and applying them at appropriate times
exports.start = function(options){
	if (options.dev===true){
		//Note the connect Methods registered "bundle" handler has been updated to support the Carma update mechanism
		TiShadow.connect({
			proto: options.proto,
			host : options.host,
			port : options.port,
			room : options.room,
			name : Ti.Platform.osname + ", " + Ti.Platform.version + ", " + Ti.Platform.address,
			updateControl : true
		});
		Ti.App.addEventListener("carma:tishadow.update.ready",function(evt){
	        console.log('CARMIFY: Received DEV update event');
			pushUpdate(evt);
		});
		console.log("CARMIFY: Running in 'dev' mode...");
	} else {
		console.log("CARMIFY: Running in 'production' mode...");
	}
    
    //Feature toggles come in on Launch or resume of the internal app and when there is any change to them in the lifecycle of the app.
    Ti.App.addEventListener("carma:feature.toggles", function(evt){ 
        console.log('CARMIFY: Received feature toggles');
		pushUpdate(evt);
    });

	//Apply events come in when the app decides its ok to process the update and reload.
    Ti.App.addEventListener("carma:management.update.apply", function(){ 
        
		if (isUpdateReady() && (!isProcessingUpdateQueue)){
			createUpdateWindow();
			applyUpdate();	
        }
    });
    
	Ti.App.addEventListener("carma:management.store.interval", function(data) {
	    intervalIds.push(data.intervalId);
	    console.log("CARMIFY: Storing interval for later cancellation : "+data.intervalId);
    });

	Ti.App.addEventListener("carma:management.remove.interval", function(data) {
		//clearing the interval.
		clearInterval(data.intervalId);
	    intervalIds=_.without(intervalIds,data.intervalId);
	    console.log("CARMIFY: Removing stored interval reference : "+data.intervalId);
    });


	console.log('CARMIFY: Launching app...');
	TiShadow.launchApp(path_name);
};

//This adds an update event to the queue of pending update triggers and flushes it if not already processing them.
function pushUpdate(evt){
	_updateQueue.push(evt);
	if (!isProcessingUpdateQueue) {
		isProcessingUpdateQueue = true;
		flushUpdateQueue();
	}
}

//fired when an update is ready to be applied this will occur when an update has been prepared.  
//It can also fire on startup/resume if an update is still pending because toggles will be delivered then also.
function notifyUpdate(){
    console.log('CARMIFY: Notifying client (UX..) listeners that an update is ready');
	Ti.App.fireEvent("carma:management.update.ready", { data : { version : getUpdateVersion() }});
}

//This is fired after an updae has been successfully applied.
function notifyUpdated(){
	Ti.App.fireEvent("carma:management.update.complete", { data : { version : getBundleVersion() }});
}

function getAppRevision(){
	return Ti.App.Properties.getString('carma.revision');
};

function getInstalledRevision(){
	return Ti.App.Properties.getString('installed.revision');
};

function setInstalledRevision(revision){
	console.log('CARMIFY: Setting installed revision: '+revision);
	Ti.App.Properties.setString('installed.revision',revision);	
};

function isUpdateReady(){
	return Ti.App.Properties.getBool('updateReady');
};

function getUpdateVersion(){
	return Number(Ti.App.Properties.getString('updateVersion')); 
};

function setUpdateReady(ready,version){
	console.log('CARMIFY: set updateReady: '+ready);
	Ti.App.Properties.setBool('updateReady',ready);
	if (version) {
		Ti.App.Properties.setString('updateVersion',version);
	}
};

function getBundleVersion(){
	return Number(Ti.App.Properties.getString('bundleVersion')); 
};

function setBundleVersion(version){
	console.log('CARMIFY: Setting bundleVersion: '+version);
	Ti.App.Properties.setString('bundleVersion', version);
};

/** 
 * This function will: 
 * - read the bundle manifest in the provided dir if provided or the installed app if not and return its creation timestamp
 **/
function readBundleVersion(dirname){
	var path=(dirname)?dirname:APP_NAME;
	var installedManifestFile = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory + '/' +  path + '/' +MANIFEST_FILE);
	//grab first line of the manifest and parse the manifest version
	return Number(installedManifestFile.read().text.split(/\r\n|\r|\n/g)[0].split(':')[1]);
};

/** 
 * This function will: 
 * - read the bundle manifest in the provided dir if provided or the installed app if not and return if it should be forcefully applied
**/
function readBundleForceUpdate(dirname){
	var path=(dirname)?dirname:APP_NAME;
	var installedManifestFile = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory + '/' +  path + '/' +MANIFEST_FILE);
	//grab second line of the manifest and parse the ForceUpdate value
	return (installedManifestFile.read().text.split(/\r\n|\r|\n/g)[1].split(':')[1])==="true";
};


/** 
 * This function will: 
 * - install the App revisions bundled version, clearing pending updates
 * - this function must only be called before the module's start method has been invoked.
 **/
function installAppRevisionBundle(){
	console.log('CARMIFY: Installing app revision bundle');
	//clear any pending update tasks for the previous revison.
	clearPendingUpdate();
	
	//remove the previous app directory if present
	var existing = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, APP_NAME);
	if (existing.exists()) {
		//delete the previous existing extracted resources
		existing.deleteDirectory(true);
		console.log('CARMIFY: Deleted existing bundle');
	}

	//create the new app directory and unzip there
	var appdir=Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, APP_NAME);
	appdir.createDirectory();
	if(Titanium.Platform.osname !== 'android'){
		appdir.remoteBackup=false;
	}
	Compression.unzip(Ti.Filesystem.applicationDataDirectory + "/" + APP_NAME, Ti.Filesystem.resourcesDirectory + "/" + APP_NAME + '.zip',true);
	console.log('CARMIFY: Installed bundle');
	
	//update the installed revision and bundle
	setInstalledRevision(getAppRevision());	
	setBundleVersion(readBundleVersion());	
};

/** 
 * This function will: 
 * - clear any pending updates if present
 **/
function clearPendingUpdate(){
	console.log('CARMIFY: clearing pending update : '+isUpdateReady());
	if (isUpdateReady()){
    	setUpdateReady(false);
	}
	var standby=Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,STANDBY_DIR);
	if (standby.exists()){
		standby.deleteDirectory(true);
	}		
};

function flushUpdateQueue() {
	console.log("CARMIFY: Flushing update queue...");
	if (_updateQueue.length > 0) {
		// pull the lru event val off the queue
		var update=_updateQueue.shift();
		//callback will recur....
		processUpdate(update,flushUpdateQueue);
	} else {
		console.log("CARMIFY: Update queue empty");
		isProcessingUpdateQueue = false;
		if(isUpdateReady()){
			if (readBundleForceUpdate(STANDBY_DIR)){
				//force the update without notification if indicated in the manifest.
	     		createUpdateWindow();
				applyUpdate();
			} else {
				notifyUpdate();
			}					
		}
	}
};

function processUpdate(update,callback){
	console.log("CARMIFY: Processing queued update event");
	var localBundleVersion = getBundleVersion();  
	var latestBundleVersion;

	if (update.type === "carma:feature.toggles"){
		console.log("CARMIFY: Update triggered by feature toggles");
		latestBundleVersion=getLatestUpdateBundleVersion(update.data);
		if(localBundleVersion < latestBundleVersion) {
			//Update required
			if (isUpdateReady() && (getUpdateVersion()===latestBundleVersion)){
				//don't download the same bundle twice!
				console.log('CARMIFY: Not downloading bundle as it is already pending: ' + latestBundleVersion);
				callback();
			} else { 
				clearPendingUpdate(); //clear any pending update before downloading a new update.
				downloadUpdate(latestBundleVersion,function() { prepareUpdate(latestBundleVersion,callback); }, function() { callback(); });
			}
		} else { //in case this update is not applicable we still need to callback;
			console.log("CARMIFY: Not updating as local bundle version is newest");
			callback();
		}
	} else if (update.type === "carma:tishadow.update.ready"){
		console.log("CARMIFY: Update triggered by DEV update - NOTE: min/max carma.revision is not considered for dev mode updates!");
		latestBundleVersion="DEV";
		clearPendingUpdate(); //clear any pending update before downloading a new update.
		downloadUpdate(latestBundleVersion,function() { prepareUpdate(latestBundleVersion,callback); }, function() { callback(); },update.data.url);
	}
};


function downloadUpdate(bundleTimestamp,success,fail,url){
	console.log('CARMIFY: Downloading bundle: ' + bundleTimestamp);
    var updateUrl;
	//use provided url if present...
	if (url){ 
		updateUrl=url;
	} else { //otherwise construct CDN url...
	    var osPart = 'ios'; 
	    if(Titanium.Platform.osname === 'android'){
	        osPart = 'android';
	    }
	    updateUrl="https://developer.avego.com/bundles/delta.php?os="+osPart+"&src="+getBundleVersion()+"&tgt="+bundleTimestamp;
	}
	var xhr = Ti.Network.createHTTPClient();
	xhr.setTimeout(30000);
	xhr.onload=function(e) {
		var gotBundle=false;
		try {
			console.log('CARMIFY: Unpacking new production bundle: ' + DOWNLOAD_DIR);
			var zip_file = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, DOWNLOAD_DIR + '.zip');
			zip_file.write(this.responseData);
			if(Titanium.Platform.osname !== 'android'){
	 			zip_file.remoteBackup=false;
	 		}
			// Prepare path
	  		var target = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, DOWNLOAD_DIR);
			//clean up any failed previous extraction...
			if (target.exists()){
				target.deleteDirectory(true);
			}
			var updir=Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, DOWNLOAD_DIR);
			updir.createDirectory();
			if(Titanium.Platform.osname !== 'android'){
	 			updir.remoteBackup=false;
	 		}
			// Extract
			var dataDir=Ti.Filesystem.applicationDataDirectory + "/";
			Compression.unzip(dataDir + DOWNLOAD_DIR, dataDir + DOWNLOAD_DIR + '.zip',true);
			//cleanup the download
			zip_file.deleteFile();
			gotBundle=true;
		} catch (e) {
			console.log('CARMIFY: WARN - Error unpacking bundle: ' + bundleTimestamp +" - " +JSON.stringify(e));
		}
		if (gotBundle){
			if (success){
				success();
			}
		} else {
			if (fail){
				fail();
			}
		}
	};
	xhr.onerror = function(e){
		console.log('CARMIFY: WARN - Error downloading bundle: ' + bundleTimestamp +" - " +JSON.stringify(e));
		if (fail){
			fail();
		}
	};
	xhr.open('GET', updateUrl);
	xhr.send();
};


/** 
 * This function will: 
 * - clone the app and patch it with the update in the download dir, please ensure this is only called if an update actually exists!
 **/
function prepareUpdate(bundleTimestamp,callback){		
	console.log('CARMIFY: preparing update');
 	var downloadDirectory  = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, DOWNLOAD_DIR);
 	if (downloadDirectory.exists()){
	    //first prepare a clone of the current version 
	    createAppClone(STANDBY_DIR);
		//generate diff and apply
		applyPatch(STANDBY_DIR, DOWNLOAD_DIR);
		//mark update ready
		if (bundleTimestamp==="DEV") {
			//Dev mode updates must have their timestamp read from the manifest file
			console.log('CARMIFY: reading "DEV" bundle version');
			bundleTimestamp=readBundleVersion(STANDBY_DIR);
		}
		setUpdateReady(true,bundleTimestamp);
	} 
	if (callback) {
		callback();
	}
};

function isNumber(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

/** 
 * This function will: 
 * - make a copy of the app in the applicationDataDirectory in a provided directory
 **/
function createAppClone(dir){
	console.log('CARMIFY: cloning app to '+dir);
    var backupDir = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,dir);
    var sourceDir  =Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,APP_NAME);
    if (backupDir.exists()) {
        backupDir.deleteDirectory(true);
    }   
    if(sourceDir.exists()) {
        copyDir(Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory), sourceDir, dir);
    } else {
        console.log('No Source directory');
    }
};

/** 
 * This function will calculate the delta diff of the update and apply all required changes to the standby folder 
 **/
function applyPatch(standby, update){
	console.log('CARMIFY: Applying patch to ' +standby);
	var diff=compareManifests(standby, update);
	if (diff) {
		var standbyDirectory  = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, standby);
		var updateDirectory  = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, update);
		for(var i= 0; i< diff.filesToDelete.length; i++){
			//delete the following files 
			var fileToDelete = Ti.Filesystem.getFile(standbyDirectory.nativePath, diff.filesToDelete[i]);
			if(fileToDelete.exists()){
				fileToDelete.deleteFile();
				
				//if last file in dir we should remove dir.
				var paths = fileToDelete.nativePath.split('/');
				var filename = paths[paths.length-1];
				var path = fileToDelete.nativePath.substr(0,fileToDelete.nativePath.length-filename.length);
				var dirList = Ti.Filesystem.getFile(path).getDirectoryListing();
				if (dirList && dirList.length==0){
					console.log('CARMIFY: Removing now empty directory: ' +path);
				} 
			}
		}
		for(var i= 0; i< diff.filesToAdd.length; i++){
			copyFile(diff.filesToAdd[i], updateDirectory, standbyDirectory);
		}
		for(var i= 0; i< diff.filesToUpdate.length; i++){
			copyFile(diff.filesToUpdate[i], updateDirectory, standbyDirectory);
		}   
		copyFile(MANIFEST_FILE, updateDirectory, standbyDirectory);
		//finally delete the update directory 
		updateDirectory.deleteDirectory(true);
	} else {
		console.log('CARMIFY: WARN - no diff to apply patch!');
	}
};

/** 
 * This function will switch in the prepared update and restart the app 
 **/
function applyUpdate(){
	console.log('CARMIFY: Applying update');
    if(isUpdateReady()){
		//kill existing timers...
		_.each(intervalIds, function(id){
	        try {
	            console.log("CARMIFY: Clearing recorded interval on update " + id);
	            clearInterval(id);
	            id = null;
	        } catch(e) {
	            // ignores the erros...
	        }
	    });
	    intervalIds=[];
	    Ti.App.fireEvent("carma:management.cleanup", {});
		//Delete the app
		setUpdateReady(false);
		Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,APP_NAME).deleteDirectory(true);
		Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,STANDBY_DIR).rename(APP_NAME);;
		//update bundle version
		setBundleVersion(getUpdateVersion());
		console.log('CARMIFY: Relaunching app... bundle:'+getBundleVersion());
		TiShadow.launchApp(APP_NAME);
		closeUpdateWindow();
		notifyUpdated();
	} else {
		console.log('CARMIFY: WARN - no update ready to apply');
	}
};


//INTERPRETS FEATURE TOGGLES AND DETERMINES THE LATEST BUNDLE REVISION AVAILABLE
//RETURNS 0 IF NOT APPLICABLE TO APP REVISION INSTALLED
function getLatestUpdateBundleVersion(toggles) {
    var currentBundleTimestamp=0, minAppRevision=0, maxAppRevision=0,
    currentAppRevision = Number(Ti.App.Properties.getString('carma.revision')); 
	//Retrieve relevant toggles
	for(var i = 0; i < toggles.length; i++){
	    if(toggles[i].featureName === BUNDLE_TIMESTAMP){
	        currentBundleTimestamp = Number(toggles[i].value);
	    }
	    if(toggles[i].featureName === MIN_APP_REVISION){
	        minAppRevision = Number(toggles[i].value);
	    }
	    if(toggles[i].featureName === MAX_APP_REVISION){
	        maxAppRevision = Number(toggles[i].value);
	    }
	}
	console.log('CARMIFY: localBundleVersion: ' + getBundleVersion() + ' currentAppRevision: '+currentAppRevision);
	console.log('CARMIFY: currentBundleTimestamp: ' + currentBundleTimestamp + ' AppRevision Range: ('+minAppRevision+' -> '+maxAppRevision+')');
 	if((minAppRevision <= currentAppRevision)&&(currentAppRevision <= maxAppRevision)){
 		return currentBundleTimestamp;
	}
	return 0; 
};

function compareManifests(current, updated){
	console.log('CARMIFY: comparing manifests : '+current+' & '+updated);
    var currentManifestFile = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory + "/" + current,MANIFEST_FILE);
    var updatedManifestFile = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory + "/" + updated,MANIFEST_FILE);
    if(currentManifestFile.exists() && updatedManifestFile.exists()){
        var currentText = currentManifestFile.read().text;
        var updatedText = updatedManifestFile.read().text;

        var currentLines = currentText.split(/\r\n|\r|\n/g);
        var updatedLines = updatedText.split(/\r\n|\r|\n/g);
        return manifestHandler.compareManifest(currentLines, updatedLines);
    } 
    return undefined;
};

function copyDir(destinationPointer, folder2Copy, name) {
    var destination;
    if(destinationPointer == "") {
        destinationPointer = Titanium.Filesystem.getFile(Titanium.Filesystem.applicationDataDirectory);
    } 
    destination = Titanium.Filesystem.getFile(destinationPointer.nativePath, name);
 
    if(!destination.exists()) {
        destination.createDirectory();
    }
    
	if(Titanium.Platform.osname !== 'android'){
		destination.remoteBackup=false;
	}

    var arr = folder2Copy.getDirectoryListing();
    var i = 0;
    while(i<arr.length) { 
        var sourceFile  = Titanium.Filesystem.getFile(folder2Copy.nativePath, arr[i]);
        if(sourceFile.isDirectory()) {
            var destPointer = Titanium.Filesystem.getFile(destinationPointer.nativePath,name);
            Titanium.API.info(destPointer.nativePath);
            copyDir(destPointer, sourceFile, arr[i]);
        } else {   
            var destinationFile = Titanium.Filesystem.getFile(destination.nativePath, arr[i]);
            destinationFile.write(sourceFile.read());
        }
        i++;
    }
};

function copyFile(filename, sourceDirectory, destinationDirectory) {
        var destPath = '/';       
        var subdir;
        if(filename.indexOf('/') !== -1){
          var paths = filename.split('/');
          destPath = '/';
          
          for(var j = 0; j < paths.length-1; j++){
            destPath =  destPath + paths[j] + "/";
            subdir=Ti.Filesystem.getFile(destinationDirectory.nativePath + destPath);
            if (!subdir.exists()){
            	subdir.createDirectory();
            }
          } 
          filename = paths[paths.length-1];
        }
        var fileToCopy = Ti.Filesystem.getFile(sourceDirectory.nativePath + destPath, filename);  
        var destinationFile = Titanium.Filesystem.getFile(destinationDirectory.nativePath + destPath, filename);
        //Delete file if it already exists as it will not be overwritten otherwise... 
        if(destinationFile.exists()){
            destinationFile.deleteFile();
        }
        destinationFile.write(fileToCopy.read()); 
};

