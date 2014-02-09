var fs = require("fs"),
    path = require("path"),
    config = require("./config"),
    wrench = require("wrench");

// Clone of the wrench's private function
function isFileIncluded(opts, dir, filename) {

  function isMatch(filter) {
    if (typeof filter === 'function') {
      return filter(filename, dir) === true;
    } else {
      // Maintain backwards compatibility and use just the filename
      return filename.match(filter);
    }
  }

  if (opts.include || opts.exclude) {
    if (opts.exclude) {
      if (isMatch(opts.exclude)) {
        return false;
      }
    }

    if (opts.include) {
      if (isMatch(opts.include)) {
        return true;
      } else {
        return false;
      }
    }

    return true;
  } else if (opts.filter) {
    var filter = opts.filter;

    if (!opts.whitelist) {
      // if !opts.whitelist is false every file or directory 
      // which does match opts.filter will be ignored
      return isMatch(filter) ? false : true;
    } else {
      // if opts.whitelist is true every file or directory 
      // which doesn't match opts.filter will be ignored
      return !isMatch(filter) ? false : true;
    }
  }

  return true;
};

//var copyAndProcessDirSyncRecursive=wrench.copyDirSyncRecursive;
/*  this is borrowed from wrench.copyDirSyncRecursive("directory_to_copy", "new_directory_location", opts); and modified to support 
 *  uglifying the files and removing console output...
 *
 *  Recursively dives through a directory and makes a copy of all processed files to a new location. This is a
 *  Synchronous function, which blocks things until it's done. Specify forceDelete to force directory overwrite.
 *
 *  Note: Directories should be passed to this function without a trailing slash.
 */
var copyAndProcessDirSyncRecursive = function(sourceDir, newDirLocation, opts) {
  opts = opts || {};

  try {
    if (fs.statSync(newDirLocation).isDirectory()) {
      if (typeof opts !== 'undefined' && opts.forceDelete) {
        wrench.rmdirSyncRecursive(newDirLocation);
      } else {
        return new Error('You are trying to delete a directory that already exists. Specify forceDelete in the opts argument to override this. Bailing~');
      }
    }
  } catch (e) {}

  /*  Create the directory where all our junk is moving to; read the mode of the source directory and mirror it */
  var checkDir = fs.statSync(sourceDir);
  try {
    fs.mkdirSync(newDirLocation, checkDir.mode);
  } catch (e) {
    //if the directory already exists, that's okay
    if (e.code !== 'EEXIST') throw e;
  }

  var files = fs.readdirSync(sourceDir);
  var hasFilter = opts.filter || opts.include || opts.exclude;
  var preserveFiles = opts.preserveFiles === true;

  for (var i = 0; i < files.length; i++) {
    // ignores all files or directories which match the RegExp in opts.filter
    if (typeof opts !== 'undefined') {
      if (hasFilter) {
        if (!isFileIncluded(opts, sourceDir, files[i])) {
          continue;
        }
      }

      if (opts.excludeHiddenUnix && /^\./.test(files[i])) continue;
    }

    var currFile = fs.lstatSync(path.join(sourceDir, files[i]));

    var fCopyFile = function(srcFile, destFile, opts) {
      if (typeof opts !== 'undefined' && opts.preserveFiles && fs.existsSync(destFile)) return;
      var contents = fs.readFileSync(srcFile);
      if (srcFile.match("js$") && typeof opts !== 'undefined' && opts.jsProcessor) {
        contents = opts.jsProcessor(contents.toString());
      }
      if (config.isHideShadow) {
        destFile = destFile.replace(/TiShadow/, "CarmaOne");
      }
      fs.writeFileSync(destFile, contents);
      var stat = fs.lstatSync(srcFile);
      fs.chmodSync(destFile, stat.mode);
    };

    if (currFile.isDirectory()) {
      /*  recursion this thing right on back. */
      copyAndProcessDirSyncRecursive(path.join(sourceDir, files[i]), path.join(newDirLocation, files[i]), opts);
    } else if (currFile.isSymbolicLink()) {
      var symlinkFull = fs.readlinkSync(path.join(sourceDir, files[i]));

      if (typeof opts !== 'undefined' && !opts.inflateSymlinks) {
        fs.symlinkSync(symlinkFull, path.join(newDirLocation, files[i]));
        continue;
      }

      var tmpCurrFile = fs.lstatSync(path.join(sourceDir, symlinkFull));
      if (tmpCurrFile.isDirectory()) {
        copyAndProcessDirSyncRecursive(path.join(sourceDir, symlinkFull), path.join(newDirLocation, files[i]), opts);
      } else {
        /*  At this point, we've hit a file actually worth copying... so copy it on over. */
        fCopyFile(path.join(sourceDir, symlinkFull), path.join(newDirLocation, files[i]), opts);
      }
    } else {
      /*  At this point, we've hit a file actually worth copying... so copy it on over. */
      fCopyFile(path.join(sourceDir, files[i]), path.join(newDirLocation, files[i]), opts);
    }
  }
};

wrench.copyAndProcessDirSyncRecursive = copyAndProcessDirSyncRecursive;
