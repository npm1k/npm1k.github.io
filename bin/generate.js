var async = require('async');
var readInstalled = require('read-installed');
var path = require('path');

var packagePath = path.join(__dirname, '..');

var dependenciesOf = function(package) {
  return Object.keys(package.dependencies || {})
    .map(function(name) {
      return package.dependencies[name];
    });
};

var analysis = function(package, callback) {
  async.mapSeries(
    dependenciesOf(package),
    function(dependency, callback) {
      setImmediate(function() {
        analysis(dependency, callback);
      });
    },
    function(error, results) {
      callback(null,  {
        name: package.name,
        version: package.version,
        dependencies: results
      });
    }
  );
};

readInstalled(packagePath, {dev: false}, function(error, package) {
  if (error) {
    throw error;
  } else {
    analysis(package, function(error, result) {
      console.log(result.dependencies);
    });
  }
});
