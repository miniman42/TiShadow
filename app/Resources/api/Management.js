
var TiShadow = require("/api/TiShadow"),
    Compression = require('ti.compression'),
    log = require('/api/Log'), 
    utils = require('/api/Utils'), 
    manifestHandler = require('/api/ManifestHandler');

var BUNDLE_TIMESTAMP = "currentBundleTimestamp", 
    MIN_APP_REVISION = "minAppRevision", 
    MAX_APP_REVISION = "maxAppRevision";


//start the management process, waiting for production updates
exports.start = function(options){
    
    //Feature toggles come in on Launch or resume of the internal app and when there is any change to them in the lifecycle of the app.
    Ti.App.addEventListener("carma:feature.toggles", function(evt){ 
        console.log('CARMIFY: Received feature toggles');
	    var localBundleVersion = getLocalBundleVersion();  
		var latestBundleVersion=getLatestBundleVersion(evt.data);
     	if(localBundleVersion < latestBundleVersion){
   			//Update if required
   			getLatestBundle(latestBundleVersion);
		}
    });

    Ti.App.addEventListener("carma:life.cycle.launch", function(){ 
        //TODO: Record the version of the app in the preferences store.
        //TODO: include a parameter from carma-splinter
        console.log('CARMIFY: App Launched');
        var updateReady = Ti.App.Properties.getBool('updateReady');
        if(updateReady){ 
            applyUpdate();	
        }
    });
    
    Ti.App.addEventListener("carma:life.cycle.resume", function(){ 
        console.log('CARMIFY: App Resumed');
        var updateReady = Ti.App.Properties.getBool('updateReady');
        //alert("resuming - "+updateReady);
        if(updateReady){ 
            applyUpdate();
        }
    });

};

//INTERPRETS FEATURE TOGGLES AND DETERMINES THE LATEST BUNDLE REVISION AVAILABLE
//RETURNS 0 IF NOT APPLICABLE
function getLatestBundleVersion(toggles) {
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
	console.log('CARMIFY: localBundleVersion: ' + getLocalBundleVersion() + ' currentAppRevision: '+currentAppRevision);
	console.log('CARMIFY: currentBundleTimestamp: ' + currentBundleTimestamp + ' AppRevision Range: ('+minAppRevision+' -> '+maxAppRevision+')');
	
    //HERE WE BREAK 
	if((minAppRevision <= currentAppRevision)&&(currentAppRevision <= maxAppRevision)){
       	//WE CAN UPDATE IF THERE IS ONE 
		return currentBundleTimestamp;
	}
	return 0; 
};

function getLocalBundleVersion(){
	var localBundleVersion = Number(Ti.App.Properties.getString('bundleVersion')); 
	if (localBundleVersion===0){
		//Read it from the manifest...
		var currentManifestFile = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory + '/carma-splinter/manifest.mf');
		Ti.App.Properties.setString('bundleVersion', currentManifestFile.read().text.split(/\r\n|\r|\n/g)[0].split(':')[1]);
		localBundleVersion = Number(Ti.App.Properties.getString('bundleVersion'));
	}
	return localBundleVersion;
};

function applyUpdate(){
    var oldApp  =Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,            
    'carma-splinter');
    var newApp  =Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,            
    'standby');
  	oldApp.rename('legacy');
  	Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,            
    'legacy').deleteDirectory(true);
    console.log('Deleted old app');
    newApp.rename('carma-splinter');
    console.log('Switched in new app');
    TiShadow.launchApp('carma-splinter');
    console.log('Launched new app');
    //Update is now complete
    Ti.App.Properties.setBool('updateReady', false);
}

function getLatestBundle(bundleTimestamp){
    var osPart = 'ios'; 
    if(Titanium.Platform.osname === 'android'){
        osPart = 'android';
    }
    var updateUrl="https://developer.avego.com/bundles/delta.php?os="+osPart+"&src="+getLocalBundleVersion()+"&tgt="+bundleTimestamp;

    //first prepare the old version 
    prepareUpdatedVersion();
    loadRemoteZip("carma-splinter",updateUrl, bundleTimestamp);
  
}


