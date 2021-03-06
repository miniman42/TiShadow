#!/usr/bin/env node
var path   = require("path"),
    fs     = require("fs"),
    exec   = require("execSync").exec,
    alloy  = require("./alloy"),
    api    = require("./api"),
    bundle = require("./bundle"),
    config = require("./config"),
    uglify = require("./uglify"),
    logger = require("../../server/logger.js"),
    jshint = require("./jshint_runner"),
    crypto = require('crypto'),
    _      = require("underscore");

    require("./fs_extension");

var manifestFilename="manifest.mf";    
var manifest;    

// Copies all Resource files and prepares JS files
function prepare(src, dst, callback) {
  var app_name = config.app_name;
  var hash="--------------------------------";
  var outdir="/tishadow/src/";
  var hashFile=dst.substring(dst.indexOf(outdir)+outdir.length);
  if (src.match("js$")){ 
    try {
      var src_text = uglify.toString(fs.readFileSync(src).toString(),src);
      if (src.match("_spec.js$")) {
        src_text =  "var __jasmine = require('/lib/jasmine');var methods = ['spyOn','it','xit','expect','runs','waits','waitsFor','beforeEach','afterEach','describe','xdescribe','jasmine'];methods.forEach(function(method) {this[method] = __jasmine[method];});"
          +src_text;
      }
      fs.writeFile(dst,src_text, callback);
      hash = crypto.createHash('md5').update(src_text).digest('hex').slice(0, 32);
    } catch (e) {
      logger.error(e.message + "\nFile   : " + src + "\nLine   : " + e.line + "\nColumn : " + e.col);
      config.isWatching || process.exit(1);
    }
  } else { // Non-JS file - just pump it
    //TODO: here is where the intro files can be ignored. 
    var  is = fs.createReadStream(src);
    var  os = fs.createWriteStream(dst);
    hash = crypto.createHash('md5').update(fs.readFileSync(src)).digest('hex').slice(0, 32);
    is.on("end", callback).pipe(os);
  }
  manifest+= hashFile + ","+ hash +"\n";
}

function prepareFiles(newFile, index, file_list, isSpec, callback) {
  if (newFile){
  //initialise manifset contents
    manifest = "#Created:"+config.timestamp+"\n#ForceUpdate:"+config.forceUpdate+"\n";
    console.log("Bundle Meta - "+manifest);
  }
  if (file_list.files.length === index) {
     fs.writeFile(path.join(config.tishadow_src, manifestFilename),manifest,callback());
  } else {
    var file = file_list.files[index];
    var basePath = file_list.location;

    prepare(path.join(isSpec? basePath : config.resources_path,file), path.join(config.tishadow_src, file), function(){
      index++;
      prepareFiles(false, index, file_list, isSpec, callback);
    });
  }
}

function finalise(file_list,callback) {
  // Bundle up to go
  var total = file_list.files.length;
  bundle.pack(file_list.files,function(written) { 
    logger.info(total+ " file(s) bundled."); 
    if (config.isAlloy) {
      alloy.writeMap();
    }
    fs.touch(config.last_updated_file);
    if (config.isBundle) {
      logger.info("Bundle Ready: " + config.bundle_file);
      if (callback) {
        callback();
      }
    } else {
      api.newBundle(config.isPatch?_.filter(file_list.files, function(f) { return f.match(".js$");}):null );
    }
  });
}

module.exports = function(env, callback) {
  config.buildPaths(env, function() {

    if (env.jshint) {
      logger.info("Running JSHint");
      jshint.checkPath(config.jshint_path);
    }

    logger.info("Beginning Build Process");
    var file_list,i18n_list,spec_list;
    // a js map of hashes must be built whether or not it is an update.
    if (config.isAlloy) { 
      logger.info("No way am I compiling Alloy again. Waste of my precious time");
      alloy.buildMap();
    }

    if( config.isUpdate) {
       var last_stat = fs.statSync(config.last_updated_file);
       file_list = config.isAlloy ? alloy.mapFiles(last_stat) : fs.getList({path: config.resources_path, update_time: last_stat.mtime, blacklist: config.blacklistFilter});
       i18n_list = fs.getList({path: config.i18n_path, update_time: last_stat.mtime});
       spec_list = fs.getList({path: config.spec_path, update_time: last_stat.mtime, blacklist: config.blacklistFilter});

       if (file_list.files.length === 0 && i18n_list.files.length === 0 && spec_list.files.length === 0) {
         logger.error("Nothing to update.");
         return;
       }
     } else {
       if (!fs.existsSync(config.build_path)){
         fs.mkdirSync(config.build_path, 0755);
       }
       //Clean Build Directory
       if (fs.existsSync(config.tishadow_build)) {
         fs.rm_rf(config.tishadow_build);
       }
       // Create the tishadow build paths
       fs.mkdirs([config.tishadow_build, config.tishadow_src, config.tishadow_dist]);
       file_list = fs.getList({path: config.resources_path, blacklist: config.blacklistFilter});
       i18n_list = fs.getList({path: config.i18n_path});
       spec_list = fs.getList({path: config.spec_path, blacklist: config.blacklistFilter});
     }
    
     // Build the required directory structure
     fs.mkdirs(file_list.dirs, config.tishadow_src);
     fs.mkdirs(i18n_list.dirs, config.tishadow_src);
     if(spec_list.files.length > 0) {
       if (!fs.existsSync(config.tishadow_spec)) {
         fs.mkdirSync(config.tishadow_spec, 0755);
       }
       fs.mkdirs(spec_list.dirs, config.tishadow_spec);
       spec_list.files = spec_list.files.map(function(file) { return "spec/" + file;});
       spec_list.dirs = ["spec"].concat(spec_list.dirs.map(function(dir) {return "spec/" + dir;}));
     }



     // using the slower sync read/write for localisation files 
     i18n_list.files.forEach(function(file, idx) {
       fs.writeFileSync(path.join(config.tishadow_src, file),fs.readFileSync(path.join(config.i18n_path,file)));
     });
   
     spec_list.location='';//config.spec_path;
     i18n_list.location=config.i18n_path;
     // Process Files
     prepareFiles(true, 0, file_list, false, function() {
      prepareFiles(false, 0, i18n_list, true, function() {
       prepareFiles(false, 0, spec_list, true, function() {
          file_list.files = file_list.files.concat(i18n_list.files).concat(spec_list.files).concat(manifestFilename);
          finalise(file_list,callback);
       });
     });
    });
  });
}

