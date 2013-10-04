

exports.compareManifest = function(localManifest, newManifest){

	console.log('Comparing manifest');
	//build up objects
	var localEntries = getDetails(localManifest), 
		updatedEntries = getDetails(newManifest), 
		action = {}, 
		i, result;


	action.filesToDelete = []; 
	action.filesToAdd = []; 
	action.filesToUpdate = []; 
	
	//find the files to update or delete
	for(i = 0; i < localEntries.length; i++){
		
		result =  getCorrespondingEntry(localEntries[i], updatedEntries);
		if(result === null){
			action.filesToDelete.push(localEntries[i].name)
		}
		else{
			if(result.version !== localEntries[i].version){
				action.filesToUpdate.push(localEntries[i]);
			}
			//otherwise the files are the same, our work here is done
		}
	}


	//find new files 
	for(i = 0; i < updatedEntries.length; i++){
		
		if(getCorrespondingEntry(updatedEntries[i], localEntries) === null){
			//new file to add 
			action.filesToAdd.push(updatedEntries[i]);
		}
	}
	console.log('Update: ' + action.filesToUpdate.length + ' Delete: ' + action.filesToDelete.length + ' Add: ' + action.filesToAdd.length);

	return action;
}

/** 
 * Create objects from the lines in the manifest 
 **/
function getDetails(manifest){
	var details = [];
	for(var i= 0; i < manifest.length; i++){
		
		if((manifest[i].indexOf('#') === -1) &&(manifest[i].length > 0)){
			var entry = manifest[i].split(",");
			details.push({name: entry[0], version : entry[1]});
		}
		
	}
	return details;
}

/** 
 * Check if a file (entry) is in another manifest (list)
 **/
function getCorrespondingEntry(entry, list){
	for(var i = 0; i < list.length; i++){
		if(list[i].name === entry.name){
			return list[i];
		}
	}
	return null;
}
