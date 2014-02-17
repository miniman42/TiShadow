var logger = require("../../server/logger.js"),
  fs = require("fs"),
  wrench = require("wrench"),
  path = require("path"),
  tishadow_app = path.join(__dirname, "../..", "app"),
  config = require("./config"),
  UglifyJS = require("uglify-js"),
  _ = require("underscore");

_.templateSettings = {
  interpolate: /\{\{(.+?)\}\}/g
};

var defaultAppId = "<id>com.avego.AvegoApp</id>";

var required_modules = [
  '<module platform="iphone" version="0.1">yy.tidynamicfont</module>',
  '<module platform="iphone" version="0.3">net.iamyellow.tiws</module>',
  '<module platform="android" version="0.1">net.iamyellow.tiws</module>',
  '<module platform="iphone" version="1.0.2">ti.compression</module>',
  '<module platform="android" version="2.0.3">ti.compression</module>'
  //TODO: add any other modules we are dependent on here.

];

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

var jsProcessor = function(contents) {
  if (config.isHideShadow) {
    contents = contents.replace(/console\.log\(/g, '//console.log(');
    contents = contents.replace(/TiShadow/g, "CarmaOne");
    contents = contents.replace(/tishadow/g, "carmaone");
  }
  //this will strip comments
  var ast = UglifyJS.parse(contents);
  return ast.print_to_string({
    beautify: true
  });
};

exports.copyCoreProject = function(env) {
  console.log('Copying Core Project....');
  var dest = env.destination || ".";
  if (!fs.existsSync(dest) || !fs.lstatSync(dest).isDirectory()) {
    logger.error("Destination folder does not exist.");
    return false;
  }
  if (dest === ".") {
    logger.error("You really don't want to write to the current directory.");
    return false;
  }

  if (env.upgrade) {
    if (!fs.existsSync(path.join(dest, 'Resources'))) {
      logger.error("Could not find existing tishadow app");
      return false;
    }
    copyAndProcessDirSyncRecursive(path.join(tishadow_app, 'Resources'), path.join(dest, 'Resources'), {
      forceDelete: true,
      jsProcessor: jsProcessor
    });
    logger.info("TiShadow app upgraded");
  } else {
    copyAndProcessDirSyncRecursive(tishadow_app, dest, {
      forceDelete: true,
      jsProcessor: jsProcessor
    });
    if (!config.isShadowModulesIncluded) {
      wrench.rmdirSyncRecursive(path.join(dest, 'modules/android'));
      wrench.rmdirSyncRecursive(path.join(dest, 'modules/iphone'));
    }
    //inject new GUID
    var source_tiapp = fs.readFileSync(path.join(tishadow_app, "tiapp.xml"), 'utf8');
    fs.writeFileSync(path.join(dest, "tiapp.xml"),
      source_tiapp
      .replace("{{GUID}}", 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0,
          v = c == 'x' ? r : r & 0x3 | 0x8;
        return v.toString(16);
      })) // GUID one-liner: http://stackoverflow.com/a/2117523
      .replace("{{APPID}}", env.appid)
    );
    logger.info("TiShadow app ready");
  }
  return true;
};

