var async = require('async');
var cheerio = require('cheerio'); // HTML parsing
var concat = require('concat-stream');
var https = require('https');
var uniq = require('array-uniq');

var offsets = [];
for (var i = 0; i < 1100; i += 36) {
  offsets.push(i);
}

process.stdin.pipe(concat(function(buffer) {
  var packageJSON = JSON.parse(buffer);
  async.concatSeries(
    offsets,
    function(offset, callback) {
      https.get({
        hostname: 'www.npmjs.com',
        path: '/browse/depended?offset=' + offset
      }, function(response) {
        var buffer = '';
        response
          .on('data', function(data) {
            buffer += data.toString();
          })
          .on('end', function() {
            var $ = cheerio.load(buffer);
            buffer = null;
            var packageNames = $('a.name')
              .map(function() {
                return cheerio(this).text();
              })
              .get();
            callback(null, packageNames);
          });
      });
    },
    function(error, packages) {
      if (error) {
        throw error;
      } else {
        packageJSON.dependencies = {};
        uniq(packages)
          .slice(0, 1000)
          .forEach(function(packageName) {
            packageJSON.dependencies[packageName] = '*';
          });
        console.log(JSON.stringify(packageJSON, null, 2));
      }
    }
  );
}));
