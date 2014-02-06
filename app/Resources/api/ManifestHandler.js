

exports.compareManifest = function(localManifest, newManifest){

	console.log('Comparing manifest');
	//build up objects
	var localEntries = getDetails(localManifest), 
		updatedEntries = getDetails(newManifest), 
		action = {}, 
		i, version;


	action.filesToDelete = []; 
	action.filesToAdd = []; 
	action.filesToUpdate = []; 
	
	//find the files to update or delete
  Object.keys(localEntries).forEach(function(name) {		
		version =  updatedEntries[name];
		if(version === undefined){
			action.filesToDelete.push(name);
		}
		else{
			if(version !== localEntries[name]){
				action.filesToUpdate.push(localEntries[name]);
			}
			//otherwise the files are the same, our work here is done
		}
	});


	//find new files 
	for(i = 0; i < updatedEntries.length; i++){
		
		if(getCorrespondingEntry(updatedEntries[i], localEntries) === null){
			//new file to add 
			action.filesToAdd.push(updatedEntries[i].name);
		}
	}
	console.log('Update: ' + action.filesToUpdate.length + ' Delete: ' + action.filesToDelete.length + ' Add: ' + action.filesToAdd.length);

	return action;
};

/** 
 * Create objects from the lines in the manifest 
 **/
function getDetails(manifest){
	var details = {};
	for(var i= 0; i < manifest.length; i++){
		
		if((manifest[i].indexOf('#') === -1) &&(manifest[i].length > 0)){
			var entry = manifest[i].split(",");
			details[entry[0]] = entry[1];
		}
		
	}
	return details;
};

