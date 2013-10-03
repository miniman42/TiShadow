

//start the management process, waiting for production updates
exports.start = function(options){
	console.log('Starting management process')
	setInterval(function(){
			console.log("Checking production for new stuff now.......");
		
	},10000);

	Ti.App.addEventListener("carma:life.cycle.launch", function(){ 
		//TODO: Record the version of the app in the preferences store.
		//TODO: include a parameter from carma-splinter
		console.log('App Launched');
	});
	
	Ti.App.addEventListener("carma:life.cycle.resume", function(){ 
		console.log('App Resumed');
	});

	Ti.App.addEventListener("carma:life.cycle.pause", function(){ 
		//maybe apply the update while the app is paused... ?? 
		console.log('App Paused');
	});
	
	//TODO: detect the best time to update the app... 
	//should we have an 'not now' event? 
	prepareUpdatedVersion();

};


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
		copyDir(Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory), sourceDir, 'backup');
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