function loadRemoteZip(name, url, bundleTimestamp) {
  var xhr = Ti.Network.createHTTPClient();
  xhr.setTimeout(10000);
  xhr.onload=function(e) {
    try {
      log.info("Unpacking new production bundle: " + name);

      var path_name = 'latest';
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
      console.log("Zip is ready......");

      processManifests('standby', 'latest');
      //mark update ready
      Ti.App.Properties.setBool('updateReady', true);
      //save current bundler version
      Ti.App.Properties.setString('bundleVersion', bundleTimestamp);
      //TODO remove this alert!
      alert("Update "+bundleTimestamp+" ready to be applied on next resume");

      // Launch
      //DON'T Launch the app yet. 
      //TiShadow.launchApp(path_name);
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


function processManifests(current, updated){

    var currentManifestFile = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory + "/" + current,            
    'manifest.mf');
    var updatedManifestFile = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory + "/" + updated,            
    'manifest.mf');


    if(currentManifestFile.exists() && updatedManifestFile.exists()){
        console.log('Process manifest');
        var currentText = currentManifestFile.read().text;
        var updatedText = updatedManifestFile.read().text;

        var currentLines = currentText.split(/\r\n|\r|\n/g);
        var updatedLines = updatedText.split(/\r\n|\r|\n/g);
        var action = manifestHandler.compareManifest(currentLines, updatedLines);
        console.log('Now apply patch');
        //TODO: apply the changes to the folder.
        applyPatch(action, current, updated);
    }
    else{
        console.log('Manifests  are not ready Yet ')
    }
}


/** 
 * This function will apply all required changes to the standby folder 
 **/
function applyPatch(action, current, updated){
    var standbyDirectory  = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, current);
    console.log('Standby directory ' + standbyDirectory.nativePath);

    var updateDirectory  = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, updated);
    for(var i= 0; i< action.filesToDelete.length; i++){
        //delete the following files 
        var fileToDelete = Ti.Filesystem.getFile(standbyDirectory.nativePath, action.filesToDelete[i]);
        if(fileToDelete.exists()){
            fileToDelete.deleteFile();
        }
    }
    for(var i= 0; i< action.filesToAdd.length; i++){
        copyFile(action.filesToAdd[i], updateDirectory, standbyDirectory);
    }
    for(var i= 0; i< action.filesToUpdate.length; i++){
        copyFile(action.filesToUpdate[i], updateDirectory, standbyDirectory);
    }   
    copyFile('manifest.mf', updateDirectory, standbyDirectory);

    //finally delete the update directory 
    updateDirectory.deleteDirectory(true);


}

function copyFile(filename, sourceDirectory, destinationDirectory){
        var destPath = '/';       
        
        if(filename.indexOf('/') !== -1){
         // console.log('Path to be split ' + filename);
          var paths = filename.split('/');
          destPath = '/';
         // console.log('Path split into ' + paths.length);
          for(var j = 0; j < paths.length-1; j++){
            destPath =  destPath + paths[j] + "/";
        //    console.log('Path is now '+ destPath);
          } 
          filename = paths[paths.length-1];
        }
        //console.log(filename);

        //copyFile(standbyDirectory.nativePath + destPath, fileToCopy.nativePath, filename);
        var fileToCopy = Ti.Filesystem.getFile(sourceDirectory.nativePath + destPath, filename);  
        var destinationFile = Titanium.Filesystem.getFile(destinationDirectory.nativePath + destPath, filename);
        //Delete file if it already exists as it will not be overwritten otherwise... 
        if(destinationFile.exists()){
            destinationFile.deleteFile();
        }
        destinationFile.write(fileToCopy.read()); 
}

/** 
 * This function will: 
 * - make a copy of the app in the applicationDataDirectory 
 * - copy over the updated files 
 * - keep that app in standby 
 **/
function prepareUpdatedVersion(){

    var backupDir = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,            
    'standby');
    var sourceDir  =Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory,            
    'carma-splinter');

    if (backupDir.exists()) {
        backupDir.deleteDirectory(true);
    }   

    if(sourceDir.exists()){
        copyDir(Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory), sourceDir, 'standby');
    }
    else{
        console.log('No Source directory');
    }
}



function copyDir(destinationPointer, folder2Copy, name)
{
    Titanium.API.info("destinationPointer -->>" + destinationPointer.nativePath);
 
    var destination;
 
    if(destinationPointer == "")
    {
        destinationPointer = Titanium.Filesystem.getFile(Titanium.Filesystem.applicationDataDirectory);
        destination = Titanium.Filesystem.getFile(destinationPointer.nativePath, name);
    }
    else
    {
        destination = Titanium.Filesystem.getFile(destinationPointer.nativePath, name);
    }
 
    if(!destination.exists())
    {
        destination.createDirectory();
    }
 
    var arr = folder2Copy.getDirectoryListing();
    var i = 0;

 
    while(i<arr.length)
    { 
        var sourceFile  = Titanium.Filesystem.getFile(folder2Copy.nativePath, arr[i]);
        if(sourceFile.extension() == null)
        {
       
            var destPointer = Titanium.Filesystem.getFile(destinationPointer.nativePath,name);
            Titanium.API.info(destPointer.nativePath);
            copyDir(destPointer, sourceFile, arr[i]);
        }
        else
        {   
           
            var destinationFile = Titanium.Filesystem.getFile(destination.nativePath, arr[i]);
            destinationFile.write(sourceFile.read());
        }
        i++;
 
        ///Titanium.API.info(destinationPointer.getDirectoryListing().toString());
    }
}
