
var TiShadow = require("/api/TiShadow"),
    Compression = require('ti.compression'),
    log = require('/api/Log'), 
    utils = require('/api/Utils'), 
    manifestHandler = require('/api/ManifestHandler');


//start the management process, waiting for production updates
exports.start = function(options){
    
    var BUNDLE_TIMESTAMP = "currentBundleTimestamp", 
        MIN_APP_REVISION = "minAppRevision", 
        MAX_APP_REVISION = "maxAppRevision";

    Ti.App.addEventListener("carma:feature.toggle", function(toggleData){ 
       
        console.log('CARMIFY: Received feature toggle ');
        var currentBundleTimestamp, minAppRevision, minAppRevision,
            currentAppVersion = Number(Ti.App.Properties.getString('carma.revision')), 
            localBundleVersion = Number(Ti.App.Properties.getString('bundleVersion'));  


        var toggles = JSON.parse(toggleData.data).featureToggle;
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
        console.log('CARMIFY: minAppRevision: ' + minAppRevision + ' vs ' + currentAppVersion);
        console.log('CARMIFY: currentBundleTimestamp: ' + currentBundleTimestamp);
        console.log('CARMIFY: maxAppRevision: ' + maxAppRevision);
        console.log('CARMIFY: localBundleVersion: ' + localBundleVersion);


        //TODO: REMOVE THIS - ITs JUST ARTIFICIAL 
        localBundleVersion = currentBundleTimestamp - 10;


       //HERE WE BREAK 
       if(minAppRevision <= currentAppVersion){
            console.log('min app comparison passed');
            if(currentAppVersion <= maxAppRevision){
                //GET THE BUNDLE 
                console.log('max app comparison passed');
                if(localBundleVersion < currentBundleTimestamp){
                  console.log('bundle comparison passed');

                  getLatestBundle(currentBundleTimestamp);
                }
            }
        }
    });


    Ti.App.addEventListener("carma:life.cycle.launch", function(){ 
        //TODO: Record the version of the app in the preferences store.
        //TODO: include a parameter from carma-splinter
        console.log('CARMIFY: App Launched');
    });
    
    Ti.App.addEventListener("carma:life.cycle.resume", function(){ 
        console.log('App Resumed');
        //apply change if necessary. Start with prepareUpdatedVersion()
    });

    setInterval(function(){
            console.log("Checking production for new stuff now.......");
        
    },10000);


    //TODO: detect the best time to update the app... 
    //should we have an 'not now' event? 
    //prepareUpdatedVersion();

    //CHECK NATIVE VERSION CAN BE ACCESSED FROM TIAPP.XML 

    //EXTRACT BUNDLE TIMESTAMP 

};



function getLatestBundle(bundleTimestamp){
    //alert('Getting bundle for ' + bundleTimestamp);
    //TODO: each OS will have it's own bundle 
    var osPart = 'ios'; 
    if(Titanium.Platform.osname === 'android'){
        osPart = 'android';
    }
    var updateUrl="https://developer.avego.com/bundles/"+bundleTimestamp+"/"+ osPart + "/carma-splinter.zip";
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
       //save current bundle version 
       Ti.App.Properties.setString('bundleVersion', bundleTimestamp);


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
        var currentText = currentManifestFile.read().text;
        var updatedText = updatedManifestFile.read().text;

        var currentLines = currentText.split(/\r\n|\r|\n/g);
        var updatedLines = updatedText.split(/\r\n|\r|\n/g);
        var action = manifestHandler.compareManifest(currentLines, updatedLines);
        //TODO: apply the changes to the folder.

    }
    else{
        console.log('Manifests  are not ready Yet ')
    }



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
        //IOS Solution 
        copyDir(Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory), sourceDir, 'standby');
    }
    else{
        console.log('No Source directory');
    }


    //Now apply Greg's stuff. 

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
 
        Titanium.API.info(destinationPointer.getDirectoryListing().toString());
    }
}

 /*
//Checks what the current native version of the app is 
exports.getNativeVersion = function(){

};

//get the version of the app that is being hosted
exports.getHostedVersion = function(){

};


//make a call to prepare a new version of the app 
exports.prepare = function(){


};


//applies the new version of the app at a particular time
exports.apply = function(){

};*/