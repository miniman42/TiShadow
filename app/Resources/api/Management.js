
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
    
    
    

//This function makes sure that the local filesystem is setup correctly to allow successful app launches and handling of native
//revision updates.  It must be called prior to launching the application with TIShadow or calling start on the module itself
exports.initialise = function(name){

	//record the name as this is also the path of the running app...
	APP_NAME=name;

	//get as built AppRevsion
	var appRevision = getAppRevision();
	
	//if this is a new or updated native revision
	if (appRevision!==getInstalledRevision()){
		//need to install the new revision
		installAppRevisionBundle();		
	}
};

//start the management process, waiting for production updates and applying them at appropriate times
exports.start = function(options){
    
    //Feature toggles come in on Launch or resume of the internal app and when there is any change to them in the lifecycle of the app.
    Ti.App.addEventListener("carma:feature.toggles", function(evt){ 
        console.log('CARMIFY: Received feature toggles');
	    var localBundleVersion = getBundleVersion();  
		var latestBundleVersion=getLatestUpdateBundleVersion(evt.data);
     	if(localBundleVersion < latestBundleVersion){
   			//Update required
   			downloadUpdate(latestBundleVersion,prepareUpdate);
		}
    });

    Ti.App.addEventListener("carma:life.cycle.launch", function(){ 
        console.log('CARMIFY: App Launched');
		if (isUpdateReady()){
            applyUpdate();	
        }
    });
    
    Ti.App.addEventListener("carma:life.cycle.resume", function(){ 
        console.log('CARMIFY: App Resumed');
		if (isUpdateReady()){
            applyUpdate();
        }
    });
    
};

function getAppRevision(){
	return Ti.App.Properties.getString('carma.revision');
};

function getInstalledRevision(){
	return Ti.App.Properties.getString('installed.revision');
};

function setInstalledRevision(revision){
	Ti.App.Properties.setString('installed.revision',revision);	
};

function isUpdateReady(){
	return Ti.App.Properties.getBool('updateReady');
};

function setUpdateReady(ready){
	Ti.App.Properties.setBool('updateReady',ready);
};

function getBundleVersion(){
	return Number(Ti.App.Properties.getString('bundleVersion')); 
};

function setBundleVersion(version){
	Ti.App.Properties.setString('bundleVersion', version);
};

/** 
 * This function will: 
 * - read the currently installed bundle manifest and return its creation timestamp
 **/
function readBundleVersion(){
	var installedManifestFile = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory + '/' + APP_NAME + '/' +MANIFEST_FILE);
	//grab first line of the manifest and parse the manifest version
	return installedManifestFile.read().text.split(/\r\n|\r|\n/g)[0].split(':')[1];
};

/** 
 * This function will: 
 * - install the App revisions bundled version, clearing pending updates
 * - this function must only be called before the module's start method has been invoked.
 **/
function installAppRevisionBundle(){
	//clear any pending update tasks for the previous revison.
	clearPendingUpdate();
	
	//remove the previous app directory if present
	var existing = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, APP_NAME);
	if (existing.exists()) {
		//delete the previous existing extracted resources
		existing.deleteDirectory(true);
	}

	//create the new app directory and unzip there
	Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, APP_NAME).createDirectory();
	Compression.unzip(Ti.Filesystem.applicationDataDirectory + "/" + APP_NAME, Ti.Filesystem.resourcesDirectory + "/" + APP_NAME + '.zip',true);
	
	//update the installed revision and bundle
	setInstalledRevision(getAppRevision());	
	setBundleVersion(readBundleVersion());	
};

/** 
 * This function will: 
 * - clear any pending updates if present
 **/
function clearPendingUpdate(){
	if (isUpdateReady()){
    	setUpdateReady(false);
		Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,STANDBY_DIR).deleteDirectory(true);
	}
};

