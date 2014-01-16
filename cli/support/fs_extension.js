var path = require("path"),
    fs = require("fs"),
    osSep = process.platform === 'win32' ? '\\' : '/', 
    config = null; 

/** 
 * Allows the configuration to be passed through
 * Currently this is used so that an 'ignore platform' can be passed through in order
 * to disregard the Android folder (for example)
 **/
function setConfig(cfg){
  config = cfg;
};

fs.setConfig = setConfig;

// Get Filelist with optional "update" filter
function getList(start, last_update, _path) {
  var files = [], dirs=[];
  if (!fs.existsSync(start)) {
    return {files: files, dirs: dirs};
  }
  var stat = fs.statSync(start);
  if (stat.isDirectory()) {
    var filenames = fs.readdirSync(start);
    var coll = filenames.reduce(function (acc, name) {
      var abspath = path.join(start, name);
      var file_stat = fs.statSync(abspath);
      /** 
       * This section of code ensures that the file list for the bundles contains only what is 100% required.
       * This means: 
       *   - hidden files are not include  
       *   - the 'other' platform is not included (so an iOS build does not include Android specific resources and vice versa)
       *   - images used for the intro screen (scroller_images) are not included  
       */ 
      if (  name.match(/^\./) || abspath.indexOf("/"+config.ignore_platform+"/") !== -1 || abspath.indexOf(config.scroller_images) !== -1 ) {
        // IGNORING HIDDEN FILES
  		//} else if(abspath.indexOf('/api/') !== -1){  //} || abspath.indexOf('heartbeat') !== -1) {
        //IGNORE API
        } else if (file_stat.isDirectory()) {
        acc.dirs.push(name);
      } else {
        if (last_update === undefined || last_update < file_stat.mtime) {
          acc.names.push(path.join(_path || "." , name));
        }
      }
      return acc;
    }, {"names": [], "dirs": []});
    files = coll.names;
    coll.dirs.forEach(function (d) {
      var abspath = path.join(start, d);
      var relpath = path.join(_path|| ".", d);
      dirs.push(relpath);
      var recurs = getList(abspath, last_update, relpath);
      files = files.concat(recurs.files);
      dirs = dirs.concat(recurs.dirs);
    });
  }
  return {files: files, dirs: dirs};
};

fs.getList = getList;

// Recursively Remove Directories
fs.rm_rf = function(dir) {
  var list = fs.readdirSync(dir);
  for(var i = 0; i < list.length; i++) {
    var filename = path.join(dir, list[i]);
    var stat = fs.statSync(filename);
    if(filename == "." || filename == "..") {
    } else if(stat.isDirectory()) {
      fs.rm_rf(filename);
    } else {
      fs.unlinkSync(filename);
    }
  }
  fs.rmdirSync(dir);
};

// Builds directory structure
fs.mkdirs = function(dirs, rel_root) {
  dirs.forEach(function(dir) {
    var full_path = rel_root? path.join(rel_root,dir) : dir;
    if (!fs.existsSync(full_path) ){
      fs.mkdirSync(full_path);
    }
  });
};

// Like a normal bash touch
fs.touch = function(file) {
  if (fs.existsSync(file)) {
    var now = new Date();
    fs.utimesSync(file,now,now);
  } else {
    fs.writeFileSync(file,"");
  }
};

function mkdirSyncP(path, position) {
  var parts = require('path').normalize(path).split(osSep);
  position = position || 0;
  
  if (position >= parts.length) {
    return true;
  }
  
  var directory = parts.slice(0, position + 1).join(osSep) || osSep;
  try {
    fs.statSync(directory);
    mkdirSyncP(path, position + 1);
  } catch (e) {
    try {
      fs.mkdirSync(directory);
      mkdirSyncP(path, position + 1);
    } catch (e) {
      if (e.code != 'EEXIST') {
        throw e;
      }
      mkdirSyncP(path, position + 1);
    }
  }
};

fs.mkdirSyncP = mkdirSyncP;










