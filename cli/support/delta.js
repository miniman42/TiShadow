var logger = require("../../server/logger.js"),
	mfhndlr = require("../../app/Resources/api/ManifestHandler.js"),
    fs = require("fs"),
    path = require("path"),
    archiver = require('archiver'),
    zip = require('adm-zip'),
    temp = require('temp'),
    config = require("./config");

require("./fs_extension");

exports.delta = function(env,callback) {
  	config.buildPaths(env, function() {
		//enabling tracking will mean that all temp resources are automagically cleaned up when we're done
		temp.track();
		//make sure the bundles exist!
		if (fs.existsSync(config.sourcebundlepath) && fs.existsSync(config.targetbundlepath)){
			//create a temp dir to generate the delta bundle required...
			temp.mkdir('delta',function(err,dirPath){
				console.log("Temporary Working Dir:"+dirPath+"\n");
				var srcdir=path.join(dirPath,'source');
				var tgtdir=path.join(dirPath,'target');
				var deldir=path.join(dirPath,'delta');
				//create directories to extract and build the delta bundle
				fs.mkdirSync(srcdir);
				fs.mkdirSync(tgtdir);
				fs.mkdirSync(deldir);
				//exctract the bundles
				var src=new zip(config.sourcebundlepath);
				var tgt=new zip(config.targetbundlepath);
				src.extractAllTo(srcdir);
				tgt.extractAllTo(tgtdir);
				//read the contained manifests into arrays of strings
				var srcmanifest=fs.readFileSync(path.join(srcdir,'manifest.mf'),'utf8').split('\n');
				var tgtmanifest=fs.readFileSync(path.join(tgtdir,'manifest.mf'),'utf8').split('\n');
				//determine changes...
				var comparison=mfhndlr.compareManifest(srcmanifest,tgtmanifest);
				console.log(JSON.stringify(comparison)+"\n");
			
				
				//now we build the delta
				//copy in the target manifest
				console.log("Preparing Delta Bundle:\n--> Copying target manifest");
				fs.writeFileSync(path.join(deldir,'manifest.mf'),fs.readFileSync(path.join(tgtdir,'manifest.mf')));
				//copy in the files to add and the files to update
				comparison.filesToAdd.concat(comparison.filesToUpdate).forEach(function(file){
					console.log(deldir +" " + file);
					var delfilepath=path.join(deldir,file);
					
					//if dir doesn't exist create it
					if(!fs.existsSync(path.dirname(delfilepath))) {
						console.log("--> Creating delta output dir: " +path.dirname(file));
						fs.mkdirSyncP(path.dirname(delfilepath),true);
					}
					//Copy file to delta bundle
					console.log("--> Copying file to delta output dir: " + JSON.stringify(file));
					fs.writeFileSync(path.join(deldir,file),fs.readFileSync(path.join(tgtdir,file)));
				});
				
				//now we need to zip the bundle
				var del=new zip();
				console.log("\nCreating delta zip bundle: " + config.deltabundlepath);
				del.addLocalFolder(deldir,"");
				del.writeZip(config.deltabundlepath);
				console.log("DONE");
			});
		} else {
			console.log("Source and/or target does not exist!");
		}
		if (callback){
			callback();
		}
	});
};