function downloadUpdate(bundleTimestamp,success){
    var osPart = 'ios'; 
    if(Titanium.Platform.osname === 'android'){
        osPart = 'android';
    }
    var updateUrl="https://developer.avego.com/bundles/delta.php?os="+osPart+"&src="+getBundleVersion()+"&tgt="+bundleTimestamp;
	var xhr = Ti.Network.createHTTPClient();
	xhr.setTimeout(30000);
	xhr.onload=function(e) {
		try {
			log.info("Unpacking new production bundle: " + name);
			var zip_file = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, DOWNLOAD_DIR + '.zip');
			zip_file.write(this.responseData);
			// Prepare path
	  		var target = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, DOWNLOAD_DIR);
			if (!target.exists()) {
				target.createDirectory();
			}
			// Extract
			var dataDir=Ti.Filesystem.applicationDataDirectory + "/";
			Compression.unzip(dataDir + DOWNLOAD_DIR, dataDir + DOWNLOAD_DIR + '.zip',true);
			//cleanup the download
			zip_file.deleteFile();
			success();
		} catch (e) {
			log.error(utils.extractExceptionData(e));
		}
	};
	xhr.onerror = function(e){
		log.error(utils.extractExceptionData(e));
	};
	xhr.open('GET', url);
	xhr.send();
};


/** 
 * This function will: 
 * - clone the app and patch it with the update in the download dir, please ensure this is only called if an update actually exists!
 **/
function prepareUpdate(){		
 	var downloadDirectory  = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, DOWNLOAD_DIR);
 	if (downloadDirectory.exists()){
	    //first prepare a clone of the current version 
	    createAppClone(STANDBY_DIR);
		//generate diff and apply
		applyPatch(STANDBY_DIR, DOWNLOAD_DIR);
		//mark update ready
		setUpdateReady(true);
		//TODO remove this alert!
		alert("Update "+bundleTimestamp+" ready to be applied on next resume");
	}
};


/** 
 * This function will: 
 * - make a copy of the app in the applicationDataDirectory in a provided directory
 **/
function createAppClone(dir){
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
	var diff=compareManifests(standby, update);
	if (diff) {
		var standbyDirectory  = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, standby);
		var updateDirectory  = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, update);
		for(var i= 0; i< diff.filesToDelete.length; i++){
			//delete the following files 
			var fileToDelete = Ti.Filesystem.getFile(standbyDirectory.nativePath, diff.filesToDelete[i]);
			if(fileToDelete.exists()){
				fileToDelete.deleteFile();
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
	}
};

/** 
 * This function will switch in the prepared update and restart the app 
 **/
function applyUpdate(){
    if(isUpdateReady()){
		//Delete the app
		setUpdateReady(false);
		Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,APP_NAME).deleteDirectory(true);
		Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,STANDBY_DIR).rename(APP_NAME);;
		//update bundle version
		setBundleVersion(readBundleVersion());
		TiShadow.launchApp(APP_NAME);
	}
}


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
    var currentManifestFile = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory + "/" + current,MANIFEST_FILE);
    var updatedManifestFile = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory + "/" + updated,MANIFEST_FILE);
    if(currentManifestFile.exists() && updatedManifestFile.exists()){
        console.log('Process manifest');
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
        destination = Titanium.Filesystem.getFile(destinationPointer.nativePath, name);
    } else {
        destination = Titanium.Filesystem.getFile(destinationPointer.nativePath, name);
    }
 
    if(!destination.exists()) {
        destination.createDirectory();
    }
 
    var arr = folder2Copy.getDirectoryListing();
    var i = 0;
    while(i<arr.length) { 
        var sourceFile  = Titanium.Filesystem.getFile(folder2Copy.nativePath, arr[i]);
        if(sourceFile.extension() == null) {
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
        if(filename.indexOf('/') !== -1){
          var paths = filename.split('/');
          destPath = '/';
          for(var j = 0; j < paths.length-1; j++){
            destPath =  destPath + paths[j] + "/";
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

