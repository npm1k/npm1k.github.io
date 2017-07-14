var async = require('async')
var parse = require('json-parse-errback')
var fs = require('fs')
var http = require('http')
var mustache = require('mustache')
var normalize = require('normalize-package-data')
var npm1k = require('npm1k')
var parseGitHub = require('parse-github-url')
var path = require('path')
var validateLicense = require('validate-npm-package-license')

var categories = ['valid', 'invalid', 'missing']
var template = fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'index.html'))
  .toString()

npm1k(function (error, packages) {
  if (error) throw error
  else {
    processPackages(packages, function (error, packages) {
      if (error) throw error
      var mostWanted = packages
        .filter(function (p) {
          return !p.licenseData.validForNewPackages
        })
      function percent (argument) {
        return argument / packages.length * 100
      }
      var valid = percent(packages.reduce(function (count, p) {
        return count + (p.licenseData.validForNewPackages ? 1 : 0)
      }, 0))
      var context = {
        date: new Date().toUTCString(),
        valid: valid,
        invalid: 100 - valid,
        mostWanted: mostWanted
      }
      categories.forEach(function (count) {
        context[count + 'Rounded'] = Math.round(context[count])
      })
      process.stdout.write(mustache.render(template, context))
    })
  }
})

function processPackages (packages, callback) {
  var number = 0
  async.mapSeries(
    packages,
    function (name, next) {
      var packageNumber = ++number
      var result = { number: packageNumber, package: name }
      getPackageJSON(name, function (error, json) {
        if (error) {
          result.error = 'Could not fetch package.json'
          result.licenseData = {
            validForNewPackages: false,
            warnings: [ 'Could not fetch package.json' ]
          }
          return next(null, result)
        }
        normalize(json)
        result.number = packageNumber
        result.package = name
        result.version = json.version
        result.maintainers = json.maintainers
        result.homepage = json.homepage
          ? encodeURI(json.homepage)
          : 'https://www.npmjs.com/packages/' + name
        if (json.license) {
          if (typeof json.license === 'string') {
            result.licenseData = validateLicense(json.license)
          } else {
            result.licenseData = {
              validForNewPackages: false,
              warnings: [ 'Invalid license property' ]
            }
          }
        } else {
          result.licenseData = {
            validForNewPackages: false,
            warnings: [ 'Missing license property' ]
          }
        }
        result.license = JSON.stringify(json.license)
        if (json.repository) {
          result.fixItURL = getFixItURL(json.repository)
        }
        next(null, result)
      })
    },
    callback
  )
}

function getFixItURL (repository) {
  var repoURL = repository.url
  if (repoURL && repoURL.indexOf('github.com') > -1) {
    var parsed = parseGitHub(
      repoURL.replace('git+https://', 'https://')
    )
    if (parsed) {
      return (
        'https://github.com' + '/' + parsed.repository +
        '/edit' + '/master' + '/package.json'
      )
    }
  }
}

function getPackageJSON (name, callback) {
  var path = '/' + encodeURIComponent(name) + '/latest'
  http.get({
    host: 'registry.npmjs.com',
    path: path,
    headers: {
      'Accept': 'application/json; charset=UTF-8'
    }
  }, function (response) {
    if (response.statusCode !== 200) {
      callback(new Error(
        'Server responded ' + response.statusCode + ' for ' + path
      ))
    } else {
      var buffer = []
      response
        .on('data', function (chunk) {
          buffer.push(chunk)
        })
        .once('error', function (error) {
          callback(error)
        })
        .once('end', function () {
          parse(Buffer.concat(buffer), callback)
        })
    }
  })
}