exports.build = function(env) {
  var dest = env.destination || ".";
  var dest_resources = path.join(dest, "Resources");
  var dest_fonts = path.join(dest_resources, "fonts");
  var dest_intro = path.join(dest_resources, "")
  var dest_modules = path.join(dest, "modules");
  var dest_platform = path.join(dest, "platform");
  var template_file = path.join(tishadow_app, "Resources", "appify.js");


  //set to bundle mode
  env._name = "bundle";
  var compiler = require("./compiler");
  //bundle the source
  compiler(env, function() {
    logger.info("Appying...");
    logger.info(JSON.stringify(config));
    //copy tishadow src
    if (exports.copyCoreProject(env)) {
      // generate app.js
      var template = fs.readFileSync(template_file, 'utf8');
      var new_app_js = _.template(template, {
        proto: "http" + (config.isTiCaster ? "s" : ""),
        host: config.host,
        port: config.port,
        room: config.room,
        app_name: config.app_name,
        type: config.type
      });
      fs.writeFileSync(path.join(dest_resources, "app.js"), new_app_js);
      //copy fonts
      console.log('Copy fonts from ' + config.fonts_path);
      console.log('Destination: ' + dest_fonts);
      if (fs.existsSync(config.fonts_path)) {
        wrench.copyDirSyncRecursive(config.fonts_path, dest_fonts);
      }
      //copy splash screen and icons
      ['iphone', 'android'].forEach(function(platform) {
        if (fs.existsSync(path.join(config.resources_path, platform))) {
          wrench.copyDirSyncRecursive(path.join(config.resources_path, platform), path.join(dest_resources, platform), {
            filter: new RegExp("(\.png|images|high|medium|low|intro|res-.*|background.png|background.jpg)$", "i"),
            whitelist: true
          });

        }
        if (fs.existsSync(path.join(config.modules_path, platform))) {
          wrench.copyDirSyncRecursive(path.join(config.modules_path, platform), path.join(dest_modules, platform), {
            preserve: true
          });
        }


        if (fs.existsSync(path.join(config.platform_path, platform))) {
          wrench.copyDirSyncRecursive(path.join(config.platform_path, platform), path.join(dest_platform, platform));
        }
        var heavyImages = platform + "/images/"
        var scrollerImages = platform + "/images/intro";
        //console.log('Resources Path: ' + config.resources_path);
       // console.log('Scroller Images: ' + scrollerImages);
        if (platform === "android") {
          var paths = new Array("high", "medium", "low");
          for (var i = 0; i < paths.length; i++) {
            var scrollerImagePath = platform + "/" + paths[i] + "/images/intro";
            if (fs.existsSync(path.join(config.resources_path,scrollerImagePath))) {
              console.log('[Android] Copying Scroller Images for ' + paths[i]);
              wrench.copyDirSyncRecursive(path.join(config.resources_path, scrollerImagePath), path.join(dest_resources, scrollerImagePath));
            }
          }

        } else {
          //copy the scroller images 
          if (fs.existsSync(path.join(config.resources_path, scrollerImages))) {
            console.log('Copying Scroller Images Now...');
            wrench.copyDirSyncRecursive(path.join(config.resources_path, scrollerImages), path.join(dest_resources, scrollerImages));
          }
        }
        //TODO: copy over the heavier images
        /*if(fs.existsSync(path.join(config.resources_path,heavyImages))) {
          wrench.copyDirSyncRecursive(path.join(config.resources_path,heavyImages),path.join(dest_resources,heavyImages));
        }*/


      });
      // copy tiapp.xml and inject modules
      var source_tiapp = fs.readFileSync(path.join(config.base, "tiapp.xml"), 'utf8');
      if (!config.isShadowModulesIncluded) {
        required_modules = []; //if excluding shadow modules then make sure not to include them in the output tiapp.xml
      }

      var replacementAppId = defaultAppId; 
      if(config.platform === "android"){
        replacementAppId = "<id>com.avego.avegodriver</id>"
      }

      required_modules.push("</modules>");
      fs.writeFileSync(path.join(dest, "tiapp.xml"),
        source_tiapp
        .replace(/<plugins>(.|\n)*<\/plugins>/, "")
        .replace("<modules/>", "<modules></modules>")
        .replace(defaultAppId, replacementAppId)
        .replace("</modules>", required_modules.join("\n")));




      // copy the bundle
      //      fs.writeFileSync(path.join(dest_resources, config.app_name.replace(/ /g,"_") + ".zip"),fs.readFileSync(config.bundle_file));
      fs.writeFileSync(path.join(dest_resources, config.app_name.replace(/ /g, "_") + ".zip"), fs.readFileSync(config.bundle_file));

    }
  });
};