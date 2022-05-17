
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
      Module['FS_createPath']('D:/Works (Yonichi's Drive)/Programming/Love2d/HTML Build/input', '.vscode', true, true);
      Module['FS_createPath']('D:/Works (Yonichi's Drive)/Programming/Love2d/HTML Build/input', 'resources', true, true);
      Module['FS_createPath']('D:/Works (Yonichi's Drive)/Programming/Love2d/HTML Build/input/resources', 'raw files', true, true);
      Module['FS_createPath']('D:/Works (Yonichi's Drive)/Programming/Love2d/HTML Build/input/resources/raw files', 'SFX', true, true);
      Module['FS_createPath']('D:/Works (Yonichi's Drive)/Programming/Love2d/HTML Build/input', 'scripts', true, true);

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
  loadPackage({"package_uuid":"ff402f78-cccc-4d3e-ac7a-284dc1a2724e","remote_package_size":4981148,"files":[{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\.vscode\\settings.json","crunched":0,"start":0,"end":159,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\conf.lua","crunched":0,"start":159,"end":528,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\main.lua","crunched":0,"start":528,"end":3214,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\font.ttf","crunched":0,"start":3214,"end":18799,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\hitbox.png","crunched":0,"start":18799,"end":21764,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\interface.png","crunched":0,"start":21764,"end":23656,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\projectile.png","crunched":0,"start":23656,"end":24095,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\ATTACK4.wav","crunched":0,"start":24095,"end":39195,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\GUI.aseprite","crunched":0,"start":39195,"end":42657,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\GUI.png","crunched":0,"start":42657,"end":44463,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\hitbox.aseprite","crunched":0,"start":44463,"end":47283,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\ingame_interface_background.png","crunched":0,"start":47283,"end":49175,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\music.ogg","crunched":0,"start":49175,"end":2987500,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\projectile1.aseprite","crunched":0,"start":2987500,"end":2988326,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\1UP.wav","crunched":0,"start":2988326,"end":3058514,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\ATTACK.wav","crunched":0,"start":3058514,"end":3088926,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\ATTACK2.wav","crunched":0,"start":3088926,"end":3143708,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\ATTACK3.wav","crunched":0,"start":3143708,"end":3158808,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\ATTACK4.wav","crunched":0,"start":3158808,"end":3173908,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\ATTACK5.wav","crunched":0,"start":3173908,"end":3185616,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\BONUS.wav","crunched":0,"start":3185616,"end":3230952,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\BONUS2.wav","crunched":0,"start":3230952,"end":3276288,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\BONUS3.wav","crunched":0,"start":3276288,"end":3499152,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\CAUTION.wav","crunched":0,"start":3499152,"end":3763880,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\DEAD.wav","crunched":0,"start":3763880,"end":3824732,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\DEFEATED.wav","crunched":0,"start":3824732,"end":4055032,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\GUN.wav","crunched":0,"start":4055032,"end":4189726,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\LASER.wav","crunched":0,"start":4189726,"end":4211908,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\LASER2.wav","crunched":0,"start":4211908,"end":4236090,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\MASTER SPARK.wav","crunched":0,"start":4236090,"end":4461016,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\ORIN.wav","crunched":0,"start":4461016,"end":4649960,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\POWER UP.wav","crunched":0,"start":4649960,"end":4737524,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\SPELLCARD.wav","crunched":0,"start":4737524,"end":4821784,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\TWINKLE.wav","crunched":0,"start":4821784,"end":4857006,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\TWINKLE2.wav","crunched":0,"start":4857006,"end":4878946,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\SFX\\TWINKLE3.wav","crunched":0,"start":4878946,"end":4904728,"audio":true},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\Sprite-0001.aseprite","crunched":0,"start":4904728,"end":4922215,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\raw files\\yonichisoft.aseprite","crunched":0,"start":4922215,"end":4923076,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\reimu.png","crunched":0,"start":4923076,"end":4945037,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\sky.txt","crunched":0,"start":4945037,"end":4947519,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\resources\\yonichisoft.png","crunched":0,"start":4947519,"end":4947946,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\scripts\\animation.lua","crunched":0,"start":4947946,"end":4952402,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\scripts\\animationv2.lua","crunched":0,"start":4952402,"end":4957598,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\scripts\\ingame.lua","crunched":0,"start":4957598,"end":4968522,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\scripts\\intro.lua","crunched":0,"start":4968522,"end":4969385,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\scripts\\mathext.lua","crunched":0,"start":4969385,"end":4969533,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\scripts\\menu.lua","crunched":0,"start":4969533,"end":4973568,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\scripts\\render.lua","crunched":0,"start":4973568,"end":4979392,"audio":false},{"filename":"D:\\Works (Yonichi's Drive)\\Programming\\Love2d\\HTML Build\\input\\scripts\\state.lua","crunched":0,"start":4979392,"end":4981148,"audio":false}]});

})();
