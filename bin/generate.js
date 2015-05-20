var async = require('async');
var cheerio = require('cheerio'); // HTML parsing
var fs = require('fs');
var https = require('https');
var mustache = require('mustache'); // templating
var normalize = require('normalize-package-data');
var packageJSON = require('package-json');
var parseGitHub = require('github-url-to-object');
var path = require('path');
var spdx = require('spdx'); // license string validation

var offsets = [];
for (var i = 0; i < 1000; i += 36) {
  offsets.push(i);
}

var number = 0;
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
          async.map(
            packageNames,
            function(name, callback) {
              var packageNumber = ++number;
              packageJSON(name, 'latest', function(error, json) {
                normalize(json);
                if (error) {
                  callback(error);
                } else {
                  var missing = !json.license;
                  var valid = (
                    !missing &&
                    typeof json.license === 'string' &&
                    spdx.valid(json.license) === true
                  );
                  var invalid = !valid && !missing;
                  var fixItURL = false;
                  if ((invalid || missing) && json.repository) {
                    var repoURL = json.repository.url;
                    if (repoURL && repoURL.indexOf('github.com') > -1) {
                      var parsed = parseGitHub(repoURL);
                      if (parsed) {
                        fixItURL = (
                          'https://github.com' +
                          '/' + parsed.user +
                          '/' + parsed.repo +
                          '/edit' +
                          '/master' +
                          '/package.json'
                        );
                      }
                    }
                  }
                  callback(null, {
                    number: packageNumber,
                    package: name,
                    homepage: encodeURI(json.homepage),
                    license: (
                      json.license ?
                        JSON.stringify(json.license) :
                        json.hasOwnProperty('licenses') ?
                          'Using deprecated "licenses"' :
                          'None'
                    ),
                    valid: valid,
                    invalid: invalid,
                    missing: missing,
                    displayClass: (
                      valid ? 'success' :
                      invalid ? 'warning' :
                      'danger'
                    ),
                    fixItURL: fixItURL,
                    dependencies: json.dependencies,
                    devDependencies: json.devDependencies
                  });
                }
              });
            },
            callback
          );
        });
    });
  },
  function(error, packages) {
    if (error) {
      throw error;
    } else {
      packages = packages.slice(0, 1000);
      var context = {
        date: new Date().toUTCString(),
        valid: packages.reduce(function(count, element) {
          return count + (element.valid ? 1 : 0);
        }, 0) / packages.length * 100,
        invalid: packages.reduce(function(count, element) {
          return count + (element.invalid ? 1 : 0);
        }, 0) / packages.length * 100,
        missing: packages.reduce(function(count, element) {
          return count + (element.missing ? 1 : 0);
        }, 0) / packages.length * 100,
        mostWanted: packages
      };
      ['valid', 'invalid', 'missing'].forEach(function(count) {
        context[count + 'Rounded'] = Math.round(context[count]);
      });
      console.log(
        mustache.render(
          fs.readFileSync(
            path.join(__dirname, '..', 'templates', 'index.html')
          ).toString(),
          context
        )
      );
    }
  }
);
