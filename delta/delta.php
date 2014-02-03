<?php

function checkBundleExists($bundle) {
  return file_exists($bundle);
}

function checkBundleParam($bundle) {
  return (strlen($bundle)===10)&&is_numeric($bundle);
}

define('BUNDLE_NAME','Carma.zip');

$os= $_GET["os"];
$src= $_GET["src"];
$tgt= $_GET["tgt"];

if (!(($os==='ios')||($os==='android'))){
	header("HTTP/1.0 400 Bad Request");
	echo "<pre>Usage: http://".$_SERVER['HTTP_HOST']. $_SERVER['SCRIPT_NAME']."?os=(ios|android)&src=&ltsource bundle timestamp&gt&tgt=&lttarget bundle timestamp&gt</pre>";
	return;
}

if (!(checkBundleParam($src)&&checkBundleParam($tgt))){
	header("HTTP/1.0 400 Bad Request");
	echo"<pre>Source or target bundle invalid!</pre>";
	return;
}

$src_bundle="./$src/$os/".BUNDLE_NAME;
$tgt_bundle="./$tgt/$os/".BUNDLE_NAME;
$del_bundle_dir="./delta/$src"."_"."$tgt/$os/";

if (file_exists($del_bundle_dir.BUNDLE_NAME)){
	//Serve already created file via xsendfile module..
	header("X-Sendfile: $del_bundle_dir".BUNDLE_NAME);
	header("Content-Type: application/octet-stream");
	header("Content-Disposition: attachment; filename=\"".BUNDLE_NAME."\"");
	return;

} elseif (checkBundleExists($tgt_bundle)){
	if (!checkBundleExists($src_bundle)){
		//Need to just serve the target bundle in it's entireity
		header("X-Sendfile: $tgt_bundle");
		header("Content-Type: application/octet-stream");
		header("Content-Disposition: attachment; filename=\"".BUNDLE_NAME."\"");
		return;	
	}
	
	if(!file_exists($del_bundle_dir)){
		mkdir($del_bundle_dir,0777,true);
	}
	//create delta bundle	
	$output = shell_exec("export TMP=/var/www/tishadow/tmp/;tishadow delta -s $src_bundle -t $tgt_bundle -d $del_bundle_dir".BUNDLE_NAME);
	if (strstr($output,'DONE')){
		//Serve newly created bundle file via xsendfile module..
		header("X-Sendfile: $del_bundle_dir".BUNDLE_NAME);
		header("Content-Type: application/octet-stream");
		header("Content-Disposition: attachment; filename=\"".BUNDLE_NAME."\"");
	} else {	
		header("HTTP/1.0 500 Internal Server Error");
		echo "<pre>$output</pre>";
	}
	return;
} else {
	header("HTTP/1.0 404 Not Found");
	echo"<pre>Target bundle does not exist!</pre>";
}

?>
