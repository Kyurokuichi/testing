
var Module;

if (typeof Module === 'undefined') Module = eval('(function() { try { return Module || {} } catch(e) { return {} } })()');

if (!Module.expectedDataFileDownloads) {
  Module.expectedDataFileDownloads = 0;
  Module.finishedDataFileDownloads = 0;
}
Module.expectedDataFileDownloads++;
(function() {
 var loadPackage = function(metadata) {

  var PACKAGE_PATH;
  if (typeof window === 'object') {
    PACKAGE_PATH = window['encodeURIComponent'](window.location.pathname.toString().substring(0, window.location.pathname.toString().lastIndexOf('/')) + '/');
  } else if (typeof location !== 'undefined') {
      // worker
      PACKAGE_PATH = encodeURIComponent(location.pathname.toString().substring(0, location.pathname.toString().lastIndexOf('/')) + '/');
    } else {
      throw 'using preloaded data can only be done on a web page or in a web worker';
    }
    var PACKAGE_NAME = 'game.data';
    var REMOTE_PACKAGE_BASE = 'game.data';
    if (typeof Module['locateFilePackage'] === 'function' && !Module['locateFile']) {
      Module['locateFile'] = Module['locateFilePackage'];
      Module.printErr('warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)');
    }
    var REMOTE_PACKAGE_NAME = typeof Module['locateFile'] === 'function' ?
    Module['locateFile'](REMOTE_PACKAGE_BASE) :
    ((Module['filePackagePrefixURL'] || '') + REMOTE_PACKAGE_BASE);

    var REMOTE_PACKAGE_SIZE = metadata.remote_package_size;
    var PACKAGE_UUID = metadata.package_uuid;

    function fetchRemotePackage(packageName, packageSize, callback, errback) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', packageName, true);
      xhr.responseType = 'arraybuffer';
      xhr.onprogress = function(event) {
        var url = packageName;
        var size = packageSize;
        if (event.total) size = event.total;
        if (event.loaded) {
          if (!xhr.addedTotal) {
            xhr.addedTotal = true;
            if (!Module.dataFileDownloads) Module.dataFileDownloads = {};
            Module.dataFileDownloads[url] = {
              loaded: event.loaded,
              total: size
            };
          } else {
            Module.dataFileDownloads[url].loaded = event.loaded;
          }
          var total = 0;
          var loaded = 0;
          var num = 0;
          for (var download in Module.dataFileDownloads) {
            var data = Module.dataFileDownloads[download];
            total += data.total;
            loaded += data.loaded;
            num++;
          }
          total = Math.ceil(total * Module.expectedDataFileDownloads/num);
          if (Module['setStatus']) Module['setStatus']('Downloading data... (' + loaded + '/' + total + ')');
        } else if (!Module.dataFileDownloads) {
          if (Module['setStatus']) Module['setStatus']('Downloading data...');
        }
      };
      xhr.onerror = function(event) {
        throw new Error("NetworkError for: " + packageName);
      }
      xhr.onload = function(event) {
        if (xhr.status == 200 || xhr.status == 304 || xhr.status == 206 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
          var packageData = xhr.response;
          callback(packageData);
        } else {
          throw new Error(xhr.statusText + " : " + xhr.responseURL);
        }
      };
      xhr.send(null);
    };

    function handleError(error) {
      console.error('package error:', error);
    };

    function runWithFS() {

      function assert(check, msg) {
        if (!check) throw msg + new Error().stack;
      }
      Module['FS_createPath']('/', 'resources', true, true);
      Module['FS_createPath']('/resources', 'raw files', true, true);
      Module['FS_createPath']('/resources/raw files', 'SFX', true, true);
      Module['FS_createPath']('/', 'scripts', true, true);

      function DataRequest(start, end, crunched, audio) {
        this.start = start;
        this.end = end;
        this.crunched = crunched;
        this.audio = audio;
      }
      DataRequest.prototype = {
        requests: {},
        open: function(mode, name) {
          this.name = name;
          this.requests[name] = this;
          Module['addRunDependency']('fp ' + this.name);
        },
        send: function() {},
        onload: function() {
          var byteArray = this.byteArray.subarray(this.start, this.end);

          this.finish(byteArray);

        },
        finish: function(byteArray) {
          var that = this;

        Module['FS_createDataFile'](this.name, null, byteArray, true, true, true); // canOwn this data in the filesystem, it is a slide into the heap that will never change
        Module['removeRunDependency']('fp ' + that.name);

        this.requests[this.name] = null;
      }
    };

    var files = metadata.files;
    for (i = 0; i < files.length; ++i) {
      new DataRequest(files[i].start, files[i].end, files[i].crunched, files[i].audio).open('GET', files[i].filename);
    }


    var indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    var IDB_RO = "readonly";
    var IDB_RW = "readwrite";
    var DB_NAME = "EM_PRELOAD_CACHE";
    var DB_VERSION = 1;
    var METADATA_STORE_NAME = 'METADATA';
    var PACKAGE_STORE_NAME = 'PACKAGES';
    function openDatabase(callback, errback) {
      try {
        var openRequest = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        return errback(e);
      }
      openRequest.onupgradeneeded = function(event) {
        var db = event.target.result;

        if(db.objectStoreNames.contains(PACKAGE_STORE_NAME)) {
          db.deleteObjectStore(PACKAGE_STORE_NAME);
        }
        var packages = db.createObjectStore(PACKAGE_STORE_NAME);

        if(db.objectStoreNames.contains(METADATA_STORE_NAME)) {
          db.deleteObjectStore(METADATA_STORE_NAME);
        }
        var metadata = db.createObjectStore(METADATA_STORE_NAME);
      };
      openRequest.onsuccess = function(event) {
        var db = event.target.result;
        callback(db);
      };
      openRequest.onerror = function(error) {
        errback(error);
      };
    };

    /* Check if there's a cached package, and if so whether it's the latest available */
    function checkCachedPackage(db, packageName, callback, errback) {
      var transaction = db.transaction([METADATA_STORE_NAME], IDB_RO);
      var metadata = transaction.objectStore(METADATA_STORE_NAME);

      var getRequest = metadata.get("metadata/" + packageName);
      getRequest.onsuccess = function(event) {
        var result = event.target.result;
        if (!result) {
          return callback(false);
        } else {
          return callback(PACKAGE_UUID === result.uuid);
        }
      };
      getRequest.onerror = function(error) {
        errback(error);
      };
    };

    function fetchCachedPackage(db, packageName, callback, errback) {
      var transaction = db.transaction([PACKAGE_STORE_NAME], IDB_RO);
      var packages = transaction.objectStore(PACKAGE_STORE_NAME);

      var getRequest = packages.get("package/" + packageName);
      getRequest.onsuccess = function(event) {
        var result = event.target.result;
        callback(result);
      };
      getRequest.onerror = function(error) {
        errback(error);
      };
    };

    function cacheRemotePackage(db, packageName, packageData, packageMeta, callback, errback) {
      var transaction_packages = db.transaction([PACKAGE_STORE_NAME], IDB_RW);
      var packages = transaction_packages.objectStore(PACKAGE_STORE_NAME);

      var putPackageRequest = packages.put(packageData, "package/" + packageName);
      putPackageRequest.onsuccess = function(event) {
        var transaction_metadata = db.transaction([METADATA_STORE_NAME], IDB_RW);
        var metadata = transaction_metadata.objectStore(METADATA_STORE_NAME);
        var putMetadataRequest = metadata.put(packageMeta, "metadata/" + packageName);
        putMetadataRequest.onsuccess = function(event) {
          callback(packageData);
        };
        putMetadataRequest.onerror = function(error) {
          errback(error);
        };
      };
      putPackageRequest.onerror = function(error) {
        errback(error);
      };
    };

    function processPackageData(arrayBuffer) {
      Module.finishedDataFileDownloads++;
      assert(arrayBuffer, 'Loading data file failed.');
      assert(arrayBuffer instanceof ArrayBuffer, 'bad input to processPackageData');
      var byteArray = new Uint8Array(arrayBuffer);
      var curr;

        // copy the entire loaded file into a spot in the heap. Files will refer to slices in that. They cannot be freed though
        // (we may be allocating before malloc is ready, during startup).
        if (Module['SPLIT_MEMORY']) Module.printErr('warning: you should run the file packager with --no-heap-copy when SPLIT_MEMORY is used, otherwise copying into the heap may fail due to the splitting');
        var ptr = Module['getMemory'](byteArray.length);
        Module['HEAPU8'].set(byteArray, ptr);
        DataRequest.prototype.byteArray = Module['HEAPU8'].subarray(ptr, ptr+byteArray.length);

        var files = metadata.files;
        for (i = 0; i < files.length; ++i) {
          DataRequest.prototype.requests[files[i].filename].onload();
        }
        Module['removeRunDependency']('datafile_game.data');

      };
      Module['addRunDependency']('datafile_game.data');

      if (!Module.preloadResults) Module.preloadResults = {};

      function preloadFallback(error) {
        console.error(error);
        console.error('falling back to default preload behavior');
        fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE, processPackageData, handleError);
      };

      openDatabase(
        function(db) {
          checkCachedPackage(db, PACKAGE_PATH + PACKAGE_NAME,
            function(useCached) {
              Module.preloadResults[PACKAGE_NAME] = {fromCache: useCached};
              if (useCached) {
                console.info('loading ' + PACKAGE_NAME + ' from cache');
                fetchCachedPackage(db, PACKAGE_PATH + PACKAGE_NAME, processPackageData, preloadFallback);
              } else {
                console.info('loading ' + PACKAGE_NAME + ' from remote');
                fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE,
                  function(packageData) {
                    cacheRemotePackage(db, PACKAGE_PATH + PACKAGE_NAME, packageData, {uuid:PACKAGE_UUID}, processPackageData,
                      function(error) {
                        console.error(error);
                        processPackageData(packageData);
                      });
                  }
                  , preloadFallback);
              }
            }
            , preloadFallback);
        }
        , preloadFallback);

      if (Module['setStatus']) Module['setStatus']('Downloading...');

    }
    if (Module['calledRun']) {
      runWithFS();
    } else {
      if (!Module['preRun']) Module['preRun'] = [];
      Module["preRun"].push(runWithFS); // FS is not initialized yet, wait for it
    }

  }
  loadPackage({"package_uuid":"8ddfb6a0-e551-4ab4-9d7c-398a2cbfeb78","remote_package_size":4980971,"files":[{"filename":"\\conf.lua","crunched":0,"start":0,"end":351,"audio":false},{"filename":"\\main.lua","crunched":0,"start":351,"end":3037,"audio":false},{"filename":"\\resources\\font.ttf","crunched":0,"start":3037,"end":18622,"audio":false},{"filename":"\\resources\\hitbox.png","crunched":0,"start":18622,"end":21587,"audio":false},{"filename":"\\resources\\interface.png","crunched":0,"start":21587,"end":23479,"audio":false},{"filename":"\\resources\\projectile.png","crunched":0,"start":23479,"end":23918,"audio":false},{"filename":"\\resources\\raw files\\ATTACK4.wav","crunched":0,"start":23918,"end":39018,"audio":true},{"filename":"\\resources\\raw files\\GUI.aseprite","crunched":0,"start":39018,"end":42480,"audio":false},{"filename":"\\resources\\raw files\\GUI.png","crunched":0,"start":42480,"end":44286,"audio":false},{"filename":"\\resources\\raw files\\hitbox.aseprite","crunched":0,"start":44286,"end":47106,"audio":false},{"filename":"\\resources\\raw files\\ingame_interface_background.png","crunched":0,"start":47106,"end":48998,"audio":false},{"filename":"\\resources\\raw files\\music.ogg","crunched":0,"start":48998,"end":2987323,"audio":true},{"filename":"\\resources\\raw files\\projectile1.aseprite","crunched":0,"start":2987323,"end":2988149,"audio":false},{"filename":"\\resources\\raw files\\SFX\\1UP.wav","crunched":0,"start":2988149,"end":3058337,"audio":true},{"filename":"\\resources\\raw files\\SFX\\ATTACK.wav","crunched":0,"start":3058337,"end":3088749,"audio":true},{"filename":"\\resources\\raw files\\SFX\\ATTACK2.wav","crunched":0,"start":3088749,"end":3143531,"audio":true},{"filename":"\\resources\\raw files\\SFX\\ATTACK3.wav","crunched":0,"start":3143531,"end":3158631,"audio":true},{"filename":"\\resources\\raw files\\SFX\\ATTACK4.wav","crunched":0,"start":3158631,"end":3173731,"audio":true},{"filename":"\\resources\\raw files\\SFX\\ATTACK5.wav","crunched":0,"start":3173731,"end":3185439,"audio":true},{"filename":"\\resources\\raw files\\SFX\\BONUS.wav","crunched":0,"start":3185439,"end":3230775,"audio":true},{"filename":"\\resources\\raw files\\SFX\\BONUS2.wav","crunched":0,"start":3230775,"end":3276111,"audio":true},{"filename":"\\resources\\raw files\\SFX\\BONUS3.wav","crunched":0,"start":3276111,"end":3498975,"audio":true},{"filename":"\\resources\\raw files\\SFX\\CAUTION.wav","crunched":0,"start":3498975,"end":3763703,"audio":true},{"filename":"\\resources\\raw files\\SFX\\DEAD.wav","crunched":0,"start":3763703,"end":3824555,"audio":true},{"filename":"\\resources\\raw files\\SFX\\DEFEATED.wav","crunched":0,"start":3824555,"end":4054855,"audio":true},{"filename":"\\resources\\raw files\\SFX\\GUN.wav","crunched":0,"start":4054855,"end":4189549,"audio":true},{"filename":"\\resources\\raw files\\SFX\\LASER.wav","crunched":0,"start":4189549,"end":4211731,"audio":true},{"filename":"\\resources\\raw files\\SFX\\LASER2.wav","crunched":0,"start":4211731,"end":4235913,"audio":true},{"filename":"\\resources\\raw files\\SFX\\MASTER SPARK.wav","crunched":0,"start":4235913,"end":4460839,"audio":true},{"filename":"\\resources\\raw files\\SFX\\ORIN.wav","crunched":0,"start":4460839,"end":4649783,"audio":true},{"filename":"\\resources\\raw files\\SFX\\POWER UP.wav","crunched":0,"start":4649783,"end":4737347,"audio":true},{"filename":"\\resources\\raw files\\SFX\\SPELLCARD.wav","crunched":0,"start":4737347,"end":4821607,"audio":true},{"filename":"\\resources\\raw files\\SFX\\TWINKLE.wav","crunched":0,"start":4821607,"end":4856829,"audio":true},{"filename":"\\resources\\raw files\\SFX\\TWINKLE2.wav","crunched":0,"start":4856829,"end":4878769,"audio":true},{"filename":"\\resources\\raw files\\SFX\\TWINKLE3.wav","crunched":0,"start":4878769,"end":4904551,"audio":true},{"filename":"\\resources\\raw files\\Sprite-0001.aseprite","crunched":0,"start":4904551,"end":4922038,"audio":false},{"filename":"\\resources\\raw files\\yonichisoft.aseprite","crunched":0,"start":4922038,"end":4922899,"audio":false},{"filename":"\\resources\\reimu.png","crunched":0,"start":4922899,"end":4944860,"audio":false},{"filename":"\\resources\\sky.txt","crunched":0,"start":4944860,"end":4947342,"audio":false},{"filename":"\\resources\\yonichisoft.png","crunched":0,"start":4947342,"end":4947769,"audio":false},{"filename":"\\scripts\\animation.lua","crunched":0,"start":4947769,"end":4952225,"audio":false},{"filename":"\\scripts\\animationv2.lua","crunched":0,"start":4952225,"end":4957421,"audio":false},{"filename":"\\scripts\\ingame.lua","crunched":0,"start":4957421,"end":4968345,"audio":false},{"filename":"\\scripts\\intro.lua","crunched":0,"start":4968345,"end":4969208,"audio":false},{"filename":"\\scripts\\mathext.lua","crunched":0,"start":4969208,"end":4969356,"audio":false},{"filename":"\\scripts\\menu.lua","crunched":0,"start":4969356,"end":4973391,"audio":false},{"filename":"\\scripts\\render.lua","crunched":0,"start":4973391,"end":4979215,"audio":false},{"filename":"\\scripts\\state.lua","crunched":0,"start":4979215,"end":4980971,"audio":false}]});

})();
