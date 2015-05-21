var async = require('async');
var cheerio = require('cheerio'); // HTML parsing
var fs = require('fs');
var https = require('https');
var mustache = require('mustache'); // templating
var normalize = require('normalize-package-data');
var packageJSON = require('package-json');
var parseGitHub = require('parse-github-url');
var path = require('path');
var spdx = require('spdx'); // license string validation
var githubPackageJSON = require('github-package-json');

var offsets = [];
for (var i = 0; i < 1000; i += 36) {
  offsets.push(i);
}

var number = 0;

function packageNames(html) {
  var $ = cheerio.load(html);
  return $('a.name')
    .map(function() {
      return cheerio(this).text();
    })
    .get();
}

function getFixItURL(repository) {
  var repoURL = repository.url;
  if (repoURL && repoURL.indexOf('github.com') > -1) {
    // github-url-to-object fails with git+<protocol>:// URLs
    var parsed = parseGitHub(repoURL.replace(/^git\+/, ''));
    if (parsed) {
      // TODO: use the default branch since master doesn't always
      // exist
      return (
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

function isValid(json) {
  return typeof json.license === 'string' &&
    spdx.valid(json.license) === true;
}

function addRepoFixes(repository, result, callback) {
  setTimeout(function() {
    githubPackageJSON.master(
      repository.url,
      function(err, repositoryJSON) {
        if (!err && isValid(repositoryJSON)) {
          result.fixedInRepo = true;

          return callback(null, result);
        }

        setTimeout(function() {
          githubPackageJSON.pullRequests(
            repository.url,
            function(err, packageJSONs) {
              if (!err) {
                var validPRs = packageJSONs
                  .filter(function(pullRequest) {
                    return isValid(pullRequest.json);
                  });

                if (validPRs.length > 0) {
                  result.fixedInPRs = validPRs
                    .map(function(pullRequest) {
                      delete pullRequest.json;
                      return pullRequest;
                    });

                  return callback(null, result);
                }
              }

              result.fixItURL = getFixItURL(repository);

              callback(null, result);
            }
          );
        }, 750);
      }
    );
  }, 750);
}

function processPackages(packages, callback) {
  async.mapSeries(
    packages,
    function(name, cbMap) {
      var packageNumber = ++number;
      packageJSON(name, 'latest', function(error, json) {
        normalize(json);
        if (error) {
          cbMap(error);
        } else {
          var missing = !json.license;
          var valid = (
            !missing && isValid(json)
          );
          var invalid = !valid && !missing;
          var result = {
            number: packageNumber,
            package: name,
            version: json.version,
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
            dependencies: json.dependencies,
            devDependencies: json.devDependencies
          };
          if ((invalid || missing) && json.repository) {
            return addRepoFixes(json.repository, result, cbMap);
          }
          cbMap(null, result);
        }
      });
    },
    callback
  );
}

function getMostDependedPage(offset, callback) {
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
        callback(buffer);
      });
  });
}

async.concatSeries(
  offsets,
  function(offset, callback) {
    getMostDependedPage(offset, function(html) {
      processPackages(packageNames(html), callback);
    });
  },
  function(error, packages) {
    if (error) {
      throw error;
    } else {
      packages = packages
        .slice(0, 1000);
      var mostWanted = packages
        .filter(function(package) {
          return !package.valid;
        });
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
        mostWanted: mostWanted
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
