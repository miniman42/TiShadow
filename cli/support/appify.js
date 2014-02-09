var logger = require("../../server/logger.js"),
  fs = require("fs"),
  wrench = require("wrench"),
  path = require("path"),
  tishadow_app = path.join(__dirname, "../..", "app"),
  config = require("./config"),
  UglifyJS = require("uglify-js"),
  _ = require("underscore");

require("./wrench_extension");

_.templateSettings = {
  interpolate: /\{\{(.+?)\}\}/g
};


var required_modules = [
  '<module platform="iphone" version="0.1">yy.tidynamicfont</module>',
  '<module platform="iphone" version="0.3">net.iamyellow.tiws</module>',
  '<module platform="android" version="0.1">net.iamyellow.tiws</module>',
  '<module platform="iphone" version="1.0.2">ti.compression</module>',
  '<module platform="android" version="2.0.3">ti.compression</module>'
  //TODO: add any other modules we are dependent on here.

];


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
    wrench.copyAndProcessDirSyncRecursive(path.join(tishadow_app, 'Resources'), path.join(dest, 'Resources'), {
      forceDelete: true,
      jsProcessor: jsProcessor
    });
    logger.info("TiShadow app upgraded");
  } else {
    wrench.copyAndProcessDirSyncRecursive(tishadow_app, dest, {
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
            filter: new RegExp("(\.png|images|high|medium|low|intro|res-.*|background.png)$", "i"),
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
      required_modules.push("</modules>");
      fs.writeFileSync(path.join(dest, "tiapp.xml"),
        source_tiapp
        .replace(/<plugins>(.|\n)*<\/plugins>/, "")
        .replace("<modules/>", "<modules></modules>")
        .replace("</modules>", required_modules.join("\n")));
      // copy the bundle
      //      fs.writeFileSync(path.join(dest_resources, config.app_name.replace(/ /g,"_") + ".zip"),fs.readFileSync(config.bundle_file));
      fs.writeFileSync(path.join(dest_resources, config.app_name.replace(/ /g, "_") + ".zip"), fs.readFileSync(config.bundle_file));

    }
  });
};
